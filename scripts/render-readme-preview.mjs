import { readFile, mkdir, writeFile } from 'node:fs/promises';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';

const source = await readFile('README.md', 'utf8');
const body = renderToStaticMarkup(React.createElement(ReactMarkdown, {
  remarkPlugins: [remarkGfm],
  urlTransform: url => /^(?:https?:|#)/i.test(url) ? defaultUrlTransform(url) : `../../${defaultUrlTransform(url)}`,
}, source));
const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Super Codex · 首页预览</title><style>body{margin:0;background:#f6f8fa;color:#1f2328;font:16px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei UI",sans-serif}main{max-width:900px;margin:30px auto;padding:32px 44px;border:1px solid #d1d9e0;border-radius:8px;background:white}h1,h2{border-bottom:1px solid #d1d9e0;padding-bottom:.3em}h2{margin-top:1.5em}img{max-width:100%;height:auto;display:block;margin:20px auto}a{color:#0969da}pre{overflow:auto;background:#f6f8fa;padding:16px;border-radius:6px}code{font-family:Consolas,monospace}p{margin:16px 0}@media(max-width:650px){main{margin:0;padding:22px;border:0}}</style><main>${body}</main></html>`;
await mkdir('artifacts/release-review', { recursive: true });
await writeFile('artifacts/release-review/index.html', html);
