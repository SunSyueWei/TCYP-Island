// 列出 index.html 內嵌 <script> 的 sha256，貼到 CSP 的 script-src
// 用法：node tools/csp-hashes.mjs
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
for (const [, body] of html.matchAll(/<script(?: [^>]*)?>([\s\S]*?)<\/script>/g)) {
  if (body.trim()) console.log(`'sha256-${createHash('sha256').update(body).digest('base64')}'`);
}
