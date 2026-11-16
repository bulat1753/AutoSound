"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { AudioLines, Bell, CalendarDays, Check, ChevronDown, ChevronRight, ClipboardList, LayoutGrid, LoaderCircle, LogOut, Menu, RefreshCw, Settings2, ShieldCheck, UsersRound, Volume2, VolumeX, Wallet, Wrench, X } from "lucide-react";
import { api, playSound, publicAsset } from "../lib/client";
import { StudioContext, type StudioData } from "../components/studio/context";
import { Auth } from "../components/studio/auth";
import { Orders, OrderForm, OrderDetail } from "../components/studio/orders";
import { Services, Settings, Team } from "../components/studio/management";
import { Calendar } from "../components/studio/calendar";
import { Finance } from "../components/studio/finance";
import { Avatar, Button, Empty, Panel } from "../components/studio/ui";

export default function Home() {
  const [data, setData] = useState<StudioData | null>(null), [initialized, setInitialized] = useState(true), [loading, setLoading] = useState(true), [fatal, setFatal] = useState("");
  const [route, setRoute] = useState("orders"), [mobileMenu, setMobileMenu] = useState(false), [externalAuth, setExternalAuth] = useState(false);
  const [toast, setToast] = useState<{ text: string; error: boolean; key: number } | null>(null), [sound, setSound] = useState(false), [refreshing, setRefreshing] = useState(false);
  const soundRef = useRef(false); soundRef.current = sound;
  const notify = useCallback((text: string, error = false) => setToast({ text, error, key: Date.now() }), []);
  const refresh = useCallback(async () => { const result = await api("data"); setData(result); }, []);
  const go = useCallback((path: string) => { location.hash = path; }, []);
  const start = useCallback(async () => { setFatal(""); setLoading(true); try { const status = await api("auth/status"); setInitialized(status.initialized); if (import.meta.env.VITE_PREVIEW === "true") { await refresh(); } else if (status.initialized) { const response = await fetch("/api/data", { cache: "no-store" }); if (response.ok) setData(await response.json() as StudioData); else if (response.status !== 401) throw new Error(((await response.json()) as { error: string }).error); } } catch (e) { setFatal((e as Error).message); } finally { setLoading(false); } }, []);
  useEffect(() => { const query = new URLSearchParams(location.search); setExternalAuth(query.has("reset") || query.has("verify")); const change = () => { setRoute(location.hash.slice(1) || "orders"); setMobileMenu(false); window.scrollTo(0, 0); }; change(); window.addEventListener("hashchange", change); start(); return () => window.removeEventListener("hashchange", change); }, [start]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(null), 7000); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => { if (!data) return; const timer = setInterval(() => { if (!document.hidden) refresh().catch(() => {}); }, 60_000); return () => clearInterval(timer); }, [!!data, refresh]);
  useEffect(() => { if (data?.user.mustChangePassword && route !== "settings") go("settings"); }, [data?.user.mustChangePassword, route, go]);
  useEffect(() => {
    if (!data || data.user.role !== "owner") return;
    const upcoming = data.events.filter(e => !e.done && new Date(e.startsAt).getTime() >= Date.now() && new Date(e.startsAt).getTime() <= Date.now() + 86400_000);
    const key = `ss-overview-${data.user.id}`; const last = Number(localStorage.getItem(key) || 0);
    if (upcoming.length && Date.now() - last >= 7200_000) { localStorage.setItem(key, String(Date.now())); notify(`На ближайшие сутки: ${upcoming.slice(0, 3).map(e => e.title).join("; ")}${upcoming.length > 3 ? ` и ещё ${upcoming.length - 3}` : ""}`); if (soundRef.current) upcoming.slice(0, 3).forEach((e, i) => setTimeout(() => playSound(e.sound).catch(() => {}), i * 1200)); }
    const check = () => { if (document.hidden) return; const at = Date.now(); data.events.filter(e => !e.done && new Date(e.startsAt).getTime() <= at && new Date(e.startsAt).getTime() >= at - 120_000).forEach(e => { const key = `ss-due-${data.user.id}-${e.id}-${e.startsAt}`; if (localStorage.getItem(key)) return; localStorage.setItem(key, "1"); notify(`Напоминание: ${e.title}`); if (soundRef.current) playSound(e.sound).catch(() => {}); }); };
    check(); const timer = setInterval(check, 15_000); return () => clearInterval(timer);
  }, [data, notify]);
  async function toggleSound() {
    if (sound) { setSound(false); return; }
    try {
      await playSound("soft"); setSound(true); notify("Звук включён на время этого сеанса");
      const key = `ss-sound-overview-${data?.user.id}`, last = Number(localStorage.getItem(key) || 0);
      const upcoming = data?.events.filter(e => !e.done && new Date(e.startsAt).getTime() >= Date.now() && new Date(e.startsAt).getTime() <= Date.now() + 86400_000).slice(0, 3) || [];
      if (upcoming.length && Date.now() - last >= 7200_000) { localStorage.setItem(key, String(Date.now())); upcoming.forEach((e, i) => setTimeout(() => playSound(e.sound).catch(() => {}), (i + 1) * 1200)); }
    } catch { notify("Браузер не разрешил воспроизведение звука", true); }
  }
  async function logout() { try { await api("profile/logout", {}); setData(null); setSound(false); go("orders"); } catch (e) { notify((e as Error).message, true); } }
  if (loading) return <main className="loading-page"><AudioLines size={40}/><h2>Street Scream</h2><p>Открываем рабочее пространство…</p><LoaderCircle size={22} className="spin"/></main>;
  if (fatal) return <main className="loading-page"><ShieldCheck size={35}/><h2>Не удалось открыть студию</h2><p role="alert">{fatal}</p><Button onClick={start}><RefreshCw size={16}/>Повторить</Button></main>;
  if (!data || externalAuth) return <Auth initialized={initialized} onLogin={async () => { await refresh(); setExternalAuth(false); setInitialized(true); }}/>;
  const owner = data.user.role === "owner", section = route.split("/")[0];
  const nav = [{ id: "orders", label: "Заказы", icon: ClipboardList, count: data.orders.filter(o => o.status === "active").length }, { id: "services", label: "Услуги и цены", icon: Wrench }, ...(owner ? [{ id: "calendar", label: "Календарь", icon: CalendarDays }, { id: "team", label: "Сотрудники", icon: UsersRound }] : []), { id: "finance", label: owner ? "Финансы" : "Моя смена", icon: Wallet }, { id: "settings", label: "Настройки", icon: Settings2 }];
  let content;
  if (route === "orders/new") content = <OrderForm key="new"/>;
  else if (section === "orders" && route.split("/")[1]) { const order = data.orders.find(o => o.id === Number(route.split("/")[1]) && o.status !== "deleted"); content = order ? route.endsWith("/edit") && (owner || order.createdBy === data.user.id) && order.status !== "completed" ? <OrderForm key={order.id} order={order}/> : <OrderDetail key={order.id} order={order}/> : <Panel><Empty title="Заказ не найден" text="Проверьте ссылку или вернитесь в список заказов." action={<Button onClick={() => go("orders")}>К заказам</Button>}/></Panel>; }
  else if (section === "services") content = <Services/>;
  else if (section === "calendar" && owner) content = <Calendar/>;
  else if (section === "team" && owner) content = <Team/>;
  else if (section === "finance") content = <Finance/>;
  else if (section === "settings") content = <Settings/>;
  else content = <Orders/>;
  return <StudioContext.Provider value={{ data, refresh, notify, go }}><div className="studio-app">{mobileMenu && <button className="sidebar-overlay" aria-label="Закрыть меню" onClick={() => setMobileMenu(false)}/>}<aside className={`sidebar ${mobileMenu ? "open" : ""}`}><a href="#orders" className="sidebar-brand"><div className="brand-mark"><AudioLines size={28}/></div><div><strong>Street <em>Scream</em></strong><span>СТУДИЯ АВТОЗВУКА</span></div></a><span className="sidebar-caption">УПРАВЛЕНИЕ СТУДИЕЙ</span><nav>{nav.map(n => <a href={`#${n.id}`} key={n.id} className={section === n.id ? "active" : ""} aria-current={section === n.id ? "page" : undefined}><n.icon size={20}/><span>{n.label}</span>{n.count !== undefined && <small>{n.count}</small>}</a>)}</nav><div className="sidebar-bottom"><div className="sidebar-studio-state"><span className="live-dot"/><span>Рабочее пространство</span><ShieldCheck size={14}/></div><div className="sidebar-user"><a href="#settings"><Avatar name={data.user.name}/><span><strong>{data.user.name}</strong><small>{owner ? "Начальник" : "Сотрудник"}</small></span></a><button aria-label="Выйти из аккаунта" title="Выйти" onClick={logout}><LogOut size={17}/></button></div></div></aside><div className="main-shell"><div className="mobile-top"><Button variant="ghost" small onClick={() => setMobileMenu(true)} aria-label="Открыть меню"><Menu size={23}/></Button><a href="#orders">Street <em>Scream</em></a><Avatar name={data.user.name} small/></div><header className="brand-banner"><img src={publicAsset("street-scream-banner.png")} alt="Студия автозвука Street Scream"/></header><div className="workspace-topbar"><div><span className="live-dot"/><span>Учёт студии</span><ChevronRight size={13}/><b>{nav.find(n => n.id === section)?.label || "Заказы"}</b></div><div><span className="topbar-date">{new Date().toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Moscow" })}</span>{owner && <button className={`sound-toggle ${sound ? "on" : ""}`} onClick={toggleSound} title="Для звука сайт должен оставаться открытым">{sound ? <Volume2 size={16}/> : <VolumeX size={16}/>}<span>{sound ? "Звук включён" : "Включить звук"}</span></button>}<button className="refresh-button" disabled={refreshing} aria-label="Обновить данные" onClick={async () => { setRefreshing(true); try { await refresh(); notify("Данные обновлены"); } catch (e) { notify((e as Error).message, true); } finally { setRefreshing(false); } }}><RefreshCw size={16} className={refreshing ? "spin" : ""}/></button></div></div><main className="page-content" id="main-content">{content}</main><footer className="app-footer"><span>STREET SCREAM <i/> Внутренняя система студии</span><span><ShieldCheck size={13}/> Доступ только для команды</span></footer></div>{toast && <div className={`toast ${toast.error ? "error" : ""}`} role={toast.error ? "alert" : "status"} key={toast.key}>{toast.error ? <Bell size={20}/> : <Check size={20}/>}<p>{toast.text}</p><button onClick={() => setToast(null)} aria-label="Закрыть уведомление"><X size={17}/></button></div>}</div></StudioContext.Provider>;
}
