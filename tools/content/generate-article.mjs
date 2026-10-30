#!/usr/bin/env node
/**
 * AI article generator — produces one SEO article per run and appends it to
 * settle-web/src/content/articles.ts. After a build+deploy, the new article
 * enters feed.xml → blog_to_queue picks it up → Buffer posts it daily.
 *
 * Env (sourced from settle-api/.env or set directly):
 *   AI_BASE_URL, AI_API_KEY, AI_MODEL  — OpenAI-compatible chat endpoint
 *
 * Usage: node generate-article.mjs [--dry-run]
 * Safe to run repeatedly — skips if the slug already exists.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ARTICLES_TS = path.join(REPO, 'settle-web/src/content/articles.ts');
const TOPICS_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'topics.txt');
const DRY = process.argv.includes('--dry-run');

// Load env from settle-api/.env if present
const envFile = path.join(REPO, 'settle-api/.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const i = line.indexOf('=');
    if (i > 0) {
      const k = line.slice(0, i).trim();
      const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

const BASE = process.env.AI_BASE_URL || 'http://localhost:11434/v1';
const KEY = process.env.AI_API_KEY || 'ollama';
const MODEL = process.env.AI_MODEL || 'qwen3:8b';

const CATEGORIES = ['Debt Settlement', 'Credit Repair', 'Budgeting', 'Debt Relief Options', 'Collections'];

async function chat(messages, json = true) {
  const res = await fetch(`${BASE.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ model: MODEL, messages, temperature: 0.7, ...(json ? { response_format: { type: 'json_object' } } : {}) }),
    // Local Ollama inference is slow — give it up to 15 min per call.
    signal: AbortSignal.timeout(15 * 60 * 1000),
  });
  if (!res.ok) throw new Error(`AI ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
}

function parseJsonOut(text) {
  // strip <think>...</think> blocks and markdown fences qwen emits
  let t = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  t = t.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('no JSON object in model output');
  return t.slice(start, end + 1);
}

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

function existingSlugs(src) {
  const slugs = new Set();
  for (const m of src.matchAll(/slug:\s*'([^']+)'/g)) slugs.add(m[1]);
  return slugs;
}

function pickTopic(src) {
  const slugs = existingSlugs(src);
  const topics = fs.existsSync(TOPICS_PATH)
    ? fs.readFileSync(TOPICS_PATH, 'utf8').split('\n').map((t) => t.trim()).filter(Boolean)
    : [];
  const used = topics.filter((t) => slugs.has(slugify(t)));
  const remaining = topics.filter((t) => !slugs.has(slugify(t)));
  return { topic: remaining[0] || null, used: used.length, remaining: remaining.length };
}

async function generate(topic) {
  const article = JSON.parse(parseJsonOut(await chat([
    { role: 'system', content:
      'You write honest, plain-English debt-relief educational articles for Settle In Peace (settleinpeace.com), a debt-relief marketplace. Output ONLY valid JSON matching this schema: {"title":string,"description":string,"category":string,"keywords":string[],"excerpt":string,"readingTime":number,"content":ContentBlock[]} where ContentBlock = {"type":"h2","text":string} | {"type":"p","text":string} | {"type":"ul","items":string[]} | {"type":"ol","items":string[]} | {"type":"callout","text":string}. Rules: 6-10 content blocks, 2-4 h2 sections, factual non-promotional tone, one "callout" with a balanced pros/cons warning, end with a final "p" block telling readers they can compare vetted options at settleinpeace.com/compare or take the free assessment at settleinpeace.com/assessment (render as plain text, no markdown).' },
    { role: 'user', content: `Write an article about: ${topic}. Category should be one of: ${CATEGORIES.join(', ')}.` },
  ])));
  return article;
}

function appendArticle(src, article) {
  const slug = slugify(article.title);
  const entry = `  {
    slug: '${slug}',
    title: ${JSON.stringify(article.title)},
    description: ${JSON.stringify(article.description)},
    category: ${JSON.stringify(article.category)},
    author: 'Settle In Peace Editorial Team',
    publishedAt: '${new Date().toISOString().slice(0, 10)}',
    updatedAt: '${new Date().toISOString().slice(0, 10)}',
    readingTime: ${article.readingTime || 6},
    keywords: ${JSON.stringify(article.keywords || [])},
    excerpt: ${JSON.stringify(article.excerpt)},
    content: ${JSON.stringify(article.content, null, 2).replace(/\n/g, '\n    ')},
  },\n`;
  // Insert before the closing `];` of the articles array
  const idx = src.lastIndexOf('];');
  if (idx === -1) throw new Error('articles.ts: closing ]; not found');
  return src.slice(0, idx) + entry + src.slice(idx);
}

const src = fs.readFileSync(ARTICLES_TS, 'utf8');
const { topic, used, remaining } = pickTopic(src);
if (!topic) {
  console.log(`All topics used (${used}). Add more to tools/content/topics.txt.`);
  process.exit(0);
}
console.log(`Generating: "${topic}" (${remaining} remaining)`);
const article = await generate(topic);
const next = appendArticle(src, article);
if (DRY) {
  console.log('--- DRY RUN — not written ---');
  console.log(article.title, '|', article.content.length, 'blocks');
} else {
  fs.writeFileSync(ARTICLES_TS, next);
  console.log(`✓ Appended "${article.title}" → ${ARTICLES_TS}`);
}
