/* ===============================================================
   js/core/framework.js
   核心 · 画布与坐标框架
   =============================================================== */

// ===================================================================
//  GAME PLATFORM FRAMEWORK
// ===================================================================

const canvas = document.getElementById('boardCanvas');
const ctx = canvas.getContext('2d');

let cellSize, paddingX, paddingY;
let getBoardXY; // function(row, col) => {x, y} — set by each game

// ── 高清屏（DPR）适配 ────────────────────────────────────────────
// 原实现直接把 CSS 像素写进 canvas.width，在 Retina / 手机上后备缓冲
// 被拉伸，棋盘发虚。现在按 devicePixelRatio 放大后备缓冲，再用
// setTransform 把绘制坐标系拉回 CSS 像素——各游戏内部的绘制坐标
// （cellSize / padX / boardW…）无需改动。
function getDPR() {
  return Math.min(window.devicePixelRatio || 1, 3); // 上限 3，避免 4K 屏过度渲染
}

function setupCanvas(logicalW, logicalH) {
  const dpr = getDPR();
  canvas.width = Math.round(logicalW * dpr);
  canvas.height = Math.round(logicalH * dpr);
  canvas.style.width = logicalW + 'px';
  canvas.style.height = logicalH + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// ── 棋盘可用空间 ─────────────────────────────────────────────────
// 原实现用 `window.innerWidth - 340` 硬编码预留侧栏宽度，手机上
// （390px）算出 50px，棋盘被压成一小块。改为实测棋盘容器宽度；
// 窄屏时 CSS 断点会把侧栏移到棋盘下方，容器自然变宽。
function availableBoardSize(maxW, maxH) {
  const box = canvas.closest('.board-section');
  let w = (box && box.clientWidth) ? box.clientWidth - 24 : window.innerWidth - 340;
  let h = window.innerHeight - 150;
  if (maxW) w = Math.min(w, maxW);
  if (maxH) h = Math.min(h, maxH);
  return { w: Math.max(200, w), h: Math.max(240, h) };
}

// ── 棋盘配色 ─────────────────────────────────────────────────────
// 从 CSS 变量读取，使棋盘能跟随深浅主题。render() 在动画期间会被
// 逐帧调用，getComputedStyle 开销不小，因此缓存；主题切换时由
// theme.js 调 invalidateThemeCache() 失效。
let _themeCache = null;

function themeColors() {
  if (_themeCache) return _themeCache;
  const cs = getComputedStyle(document.documentElement);
  const v = n => cs.getPropertyValue(n).trim();
  _themeCache = {
    boardBg:    v('--board-bg'),
    boardLine:  v('--board-line'),
    boardFrame: v('--board-frame'),
    pieceFace:  v('--piece-face'),
    pieceRed:   v('--piece-red'),
    pieceBlack: v('--piece-black'),
    accent:     v('--accent'),
    text:       v('--text'),
    text2:      v('--text-2'),
  };
  return _themeCache;
}

function invalidateThemeCache() { _themeCache = null; }
