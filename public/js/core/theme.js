/* ===============================================================
   js/core/theme.js
   核心 · 深浅主题切换
   主题值存在 <html data-theme="dark|light">，由 CSS 变量驱动。
   初始值在 <head> 的内联脚本里读取（避免刷新闪白），这里只负责
   绑定按钮与写回 localStorage。
   =============================================================== */

(function () {
  const root = document.documentElement;
  const btn = document.getElementById('themeToggle');
  const label = document.getElementById('themeLabel');

  function current() {
    return root.dataset.theme === 'light' ? 'light' : 'dark';
  }

  function syncLabel() {
    if (label) label.textContent = current() === 'light' ? '浅色' : '深色';
  }

  function apply(theme) {
    root.dataset.theme = theme;
    syncLabel();
    try { localStorage.setItem('chess-theme', theme); } catch (e) { /* 隐私模式忽略 */ }
    // 棋盘配色来自 CSS 变量，缓存必须失效后重绘
    if (typeof invalidateThemeCache === 'function') invalidateThemeCache();
    if (typeof activeGame !== 'undefined' && activeGame && activeGame.render) activeGame.render();
  }

  if (btn) {
    btn.addEventListener('click', () => apply(current() === 'light' ? 'dark' : 'light'));
  }
  syncLabel();
})();
