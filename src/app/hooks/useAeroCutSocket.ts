'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

export type SocketStatus = 'connected' | 'reconnecting' | 'disconnected';

export interface WsMessage {
  type: string;
  jobId?: string;
  [key: string]: any;
}

export type MessageListener = (msg: WsMessage) => void;

export function useAeroCutSocket(wsUrl = 'ws://localhost:3001') {
  const [status, setStatus] = useState<SocketStatus>('disconnected');
  const [lastMessage, setLastMessage] = useState<WsMessage | null>(null);
  const listenersRef = useRef<Set<MessageListener>>(new Set());
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const isMountedRef = useRef(true);

  const addListener = useCallback((fn: MessageListener) => {
    listenersRef.current.add(fn);
    return () => {
      listenersRef.current.delete(fn);
    };
  }, []);

  const connect = useCallback(() => {
    if (!isMountedRef.current) return;
    if (socketRef.current && (socketRef.current.readyState === WebSocket.OPEN || socketRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    setStatus((prev) => (prev === 'connected' ? 'reconnecting' : prev === 'disconnected' && reconnectAttemptsRef.current > 0 ? 'reconnecting' : 'reconnecting'));

    try {
      const ws = new WebSocket(wsUrl);
      socketRef.current = ws;

      ws.onopen = () => {
        if (!isMountedRef.current) return;
        setStatus('connected');
        reconnectAttemptsRef.current = 0;
      };

      ws.onmessage = (event) => {
        if (!isMountedRef.current) return;
        try {
          const data: WsMessage = JSON.parse(event.data);
          if (data.type === 'pong' || data.type === 'ping') return;

          setLastMessage(data);
          listenersRef.current.forEach((listener) => {
            try {
              listener(data);
            } catch (err) {
              console.error('[WebSocket] Listener error:', err);
            }
          });
        } catch {
          // ignore non-json messages
        }
      };

      ws.onclose = () => {
        if (!isMountedRef.current) return;
        socketRef.current = null;
        setStatus('reconnecting');

        // Exponential backoff reconnect: 1s, 2s, 4s, max 8s
        const backoff = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 8000);
        reconnectAttemptsRef.current += 1;

        if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, backoff);
      };

      ws.onerror = () => {
        if (!isMountedRef.current) return;
        ws.close();
      };
    } catch {
      setStatus('disconnected');
    }
  }, [wsUrl]);

  useEffect(() => {
    isMountedRef.current = true;
    connect();

    // Heartbeat ping interval to keep connection warm
    const pingInterval = setInterval(() => {
      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({ type: 'ping' }));
      }
    }, 25000);

    return () => {
      isMountedRef.current = false;
      clearInterval(pingInterval);
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, [connect]);

  const send = useCallback((payload: any) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(payload));
      return true;
    }
    return false;
  }, []);

  return {
    status,
    lastMessage,
    addListener,
    send,
    reconnect: connect,
  };
}
