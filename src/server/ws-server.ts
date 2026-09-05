import { WebSocketServer } from 'ws';
import { wsHub } from './ws/hub.js';
import dotenv from 'dotenv';

dotenv.config();

const port = parseInt(process.env.WS_PORT || '3001', 10);
const wss = new WebSocketServer({ port });

wsHub.registerServer(wss);

console.log(`[AeroCut Telemetry WS] Listening on ws://localhost:${port}`);

wss.on('connection', (ws, req) => {
  const ip = req.socket.remoteAddress;
  console.log(`[AeroCut Telemetry WS] Client connected from ${ip}`);

  ws.on('message', (data) => {
    try {
      const parsed = JSON.parse(data.toString());
      // Re-broadcast messages received from workers/CLI to all subscribers
      wsHub.broadcast(parsed);
    } catch {
      // ignore non-json messages
    }
  });

  ws.on('close', () => {
    console.log(`[AeroCut Telemetry WS] Client disconnected`);
  });
});

process.on('SIGINT', () => {
  wss.close(() => process.exit(0));
});
