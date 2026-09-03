# Prompt Polish API

A Cloudflare Worker that holds the shared Anthropic API key server-side, so
the Prompt Polish extension's users don't need their own key. It exposes
`POST /analyze` and `POST /rewrite`, mirroring the extension's `EngineMessage`
contract exactly -- the request/response shapes are identical to what the
extension used to send directly to Anthropic.

## Why this exists

The extension used to call `api.anthropic.com` directly from the browser
with a key each user pasted in themselves. That's fine for personal use,
but every file in a shipped extension is readable by anyone who installs
it -- a bundled shared key would be extracted within minutes and usable by
anyone, on the developer's bill, with no way to revoke it without breaking
the extension for everyone. This Worker keeps the real key server-side;
the extension only ever talks to this Worker.

## ⚠️ No rate limiting yet -- deliberate, not an oversight

This endpoint is open and unauthenticated: anyone who finds its URL can
call it, not just extension users, and nothing currently caps how often.
The only cost guard in place is a per-request prompt-length cap (in
`src/engine.ts`), which bounds the cost of any *one* call but not how many
calls someone can make.

This was an explicit choice, made knowingly. **If you deploy this,
set a spend-limit alert on the Anthropic Console** -- that's the actual
backstop against a script hammering this endpoint, not anything in this
code.

If usage grows and this needs tightening, the natural next step is a
per-IP rate limit using [Cloudflare's Rate Limiting rules](https://developers.cloudflare.com/waf/rate-limiting-rules/)
(no code change, configured in the dashboard) or a Durable Object /
Workers KV counter inside `src/index.ts` for more control (e.g. per-device
limits instead of per-IP).

## Local development

```
npm install
cp .env.example .env   # paste your own Anthropic key in, for local eval runs
npm run typecheck
npm run eval            # sanity-checks ANALYZE_SYSTEM/REWRITE_SYSTEM against real API calls
npm run dev              # runs the Worker locally via wrangler
```

## Deploying

```
npm install
npx wrangler login                          # one-time, opens a browser to authorize
npx wrangler secret put ANTHROPIC_API_KEY   # paste your key when prompted -- never goes in a file
npm run deploy
```

`wrangler deploy` prints the Worker's URL (something like
`https://prompt-polish-api.<your-subdomain>.workers.dev`). After deploying:

1. Update `BACKEND_URL` in `../background/index.ts` (the extension) to that URL.
2. Update `host_permissions` in `../manifest.json` to match it.
3. Rebuild the extension (`npm run build` in the repo root).

## Redeploying after a prompt/engine change

`src/engine.ts` here is a copy of what used to be `background/engine.ts` in
the extension -- the ANALYZE_SYSTEM/REWRITE_SYSTEM prompts, retry/timeout
logic, and response validation all live here now, not in the extension.
Edit it here, re-run `npm run eval` to confirm the eval suite still passes,
then `npm run deploy`.
