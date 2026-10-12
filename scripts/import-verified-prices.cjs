#!/usr/bin/env node
// Import observed FC27 prices. No inferred prices, scraped guesses or live claims.
// Usage: node scripts/import-verified-prices.cjs input.json
const fs=require('node:fs'),path=require('node:path');
const input=process.argv[2];
if(!input)throw Error('Supply an explicit JSON observations file');
const raw=JSON.parse(fs.readFileSync(input,'utf8'));
if(!Array.isArray(raw.cards))throw Error('Expected cards array');
const stamp=new Date().toISOString(),now=Date.now(),valid=[];
const seen=new Set();
for(const r of raw.cards){
 if(!/^\d+$/.test(String(r.player_id))||!Number.isSafeInteger(r.rating)||r.rating<1||r.rating>99||typeof r.position!=='string'||!/^[A-Z]{1,3}$/.test(r.position))throw Error('Invalid card identity');
 if(!Number.isSafeInteger(r.price_coins)||r.price_coins<=0)throw Error('Invalid price');
 if(!['PC','PS','Xbox','Console'].includes(r.platform))throw Error('Platform required');
 if(typeof r.verified_at!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(r.verified_at))throw Error('Observation timestamp must include UTC time');
 const age=now-Date.parse(r.verified_at);if(!Number.isFinite(age)||age<0||age>24*3600000)throw Error('Stale or future observation refused');
 let u;try{u=new URL(r.url)}catch{throw Error('Invalid evidence URL')}
 if(u.protocol!=='https:'||!/(^|\.)fut\.gg$|(^|\.)futbin\.com$/.test(u.hostname))throw Error('Untrusted evidence host');
 const key=r.player_id+':'+r.platform;if(seen.has(key))throw Error('Duplicate observation');seen.add(key);
 valid.push({player_id:String(r.player_id),rating:r.rating,position:r.position,price_coins:r.price_coins,platform:r.platform,url:u.href,verified_at:r.verified_at});
}
const output={source:'individually reviewed observations',checked_at:stamp,cards:valid};
fs.mkdirSync('data',{recursive:true});fs.writeFileSync(path.join('data','fc27-market-verified.json'),JSON.stringify(output,null,2)+'\\n');
console.log('Saved',valid.length,'verified price observations; never labelled as live');
