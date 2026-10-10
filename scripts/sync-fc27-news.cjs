#!/usr/bin/env node
// Pull recent articles from EA's official FC27 news index; never manufacture article records.
const fs=require('node:fs');
async function main(){
 const url='https://www.ea.com/games/ea-sports-fc/fc-27';
 const res=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0 FC27-Hub-News/1.0','Accept':'text/html'}});
 if(!res.ok)throw Error('EA HTTP '+res.status);
 const html=await res.text();
 const {load}=require('cheerio');const $=load(html);
 const seen=new Set(),items=[];
 $('a[href]').each((_,node)=>{
   const raw=$(node).attr('href')||'';
   let link;try{link=new URL(raw,url)}catch{return}
   if(link.hostname!=='www.ea.com'||!link.pathname.includes('/fc-27/')||!link.pathname.includes('/news/'))return;
   const title=$(node).text().replace(/\s+/g,' ').trim().slice(0,180);
   if(title.length<16||seen.has(link.pathname))return;
   seen.add(link.pathname);
   items.push({title,url:link.origin+link.pathname,source:'Electronic Arts'});
 });
 if(items.length<3)throw Error('Official news extraction failed (fewer than 3 titles); retaining previous verified snapshot.');
 fs.mkdirSync('data',{recursive:true});
 const file='data/fc27-news.json';
 const payload={source:'Electronic Arts',source_url:url,checked_at:new Date().toISOString(),items:items.slice(0,18)};
 fs.writeFileSync(file,JSON.stringify(payload,null,2)+'\n');
 console.log('EA FC27 articles:',payload.items.length);
}
main().catch(e=>{console.error(e);process.exitCode=1});
