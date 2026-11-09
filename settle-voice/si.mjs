// si.mjs — si-gateway chat client (the portfolio's shared SI path).
//
// Same env pattern as settle-api's LlmClientService:
//   AI_BASE_URL  (on oracle: http://localhost:4030/v1)
//   AI_API_KEY   (SI_GATEWAY_KEY)
//   AI_MODEL     (default 'si' — the gateway picks the live provider)
//   AI_TIMEOUT_MS (default 20000)
//
// Degrades gracefully: returns null on any failure/unconfigured state so
// the call loop can speak DEGRADED_LINE and end politely — SI features
// never crash a call. No SI credits metering (server-side calls aren't
// attributed to an end user).

const BASE = () => (process.env.AI_BASE_URL || '').replace(/\/+$/, '');
const KEY = () => process.env.AI_API_KEY || process.env.OPENAI_API_KEY || '';
const MODEL = () => process.env.AI_MODEL || 'si';
const TIMEOUT = Number(process.env.AI_TIMEOUT_MS || 20000);

export const siConfigured = Boolean(BASE() && KEY());

/**
 * Run one chat completion. `messages` = [{role:'system'|'user'|'assistant', content}]
 * Returns { content, provider } or null on any failure.
 */
export async function chat(messages, { maxTokens = 140, temperature = 0.5 } = {}) {
  if (!siConfigured) return null;
  try {
    const res = await fetch(`${BASE()}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${KEY()}`,
        'Content-Type': 'application/json',
        'x-si-app': 'settle-voice',
      },
      body: JSON.stringify({
        model: MODEL(),
        messages,
        max_tokens: maxTokens,
        temperature,
      }),
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    const content = data?.choices?.[0]?.message?.content || '';
    if (!content) return null;
    return { content, provider: data?.si_provider || data?.model || MODEL() };
  } catch {
    return null;
  }
}
