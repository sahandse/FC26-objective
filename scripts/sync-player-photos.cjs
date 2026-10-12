#!/usr/bin/env node
// Saves only Wikimedia Commons photos with explicit free-license metadata and exact-name athlete matching.
const fs=require('node:fs');const path=require('node:path');
const root=path.join(__dirname,'..'),folder=path.join(root,'img/players');
const data=JSON.parse(fs.readFileSync(path.join(root,'data/fc27-players.json'),'utf8'));
const file=path.join(root,'data/available-portraits.json');
const index=JSON.parse(fs.readFileSync(file,'utf8'));
const existing=new Set(index.ids.map(Number));const attribution=[];
const attemptsFile=path.join(root,'data/player-photo-attempts.json');
const attempts=fs.existsSync(attemptsFile)?JSON.parse(fs.readFileSync(attemptsFile,'utf8')):{};
const retryAfter=7*86400000;
const work=data.players.filter(p=>p&&p.id&&p.name&&!existing.has(Number(p.id))&&(!attempts[p.id]||Date.now()-Date.parse(attempts[p.id])>retryAfter)).sort((a,b)=>(b.rat||0)-(a.rat||0)).slice(0,180);
const delay=ms=>new Promise(ok=>setTimeout(ok,ms));
const normalize=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
async function get(url){const r=await fetch(url,{headers:{'User-Agent':'FC27Hub educational free-license image sync/1.0 (github.com/sahandse/FC27)'},signal:AbortSignal.timeout(9000)});if(!r.ok)throw Error('HTTP '+r.status);return r;}
async function lookup(p){
 const q=new URLSearchParams({action:'query',format:'json',prop:'pageimages|extracts',piprop:'original',exintro:'1',explaintext:'1',titles:p.name});
 const wiki=await(await get('https://en.wikipedia.org/w/api.php?'+q)).json();
 const page=Object.values(wiki.query?.pages||{}).find(x=>x.original?.source&&x.extract);
 if(!page||!/(footballer|soccer player|professional football|association football)/i.test(page.extract.slice(0,600)))return null;
 if(normalize(page.title)!==normalize(p.name))return null;
 const imgURL=new URL(page.original.source);
 if(imgURL.hostname!=='upload.wikimedia.org'||!imgURL.pathname.startsWith('/wikipedia/commons/'))return null;
 const filename=decodeURIComponent(imgURL.pathname.split('/').at(-1)||'');
 const q2=new URLSearchParams({action:'query',format:'json',prop:'imageinfo',iiprop:'extmetadata|url',iiurlwidth:'250',titles:'File:'+filename});
 const commons=await(await get('https://commons.wikimedia.org/w/api.php?'+q2)).json();
 const info=Object.values(commons.query?.pages||{})[0]?.imageinfo?.[0];if(!info)return null;
 const md=info.extmetadata||{},license=md.LicenseShortName?.value||'',author=md.Artist?.value||'';
 if(!/^(CC BY(?:-SA)?\s*[234]\.0|CC0|Public domain|PD)$/i.test(license.trim()))return null;
 const img=await get(info.thumburl||info.url);const type=img.headers.get('content-type')||'';
 if(!type.includes('image/jpeg')&&!type.includes('image/png')&&!type.includes('image/webp'))return null;
 const buf=Buffer.from(await img.arrayBuffer());if(buf.byteLength<4000||buf.byteLength>500000)return null;
 let ext=type.includes('png')?'png':type.includes('webp')?'webp':'jpg';
 return {buf,ext,license,author:author.replace(/<[^>]*>/g,'').slice(0,120),url:info.url,name:p.name,id:Number(p.id)};
}
(async()=>{
 fs.mkdirSync(folder,{recursive:true});let saved=0;
 for(const p of work){if(saved>=30)break;
  attempts[p.id]=new Date().toISOString();
  try{
   const image=await lookup(p);
   if(!image)continue;
   fs.writeFileSync(path.join(folder,image.id+'.'+image.ext),image.buf);
   index.ids.push(image.id);
   index.files=index.files||{};index.files[String(image.id)]=image.id+'.'+image.ext;
   attribution.push({id:image.id,name:image.name,license:image.license,artist:image.author,source:image.url,extension:image.ext});
   saved++;console.log('Saved licensed photograph',image.id,image.name,image.license);
  }catch(e){console.warn('Skipping',p.name,e.message)}
  await delay(250);
 }
 fs.writeFileSync(attemptsFile,JSON.stringify(attempts,null,2)+'\n');
 index.ids=[...new Set(index.ids)].sort((a,b)=>a-b);
 index.count=index.ids.length;index.updated_at=new Date().toISOString();
 fs.writeFileSync(file,JSON.stringify(index,null,2)+'\n');
 const attrFile=path.join(root,'data/player-photo-credits.json');
 const prev=fs.existsSync(attrFile)?JSON.parse(fs.readFileSync(attrFile,'utf8')):[];
 fs.writeFileSync(attrFile,JSON.stringify([...prev,...attribution],null,2)+'\n');
 console.log('Added',saved,'photos; total indexed',index.count);
})().catch(e=>{console.error(e);process.exitCode=1});
