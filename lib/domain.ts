export type WorkStatus = "queued" | "progress" | "done";
export type WorkItem = { id: string; serviceId: string; name: string; components: number; cost?: number; labor: number; advance: number; status: WorkStatus };
export type Person = { id: string; login: string; name: string; role: "owner" | "employee"; email: string | null; mustChangePassword: number; deletedAt?: string | null };
export type Payment = { id: string; orderId: number; amount: number; laborAmount: number; method: string; note: string; employeeId: string; createdAt: string; shiftDate: string };
export type Photo = { id: string; orderId: number; reportId: string | null; filename: string };
export type Report = { id: string; orderId: number; authorId: string; body: string; createdAt: string };
export type Order = { id: number; car: string; description: string; clientName: string; phone: string; date: string; createdBy: string; creatorName: string; items: WorkItem[]; status: string; createdAt: string; updatedAt: string; version: number; payments: Payment[]; photos: Photo[]; reports: Report[] };
export type Service = { id: string; name: string; category: string; components: number; cost?: number; labor: number; advance: number; archived: number };
export type CalendarEvent = { id: string; title: string; startsAt: string; note: string; sound: string; done: number };
export const WORK_STATUSES = { queued: "В очереди", progress: "В процессе", done: "Выполнено" };
export const SOUNDS = { drops: "Капельки", coins: "Монетки", melody: "Мелодия", alarm: "Будильник", soft: "Мягкий сигнал", none: "Без звука" };
export const money = (cents: number) => new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
export function totals(order: Pick<Order, "items" | "payments">) {
  const components = order.items.reduce((n, i) => n + i.components, 0);
  const labor = order.items.reduce((n, i) => n + i.labor, 0);
  const cost = order.items.reduce((n, i) => n + (i.cost || 0), 0);
  const paid = order.payments.reduce((n, p) => n + p.amount, 0);
  const laborPaid = order.payments.reduce((n, p) => n + p.laborAmount, 0);
  return { components, labor, cost, paid, laborPaid, total: components + labor, remaining: components + labor - paid, componentsPaid: paid - laborPaid };
}
export function shiftDate(at = new Date()) {
  // Shifts close at 23:00 Moscow time (UTC+3). Receipts after 23:00 belong to the next shift.
  return new Date(at.getTime() + 4 * 3600_000).toISOString().slice(0, 10);
}
export function shiftShares(labor: number) {
  const employee = Math.round(labor * 0.3);
  return { employee, owner: labor - employee };
}
export const withoutFinances = (items: WorkItem[]) => items.map(item => ({ ...item, components: 0, cost: 0, labor: 0, advance: 0 }));
export const todayMoscow = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
