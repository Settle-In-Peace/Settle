'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { isAuthenticated, clearAuth } from '../lib/authUtils';

export default function Footer() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const authenticated = mounted && isAuthenticated();

  useEffect(() => { setMounted(true); }, []);

  const handleLogout = () => {
    clearAuth();
    router.push('/');
  };

  return (
    <footer className="bg-black border-t border-zinc-900 mt-auto">
      <div className="max-w-6xl mx-auto px-4 py-12">
        {/* Links */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
          <div>
            <h3 className="text-white font-semibold text-sm mb-4">Settle In Peace</h3>
            <ul className="space-y-2 text-sm text-zinc-400">
              <li><Link href="/assessment" className="hover:text-white transition-colors">Free Assessment</Link></li>
              <li><Link href="/calculators" className="hover:text-white transition-colors">Debt Calculators</Link></li>
              <li><Link href="/coaching" className="hover:text-white transition-colors">Financial Coaching</Link></li>
              <li><Link href="/compare" className="hover:text-white transition-colors">Compare Providers</Link></li>
              <li><Link href="/providers" className="hover:text-white transition-colors">For Providers</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="text-white font-semibold text-sm mb-4">Legal &amp; Compliance</h3>
            <ul className="space-y-2 text-sm text-zinc-400">
              <li><Link href="/terms" className="hover:text-white transition-colors">Terms of Service</Link></li>
              <li><Link href="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link></li>
              <li><Link href="/disclosures" className="hover:text-white transition-colors">Disclosures</Link></li>
              <li><Link href="/disclosures#affiliate" className="hover:text-white transition-colors">Affiliate Disclosure</Link></li>
              <li><a href="mailto:help@settleinpeace.com" className="hover:text-white transition-colors">Contact</a></li>
            </ul>
          </div>
          <div>
            <h3 className="text-white font-semibold text-sm mb-4">Account</h3>
            <ul className="space-y-2 text-sm text-zinc-400">
              {authenticated ? (
                <>
                  <li><Link href="/dashboard" className="hover:text-white transition-colors">Dashboard</Link></li>
                  <li><Link href="/debts" className="hover:text-white transition-colors">My Debts</Link></li>
                  <li><Link href="/settings" className="hover:text-white transition-colors">Settings</Link></li>
                  <li><button onClick={handleLogout} className="hover:text-white transition-colors text-left">Logout</button></li>
                </>
              ) : (
                <>
                  <li><Link href="/login" className="hover:text-white transition-colors">Login</Link></li>
                  <li><Link href="/register" className="hover:text-white transition-colors">Sign Up</Link></li>
                  <li><Link href="/portal" className="hover:text-white transition-colors">Provider Portal</Link></li>
                </>
              )}
            </ul>
          </div>
          <div>
            <h3 className="text-white font-semibold text-sm mb-4">Contact</h3>
            <ul className="space-y-2 text-sm text-zinc-400">
              <li><a href="mailto:help@settleinpeace.com" className="hover:text-white transition-colors">help@settleinpeace.com</a></li>
            </ul>
          </div>
        </div>

        {/* Compliance disclaimer */}
        <div className="border-t border-zinc-800 pt-8 space-y-4 text-xs text-zinc-500 leading-relaxed">
          <p>
            <strong className="text-zinc-400">Disclaimer:</strong> Settle In Peace is not a direct debt settlement provider. We are a marketplace that connects consumers with third-party debt relief companies. We receive compensation from partner providers, which may affect which providers are featured and their order. All fees, ratings, and statistics are disclosed transparently.
          </p>
          <p>
            <strong className="text-zinc-400">Important:</strong> Debt settlement may negatively impact your credit score. Forgiven debt over $600 may be considered taxable income by the IRS. Results vary based on individual circumstances. Programs typically take 24-48 months. Not all clients complete their program. Not available in all states. Please consult a tax advisor regarding tax implications of debt settlement.
          </p>
          <p>
            <strong className="text-zinc-400">Not a Government Agency:</strong> Settle In Peace is a private company and is not affiliated with, endorsed by, or sponsored by any government agency, including the Consumer Financial Protection Bureau (CFPB), the Federal Trade Commission (FTC), or any state regulatory body. To file a complaint with the CFPB, visit{' '}
            <a
              href="https://www.consumerfinance.gov/complaint/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-zinc-300"
            >
              consumerfinance.gov/complaint
            </a>
            .
          </p>
          <p>
            <strong className="text-zinc-400">State Licensing:</strong> Debt relief providers are subject to state licensing requirements that vary by state. Settle In Peace does not provide debt settlement services directly and therefore is not required to hold state debt settlement licenses; however, each partner provider on our marketplace is responsible for maintaining the licenses, registrations, and surety bonds required in the states where they operate. Availability of services may vary by state. Consumers should verify a provider&apos;s licensing status with their state regulator before enrolling.
          </p>
          <p>
            <strong className="text-zinc-400">TCPA Consent:</strong> By using our assessment tool, you consent to be contacted by Settle In Peace and its partner providers via phone, email, or text message regarding your debt situation. Standard message and data rates may apply. You may opt out at any time.
          </p>
        </div>

        <div className="border-t border-zinc-800 mt-8 pt-6 text-center text-xs text-zinc-600 space-y-2">
          <div className="flex justify-center gap-4 flex-wrap">
            <Link href="/terms" className="hover:text-zinc-400 transition-colors">Terms of Service</Link>
            <span>·</span>
            <Link href="/privacy" className="hover:text-zinc-400 transition-colors">Privacy Policy</Link>
            <span>·</span>
            <Link href="/disclosures" className="hover:text-zinc-400 transition-colors">Disclosures</Link>
            <span>·</span>
            <Link href="/disclosures#affiliate" className="hover:text-zinc-400 transition-colors">Affiliate Disclosure</Link>
            <span>·</span>
            <a href="https://www.consumerfinance.gov/complaint/" target="_blank" rel="noopener noreferrer" className="hover:text-zinc-400 transition-colors">File a CFPB Complaint</a>
            <span>·</span>
            <a href="mailto:help@settleinpeace.com" className="hover:text-zinc-400 transition-colors">Contact</a>
            <span>·</span>
            <Link href="/staff/login" className="hover:text-zinc-400 transition-colors">Staff Login</Link>
          </div>
          <div>© {new Date().getFullYear()} Settle In Peace, Inc. All rights reserved. SettleInPeace.com is a trademark of Settle In Peace, Inc.</div>
        </div>
      </div>
    </footer>
  );
}
