// Multiplayer client using socket.io
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const leftScoreEl = document.getElementById('left-score');
const rightScoreEl = document.getElementById('right-score');
const joinBtn = document.getElementById('join-queue');
const leaveBtn = document.getElementById('leave-queue');
const spectateListBtn = document.getElementById('spectate-list');
const cheerBtn = document.getElementById('cheer');
const queueCount = document.getElementById('queue-count');

let W = canvas.width, H = canvas.height;

// defer socket initialization until the socket.io client script has loaded
let socket = null;
let myRoom = null;
let mySide = null; // 'left' or 'right' when playing
let isSpectator = false;
let currentState = null;


function initSocket(){
  if(!window.io) return setTimeout(initSocket, 50);
  // explicitly connect to the backend server (where server.js runs)
  socket = io('http://localhost:3000');
  socket.on('connect', () => { console.log('connected', socket.id); });
  socket.on('welcome', d => console.log(d));
  socket.on('queue:update', ({ waiting }) => { queueCount.textContent = `In queue: ${waiting}`; });

  // forward rest of handlers
  socket.on('spectate:list', (list) => {
    const pick = list[0];
    if(!pick) return alert('No active games to spectate');
    socket.emit('spectate:join', { roomId: pick.id });
  });
  socket.on('spectate:joined', ({ roomId }) => { myRoom = roomId; isSpectator = true; cheerBtn.disabled = false; });
  socket.on('match:start', ({ roomId, side }) => { myRoom = roomId; mySide = side; isSpectator = false; cheerBtn.disabled = false; });
  socket.on('state:update', (state) => { currentState = state; if(state.scores){ leftScoreEl.textContent = state.scores.left; rightScoreEl.textContent = state.scores.right; } });
  socket.on('match:end', ({ reason }) => { alert('Match ended: ' + reason); myRoom = null; mySide = null; isSpectator = false; cheerBtn.disabled = true; });
  socket.on('cheer', ({ from }) => { showCheerToast(from); });
}
initSocket();

joinBtn.addEventListener('click', () => {
  if(!socket) return alert('Socket not ready yet');
  socket.emit('queue:join');
  joinBtn.disabled = true; leaveBtn.disabled = false;
});
leaveBtn.addEventListener('click', () => {
  if(!socket) return;
  socket.emit('queue:leave');
  joinBtn.disabled = false; leaveBtn.disabled = true;
});

spectateListBtn.addEventListener('click', () => {
  if(!socket) return alert('Socket not ready yet');
  socket.emit('spectate');
});

socket.on('spectate:list', (list) => {
  const pick = list[0];
  if(!pick) return alert('No active games to spectate');
  socket.emit('spectate:join', { roomId: pick.id });
});

socket.on('spectate:joined', ({ roomId }) => {
  myRoom = roomId; isSpectator = true; cheerBtn.disabled = false;
});

socket.on('match:start', ({ roomId, side }) => {
  myRoom = roomId; mySide = side; isSpectator = false; cheerBtn.disabled = false;
  // enable input for player
});

socket.on('state:update', (state) => {
  currentState = state;
  // update scores
  if(state.scores){
    leftScoreEl.textContent = state.scores.left;
    rightScoreEl.textContent = state.scores.right;
  }
});

socket.on('match:end', ({ reason }) => {
  alert('Match ended: ' + reason);
  myRoom = null; mySide = null; isSpectator = false; cheerBtn.disabled = true;
});

socket.on('cheer', ({ from }) => {
  // small visual feedback
  showCheerToast(from);
});


cheerBtn.addEventListener('click', () => {
  if(!myRoom || !socket) return;
  socket.emit('cheer', { roomId: myRoom });
});

function showCheerToast(from){
  // simple flashing border
  canvas.style.boxShadow = '0 0 24px 6px rgba(139,233,253,0.25)';
  setTimeout(()=> canvas.style.boxShadow = '', 600);
}

// input handling - send vy to server while in match
let keys = {};
window.addEventListener('keydown', e => { keys[e.key.toLowerCase()] = true; });
window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

function sendInput(){
  if(!myRoom || !mySide) return;
  let vy = 0;
  if(keys['w'] || keys['arrowup']) vy = -6;
  if(keys['s'] || keys['arrowdown']) vy = 6;
  socket.emit('paddle:set', { roomId: myRoom, vy });
}
setInterval(sendInput, 1000/30);

function drawNet(){
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  const step = 20;
  for(let y=0;y<H;y+=step){ ctx.fillRect(W/2-1, y+6, 2, 12); }
}

function roundRect(ctx, x, y, w, h, r){
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.arcTo(x+w, y, x+w, y+h, r);
  ctx.arcTo(x+w, y+h, x, y+h, r);
  ctx.arcTo(x, y+h, x, y, r);
  ctx.arcTo(x, y, x+w, y, r);
  ctx.closePath();
  ctx.fill();
}

function render(){
  ctx.clearRect(0,0,W,H);
  ctx.fillStyle = '#041428'; ctx.fillRect(0,0,W,H);
  drawNet();
  if(!currentState) return;
  // paddles
  ctx.fillStyle = '#8be9fd';
  const pL = currentState.paddles.left;
  const pR = currentState.paddles.right;
  roundRect(ctx, pL.x, pL.y, pL.w, pL.h, 6);
  roundRect(ctx, pR.x, pR.y, pR.w, pR.h, 6);
  // ball
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(currentState.ball.x, currentState.ball.y, currentState.ball.r, 0, Math.PI*2); ctx.fill();
}

function loop(){ render(); requestAnimationFrame(loop); }
loop();

// responsive
function resizeCanvas(){ W = canvas.width = 800; H = canvas.height = 500; }
window.addEventListener('resize', resizeCanvas); resizeCanvas();
