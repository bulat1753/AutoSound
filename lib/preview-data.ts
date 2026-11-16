import { shiftDate, todayMoscow, totals, withoutFinances } from "./domain";

const key = "street-scream-preview-v1";
const user = { id: "owner", name: "Александр Иванов", login: "owner", role: "owner", email: null, mustChangePassword: 0 };
function initial() {
  const at = new Date().toISOString(), day = todayMoscow();
  const services = [
    { id: "speakers", name: "Замена динамиков", category: "Автозвук", components: 10000000, cost: 8500000, labor: 2800000, advance: 5000000, archived: 0 },
    { id: "insulation", name: "Шумоизоляция", category: "Комфорт", components: 0, cost: 0, labor: 3600000, advance: 1000000, archived: 0 },
  ];
  const order = (id: number, car: string, service: any, creator: string, name: string, description: string) => ({ id, car, description, clientName: "", phone: "", date: day, createdBy: creator, creatorName: name, items: [{ ...service, id: `work-${id}`, serviceId: service.id, status: id === 1 ? "progress" : "queued" }], status: "active", createdAt: at, updatedAt: at, version: 1, payments: [], photos: [], reports: [] });
  const bmw: any = order(1, "BMW F10", services[0], "employee", "Дмитрий Смирнов", "Замена штатной акустики. Подготовить проставочные кольца, установить динамики и настроить звучание.");
  bmw.clientName = "Сергей Петров";
  bmw.payments = [{ id: "payment-1", orderId: 1, amount: 4600000, laborAmount: 600000, method: "card", note: "Аванс", employeeId: "employee", createdAt: at, shiftDate: shiftDate() }, { id: "payment-2", orderId: 1, amount: 400000, laborAmount: 400000, method: "card", note: "Оплата работ", employeeId: "employee", createdAt: at, shiftDate: shiftDate() }];
  bmw.reports = [{ id: "report-1", orderId: 1, authorId: "employee", body: "Подготовлены кольца и проводка. Устанавливаем акустику в передние двери.", createdAt: at }];
  return { user, people: [user, { id: "employee", name: "Дмитрий Смирнов", login: "d.smirnov", role: "employee", email: null, mustChangePassword: 0 }], services, orders: [order(2, "Audi A6", services[1], "owner", user.name, "Шумоизоляция дверей и багажника. Согласовать с клиентом время выдачи автомобиля."), bmw], events: [{ id: "event-1", title: "Приедет BMW F10", note: "Подготовить компоненты и рабочее место", startsAt: new Date(Date.now() + 3 * 3600000).toISOString(), sound: "drops", done: 0 }], mailReady: false };
}
export async function previewApi(path: string, body?: any, method = body ? "POST" : "GET"): Promise<any> {
  let state: any;
  try { state = JSON.parse(localStorage.getItem(key) || "null") || initial(); } catch { state = initial(); }
  const [resource, id, action] = path.split("/");
  const save = (result: any = { ok: true }) => { localStorage.setItem(key, JSON.stringify(state)); return result; };
  if (path === "auth/status") return { initialized: true, mailReady: false };
  if (path === "data") return save(structuredClone(state));
  if (path === "auth/login") return { user: state.user };
  if (path === "profile/logout") return { ok: true };
  if (resource === "auth" || resource === "profile") throw new Error("Управление паролем и почтой доступно в рабочем приложении");
  const freshId = () => crypto.randomUUID();
  if (resource === "orders") {
    const order = state.orders.find((o: any) => o.id === Number(id));
    if (!id) { const orderId = Math.max(0, ...state.orders.map((o: any) => o.id)) + 1; state.orders.unshift({ ...body, id: orderId, createdBy: state.user.id, creatorName: state.user.name, status: "active", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), version: 1, payments: [], photos: [], reports: [] }); return save({ id: orderId }); }
    if (!order) throw new Error("Заказ не найден");
    if (order.status === "deleted") throw new Error("Заказ удалён");
    if (method === "DELETE") { if (state.user.role !== "owner") throw new Error("Действие доступно только владельцу"); if (typeof body.removeFinances !== "boolean") throw new Error("Выберите, сохранять ли финансы"); if (body.version !== order.version) throw new Error("Заказ изменился. Обновите данные"); order.status = "deleted"; order.version++; if (body.removeFinances) { order.payments = []; order.items = withoutFinances(order.items); } return save(); }
    if (action === "payments") { if (order.payments.some((p: any) => p.id === body.id)) return { ok: true }; const t = totals(order); if (body.laborAmount > t.labor - t.laborPaid || body.componentsAmount > t.components - t.componentsPaid || body.laborAmount + body.componentsAmount <= 0) throw new Error("Проверьте сумму оплаты"); order.payments.unshift({ ...body, orderId: order.id, amount: body.laborAmount + body.componentsAmount, employeeId: body.employeeId || order.createdBy, createdAt: new Date().toISOString(), shiftDate: shiftDate() }); return save(); }
    if (action === "reports") { const reportId = freshId(); order.reports.unshift({ id: reportId, orderId: order.id, authorId: state.user.id, body: body.body, createdAt: new Date().toISOString() }); return save({ id: reportId }); }
    if (action === "photos") { const file = body.get("file") as File; const photoId = freshId(); const url = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file); }); localStorage.setItem(`ss-photo-${photoId}`, url); order.photos.push({ id: photoId, orderId: order.id, filename: file.name, reportId: body.get("reportId") || null }); return save({ id: photoId }); }
    if (method === "PATCH" && body.status === "completed" && order.items.some((i: any) => i.status !== "done")) throw new Error("Сначала отметьте все работы выполненными");
    Object.assign(order, body, { version: order.version + 1, updatedAt: new Date().toISOString() }); return save({ id: order.id });
  }
  if (resource === "photos") { for (const order of state.orders) order.photos = order.photos.filter((p: any) => p.id !== id); localStorage.removeItem(`ss-photo-${id}`); return save(); }
  const collection = resource === "team" ? "people" : resource;
  if (["people", "services", "events"].includes(collection)) {
    if (method === "DELETE") { if (collection === "people") { const person = state.people.find((p: any) => p.id === id); if (person) person.deletedAt = new Date().toISOString(); } else state[collection] = state[collection].filter((entry: any) => entry.id !== id); }
    else if (id) { const entry = state[collection].find((entry: any) => entry.id === id); if (!entry) throw new Error("Запись не найдена"); const { password, ...fields } = body; Object.assign(entry, fields); }
    else { const { password, ...fields } = body; state[collection].push({ ...fields, id: freshId(), ...(collection === "people" ? { role: "employee", email: null, mustChangePassword: 0 } : collection === "events" ? { done: 0 } : { archived: 0 }) }); }
    return save();
  }
  throw new Error("Действие недоступно");
}
