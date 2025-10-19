const { app, server, io } = require('./app');
const { PORT } = require('./config');
const { attachSocketHandlers } = require('./socketHandlers');

// health
app.get('/_health', (req, res) => res.json({ ok: true }));

attachSocketHandlers(io);

server.listen(PORT, () => console.log(`Backend listening on ${PORT}`));
