import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import crypto from 'crypto';

export async function fetchUrl(url: string): Promise<{ text: string; title: string }> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MindGraph/1.0)' },
    timeout: 15000,
  } as any);

  if (!res.ok) throw new Error(`Failed to fetch URL: ${res.status}`);
  const html = await res.text();
  const $ = cheerio.load(html);

  // Remove boilerplate
  $('script, style, nav, footer, header, aside, iframe, noscript, [role="navigation"]').remove();

  const title = $('title').text().trim() || $('h1').first().text().trim() || url;

  // Extract readable text — prefer article/main content
  const content = ($('article, main, [role="main"], .content, .post-content, .article-body').first().text()
    || $('body').text())
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 30000);

  return { text: content, title };
}

export async function extractPdfText(buffer: Buffer): Promise<string> {
  // Dynamic import to avoid issues if pdf-parse isn't installed
  const pdfParse = (await import('pdf-parse')).default;
  const data = await pdfParse(buffer);
  return data.text.slice(0, 30000);
}

export function hashUrl(url: string): string {
  return crypto.createHash('sha256').update(url).digest('hex');
}
