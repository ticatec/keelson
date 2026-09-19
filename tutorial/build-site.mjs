import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TUTORIAL_DIR = __dirname;
const SITE_DIR = path.join(TUTORIAL_DIR, 'site');

const CHAPTERS = [
  {
    id: 'index',
    fileZh: 'README_CN.md',
    fileEn: 'README.md',
    outName: 'index.html',
    num: '00',
    titleZh: '概览与教程目录',
    titleEn: 'Overview & Table of Contents',
    descZh: '教程导读与各章索引',
    descEn: 'Tutorial overview & index'
  },
  {
    id: '01-getting-started',
    fileZh: '01-getting-started_CN.md',
    fileEn: '01-getting-started.md',
    outName: '01-getting-started.html',
    num: '01',
    titleZh: '起步',
    titleEn: 'Getting Started',
    descZh: '从空目录到一个能响应请求的服务',
    descEn: 'From empty directory to responsive service'
  },
  {
    id: '02-layers-and-transactions',
    fileZh: '02-layers-and-transactions_CN.md',
    fileEn: '02-layers-and-transactions.md',
    outName: '02-layers-and-transactions.html',
    num: '02',
    titleZh: '分层与事务',
    titleEn: 'Layers & Transactions',
    descZh: '为什么分四层，事务如何贯穿',
    descEn: 'Why four layers and declarative transactions'
  },
  {
    id: '03-wiring',
    fileZh: '03-wiring_CN.md',
    fileEn: '03-wiring.md',
    outName: '03-wiring.html',
    num: '03',
    titleZh: '装配与依赖注入',
    titleEn: 'Wiring & Dependency Injection',
    descZh: '类与类互相发现，解耦初始化顺序',
    descEn: 'Component discovery & initialization'
  },
  {
    id: '04-http-layer',
    fileZh: '04-http-layer_CN.md',
    fileEn: '04-http-layer.md',
    outName: '04-http-layer.html',
    num: '04',
    titleZh: 'HTTP 层',
    titleEn: 'HTTP Layer',
    descZh: '路由、控制器、校验与错误映射',
    descEn: 'Routes, controllers, validation & errors'
  },
  {
    id: '05-identity',
    fileZh: '05-identity_CN.md',
    fileEn: '05-identity.md',
    outName: '05-identity.html',
    num: '05',
    titleZh: '身份与访问控制',
    titleEn: 'Identity & Access Control',
    descZh: 'req.user 来源与鉴权机制',
    descEn: 'req.user origin & auth mechanism'
  },
  {
    id: '06-logging-and-health',
    fileZh: '06-logging-and-health_CN.md',
    fileEn: '06-logging-and-health.md',
    outName: '06-logging-and-health.html',
    num: '06',
    titleZh: '日志与健康检查',
    titleEn: 'Logging & Health Checks',
    descZh: '记录规范、敏感信息与 K8s 探针',
    descEn: 'Logging policies & K8s probes'
  },
  {
    id: '07-background-work',
    fileZh: '07-background-work_CN.md',
    fileEn: '07-background-work.md',
    outName: '07-background-work.html',
    num: '07',
    titleZh: '后台任务与优雅关停',
    titleEn: 'Background Work & Shutdown',
    descZh: '周期任务调度与优雅关停保护',
    descEn: 'Scheduled tasks & graceful shutdown'
  },
  {
    id: '08-config-and-cache',
    fileZh: '08-config-and-cache_CN.md',
    fileEn: '08-config-and-cache.md',
    outName: '08-config-and-cache.html',
    num: '08',
    titleZh: '配置与缓存',
    titleEn: 'Config & Cache',
    descZh: 'YAML、Nacos、Consul 与 Redis 集成',
    descEn: 'Local YAML, Nacos, Consul & Redis'
  },
  {
    id: '09-production-checklist',
    fileZh: '09-production-checklist_CN.md',
    fileEn: '09-production-checklist.md',
    outName: '09-production-checklist.html',
    num: '09',
    titleZh: '上线之前检查清单',
    titleEn: 'Production Checklist',
    descZh: '生产环境准备与关键排查项',
    descEn: 'Production readiness checklist'
  }
];

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[\s\t\n]+/g, '-')
    .replace(/[^\w\u4e00-\u9fa5\-_]/g, '')
    .replace(/-+/g, '-');
}

// Convert markdown links e.g. [title](01-getting-started_CN.md) -> [title](01-getting-started.html)
function rewriteLinks(mdContent, isZh) {
  return mdContent.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, text, url) => {
    // Keep external or anchor-only
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('#')) {
      return match;
    }

    // Split anchor if present
    const [pathPart, hashPart] = url.split('#');
    const hash = hashPart ? `#${hashPart}` : '';

    if (pathPart === 'README_CN.md' || pathPart === 'README.md') {
      return `[${text}](index.html${hash})`;
    }

    if (pathPart.startsWith('../README')) {
      return `[${text}](https://github.com/ticatec/keelson#readme)`;
    }

    // Handle 01-getting-started_CN.md -> 01-getting-started.html
    const cnMatch = pathPart.match(/^(\d{2}-[^.]+)_CN\.md$/);
    if (cnMatch) {
      return `[${text}](${cnMatch[1]}.html${hash})`;
    }

    const enMatch = pathPart.match(/^(\d{2}-[^.]+)\.md$/);
    if (enMatch) {
      return `[${text}](${enMatch[1]}.html${hash})`;
    }

    return match;
  });
}

// Syntax Highlighting Engine
function highlightCode(code, lang) {
  const language = (lang || '').toLowerCase().trim();

  let rules = [];
  if (['typescript', 'javascript', 'ts', 'js'].includes(language)) {
    rules = [
      { type: 'comment', regex: /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)/ },
      { type: 'string', regex: /('(?:\\'|[^'])*'|"(?:\\"|[^"])*"|`(?:\\`|[^`])*`)/ },
      { type: 'decorator', regex: /(@[a-zA-Z_$][\w$]*)/ },
      { type: 'number', regex: /\b\d+(?:\.\d+)?\b/ },
      { type: 'keyword', regex: /\b(import|export|from|class|extends|implements|interface|type|const|let|var|function|async|await|return|throw|new|if|else|for|while|switch|case|break|continue|try|catch|finally|typeof|instanceof|private|public|protected|readonly|static|get|set|true|false|null|undefined|void|default)\b/ },
      { type: 'builtin', regex: /\b(Promise|Record|Array|Map|Set|Error|Date|RegExp|Object|Function|CommonDAO|CommonService|CommonRepository|CommonController|KeelsonServer|ServiceResult)\b/ },
      { type: 'function', regex: /\b([a-zA-Z_$][\w$]*)(?=\s*\()/ }
    ];
  } else if (language === 'json') {
    rules = [
      { type: 'property', regex: /("(?:\\"|[^"])*")(?=\s*:)/ },
      { type: 'string', regex: /("(?:\\"|[^"])*")/ },
      { type: 'number', regex: /\b-?\d+(?:\.\d+)?\b/ },
      { type: 'keyword', regex: /\b(true|false|null)\b/ }
    ];
  } else if (['sql', 'pgsql', 'mysql'].includes(language)) {
    rules = [
      { type: 'comment', regex: /(--[^\n]*|\/\*[\s\S]*?\*\/)/ },
      { type: 'string', regex: /('(?:\\'|[^'])*')/ },
      { type: 'keyword', regex: /\b(SELECT|FROM|WHERE|INSERT|INTO|UPDATE|DELETE|SET|VALUES|JOIN|LEFT|RIGHT|INNER|ON|GROUP|BY|ORDER|ASC|DESC|LIMIT|OFFSET|HAVING|CREATE|TABLE|ALTER|DROP|PRIMARY|KEY|FOREIGN|REFERENCES|NOT|NULL|DEFAULT|AND|OR|AS|IN|IS|EXISTS|RETURNING)\b/i },
      { type: 'number', regex: /\b\d+\b/ }
    ];
  } else if (['bash', 'sh', 'shell', 'zsh'].includes(language)) {
    rules = [
      { type: 'comment', regex: /(#[^\n]*)/ },
      { type: 'string', regex: /('(?:\\'|[^'])*'|"(?:\\"|[^"])*")/ },
      { type: 'keyword', regex: /\b(pnpm|npm|npx|yarn|git|node|cd|ls|mkdir|rm|curl|docker|cat|echo|exit|export)\b/ },
      { type: 'property', regex: /(-{1,2}[a-zA-Z0-9_-]+)/ }
    ];
  } else if (['yaml', 'yml'].includes(language)) {
    rules = [
      { type: 'comment', regex: /(#[^\n]*)/ },
      { type: 'string', regex: /('(?:\\'|[^'])*'|"(?:\\"|[^"])*")/ },
      { type: 'property', regex: /(^[ \t]*[a-zA-Z0-9_\-]+)(?=\s*:)/m },
      { type: 'keyword', regex: /\b(true|false|yes|no|null)\b/i },
      { type: 'number', regex: /\b\d+(?:\.\d+)?\b/ }
    ];
  }

  if (rules.length === 0) {
    return escapeHtml(code);
  }

  let remaining = code;
  let result = '';

  while (remaining.length > 0) {
    let earliestMatch = null;
    let matchIndex = remaining.length;
    let matchRule = null;

    for (const rule of rules) {
      const match = rule.regex.exec(remaining);
      if (match && match.index < matchIndex) {
        matchIndex = match.index;
        earliestMatch = match;
        matchRule = rule;
      }
    }

    if (!earliestMatch) {
      result += escapeHtml(remaining);
      break;
    }

    if (matchIndex > 0) {
      result += escapeHtml(remaining.substring(0, matchIndex));
    }

    const text = earliestMatch[0];
    result += `<span class="token ${matchRule.type}">${escapeHtml(text)}</span>`;
    remaining = remaining.substring(matchIndex + text.length);
  }

  return result;
}

// Helper to join lines within a single markdown paragraph smoothly
function joinMarkdownLines(lines) {
  let result = '';
  const isCjk = (c) => /[\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef]/.test(c);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (i === 0) {
      result = line;
    } else {
      const prevChar = result.slice(-1);
      const nextChar = line.charAt(0);
      if (isCjk(prevChar) && isCjk(nextChar)) {
        result += line;
      } else {
        result += ' ' + line;
      }
    }
  }
  return result;
}

// Parse markdown to HTML with TOC extraction
function parseMarkdown(rawContent, isZh) {
  const content = rewriteLinks(rawContent, isZh);
  const lines = content.split(/\r?\n/);
  const toc = [];
  const htmlParts = [];

  let inCode = false;
  let codeLang = '';
  let codeBuffer = [];

  let inTable = false;
  let tableHeaderParsed = false;
  let tableRows = [];

  let inList = false;
  let listType = ''; // 'ul' | 'ol'

  let paragraphBuffer = [];
  let blockquoteBuffer = [];

  function parseInline(text) {
    if (!text) return '';
    let res = escapeHtml(text);

    // 1. Inline code `code`
    res = res.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

    // 2. Bold **text** or __text__
    res = res.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    res = res.replace(/__([^_]+)__/g, '<strong>$1</strong>');

    // 3. Extract and protect links [text](url) before processing italics
    const links = [];
    res = res.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, label, url) => {
      const idx = links.length;
      links.push(`<a href="${url}" class="doc-link">${label}</a>`);
      return `___LINK_TOKEN_${idx}___`;
    });

    // 4. Italic *text* or _text_
    res = res.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    res = res.replace(/(^|[\s\(\[\{<])_([^_]+)_(?=[\s\)\]\}>.,;:!?]|$)/g, '$1<em>$2</em>');

    // 5. Restore protected links
    res = res.replace(/___LINK_TOKEN_(\d+)___/g, (m, idx) => links[Number(idx)]);

    return res;
  }

  function flushParagraph() {
    if (paragraphBuffer.length > 0) {
      const text = joinMarkdownLines(paragraphBuffer);
      htmlParts.push(`<p>${parseInline(text)}</p>`);
      paragraphBuffer = [];
    }
  }

  function flushBlockquote() {
    if (blockquoteBuffer.length > 0) {
      const text = joinMarkdownLines(blockquoteBuffer);
      htmlParts.push(`<blockquote><p>${parseInline(text)}</p></blockquote>`);
      blockquoteBuffer = [];
    }
  }

  function closeList() {
    if (inList) {
      htmlParts.push(`</${listType}>`);
      inList = false;
      listType = '';
    }
  }

  function closeTable() {
    if (inTable) {
      let tHtml = '<div class="table-container"><table>';
      if (tableRows.length > 0) {
        tHtml += '<thead><tr>';
        for (const cell of tableRows[0]) {
          tHtml += `<th>${parseInline(cell)}</th>`;
        }
        tHtml += '</tr></thead>';
      }
      if (tableRows.length > 1) {
        tHtml += '<tbody>';
        for (let i = 1; i < tableRows.length; i++) {
          tHtml += '<tr>';
          for (const cell of tableRows[i]) {
            tHtml += `<td>${parseInline(cell)}</td>`;
          }
          tHtml += '</tr>';
        }
        tHtml += '</tbody>';
      }
      tHtml += '</table></div>';
      htmlParts.push(tHtml);
      inTable = false;
      tableHeaderParsed = false;
      tableRows = [];
    }
  }

  // Remove the top language switcher line if present in markdown e.g. "中文 | [English](...)"
  let skipLangSwitcher = true;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check code fence
    const codeFenceMatch = line.match(/^```(\w+)?/);
    if (codeFenceMatch) {
      flushParagraph();
      flushBlockquote();
      closeList();
      closeTable();
      if (!inCode) {
        inCode = true;
        codeLang = codeFenceMatch[1] || 'text';
        codeBuffer = [];
      } else {
        inCode = false;
        const rawCode = codeBuffer.join('\n');
        const highlighted = highlightCode(rawCode, codeLang);
        const codeId = 'code-' + Math.random().toString(36).substring(2, 9);
        htmlParts.push(`
<div class="code-block-wrapper">
  <div class="code-block-header">
    <span class="code-lang-tag">${escapeHtml(codeLang)}</span>
    <button class="copy-btn" data-code-id="${codeId}" title="复制代码">
      <svg class="copy-icon" viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
      <span class="copy-label">复制</span>
    </button>
  </div>
  <pre class="code-block"><code id="${codeId}" class="language-${codeLang}">${highlighted}</code></pre>
</div>`);
      }
      continue;
    }

    if (inCode) {
      codeBuffer.push(line);
      continue;
    }

    // Skip the top markdown language switcher line (e.g. "中文 | [English]..." or "[English] | 中文...")
    if (skipLangSwitcher && (line.includes('中文 | [English]') || line.includes('[English]') || line.includes('[中文]') || line.includes('English | [中文]'))) {
      continue;
    }
    if (line.trim().length > 0 && !line.startsWith('#')) {
      skipLangSwitcher = false;
    }

    // Empty line
    if (line.trim() === '') {
      flushParagraph();
      flushBlockquote();
      closeList();
      closeTable();
      continue;
    }

    // Table line
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      flushParagraph();
      flushBlockquote();
      closeList();
      const cells = line
        .trim()
        .slice(1, -1)
        .split('|')
        .map(c => c.trim());

      // Check if this is the separator row | --- | --- |
      if (cells.every(c => /^:?-+:?$/.test(c))) {
        tableHeaderParsed = true;
        continue;
      }

      inTable = true;
      tableRows.push(cells);
      continue;
    } else {
      closeTable();
    }

    // Headings
    const headingMatch = line.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      flushParagraph();
      flushBlockquote();
      closeList();
      const level = headingMatch[1].length;
      const rawTitle = headingMatch[2].trim();
      const cleanTitle = rawTitle.replace(/`([^`]+)`/g, '$1');
      const id = slugify(cleanTitle);

      if (level >= 2 && level <= 3) {
        toc.push({ level, title: cleanTitle, id });
      }

      htmlParts.push(`<h${level} id="${id}" class="heading-anchor"><a href="#${id}" class="header-link">#</a> ${parseInline(rawTitle)}</h${level}>`);
      continue;
    }

    // Blockquote
    if (line.startsWith('>')) {
      flushParagraph();
      closeList();
      const bqContent = line.replace(/^>\s?/, '');
      blockquoteBuffer.push(bqContent.trim());
      continue;
    } else {
      flushBlockquote();
    }

    // Horizontal rule
    if (/^(\*\*\*|---|___)$/.test(line.trim())) {
      flushParagraph();
      closeList();
      htmlParts.push('<hr class="divider" />');
      continue;
    }

    // Unordered list
    const ulMatch = line.match(/^([*\-+])\s+(.+)$/);
    if (ulMatch) {
      flushParagraph();
      if (!inList || listType !== 'ul') {
        closeList();
        inList = true;
        listType = 'ul';
        htmlParts.push('<ul class="doc-list">');
      }
      htmlParts.push(`<li>${parseInline(ulMatch[2])}</li>`);
      continue;
    }

    // Ordered list
    const olMatch = line.match(/^(\d+)\.\s+(.+)$/);
    if (olMatch) {
      flushParagraph();
      if (!inList || listType !== 'ol') {
        closeList();
        inList = true;
        listType = 'ol';
        htmlParts.push('<ol class="doc-list">');
      }
      htmlParts.push(`<li>${parseInline(olMatch[2])}</li>`);
      continue;
    }

    closeList();

    // Regular paragraph lines accumulated
    paragraphBuffer.push(line.trim());
  }

  flushParagraph();
  flushBlockquote();
  closeList();
  closeTable();

  return {
    html: htmlParts.join('\n'),
    toc
  };
}

// Generate the complete HTML document
function renderPage({ currentChapter, isZh, htmlContent, toc }) {
  const lang = isZh ? 'zh' : 'en';
  const siteTitle = isZh ? 'Keelson 官方教程' : 'Keelson Official Tutorial';
  const currentTitle = isZh ? currentChapter.titleZh : currentChapter.titleEn;
  const pageTitle = `${currentChapter.num === '00' ? '' : currentChapter.num + '. '}${currentTitle} | ${siteTitle}`;
  const counterpartLang = isZh ? 'en' : 'zh';
  const counterpartUrl = `../${counterpartLang}/${currentChapter.outName}`;
  const rootPrefix = '../';

  const currentIndex = CHAPTERS.findIndex(c => c.id === currentChapter.id);
  const prevChapter = currentIndex > 0 ? CHAPTERS[currentIndex - 1] : null;
  const nextChapter = currentIndex < CHAPTERS.length - 1 ? CHAPTERS[currentIndex + 1] : null;

  // Sidebar navigation items
  const navItems = CHAPTERS.map((ch, idx) => {
    const isActive = ch.id === currentChapter.id;
    const title = isZh ? ch.titleZh : ch.titleEn;
    const desc = isZh ? ch.descZh : ch.descEn;
    const link = ch.outName;

    let subNavHtml = '';
    if (isActive && toc.length > 0) {
      subNavHtml = `
      <ul class="sidebar-subnav">
        ${toc.map(item => `
          <li class="sidebar-subnav-item level-${item.level}">
            <a href="#${item.id}" class="subnav-link" data-toc-target="${item.id}">
              ${escapeHtml(item.title)}
            </a>
          </li>
        `).join('')}
      </ul>`;
    }

    return `
      <li class="nav-item ${isActive ? 'active' : ''}">
        <a href="${link}" class="nav-link" title="${escapeHtml(desc)}">
          <span class="chapter-badge">${ch.num}</span>
          <span class="chapter-text">
            <span class="chapter-title">${escapeHtml(title)}</span>
            <span class="chapter-desc">${escapeHtml(desc)}</span>
          </span>
        </a>
        ${subNavHtml}
      </li>
    `;
  }).join('');

  // Right-side TOC (On this page)
  let rightTocHtml = '';
  if (toc.length > 0) {
    rightTocHtml = `
      <aside class="right-toc-container">
        <div class="right-toc-inner">
          <div class="toc-header">${isZh ? '本页目录' : 'On this page'}</div>
          <ul class="right-toc-list">
            ${toc.map(item => `
              <li class="toc-item level-${item.level}">
                <a href="#${item.id}" class="toc-link" data-anchor="${item.id}">
                  ${escapeHtml(item.title)}
                </a>
              </li>
            `).join('')}
          </ul>
        </div>
      </aside>
    `;
  }

  // Footer Prev/Next Chapter Cards
  let footerNavHtml = `
    <div class="chapter-pagination">
      ${prevChapter ? `
        <a href="${prevChapter.outName}" class="pagination-btn prev-btn">
          <span class="pagination-sub">${isZh ? '← 上一章' : '← Previous'}</span>
          <span class="pagination-title">${prevChapter.num}. ${escapeHtml(isZh ? prevChapter.titleZh : prevChapter.titleEn)}</span>
        </a>
      ` : '<div class="pagination-placeholder"></div>'}

      ${nextChapter ? `
        <a href="${nextChapter.outName}" class="pagination-btn next-btn">
          <span class="pagination-sub">${isZh ? '下一章 →' : 'Next →'}</span>
          <span class="pagination-title">${nextChapter.num}. ${escapeHtml(isZh ? nextChapter.titleZh : nextChapter.titleEn)}</span>
        </a>
      ` : '<div class="pagination-placeholder"></div>'}
    </div>
  `;

  return `<!DOCTYPE html>
<html lang="${isZh ? 'zh-CN' : 'en'}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(pageTitle)}</title>
  <meta name="description" content="Keelson TypeScript Framework Official Tutorial - Enterprise TypeScript for Express">
  <link rel="stylesheet" href="${rootPrefix}assets/style.css">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
</head>
<body class="theme-auto">
  <!-- Top Navigation Header -->
  <header class="top-navbar">
    <div class="navbar-left">
      <button class="mobile-menu-toggle" id="menuToggle" aria-label="Toggle Navigation">
        <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" stroke-width="2" fill="none"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
      </button>
      <a href="index.html" class="brand-logo">
        <span class="brand-icon">⚡</span>
        <span class="brand-name">Keelson</span>
        <span class="brand-badge">${isZh ? '教程' : 'Tutorial'}</span>
      </a>
    </div>

    <div class="navbar-right">
      <!-- Search Input -->
      <div class="search-box">
        <svg class="search-icon" viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
        <input type="text" id="searchInput" placeholder="${isZh ? '在章节中快速搜索...' : 'Search chapters...'}" />
        <span class="search-kbd">⌘K</span>
      </div>

      <!-- Language Switch -->
      <a href="${counterpartUrl}" class="lang-switch-btn" title="${isZh ? '切换为英文' : 'Switch to Chinese'}">
        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
        <span>${isZh ? 'English' : '中文'}</span>
      </a>

      <!-- Theme Switch -->
      <button class="theme-toggle-btn" id="themeToggle" aria-label="Toggle Theme">
        <svg class="sun-icon" viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>
        <svg class="moon-icon" viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
      </button>

      <!-- GitHub Link -->
      <a href="https://github.com/ticatec/keelson" target="_blank" rel="noopener noreferrer" class="github-link" title="GitHub Repository">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>
      </a>
    </div>
  </header>

  <div class="layout-container">
    <!-- Left Navigation Sidebar -->
    <aside class="sidebar" id="sidebar">
      <div class="sidebar-header">
        <div class="sidebar-title">${isZh ? '教程目录' : 'Chapters'}</div>
        <span class="chapter-count">10 ${isZh ? '篇文档' : 'Docs'}</span>
      </div>
      <nav class="sidebar-nav">
        <ul class="nav-list" id="navList">
          ${navItems}
        </ul>
      </nav>
      <div class="sidebar-footer">
        <a href="https://github.com/ticatec/keelson" target="_blank" rel="noopener">Keelson v1.0.0</a>
        <span>·</span>
        <a href="${rootPrefix}index.html">${isZh ? '返回首页' : 'Home'}</a>
      </div>
    </aside>

    <!-- Overlay for mobile drawer -->
    <div class="sidebar-overlay" id="sidebarOverlay"></div>

    <!-- Main Content Area -->
    <main class="main-wrapper">
      <div class="content-container">
        <!-- Breadcrumbs -->
        <nav class="breadcrumb-nav">
          <a href="index.html" class="crumb-link">Keelson</a>
          <span class="crumb-sep">/</span>
          <span class="crumb-link">${isZh ? '教程' : 'Tutorial'}</span>
          <span class="crumb-sep">/</span>
          <span class="crumb-current">${escapeHtml(currentTitle)}</span>
        </nav>

        <!-- Markdown Generated Content -->
        <article class="markdown-body">
          ${htmlContent}
        </article>

        <!-- Previous / Next Navigation -->
        ${footerNavHtml}

        <!-- Document Footer -->
        <footer class="site-footer">
          <div class="footer-left">
            <p>© ${new Date().getFullYear()} Ticatec Keelson Framework. Released under the MIT License.</p>
          </div>
          <div class="footer-right">
            <a href="${counterpartUrl}" class="footer-lang-link">
              ${isZh ? '🌐 Read in English' : '🌐 中文阅读'}
            </a>
          </div>
        </footer>
      </div>

      <!-- Right Table of Contents -->
      ${rightTocHtml}
    </main>
  </div>

  <script src="${rootPrefix}assets/app.js"></script>
</body>
</html>`;
}

// Generate CSS style with syntax highlighting tokens
function generateCss() {
  return `/* Keelson Tutorial Modern Responsive Design System */
:root {
  --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --font-mono: 'JetBrains Mono', SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;

  /* Light Theme */
  --bg-body: #f8fafc;
  --bg-surface: #ffffff;
  --bg-sidebar: #f1f5f9;
  --bg-subtle: #f8fafc;
  --border-color: #e2e8f0;
  --border-subtle: #edf2f7;

  --text-primary: #0f172a;
  --text-secondary: #475569;
  --text-muted: #64748b;

  --accent-primary: #2563eb;
  --accent-hover: #1d4ed8;
  --accent-subtle: #eff6ff;
  --accent-border: #bfdbfe;

  --code-bg: #0f172a;
  --code-text: #e2e8f0;
  --inline-code-bg: #e2e8f0;
  --inline-code-text: #0f172a;

  --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.08), 0 2px 4px -1px rgba(0, 0, 0, 0.04);
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.08);

  --header-height: 60px;
  --sidebar-width: 290px;
  --toc-width: 230px;

  /* Syntax Highlighting Colors (Dark Code Block Base) */
  --token-keyword: #ff7b72;
  --token-string: #a5d6ff;
  --token-comment: #8b949e;
  --token-decorator: #d2a8ff;
  --token-builtin: #79c0ff;
  --token-function: #58a6ff;
  --token-number: #79c0ff;
  --token-property: #7ee787;
}

[data-theme="dark"] {
  --bg-body: #0b0f19;
  --bg-surface: #111827;
  --bg-sidebar: #0d1322;
  --bg-subtle: #162032;
  --border-color: #1f2937;
  --border-subtle: #1e293b;

  --text-primary: #f9fafb;
  --text-secondary: #94a3b8;
  --text-muted: #64748b;

  --accent-primary: #3b82f6;
  --accent-hover: #60a5fa;
  --accent-subtle: rgba(59, 130, 246, 0.12);
  --accent-border: rgba(59, 130, 246, 0.3);

  --code-bg: #030712;
  --code-text: #e5e7eb;
  --inline-code-bg: #1e293b;
  --inline-code-text: #93c5fd;

  --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.5);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.4);
}

@media (prefers-color-scheme: dark) {
  body.theme-auto {
    --bg-body: #0b0f19;
    --bg-surface: #111827;
    --bg-sidebar: #0d1322;
    --bg-subtle: #162032;
    --border-color: #1f2937;
    --border-subtle: #1e293b;

    --text-primary: #f9fafb;
    --text-secondary: #94a3b8;
    --text-muted: #64748b;

    --accent-primary: #3b82f6;
    --accent-hover: #60a5fa;
    --accent-subtle: rgba(59, 130, 246, 0.12);
    --accent-border: rgba(59, 130, 246, 0.3);

    --code-bg: #030712;
    --code-text: #e5e7eb;
    --inline-code-bg: #1e293b;
    --inline-code-text: #93c5fd;
  }
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html {
  scroll-behavior: smooth;
  scroll-padding-top: calc(var(--header-height) + 20px);
}

body {
  font-family: var(--font-sans);
  background-color: var(--bg-body);
  color: var(--text-primary);
  line-height: 1.65;
  font-size: 15px;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* Top Navbar */
.top-navbar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: var(--header-height);
  background-color: var(--bg-surface);
  border-bottom: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  z-index: 100;
  backdrop-filter: blur(8px);
}

.navbar-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.mobile-menu-toggle {
  display: none;
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 6px;
  border-radius: 6px;
}
.mobile-menu-toggle:hover {
  background: var(--bg-subtle);
  color: var(--text-primary);
}

.brand-logo {
  display: flex;
  align-items: center;
  gap: 8px;
  text-decoration: none;
  color: var(--text-primary);
  font-weight: 700;
  font-size: 1.15rem;
  letter-spacing: -0.02em;
}

.brand-icon {
  font-size: 1.25rem;
}

.brand-badge {
  font-size: 0.75rem;
  font-weight: 600;
  background: var(--accent-subtle);
  color: var(--accent-primary);
  padding: 2px 7px;
  border-radius: 9999px;
  border: 1px solid var(--accent-border);
}

.navbar-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* Search Box */
.search-box {
  position: relative;
  display: flex;
  align-items: center;
  background: var(--bg-body);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 5px 10px;
  width: 220px;
  transition: all 0.2s ease;
}

.search-box:focus-within {
  border-color: var(--accent-primary);
  box-shadow: 0 0 0 2px var(--accent-subtle);
  width: 270px;
}

.search-icon {
  color: var(--text-muted);
  margin-right: 8px;
}

.search-box input {
  border: none;
  background: none;
  outline: none;
  color: var(--text-primary);
  font-size: 0.85rem;
  width: 100%;
}

.search-kbd {
  font-size: 0.7rem;
  color: var(--text-muted);
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  padding: 1px 5px;
  border-radius: 4px;
}

/* Actions in Navbar */
.lang-switch-btn, .theme-toggle-btn, .github-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--text-secondary);
  text-decoration: none;
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid var(--border-color);
  background: var(--bg-surface);
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.lang-switch-btn:hover, .theme-toggle-btn:hover, .github-link:hover {
  color: var(--text-primary);
  background: var(--bg-subtle);
  border-color: var(--text-muted);
}

.theme-toggle-btn .moon-icon { display: none; }
.theme-toggle-btn .sun-icon { display: block; }
[data-theme="dark"] .theme-toggle-btn .sun-icon { display: none; }
[data-theme="dark"] .theme-toggle-btn .moon-icon { display: block; }

/* Layout Grid */
.layout-container {
  display: flex;
  margin-top: var(--header-height);
  min-height: calc(100vh - var(--header-height));
}

/* Left Sidebar */
.sidebar {
  width: var(--sidebar-width);
  min-width: var(--sidebar-width);
  background-color: var(--bg-sidebar);
  border-right: 1px solid var(--border-color);
  height: calc(100vh - var(--header-height));
  position: sticky;
  top: var(--header-height);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  z-index: 50;
}

.sidebar-header {
  padding: 18px 20px 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.sidebar-title {
  font-size: 0.8rem;
  text-transform: uppercase;
  font-weight: 700;
  letter-spacing: 0.05em;
  color: var(--text-muted);
}

.chapter-count {
  font-size: 0.75rem;
  color: var(--text-muted);
  background: var(--bg-surface);
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid var(--border-color);
}

.sidebar-nav {
  flex: 1;
  padding: 6px 12px;
}

.nav-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.nav-item {
  border-radius: 8px;
  transition: background 0.15s ease;
}

.nav-link {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 10px;
  text-decoration: none;
  border-radius: 8px;
  color: var(--text-secondary);
  transition: all 0.15s ease;
}

.chapter-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-mono);
  font-size: 0.75rem;
  font-weight: 600;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  color: var(--text-muted);
  flex-shrink: 0;
}

.chapter-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow: hidden;
}

.chapter-title {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
}

.chapter-desc {
  font-size: 0.75rem;
  color: var(--text-muted);
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
}

.nav-item:hover .nav-link {
  background: var(--bg-surface);
  color: var(--accent-primary);
}

.nav-item.active .nav-link {
  background: var(--accent-subtle);
  border: 1px solid var(--accent-border);
}
.nav-item.active .chapter-badge {
  background: var(--accent-primary);
  color: #fff;
  border-color: var(--accent-primary);
}
.nav-item.active .chapter-title {
  color: var(--accent-primary);
}

.sidebar-subnav {
  list-style: none;
  margin: 4px 0 8px 34px;
  padding-left: 10px;
  border-left: 2px solid var(--border-color);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.sidebar-subnav-item a {
  display: block;
  font-size: 0.8rem;
  color: var(--text-muted);
  text-decoration: none;
  padding: 3px 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: color 0.15s ease;
}

.sidebar-subnav-item.level-3 {
  padding-left: 10px;
}

.sidebar-subnav-item a:hover,
.sidebar-subnav-item a.active-toc {
  color: var(--accent-primary);
  font-weight: 500;
}

.sidebar-footer {
  padding: 14px 18px;
  border-top: 1px solid var(--border-color);
  font-size: 0.75rem;
  color: var(--text-muted);
  display: flex;
  gap: 8px;
}
.sidebar-footer a {
  color: var(--text-muted);
  text-decoration: none;
}
.sidebar-footer a:hover {
  color: var(--accent-primary);
}

/* Main Content Wrapper */
.main-wrapper {
  flex: 1;
  display: flex;
  justify-content: center;
  padding: 32px 40px 60px;
  max-width: calc(100vw - var(--sidebar-width));
}

.content-container {
  flex: 1;
  max-width: 860px;
  min-width: 0;
}

/* Breadcrumb */
.breadcrumb-nav {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.85rem;
  color: var(--text-muted);
  margin-bottom: 24px;
}
.crumb-link {
  color: var(--text-muted);
  text-decoration: none;
}
.crumb-link:hover {
  color: var(--accent-primary);
}
.crumb-sep {
  color: var(--border-color);
}
.crumb-current {
  color: var(--text-primary);
  font-weight: 500;
}

/* Markdown Typography */
.markdown-body {
  line-height: 1.75;
  color: var(--text-primary);
  font-size: 15.5px;
}

.markdown-body h1 {
  font-size: 2.15rem;
  font-weight: 800;
  letter-spacing: -0.03em;
  margin-bottom: 20px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-color);
  color: var(--text-primary);
}

.markdown-body h2 {
  font-size: 1.55rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  margin-top: 40px;
  margin-bottom: 16px;
  color: var(--text-primary);
}

.markdown-body h3 {
  font-size: 1.25rem;
  font-weight: 600;
  margin-top: 30px;
  margin-bottom: 12px;
  color: var(--text-primary);
}

.markdown-body h4 {
  font-size: 1.05rem;
  font-weight: 600;
  margin-top: 24px;
  margin-bottom: 8px;
}

.heading-anchor {
  position: relative;
}

.header-link {
  text-decoration: none;
  color: var(--text-muted);
  opacity: 0;
  margin-right: 4px;
  font-weight: 400;
  transition: opacity 0.15s ease;
}
.heading-anchor:hover .header-link {
  opacity: 1;
}

.markdown-body p {
  margin-bottom: 16px;
  color: var(--text-primary);
}

.markdown-body strong {
  font-weight: 600;
  color: var(--text-primary);
}

.markdown-body a.doc-link {
  color: var(--accent-primary);
  text-decoration: underline;
  text-underline-offset: 3px;
  text-decoration-color: var(--accent-border);
  transition: color 0.15s ease, text-decoration-color 0.15s ease;
}
.markdown-body a.doc-link:hover {
  color: var(--accent-hover);
  text-decoration-color: var(--accent-hover);
}

.inline-code {
  font-family: var(--font-mono);
  font-size: 0.88em;
  background-color: var(--inline-code-bg);
  color: var(--inline-code-text);
  padding: 0.18em 0.4em;
  border-radius: 4px;
  border: 1px solid var(--border-color);
}

.markdown-body blockquote {
  margin: 20px 0;
  padding: 12px 18px;
  border-left: 4px solid var(--accent-primary);
  background-color: var(--accent-subtle);
  border-radius: 0 8px 8px 0;
  color: var(--text-secondary);
}
.markdown-body blockquote p {
  margin-bottom: 0;
}

.markdown-body hr.divider {
  border: none;
  border-top: 1px solid var(--border-color);
  margin: 36px 0;
}

.doc-list {
  margin: 0 0 18px 24px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.doc-list li {
  color: var(--text-primary);
}

/* Code Block Wrapper */
.code-block-wrapper {
  margin: 22px 0;
  border-radius: 8px;
  overflow: hidden;
  background: var(--code-bg);
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-sm);
}

.code-block-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 14px;
  background: rgba(255, 255, 255, 0.05);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.code-lang-tag {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.copy-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: rgba(255, 255, 255, 0.1);
  color: #e2e8f0;
  border: none;
  border-radius: 5px;
  padding: 3px 8px;
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.15s ease;
}
.copy-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
}
.copy-btn.copied {
  background: #10b981;
  color: #fff;
}

.code-block {
  padding: 16px;
  overflow-x: auto;
  font-family: var(--font-mono);
  font-size: 0.88rem;
  line-height: 1.6;
  color: var(--code-text);
  margin: 0;
}

/* Token Colors */
.token.keyword { color: var(--token-keyword); font-weight: 500; }
.token.string { color: var(--token-string); }
.token.comment { color: var(--token-comment); font-style: italic; }
.token.decorator { color: var(--token-decorator); font-weight: 600; }
.token.builtin { color: var(--token-builtin); }
.token.function { color: var(--token-function); }
.token.number { color: var(--token-number); }
.token.property { color: var(--token-property); }

/* Tables */
.table-container {
  margin: 22px 0;
  overflow-x: auto;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: var(--shadow-sm);
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.92rem;
  text-align: left;
}

th, td {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
}

th {
  background-color: var(--bg-subtle);
  font-weight: 600;
  color: var(--text-primary);
}

tr:last-child td {
  border-bottom: none;
}

tr:nth-child(even) td {
  background-color: rgba(0, 0, 0, 0.015);
}
[data-theme="dark"] tr:nth-child(even) td {
  background-color: rgba(255, 255, 255, 0.02);
}

/* Right TOC (On this page) */
.right-toc-container {
  width: var(--toc-width);
  min-width: var(--toc-width);
  margin-left: 36px;
}

.right-toc-inner {
  position: sticky;
  top: calc(var(--header-height) + 32px);
  max-height: calc(100vh - var(--header-height) - 60px);
  overflow-y: auto;
}

.toc-header {
  font-size: 0.8rem;
  text-transform: uppercase;
  font-weight: 700;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  margin-bottom: 12px;
}

.right-toc-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-left: 8px;
  border-left: 2px solid var(--border-color);
}

.toc-item a {
  display: block;
  font-size: 0.82rem;
  color: var(--text-muted);
  text-decoration: none;
  line-height: 1.4;
  transition: all 0.15s ease;
}

.toc-item.level-3 {
  padding-left: 12px;
}

.toc-item a:hover,
.toc-item a.active-toc {
  color: var(--accent-primary);
  font-weight: 500;
}

/* Bottom Pagination */
.chapter-pagination {
  margin-top: 48px;
  padding-top: 24px;
  border-top: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  gap: 16px;
}

.pagination-btn {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 14px 20px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-surface);
  text-decoration: none;
  flex: 1;
  max-width: 48%;
  transition: all 0.2s ease;
}

.pagination-btn:hover {
  border-color: var(--accent-primary);
  box-shadow: var(--shadow-md);
  transform: translateY(-1px);
}

.pagination-sub {
  font-size: 0.75rem;
  color: var(--text-muted);
  font-weight: 600;
  text-transform: uppercase;
}

.pagination-title {
  font-size: 0.95rem;
  color: var(--text-primary);
  font-weight: 600;
}

.next-btn {
  text-align: right;
  align-items: flex-end;
}

.pagination-placeholder {
  flex: 1;
  max-width: 48%;
}

/* Site Footer */
.site-footer {
  margin-top: 60px;
  padding-top: 24px;
  border-top: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.85rem;
  color: var(--text-muted);
}

.footer-lang-link {
  color: var(--accent-primary);
  text-decoration: none;
  font-weight: 500;
}
.footer-lang-link:hover {
  text-decoration: underline;
}

/* Responsive Styles */
@media (max-width: 1100px) {
  .right-toc-container {
    display: none;
  }
}

@media (max-width: 860px) {
  .mobile-menu-toggle {
    display: block;
  }

  .sidebar {
    position: fixed;
    top: var(--header-height);
    left: -100%;
    bottom: 0;
    width: 280px;
    transition: left 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: var(--shadow-lg);
  }

  .sidebar.open {
    left: 0;
  }

  .sidebar-overlay {
    display: none;
    position: fixed;
    top: var(--header-height);
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.4);
    z-index: 45;
  }

  .sidebar-overlay.open {
    display: block;
  }

  .main-wrapper {
    max-width: 100vw;
    padding: 24px 20px 48px;
  }

  .search-box {
    width: 160px;
  }
  .search-box:focus-within {
    width: 190px;
  }
}
`;
}

// Generate client JavaScript
function generateJs() {
  return `// Keelson Tutorial Interactive App Script
(function() {
  // Theme Switching
  const themeToggle = document.getElementById('themeToggle');
  const savedTheme = localStorage.getItem('keelson_theme');

  if (savedTheme) {
    document.documentElement.setAttribute('data-theme', savedTheme);
    document.body.classList.remove('theme-auto');
  }

  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') || 
        (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      const nextTheme = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', nextTheme);
      document.body.classList.remove('theme-auto');
      localStorage.setItem('keelson_theme', nextTheme);
    });
  }

  // Mobile Sidebar Drawer
  const menuToggle = document.getElementById('menuToggle');
  const sidebar = document.getElementById('sidebar');
  const sidebarOverlay = document.getElementById('sidebarOverlay');

  function toggleSidebar() {
    if (sidebar && sidebarOverlay) {
      sidebar.classList.toggle('open');
      sidebarOverlay.classList.toggle('open');
    }
  }

  if (menuToggle) menuToggle.addEventListener('click', toggleSidebar);
  if (sidebarOverlay) sidebarOverlay.addEventListener('click', toggleSidebar);

  // Copy Code Functionality
  document.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const codeId = btn.getAttribute('data-code-id');
      const codeEl = document.getElementById(codeId);
      if (!codeEl) return;

      try {
        await navigator.clipboard.writeText(codeEl.innerText);
        const labelEl = btn.querySelector('.copy-label');
        const originalText = labelEl ? labelEl.innerText : '复制';
        if (labelEl) labelEl.innerText = '已复制!';
        btn.classList.add('copied');
        setTimeout(() => {
          if (labelEl) labelEl.innerText = originalText;
          btn.classList.remove('copied');
        }, 2000);
      } catch (e) {
        console.error('Failed to copy', e);
      }
    });
  });

  // Client-side Navigation Filter / Search
  const searchInput = document.getElementById('searchInput');
  const navList = document.getElementById('navList');

  if (searchInput && navList) {
    searchInput.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      const items = navList.querySelectorAll('.nav-item');
      items.forEach(item => {
        const text = item.innerText.toLowerCase();
        if (text.includes(q)) {
          item.style.display = '';
        } else {
          item.style.display = 'none';
        }
      });
    });

    // Keyboard shortcut Cmd/Ctrl + K to focus search
    window.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchInput.focus();
      }
    });
  }

  // ScrollSpy for Right TOC & Subnav
  const headings = Array.from(document.querySelectorAll('.markdown-body h2, .markdown-body h3'));
  const tocLinks = Array.from(document.querySelectorAll('.right-toc-list .toc-link, .sidebar-subnav .subnav-link'));

  if (headings.length > 0 && tocLinks.length > 0) {
    function onScroll() {
      const scrollPos = window.scrollY + 100;
      let currentId = '';

      for (let i = 0; i < headings.length; i++) {
        const h = headings[i];
        if (h.offsetTop <= scrollPos) {
          currentId = h.id;
        } else {
          break;
        }
      }

      tocLinks.forEach(link => {
        const target = link.getAttribute('data-anchor') || link.getAttribute('data-toc-target');
        if (target === currentId) {
          link.classList.add('active-toc');
        } else {
          link.classList.remove('active-toc');
        }
      });
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }
})();
`;
}

// Generate Root Landing/Redirect Index
function generateRootIndex() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="refresh" content="0; url=zh/index.html">
  <title>Keelson Tutorial</title>
  <script>
    window.location.replace("zh/index.html");
  </script>
</head>
<body>
  <p>正在前往 Keelson 教程... <a href="zh/index.html">点击直接进入中文版</a> | <a href="en/index.html">English Version</a></p>
</body>
</html>`;
}

// Main Build Runner
function build() {
  console.log('🚀 Starting Keelson Tutorial Static Site generation...');

  // Ensure directories
  const zhDir = path.join(SITE_DIR, 'zh');
  const enDir = path.join(SITE_DIR, 'en');
  const assetsDir = path.join(SITE_DIR, 'assets');

  fs.mkdirSync(zhDir, { recursive: true });
  fs.mkdirSync(enDir, { recursive: true });
  fs.mkdirSync(assetsDir, { recursive: true });

  // Write assets
  fs.writeFileSync(path.join(assetsDir, 'style.css'), generateCss(), 'utf-8');
  fs.writeFileSync(path.join(assetsDir, 'app.js'), generateJs(), 'utf-8');
  console.log('✅ Generated assets (style.css, app.js)');

  // Write root index.html
  fs.writeFileSync(path.join(SITE_DIR, 'index.html'), generateRootIndex(), 'utf-8');
  console.log('✅ Generated root index.html');

  // Build each chapter
  let zhCount = 0;
  let enCount = 0;

  for (const chapter of CHAPTERS) {
    // 1. Chinese version
    const zhFile = path.join(TUTORIAL_DIR, chapter.fileZh);
    if (fs.existsSync(zhFile)) {
      const rawContent = fs.readFileSync(zhFile, 'utf-8');
      const { html, toc } = parseMarkdown(rawContent, true);
      const pageHtml = renderPage({
        currentChapter: chapter,
        isZh: true,
        htmlContent: html,
        toc
      });
      fs.writeFileSync(path.join(zhDir, chapter.outName), pageHtml, 'utf-8');
      zhCount++;
    } else {
      console.warn(`⚠️ Warning: Chinese file missing: ${zhFile}`);
    }

    // 2. English version
    const enFile = path.join(TUTORIAL_DIR, chapter.fileEn);
    if (fs.existsSync(enFile)) {
      const rawContent = fs.readFileSync(enFile, 'utf-8');
      const { html, toc } = parseMarkdown(rawContent, false);
      const pageHtml = renderPage({
        currentChapter: chapter,
        isZh: false,
        htmlContent: html,
        toc
      });
      fs.writeFileSync(path.join(enDir, chapter.outName), pageHtml, 'utf-8');
      enCount++;
    } else {
      console.warn(`⚠️ Warning: English file missing: ${enFile}`);
    }
  }

  console.log(`🎉 Built ${zhCount} Chinese pages and ${enCount} English pages.`);
  console.log(`📁 Site ready at: ${SITE_DIR}`);
}

build();
