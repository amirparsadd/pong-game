Pong vs AI

Quick local pong game implemented with HTML5 canvas and vanilla JS.

How to run


Install dependencies and run the Node.js server which serves the game and handles multiplayer:

npm install
npm start

Then open http://localhost:3000 in your browser.


Controls

- W / S or Up / Down arrows to move when you're in a match.
- Buttons:
	- Join Queue: join match queue as a player.
	- Leave Queue: cancel joining.
	- Spectate: join an active game as a spectator (watch only).
	- Cheer: available to spectators and queued users to cheer; shows a visual effect in the match.

Notes

Notes

- Matches start automatically when two players join the queue. The server runs the authoritative game loop and broadcasts state to players and spectators.
- Spectators can watch an active match and press Cheer to send a short celebration effect.
- If a player disconnects the match ends.

If you'd like, I can:

- Replace alert() messages with an in-canvas HUD.
- Add sounds for paddle hits and cheers.
- Add a proper lobby UI for picking which match to spectate.
