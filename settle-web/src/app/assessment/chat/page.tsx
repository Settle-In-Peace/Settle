'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Logo from '../../../components/Logo';

import { API_URL } from '@/lib/apiUrl';
interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface AssessmentData {
  totalDebt?: number;
  debtTypes?: string[];
  state?: string;
  employmentStatus?: string;
  monthlyIncome?: number;
  monthsBehind?: number;
  hasFiledBankruptcy?: boolean;
  creditScore?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  tcpaConsent?: boolean;
}

const REQUIRED_FIELDS: (keyof AssessmentData)[] = [
  'totalDebt',
  'debtTypes',
  'state',
  'employmentStatus',
  'monthlyIncome',
  'monthsBehind',
  'hasFiledBankruptcy',
  'creditScore',
  'firstName',
  'lastName',
  'email',
  'phone',
  'tcpaConsent',
];

// Must match the disclosure text used in the standard assessment form so the
// stored consent record is consistent regardless of which flow the consumer
// used. See assessment/page.tsx for the canonical version.
const TCPA_CONSENT_LANGUAGE =
  'I agree to be contacted by Settle In Peace and its partner debt relief providers by phone, email, or text message regarding my debt situation. I understand this constitutes a TCPA-compliant opt-in and that standard message and data rates may apply. I may opt out at any time.';
const CONSENT_PAGE_VERSION = 'assessment-chat-v1';

export default function ChatAssessmentPage() {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content:
        "Hi, I'm here to help you find the best path forward with your debt. I'll ask a few quick questions — no judgment, just a conversation. Let's start: roughly how much unsecured debt do you have (credit cards, medical bills, personal loans)?",
    },
  ]);
  const [conversation, setConversation] = useState<
    { role: 'system' | 'user' | 'assistant'; content: string }[]
  >([]);
  const [extractedData, setExtractedData] = useState<AssessmentData>({});
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const collectedCount = REQUIRED_FIELDS.filter((f) => {
    const val = extractedData[f];
    if (val === undefined || val === null) return false;
    if (Array.isArray(val)) return val.length > 0;
    if (typeof val === 'boolean') return val === true;
    return val !== '';
  }).length;
  const progress = Math.round((collectedCount / REQUIRED_FIELDS.length) * 100);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;

    setError('');
    const userMsg: ChatMessage = { role: 'user', content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setLoading(true);

    const newConversation = [
      ...conversation,
      { role: 'user' as const, content: text },
    ];

    try {
      const res = await fetch(`${API_URL}/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newConversation,
          currentData: extractedData,
        }),
      });

      if (!res.ok) throw new Error('Chat request failed');
      const data = await res.json();

      const reply: string = data.reply || "I didn't catch that — could you rephrase?";
      const updatedData: AssessmentData = { ...extractedData, ...(data.extractedData || {}) };
      const isComplete: boolean = data.isComplete || false;

      setConversation([
        ...newConversation,
        { role: 'assistant' as const, content: reply },
      ]);
      setMessages([...newMessages, { role: 'assistant', content: reply }]);
      setExtractedData(updatedData);

      if (isComplete) {
        // Submit the assessment to create a lead, then redirect to compare
        await submitLead(updatedData);
      }
    } catch {
      setError('Connection issue. Please try again or use the standard form.');
      setMessages([...newMessages, { role: 'assistant', content: "I'm having trouble connecting. You can continue or switch to our standard form." }]);
    } finally {
      setLoading(false);
    }
  };

  const submitLead = async (data: AssessmentData) => {
    try {
      const res = await fetch(`${API_URL}/leads/assessment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email,
          phone: data.phone,
          state: data.state,
          totalDebt: data.totalDebt,
          debtTypes: data.debtTypes,
          employmentStatus: data.employmentStatus,
          monthlyIncome: data.monthlyIncome,
          monthsBehind: data.monthsBehind,
          hasFiledBankruptcy: data.hasFiledBankruptcy,
          creditScore: data.creditScore,
          // Use the real consent value extracted from the conversation —
          // never hardcode true. The backend will reject the submission if
          // consent is missing or false.
          tcpaConsent: data.tcpaConsent === true,
          consentLanguage: TCPA_CONSENT_LANGUAGE,
          consentPageVersion: CONSENT_PAGE_VERSION,
        }),
      });
      if (!res.ok) throw new Error('Submission failed');
      const lead = await res.json();
      // Mirror into the central LeadOps store — best-effort, never blocks UX.
      void (data.email ? import('@/lib/leadCapture') : Promise.reject('no-email'))
        .then(({ captureLead }) =>
          captureLead({
            email: data.email!,
            name: `${data.firstName ?? ''} ${data.lastName ?? ''}`.trim() || undefined,
            phone: data.phone,
            vertical: 'debt',
            source_page: '/assessment/chat',
            consent_text: TCPA_CONSENT_LANGUAGE,
            meta: {
              funnel: 'assessment-chat',
              lead_id: lead.id,
              settle_consent_version: CONSENT_PAGE_VERSION,
              state: data.state,
              total_debt: data.totalDebt,
              months_behind: data.monthsBehind,
              debt_types: data.debtTypes,
            },
          }),
        )
        .catch(() => undefined);
      router.push(`/compare?leadId=${lead.id}`);
    } catch {
      setError('Could not submit your assessment. Please use the standard form.');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white dark:from-zinc-900 dark:to-black flex flex-col">
      {/* Top bar */}
      <div className="border-b border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">
              <Logo markClassName="h-6 w-auto" />
            </span>
          </div>
          <Link
            href="/assessment"
            className="text-xs text-zinc-500 dark:text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 underline"
          >
            Skip to form →
          </Link>
        </div>
        {/* Progress bar */}
        <div className="max-w-2xl mx-auto px-4 pb-3">
          <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400 mb-1">
            <span>Assessment progress</span>
            <span>{collectedCount}/{REQUIRED_FIELDS.length} collected</span>
          </div>
          <div className="h-2 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-600 transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      {/* Chat messages */}
      <div className="flex-1 overflow-y-auto max-w-2xl w-full mx-auto px-4 py-6 space-y-4">
        <div className="text-center mb-2">
          <p className="text-sm text-blue-600 dark:text-blue-400 font-medium uppercase tracking-wide mb-1">AI Debt Advisor</p>
          <h1 className="text-2xl font-bold text-black dark:text-white">Let&apos;s talk about your debt</h1>
        </div>

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] px-4 py-3 rounded-2xl ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white rounded-br-sm'
                  : 'bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 rounded-bl-sm border border-zinc-200 dark:border-zinc-700'
              }`}
            >
              <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 rounded-2xl rounded-bl-sm border border-zinc-200 dark:border-zinc-700 px-4 py-3">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="text-center text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded-lg px-4 py-2">
            {error}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading}
              placeholder="Type your answer..."
              className="flex-1 px-4 py-3 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            />
            <button
              onClick={sendMessage}
              disabled={loading || !input.trim()}
              className="px-5 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Send
            </button>
          </div>
          <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-2 text-center">
            Your information is secure and only shared with matched providers.
          </p>
        </div>
      </div>
    </div>
  );
}
