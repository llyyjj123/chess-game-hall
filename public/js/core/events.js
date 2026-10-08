/* ===============================================================
   js/core/events.js
   核心 · 全局事件绑定
   自 index.html 第 439-490 行原样搬移，逻辑未作任何改动。
   =============================================================== */

// ═══════════════════════════════════════════════════════
//  GLOBAL EVENT HANDLERS
// ═══════════════════════════════════════════════════════

canvas.addEventListener('click', (e) => {
  if (!activeGame) return;
  if (activeGame.reviewing) return;   // 复盘浏览中不接受落子

  const rect = canvas.getBoundingClientRect();
  // 用逻辑尺寸（CSS 像素）换算，不能用 canvas.width —— 后者已按 DPR 放大
  const scaleX = (activeGame.boardW || canvas.width) / rect.width;
  const scaleY = (activeGame.boardH || canvas.height) / rect.height;
  const mx = (e.clientX - rect.left) * scaleX;
  const my = (e.clientY - rect.top) * scaleY;

  if (activeGame.handleClick) activeGame.handleClick(mx, my);
});

document.getElementById('btnNewGame').addEventListener('click', () => {
  if (!activeGame) return;
  clearMoveLog();
  if (activeGame.newGame) activeGame.newGame();
});

document.getElementById('btnUndo').addEventListener('click', () => {
  if (!activeGame || hasActiveAnimations() || activeGame.multiplayer) return;
  if (activeGame.undo) activeGame.undo();
  // Remove last moves from log
  const log = document.getElementById('moveLog');
  const numToRemove = activeGame.undoLogCount || 1;
  for (let i = 0; i < numToRemove; i++) {
    if (log.lastChild) log.removeChild(log.lastChild);
  }
});

// Tab switching
document.getElementById('gameTabs').addEventListener('click', (e) => {
  const btn = e.target.closest('.tab-btn');
  if (!btn) return;
  const gameId = btn.dataset.game;
  if (gameId) switchGame(gameId);
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (e.key === 'n' || e.key === 'N') document.getElementById('btnNewGame').click();
  if (e.key === 'u' || e.key === 'U') document.getElementById('btnUndo').click();
  if (e.key === 'Escape' && activeGame && activeGame.clearSelection) activeGame.clearSelection();
});

console.log('🎮 棋类游戏大厅已就绪');
console.log('   Games: 象棋 | 五子棋 | 国际象棋 | 围棋');
console.log('   快捷键: N=新游戏 U=悔棋 Esc=取消');

// ── 复盘浏览 ──
// ◀ 进入复盘并后退一手；▶ 前进一步，走到末尾即回到实时。
function reviewStep(delta) {
  if (!activeGame || !activeGame.moveHistory) return;
  if (activeGame.aiThinking) return;            // AI 思考中不进入，避免局面被中途改写
  const n = activeGame.moveHistory.length;
  if (n === 0) return;
  if (!activeGame.reviewing) {
    if (delta > 0) return;
    activeGame.enterReview();
    activeGame.setReviewPly(n - 1);
  } else {
    const nxt = activeGame._reviewPly + delta;
    if (nxt >= n) activeGame.exitReview();
    else activeGame.setReviewPly(nxt);
  }
  updateReviewUI();
}

function updateReviewUI() {
  const pos = document.getElementById('reviewPos');
  const prev = document.getElementById('btnRevPrev');
  const next = document.getElementById('btnRevNext');
  if (!pos || !prev || !next || !activeGame) return;
  const n = activeGame.moveHistory ? activeGame.moveHistory.length : 0;
  if (activeGame.reviewing) {
    pos.textContent = '复盘 ' + activeGame._reviewPly + ' / ' + n;
    pos.classList.add('active');
    prev.disabled = activeGame._reviewPly <= 0;
    next.disabled = false;
  } else {
    pos.textContent = '实时';
    pos.classList.remove('active');
    prev.disabled = n === 0;
    next.disabled = true;
  }
}

document.getElementById('btnRevPrev').addEventListener('click', () => reviewStep(-1));
document.getElementById('btnRevNext').addEventListener('click', () => reviewStep(1));

// 窗口尺寸变化时重算棋盘 —— 原实现只在初始化时算一次，
// 改窗口大小 / 手机横竖屏切换后棋盘不会跟着变。
let _resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(_resizeTimer);
  _resizeTimer = setTimeout(() => {
    if (!activeGame) return;
    if (activeGame._calcSizes) activeGame._calcSizes();
    if (activeGame.render) activeGame.render();
    if (typeof updateSidePanel === 'function') updateSidePanel();
  }, 120);
});

