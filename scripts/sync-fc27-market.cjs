#!/usr/bin/env node
// Strictly observed FC27 card prices. A fetched page is not a live market feed.
const fs=require('node:fs');
const dest='data/fc27-market-verified.json';
const candidateFile='data/fc27-market-candidates.json';
const previous=JSON.parse(fs.readFileSync(dest,'utf8'));
const candidates=JSON.parse(fs.readFileSync(candidateFile,'utf8')).cards;
if(!Array.isArray(candidates)||!Array.isArray(previous.cards))throw Error('Invalid market manifest');
const retained=new Map(previous.cards.map(c=>[String(c.player_id)+'|'+c.platform,c]));
let verified=0;
function parseCompact(text){
 const m=String(text).trim().replace(/\s/g,'').match(/^(\d+(?:[.,]\d+)?)([MK])?$/i);
 if(!m)return null;
 const n=Number(m[1].replace(',','.'))*(m[2]?.toUpperCase()==='M'?1000000:m[2]?1000:1);
 return Number.isSafeInteger(Math.round(n))?Math.round(n):null;
}
async function verify(card){
 const url=new URL(card.url);
 if(url.protocol!=='https:'||url.hostname!=='www.futnext.com'||!/^\/(?:[a-z]{2}\/)?players\/[a-z0-9-]+\/\d+\/?$/.test(url.pathname))throw Error('Unsupported source URL');
 if(url.pathname.split('/').filter(Boolean).at(-1)!==String(card.player_id))throw Error('ID mismatch');
 if(!['Console','PC','PS','Xbox'].includes(card.platform)||!Number.isInteger(card.rating)||!card.position)throw Error('Missing card identity');
 const res=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0 (compatible; FC27Hub/1.2; price observation)','Accept-Language':'pl,en;q=0.8','Cache-Control':'no-cache'},signal:AbortSignal.timeout(12000),cache:'no-store'});
 if(!res.ok)throw Error('HTTP '+res.status);
 const html=await res.text();
 const body=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/\s+/g,' ');
 const label=body.search(/\b(?:Price|Cena)\b/i);
 if(label<0)throw Error('Price label missing');
 const near=body.slice(Math.max(0,label-40),label+120);
 const m=near.match(/(?:Price|Cena)\s+(\d+(?:[.,]\d+)?\s*[MK]?)(?=\s|$)/i);
 const price=m&&parseCompact(m[1]);
 const rating=Number(card.rating);
 if(!Number.isSafeInteger(price)||price<100||price>1e9)throw Error('Unverified price');
 const ratingPos=new RegExp('(?:^|\\s)'+rating+'\\s*'+card.position+'(?:\\s|$)','i');
 if(!ratingPos.test(body.slice(0,2500)))throw Error('Rating/position mismatch');
 // Protect multiple variants of the same player: this URL is tied to one specific ID.
 return {...card,price_coins:price,verified_at:new Date().toISOString()};
}
(async()=>{
 for(const c of candidates.slice(0,60)){
  try{const result=await verify(c);retained.set(String(c.player_id)+'|'+c.platform,result);verified++;console.log('Verified observation',result.player_id,result.price_coins,result.platform)}
  catch(e){console.warn('No verified price',c.player_id,e.message)}
 }
 if(verified===0){console.log('No prices independently verified; existing snapshot preserved without refreshing timestamps');return}
 const cards=[...retained.values()].filter(c=>Number.isSafeInteger(c.price_coins)&&c.verified_at);
 fs.writeFileSync(dest,JSON.stringify({source:'FUTNext independently verified page observations',checked_at:new Date().toISOString(),cards},null,2)+'\n');
 console.log('Refreshed',verified,'observations; historical values remain timestamped');
})().catch(e=>{console.error(e);process.exitCode=1});
