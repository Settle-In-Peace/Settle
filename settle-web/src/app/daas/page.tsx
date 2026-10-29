import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Dialer as a Service — TCPA-compliant collections dialer | Settle In Peace',
  description:
    'Per-seat autodialer for collections and debt-relief agencies. DNC checks, consent gates, call logging, and usage-based billing built in.',
};

const FEATURES = [
  {
    title: 'Compliance built in, not bolted on',
    body: 'Every dial passes a DNC check and TCPA consent gate before Telnyx originates it. Blocked calls never leave the platform — the audit trail writes itself.',
  },
  {
    title: 'Click-to-call agent workspace',
    body: 'Agents get a lead queue, one-click dialing, dispositions, and automatic call logging. No softphone installs, no PBX admin.',
  },
  {
    title: 'Per-seat pricing, usage metered',
    body: 'Pay only for active seats. Included minutes per plan, overage metered per minute — visible on your org dashboard in real time.',
  },
  {
    title: 'Campaign autodial',
    body: 'Queue a contact list and the platform dials sequentially with pacing, consent attestation, and per-call outcome tracking.',
  },
];

const PLANS = [
  { name: 'Starter', price: '$49', unit: '/seat/mo', minutes: '200 included minutes', features: ['Click-to-call dashboard', 'DNC + consent gates', 'Call logging & dispositions'] },
  { name: 'Professional', price: '$99', unit: '/seat/mo', minutes: '600 included minutes', features: ['Everything in Starter', 'Campaign autodial', 'Call recording & notes'] },
  { name: 'Enterprise', price: 'Custom', unit: '', minutes: 'Unlimited minutes', features: ['Everything in Pro', 'Dedicated numbers', 'Priority support & SLA'] },
];

export default function DaasPage() {
  return (
    <div className="min-h-screen bg-white text-zinc-900">
      {/* Hero */}
      <section className="mx-auto max-w-5xl px-6 pt-20 pb-14 text-center">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-600">For collections & debt-relief agencies</p>
        <h1 className="mt-4 text-4xl font-black tracking-tight sm:text-5xl">
          A compliant autodialer,<br />billed by the seat.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-zinc-600">
          The same dialing engine we run internally — DNC checks, TCPA consent gates,
          call logging, and usage metering — available to your agency in minutes.
        </p>
        <div className="mt-8 flex items-center justify-center gap-4">
          <Link
            href="/register?next=/dashboard/org"
            className="rounded-lg bg-emerald-600 px-6 py-3 text-sm font-bold text-white transition hover:bg-emerald-500"
          >
            Start your organization
          </Link>
          <Link href="/login" className="rounded-lg border border-zinc-300 px-6 py-3 text-sm font-semibold text-zinc-700 transition hover:border-zinc-400">
            Sign in
          </Link>
        </div>
        <p className="mt-3 text-xs text-zinc-500">Create your org, pick a plan, checkout in under five minutes.</p>
      </section>

      {/* Features */}
      <section className="border-t border-zinc-100 bg-zinc-50/60">
        <div className="mx-auto grid max-w-5xl gap-6 px-6 py-14 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-xl border border-zinc-200 bg-white p-6">
              <h3 className="text-base font-bold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-600">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <h2 className="text-center text-2xl font-black">Simple per-seat pricing</h2>
        <p className="mt-2 text-center text-sm text-zinc-500">Cancel anytime. Minutes overage billed per-minute at plan rate.</p>
        <div className="mt-10 grid gap-6 sm:grid-cols-3">
          {PLANS.map((p) => (
            <div key={p.name} className="rounded-2xl border border-zinc-200 p-6">
              <h3 className="text-sm font-bold uppercase tracking-wide text-zinc-500">{p.name}</h3>
              <p className="mt-3">
                <span className="text-3xl font-black">{p.price}</span>
                <span className="text-sm text-zinc-500">{p.unit}</span>
              </p>
              <p className="mt-1 text-xs font-medium text-emerald-600">{p.minutes}</p>
              <ul className="mt-4 space-y-2">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-zinc-600">
                    <span className="mt-0.5 text-emerald-500">✓</span>{f}
                  </li>
                ))}
              </ul>
              <Link
                href="/register?next=/dashboard/org"
                className="mt-6 block rounded-lg border border-emerald-600 px-4 py-2.5 text-center text-sm font-semibold text-emerald-600 transition hover:bg-emerald-600 hover:text-white"
              >
                Get started
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* Compliance note */}
      <section className="border-t border-zinc-100">
        <div className="mx-auto max-w-3xl px-6 py-12 text-center">
          <p className="text-xs leading-relaxed text-zinc-500">
            Settle In Peace provides dialing software only. Your organization is responsible for
            maintaining valid consent records, honoring DNC requests, and complying with the TCPA,
            FDCPA, and state dialing rules. The platform enforces the gates you configure — it does
            not replace your compliance counsel.
          </p>
        </div>
      </section>
    </div>
  );
}
