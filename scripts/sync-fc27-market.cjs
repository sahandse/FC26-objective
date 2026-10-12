#!/usr/bin/env node
// Only update previously verified FC27 card URLs; fail closed on parser mismatches.
const fs=require('node:fs');
const path='data/fc27-market-verified.json';
const old=JSON.parse(fs.readFileSync(path,'utf8'));
if(!Array.isArray(old.cards))throw Error('Invalid market manifest');
let successes=0;
const cards=[];
function parsePrice(text){
 const matches=[...text.matchAll(/(?:^|\s)(\d+(?:\.\d+)?)\s*([MK])(?=\s|$)/gi)];
 if(!matches.length)return null;
 const m=matches[0];return Math.round(Number(m[1])*(m[2].toUpperCase()==='M'?1e6:1000));
}
for(const card of old.cards){
 let url;
 try{url=new URL(card.url)}catch{continue}
 if(url.origin!=='https://www.futnext.com'||!/^\/players\/[^/]+\/\d+\/?$/.test(url.pathname))continue;
 if(url.pathname.split('/').filter(Boolean).at(-1)!==String(card.player_id))continue;
 try{
  const res=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0 FC27Hub price snapshot','Accept':'text/html'},signal:AbortSignal.timeout(12000)});
  if(!res.ok)throw Error('HTTP '+res.status);
  let html=await res.text();
  const body=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ').replace(/\s+/g,' ');
  const area=body.slice(0,Math.min(body.length,9000));
  const pricePart=area.match(/(?:Price\s+)(\d+(?:\.\d+)?\s*[MK]|\d{3,8})(?:\s|$)/i);
  const price=pricePart?( /[MK]/i.test(pricePart[1])?parsePrice(' '+pricePart[1]+' '):Number(pricePart[1])):null;
  const ratingText=area.match(new RegExp('(?:^|\\s)'+Number(card.rating)+'\\s+'+card.position+'(?:\\s|$)','i'));
  if(!Number.isSafeInteger(price)||price<100||price>1e9||!ratingText)throw Error('Price/rating not verified');
  const type=area.match(/\b(Common|Rare|Hero|Icon|TOTW|TOTS|TOTY)\b/i)?.[1];
  cards.push({...card,price_coins:price,card_type:type||card.card_type,verified_at:new Date().toISOString()});
  successes++;
 }catch(err){console.warn('No verified refresh for',card.player_id,err.message);cards.push({...card,verified_at:card.verified_at||old.checked_at})}
}
if(!successes){console.log('No prices independently verified; existing snapshot preserved without refreshing timestamps');process.exit(0)}
const next={...old,source:'FUTNext',checked_at:new Date().toISOString(),cards};
fs.writeFileSync(path,JSON.stringify(next,null,2)+'\n');console.log('Verified',successes,'cards');
