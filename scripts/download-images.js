#!/usr/bin/env node
// Downloads player portrait images from EA/futbin CDNs
// Run: node scripts/download-images.js
// Requires: node-fetch (npm install node-fetch) or Node 18+ (native fetch)

const https = require('https');
const fs = require('fs');
const path = require('path');

const playerIds = require('./player-ids');
const OUTPUT_DIR = path.join(__dirname, '..', 'img', 'players');

const CDNS = [
  id => `https://cdn.futbin.com/content/fifa26/img/players/${id}.png`,
  id => `https://cdn.fut.gg/fc26/players/portrait/${id}.png`,
  id => `https://cdn.futbin.com/content/fifa25/img/players/${id}.png`,
];

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Referer': 'https://www.futbin.com/',
  'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
};

function downloadImage(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: HEADERS }, (res) => {
      if (res.statusCode === 200) {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      } else {
        reject(new Error(`HTTP ${res.statusCode}`));
      }
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function downloadPlayer(id) {
  const dest = path.join(OUTPUT_DIR, `${id}.png`);
  if (fs.existsSync(dest)) return 'skip';

  for (const cdnFn of CDNS) {
    try {
      const data = await downloadImage(cdnFn(id));
      fs.writeFileSync(dest, data);
      return 'ok';
    } catch (e) {
      // try next CDN
    }
  }
  return 'fail';
}

async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  let ok = 0, skip = 0, fail = 0;
  for (const id of playerIds) {
    const result = await downloadPlayer(id);
    if (result === 'ok') { ok++; process.stdout.write(`✓ ${id}\n`); }
    else if (result === 'skip') { skip++; }
    else { fail++; process.stdout.write(`✗ ${id}\n`); }
    await new Promise(r => setTimeout(r, 100)); // be polite
  }

  console.log(`\nDone: ${ok} downloaded, ${skip} skipped, ${fail} failed`);
}

main().catch(console.error);
