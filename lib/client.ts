"use client";
export async function api<T = any>(path: string, data?: unknown, method?: string): Promise<T> {
  const isForm = data instanceof FormData;
  const response = await fetch(`/api/${path}`, {
    method: method || (data ? "POST" : "GET"), credentials: "same-origin",
    headers: data && !isForm ? { "Content-Type": "application/json" } : undefined,
    body: data ? isForm ? data : JSON.stringify(data) : undefined,
  });
  const result: any = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Сервер недоступен. Попробуйте ещё раз");
  return result;
}
let audio: AudioContext | undefined;
export async function playSound(kind: string) {
  if (kind === "none") return;
  audio ||= new AudioContext(); await audio.resume();
  const notes: Record<string, number[]> = { drops: [880, 1320, 1046], coins: [1568, 2093, 2637, 2093], melody: [523, 659, 784, 1046], alarm: [880, 880, 660, 660, 880, 880], soft: [440, 554, 659] };
  (notes[kind] || notes.soft).forEach((frequency, i) => {
    const oscillator = audio!.createOscillator(); const gain = audio!.createGain();
    const start = audio!.currentTime + i * (kind === "coins" ? 0.09 : 0.18);
    oscillator.type = kind === "alarm" ? "triangle" : "sine"; oscillator.frequency.setValueAtTime(frequency, start);
    if (kind === "drops") oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.45, start + 0.15);
    gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(0.15, start + 0.01); gain.gain.exponentialRampToValueAtTime(0.001, start + 0.27);
    oscillator.connect(gain); gain.connect(audio!.destination); oscillator.start(start); oscillator.stop(start + 0.3);
  });
}
export function localTime(iso: string) { return new Date(iso).toLocaleTimeString("ru-RU", { timeZone: "Europe/Moscow", hour: "2-digit", minute: "2-digit" }); }
export function displayDate(iso: string, short = false) { return new Date(iso.includes("T") ? iso : iso + "T12:00:00+03:00").toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow", day: "numeric", month: short ? "short" : "long", ...(short ? {} : { year: "numeric" }) }); }
export function toCents(value: string) { return Math.round(Number(value.replace(",", ".") || 0) * 100); }
export const initials = (name: string) => name.split(" ").filter(Boolean).slice(0, 2).map(n => n[0]).join("").toUpperCase();
