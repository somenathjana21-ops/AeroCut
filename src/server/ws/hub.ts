import { WebSocket, WebSocketServer } from 'ws';

export type TelemetryMessageType =
  | 'job:status'
  | 'job:event'
  | 'render:progress'
  | 'assets:updated'
  | 'job:created'
  | 'job:failed'
  | 'ping'
  | 'pong';

export interface TelemetryEvent {
  type: TelemetryMessageType | string;
  jobId?: string;
  [key: string]: any;
}

class WebSocketHub {
  private clients = new Set<WebSocket>();
  private server: WebSocketServer | null = null;
  private uplinkSocket: WebSocket | null = null;
  private uplinkConnecting = false;
  private pendingQueue: string[] = [];

  public registerServer(wss: WebSocketServer): void {
    this.server = wss;
    wss.on('connection', (ws) => {
      this.clients.add(ws);
      ws.on('close', () => this.clients.delete(ws));
      ws.on('error', () => this.clients.delete(ws));
    });
  }

  public broadcast(event: TelemetryEvent): void {
    const payload = JSON.stringify(event);

    // 1. Send to all directly connected clients
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(payload);
        } catch {
          this.clients.delete(client);
        }
      }
    }

    // 2. If this process is not the standalone ws-server (e.g. Next.js route handlers or CLI),
    // forward to the running ws-server so all connected browser clients receive it
    if (!this.server) {
      this.forwardToStandaloneServer(payload);
    }
  }

  private flushQueue(): void {
    if (!this.uplinkSocket || this.uplinkSocket.readyState !== WebSocket.OPEN) return;
    while (this.pendingQueue.length > 0) {
      const msg = this.pendingQueue.shift();
      if (msg) {
        try {
          this.uplinkSocket.send(msg);
        } catch {
          // If send fails, keep remaining
          break;
        }
      }
    }
  }

  private forwardToStandaloneServer(payload: string): void {
    this.pendingQueue.push(payload);

    if (this.uplinkSocket && this.uplinkSocket.readyState === WebSocket.OPEN) {
      this.flushQueue();
      return;
    }

    if (this.uplinkConnecting) return;
    this.uplinkConnecting = true;

    const port = process.env.WS_PORT || '3001';
    try {
      const socket = new WebSocket(`ws://localhost:${port}`);
      socket.on('open', () => {
        this.uplinkSocket = socket;
        this.uplinkConnecting = false;
        this.flushQueue();
      });
      socket.on('error', () => {
        this.uplinkSocket = null;
        this.uplinkConnecting = false;
      });
      socket.on('close', () => {
        this.uplinkSocket = null;
        this.uplinkConnecting = false;
      });
    } catch {
      this.uplinkConnecting = false;
    }
  }
}

export const wsHub = new WebSocketHub();
