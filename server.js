const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { Server } = require('socket.io');

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer);

// ── 只托管 public/ ────────────────────────────────────────────────
// 原实现是 express.static(__dirname)，把整个项目目录挂到公网 ——
// server.js 源码、package-lock.json、node_modules 依赖树、.git 全部可下载。
// 改为只托管 public/ 后，上述内容都在 public 之外，一律 404。
const PUBLIC_DIR = path.join(__dirname, 'public');
if (!fs.existsSync(PUBLIC_DIR)) {
  console.error('[FATAL] 找不到 public/ 目录。请确认前端文件已放在 ' + PUBLIC_DIR);
  process.exit(1);
}
app.use(express.static(PUBLIC_DIR));

const PORT = process.env.PORT || 3000;

/* ── 可调参数 ── */
const WAITING_TTL_MS   = 5 * 60 * 1000;   // 等待中的房间多久回收
const FINISHED_TTL_MS  = 10 * 60 * 1000;  // 已结束的房间多久回收
const RECONNECT_MS     = 30 * 1000;       // 断线重连宽限期
const TURN_MS          = 10 * 60 * 1000;  // 每方基础用时（10 分钟包干）
const MAX_ROOMS        = 1000;            // 全服房间上限
const MAX_ROOMS_PER_IP = 5;               // 单 IP 建房上限

const rooms = new Map();       // roomId -> room
const roomsByIp = new Map();   // ip -> 已建房数

const FIRST_MOVER = {
  'chinese-chess': 'red',
  'gomoku': 'black',
  'chess': 'white',
  'go': 'black',
};
// 对手方。必须按棋种区分：中国象棋是「红/黑」，其余三种是「黑/白」。
// 原先用一张固定的 { red:'black', black:'red', white:'black' } 表，
// 导致五子棋/围棋的加入者被判成 'red' 而不是 'white'（显示层碰巧蒙对，语义是错的）。
function oppositeSide(side, gameType) {
  if (gameType === 'chinese-chess') return side === 'red' ? 'black' : 'red';
  return side === 'black' ? 'white' : 'black';
}

function generateRoomId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
  if (rooms.has(id)) return generateRoomId();
  return id;
}

function memberOf(room, socketId) {
  if (room.host && room.host.socketId === socketId) return 'host';
  if (room.joiner && room.joiner.socketId === socketId) return 'joiner';
  return null;
}

function otherSideOf(room, side) {
  return side === room.host.side ? room.joiner.side : room.host.side;
}

function resetClocks(room) {
  room.clock = {};
  room.clock[room.host.side] = TURN_MS;
  room.clock[room.joiner.side] = TURN_MS;
  room.turnStartedAt = Date.now();
}

function clockPayload(room) {
  return {
    clock: room.clock,
    turn: room.turn,
    turnStartedAt: room.turnStartedAt,
    seq: room.seq,
  };
}

// 扣掉本回合已用时间；返回 true 表示该方已超时
function consumeClock(room, side) {
  const now = Date.now();
  const elapsed = now - room.turnStartedAt;
  if (room.clock[side] - elapsed <= 0) {
    room.clock[side] = 0;
    return true;
  }
  room.clock[side] -= elapsed;
  room.turnStartedAt = now;
  return false;
}

// 销毁房间 —— 必须同时归还该 IP 的建房配额，
// 否则 roomsByIp 只增不减，同一 IP 建满 MAX_ROOMS_PER_IP 次后永久无法再建房。
function destroyRoom(roomId, reason) {
  const room = rooms.get(roomId);
  if (!room) return;
  if (room.graceTimer) { clearTimeout(room.graceTimer); room.graceTimer = null; }
  rooms.delete(roomId);
  if (room.ip) {
    const n = (roomsByIp.get(room.ip) || 1) - 1;
    if (n > 0) roomsByIp.set(room.ip, n); else roomsByIp.delete(room.ip);
  }
  if (reason) console.log(`[room] ${roomId} destroyed (${reason})`);
}

io.on('connection', (socket) => {
  console.log(`[+] ${socket.id}`);

  /* ── 建房 ── */
  socket.on('create-room', ({ gameType, playerId }, cb) => {
    cb = cb || function () {};
    if (!FIRST_MOVER[gameType]) return cb({ error: 'Invalid game type' });

    const ip = (socket.handshake.address || '').replace(/^::ffff:/, '');
    const mine = roomsByIp.get(ip) || 0;
    if (rooms.size >= MAX_ROOMS) return cb({ error: '服务器繁忙，请稍后再试' });
    if (mine >= MAX_ROOMS_PER_IP) return cb({ error: '创建房间过于频繁，请稍后再试' });
    roomsByIp.set(ip, mine + 1);

    const roomId = generateRoomId();
    const room = {
      gameType,
      ip,
      host: { socketId: socket.id, side: FIRST_MOVER[gameType], playerId: playerId || socket.id },
      joiner: null,
      status: 'waiting',
      createdAt: Date.now(),
      turn: FIRST_MOVER[gameType],
      seq: 0,
      lastWinner: null,
      clock: null,
      turnStartedAt: 0,
      hashes: null,
      disconnected: null,
      graceTimer: null,
    };
    rooms.set(roomId, room);
    socket.join(roomId);
    socket.data.roomId = roomId;
    console.log(`[room] ${roomId} created by ${socket.id} (${gameType})`);
    cb({ roomId, side: room.host.side });
  });

  /* ── 加入 ── */
  socket.on('join-room', ({ roomId, gameType, playerId }, cb) => {
    cb = cb || function () {};
    roomId = (roomId || '').toUpperCase();
    const room = rooms.get(roomId);
    if (!room) return cb({ error: '房间不存在' });
    if (room.joiner) return cb({ error: '房间已满' });
    if (room.gameType !== gameType) return cb({ error: '游戏类型不匹配' });

    const joinerSide = oppositeSide(room.host.side, room.gameType);
    room.joiner = { socketId: socket.id, side: joinerSide, playerId: playerId || socket.id };
    room.status = 'playing';
    room.turn = room.host.side;      // 由先手方开局
    room.seq = 0;
    room.hashes = null;
    resetClocks(room);

    socket.join(roomId);
    socket.data.roomId = roomId;
    console.log(`[room] ${roomId} joined by ${socket.id} (side: ${joinerSide})`);

    // 直接把对手方一并返回，避免客户端再自己推算（原先客户端手写的映射对五子棋/围棋是错的）
    cb(Object.assign({ roomId, side: joinerSide, opponentSide: room.host.side }, clockPayload(room)));
    socket.to(roomId).emit('game-start', Object.assign({ opponentSide: joinerSide }, clockPayload(room)));
  });

  /* ── 断线重连：凭 roomId + playerId 恢复席位 ── */
  socket.on('rejoin-room', ({ roomId, playerId }, cb) => {
    cb = cb || function () {};
    roomId = (roomId || '').toUpperCase();
    const room = rooms.get(roomId);
    if (!room) return cb({ error: '房间已不存在' });

    let who = null;
    if (room.host.playerId === playerId) who = 'host';
    else if (room.joiner && room.joiner.playerId === playerId) who = 'joiner';
    if (!who) return cb({ error: '无法恢复该房间' });

    if (room.graceTimer) { clearTimeout(room.graceTimer); room.graceTimer = null; }
    room.disconnected = null;

    room[who].socketId = socket.id;
    socket.join(roomId);
    socket.data.roomId = roomId;

    const mySide = room[who].side;
    const oppSide = who === 'host' ? room.joiner.side : room.host.side;
    console.log(`[room] ${roomId} rejoined by ${socket.id} (${who})`);

    socket.to(roomId).emit('opponent-reconnected');
    cb(Object.assign({
      ok: true,
      roomId,
      side: mySide,
      opponentSide: oppSide,
      gameType: room.gameType,
      status: room.status,
    }, clockPayload(room)));
  });

  /* ── 走子：服务端校验归属 / 回合 / 序号 / 用时 ── */
  socket.on('move', ({ roomId, moveData, seq }) => {
    const room = rooms.get(roomId);
    if (!room || room.status !== 'playing') return;

    const who = memberOf(room, socket.id);
    if (!who) return;                                     // 非房间成员

    const mySide = room[who].side;
    if (mySide !== room.turn) {                           // 不是你的回合
      socket.emit('move-rejected', { reason: 'not-your-turn', expect: room.turn });
      return;
    }
    if (seq !== room.seq + 1) {                           // 序号不连续（重放 / 跳号）
      socket.emit('move-rejected', { reason: 'bad-seq', expect: room.seq + 1 });
      return;
    }
    if (consumeClock(room, mySide)) {                     // 超时
      room.status = 'finished';
      io.to(roomId).emit('flag-fall', { side: mySide });
      return;
    }

    room.seq = seq;
    room.turn = otherSideOf(room, mySide);
    room.hashes = null;

    socket.to(roomId).emit('opponent-move', { moveData, seq });
    socket.emit('move-ack', { seq, clock: room.clock, turn: room.turn, turnStartedAt: room.turnStartedAt });
    socket.to(roomId).emit('move-ack', { seq, clock: room.clock, turn: room.turn, turnStartedAt: room.turnStartedAt });

    // 双端局面指纹比对（防作弊 L2）
    io.to(roomId).emit('hash-check', { seq: room.seq });
  });

  /* ── 停着（围棋）── */
  socket.on('pass', ({ roomId, seq }) => {
    const room = rooms.get(roomId);
    if (!room || room.status !== 'playing') return;
    const who = memberOf(room, socket.id);
    if (!who) return;
    const mySide = room[who].side;
    if (mySide !== room.turn) {
      socket.emit('move-rejected', { reason: 'not-your-turn' });
      return;
    }
    if (seq !== room.seq + 1) {
      socket.emit('move-rejected', { reason: 'bad-seq' });
      return;
    }
    if (consumeClock(room, mySide)) {
      room.status = 'finished';
      io.to(roomId).emit('flag-fall', { side: mySide });
      return;
    }
    room.seq = seq;
    room.turn = otherSideOf(room, mySide);
    room.hashes = null;
    socket.to(roomId).emit('opponent-pass');
    io.to(roomId).emit('move-ack', { seq, clock: room.clock, turn: room.turn, turnStartedAt: room.turnStartedAt });
  });

  /* ── 局面指纹比对 ── */
  socket.on('state-hash', ({ roomId, seq, hash }) => {
    const room = rooms.get(roomId);
    if (!room || seq !== room.seq) return;
    const who = memberOf(room, socket.id);
    if (!who) return;
    if (!room.hashes) room.hashes = {};
    room.hashes[who] = hash;
    if (room.hashes.host && room.hashes.joiner && room.hashes.host !== room.hashes.joiner) {
      room.status = 'finished';
      console.warn(`[room] ${roomId} state mismatch at seq ${seq}`);
      io.to(roomId).emit('state-mismatch', { seq });
    }
  });

  /* ── 认输 ── */
  socket.on('resign', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room || room.status !== 'playing') return;
    if (!memberOf(room, socket.id)) return;
    room.status = 'finished';
    socket.to(roomId).emit('opponent-resigned');
  });

  /* ── 和棋 ── */
  socket.on('draw-offer', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room || room.status !== 'playing') return;
    if (!memberOf(room, socket.id)) return;
    socket.to(roomId).emit('draw-offer');
  });

  socket.on('draw-accept', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room || room.status !== 'playing') return;
    if (!memberOf(room, socket.id)) return;
    room.status = 'finished';
    socket.to(roomId).emit('draw-agreed');
    socket.emit('draw-agreed');
  });

  /* ── 再来一局 ── */
  socket.on('rematch-request', ({ roomId, winner }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    if (!memberOf(room, socket.id)) return;
    room.lastWinner = winner;
    socket.to(roomId).emit('rematch-request', { winner });
  });

  socket.on('rematch-accept', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    if (!memberOf(room, socket.id)) return;
    if (!room.joiner) return;

    // 赢家先手：把赢家换到 host 位
    if (room.lastWinner) {
      const tmp = room.host;
      room.host = room.joiner;
      room.joiner = tmp;
    }
    room.lastWinner = null;
    room.status = 'playing';
    room.turn = room.host.side;      // 由赢家（现 host）先行
    room.seq = 0;
    room.hashes = null;
    resetClocks(room);

    const payload = Object.assign({
      hostSide: room.host.side,
      joinerSide: room.joiner.side,
    }, clockPayload(room));
    io.to(roomId).emit('rematch-start', payload);
  });

  /* ── 离开 / 断线 ── */
  function handleLeave(immediate) {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;
    const who = memberOf(room, socket.id);
    if (!who) return;

    socket.data.roomId = null;

    // 对局进行中且是主动断线 → 给宽限期等重连，不立刻销毁
    if (!immediate && room.status === 'playing' && room.joiner) {
      room.disconnected = who;
      room.disconnectedAt = Date.now();
      socket.to(roomId).emit('opponent-offline', { graceMs: RECONNECT_MS });
      if (room.graceTimer) clearTimeout(room.graceTimer);
      room.graceTimer = setTimeout(() => {
        const r = rooms.get(roomId);
        if (r && r.disconnected) {
          r.status = 'finished';
          io.to(roomId).emit('opponent-left');
          destroyRoom(roomId, 'reconnect timeout');
        }
      }, RECONNECT_MS);
      console.log(`[room] ${roomId} ${who} disconnected, grace ${RECONNECT_MS}ms`);
      return;
    }

    room.status = 'finished';
    socket.to(roomId).emit('opponent-left');
    destroyRoom(roomId, immediate ? 'left' : 'disconnected');
  }

  socket.on('leave-room', () => handleLeave(true));   // 主动离开：立即销毁
  socket.on('disconnect', () => {
    console.log(`[-] ${socket.id}`);
    handleLeave(false);
  });
});

/* ── 定期清理 ── */
setInterval(() => {
  const now = Date.now();
  for (const [id, room] of rooms) {
    // 等待中的房间：无人加入
    if (room.status === 'waiting' && now - room.createdAt > WAITING_TTL_MS) {
      destroyRoom(id, 'waiting expired');
      continue;
    }
    if (room.status !== 'finished') continue;
    // 已结束的房间：双方都不主动离开的话会一直留着（原先只清 waiting，会内存泄漏）。
    // 首次看到时打上结束时间戳，之后按 TTL 回收。
    if (!room.finishedAt) { room.finishedAt = now; continue; }
    if (now - room.finishedAt > FINISHED_TTL_MS) {
      destroyRoom(id, 'finished expired');
    }
  }
}, 60000);

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`  turn limit: ${TURN_MS / 1000}s   reconnect grace: ${RECONNECT_MS / 1000}s`);
});
