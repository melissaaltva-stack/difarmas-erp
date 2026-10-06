export function loadJson<T>(key:string, fallback:T): T { try { const raw=localStorage.getItem(key); return raw===null ? fallback : JSON.parse(raw) as T; } catch { return fallback; } }
export function saveJson<T>(key:string, value:T): void { localStorage.setItem(key, JSON.stringify(value)); }
export function loadNumber(key:string, fallback:number): number { const raw=localStorage.getItem(key); const value=raw===null?NaN:Number(raw); return Number.isFinite(value)?value:fallback; }
export function saveNumber(key:string, value:number): void { localStorage.setItem(key, String(value)); }
