/* ===============================================================
   js/net/multiplayer.js
   联机 · 房间与 Socket.IO
   本版新增：走子序号、服务端校验回执、双端局面指纹、断线重连、对局计时。
   =============================================================== */

// ===================================================================
//  MULTIPLAYER MANAGER
// ===================================================================

let multiplayerMode = false;

// 玩家标识：用于断线后凭 roomId + playerId 恢复席位
function getPlayerId() {
  let id = prefGet('mp:playerId', '');
  if (!id) {
    id = 'p' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    prefSet('mp:playerId', id);
  }
  return id;
}

// 局面指纹：双方各自计算并上报，服务端比对，用于发现篡改/失步
function boardHash(board) {
  const s = JSON.stringify(board);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function fmtClock(ms) {
  if (!(ms > 0)) ms = 0;
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m + ':' + (s < 10 ? '0' : '') + s;
}

class MultiplayerManager {
  constructor() {
    this.socket = null;
    this.roomId = null;
    this.mySide = null;
    this.oppSide = null;
    this.gameType = null;
    this.connected = false;
    this.seq = 0;
    this.clock = null;
    this.turn = null;
    this.turnStartedAt = 0;
    this.offline = false;
    this.rejected = null;
    this._ticker = null;
  }

  /* ── 连接与事件 ── */
  connect() {
    if (this.socket) return;
    this.socket = io();

    this.socket.on('connect', () => {
      this.connected = true;
      // 断线重连：若原本在房间里，尝试恢复席位
      if (this.roomId) {
        this.socket.emit('rejoin-room', { roomId: this.roomId, playerId: getPlayerId() }, (res) => {
          if (!res || res.error) {
            alert('房间已失效：' + ((res && res.error) || '未知原因'));
            this.roomId = null;
            if (activeGame) { activeGame.multiplayer = false; activeGame.mySide = null; }
          } else {
            this.mySide = res.side;
            this.oppSide = res.opponentSide;
            this.seq = res.seq || 0;
            this.applyClock(res);
            if (activeGame) {
              activeGame.multiplayer = true;
              activeGame.mySide = this.mySide;
              activeGame.opponentSide = this.oppSide;
              activeGame.render();
            }
          }
          updateMPPanel();
          updateUI();
        });
      }
      updateMPPanel();
    });

    this.socket.on('disconnect', () => {
      this.connected = false;
      updateMPPanel();
    });

    this.socket.on('game-start', (p) => {
      this.oppSide = p.opponentSide;
      this.applyClock(p);
      if (activeGame) {
        activeGame.multiplayer = true;
        activeGame.mySide = this.mySide;
        activeGame.opponentSide = p.opponentSide;
        if (activeGame._calcSizes) { activeGame._calcSizes(); activeGame.render(); }
      }
      updateMPPanel();
      updateUI();
    });

    this.socket.on('opponent-move', ({ moveData }) => {
      if (activeGame && activeGame.applyOpponentMove) activeGame.applyOpponentMove(moveData);
    });

    this.socket.on('opponent-pass', () => {
      if (activeGame && activeGame.applyOpponentPass) activeGame.applyOpponentPass();
    });

    // 服务端回执：同步时钟与回合
    this.socket.on('move-ack', (p) => { this.applyClock(p); this._lastRejected = null; updateMPPanel(); });

    // 走子被服务端拒绝。原先只往控制台打一行日志，玩家看不到任何反馈，
    // 表现为「点了没反应」—— 这里改成明确提示（同一原因只提示一次，避免刷屏）。
    this.socket.on('move-rejected', ({ reason }) => {
      this.rejected = reason;
      console.warn('[MP] move rejected:', reason);
      if (this._lastRejected !== reason) {
        this._lastRejected = reason;
        const msg = reason === 'not-your-turn' ? '还没轮到你走棋'
                  : reason === 'bad-seq'      ? '与对手局面不同步，建议退出房间重新开局'
                  : '走子被服务器拒绝';
        alert('走子失败：' + msg);
      }
      updateMPPanel();
    });

    // 双端局面比对
    this.socket.on('hash-check', ({ seq }) => {
      if (!activeGame || !activeGame.board) return;
      this.socket.emit('state-hash', { roomId: this.roomId, seq, hash: boardHash(activeGame.board) });
    });

    this.socket.on('state-mismatch', () => {
      if (!activeGame) return;
      activeGame.gameOver = true;
      activeGame.gameResult = '检测到双方局面不一致，对局终止';
      Sound.lose();
      updateUI();
      activeGame.render();
    });

    // 超时判负
    this.socket.on('flag-fall', ({ side }) => {
      if (!activeGame) return;
      activeGame.gameOver = true;
      const mySide = this.mySide;
      activeGame.gameResult = side === mySide ? '超时判负' : '对手超时，你获胜！';
      if (side === mySide) Sound.lose(); else Sound.win();
      updateUI();
      activeGame.render();
    });

    // 对手掉线 / 回来
    this.socket.on('opponent-offline', () => { this.offline = true; updateMPPanel(); });
    this.socket.on('opponent-reconnected', () => {
      this.offline = false;
      updateMPPanel();
    });

    this.socket.on('opponent-left', () => {
      this.roomId = null;
      this.mySide = null;
      this.oppSide = null;
      this.clock = null;
      this.offline = false;
      if (activeGame) {
        activeGame.multiplayer = false;
        activeGame.mySide = null;
        activeGame.opponentSide = null;
      }
      alert('对手已离开房间');
      updateMPPanel();
      updateUI();
    });

    this.socket.on('rematch-request', () => {
      if (confirm('对手请求再来一局，是否接受？')) {
        this.socket.emit('rematch-accept', { roomId: this.roomId });
      }
    });

    this.socket.on('opponent-resigned', () => {
      if (!activeGame) return;
      activeGame.gameOver = true;
      activeGame.gameResult = '对手认输，你获胜！';
      activeGame.statusDotClass = 'none';
      Sound.win();
      // 注意：这里**不能**清空 roomId —— 房间还在服务端留着，
      // 清空后「再来一局」按钮的显示条件 mp.roomId 不成立，就再也没法发起重赛了。
      updateMPPanel();
      activeGame.render();
      updateUI();
    });

    this.socket.on('draw-offer', () => {
      if (confirm('对手提议和棋，是否同意？')) {
        this.socket.emit('draw-accept', { roomId: this.roomId });
      }
    });

    this.socket.on('draw-agreed', () => {
      if (activeGame) {
        activeGame.gameOver = true;
        activeGame.gameResult = '和棋！双方协议和棋';
        Sound.draw();
        updateUI();
      }
    });

    this.socket.on('rematch-start', (p) => {
      this.seq = 0;
      this.offline = false;
      this.applyClock(p);
      if (activeGame) {
        activeGame.newGame();
        activeGame.multiplayer = true;
        activeGame.mySide = this.mySide;
        activeGame.opponentSide = this.mySide === p.hostSide ? p.joinerSide : p.hostSide;
        setGameTurn(activeGame, activeGameId, p.turn);
      }
      updateMPPanel();
      updateUI();
    });

    // 计时显示：本地每 250ms 刷新一次，不依赖服务端推送
    if (!this._ticker) {
      this._ticker = setInterval(() => { if (this.roomId && this.clock) renderClocks(); }, 250);
    }
  }

  applyClock(p) {
    if (!p) return;
    if (p.clock) this.clock = p.clock;
    if (p.turn) this.turn = p.turn;
    if (p.turnStartedAt) this.turnStartedAt = p.turnStartedAt;
    if (typeof p.seq === 'number') this.seq = p.seq;
  }

  /* ── 房间操作 ── */
  createRoom(gameType) {
    if (this.roomId) return;              // 防连点：已在房间里就不要再建一个，否则旧房间会被遗弃
    this.connect();
    this.gameType = gameType;
    this.socket.emit('create-room', { gameType, playerId: getPlayerId() }, (res) => {
      if (!res || res.error) { alert((res && res.error) || '创建失败'); return; }
      this.roomId = res.roomId;
      this.mySide = res.side;
      this.oppSide = null;
      this.seq = 0;
      updateMPPanel();
    });
  }

  joinRoom(roomId, gameType) {
    this.connect();
    this.gameType = gameType;
    this.socket.emit('join-room', { roomId: roomId.toUpperCase(), gameType, playerId: getPlayerId() }, (res) => {
      if (!res || res.error) { alert((res && res.error) || '加入失败'); return; }
      this.roomId = res.roomId;
      this.mySide = res.side;
      // 对手方由服务端下发，不再在客户端手写映射（原先对五子棋/围棋是错的）
      this.oppSide = res.opponentSide;
      this.applyClock(res);
      if (activeGame) {
        activeGame.multiplayer = true;
        activeGame.mySide = this.mySide;
        activeGame.opponentSide = this.oppSide;
        if (activeGame._calcSizes) { activeGame._calcSizes(); activeGame.render(); }
      }
      updateMPPanel();
      updateUI();
    });
  }

  /* ── 走子 ── */
  sendMove(moveData) {
    if (!this.roomId || !this.socket) return;
    this.seq += 1;
    this.socket.emit('move', { roomId: this.roomId, moveData, seq: this.seq });
  }

  sendPass() {
    if (!this.roomId || !this.socket) return;
    this.seq += 1;
    this.socket.emit('pass', { roomId: this.roomId, seq: this.seq });
  }

  sendResign() {
    if (!this.socket || !this.roomId) return;
    this.socket.emit('resign', { roomId: this.roomId });
  }

  requestRematch() {
    if (!this.roomId || !this.socket) return;
    const winner = activeGame && activeGame.gameOver && activeGame.getWinnerSide ? activeGame.getWinnerSide() : null;
    this.socket.emit('rematch-request', { roomId: this.roomId, winner });
  }

  offerDraw() {
    if (!this.roomId || !this.socket) return;
    this.socket.emit('draw-offer', { roomId: this.roomId });
    alert('和棋请求已发送，等待对手回复...');
  }

  leaveRoom() {
    if (!this.roomId) return;
    this.socket.emit('leave-room', { roomId: this.roomId });
    this.roomId = null;
    this.mySide = null;
    this.oppSide = null;
    this.clock = null;
    this.seq = 0;
    this.offline = false;
    if (activeGame) {
      activeGame.multiplayer = false;
      activeGame.mySide = null;
      activeGame.opponentSide = null;
    }
    updateMPPanel();
    updateUI();
  }
}

// 按「先手方」把游戏对象的回合设对（四个游戏的行棋方表示各不相同）
function setGameTurn(game, gameType, side) {
  if (!side) return;
  if (gameType === 'chinese-chess') game.currentTurn = side === 'red' ? 0 : 1;
  else if (gameType === 'chess') game.currentTurn = side === 'white' ? 0 : 1;
  else game.currentPlayer = side === 'black' ? 1 : 2;
}

const mp = new MultiplayerManager();

function getMPPanelHTML() {
  return `<div class="section-title">联机模式</div>
    <div class="mp-toggle" id="mpToggle">
      <button class="mp-btn active" data-mode="local">本地</button>
      <button class="mp-btn" data-mode="online">联机</button>
    </div>
    <div id="mpOnlinePanel" style="display:none;">
      <div class="mp-room-panel" id="mpRoomPanel"></div>
    </div>`;
}

function updateMPPanel() {
  const panel = document.getElementById('mpOnlinePanel');
  if (!panel) return;
  if (!multiplayerMode) { panel.style.display = 'none'; return; }
  panel.style.display = '';

  const rp = document.getElementById('mpRoomPanel');
  if (!mp.roomId) {
    rp.innerHTML = `
      <button class="btn primary" id="mpCreateBtn" style="width:100%">创建房间</button>
      <div class="mp-divider">── 或 ──</div>
      <input class="mp-input" id="mpJoinInput" placeholder="输入房间号" maxlength="6">
      <button class="btn" id="mpJoinBtn" style="width:100%">加入房间</button>`;
    document.getElementById('mpCreateBtn').onclick = () => mp.createRoom(activeGameId);
    document.getElementById('mpJoinBtn').onclick = () => {
      const val = document.getElementById('mpJoinInput').value.trim();
      if (val) mp.joinRoom(val, activeGameId);
    };
    return;
  }

  const isWaiting = mp.roomId && !(activeGame && activeGame.multiplayer);
  let statusText, statusCls;
  if (!mp.connected) { statusText = '连接已断开，正在重连…'; statusCls = 'waiting'; }
  else if (mp.offline) { statusText = '对手掉线，等待重连…'; statusCls = 'waiting'; }
  else if (isWaiting) { statusText = '等待对手加入…'; statusCls = 'waiting'; }
  else { statusText = '已连接 · 你是' + getMPSideLabel(mp.mySide, activeGameId); statusCls = 'connected'; }

  rp.innerHTML = `
    <div class="mp-room-code">${mp.roomId}</div>
    <div class="mp-status ${statusCls}">${statusText}</div>
    <div class="mp-clocks" id="mpClocks" style="display:none;">
      <div class="mp-clock" id="mpClockMine"><span class="mp-clock-label">我方</span><span class="mp-clock-time">--:--</span></div>
      <div class="mp-clock" id="mpClockOpp"><span class="mp-clock-label">对手</span><span class="mp-clock-time">--:--</span></div>
    </div>
    <button class="btn" id="mpLeaveBtn" style="width:100%">离开房间</button>`;
  document.getElementById('mpLeaveBtn').onclick = () => {
    mp.leaveRoom();
    if (activeGame) activeGame.newGame();
  };
  renderClocks();
}

// 本地倒计时：只对「当前该走的一方」扣时间
function renderClocks() {
  const box = document.getElementById('mpClocks');
  if (!box) return;
  if (!mp.clock || !mp.roomId || !mp.turn) { box.style.display = 'none'; return; }
  box.style.display = '';

  const now = Date.now();
  const elapsed = now - (mp.turnStartedAt || now);
  const remaining = (side) => {
    const base = mp.clock[side];
    if (base === undefined) return null;
    return mp.turn === side ? Math.max(0, base - elapsed) : base;
  };
  const myMs = remaining(mp.mySide);
  const oppMs = remaining(mp.oppSide);

  const mine = document.getElementById('mpClockMine');
  const opp = document.getElementById('mpClockOpp');
  if (mine) {
    mine.querySelector('.mp-clock-time').textContent = myMs === null ? '--:--' : fmtClock(myMs);
    mine.classList.toggle('active', mp.turn === mp.mySide);
    mine.classList.toggle('low', myMs !== null && myMs < 30000);
  }
  if (opp) {
    opp.querySelector('.mp-clock-time').textContent = oppMs === null ? '--:--' : fmtClock(oppMs);
    opp.classList.toggle('active', mp.turn === mp.oppSide);
    opp.classList.toggle('low', oppMs !== null && oppMs < 30000);
  }
}

function getMPSideLabel(side, gameType) {
  if (gameType === 'chinese-chess') return side === 'red' ? '红方' : '黑方';
  if (gameType === 'chess') return side === 'white' ? '白方' : '黑方';
  return side === 'black' ? '黑方' : '白方';
}
