import { analyze, rewrite, EngineError } from "./engine";
import type { AnalyzeRequest, RewriteRequest } from "./types";

export interface Env {
  ANTHROPIC_API_KEY: string;
}

// Open to any origin -- the caller is a browser extension (chrome-extension://
// origins vary per install and aren't worth enumerating), not a web app with
// a fixed origin to lock this down to. Abuse protection is a size cap on the
// prompt itself (see engine.ts); there is currently no per-caller rate limit
// -- see server/README.md for why and what to add if that changes.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...CORS_HEADERS },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }
    if (request.method !== "POST") {
      return json({ ok: false, error: "Method not allowed" }, 405);
    }

    const url = new URL(request.url);
    if (url.pathname !== "/analyze" && url.pathname !== "/rewrite") {
      return json({ ok: false, error: "Not found" }, 404);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ ok: false, error: "Invalid JSON body" }, 400);
    }

    try {
      if (url.pathname === "/analyze") {
        const data = await analyze(body as AnalyzeRequest, env.ANTHROPIC_API_KEY);
        return json({ ok: true, data });
      }
      const data = await rewrite(body as RewriteRequest, env.ANTHROPIC_API_KEY);
      return json({ ok: true, data });
    } catch (err) {
      const message = err instanceof EngineError ? err.message : "Unexpected server error.";
      return json({ ok: false, error: message }, 500);
    }
  },
};
