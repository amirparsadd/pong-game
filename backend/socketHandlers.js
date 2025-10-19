// Socket.IO handlers extracted from original server.js
const createInitialState = () => {
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
};

let waiting = [];
let rooms = {};

function reflectBallFromPaddle(state, paddle, awayDir){
  const relativeY = (state.ball.y - (paddle.y + paddle.h/2)) / (paddle.h/2);
  const bounceAngle = relativeY * (Math.PI/3);
  const speed = Math.min(12, Math.hypot(state.ball.vx, state.ball.vy) + 0.5);
  const dir = awayDir === 'left' ? -1 : 1;
  state.ball.vx = speed * Math.cos(bounceAngle) * dir;
  state.ball.vy = speed * Math.sin(bounceAngle);
}

function createRoom(io, p1Socket, p2Socket){
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
  io.emit('queue:update', { waiting: waiting.length });
  startRoomLoop(io, roomId);
}

function startRoomLoop(io, roomId){
  const room = rooms[roomId];
  if(!room) return;
  const tickRate = 1000/60;
  room.interval = setInterval(()=>{
    stepRoom(room);
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
  ['left','right'].forEach(side => {
    const p = s.paddles[side];
    p.y += p.vy;
    p.y = Math.max(0, Math.min(H - p.h, p.y));
  });
  s.ball.x += s.ball.vx;
  s.ball.y += s.ball.vy;
  if(s.ball.y - s.ball.r < 0){ s.ball.y = s.ball.r; s.ball.vy *= -1; }
  if(s.ball.y + s.ball.r > H){ s.ball.y = H - s.ball.r; s.ball.vy *= -1; }
  if(s.ball.x - s.ball.r < s.paddles.left.x + s.paddles.left.w){
    const p = s.paddles.left;
    if(s.ball.y > p.y && s.ball.y < p.y + p.h){
      s.ball.x = p.x + p.w + s.ball.r;
      reflectBallFromPaddle(s, p, 'right');
    }
  }
  if(s.ball.x + s.ball.r > s.paddles.right.x){
    const p = s.paddles.right;
    if(s.ball.y > p.y && s.ball.y < p.y + p.h){
      s.ball.x = p.x - s.ball.r;
      reflectBallFromPaddle(s, p, 'left');
    }
  }
  if(s.ball.x + s.ball.r < 0){
    s.scores.right += 1;
    s.ball = { x: W/2, y: H/2, vx: 5, vy: 3, r: 8 };
  }
  if(s.ball.x - s.ball.r > W){
    s.scores.left += 1;
    s.ball = { x: W/2, y: H/2, vx: -5, vy: 3, r: 8 };
  }
}

function attachSocketHandlers(io){
  io.on('connection', (socket) => {
    console.log('conn', socket.id);
    socket.emit('welcome', { message: 'Welcome', id: socket.id });

    socket.on('queue:join', () => {
      if(waiting.includes(socket)) return;
      waiting.push(socket);
      socket.emit('queue:status', { waiting: waiting.length });
      io.emit('queue:update', { waiting: waiting.length });
      if(waiting.length >= 2){
        const p1 = waiting.shift();
        const p2 = waiting.shift();
        createRoom(io, p1, p2);
      }
    });

    socket.on('queue:leave', () => {
      waiting = waiting.filter(s => s !== socket);
      io.emit('queue:update', { waiting: waiting.length });
    });

    socket.on('spectate', () => {
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

    socket.on('paddle:set', ({ roomId, vy }) => {
      const room = rooms[roomId];
      if(!room) return;
      if(room.players.includes(socket.id)){
        const sideName = room.players[0] === socket.id ? 'left' : 'right';
        const p = room.state.paddles[sideName];
        p.vy = vy;
      }
    });

    socket.on('cheer', ({ roomId }) => {
      const room = rooms[roomId];
      if(!room) return;
      io.to(roomId).emit('cheer', { from: socket.id });
    });

    socket.on('disconnect', () => {
      waiting = waiting.filter(s => s !== socket);
      io.emit('queue:update', { waiting: waiting.length });
      for(const rid in rooms){
        const room = rooms[rid];
        if(room.players.includes(socket.id) || room.spectators.includes(socket.id)){
          stopRoomLoop(rid);
          io.to(rid).emit('match:end', { reason: 'player-left' });
          delete rooms[rid];
        }
      }
    });
  });
}

module.exports = { attachSocketHandlers };
