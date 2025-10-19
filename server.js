const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
// allow cross-origin connections from dev servers (Live Server) and other origins
// allow cross-origin requests so pages served from other origins (eg Live Server :5500)
// can connect during development
// For development allow any origin (use stricter config in production)
const io = new Server(server, {
  cors: {
    origin: true,
    methods: ["GET", "POST"],
    credentials: true
  }
});

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname)));

// Simple matchmaking: queue players, when two available create a room
let waiting = [];
let rooms = {}; // roomId -> room state

function createRoom(p1Socket, p2Socket){
  const roomId = `room-${Date.now()}-${Math.floor(Math.random()*1000)}`;
  const room = {
    id: roomId,
    players: [p1Socket.id, p2Socket.id],
    spectators: [],
    state: createInitialState()
  };

  rooms[roomId] = room;

  p1Socket.join(roomId);
  p2Socket.join(roomId);

  p1Socket.emit('match:start', { roomId, side: 'left' });
  p2Socket.emit('match:start', { roomId, side: 'right' });

  // Notify spectators queue changed
  io.emit('queue:update', { waiting: waiting.length });

  // start authoritative loop
  startRoomLoop(roomId);
}

function createInitialState(){
  const W = 800, H = 500;
  return {
    W, H,
    paddles: {
      left: { x: 18, y: H/2 - 45, w: 12, h: 90, vy: 0 },
      right: { x: W - 18 - 12, y: H/2 - 45, w: 12, h: 90, vy: 0 }
    },
    ball: { x: W/2, y: H/2, vx: 5 * (Math.random()>0.5?1:-1), vy: 3 * (Math.random()>0.5?1:-1), r: 8 },
    scores: { left: 0, right: 0 },
    running: true
  };
}

function startRoomLoop(roomId){
  const room = rooms[roomId];
  if(!room) return;
  const tickRate = 1000/60; // 60Hz

  room.interval = setInterval(()=>{
    stepRoom(room);
    // broadcast limited state to room (players + spectators)
    io.to(roomId).emit('state:update', {
      paddles: room.state.paddles,
      ball: room.state.ball,
      scores: room.state.scores
    });
  }, tickRate);
}

function stopRoomLoop(roomId){
  const room = rooms[roomId];
  if(room && room.interval) clearInterval(room.interval);
}

function stepRoom(room){
  const s = room.state;
  const W = s.W, H = s.H;

  // update paddles from vy
  ['left','right'].forEach(side => {
    const p = s.paddles[side];
    p.y += p.vy;
    p.y = Math.max(0, Math.min(H - p.h, p.y));
  });

  // ball physics
  s.ball.x += s.ball.vx;
  s.ball.y += s.ball.vy;

  // wall
  if(s.ball.y - s.ball.r < 0){ s.ball.y = s.ball.r; s.ball.vy *= -1; }
  if(s.ball.y + s.ball.r > H){ s.ball.y = H - s.ball.r; s.ball.vy *= -1; }

  // paddle collisions
  // left
  if(s.ball.x - s.ball.r < s.paddles.left.x + s.paddles.left.w){
    const p = s.paddles.left;
    if(s.ball.y > p.y && s.ball.y < p.y + p.h){
      s.ball.x = p.x + p.w + s.ball.r;
      reflectBallFromPaddle(s, p, 'right');
    }
  }
  // right
  if(s.ball.x + s.ball.r > s.paddles.right.x){
    const p = s.paddles.right;
    if(s.ball.y > p.y && s.ball.y < p.y + p.h){
      s.ball.x = p.x - s.ball.r;
      reflectBallFromPaddle(s, p, 'left');
    }
  }

  // scoring
  if(s.ball.x + s.ball.r < 0){
    s.scores.right += 1;
    s.ball = { x: W/2, y: H/2, vx: 5, vy: 3, r: 8 };
  }
  if(s.ball.x - s.ball.r > W){
    s.scores.left += 1;
    s.ball = { x: W/2, y: H/2, vx: -5, vy: 3, r: 8 };
  }
}

function reflectBallFromPaddle(state, paddle, awayDir){
  const relativeY = (state.ball.y - (paddle.y + paddle.h/2)) / (paddle.h/2);
  const bounceAngle = relativeY * (Math.PI/3);
  const speed = Math.min(12, Math.hypot(state.ball.vx, state.ball.vy) + 0.5);
  const dir = awayDir === 'left' ? -1 : 1;
  state.ball.vx = speed * Math.cos(bounceAngle) * dir;
  state.ball.vy = speed * Math.sin(bounceAngle);
}

io.on('connection', (socket) => {
  console.log('conn', socket.id);

  socket.emit('welcome', { message: 'Welcome', id: socket.id });

  socket.on('queue:join', () => {
    // if already waiting ignore
    if(waiting.includes(socket)) return;
    waiting.push(socket);
    socket.emit('queue:status', { waiting: waiting.length });
    io.emit('queue:update', { waiting: waiting.length });

    // if we have at least two, match them
    if(waiting.length >= 2){
      const p1 = waiting.shift();
      const p2 = waiting.shift();
      createRoom(p1, p2);
    }
  });

  socket.on('queue:leave', () => {
    waiting = waiting.filter(s => s !== socket);
    io.emit('queue:update', { waiting: waiting.length });
  });

  socket.on('spectate', (cb) => {
    // return list of active rooms
    const list = Object.values(rooms).map(r => ({ id: r.id, players: r.players.length }));
    socket.emit('spectate:list', list);
  });

  socket.on('spectate:join', ({ roomId }) => {
    const room = rooms[roomId];
    if(!room) return socket.emit('error', 'no-room');
    room.spectators.push(socket.id);
    socket.join(roomId);
    socket.emit('spectate:joined', { roomId });
  });

  socket.on('paddle:set', ({ roomId, side, vy }) => {
    const room = rooms[roomId];
    if(!room) return;
    // only allow the two players to control paddles
    if(room.players.includes(socket.id)){
      const sideName = room.players[0] === socket.id ? 'left' : 'right';
      const p = room.state.paddles[sideName];
      p.vy = vy; // server authoritative
    }
  });

  socket.on('cheer', ({ roomId }) => {
    const room = rooms[roomId];
    if(!room) return;
    // broadcast a small celebration to room
    io.to(roomId).emit('cheer', { from: socket.id });
  });

  socket.on('disconnect', () => {
    // remove from waiting
    waiting = waiting.filter(s => s !== socket);
    io.emit('queue:update', { waiting: waiting.length });

    // remove from any room
    for(const rid in rooms){
      const room = rooms[rid];
      if(room.players.includes(socket.id) || room.spectators.includes(socket.id)){
        // if a player left, end the room
        stopRoomLoop(rid);
        io.to(rid).emit('match:end', { reason: 'player-left' });
        delete rooms[rid];
      }
    }
  });
});

server.listen(PORT, () => console.log(`Server listening on ${PORT}`));
