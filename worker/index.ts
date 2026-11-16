import { handleApi } from "../lib/server";

export default {
  async fetch(request: Request, env: Cloudflare.Env) {
    if (new URL(request.url).pathname.startsWith("/api/")) return handleApi(request);
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Cloudflare.Env>;
