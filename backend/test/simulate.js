const io = require('socket.io-client');
const URL = process.env.BACKEND_URL || 'http://localhost:3000';

const c1 = io(URL);
const c2 = io(URL);

c1.on('connect', () => { console.log('c1 connected', c1.id); c1.emit('queue:join'); });
c2.on('connect', () => { console.log('c2 connected', c2.id); c2.emit('queue:join'); });

c1.on('match:start', d => console.log('c1 match:start', d));
c2.on('match:start', d => console.log('c2 match:start', d));

c1.on('state:update', s => console.log('c1 state update', Object.keys(s)));
c2.on('state:update', s => console.log('c2 state update', Object.keys(s)));

c1.on('cheer', c => console.log('c1 cheer', c));
c2.on('cheer', c => console.log('c2 cheer', c));

setTimeout(()=>{ c1.close(); c2.close(); process.exit(0); }, 5000);
