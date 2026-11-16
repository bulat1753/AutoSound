declare namespace Cloudflare {
  interface Env {
    ASSETS: Fetcher;
    DB?: D1Database;
    BUCKET?: R2Bucket;
    BOOTSTRAP_TOKEN?: string;
    RESEND_API_KEY?: string;
    MAIL_FROM?: string;
    APP_ORIGIN?: string;
    LOCAL_PREVIEW?: string;
  }
}
