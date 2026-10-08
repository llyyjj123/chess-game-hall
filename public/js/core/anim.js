/* ===============================================================
   js/core/anim.js
   核心 · 动画引擎
   自 index.html 第 88-287 行原样搬移，逻辑未作任何改动。
   =============================================================== */

// ═══════════════════════════════════════════════════════
//  ANIMATION SYSTEM
// ═══════════════════════════════════════════════════════

const animations = [];
let animFrameId = null;
let currentRenderFn = null; // called each animation frame

function startAnimLoop() {
  if (animFrameId) return;
  function loop(ts) {
    try {
      // Remove finished animations
      for (let i = animations.length - 1; i >= 0; i--) {
        const a = animations[i];
        a.elapsed = ts - a.startTime;
        a.progress = Math.min(1, a.elapsed / a.duration);
        if (a.progress >= 1) animations.splice(i, 1);
      }

      if (currentRenderFn) {
        try { currentRenderFn(); } catch(e) { console.error('Render error:', e); }
      }

      // Draw each active animation
      for (const a of animations) {
        try {
          if (a.type === 'trail') drawTrailAnim(a);
          if (a.type === 'pulse') drawPulseAnim(a);
          if (a.type === 'slide') drawSlideAnim(a);
        } catch(e) { console.error('Anim draw error:', e); }
      }
    } catch(e) {
      console.error('Animation loop error:', e);
    }

    if (animations.length > 0) {
      animFrameId = requestAnimationFrame(loop);
    } else {
      animFrameId = null;
      if (currentRenderFn) {
        try { currentRenderFn(); } catch(e) { console.error('Final render error:', e); }
      }
    }
  }
  animFrameId = requestAnimationFrame(loop);
}

function drawTrailAnim(a) {
  const alpha = Math.max(0, 1 - a.progress);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = a.color;
  ctx.lineWidth = 3;
  ctx.setLineDash([8, 5]);
  ctx.beginPath();
  ctx.moveTo(a.from.x, a.from.y);
  ctx.lineTo(a.to.x, a.to.y);
  ctx.stroke();
  ctx.setLineDash([]);

  // Arrowhead at destination
  const dx = a.to.x - a.from.x, dy = a.to.y - a.from.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len > 5) {
    const ux = dx / len, uy = dy / len;
    const arrowLen = 12;
    const ax = a.to.x - ux * 5;
    const ay = a.to.y - uy * 5;
    ctx.beginPath();
    ctx.moveTo(a.to.x, a.to.y);
    ctx.lineTo(ax - uy * arrowLen * 0.5, ay + ux * arrowLen * 0.5);
    ctx.lineTo(ax + uy * arrowLen * 0.5, ay - ux * arrowLen * 0.5);
    ctx.closePath();
    ctx.fillStyle = a.color;
    ctx.fill();
  }
  ctx.restore();
}

function drawPulseAnim(a) {
  const alpha = 1 - a.progress;
  const r = a.radius * (1 + a.progress * 1.8);
  ctx.save();
  ctx.globalAlpha = alpha * 0.7;
  ctx.beginPath();
  ctx.arc(a.x, a.y, r, 0, Math.PI * 2);
  ctx.fillStyle = a.color;
  ctx.fill();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.arc(a.x, a.y, r, 0, Math.PI * 2);
  ctx.strokeStyle = a.color;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.restore();
}

function drawSlideAnim(a) {
  // Draw a piece sliding from fromPos to toPos
  if (!a.pieceChar) return;
  const t = a.progress;
  // Ease out cubic
  const ease = 1 - Math.pow(1 - t, 3);
  const x = a.from.x + (a.to.x - a.from.x) * ease;
  const y = a.from.y + (a.to.y - a.from.y) * ease;

  const r = a.radius;
  ctx.save();
  // Shadow
  ctx.beginPath();
  ctx.arc(x + 1.5, y + 1.5, r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fill();
  // Piece body
  const grad = ctx.createRadialGradient(x - r * 0.25, y - r * 0.3, r * 0.05, x, y, r);
  grad.addColorStop(0, '#fffef5');
  grad.addColorStop(0.5, '#f5e6c8');
  grad.addColorStop(1, '#c9a24f');
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();
  // Ring
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.strokeStyle = a.pieceColor;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  // Char
  ctx.fillStyle = a.pieceColor;
  ctx.font = `bold ${r * 1.15}px "KaiTi", "STKaiti", "Noto Serif SC", serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(a.pieceChar, x, y + 0.5);
  ctx.restore();
}

// Public animation API
function animateTrail(fromX, fromY, toX, toY, color = 'rgba(255,200,80,0.9)', duration = 1000) {
  animations.push({
    type: 'trail', from: { x: fromX, y: fromY }, to: { x: toX, y: toY },
    color, duration, startTime: performance.now(), progress: 0
  });
  startAnimLoop();
}

function animatePulse(x, y, color = 'rgba(255,200,80,0.8)', radius = 10, duration = 700) {
  animations.push({ type: 'pulse', x, y, color, radius, duration, startTime: performance.now(), progress: 0 });
  startAnimLoop();
}

function animateSlide(fromX, fromY, toX, toY, pieceChar, pieceColor, radius, duration = 280) {
  animations.push({
    type: 'slide', from: { x: fromX, y: fromY }, to: { x: toX, y: toY },
    pieceChar, pieceColor, radius, duration, startTime: performance.now(), progress: 0
  });
  startAnimLoop();
}

// Combined: animate a full move sequence
function animateMove(fromR, fromC, toR, toC, pieceChar, pieceColor, pieceRadius, onComplete, duration = 600) {
  if (!getBoardXY) { if (onComplete) onComplete(); return; }
  const from = getBoardXY(fromR, fromC);
  const to = getBoardXY(toR, toC);
  const trailColor = pieceColor === '#e74c3c' ? 'rgba(255,180,80,0.85)' : 'rgba(120,200,255,0.8)';

  animateSlide(from.x, from.y, to.x, to.y, pieceChar, pieceColor, pieceRadius, duration);
  animateTrail(from.x, from.y, to.x, to.y, trailColor, duration + 200);
  setTimeout(() => {
    animatePulse(to.x, to.y, trailColor, pieceRadius, 500);
    if (onComplete) onComplete();
  }, duration);
}

// Combined: animate AI move with source selection highlight
function animateAIMove(fromR, fromC, toR, toC, pieceChar, pieceColor, pieceRadius, onComplete) {
  if (!getBoardXY) { if (onComplete) onComplete(); return; }
  const from = getBoardXY(fromR, fromC);
  const to = getBoardXY(toR, toC);
  const trailColor = 'rgba(120,200,255,0.8)';

  // Phase 1: highlight source piece for 500ms
  animatePulse(from.x, from.y, trailColor, pieceRadius, 600);

  // Phase 2: trail + slide + pulse dest
  setTimeout(() => {
    animateSlide(from.x, from.y, to.x, to.y, pieceChar, pieceColor, pieceRadius, 300);
    animateTrail(from.x, from.y, to.x, to.y, trailColor, 900);
    setTimeout(() => {
      animatePulse(to.x, to.y, trailColor, pieceRadius, 500);
      if (onComplete) onComplete();
    }, 300);
  }, 650);
}

function hasActiveAnimations() {
  return animations.length > 0;
}

