"use client";
import { useEffect, useState } from "react";
import { ArrowRight, AudioLines, Eye, EyeOff, LockKeyhole, ShieldCheck } from "lucide-react";
import { api } from "../../lib/client";
import { Button, Field, SaveForm } from "./ui";

export function PasswordInput({ name = "password", newPassword = false, required = true }: { name?: string; newPassword?: boolean; required?: boolean }) {
  const [show, setShow] = useState(false);
  return <div className="password-input"><input name={name} type={show ? "text" : "password"} required={required} minLength={newPassword ? 12 : undefined} maxLength={128} autoComplete={newPassword ? "new-password" : "current-password"}/><button type="button" onClick={() => setShow(!show)} aria-label={show ? "Скрыть пароль" : "Показать пароль"}>{show ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div>;
}
export function Auth({ initialized, onLogin }: { initialized: boolean; onLogin: () => Promise<void> }) {
  const [mode, setMode] = useState(initialized ? "login" : "setup"), [token, setToken] = useState(""), [message, setMessage] = useState("");
  useEffect(() => { const params = new URLSearchParams(location.search); for (const kind of ["reset", "verify", "setup"]) if (params.get(kind)) { setMode(kind); setToken(params.get(kind)!); history.replaceState(null, "", location.pathname); break; } }, []);
  const titles: Record<string, string> = { login: "С возвращением", setup: "Начнём с владельца", forgot: "Восстановить доступ", reset: "Новый пароль", verify: "Подтвердить почту" };
  const subtitles: Record<string, string> = { login: "Войдите в рабочее пространство студии.", setup: "Первоначальная настройка Street Scream.", forgot: "Укажите логин или привязанную почту.", reset: "Придумайте пароль от 12 символов.", verify: "Подтвердите привязку этого адреса к аккаунту." };
  return <main className="auth-page"><div className="auth-visual"><img src="/street-scream-banner.png" alt="Студия автозвука Street Scream"/><div className="auth-visual-copy"><span className="eyebrow"><AudioLines size={18}/> РАБОЧЕЕ ПРОСТРАНСТВО</span><h1>Всё звучит.<br/><em>Всё под контролем.</em></h1><p>Заказы, команда и финансы —<br/>в одном ритме вашей студии.</p><div className="sound-bars" aria-hidden="true">{Array.from({ length: 39 }, (_, i) => <i key={i} style={{ height: `${12 + Math.abs(Math.sin(i * 0.72)) * 60}px`, opacity: 0.25 + (i % 5) * 0.12 }}/>)}</div><small>STREET SCREAM · СТУДИЯ АВТОЗВУКА</small></div></div><div className="auth-main"><div className="auth-card"><div className="auth-lock"><LockKeyhole size={24}/></div><span className="eyebrow muted">УЧЁТ СТУДИИ</span><h2>{titles[mode]}</h2><p className="muted">{subtitles[mode]}</p>{message ? <div className="auth-message"><ShieldCheck size={28}/><p role="status">{message}</p><Button onClick={() => { setMode("login"); setMessage(""); }}>Ко входу <ArrowRight size={16}/></Button></div> : <SaveForm label={mode === "login" ? "Войти в аккаунт" : mode === "forgot" ? "Отправить ссылку" : mode === "verify" ? "Подтвердить почту" : mode === "setup" ? "Создать аккаунт владельца" : "Сохранить пароль"} onSave={async form => {
    const data = Object.fromEntries(form.entries());
    if (mode === "setup") { await api("auth/setup", { ...data, token: token || data.token }); await onLogin(); }
    else if (mode === "login") { await api("auth/login", data); await onLogin(); }
    else { const result = await api(`auth/${mode}`, { ...data, token }); setMessage(result.message); }
  }}>
    {mode === "setup" && <><Field label="Имя и фамилия"><input name="name" placeholder="Александр Иванов" required maxLength={120} autoComplete="name"/></Field>{!token && <Field label="Ключ первоначальной настройки"><input name="token" type="password" required autoComplete="off"/></Field>}</>}
    {["login", "setup", "forgot"].includes(mode) && <Field label={mode === "forgot" ? "Логин или почта" : "Логин"}><input name="login" placeholder={mode === "forgot" ? "login или name@example.ru" : "Ваш логин"} autoComplete="username" required maxLength={mode === "forgot" ? 254 : 60} pattern={mode === "setup" ? "[a-zA-Z0-9._-]{3,60}" : undefined}/></Field>}
    {["login", "setup", "reset"].includes(mode) && <Field label="Пароль" hint={mode !== "login" ? "Не меньше 12 символов" : undefined}><PasswordInput newPassword={mode !== "login"}/></Field>}
    {mode === "login" && <button className="text-link forgot-link" type="button" onClick={() => setMode("forgot")}>Забыли пароль?</button>}
  </SaveForm>}{mode !== "login" && mode !== "setup" && !message && <button className="text-link back-to-login" onClick={() => setMode("login")}>Вернуться ко входу</button>}<div className="auth-foot"><ShieldCheck size={16}/><span>Доступ только для команды.<br/>Аккаунты сотрудников создаёт владелец.</span></div></div><small className="auth-copyright">Street Scream © {new Date().getFullYear()}</small></div></main>;
}
