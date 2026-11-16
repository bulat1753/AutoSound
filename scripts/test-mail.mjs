import test from "node:test";
import assert from "node:assert/strict";
import { authMail, mailConfigured, sendAuthMail, MailError } from "../lib/mail.ts";

const config = { apiKey: "test-key-not-a-real-secret", from: "Street Scream <studio@example.com>", origin: "https://studio.example" };

test("reset and verification links use the configured HTTPS origin and encode their token", () => {
  for (const kind of ["reset", "verify"]) {
    const mail = authMail(kind, "a+&token", config.origin);
    assert(mail.subject.includes("Street Scream"));
    assert(mail.text.includes(`https://studio.example/?${kind}=a%2B%26token`));
    assert(mail.html.includes(`href="https://studio.example/?${kind}=a%2B%26token"`));
    assert(mail.text.includes("30 минут"));
    assert(!mail.text.includes(config.apiKey));
  }
});

test("mail configuration requires all values and an HTTPS application URL", () => {
  assert.equal(mailConfigured(config), true);
  assert.equal(mailConfigured({ ...config, apiKey: "" }), false);
  assert.equal(mailConfigured({ ...config, from: "" }), false);
  assert.equal(mailConfigured({ ...config, origin: "http://studio.example" }), false);
  assert.equal(mailConfigured({ ...config, origin: "bad-url" }), false);
});

test("Resend receives text, HTML and a hashed idempotency key; accepted email succeeds", async t => {
  let request;
  t.mock.method(globalThis, "fetch", async (url, options) => { request = { url, options }; return Response.json({ id: "email-test-id" }); });
  await sendAuthMail(config, "recipient@example.com", "verify", "single-use-token", "hashed-token");
  assert.equal(request.url, "https://api.resend.com/emails");
  assert.equal(request.options.headers.Authorization, `Bearer ${config.apiKey}`);
  assert.equal(request.options.headers["Idempotency-Key"], "street-scream-verify-hashed-token");
  const body = JSON.parse(request.options.body);
  assert.equal(body.from, config.from); assert.deepEqual(body.to, ["recipient@example.com"]);
  assert(body.html.includes("Подтвердите вашу почту")); assert(body.text.includes("single-use-token"));
  assert(!Object.hasOwn(body, "password"));
});

test("provider failures and network errors return a safe error without provider secrets", async t => {
  const mock = t.mock.method(globalThis, "fetch", async () => Response.json({ error: config.apiKey }, { status: 403 }));
  const check = error => error instanceof MailError && error.status === 502 && !error.message.includes(config.apiKey);
  await assert.rejects(sendAuthMail(config, "a@example.com", "reset", "token", "hash"), check);
  mock.mock.mockImplementation(async () => { throw new Error(config.apiKey); });
  await assert.rejects(sendAuthMail(config, "a@example.com", "reset", "token", "hash"), check);
});

test("incomplete configuration never calls the provider", async t => {
  const mock = t.mock.method(globalThis, "fetch", async () => { throw new Error("Must not send"); });
  await assert.rejects(sendAuthMail({ ...config, apiKey: "" }, "a@example.com", "verify", "token", "hash"), error => error instanceof MailError && error.status === 503);
  assert.equal(mock.mock.callCount(), 0);
});
