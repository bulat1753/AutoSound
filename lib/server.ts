import { env } from "cloudflare:workers";
import { SOUNDS, WORK_STATUSES, shiftDate, totals, type WorkItem } from "./domain";
import { MailError, mailConfigured, sendAuthMail, type MailKind } from "./mail";

const db = () => { if (!env.DB) throw new ApiError(503, "База данных не подключена"); return env.DB; };
const now = () => new Date().toISOString();
const uuid = () => crypto.randomUUID();
const encoder = new TextEncoder();
class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
function assert(test: unknown, message: string, status = 400): asserts test { if (!test) throw new ApiError(status, message); }
const json = (value: unknown, status = 200, headers: Record<string, string> = {}) => Response.json(value, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...headers } });
const camel = (row: any): any => Object.fromEntries(Object.entries(row).map(([k, v]) => [k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), v]));
async function all(sql: string, ...args: any[]) { const r = await db().prepare(sql).bind(...args).all(); return r.results.map(camel); }
async function one(sql: string, ...args: any[]) { const row = await db().prepare(sql).bind(...args).first(); return row ? camel(row) : null; }
const text = (v: unknown, max = 200, required = false): string => { assert(typeof v === "string", "Некорректный текст"); const s = (v as string).trim(); assert(s.length <= max && (!required || s.length > 0), `Заполните поле (до ${max} символов)`); return s; };
const amount = (v: unknown) => { assert(Number.isSafeInteger(v) && (v as number) >= 0 && (v as number) <= 1_000_000_000, "Сумма должна быть от 0 до 10 000 000 ₽"); return v as number; };
const validDate = (v: unknown) => { const s = text(v, 10, true); const date = new Date(s); assert(/^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(date.getTime()) && date.toISOString().startsWith(s), "Укажите корректную дату"); return s; };
const validPassword = (v: unknown) => { assert(typeof v === "string" && v.length >= 12 && v.length <= 128, "Пароль должен содержать от 12 до 128 символов"); return v as string; };
const publicUser = (u: any) => ({ id: u.id, login: u.login, name: u.name, role: u.role, email: u.email, deletedAt: u.deletedAt, mustChangePassword: u.mustChangePassword });
const b64 = (v: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(v)));
const unb64 = (v: string) => Uint8Array.from(atob(v), c => c.charCodeAt(0));
async function digest(s: string) { return b64(await crypto.subtle.digest("SHA-256", encoder.encode(s))); }
async function hashPassword(password: string, salt = b64(crypto.getRandomValues(new Uint8Array(16)))) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const hash = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", iterations: 100_000, salt: unb64(salt) }, key, 256);
  return `pbkdf2$100000$${salt}$${b64(hash)}`;
}
function same(a: string, b: string) { const aa = encoder.encode(a); const bb = encoder.encode(b); let diff = aa.length ^ bb.length; for (let i = 0; i < Math.max(aa.length, bb.length); i++) diff |= (aa[i] || 0) ^ (bb[i] || 0); return diff === 0; }
async function checkPassword(input: unknown, stored: string) { return typeof input === "string" && input.length <= 128 && same(await hashPassword(input, stored.split("$")[2]), stored); }
function cookie(request: Request, value: string, clear = false) { return `ss_session=${value}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${clear ? 0 : 604800}${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`; }
const sessionToken = (r: Request) => /(?:^|;\s*)ss_session=([^;]+)/.exec(r.headers.get("cookie") || "")?.[1];
async function signIn(request: Request, user: any) {
  const token = b64(crypto.getRandomValues(new Uint8Array(32))).replaceAll("/", "_").replaceAll("+", "-");
  await db().batch([
    db().prepare("DELETE FROM sessions WHERE expires_at < ?").bind(now()),
    db().prepare("INSERT INTO sessions (token,user_id,expires_at) VALUES (?,?,?)").bind(await digest(token), user.id, new Date(Date.now() + 604800_000).toISOString()),
  ]);
  return json({ user: publicUser(user) }, 200, { "Set-Cookie": cookie(request, token) });
}
async function currentUser(request: Request) {
  const token = sessionToken(request);
  assert(token, "Войдите в аккаунт", 401);
  const u = await one("SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token=? AND s.expires_at>? AND u.deleted_at IS NULL", await digest(token!), now());
  assert(u, "Сессия завершена. Войдите снова", 401);
  return u;
}
function owner(user: any) { assert(user.role === "owner", "Действие доступно только владельцу", 403); }
async function rateLimit(request: Request, scope: string, limit = 10, interval = 900_000) {
  const ip = request.headers.get("cf-connecting-ip") || "local";
  const key = await digest(`${scope}:${ip}`);
  const at = Date.now();
  const r = await db().prepare("INSERT INTO rate_limits (key,count,reset_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN reset_at<? THEN 1 ELSE count+1 END, reset_at=CASE WHEN reset_at<? THEN excluded.reset_at ELSE reset_at END RETURNING count").bind(key, at + interval, at, at).first<any>();
  assert(r.count <= limit, "Слишком много попыток. Повторите через 15 минут", 429);
}
const mailConfig = () => ({ apiKey: env.RESEND_API_KEY, from: env.MAIL_FROM, origin: env.APP_ORIGIN });
const mailReady = () => mailConfigured(mailConfig());
async function issueToken(userId: string, type: MailKind, email: string) {
  const raw = uuid() + uuid(); const hashed = await digest(raw);
  await db().batch([
    db().prepare("DELETE FROM auth_tokens WHERE user_id=? AND type=?").bind(userId, type),
    db().prepare("INSERT INTO auth_tokens (token,user_id,type,email,expires_at) VALUES (?,?,?,?,?)").bind(hashed, userId, type, email, new Date(Date.now() + 1800_000).toISOString()),
  ]);
  try { await sendAuthMail(mailConfig(), email, type, raw, hashed); }
  catch (error) { await db().prepare("DELETE FROM auth_tokens WHERE token=?").bind(hashed).run(); throw error; }
}
async function getOrder(id: number, user: any, edit = false) {
  const row = await one("SELECT o.*,u.name AS creator_name FROM orders o JOIN users u ON u.id=o.created_by WHERE o.id=?", id);
  assert(row, "Заказ не найден", 404);
  if (edit) assert(user.role === "owner" || row.createdBy === user.id, "Можно изменять только свои заказы", 403);
  row.items = JSON.parse(row.items);
  return row;
}
function safeOrder(order: any, user: any) {
  return { ...order, items: order.items.map((i: WorkItem) => user.role === "owner" ? i : { ...i, cost: undefined }) };
}
async function validateItems(input: any, user: any, previous: WorkItem[] = []) {
  assert(Array.isArray(input) && input.length >= 1 && input.length <= 50, "Добавьте от 1 до 50 работ");
  const ids = new Set<string>(); const available = await all("SELECT * FROM services WHERE archived=0");
  return input.map((item: any) => {
    assert(item && typeof item === "object", "Некорректная работа");
    const id = text(item.id, 100, true); assert(!ids.has(id), "Одна работа добавлена дважды"); ids.add(id);
    assert(Object.hasOwn(WORK_STATUSES, item.status), "Некорректный статус работы");
    const serviceId = text(item.serviceId || "", 100);
    if (user.role === "employee") {
      const old = previous.find(i => i.id === id);
      const source = old || available.find(s => s.id === serviceId);
      assert(source, "Выберите работу из справочника владельца");
      for (const key of ["name", "components", "labor", "advance"]) assert(item[key] === source[key], "Цены и названия работ изменяет владелец", 403);
      assert(!old || old.serviceId === serviceId, "Работу нельзя заменить без удаления", 403);
      return { id, serviceId, name: source.name, components: source.components, cost: source.cost || 0, labor: source.labor, advance: source.advance, status: item.status };
    }
    const result = { id, serviceId, name: text(item.name, 160, true), components: amount(item.components), cost: amount(item.cost || 0), labor: amount(item.labor), advance: amount(item.advance || 0), status: item.status };
    assert(result.advance <= result.components + result.labor, "Аванс не может превышать стоимость работы");
    return result;
  });
}
async function bootstrap(request: Request, data: any) {
  await rateLimit(request, "setup", 5);
  assert(env.BOOTSTRAP_TOKEN && typeof data.token === "string" && same(data.token, env.BOOTSTRAP_TOKEN), "Неверный ключ первоначальной настройки", 403);
  assert(!(await one("SELECT id FROM users LIMIT 1")), "Владелец уже создан", 409);
  const login = text(data.login, 60, true).toLowerCase(); assert(/^[a-z0-9._-]{3,60}$/.test(login), "Логин: 3–60 латинских букв, цифр, точек или дефисов");
  const user = { id: "owner", login, name: text(data.name, 120, true), password: await hashPassword(validPassword(data.password)), role: "owner", email: null, mustChangePassword: 0 };
  await db().prepare("INSERT INTO users (id,login,name,password,role,created_at) VALUES (?,?,?,?,?,?)").bind(user.id, login, user.name, user.password, "owner", now()).run();
  return signIn(request, user);
}
async function auth(request: Request, path: string, data: any) {
  if (path === "status" && request.method === "GET") return json({ initialized: !!await one("SELECT id FROM users LIMIT 1"), mailReady: mailReady() });
  assert(request.method === "POST", "Метод не поддерживается", 405);
  if (path === "setup") return bootstrap(request, data);
  if (path === "login") {
    await rateLimit(request, "login");
    const login = text(data.login, 100, true).toLowerCase();
    const user = await one("SELECT * FROM users WHERE login=? AND deleted_at IS NULL", login);
    const fallback = "pbkdf2$100000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
    const matches = await checkPassword(data.password, user?.password || fallback);
    assert(user && matches, "Неверный логин или пароль", 401);
    return signIn(request, user);
  }
  if (path === "forgot") {
    await rateLimit(request, "forgot", 5); assert(mailReady(), "Восстановление по почте пока недоступно. Обратитесь к владельцу студии", 503);
    const login = text(data.login, 254, true).toLowerCase();
    const user = await one("SELECT * FROM users WHERE (login=? OR email=?) AND deleted_at IS NULL", login, login);
    if (user?.email) await issueToken(user.id, "reset", user.email);
    return json({ message: "Если к аккаунту привязана почта, на неё отправлено письмо со ссылкой" });
  }
  if (path === "reset" || path === "verify") {
    await rateLimit(request, "token");
    const token = await digest(text(data.token, 200, true));
    const entry = await one("SELECT t.* FROM auth_tokens t JOIN users u ON u.id=t.user_id WHERE t.token=? AND t.type=? AND t.expires_at>? AND u.deleted_at IS NULL", token, path, now());
    assert(entry, "Ссылка недействительна или истекла. Запросите новую");
    // Consume once, atomically with the account update. Concurrent uses cannot update the account twice.
    const update = path === "reset"
      ? db().prepare("UPDATE users SET password=?,must_change_password=0 WHERE id=? AND EXISTS(SELECT 1 FROM auth_tokens WHERE token=?)").bind(await hashPassword(validPassword(data.password)), entry.userId, token)
      : db().prepare("UPDATE users SET email=? WHERE id=? AND EXISTS(SELECT 1 FROM auth_tokens WHERE token=?)").bind(entry.email, entry.userId, token);
    const result = await db().batch([update, ...(path === "reset" ? [db().prepare("DELETE FROM sessions WHERE user_id=? AND EXISTS(SELECT 1 FROM auth_tokens WHERE token=?)").bind(entry.userId, token)] : []), db().prepare("DELETE FROM auth_tokens WHERE token=?").bind(token)]);
    assert(result[0].meta.changes, "Ссылка уже использована. Запросите новую");
    return json({ message: path === "reset" ? "Пароль обновлён. Войдите с новым паролем" : "Почта подтверждена и привязана к аккаунту" });
  }
  throw new ApiError(404, "Страница не найдена");
}
async function profile(request: Request, user: any, path: string, data: any) {
  if (path === "logout") { const token = sessionToken(request); if (token) await db().prepare("DELETE FROM sessions WHERE token=?").bind(await digest(token)).run(); return json({ ok: true }, 200, { "Set-Cookie": cookie(request, "", true) }); }
  if (path === "email") {
    await rateLimit(request, "email", 5); assert(await checkPassword(data.password, user.password), "Неверный текущий пароль", 403);
    const email = text(data.email, 254, true).toLowerCase(); assert(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), "Укажите корректную почту");
    assert(!await one("SELECT id FROM users WHERE email=? AND id<>?", email, user.id), "Эта почта уже привязана к другому аккаунту", 409);
    await issueToken(user.id, "verify", email);
    return json({ message: "Отправили письмо. Подтвердите адрес по ссылке в письме" });
  }
  if (path === "password") {
    await rateLimit(request, "password"); assert(await checkPassword(data.currentPassword, user.password), "Неверный текущий пароль", 403);
    const password = await hashPassword(validPassword(data.password));
    await db().batch([db().prepare("UPDATE users SET password=?,must_change_password=0 WHERE id=?").bind(password, user.id), db().prepare("DELETE FROM sessions WHERE user_id=?").bind(user.id), db().prepare("DELETE FROM auth_tokens WHERE user_id=?").bind(user.id)]);
    return signIn(request, { ...user, mustChangePassword: 0 });
  }
  throw new ApiError(404, "Действие не найдено");
}
async function loadData(user: any) {
  const [people, services, orders, payments, reports, photos, events] = await Promise.all([
    all("SELECT id,login,name,role,email,deleted_at,must_change_password FROM users"), all("SELECT * FROM services WHERE archived=0 ORDER BY name"),
    all("SELECT o.*,u.name AS creator_name FROM orders o JOIN users u ON u.id=o.created_by ORDER BY o.id DESC"),
    all("SELECT * FROM payments ORDER BY created_at DESC"), all("SELECT * FROM reports ORDER BY created_at DESC"), all("SELECT * FROM photos ORDER BY created_at"),
    user.role === "owner" ? all("SELECT * FROM events ORDER BY starts_at") : [],
  ]);
  return json({ user: publicUser(user), mailReady: mailReady(), localPreview: env.LOCAL_PREVIEW === "1", people: people.map(p => user.role === "owner" || p.id === user.id ? p : { id: p.id, name: p.name, role: p.role, deletedAt: p.deletedAt }),
    services: services.map(s => user.role === "owner" ? s : { ...s, cost: undefined }),
    orders: orders.map(o => safeOrder({ ...o, items: JSON.parse(o.items), payments: payments.filter(p => p.orderId === o.id), reports: reports.filter(r => r.orderId === o.id), photos: photos.filter(p => p.orderId === o.id) }, user)), events,
  });
}
async function manageTeam(request: Request, user: any, id: string | undefined, data: any) {
  owner(user);
  if (request.method === "POST" && !id) {
    const login = text(data.login, 60, true).toLowerCase(); assert(/^[a-z0-9._-]{3,60}$/.test(login), "Логин: минимум 3 латинских буквы, цифры, точки или дефисы");
    assert(!await one("SELECT id FROM users WHERE login=?", login), "Этот логин уже занят", 409);
    await db().prepare("INSERT INTO users (id,login,name,password,role,created_at,must_change_password) VALUES (?,?,?,?,?,?,1)").bind(uuid(), login, text(data.name, 120, true), await hashPassword(validPassword(data.password)), "employee", now()).run();
    return json({ ok: true }, 201);
  }
  const target = await one("SELECT * FROM users WHERE id=? AND deleted_at IS NULL", id);
  assert(target && target.role !== "owner", "Сотрудник не найден", 404);
  if (request.method === "DELETE") {
    await db().batch([db().prepare("UPDATE users SET deleted_at=?,email=NULL WHERE id=?").bind(now(), id), db().prepare("DELETE FROM sessions WHERE user_id=?").bind(id), db().prepare("DELETE FROM auth_tokens WHERE user_id=?").bind(id)]);
    return json({ ok: true });
  }
  if (request.method === "PATCH") {
    if (data.password) {
      await db().batch([db().prepare("UPDATE users SET password=?,must_change_password=1 WHERE id=?").bind(await hashPassword(validPassword(data.password)), id), db().prepare("DELETE FROM sessions WHERE user_id=?").bind(id), db().prepare("DELETE FROM auth_tokens WHERE user_id=?").bind(id)]);
    } else await db().prepare("UPDATE users SET name=? WHERE id=?").bind(text(data.name, 120, true), id).run();
    return json({ ok: true });
  }
  throw new ApiError(405, "Метод не поддерживается");
}
async function manageServices(request: Request, user: any, id: string | undefined, data: any) {
  owner(user);
  if (request.method === "DELETE") { assert(await one("SELECT id FROM services WHERE id=?", id), "Услуга не найдена", 404); await db().prepare("UPDATE services SET archived=1 WHERE id=?").bind(id).run(); return json({ ok: true }); }
  assert(["POST", "PUT"].includes(request.method), "Метод не поддерживается", 405);
  const service = { name: text(data.name, 160, true), category: text(data.category || "Общие работы", 80), components: amount(data.components), cost: amount(data.cost), labor: amount(data.labor), advance: amount(data.advance) };
  assert(service.advance <= service.components + service.labor, "Аванс не может превышать итоговую стоимость");
  if (id) { assert(await one("SELECT id FROM services WHERE id=?", id), "Услуга не найдена", 404); await db().prepare("UPDATE services SET name=?,category=?,components=?,cost=?,labor=?,advance=? WHERE id=?").bind(...Object.values(service), id).run(); }
  else await db().prepare("INSERT INTO services (name,category,components,cost,labor,advance,id) VALUES (?,?,?,?,?,?,?)").bind(...Object.values(service), uuid()).run();
  return json({ ok: true }, id ? 200 : 201);
}
async function manageOrder(request: Request, user: any, id: number | undefined, data: any) {
  assert(["POST", "PUT", "PATCH"].includes(request.method), "Метод не поддерживается", 405);
  const old = id ? await getOrder(id, user, true) : null;
  if (request.method === "PATCH" && old) {
    assert(data.status === "active" || data.status === "completed", "Некорректный статус");
    assert(data.status !== "completed" || old.items.every((i: WorkItem) => i.status === "done"), "Сначала отметьте все работы выполненными");
    const result = await db().prepare("UPDATE orders SET status=?,updated_at=?,version=version+1 WHERE id=? AND version=?").bind(data.status, now(), id, data.version).run();
    assert(result.meta.changes, "Заказ уже изменён. Обновите страницу", 409); return json({ ok: true });
  }
  const items = await validateItems(data.items, user, old?.items);
  const car = text(data.car, 120, true), description = text(data.description, 8000, true), clientName = text(data.clientName || "", 160), phone = text(data.phone || "", 40), date = validDate(data.date);
  const at = now();
  if (old) {
    assert(old.status !== "completed", "Откройте завершённый заказ заново для редактирования");
    // The aggregate guard and revision comparison run in the same SQLite statement as the update.
    const t = totals({ items, payments: [] });
    const result = await db().prepare("UPDATE orders SET car=?,description=?,client_name=?,phone=?,date=?,items=?,updated_at=?,version=version+1 WHERE id=? AND version=? AND ? >= COALESCE((SELECT SUM(labor_amount) FROM payments WHERE order_id=?),0) AND ? >= COALESCE((SELECT SUM(amount-labor_amount) FROM payments WHERE order_id=?),0)").bind(car, description, clientName, phone, date, JSON.stringify(items), at, id, data.version, t.labor, id, t.components, id).run();
    assert(result.meta.changes, "Заказ изменился или новая стоимость меньше уже внесённой оплаты. Обновите данные", 409);
    return json({ id });
  }
  const result = await db().prepare("INSERT INTO orders (car,description,client_name,phone,date,items,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?) RETURNING id").bind(car, description, clientName, phone, date, JSON.stringify(items), user.id, at, at).first<any>();
  return json({ id: result.id }, 201);
}
async function addPayment(request: Request, user: any, id: number, data: any) {
  const order = await getOrder(id, user, true);
  const laborAmount = amount(data.laborAmount), componentsAmount = amount(data.componentsAmount), total = laborAmount + componentsAmount;
  assert(total > 0 && total <= 1_000_000_000, "Укажите положительную сумму оплаты");
  assert(["card", "cash", "transfer"].includes(data.method), "Выберите способ оплаты");
  const key = text(data.id, 100, true); assert(/^[a-z0-9-]{20,100}$/i.test(key), "Некорректный идентификатор платежа");
  const employeeId = user.role === "owner" ? text(data.employeeId || order.createdBy, 100, true) : user.id;
  const duplicate = await one("SELECT * FROM payments WHERE id=?", key);
  if (duplicate) { assert(duplicate.orderId === id && duplicate.amount === total && duplicate.laborAmount === laborAmount && duplicate.method === data.method && duplicate.employeeId === employeeId, "Платёж с этим идентификатором уже сохранён с другими данными", 409); return json({ ok: true }); }
  assert(await one("SELECT id FROM users WHERE id=? AND deleted_at IS NULL", employeeId), "Выберите действующего сотрудника");
  const t = totals({ items: order.items, payments: [] });
  // Atomic guard prevents simultaneous payments from exceeding either component of the invoice.
  const result = await db().prepare("INSERT INTO payments (id,order_id,amount,labor_amount,method,note,employee_id,created_by,created_at,shift_date) SELECT ?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM orders WHERE id=? AND version=?) AND ? <= ? - COALESCE((SELECT SUM(labor_amount) FROM payments WHERE order_id=?),0) AND ? <= ? - COALESCE((SELECT SUM(amount-labor_amount) FROM payments WHERE order_id=?),0)").bind(key, id, total, laborAmount, data.method, text(data.note || "", 1000), employeeId, user.id, now(), shiftDate(), id, order.version, laborAmount, t.labor, id, componentsAmount, t.components, id).run();
  assert(result.meta.changes, "Сумма превышает остаток или заказ изменился. Обновите данные", 409);
  return json({ ok: true }, 201);
}
async function addReport(user: any, id: number, data: any) {
  await getOrder(id, user, true);
  const reportId = uuid();
  await db().prepare("INSERT INTO reports (id,order_id,author_id,body,created_at) VALUES (?,?,?,?,?)").bind(reportId, id, user.id, text(data.body, 8000, true), now()).run();
  return json({ id: reportId }, 201);
}
async function uploadPhoto(request: Request, user: any, id: number) {
  await getOrder(id, user, true);
  assert(env.BUCKET, "Хранилище фотографий не подключено", 503);
  assert(Number(request.headers.get("content-length") || 0) <= 10_600_000, "Фотография должна быть меньше 10 МБ", 413);
  const form = await request.formData(); const file = form.get("file");
  assert(file instanceof File && file.size > 0 && file.size <= 10_485_760, "Выберите фотографию до 10 МБ");
  assert(["image/jpeg", "image/png", "image/webp"].includes((file as File).type), "Поддерживаются JPG, PNG и WebP");
  const bytes = await (file as File).arrayBuffer(); const b = new Uint8Array(bytes);
  const detected = b[0] === 255 && b[1] === 216 && b[2] === 255 ? "image/jpeg" : b[0] === 137 && b[1] === 80 && b[2] === 78 && b[3] === 71 && b[4] === 13 && b[5] === 10 ? "image/png" : String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP" ? "image/webp" : "";
  assert(detected === (file as File).type, "Содержимое файла не соответствует формату фотографии");
  const count = await one("SELECT COUNT(*) AS n FROM photos WHERE order_id=?", id); assert(count.n < 60, "В заказе может быть до 60 фотографий");
  const reportId = form.get("reportId") ? text(form.get("reportId"), 100) : null;
  if (reportId) assert(await one("SELECT id FROM reports WHERE id=? AND order_id=?", reportId, id), "Отчёт не найден");
  const photoId = uuid(); await env.BUCKET!.put(photoId, bytes, { httpMetadata: { contentType: detected } });
  try { await db().prepare("INSERT INTO photos (id,order_id,report_id,filename,mime,created_at) VALUES (?,?,?,?,?,?)").bind(photoId, id, reportId, (file as File).name.slice(0, 200), detected, now()).run(); }
  catch (e) { await env.BUCKET!.delete(photoId); throw e; }
  return json({ id: photoId }, 201);
}
async function photo(request: Request, user: any, id: string) {
  const record = await one("SELECT * FROM photos WHERE id=?", id); assert(record, "Фото не найдено", 404);
  await getOrder(record.orderId, user, request.method === "DELETE");
  if (request.method === "DELETE") { await db().prepare("DELETE FROM photos WHERE id=?").bind(id).run(); await env.BUCKET?.delete(id); return json({ ok: true }); }
  assert(request.method === "GET", "Метод не поддерживается", 405);
  const obj = await env.BUCKET?.get(id); assert(obj, "Файл не найден", 404);
  return new Response(obj!.body, { headers: { "Content-Type": record.mime, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox" } });
}
async function manageEvent(request: Request, user: any, id: string | undefined, data: any) {
  owner(user);
  if (id) assert(await one("SELECT id FROM events WHERE id=?", id), "Событие не найдено", 404);
  if (request.method === "DELETE") { await db().prepare("DELETE FROM events WHERE id=?").bind(id).run(); return json({ ok: true }); }
  if (request.method === "PATCH") { assert(data.done === 0 || data.done === 1, "Некорректный статус"); await db().prepare("UPDATE events SET done=? WHERE id=?").bind(data.done, id).run(); return json({ ok: true }); }
  assert(["POST", "PUT"].includes(request.method), "Метод не поддерживается", 405);
  const title = text(data.title, 160, true), note = text(data.note || "", 4000);
  const at = new Date(text(data.startsAt, 50, true)); assert(Number.isFinite(at.getTime()), "Укажите дату и время");
  assert(Object.hasOwn(SOUNDS, data.sound), "Выберите звук напоминания");
  if (id) await db().prepare("UPDATE events SET title=?,note=?,starts_at=?,sound=? WHERE id=?").bind(title, note, at.toISOString(), data.sound, id).run();
  else await db().prepare("INSERT INTO events (id,title,note,starts_at,sound,created_at) VALUES (?,?,?,?,?,?)").bind(uuid(), title, note, at.toISOString(), data.sound, now()).run();
  return json({ ok: true });
}
export async function handleApi(request: Request) {
  try {
    const url = new URL(request.url); const parts = url.pathname.replace(/^\/api\//, "").split("/");
    if (!["GET", "HEAD"].includes(request.method)) {
      assert(request.headers.get("origin") === url.origin, "Запрос с другого сайта запрещён", 403);
      const size = Number(request.headers.get("content-length") || 0);
      assert(size <= (parts[2] === "photos" ? 10_600_000 : 100_000), "Слишком большой запрос", 413);
    }
    let data: any = {};
    if (request.headers.get("content-type")?.includes("application/json")) { try { data = await request.json(); } catch { throw new ApiError(400, "Некорректный запрос"); } assert(data && typeof data === "object" && !Array.isArray(data), "Некорректный запрос"); }
    if (parts[0] === "auth") return await auth(request, parts[1], data);
    const user = await currentUser(request);
    if (parts[0] === "profile" && request.method === "POST") return await profile(request, user, parts[1], data);
    if (parts[0] === "data" && request.method === "GET") return await loadData(user);
    assert(!user.mustChangePassword, "Перед началом работы смените временный пароль в настройках", 403);
    if (parts[0] === "team") return await manageTeam(request, user, parts[1], data);
    if (parts[0] === "services") return await manageServices(request, user, parts[1], data);
    if (parts[0] === "events") return await manageEvent(request, user, parts[1], data);
    if (parts[0] === "photos") return await photo(request, user, parts[1]);
    if (parts[0] === "orders") {
      const id = parts[1] ? Number(parts[1]) : undefined;
      assert(!parts[1] || (Number.isSafeInteger(id) && id! > 0), "Некорректный номер заказа");
      if (parts[2] === "payments" && request.method === "POST") return await addPayment(request, user, id!, data);
      if (parts[2] === "reports" && request.method === "POST") return await addReport(user, id!, data);
      if (parts[2] === "photos" && request.method === "POST") return await uploadPhoto(request, user, id!);
      if (!parts[2]) return await manageOrder(request, user, id, data);
    }
    throw new ApiError(404, "Действие не найдено");
  } catch (error) {
    if (error instanceof ApiError || error instanceof MailError) return json({ error: error.message }, error.status);
    if (String(error).includes("UNIQUE constraint")) return json({ error: "Такая запись уже существует. Обновите данные" }, 409);
    console.error("API request failed", error instanceof Error ? error.message : "Unknown error");
    return json({ error: "Не удалось выполнить действие. Повторите попытку" }, 500);
  }
}
