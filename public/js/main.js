/* ===============================================================
   js/main.js
   入口 · 注册游戏并启动
   自 index.html 第 3322-3345 行原样搬移，逻辑未作任何改动。
   =============================================================== */

// ===================================================================
//  REGISTER ALL GAMES & INITIALIZE
// ===================================================================

registerGame('chinese-chess', ChineseChessGame);
registerGame('gomoku', GomokuGame);
registerGame('chess', ChessGame);
registerGame('go', GoGame);

// Bind pass button for Go (delegated)
document.getElementById('extraActions').addEventListener('click', (e) => {
  if (e.target.id === 'btnPass' && activeGame instanceof GoGame) {
    activeGame.pass();
  }
});

// Start with Chinese Chess
requestAnimationFrame(() => switchGame('chinese-chess'));

console.log('🎮 棋类游戏大厅已就绪');
console.log('   🏯 象棋 | ⚫ 五子棋 | ♟️ 国际象棋 | 🌿 围棋');
console.log('   快捷键: N=新游戏 U=悔棋 Esc=取消选择');

// ===================================================================
