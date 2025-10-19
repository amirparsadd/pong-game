const { app, server, io } = require('./app');
const { PORT } = require('./config');
const { attachSocketHandlers } = require('./socketHandlers');
const { getActiveGames } = require('./socketHandlers');
const crypto = require('crypto');

// health
app.get('/_health', (req, res) => res.json({ ok: true }));

attachSocketHandlers(io);

// Lightweight polling endpoint for active games.
// Returns compact JSON and supports ETag/If-None-Match to allow clients to receive 304 and save bandwidth.
app.get('/api/active-games', (req, res) => {
	try{
		const list = getActiveGames();
		// prepare minimal payload string
		const payload = JSON.stringify(list);
		const etag = crypto.createHash('md5').update(payload).digest('hex');
		res.setHeader('ETag', etag);
		res.setHeader('Cache-Control', 'no-cache');
		if(req.headers['if-none-match'] === etag){
			return res.status(304).end();
		}
		res.json(list);
	}catch(err){
		res.status(500).json({ error: 'server-error' });
	}
});

server.listen(PORT, () => console.log(`Backend listening on ${PORT}`));
