const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname));

const PORT = process.env.PORT || 3000;

const rooms = new Map();

function generateRoomId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
  if (rooms.has(id)) return generateRoomId();
  return id;
}

const FIRST_MOVER = {
  'chinese-chess': 'red',
  'gomoku': 'black',
  'chess': 'white',
  'go': 'black',
};

io.on('connection', (socket) => {
  console.log(`[+] ${socket.id}`);

  socket.on('create-room', ({ gameType }, cb) => {
    if (!FIRST_MOVER[gameType]) return cb({ error: 'Invalid game type' });
    const roomId = generateRoomId();
    const room = {
      gameType,
      host: { socketId: socket.id, side: FIRST_MOVER[gameType] },
      joiner: null,
      status: 'waiting',
      createdAt: Date.now(),
    };
    rooms.set(roomId, room);
    socket.join(roomId);
    socket.data.roomId = roomId;
    console.log(`[room] ${roomId} created by ${socket.id} (${gameType})`);
    cb({ roomId, side: FIRST_MOVER[gameType] });
  });

  socket.on('join-room', ({ roomId, gameType }, cb) => {
    roomId = (roomId || '').toUpperCase();
    const room = rooms.get(roomId);
    if (!room) return cb({ error: '房间不存在' });
    if (room.joiner) return cb({ error: '房间已满' });
    if (room.gameType !== gameType) return cb({ error: '游戏类型不匹配' });

    const OPPOSITE = { red: 'black', black: 'red', white: 'black' };
    const joinerSide = OPPOSITE[room.host.side];

    room.joiner = { socketId: socket.id, side: joinerSide };
    room.status = 'playing';
    socket.join(roomId);
    socket.data.roomId = roomId;

    console.log(`[room] ${roomId} joined by ${socket.id} (side: ${joinerSide})`);

    cb({ roomId, side: joinerSide });
    socket.to(roomId).emit('game-start', { opponentSide: joinerSide });
  });

  socket.on('move', ({ roomId, moveData }) => {
    const room = rooms.get(roomId);
    if (!room || room.status !== 'playing') return;
    socket.to(roomId).emit('opponent-move', { moveData });
  });

  socket.on('pass', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room || room.status !== 'playing') return;
    socket.to(roomId).emit('opponent-pass');
  });

  function handleDisconnect() {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;

    if (room.host.socketId === socket.id || (room.joiner && room.joiner.socketId === socket.id)) {
      room.status = 'finished';
      socket.to(roomId).emit('opponent-left');
      rooms.delete(roomId);
      console.log(`[room] ${roomId} destroyed`);
    }
  }

  socket.on('leave-room', handleDisconnect);
  socket.on('disconnect', () => {
    console.log(`[-] ${socket.id}`);
    handleDisconnect();
  });
});

setInterval(() => {
  const now = Date.now();
  for (const [id, room] of rooms) {
    if (room.status === 'waiting' && now - room.createdAt > 300000) {
      rooms.delete(id);
      console.log(`[room] ${id} expired`);
    }
  }
}, 60000);

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
