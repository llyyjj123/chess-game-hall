/* ===============================================================
   js/core/platform.js
   核心 · 游戏注册表与面板渲染
   自 index.html 第 288-438 行原样搬移，逻辑未作任何改动。
   =============================================================== */

// ═══════════════════════════════════════════════════════
//  PLATFORM
// ═══════════════════════════════════════════════════════

let activeGame = null;
let activeGameId = null;
const gameInstances = {};

function registerGame(id, GameClass) {
  gameInstances[id] = new GameClass(canvas, ctx);
}

function switchGame(gameId) {
  if (activeGameId === gameId) return;
  // 联机对局中切换棋种必须退出房间：否则你还留在房间里，但 activeGame 已经换成别的棋种，
  // 对手那边仍在下原来的棋 —— 双方棋盘错位，而且对手完全不知道你切走了。
  if (typeof mp !== 'undefined' && mp.roomId) {
    if (!confirm('你正在联机对局中，切换棋种将退出房间并通知对手。确定吗？')) return;
    mp.leaveRoom();
  }
  if (activeGame && activeGame.reviewing) activeGame.exitReview();   // 切换前退出复盘，避免留下历史局面
  if (activeGame && activeGame.cleanup) activeGame.cleanup();

  activeGameId = gameId;
  activeGame = gameInstances[gameId];
  activeGame.init();

  // Update tabs
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`[data-game="${gameId}"]`)?.classList.add('active');

  // Reset animation state
  animations.length = 0;
  if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null; }
  currentRenderFn = () => activeGame.render();
  currentRenderFn();

  // Clear move log
  document.getElementById('moveLog').innerHTML = '';

  // Update panel
  updateSidePanel();
  updateUI();
}

function updateSidePanel() {
  if (!activeGame) return;
  const panelEl = document.getElementById('panelControls');
  panelEl.innerHTML = getMPPanelHTML() + (activeGame.getPanelHTML ? activeGame.getPanelHTML() : '');

  // Bind multiplayer toggle
  document.getElementById('mpToggle').addEventListener('click', function(e) {
    const btn = e.target.closest('.mp-btn');
    if (!btn) return;
    this.querySelectorAll('.mp-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    multiplayerMode = btn.dataset.mode === 'online';
    if (mp.roomId) mp.leaveRoom();
    if (activeGame) activeGame.newGame();
    updateMPPanel();
  });

  // Re-bind panel events
  if (activeGame.bindPanelEvents) activeGame.bindPanelEvents();

  // Update captured area
  const capArea = document.getElementById('capturedArea');
  if (activeGame.getCapturedHTML) {
    capArea.innerHTML = activeGame.getCapturedHTML();
    capArea.style.display = '';
  } else {
    capArea.style.display = 'none';
  }

  // Extra actions
  const extraEl = document.getElementById('extraActions');
  let extraHTML = activeGame.getExtraActionsHTML ? activeGame.getExtraActionsHTML() : '';
  if (activeGame.multiplayer && !activeGame.gameOver && mp.roomId && activeGame.constructor.name === 'ChineseChessGame') {
    extraHTML += `<button class="btn" id="btnDraw" style="width:100%">提议和棋</button>`;
  }
  if (activeGame.multiplayer && activeGame.gameOver && mp.roomId) {
    extraHTML += `<button class="btn primary" id="btnRematch" style="width:100%">再来一局</button>`;
  }
  extraEl.innerHTML = extraHTML;
  extraEl.style.display = extraHTML ? '' : 'none';
  const drawBtn = document.getElementById('btnDraw');
  if (drawBtn) drawBtn.onclick = () => mp.offerDraw();
  if (activeGame.multiplayer && activeGame.gameOver && mp.roomId) {
    document.getElementById('btnRematch').onclick = () => mp.requestRematch();
  }

  updateUI();
}

function updateUI() {
  if (!activeGame) return;
  let dotClass = activeGame.statusDotClass || 'red';
  if (activeGame.multiplayer) {
    const isMyTurn = activeGame.currentPlayer === (activeGame.mySide === 'black' ? 1 : 2);
    dotClass = isMyTurn ? 'red' : 'white';
  } else if (activeGame.currentPlayer !== undefined) {
    dotClass = activeGame.currentPlayer === 1 ? 'red' : 'white';
  } else if (activeGame.currentTurn !== undefined) {
    dotClass = activeGame.currentTurn === 0 ? 'red' : 'black';
  }
  document.getElementById('statusDot').className = 'status-dot ' + dotClass;
  document.getElementById('statusText').textContent = activeGame.getStatusText();
  document.getElementById('moveHint').textContent = activeGame.getHintText ? activeGame.getHintText() : '';

  // Update extra actions (resign / draw / rematch)
  // 注意：这里才是 extraActions 的最终归属 —— updateSidePanel 也会写一次，
  // 但它末尾会调用本函数，所以按钮必须在这里加，否则会被覆盖掉。
  const extraEl = document.getElementById('extraActions');
  let extraHTML = activeGame.getExtraActionsHTML ? activeGame.getExtraActionsHTML() : '';
  if (!activeGame.gameOver && activeGame.resign) {
    extraHTML += `<button class="btn" id="btnResign" style="width:100%">认输</button>`;
  }
  if (activeGame.multiplayer && !activeGame.gameOver && mp.roomId && activeGame.constructor.name === 'ChineseChessGame') {
    extraHTML += `<button class="btn" id="btnDraw" style="width:100%">提议和棋</button>`;
  }
  if (activeGame.multiplayer && activeGame.gameOver && mp.roomId) {
    extraHTML += `<button class="btn primary" id="btnRematch" style="width:100%">再来一局</button>`;
  }
  extraEl.innerHTML = extraHTML;
  extraEl.style.display = extraHTML ? '' : 'none';
  const resignBtn = document.getElementById('btnResign');
  if (resignBtn) resignBtn.onclick = () => { if (confirm('确定认输？')) activeGame.resign(); };
  const drawBtn2 = document.getElementById('btnDraw');
  if (drawBtn2) drawBtn2.onclick = () => mp.offerDraw();
  const rematchBtn = document.getElementById('btnRematch');
  if (rematchBtn) rematchBtn.onclick = () => mp.requestRematch();

  // 复盘工具条状态（updateReviewUI 定义在 events.js，加载顺序在后，故做存在性判断）
  if (typeof updateReviewUI === 'function') updateReviewUI();
}

function updateMoveLog(moveText) {
  const log = document.getElementById('moveLog');
  const div = document.createElement('div');
  div.style.textAlign = 'left';

  const total = log.children.length / 2 + 1;
  if (log.children.length % 2 === 0) {
    // Red's move (or first player)
    const num = document.createElement('span');
    num.style.opacity = '0.5';
    num.style.marginRight = '6px';
    num.textContent = `${total}. `;
    div.appendChild(num);
    const span = document.createElement('span');
    span.style.color = '#e8a0a0';
    span.textContent = moveText;
    div.appendChild(span);
  } else {
    const span = document.createElement('span');
    span.style.color = '#8fa8c0';
    span.style.marginLeft = '4px';
    span.textContent = moveText;
    div.appendChild(span);
  }
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

function clearMoveLog() {
  document.getElementById('moveLog').innerHTML = '';
}

