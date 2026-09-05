import { WebSocketServer, WebSocket } from 'ws';
import { wsHub } from './ws/hub';
import dotenv from 'dotenv';

dotenv.config();

const port = parseInt(process.env.WS_PORT || '3001', 10);
const wss = new WebSocketServer({ port });

wsHub.registerServer(wss);

console.log(`[AeroCut Telemetry WS] Listening on ws://localhost:${port}`);

// 30-second heartbeat ping loop to detect dead sockets
const heartbeatInterval = setInterval(() => {
  for (const client of wss.clients) {
    const socket = client as WebSocket & { isAlive?: boolean };
    if (socket.isAlive === false) {
      console.log('[AeroCut Telemetry WS] Terminating inactive client');
      socket.terminate();
      continue;
    }
    socket.isAlive = false;
    socket.ping();
  }
}, 30000);

wss.on('connection', (ws: WebSocket & { isAlive?: boolean }, req) => {
  const ip = req.socket.remoteAddress;
  console.log(`[AeroCut Telemetry WS] Client connected from ${ip}`);

  ws.isAlive = true;

  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', (data) => {
    try {
      const parsed = JSON.parse(data.toString());
      if (parsed.type === 'ping') {
        ws.isAlive = true;
        ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
        return;
      }
      // Re-broadcast messages received from workers/CLI/API to all subscribers
      wsHub.broadcast(parsed);
    } catch {
      // ignore non-json messages
    }
  });

  ws.on('close', () => {
    console.log(`[AeroCut Telemetry WS] Client disconnected`);
  });

  ws.on('error', (err) => {
    console.error(`[AeroCut Telemetry WS] Client error:`, err);
  });
});

wss.on('close', () => {
  clearInterval(heartbeatInterval);
});

process.on('SIGINT', () => {
  clearInterval(heartbeatInterval);
  wss.close(() => process.exit(0));
});

process.on('SIGTERM', () => {
  clearInterval(heartbeatInterval);
  wss.close(() => process.exit(0));
});

