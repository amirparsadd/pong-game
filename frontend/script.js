// Multiplayer client using socket.io
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const leftScoreEl = document.getElementById('left-score');
const rightScoreEl = document.getElementById('right-score');
const joinBtn = document.getElementById('join-queue');
const leaveBtn = document.getElementById('leave-queue');
const leaveMatchBtn = document.getElementById('leave-match');
const spectateListBtn = document.getElementById('spectate-list');
const cheerBtn = document.getElementById('cheer');
const queueCount = document.getElementById('queue-count');
const chatNameInput = document.getElementById('chat-name');
const chatClearNameBtn = document.getElementById('chat-clear-name');
const chatMessagesEl = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const chatSendBtn = document.getElementById('chat-send');

let W = canvas.width, H = canvas.height;
let socket = null;
let myRoom = null;
let mySide = null;
let isSpectator = false;
let currentState = null;
// let cursorEl = null;
let mouseX = -9999, mouseY = -9999;

function initSocket(){
  if(!window.io) return setTimeout(initSocket, 50);
  const backend = 'http://pongmp-backend-vwa5fd-0264ce-185-204-171-121.traefik.me';
  socket = io(backend);
  // attach shared handlers
  attachSocketEvents(socket);
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

// Leave the current match (if any) and reset state. We disconnect and reconnect the socket
// so the server cleans up any room associations. The backend URL is unchanged.
leaveMatchBtn.addEventListener('click', () => {
  if(!socket) return;
  // if currently in a room tell server we leave
  if(myRoom){
    try{ socket.emit('queue:leave'); }catch(e){}
    try{ socket.emit('spectate:leave'); }catch(e){}
  }
  // gracefully disconnect then recreate a new socket connection
  const backend = socket.io.uri || socket.io.engine.hostname || null;
  socket.disconnect();
  myRoom = null; mySide = null; isSpectator = false; currentState = null;
  joinBtn.disabled = false; leaveBtn.disabled = true; cheerBtn.disabled = true; leaveMatchBtn.disabled = true;
  setTimeout(()=>{ if(window.io){ socket = io(backend || 'http://localhost:3000'); attachSocketEvents(socket); } }, 200);
});

spectateListBtn.addEventListener('click', () => {
  if(!socket) return alert('Socket not ready yet');
  socket.emit('spectate');
});

cheerBtn.addEventListener('click', () => {
  if(!myRoom || !socket) return;
  socket.emit('cheer', { roomId: myRoom });
});

function showCheerToast(from){
  canvas.style.boxShadow = '0 0 24px 6px rgba(139,233,253,0.25)';
  setTimeout(()=> canvas.style.boxShadow = '', 600);
}

let keys = {};
window.addEventListener('keydown', e => { keys[e.key.toLowerCase()] = true; });
window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

function sendInput(){
  if(!myRoom || !mySide || !socket) return;
  let vy = 0;
  if(keys['w'] || keys['arrowup']) vy = -6;
  if(keys['s'] || keys['arrowdown']) vy = 6;
  // include clientTime to help server estimate latency and for client-side prediction
  socket.emit('paddle:set', { roomId: myRoom, vy, clientTime: Date.now() });
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
  ctx.fillStyle = '#8be9fd';
  const pL = currentState.paddles.left;
  const pR = currentState.paddles.right;
  roundRect(ctx, pL.x, pL.y, pL.w, pL.h, 6);
  roundRect(ctx, pR.x, pR.y, pR.w, pR.h, 6);
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(currentState.ball.x, currentState.ball.y, currentState.ball.r, 0, Math.PI*2); ctx.fill();
}

function loop(){ render(); requestAnimationFrame(loop); }
loop();

function resizeCanvas(){
  // Make canvas fill available space inside .container while keeping aspect ratio
  const container = document.querySelector('.container');
  const rect = container ? container.getBoundingClientRect() : { width: window.innerWidth };
  const maxW = Math.min(800, rect.width - 40);
  // compute available height: viewport height minus header/controls/chat heights
  const used = Array.from(document.querySelectorAll('.site-header, .scoreboard, .controls, .chat-panel, .hint')).reduce((acc, el)=>{
    if(!el) return acc; const r = el.getBoundingClientRect(); return acc + Math.ceil(r.height) + 8; }, 0);
  const availH = Math.max(200, window.innerHeight - used - 80);
  // maintain 16:10-ish layout close to original (800x500)
  const desiredW = Math.min(maxW, Math.round(availH * (800/500)));
  const desiredH = Math.round(desiredW * (500/800));
  canvas.style.width = desiredW + 'px';
  canvas.style.height = desiredH + 'px';
  W = canvas.width = desiredW;
  H = canvas.height = desiredH;
}
window.addEventListener('resize', resizeCanvas); resizeCanvas();

// prevent arrow keys from scrolling the page when not typing in an input
window.addEventListener('keydown', (e) => {
  const active = document.activeElement;
  const isInput = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA');
  if(!isInput && (e.key === 'ArrowUp' || e.key === 'ArrowDown')){
    e.preventDefault();
  }
}, { passive: false });

// --- Chat helpers and persistence ---
const CHAT_NAME_KEY = 'pong:chat:name';

function loadChatName(){
  try{ return localStorage.getItem(CHAT_NAME_KEY) || ''; }catch(e){ return ''; }
}
function saveChatName(n){ try{ localStorage.setItem(CHAT_NAME_KEY, n || ''); }catch(e){} }

function appendChatMessage({ fromId, name, message, ts }){
  if(!chatMessagesEl) return;
  const el = document.createElement('div');
  el.className = 'chat-msg';
  const time = ts ? new Date(ts) : new Date();
  const hh = String(time.getHours()).padStart(2,'0');
  const mm = String(time.getMinutes()).padStart(2,'0');
  el.innerHTML = `<span class="chat-time">[${hh}:${mm}]</span> <span class="chat-name">${escapeHtml(name||'Anon')}</span>: <span class="chat-text">${escapeHtml(message)}</span>`;
  chatMessagesEl.appendChild(el);
  // keep scroll pinned to bottom
  chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
}

function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"})[c]); }

function sendChat(){
  if(!socket) return alert('Socket not ready');
  const msg = (chatInput && chatInput.value || '').trim();
  if(!msg) return;
  const name = (chatNameInput && chatNameInput.value) || 'Anon';
  // persist name
  saveChatName(name);
  // if in a room, send to room; otherwise broadcast to server (no-room messages ignored server-side)
  const payload = { roomId: myRoom, name, message: msg };
  socket.emit('chat:send', payload);
  chatInput.value = '';
}

// populate name input from localStorage
if(chatNameInput){ chatNameInput.value = loadChatName(); }
if(chatSendBtn){ chatSendBtn.addEventListener('click', sendChat); }
if(chatInput){ chatInput.addEventListener('keydown', (e)=>{ if(e.key === 'Enter') sendChat(); }); }
if(chatClearNameBtn){ chatClearNameBtn.addEventListener('click', ()=>{ saveChatName(''); if(chatNameInput) chatNameInput.value=''; }); }

// // --- custom cursor ---
// (function createCursor(){
//   cursorEl = document.createElement('div');
//   cursorEl.className = 'cursor-follower';
//   // start off-screen
//   cursorEl.style.transform = 'translate3d(-9999px, -9999px, 0)';
//   document.body.appendChild(cursorEl);

//   // update latest mouse coords on mousemove (cheap)
//   document.addEventListener('mousemove', (e)=>{
//     mouseX = e.clientX;
//     mouseY = e.clientY;
//   }, { passive: true });

//   // apply transform in RAF (GPU accelerated) to avoid layout thrashing
//   (function tick(){
//     if(cursorEl){
//       // center the cursor element on the pointer using translate3d
//       // cursor size is 14px, so offset by 7 to center
//       const cx = Math.round(mouseX - 7);
//       const cy = Math.round(mouseY - 7);
//       cursorEl.style.transform = `translate3d(${cx}px, ${cy}px, 0)`;
//     }
//     requestAnimationFrame(tick);
//   })();
// })();

// Re-attach events to a socket (used after reconnect)
function attachSocketEvents(s){
  if(!s) return;
  s.on('connect', () => { console.log('connected', s.id); });
  s.on('welcome', d => console.log(d));
  s.on('queue:update', ({ waiting }) => { queueCount.textContent = `In queue: ${waiting}`; });
  s.on('spectate:list', (list) => {
    const pick = list[0];
    if(!pick) return alert('No active games to spectate');
    s.emit('spectate:join', { roomId: pick.id });
  });
  s.on('spectate:joined', ({ roomId }) => { myRoom = roomId; isSpectator = true; cheerBtn.disabled = false; leaveMatchBtn.disabled = false; });
  s.on('match:start', ({ roomId, side }) => { myRoom = roomId; mySide = side; isSpectator = false; cheerBtn.disabled = false; leaveMatchBtn.disabled = false; });
  s.on('state:update', (state) => { currentState = state; if(state.scores){ leftScoreEl.textContent = state.scores.left; rightScoreEl.textContent = state.scores.right; } });
  s.on('match:end', ({ reason }) => { alert('Match ended: ' + reason); myRoom = null; mySide = null; isSpectator = false; cheerBtn.disabled = true; leaveMatchBtn.disabled = true; });
  s.on('cheer', ({ from }) => { showCheerToast(from); });
  // chat messages from server
  s.on('chat:message', ({ fromId, name, message, ts }) => {
    appendChatMessage({ fromId, name, message, ts });
  });
}

// Enhance prediction on state updates
// We'll compute an estimated latency and adjust local currentState for rendering
const predictState = (state) => {
  if(!state) return state;
  const now = Date.now();
  const serverTime = state.serverTime || now;
  const estimatedRTT = Math.max(0, now - serverTime);
  const oneWay = estimatedRTT / 2;

  // shallow copy for local display/prediction
  const s = JSON.parse(JSON.stringify(state));

  // Predict paddles: assume current vy continues for oneWay ms
  ['left','right'].forEach(side => {
    if(s.paddles && s.paddles[side]){
      const p = s.paddles[side];
      // vy units are px per tick (server used ~60hz), convert to px per ms
      const pixelsPerMs = p.vy ? (p.vy * (60/1000)) : 0;
      p.y = p.y + pixelsPerMs * oneWay;
      // clamp
      p.y = Math.max(0, Math.min(500 - p.h, p.y));
    }
  });

  // Predict ball: simple linear predict using vx/vy
  if(s.ball){
    s.ball.x = s.ball.x + s.ball.vx * (oneWay/16.6667); // 16.666ms per tick approx
    s.ball.y = s.ball.y + s.ball.vy * (oneWay/16.6667);
  }

  return s;
};

// Override the state:update listener to include prediction
const originalAttach = attachSocketEvents;
// reassign the existing attachSocketEvents to a wrapper (use expression to avoid hoisting / TDZ)
attachSocketEvents = function(ioSocket){
  originalAttach(ioSocket);
  ioSocket.off('state:update');
  ioSocket.on('state:update', (state) => {
    // update scoreboard
    if(state.scores){ leftScoreEl.textContent = state.scores.left; rightScoreEl.textContent = state.scores.right; }
    // set currentState to predicted state for immediate render
    currentState = predictState(state);
  });
};
