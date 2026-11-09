// compliance.mjs — the load-bearing layer.
//
// Debt relief is regulated. This module owns every compliance primitive for
// the SI outbound caller:
//   1. Consent gating (handled by callers/db.mjs — only consent on file or an
//      agent attestation may reach Telnyx; this service NEVER cold-calls).
//   2. AI disclosure — the opening line is hardcoded and ALWAYS announces an
//      automated assistant before anything else is said.
//   3. Human-handoff keywords — any request for a person ends the AI turn and
//      flags the call for a human callback.
//   4. Opt-out keywords — "stop calling" / "do not call" writes a
//      crm_dnc_list row so every future dialer path blocks the number.
//   5. No advice — the system prompt forbids debt-settlement/financial/legal
//      advice; the call is intro + qualification + "a specialist will call
//      you back" only.

/** Hardcoded opening — played verbatim on every answered call. */
export const OPENING_SCRIPT =
  'Hi, this is an automated assistant calling on behalf of Settle In Peace. ' +
  'This call may be recorded. ';

/** Spoken when the caller asks for a human — ends the AI turn. */
export const HANDOFF_LINE =
  'Of course — a Settle In Peace specialist will call you back shortly. ' +
  'Thanks for your time, and have a good day. Goodbye.';

/** Spoken when the caller opts out — the number is written to the DNC list. */
export const OPTOUT_LINE =
  'Understood — I have removed this number from our call list. ' +
  'Sorry for the inconvenience. Goodbye.';

/** Spoken when the call wraps normally after qualification. */
export const CLOSING_LINE =
  'Thanks so much — a Settle In Peace specialist will call you back soon ' +
  'to go over your options. Have a great day. Goodbye.';

/** Spoken when the SI layer is unavailable mid-call. */
export const DEGRADED_LINE =
  'Thanks for your time — a Settle In Peace specialist will call you back ' +
  'soon. Goodbye.';

/**
 * Words that mean "get me a person". Matched against the caller transcript —
 * any hit ends the AI portion of the call (the caller still gets a polite
 * close, and the row is flagged handoff_requested for a human callback).
 */
const HANDOFF_RE =
  /\b(agent|person|human|human being|real person|someone real|live person|operator|representative|rep|specialist|supervisor|manager|staff)\b/i;

/** Words that mean "never call me again" — DNC list insertion. */
const OPTOUT_RE =
  /(do\s*n'?t\s+call|do\s+not\s+call|stop\s+calling|stop\s+calls?|take\s+me\s+off|remove\s+me|remove\s+this\s+number|opt\s*out|put\s+me\s+on.{0,20}do\s*not\s*call|never\s+call)/i;

export function wantsHuman(transcript) {
  return HANDOFF_RE.test(transcript || '');
}

export function wantsOptOut(transcript) {
  return OPTOUT_RE.test(transcript || '');
}

/**
 * System prompt for the si-gateway chat loop. Hard limits:
 *  - introduce + qualify only — never give debt-settlement, financial, or
 *    legal advice, never quote savings, terms, or timelines
 *  - always stay under ~2 short spoken sentences
 *  - goal: confirm interest, rough debt range, best callback window
 */
export function buildSystemPrompt(context) {
  const leadName = context?.leadName ? ` The lead's name is ${context.leadName}.` : '';
  return [
    'You are the Settle In Peace outbound calling assistant — an automated,',
    'SI-powered assistant (not a human) following up on a debt-relief inquiry',
    `the person submitted online.${leadName}`,
    '',
    'STRICT RULES — follow exactly:',
    '1. You already announced yourself as an automated assistant. Never claim',
    '   to be human, and never deny being automated.',
    '2. Your ONLY job: (a) confirm they still want help with their debt,',
    '   (b) ask roughly how much unsecured debt they have (e.g. under or over',
    '   ten thousand), (c) ask the best time for a specialist to call back.',
    '3. NEVER give debt-settlement, financial, tax, or legal advice. NEVER',
    '   quote savings amounts, settlement percentages, program terms,',
    '   timelines, fees, or guarantees. If asked any of these, say a',
    '   specialist will cover that on the callback.',
    '4. Keep every reply to ONE or TWO short spoken sentences. No lists, no',
    '   markdown, no filler like "Certainly!" — just natural short speech.',
    '5. If the caller is confused, upset, or asks questions you cannot answer,',
    '   tell them a specialist will call back and say goodbye politely.',
    '6. Never ask for or repeat SSNs, card numbers, bank details, or passwords.',
  ].join('\n');
}

/**
 * Sanitize the model's spoken reply: cap length, strip anything that looks
 * like a phone number / ssn the model shouldn't read back, collapse
 * whitespace. Returns a speakable string.
 */
export function sanitizeReply(text, maxChars = 320) {
  if (!text) return '';
  let t = String(text)
    .replace(/[*_`#>|]/g, '')
    .replace(/\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/g, '[removed]')
    .replace(/\s+/g, ' ')
    .trim();
  if (t.length > maxChars) {
    t = t.slice(0, maxChars).replace(/\s+\S*$/, '') + '.';
  }
  return t;
}
