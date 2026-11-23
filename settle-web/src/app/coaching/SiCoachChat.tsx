'use client';

import { useEffect, useRef, useState } from 'react';
import { getAuthenticatedApi } from '../../lib/api';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface HttpErrorLike {
  status?: number;
  data?: { error?: string; message?: string };
}

const WELCOME: ChatMessage = {
  role: 'assistant',
  content:
    "Hi, I'm your SI Coach — an automated coach that knows your budget and goals. Ask me anything about your payoff plan, monthly cash flow, or how to hit your next goal.",
};

/**
 * SI Coach chat panel — automated SI-powered coaching for subscribers.
 * Degrades gracefully: hides input when the backend reports the SI layer
 * unconfigured (503/`si_coach_unavailable`), and renders a paywall notice
 * when the API answers the 402 subscription gate.
 */
export default function SiCoachChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable' | 'locked'>('loading');
  const [error, setError] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    getAuthenticatedApi()<{ configured: boolean }>('/coaching/chat/status')
      .then((res) => {
        if (!cancelled) setState(res.configured ? 'ready' : 'unavailable');
      })
      .catch((err: HttpErrorLike) => {
        if (cancelled) return;
        // 402/403 = the feature exists but this account isn't entitled —
        // keep the panel visible with a locked hint instead of hiding it.
        setState(err?.status === 402 || err?.status === 403 ? 'locked' : 'unavailable');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, sending]);

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    const text = input.trim();
    if (!text || sending) return;

    const next = [...messages, { role: 'user' as const, content: text }];
    setMessages(next);
    setInput('');
    setSending(true);
    setError('');

    try {
      const res = await getAuthenticatedApi()<{ reply: string }>('/coaching/chat', {
        method: 'POST',
        body: JSON.stringify({ messages: next.slice(-30) }),
      });
      setMessages((current) => [
        ...current,
        { role: 'assistant', content: res.reply || '…' },
      ]);
    } catch (err) {
      const httpErr = err as HttpErrorLike;
      if (httpErr?.status === 402 || httpErr?.status === 403) {
        setState('locked');
      } else if (httpErr?.status === 503 || httpErr?.status === 502) {
        setError('The SI coach is temporarily unavailable — please try again in a moment.');
      } else {
        setError('Something went wrong sending that message — please try again.');
      }
      // Roll the failed user message back into the composer.
      setMessages((current) => current.slice(0, -1));
      setInput(text);
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900" aria-label="SI Coach chat">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-zinc-950 dark:text-white">SI Coach</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Automated SI-powered coaching — it can see your budgets and goals.
          </p>
        </div>
        <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
          Powered by SI
        </span>
      </div>

      {state === 'unavailable' && (
        <p className="mt-4 rounded-lg bg-zinc-50 p-4 text-sm text-zinc-600 dark:bg-zinc-950 dark:text-zinc-400">
          The SI coach is temporarily unavailable. Your budgets and goals still work — check back soon.
        </p>
      )}

      {state === 'locked' && (
        <p className="mt-4 rounded-lg border border-blue-200 bg-blue-50/60 p-4 text-sm text-blue-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
          The SI coach is included with a coaching subscription — subscribe above to start chatting.
        </p>
      )}

      {(state === 'ready' || state === 'loading') && (
        <>
          <div ref={listRef} className="mt-4 max-h-96 space-y-3 overflow-y-auto rounded-lg bg-zinc-50 p-4 dark:bg-zinc-950">
            {messages.map((message, index) => (
              <div key={index} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    message.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-zinc-800 shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-200 dark:ring-zinc-800'
                  }`}
                >
                  {message.content}
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex justify-start">
                <div className="rounded-2xl bg-white px-4 py-2.5 text-sm text-zinc-500 shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-400 dark:ring-zinc-800">
                  SI Coach is thinking…
                </div>
              </div>
            )}
          </div>

          {error && (
            <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
              {error}
            </p>
          )}

          <form onSubmit={send} className="mt-3 flex gap-2">
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ask your SI Coach about your budget, payoff plan, or goals…"
              maxLength={4000}
              disabled={state === 'loading'}
              className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
            />
            <button
              type="submit"
              disabled={sending || !input.trim() || state === 'loading'}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {sending ? 'Sending…' : 'Send'}
            </button>
          </form>
        </>
      )}
    </section>
  );
}
