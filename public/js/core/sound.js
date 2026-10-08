/* ===============================================================
   js/core/sound.js
   核心 · 音效
   用 Web Audio 实时合成，不依赖任何音频素材文件。
   浏览器要求首次用户交互后才能出声，因此 AudioContext 惰性创建。
   =============================================================== */

let _ac = null;

function audioCtx() {
  if (_ac) {
    if (_ac.state === 'suspended') { try { _ac.resume(); } catch (e) {} }
    return _ac;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try { _ac = new AC(); } catch (e) { return null; }
  return _ac;
}

// 单个音符：type 波形，freq 频率，dur 时长(秒)，vol 音量，delay 延迟(秒)
function tone(freq, dur, type, vol, delay, freqEnd) {
  const ac = audioCtx();
  if (!ac) return;
  const t0 = ac.currentTime + (delay || 0);
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type || 'sine';
  osc.frequency.setValueAtTime(freq, t0);
  if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, t0 + dur);
  // 快起慢落的包络，避免爆音
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g); g.connect(ac.destination);
  osc.start(t0); osc.stop(t0 + dur + 0.02);
}

const Sound = {
  get muted() {
    return prefGet('sound:muted', '0') === '1';
  },
  setMuted(v) {
    prefSet('sound:muted', v ? '1' : '0');
  },
  toggle() {
    this.setMuted(!this.muted);
    if (!this.muted) this.move();
    return this.muted;
  },
  _on() { return !this.muted; },

  // 落子：短促的木质感点击
  move() {
    if (!this._on()) return;
    tone(760, 0.055, 'triangle', 0.16, 0, 420);
  },

  // 吃子：两声下行，比落子更重
  capture() {
    if (!this._on()) return;
    tone(520, 0.07, 'square', 0.13, 0, 300);
    tone(300, 0.09, 'triangle', 0.14, 0.06, 180);
  },

  // 将军：急促双响
  check() {
    if (!this._on()) return;
    tone(1180, 0.09, 'square', 0.13, 0);
    tone(1180, 0.09, 'square', 0.13, 0.14);
  },

  // 胜利：上行三音
  win() {
    if (!this._on()) return;
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, 'triangle', 0.16, i * 0.11));
  },

  // 失败：下行三音
  lose() {
    if (!this._on()) return;
    [440, 370, 294].forEach((f, i) => tone(f, 0.26, 'triangle', 0.15, i * 0.13));
  },

  // 和棋：中性两音
  draw() {
    if (!this._on()) return;
    tone(494, 0.2, 'sine', 0.14, 0);
    tone(494, 0.2, 'sine', 0.12, 0.22);
  },
};

// 统一的走子音效入口 —— 各游戏只需算出这几个布尔量
function soundForMove(o) {
  o = o || {};
  if (o.gameOver) {
    if (o.draw) Sound.draw();
    else if (o.iWon) Sound.win();
    else Sound.lose();
    return;
  }
  if (o.captured) Sound.capture(); else Sound.move();
  if (o.check) Sound.check();
}

/* 顶栏音效开关 */(function () {
  const btn = document.getElementById('soundToggle');
  const label = document.getElementById('soundLabel');
  if (!btn) return;

  function sync() {
    const m = Sound.muted;
    if (label) label.textContent = m ? '音效关' : '音效开';
    btn.classList.toggle('muted', m);
  }
  btn.addEventListener('click', () => { Sound.toggle(); sync(); });
  sync();
})();
