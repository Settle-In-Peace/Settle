import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import {
  getAllSlugs,
  getArticleBySlug,
  getRelatedArticles,
  type ContentBlock,
} from '../../../content/articles';

// Pre-render every article at build time for SEO.
export function generateStaticParams() {
  return getAllSlugs().map(slug => ({ slug }));
}


type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const article = getArticleBySlug(slug);
  if (!article) {
    return { title: 'Article Not Found | Settle In Peace' };
  }
  return {
    title: `${article.title} | Settle In Peace`,
    description: article.description,
    alternates: { canonical: `/learn/${article.slug}` },
    keywords: article.keywords,
    authors: [{ name: article.author }],
    openGraph: {
      title: article.title,
      description: article.description,
      type: 'article',
      publishedTime: article.publishedAt,
      modifiedTime: article.updatedAt,
      authors: [article.author],
    },
    twitter: {
      card: 'summary_large_image',
      title: article.title,
      description: article.description,
    },
  };
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function renderBlock(block: ContentBlock, idx: number) {
  switch (block.type) {
    case 'h2':
      return (
        <h2
          key={idx}
          className="text-2xl font-black text-black dark:text-white mt-10 mb-4 scroll-mt-24"
        >
          {block.text}
        </h2>
      );
    case 'h3':
      return (
        <h3 key={idx} className="text-xl font-bold text-black dark:text-white mt-8 mb-3">
          {block.text}
        </h3>
      );
    case 'p':
      return (
        <p key={idx} className="text-zinc-700 dark:text-zinc-300 leading-relaxed mb-4">
          {block.text}
        </p>
      );
    case 'ul':
      return (
        <ul
          key={idx}
          className="list-disc pl-6 space-y-2 text-zinc-700 dark:text-zinc-300 mb-4 leading-relaxed"
        >
          {block.items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      );
    case 'ol':
      return (
        <ol
          key={idx}
          className="list-decimal pl-6 space-y-2 text-zinc-700 dark:text-zinc-300 mb-4 leading-relaxed"
        >
          {block.items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ol>
      );
    case 'callout':
      return (
        <div
          key={idx}
          className="my-6 bg-blue-50 dark:bg-blue-950/40 border-l-4 border-blue-500 rounded-r-xl p-5"
        >
          <p className="text-blue-900 dark:text-blue-200 leading-relaxed font-medium">
            {block.text}
          </p>
        </div>
      );
    default:
      return null;
  }
}

export default async function ArticlePage({ params }: Props) {
  const { slug } = await params;
  const article = getArticleBySlug(slug);
  if (!article) notFound();

  const related = getRelatedArticles(slug, 3);

  // Schema.org Article structured data for SEO.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    description: article.description,
    author: { '@type': 'Organization', name: article.author },
    publisher: {
      '@type': 'Organization',
      name: 'Settle In Peace',
    },
    datePublished: article.publishedAt,
    dateModified: article.updatedAt,
    keywords: article.keywords.join(', '),
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `/learn/${article.slug}`,
    },
  };

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Breadcrumb */}
      <div className="max-w-3xl mx-auto px-4 pt-8">
        <nav className="text-sm text-zinc-500 dark:text-zinc-400">
          <Link href="/" className="hover:text-blue-600 dark:hover:text-blue-400">
            Home
          </Link>
          <span className="mx-2">/</span>
          <Link href="/learn" className="hover:text-blue-600 dark:hover:text-blue-400">
            Learn
          </Link>
          <span className="mx-2">/</span>
          <span className="text-zinc-700 dark:text-zinc-300">{article.category}</span>
        </nav>
      </div>

      {/* Article header */}
      <header className="max-w-3xl mx-auto px-4 pt-8 pb-10">
        <span className="inline-block text-xs font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950 rounded-full px-3 py-1 mb-4">
          {article.category}
        </span>
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black leading-tight text-black dark:text-white mb-5">
          {article.title}
        </h1>
        <p className="text-lg text-zinc-600 dark:text-zinc-400 leading-relaxed mb-6">
          {article.excerpt}
        </p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-zinc-500 dark:text-zinc-400 border-t border-zinc-100 dark:border-zinc-800 pt-5">
          <span className="font-medium text-zinc-700 dark:text-zinc-300">{article.author}</span>
          <span>·</span>
          <span>Updated {formatDate(article.updatedAt)}</span>
          <span>·</span>
          <span>{article.readingTime} min read</span>
        </div>
      </header>

      {/* Article body */}
      <article className="max-w-3xl mx-auto px-4 pb-16">
        <div className="text-base">{article.content.map(renderBlock)}</div>

        {/* Disclaimer */}
        <div className="mt-12 p-5 bg-zinc-50 dark:bg-zinc-900 rounded-xl border border-zinc-100 dark:border-zinc-800">
          <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
            <strong className="text-zinc-600 dark:text-zinc-300">Disclaimer:</strong> This article
            is for educational purposes only and is not legal, tax, or financial advice. Debt
            settlement may negatively impact your credit score, and forgiven debt over $600 may be
            taxable. Results vary based on individual circumstances. Consult a qualified
            professional before making financial decisions.
          </p>
        </div>
      </article>

      {/* CTA */}
      <section className="py-12 px-4 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-zinc-950 dark:to-zinc-900">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-2xl font-black text-black dark:text-white mb-3">
            See what debt relief could look like for you
          </h2>
          <p className="text-zinc-600 dark:text-zinc-400 mb-6">
            Take the free 2-minute assessment. No credit check, no obligation.
          </p>
          <Link
            href="/assessment"
            className="inline-block px-8 py-3.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all shadow-lg"
          >
            Get My Free Assessment →
          </Link>
        </div>
      </section>

      {/* Related articles */}
      {related.length > 0 && (
        <section className="py-16 px-4 bg-white dark:bg-black">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-2xl font-black text-black dark:text-white mb-8">Keep Reading</h2>
            <div className="grid md:grid-cols-3 gap-6">
              {related.map(rel => (
                <Link
                  key={rel.slug}
                  href={`/learn/${rel.slug}`}
                  className="group flex flex-col bg-zinc-50 dark:bg-zinc-900 rounded-2xl border border-zinc-100 dark:border-zinc-800 p-6 hover:shadow-lg hover:-translate-y-0.5 transition-all"
                >
                  <span className="inline-block self-start text-xs font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950 rounded-full px-2.5 py-0.5 mb-3">
                    {rel.category}
                  </span>
                  <h3 className="text-base font-bold text-black dark:text-white mb-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors leading-snug">
                    {rel.title}
                  </h3>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed flex-1">
                    {rel.excerpt}
                  </p>
                  <span className="text-xs text-zinc-400 mt-4">{rel.readingTime} min read</span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
