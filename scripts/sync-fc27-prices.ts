import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {validatedPrice,type CardPrice,type Platform} from '../src/prices';
const dest='data/fc27-prices.json';
const current=JSON.parse(readFileSync(dest,'utf8'));
const endpoint=process.env.FC27_PRICE_FEED_URL;
if(!endpoint){console.log('No verified market feed configured; preserving unavailable status and existing snapshot');process.exit(0)}
const source=new URL(endpoint);
if(source.protocol!=='https:')throw Error('Only HTTPS feeds supported');
const response=await fetch(source,{headers:process.env.FC27_PRICE_FEED_TOKEN?{Authorization:'Bearer '+process.env.FC27_PRICE_FEED_TOKEN}:{},signal:AbortSignal.timeout(20000)});
if(!response.ok)throw Error('Upstream market provider HTTP '+response.status);
const payload=await response.json();
if(!Array.isArray(payload.prices))throw Error('Upstream prices must be an array');
const fetched=Date.now(),records:CardPrice[]=[];
for(const entry of payload.prices){
 if(!entry||typeof entry!=='object')continue;
 const platform=entry.platform as Platform;
 if(!['pc','ps','xbox'].includes(platform))continue;
 if(!/^\d+$/.test(String(entry.cardId))||!/^\d+$/.test(String(entry.versionId)))continue;
 const sourceURL=String(entry.sourceUrl||'');
 let verifiedSource;try{verifiedSource=new URL(sourceURL)}catch{continue}
 if(verifiedSource.protocol!=='https:')continue;
 const checkedAt=typeof entry.checkedAt==='string'?entry.checkedAt:null;
 const price=Number.isInteger(entry.coins)&&entry.coins>=0?entry.coins:null;
 const normalized=validatedPrice({cardId:String(entry.cardId),versionId:String(entry.versionId),platform,coins:price,status:'unavailable',sourceUrl:sourceURL,checkedAt},fetched);
 if(normalized.status==='verified')records.push(normalized);
}
const unique=new Map<string,CardPrice>();
for(const item of records)unique.set(item.versionId+':'+item.platform,item);
if(unique.size===0){console.log('No fresh per-version platform-verified prices; preserving current file');process.exit(0)}
const out={updated_at:new Date(fetched).toISOString(),verification_window_minutes:45,source:source.host,prices:[...unique.values()]};
writeFileSync(dest,JSON.stringify(out,null,2)+'\n');
console.log('Verified prices:',out.prices.length,'platform-card variants');
