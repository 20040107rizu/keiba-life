'use client';

import { useEffect, useRef, useState } from 'react';

export type Destination = 'home' | 'result' | 'training' | 'league';
export type Alert = {
 id: string;
 title: string;
 detail: string;
 target: Destination;
 anchor?: string;
 createdAt: number;
 read?: boolean;
};

export function readDevice<T>(key: string, fallback: T): T {
 try { return JSON.parse(localStorage.getItem('keiba-ui:' + key) ?? 'null') ?? fallback; }
 catch { return fallback; }
}

export function writeDevice(key: string, value: unknown) {
 try { localStorage.setItem('keiba-ui:' + key, JSON.stringify(value)); }
 catch { /* The UI can still be used for this session. */ }
}

export function useInbox() {
 const [items, setItems] = useState<Alert[]>([]);
 const current = useRef<Alert[]>([]);
 useEffect(() => {
  current.current = readDevice('inbox', []);
  setItems(current.current);
 }, []);

 function update(next: Alert[]) {
  current.current = next;
  setItems(next);
  writeDevice('inbox', next);
 }

 function add(inputs: Omit<Alert, 'createdAt'>[]) {
  const additions = inputs.filter(input => !current.current.some(alert => alert.id === input.id));
  if (additions.length) update([...additions.map(alert => ({ ...alert, createdAt: Date.now() })), ...current.current].slice(0, 60));
  return additions.length;
 }

 function markRead(id?: string) {
  update(current.current.map(alert => !id || alert.id === id ? { ...alert, read: true } : alert));
 }

 return { items, add, markRead };
}
