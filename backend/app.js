const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { PORT, CORS_ORIGIN } = require('./config');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: CORS_ORIGIN,
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Optionally serve frontend build when running in production or when build dir is set
if(process.env.FRONTEND_BUILD_DIR){
  const buildPath = path.resolve(process.env.FRONTEND_BUILD_DIR);
  app.use(express.static(buildPath));
}

module.exports = { app, server, io };
