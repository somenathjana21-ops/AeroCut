import { WebSocket, WebSocketServer } from 'ws';

export interface TelemetryEvent {
  type: string;
  jobId?: string;
  [key: string]: any;
}

class WebSocketHub {
  private clients = new Set<WebSocket>();
  private server: WebSocketServer | null = null;
  private uplinkSocket: WebSocket | null = null;
  private uplinkConnecting = false;

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

    // 2. If this process is a standalone CLI/worker, forward to the running ws-server if available
    if (!this.server) {
      this.forwardToStandaloneServer(payload);
    }
  }

  private forwardToStandaloneServer(payload: string): void {
    const port = process.env.WS_PORT || '3001';
    if (this.uplinkSocket && this.uplinkSocket.readyState === WebSocket.OPEN) {
      this.uplinkSocket.send(payload);
      return;
    }

    if (this.uplinkConnecting) return;
    this.uplinkConnecting = true;

    try {
      const socket = new WebSocket(`ws://localhost:${port}`);
      socket.on('open', () => {
        this.uplinkSocket = socket;
        this.uplinkConnecting = false;
        socket.send(payload);
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
