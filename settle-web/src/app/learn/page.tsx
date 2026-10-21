import Link from 'next/link';
import type { Metadata } from 'next';
import { getAllArticles, getCategoryCounts, CATEGORIES } from '../../content/articles';

export const metadata: Metadata = {
  title: 'Learn — Debt Relief Education & Guides | Settle In Peace',
  description:
    'Free, honest guides on debt settlement, debt consolidation, credit scores, taxes, bankruptcy, and budgeting. Learn how debt relief really works before you decide.',
  alternates: { canonical: '/learn' },
  openGraph: {
    title: 'Learn — Debt Relief Education & Guides | Settle In Peace',
    description:
      'Free, honest guides on debt settlement, consolidation, credit, taxes, and budgeting. Learn how debt relief really works.',
    type: 'website',
  },
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export default function LearnPage() {
  const allArticles = getAllArticles();
  const counts = getCategoryCounts();
  const [featured, ...rest] = allArticles;

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      {/* Hero */}
      <section className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 text-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-20">
          <p className="text-sm text-blue-200 font-semibold uppercase tracking-wide mb-3">
            Debt Relief Education
          </p>
          <h1 className="text-4xl sm:text-5xl font-black leading-tight mb-4">
            Learn how debt relief really works.
          </h1>
          <p className="text-xl text-blue-100 max-w-2xl leading-relaxed">
            Honest, jargon-free guides on debt settlement, consolidation, credit scores, taxes,
            and more. Understand your options before you decide — no pressure, no sales spin.
          </p>
        </div>
      </section>

      {/* Featured article */}
      <section className="py-16 px-4 bg-white dark:bg-black">
        <div className="max-w-5xl mx-auto">
          <p className="text-sm text-blue-600 dark:text-blue-400 font-semibold uppercase tracking-wide mb-4">
            Featured Article
          </p>
          <Link
            href={`/learn/${featured.slug}`}
            className="group block bg-zinc-50 dark:bg-zinc-900 rounded-2xl border border-zinc-100 dark:border-zinc-800 overflow-hidden hover:shadow-xl transition-all"
          >
            <div className="grid md:grid-cols-2 gap-0">
              <div className="bg-gradient-to-br from-blue-500 to-indigo-600 p-10 flex flex-col justify-center min-h-[220px]">
                <span className="inline-block self-start text-xs font-semibold text-white bg-white/20 rounded-full px-3 py-1 mb-4">
                  {featured.category}
                </span>
                <div className="text-5xl mb-4">📚</div>
                <p className="text-blue-100 text-sm">{featured.readingTime} min read</p>
              </div>
              <div className="p-8 lg:p-10">
                <h2 className="text-2xl font-black text-black dark:text-white mb-3 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                  {featured.title}
                </h2>
                <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed mb-4">
                  {featured.excerpt}
                </p>
                <p className="text-xs text-zinc-400">
                  {formatDate(featured.publishedAt)} · {featured.author}
                </p>
              </div>
            </div>
          </Link>
        </div>
      </section>

      {/* Category filter pills */}
      <section className="px-4 bg-zinc-50 dark:bg-zinc-950 border-y border-zinc-100 dark:border-zinc-900">
        <div className="max-w-5xl mx-auto py-6">
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-full">
              All ({allArticles.length})
            </span>
            {CATEGORIES.filter(c => counts[c]).map(cat => (
              <span
                key={cat}
                className="inline-flex items-center px-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 text-sm font-medium rounded-full"
              >
                {cat} ({counts[cat]})
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Article grid */}
      <section className="py-16 px-4 bg-white dark:bg-black">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-black text-black dark:text-white mb-8">All Articles</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {rest.map(article => (
              <Link
                key={article.slug}
                href={`/learn/${article.slug}`}
                className="group flex flex-col bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-100 dark:border-zinc-800 overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition-all"
              >
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-zinc-800 dark:to-zinc-900 p-6 h-32 flex items-center justify-center">
                  <span className="text-4xl">📄</span>
                </div>
                <div className="p-6 flex flex-col flex-1">
                  <span className="inline-block self-start text-xs font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950 rounded-full px-2.5 py-0.5 mb-3">
                    {article.category}
                  </span>
                  <h3 className="text-lg font-bold text-black dark:text-white mb-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors leading-snug">
                    {article.title}
                  </h3>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed mb-4 flex-1">
                    {article.excerpt}
                  </p>
                  <div className="flex items-center justify-between text-xs text-zinc-400 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                    <span>{formatDate(article.publishedAt)}</span>
                    <span>{article.readingTime} min read</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 px-4 bg-gradient-to-br from-green-50 to-blue-50 dark:from-zinc-950 dark:to-zinc-900">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl font-black text-black dark:text-white mb-4">
            Ready to see your options?
          </h2>
          <p className="text-lg text-zinc-600 dark:text-zinc-400 mb-8">
            Take the free 2-minute assessment and get matched with debt relief providers.
            No credit check, no obligation.
          </p>
          <Link
            href="/assessment"
            className="inline-block px-10 py-4 bg-blue-600 text-white text-lg font-bold rounded-xl hover:bg-blue-700 transition-all shadow-lg"
          >
            Take the Free Assessment →
          </Link>
        </div>
      </section>
    </div>
  );
}
