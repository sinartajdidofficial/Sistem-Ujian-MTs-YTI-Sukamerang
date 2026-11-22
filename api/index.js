import app, { initSchema } from "../server/app.js";

/**
 * One serverless function serves the whole API (see the rewrite in vercel.json).
 * The Express routes are mounted under /api, exactly like the local server.
 */
let schemaReady = null;

function ensureSchema() {
  if (!schemaReady) {
    schemaReady = initSchema()
      .catch((err) => {
        console.error("[schema] init failed:", err.message);
        schemaReady = null;
        return false;
      });
  }
  return schemaReady;
}

/** Vercel may hand us /api/index?path=a/b — put the real path back. */
function normalizeUrl(req) {
  const raw = req.url || "/api";
  const queryAt = raw.indexOf("?");
  const pathname = queryAt === -1 ? raw : raw.slice(0, queryAt);
  const search = queryAt === -1 ? "" : raw.slice(queryAt);

  if (pathname !== "/api" && pathname !== "/api/index") return;

  const params = new URLSearchParams(search);
  const inner = params.get("path");
  if (!inner) return;
  params.delete("path");
  const rest = params.toString();
  req.url = `/api/${inner.replace(/^\/+/, "")}${rest ? `?${rest}` : ""}`;
}

export default async function handler(req, res) {
  await ensureSchema();
  normalizeUrl(req);
  try {
    return app(req, res);
  } catch (err) {
    console.error("[api] handler error:", err);
    if (!res.headersSent) res.status(500).json({ error: "Terjadi kesalahan di server." });
  }
}
