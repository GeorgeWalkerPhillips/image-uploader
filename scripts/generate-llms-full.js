#!/usr/bin/env node
// Generates public/llms-full.txt: the full text of the About page, the guides
// and their FAQs as plain markdown, for LLM ingestion. It reads the same
// content modules the website renders (src/aboutContent.js, src/guides/content.js,
// src/siteProfile.js), so the file cannot say something the pages do not.
//
//   node scripts/generate-llms-full.js          # rewrite public/llms-full.txt
//   node scripts/generate-llms-full.js --check  # exit 1 if the file is stale
//
// Run by hand after editing those content files (src/seoFiles.test.js also
// fails if the committed file is out of date). Not part of the build.
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'public', 'llms-full.txt');

// Turns [label](/path) into [label](https://www.valere.co.za/path).
function absLinks(text, siteUrl) {
  return text.replace(/\[([^\]]+)\]\((\/[^)]*)\)/g, (_, label, p) => `[${label}](${siteUrl}${p})`);
}

function mdTable(head, rows) {
  const line = (cells) => `| ${cells.join(' | ')} |`;
  return [line(head), line(head.map(() => '---')), ...rows.map(line)].join('\n');
}

function renderBlock(block, ctx) {
  const { siteUrl, budget } = ctx;
  switch (block.type) {
    case 'p':
      return absLinks(block.text, siteUrl);
    case 'h3':
      return `### ${block.text}`;
    case 'ul':
      return block.items.map((i) => `- ${absLinks(i, siteUrl)}`).join('\n');
    case 'ol':
      return block.items.map((i, n) => `${n + 1}. ${absLinks(i, siteUrl)}`).join('\n');
    case 'table':
      return `${block.caption}\n\n${mdTable(block.head, block.rows)}`;
    case 'budgetTable':
      return `Example split of a ${budget.zar(budget.total)} wedding budget (planning guide, not statistics)\n\n${mdTable(
        ['Category', 'Typical range', 'Example share', 'Example amount'],
        budget.rows.map((r) => [r.category, r.range, `${r.share}%`, budget.zar((budget.total * r.share) / 100)])
      )}`;
    case 'product':
      return `Our product: ${block.title}\n\n${block.paragraphs.map((t) => absLinks(t, siteUrl)).join('\n\n')}`;
    default:
      return '';
  }
}

function render({ site, about, guides }) {
  const ctx = {
    siteUrl: site.SITE_URL,
    budget: { zar: guides.zar, total: guides.BUDGET_EXAMPLE_TOTAL, rows: guides.BUDGET_ROWS },
  };
  const out = [];
  out.push('# Valere: full text for language models');
  out.push(
    `${site.DISAMBIGUATION} Site: ${site.SITE_URL}/ . This file repeats the text of the About page and the guides in plain markdown. The short version is ${site.SITE_URL}/llms.txt . Last updated ${guides.DATE_MODIFIED}.`
  );

  out.push(`## About Valere (${about.ABOUT_URL})`);
  out.push(absLinks(about.ABOUT_INTRO, site.SITE_URL));
  about.PRODUCTS.forEach((p) => out.push(`### ${p.title}\n\n${absLinks(p.text, site.SITE_URL)}`));
  out.push(`### How it works\n\n${about.STEPS.map((s, i) => `${i + 1}. ${s.title}. ${s.text}`).join('\n')}`);
  out.push(`### Who it is for\n\n${about.AUDIENCE.map((a) => `- ${a}`).join('\n')}`);
  out.push(`### Where Valere operates and what it costs\n\n${about.WHERE}\n\n${about.PRICING_LINES.map((l) => `- ${l}`).join('\n')}`);
  out.push(`### Privacy\n\n${absLinks(about.PRIVACY_TEXT, site.SITE_URL)}`);
  out.push(`### Contact\n\nContact details are on ${about.ABOUT_URL} .`);
  out.push(`### Frequently asked\n\n${about.FAQ_ITEMS.map((f) => `**${f.q}**\n${f.a}`).join('\n\n')}`);

  guides.GUIDES.forEach((g) => {
    out.push(`## ${g.h1}`);
    out.push(`URL: ${g.url}\nUpdated: ${guides.DATE_MODIFIED}`);
    out.push(g.intro);
    out.push(`### Key takeaways\n\n${g.takeaways.map((t) => `- ${t}`).join('\n')}`);
    g.sections.forEach((s) => {
      out.push(`### ${s.h2}`);
      s.blocks.forEach((b) => {
        // Block-level h3 become h4 here so the hierarchy stays valid.
        const text = renderBlock(b, ctx);
        out.push(b.type === 'h3' ? `#${text}` : text);
      });
    });
    out.push(`### Frequently asked questions\n\n${g.faq.map((f) => `**${f.q}**\n${f.a}`).join('\n\n')}`);
  });
  return `${out.join('\n\n')}\n`;
}

// Loads the ES-module content files with Babel (the same preset Create React
// App uses) so plain Node can read them without a build.
function loadModules() {
  const babel = require('@babel/core');
  const Module = require('module');
  const srcDir = path.join(__dirname, '..', 'src');
  const original = Module._extensions['.js'];
  Module._extensions['.js'] = function load(module, filename) {
    if (!filename.startsWith(srcDir)) return original(module, filename);
    const { code } = babel.transformFileSync(filename, {
      babelrc: false,
      configFile: false,
      presets: [[require.resolve('@babel/preset-env'), { targets: { node: 'current' }, modules: 'commonjs' }]],
    });
    return module._compile(code, filename);
  };
  try {
    return {
      site: require(path.join(srcDir, 'siteProfile.js')),
      about: require(path.join(srcDir, 'aboutContent.js')),
      guides: require(path.join(srcDir, 'guides', 'content.js')),
    };
  } finally {
    Module._extensions['.js'] = original;
  }
}

module.exports = { render };

if (require.main === module) {
  const text = render(loadModules());
  if (process.argv.includes('--check')) {
    const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
    if (current !== text) {
      console.error('public/llms-full.txt is out of date. Run: node scripts/generate-llms-full.js');
      process.exit(1);
    }
    console.log('public/llms-full.txt is up to date.');
  } else {
    fs.writeFileSync(OUT, text);
    console.log(`Wrote ${path.relative(process.cwd(), OUT)} (${text.length} characters)`);
  }
}
