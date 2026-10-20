#!/usr/bin/env node
// IndexNow ping: tells Bing, Yandex and other IndexNow search engines which
// URLs exist or changed, so they are crawled sooner (Bing's index also feeds
// ChatGPT search and Copilot).
//
// RUN THIS AFTER EACH DEPLOY, never before: the engines fetch the key file at
// https://www.valere.co.za/<key>.txt to check you own the site, and that file
// (and the pages) only exist on the live site once Vercel has finished
// deploying. Run it from a machine with internet access:
//
//   node scripts/indexnow.js            # submit every URL in public/sitemap.xml
//   node scripts/indexnow.js --dry-run  # print what would be sent, send nothing
//
// It is not part of the build or the tests. Requires Node 18+ (global fetch).
// The key is the 32-hex-character name of the .txt file in public/ whose
// content is that same key (the standard IndexNow key file).
const fs = require('fs');
const path = require('path');

const HOST = 'www.valere.co.za';
const ENDPOINT = 'https://api.indexnow.org/IndexNow';
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

function findKey() {
  const files = fs.readdirSync(PUBLIC_DIR).filter((f) => /^[a-f0-9]{32}\.txt$/.test(f));
  if (files.length !== 1) {
    throw new Error(`Expected exactly one IndexNow key file (<32 hex>.txt) in public/, found ${files.length}.`);
  }
  const key = files[0].replace(/\.txt$/, '');
  const content = fs.readFileSync(path.join(PUBLIC_DIR, files[0]), 'utf8').trim();
  if (content !== key) throw new Error(`Key file ${files[0]} must contain exactly its own name (the key).`);
  return key;
}

function sitemapUrls() {
  const xml = fs.readFileSync(path.join(PUBLIC_DIR, 'sitemap.xml'), 'utf8');
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
  // The image sitemap entries use <image:loc>, which this pattern does not match.
  return [...new Set(urls)].filter((u) => new URL(u).host === HOST);
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const key = findKey();
  const body = {
    host: HOST,
    key,
    keyLocation: `https://${HOST}/${key}.txt`,
    urlList: sitemapUrls(),
  };
  console.log(`IndexNow: ${body.urlList.length} URLs for ${HOST}`);
  body.urlList.forEach((u) => console.log(`  ${u}`));
  if (dryRun) {
    console.log('Dry run: nothing sent.');
    return;
  }
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  });
  // 200 = accepted, 202 = accepted, key validation pending. 403 = key file not
  // reachable yet (deploy not finished?), 422 = URLs do not match the host.
  console.log(`Response: ${res.status} ${res.statusText}`);
  if (!res.ok && res.status !== 202) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
