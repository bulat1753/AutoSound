export type MailConfig = { apiKey?: string; from?: string; origin?: string };
export type MailKind = "reset" | "verify";

export class MailError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

export function mailConfigured(config: MailConfig) {
  if (!config.apiKey?.trim() || !config.from?.trim() || !config.origin) return false;
  try { return new URL(config.origin).protocol === "https:"; } catch { return false; }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function authMail(kind: MailKind, token: string, origin: string) {
  const reset = kind === "reset";
  const subject = reset ? "Сброс пароля Street Scream" : "Подтверждение почты Street Scream";
  const title = reset ? "Восстановите доступ" : "Подтвердите вашу почту";
  const description = reset
    ? "Вы запросили смену пароля в рабочем пространстве студии. Нажмите кнопку, чтобы установить новый пароль."
    : "Подтвердите адрес, чтобы при необходимости восстановить доступ к вашему аккаунту студии.";
  const button = reset ? "Установить новый пароль" : "Подтвердить почту";
  const url = new URL("/", origin); url.searchParams.set(kind, token);
  const link = url.toString(), href = escapeHtml(link);
  const text = `${subject}\n\n${description}\n\n${link}\n\nСсылка одноразовая и действует 30 минут. Если вы не отправляли запрос, проигнорируйте это письмо. Никому не сообщайте пароль или эту ссылку.\n\nStreet Scream · Студия автозвука`;
  const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#f3f6f3;font-family:Arial,sans-serif;color:#253b33"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="520" style="width:100%;max-width:520px;background:white;border:1px solid #dfe7df;border-radius:12px" cellspacing="0" cellpadding="0"><tr><td style="padding:26px 28px;background:#172124;border-radius:12px 12px 0 0;color:white;font-size:24px">Street <span style="color:#ed774e">Scream</span><div style="font-size:10px;letter-spacing:2px;color:#a8bcb0;margin-top:8px">СТУДИЯ АВТОЗВУКА</div></td></tr><tr><td style="padding:30px 28px"><h1 style="font-size:25px;margin:0 0 18px">${title}</h1><p style="font-size:15px;line-height:1.8;color:#6d8073">${description}</p><p style="margin:28px 0"><a href="${href}" style="display:inline-block;padding:15px 20px;background:#07877f;color:white;text-decoration:none;border-radius:7px;font-weight:bold;font-size:14px">${button}</a></p><p style="font-size:13px;line-height:1.8;color:#829080">Ссылка одноразовая и действует <b>30 минут</b>. Если вы не отправляли запрос, проигнорируйте это письмо.</p><p style="font-size:11px;line-height:1.8;color:#96a08e;margin-top:25px">Если кнопка не открывается, скопируйте ссылку в браузер:<br><a href="${href}" style="color:#07877f;word-break:break-all">${href}</a></p></td></tr></table><p style="font-size:11px;color:#99a692;margin:20px 0">Street Scream · Доступ только для команды</p></td></tr></table></body></html>`;
  return { subject, text, html };
}

export async function sendAuthMail(config: MailConfig, email: string, kind: MailKind, token: string, tokenHash: string) {
  if (!mailConfigured(config)) throw new MailError(503, "Отправка писем пока не подключена. Обратитесь к владельцу студии");
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json", "Idempotency-Key": `street-scream-${kind}-${tokenHash}` },
      body: JSON.stringify({ from: config.from, to: [email], ...authMail(kind, token, config.origin!) }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error("Mail provider rejected the request");
    const result = await response.json() as { id?: string };
    if (!result.id) throw new Error("Mail provider did not accept the message");
  } catch {
    throw new MailError(502, "Не удалось отправить письмо. Попробуйте позднее или обратитесь к владельцу студии");
  }
}
