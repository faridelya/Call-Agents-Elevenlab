'use client';

import { useEffect, useRef } from 'react';
import { useAuth } from '@/lib/auth';
import { tokenStore } from '@/lib/api';

const BASE_WS = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000')
  .replace('https://', 'wss://')
  .replace('http://', 'ws://');

export type LiveEvent =
  | { type: 'call_started'; call_record_id: string; agent_id: string; direction: string }
  | { type: 'call_ended'; call_record_id: string }
  | { type: 'transcript'; call_record_id: string; role: 'user' | 'agent'; text: string; timestamp: string }
  | { type: 'call_processed'; call_record_id: string }
  | { type: 'keepalive' };

export function useEventStream(onEvent: (event: LiveEvent) => void) {
  const { user } = useAuth();
  const wsRef = useRef<WebSocket | null>(null);
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    if (!user?.id) return;

    let alive = true;
    let reconnectTimer: ReturnType<typeof setTimeout>;
    let pingInterval: ReturnType<typeof setInterval>;

    function connect() {
      if (!alive) return;

      const token = tokenStore.get();
      if (!token) return;

      const params = new URLSearchParams({ token });
      const ws = new WebSocket(`${BASE_WS}/ws/events/${user!.id}?${params.toString()}`);
      wsRef.current = ws;

      ws.onopen = () => {
        pingInterval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send('ping');
        }, 20_000);
      };

      ws.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data) as LiveEvent;
          if (event.type !== 'keepalive') handlerRef.current(event);
        } catch { /* ignore malformed frames */ }
      };

      ws.onclose = () => {
        clearInterval(pingInterval);
        if (alive) reconnectTimer = setTimeout(connect, 3_000);
      };

      ws.onerror = () => ws.close();
    }

    connect();

    return () => {
      alive = false;
      clearTimeout(reconnectTimer);
      clearInterval(pingInterval);
      wsRef.current?.close();
    };
  }, [user?.id]);
}
