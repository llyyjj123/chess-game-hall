/* ===============================================================
   js/core/prefs.js
   核心 · 用户偏好持久化
   难度、围棋棋盘尺寸写入 localStorage，刷新后保持。
   主题偏好在 theme.js 里处理（由 <head> 内联脚本提前读取，避免闪白）。
   =============================================================== */

const PREF_PREFIX = 'chess-';

function prefGet(key, def) {
  try {
    const v = localStorage.getItem(PREF_PREFIX + key);
    return v === null ? def : v;
  } catch (e) {
    return def; // 隐私模式 / 禁用存储时静默降级
  }
}

function prefSet(key, val) {
  try { localStorage.setItem(PREF_PREFIX + key, String(val)); } catch (e) {}
}

/* ── 难度（四个游戏共用） ── */
const DIFF_LABELS = ['简单', '中等', '困难', '大师'];

function loadDifficulty(gameId, def) {
  const n = parseInt(prefGet('diff:' + gameId, String(def)), 10);
  return (n >= 0 && n <= 3) ? n : def;
}

function saveDifficulty(gameId, level) {
  prefSet('diff:' + gameId, level);
}

// 难度按钮组：active 由当前难度决定，替换原先写死的 active
function diffButtonsHTML(active) {
  return DIFF_LABELS
    .map((t, i) => `<button class="diff-btn${i === active ? ' active' : ''}" data-diff="${i}">${t}</button>`)
    .join('');
}

/* ── 围棋棋盘尺寸 ── */
const GO_SIZES = [9, 13, 19];

function loadBoardSize(def) {
  const n = parseInt(prefGet('go:size', String(def)), 10);
  return GO_SIZES.indexOf(n) >= 0 ? n : def;
}

function saveBoardSize(size) { prefSet('go:size', size); }

function sizeButtonsHTML(active) {
  return GO_SIZES
    .map(s => `<button class="size-btn${s === active ? ' active' : ''}" data-size="${s}">${s}×${s}</button>`)
    .join('');
}
