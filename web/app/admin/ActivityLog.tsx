'use client';
// app/admin/ActivityLog.tsx — Real-time activity feed for the admin panel.
// Connects to /api/admin/activity via Server-Sent Events and renders
// new rows as they arrive, keeping the last 200 events in view.

import { useEffect, useRef, useState } from 'react';
import styles from './admin.module.css';

interface ActivityEvent {
  id:         number;
  created_at: string;
  event_type: string;
  summary:    string;
  metadata?:  Record<string, unknown>;
  __error?:   string; // synthetic error object from SSE route
}

const EVENT_ICON: Record<string, string> = {
  email_auto_send:       '📤',
  email_needs_attention: '⚠️',
  email_skip:            '⏭️',
  grade:                 '✅',
  signup:                '🆕',
  upgrade:               '⬆️',
  cancel:                '🚫',
  reactivate:            '🔄',
  payment_failed:        '💳',
};

const EVENT_COLOR: Record<string, string> = {
  email_auto_send:       '#16a34a',
  email_needs_attention: '#d97706',
  email_skip:            '#9ca3af',
  grade:                 '#2563eb',
  signup:                '#7c3aed',
  upgrade:               '#0891b2',
  cancel:                '#dc2626',
  reactivate:            '#16a34a',
  payment_failed:        '#dc2626',
};

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

export default function ActivityLog() {
  const [events,    setEvents]    = useState<ActivityEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [status,    setStatus]    = useState('Connecting...');
  const bottomRef  = useRef<HTMLDivElement>(null);
  const prevLen    = useRef(0);

  useEffect(() => {
    const es = new EventSource('/api/admin/activity');

    es.onopen = () => {
      setConnected(true);
      setStatus('Live');
    };

    es.onmessage = (e: MessageEvent) => {
      try {
        const event = JSON.parse(e.data as string) as ActivityEvent;
        if (event.__error) {
          setStatus(event.__error);
          setConnected(false);
          return;
        }
        setEvents(prev => {
          if (prev.some(p => p.id === event.id)) return prev;
          return [...prev.slice(-199), event];
        });
      } catch { /* ignore parse errors */ }
    };

    es.onerror = () => {
      setConnected(false);
      setStatus('Reconnecting...');
    };

    return () => es.close();
  }, []);

  // Auto-scroll to bottom on new events
  useEffect(() => {
    if (events.length > prevLen.current) {
      prevLen.current = events.length;
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [events.length]);

  return (
    <div className={styles.logContainer}>
      <div className={styles.logHeader}>
        <span className={styles.logTitle}>Live Activity</span>
        <span
          className={styles.logStatus}
          style={{ color: connected ? '#16a34a' : '#f59e0b' }}
        >
          {connected ? '● ' : '○ '}{status}
        </span>
      </div>

      <div className={styles.logBody}>
        {events.length === 0 ? (
          <div className={styles.logEmpty}>
            {connected ? 'Waiting for activity…' : 'Connecting to event stream…'}
          </div>
        ) : (
          events.map(ev => (
            <div key={ev.id} className={styles.logRow}>
              <span className={styles.logTime}>{fmtTime(ev.created_at)}</span>
              <span className={styles.logIcon}>
                {EVENT_ICON[ev.event_type] ?? '📌'}
              </span>
              <span
                className={styles.logType}
                style={{ color: EVENT_COLOR[ev.event_type] ?? '#374151' }}
              >
                {ev.event_type.replace(/_/g, ' ')}
              </span>
              <span className={styles.logSummary}>{ev.summary}</span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
