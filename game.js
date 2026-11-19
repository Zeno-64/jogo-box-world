(() => {
  const TILE = 11;
  const COLS = 16;
  const ROWS = 14;
  const SCREEN_W = COLS * TILE;
  const SCREEN_H = ROWS * TILE;

  const EMPTY = 0, FLOOR = 1, BOX = 2, PLAYER = 3, WALL = 4, TARGET = 5, BOX_ON_TARGET = 6, PLAYER_ON_TARGET = 7;

  const LEVELS = window.BOXWORLD_LEVELS;
  const TOTAL_LEVELS = LEVELS.length;

  const canvas = document.getElementById('screen');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const colors = {
    green: { bg: '#9bbf8f', fg: '#16321a' },
    blue: { bg: '#aecbe8', fg: '#132742' },
  };
  let theme = 'green';

  // ---- persistent storage ----
  const STORAGE_KEY = 'boxworld_save_v1';
  function loadSave() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
    catch (e) { return {}; }
  }
  function writeSave(partial) {
    const save = loadSave();
    Object.assign(save, partial);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(save)); } catch (e) {}
  }
  function bestFor(idx) {
    const save = loadSave();
    return (save.best && save.best[idx]) || null;
  }
  function recordBest(idx, movesCount) {
    const save = loadSave();
    save.best = save.best || {};
    if (!save.best[idx] || movesCount < save.best[idx]) {
      save.best[idx] = movesCount;
      writeSave(save);
    }
  }

  // ---- game state ----
  let screenState = 'title'; // title | menu | play | cleared | instructions | levelselect
  let levelIndex = 0;
  let isWallGrid = [];
  let isTargetGrid = [];
  let targetKeys = [];
  let boxes = new Set();
  let player = { r: 0, c: 0 };
  let moves = 0;
  let undoStack = [];
  let showStatus = false;
  const menuItems = ['Continuar', 'Novo jogo', 'Ultima vista', 'Fase', 'Instrucoes'];
  let menuIndex = 0;
  let instructionsPage = 0;
  let levelSelectChoice = 0;
  let blink = 0;

  function keyOf(r, c) { return r + ',' + c; }

  function parseLevel(idx) {
    const grid = LEVELS[idx];
    isWallGrid = [];
    isTargetGrid = [];
    targetKeys = [];
    boxes = new Set();
    player = { r: 0, c: 0 };
    for (let r = 0; r < ROWS; r++) {
      isWallGrid.push([]);
      isTargetGrid.push([]);
      for (let c = 0; c < COLS; c++) {
        const code = grid[r][c];
        const wall = (code === EMPTY || code === WALL);
        const target = (code === TARGET || code === BOX_ON_TARGET || code === PLAYER_ON_TARGET);
        isWallGrid[r].push(wall);
        isTargetGrid[r].push(target);
        if (target) targetKeys.push(keyOf(r, c));
        if (code === BOX || code === BOX_ON_TARGET) boxes.add(keyOf(r, c));
        if (code === PLAYER || code === PLAYER_ON_TARGET) player = { r, c };
      }
    }
  }

  function saveProgress() {
    writeSave({
      inProgress: { levelIndex, boxes: Array.from(boxes), player, moves },
    });
  }

  function startLevel(idx) {
    levelIndex = Math.max(0, Math.min(TOTAL_LEVELS - 1, idx));
    parseLevel(levelIndex);
    moves = 0;
    undoStack = [];
    showStatus = false;
    screenState = 'play';
    writeSave({ lastLevel: levelIndex });
    saveProgress();
  }

  function resumeProgress() {
    const save = loadSave();
    if (save.inProgress) {
      const p = save.inProgress;
      levelIndex = p.levelIndex;
      parseLevel(levelIndex);
      boxes = new Set(p.boxes);
      player = { ...p.player };
      moves = p.moves;
      undoStack = [];
      showStatus = false;
      screenState = 'play';
    } else {
      startLevel(0);
    }
  }

  function isWin() {
    for (const k of targetKeys) if (!boxes.has(k)) return false;
    return true;
  }

  function pushUndo() {
    undoStack.push({ player: { ...player }, boxes: new Set(boxes), moves });
    if (undoStack.length > 500) undoStack.shift();
  }

  function undo() {
    if (!undoStack.length) return;
    const s = undoStack.pop();
    player = s.player;
    boxes = s.boxes;
    moves = s.moves;
    saveProgress();
  }

  function tryMove(dr, dc) {
    if (screenState !== 'play') return;
    const nr = player.r + dr, nc = player.c + dc;
    if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) return;
    if (isWallGrid[nr][nc]) return;
    const nk = keyOf(nr, nc);
    if (boxes.has(nk)) {
      const br = nr + dr, bc = nc + dc;
      if (br < 0 || br >= ROWS || bc < 0 || bc >= COLS) return;
      if (isWallGrid[br][bc]) return;
      const bk = keyOf(br, bc);
      if (boxes.has(bk)) return;
      pushUndo();
      boxes.delete(nk);
      boxes.add(bk);
      player = { r: nr, c: nc };
      moves++;
    } else {
      pushUndo();
      player = { r: nr, c: nc };
      moves++;
    }
    saveProgress();
    if (isWin()) {
      recordBest(levelIndex, moves);
      screenState = 'cleared';
    }
  }

  function restartLevel() {
    if (screenState !== 'play' && screenState !== 'cleared') return;
    startLevel(levelIndex);
  }

  function goNextLevel() {
    if (levelIndex + 1 < TOTAL_LEVELS) startLevel(levelIndex + 1);
    else { screenState = 'menu'; menuIndex = 0; }
  }

  function openMenu() {
    screenState = 'menu';
    menuIndex = 0;
  }

  function selectMenuItem() {
    switch (menuItems[menuIndex]) {
      case 'Continuar':
        resumeProgress();
        break;
      case 'Novo jogo':
        writeSave({ inProgress: null });
        startLevel(0);
        break;
      case 'Ultima vista': {
        const save = loadSave();
        startLevel(save.lastLevel || 0);
        break;
      }
      case 'Fase':
        screenState = 'levelselect';
        levelSelectChoice = levelIndex;
        break;
      case 'Instrucoes':
        screenState = 'instructions';
        instructionsPage = 0;
        break;
    }
  }

  const INSTRUCTION_PAGES = [
    'BOX WORLD\n\nEmpurre as caixas\nate os alvos.\nUma por vez, so\nempurrando.',
    'CONTROLES\n\n2 cima   8 baixo\n4 esq.   6 dir.\n\nSoft esq: desfaz\nSoft dir: menu',
    'MAIS\n\nVerde: reinicia\nVermelho: menu\n* : mostra status\n\nTodos os alvos\ncobertos = fase\nconcluida.',
  ];

  const DIR = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };

  function handleDigit(d) {
    if (screenState === 'play') {
      if (d === '2') tryMove(...DIR.up);
      else if (d === '8') tryMove(...DIR.down);
      else if (d === '4') tryMove(...DIR.left);
      else if (d === '6') tryMove(...DIR.right);
      else if (d === '*' || d === '5') showStatus = !showStatus;
    } else if (screenState === 'menu') {
      if (d === '2') menuIndex = (menuIndex - 1 + menuItems.length) % menuItems.length;
      else if (d === '8') menuIndex = (menuIndex + 1) % menuItems.length;
      else if (d === '5') selectMenuItem();
    } else if (screenState === 'levelselect') {
      if (d === '2') levelSelectChoice = (levelSelectChoice - 1 + TOTAL_LEVELS) % TOTAL_LEVELS;
      else if (d === '8') levelSelectChoice = (levelSelectChoice + 1) % TOTAL_LEVELS;
      else if (d === '4') levelSelectChoice = (levelSelectChoice - 10 + TOTAL_LEVELS) % TOTAL_LEVELS;
      else if (d === '6') levelSelectChoice = (levelSelectChoice + 10) % TOTAL_LEVELS;
      else if (d === '5') startLevel(levelSelectChoice);
    } else if (screenState === 'instructions') {
      if (d === '6' || d === '5' || d === '8') instructionsPage = (instructionsPage + 1) % INSTRUCTION_PAGES.length;
      else if (d === '4' || d === '2') instructionsPage = (instructionsPage - 1 + INSTRUCTION_PAGES.length) % INSTRUCTION_PAGES.length;
    } else if (screenState === 'title') {
      openMenu();
    } else if (screenState === 'cleared') {
      goNextLevel();
    }
  }

  function softLeft() {
    if (screenState === 'play') undo();
    else if (screenState === 'menu') screenState = 'play';
    else if (screenState === 'levelselect' || screenState === 'instructions') openMenu();
    else if (screenState === 'title') openMenu();
    else if (screenState === 'cleared') undo();
  }

  function softRight() {
    if (screenState === 'play') openMenu();
    else if (screenState === 'menu') selectMenuItem();
    else if (screenState === 'levelselect') startLevel(levelSelectChoice);
    else if (screenState === 'instructions') openMenu();
    else if (screenState === 'title') openMenu();
    else if (screenState === 'cleared') goNextLevel();
  }

  function greenCall() {
    if (screenState === 'title') openMenu();
    else restartLevel();
  }

  function redEnd() {
    if (screenState === 'play' || screenState === 'cleared' || screenState === 'title') openMenu();
    else screenState = 'play';
  }

  window.addEventListener('keydown', (e) => {
    const k = e.key;
    if (k === 'ArrowUp' || k === 'w' || k === 'W') { handleDigit('2'); e.preventDefault(); }
    else if (k === 'ArrowDown' || k === 's' || k === 'S') { handleDigit('8'); e.preventDefault(); }
    else if (k === 'ArrowLeft' || k === 'a' || k === 'A') { handleDigit('4'); e.preventDefault(); }
    else if (k === 'ArrowRight' || k === 'd' || k === 'D') { handleDigit('6'); e.preventDefault(); }
    else if (k === '2' || k === '4' || k === '6' || k === '8' || k === '5') handleDigit(k);
    else if (k === '*' || e.code === 'NumpadMultiply') handleDigit('*');
    else if (k === 'Backspace' || k === 'z' || k === 'Z') { softLeft(); e.preventDefault(); }
    else if (k === 'Enter') softRight();
    else if (k === 'r' || k === 'R') greenCall();
    else if (k === 'Escape') redEnd();
  });

  const lightBtn = document.getElementById('toggleLight');
  lightBtn.addEventListener('click', () => {
    theme = theme === 'green' ? 'blue' : 'green';
    lightBtn.textContent = 'Luz: ' + (theme === 'green' ? 'verde' : 'azul');
  });

  function bindPress(id, fn) {
    const el = document.getElementById(id);
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); fn(); });
  }

  document.querySelectorAll('.dbtn').forEach((btn) => {
    btn.addEventListener('pointerdown', (e) => { e.preventDefault(); handleDigit(btn.dataset.dir); });
  });

  bindPress('btnUndo', softLeft);
  bindPress('btnOk', () => handleDigit('5'));
  bindPress('btnMenu', softRight);
  bindPress('btnRestart', greenCall);

  // ---- rendering ----
  function fill(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }

  function drawWallTile(px, py) {
    const pal = colors[theme];
    fill(px, py, TILE, TILE, pal.fg);
    const step = 2;
    ctx.fillStyle = pal.bg;
    for (let y = 0; y < TILE; y += step) {
      for (let x = 0; x < TILE; x += step) {
        if (((x / step) + (y / step)) % 2 === 0) ctx.fillRect(px + x, py + y, step, step);
      }
    }
  }

  function drawFloorTile(px, py) {
    fill(px, py, TILE, TILE, colors[theme].bg);
  }

  function drawTargetDot(px, py) {
    const pal = colors[theme];
    fill(px + TILE / 2 - 1.5, py + TILE / 2 - 1.5, 3, 3, pal.fg);
  }

  function drawBox(px, py, onTarget) {
    const pal = colors[theme];
    if (onTarget) {
      fill(px + 1, py + 1, TILE - 2, TILE - 2, pal.fg);
      ctx.strokeStyle = pal.bg;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px + 2, py + 2); ctx.lineTo(px + TILE - 2, py + TILE - 2);
      ctx.moveTo(px + TILE - 2, py + 2); ctx.lineTo(px + 2, py + TILE - 2);
      ctx.stroke();
    } else {
      ctx.strokeStyle = pal.fg;
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 1.5, py + 1.5, TILE - 3, TILE - 3);
      ctx.beginPath();
      ctx.moveTo(px + 2, py + 2); ctx.lineTo(px + TILE - 2, py + TILE - 2);
      ctx.moveTo(px + TILE - 2, py + 2); ctx.lineTo(px + 2, py + TILE - 2);
      ctx.stroke();
    }
  }

  function drawPlayer(px, py, onTarget) {
    const pal = colors[theme];
    ctx.strokeStyle = pal.fg;
    ctx.lineWidth = 1;
    const cx = px + TILE / 2;
    const headY = py + 2;
    fill(cx - 1, headY - 1, 2, 2, pal.fg);
    ctx.beginPath();
    ctx.moveTo(cx, headY + 1); ctx.lineTo(cx, py + TILE - 3);
    ctx.moveTo(cx, py + 4); ctx.lineTo(cx - 3, py + 2);
    ctx.moveTo(cx, py + 4); ctx.lineTo(cx + 3, py + 2);
    ctx.moveTo(cx, py + TILE - 3); ctx.lineTo(cx - 3, py + TILE - 1);
    ctx.moveTo(cx, py + TILE - 3); ctx.lineTo(cx + 3, py + TILE - 1);
    ctx.stroke();
    if (onTarget) fill(cx - 1, py + TILE - 2, 2, 2, pal.fg);
  }

  function renderPlay() {
    const pal = colors[theme];
    fill(0, 0, SCREEN_W, SCREEN_H, pal.bg);
    const levelPxW = COLS * TILE, levelPxH = ROWS * TILE;
    let camX = player.c * TILE + TILE / 2 - SCREEN_W / 2;
    let camY = player.r * TILE + TILE / 2 - SCREEN_H / 2;
    camX = Math.max(0, Math.min(levelPxW - SCREEN_W, camX));
    camY = Math.max(0, Math.min(levelPxH - SCREEN_H, camY));
    camX = Math.round(camX);
    camY = Math.round(camY);

    const c0 = Math.max(0, Math.floor(camX / TILE)), c1 = Math.min(COLS, Math.ceil((camX + SCREEN_W) / TILE));
    const r0 = Math.max(0, Math.floor(camY / TILE)), r1 = Math.min(ROWS, Math.ceil((camY + SCREEN_H) / TILE));

    for (let r = r0; r < r1; r++) {
      for (let c = c0; c < c1; c++) {
        const px = c * TILE - camX, py = r * TILE - camY;
        if (isWallGrid[r][c]) { drawWallTile(px, py); continue; }
        drawFloorTile(px, py);
        if (isTargetGrid[r][c] && !boxes.has(keyOf(r, c))) drawTargetDot(px, py);
      }
    }
    for (const k of boxes) {
      const [r, c] = k.split(',').map(Number);
      drawBox(c * TILE - camX, r * TILE - camY, isTargetGrid[r][c]);
    }
    drawPlayer(player.c * TILE - camX, player.r * TILE - camY, isTargetGrid[player.r][player.c]);

    if (showStatus) {
      fill(0, 0, SCREEN_W, 10, pal.fg);
      ctx.fillStyle = pal.bg;
      ctx.font = '7px monospace';
      ctx.textBaseline = 'top';
      const best = bestFor(levelIndex);
      ctx.fillText('Fase ' + (levelIndex + 1) + '  Mov ' + moves + (best ? '  Rec ' + best : ''), 2, 1);
    }
  }

  function centerText(lines, y0, color) {
    ctx.fillStyle = color;
    ctx.font = '7px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    lines.forEach((line, i) => ctx.fillText(line, SCREEN_W / 2, y0 + i * 9));
    ctx.textAlign = 'left';
  }

  function renderTitle() {
    const pal = colors[theme];
    fill(0, 0, SCREEN_W, SCREEN_H, pal.bg);
    centerText(['BOX WORLD'], SCREEN_H / 2 - 10, pal.fg);
    if (blink < 30) centerText(['pressione uma tecla'], SCREEN_H / 2 + 10, pal.fg);
  }

  function renderMenu() {
    const pal = colors[theme];
    fill(0, 0, SCREEN_W, SCREEN_H, pal.bg);
    const menuTop = (SCREEN_H - menuItems.length * 11) / 2;
    menuItems.forEach((item, i) => {
      const y = menuTop + i * 11;
      if (i === menuIndex) fill(2, y - 1, SCREEN_W - 4, 10, pal.fg);
      ctx.fillStyle = i === menuIndex ? pal.bg : pal.fg;
      ctx.font = '7px monospace';
      ctx.textBaseline = 'top';
      ctx.fillText(item, 6, y);
    });
  }

  function renderInstructions() {
    const pal = colors[theme];
    fill(0, 0, SCREEN_W, SCREEN_H, pal.bg);
    const lines = INSTRUCTION_PAGES[instructionsPage].split('\n');
    const top = (SCREEN_H - lines.length * 8) / 2;
    ctx.fillStyle = pal.fg;
    ctx.font = '7px monospace';
    ctx.textBaseline = 'top';
    lines.forEach((line, i) => ctx.fillText(line, 3, top + i * 8));
    ctx.fillText((instructionsPage + 1) + '/' + INSTRUCTION_PAGES.length, SCREEN_W - 16, SCREEN_H - 9);
  }

  function renderLevelSelect() {
    const pal = colors[theme];
    fill(0, 0, SCREEN_W, SCREEN_H, pal.bg);
    const midY = SCREEN_H / 2;
    centerText(['Escolha a fase'], midY - 28, pal.fg);
    const best = bestFor(levelSelectChoice);
    centerText(['< ' + (levelSelectChoice + 1) + ' >'], midY - 5, pal.fg);
    centerText([best ? ('recorde: ' + best) : 'sem recorde'], midY + 15, pal.fg);
  }

  function renderCleared() {
    renderPlay();
    const pal = colors[theme];
    const boxW = SCREEN_W - 40, boxH = 30;
    const boxX = (SCREEN_W - boxW) / 2, boxY = (SCREEN_H - boxH) / 2;
    fill(boxX, boxY, boxW, boxH, pal.bg);
    ctx.strokeStyle = pal.fg;
    ctx.strokeRect(boxX, boxY, boxW, boxH);
    centerText(['FASE CONCLUIDA', moves + ' movimentos'], boxY + 6, pal.fg);
  }

  function render() {
    switch (screenState) {
      case 'title': renderTitle(); break;
      case 'menu': renderMenu(); break;
      case 'instructions': renderInstructions(); break;
      case 'levelselect': renderLevelSelect(); break;
      case 'cleared': renderCleared(); break;
      default: renderPlay(); break;
    }
  }

  function loop() {
    blink = (blink + 1) % 60;
    render();
    requestAnimationFrame(loop);
  }
  loop();
})();
