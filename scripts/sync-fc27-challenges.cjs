#!/usr/bin/env node
// Read public FC27 listings only; never infer missing prices, requirements or end dates.
const fs=require('node:fs');
const cheerio=require('cheerio');
const base='https://www.fut.gg';
const pages=[
 {kind:'objectives',cat:'seasonal',path:'/objectives/seasonal/'},
 {kind:'objectives',cat:'campaign',path:'/objectives/campaigns/'},
 {kind:'objectives',cat:'foundation',path:'/objectives/foundations/'},
 {kind:'objectives',cat:'milestone',path:'/objectives/milestones/'},
 {kind:'sbc',cat:'players',path:'/sbc/category/players/'},
 {kind:'sbc',cat:'upgrades',path:'/sbc/category/upgrades/'},
 {kind:'sbc',cat:'challenges',path:'/sbc/category/challenges/'},
 {kind:'sbc',cat:'foundation',path:'/sbc/category/foundations/'}
];
async function scrape(p){
 const url=base+p.path;
 const res=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0 (compatible; FC27Hub/1.0)','Accept':'text/html'}});
 if(!res.ok)throw Error(url+' '+res.status);
 const $=cheerio.load(await res.text()),out=[];
 const seen=new Set();
 $('a[href]').each((_,el)=>{
  let u;try{u=new URL($(el).attr('href'),url)}catch{return}
  if(u.hostname!=='www.fut.gg'||seen.has(u.pathname))return;
  if(p.kind==='sbc'?(!u.pathname.startsWith('/sbc/')||/^\/sbc\/(?:category|expired|expiring-soon)\//.test(u.pathname)||u.pathname==='/sbc/') : (!u.pathname.startsWith('/objectives/')||/^\/objectives\/(?:campaigns|seasonal|foundations|milestones|coming-soon|tracker)\/?$/.test(u.pathname)))return;
  const raw=$(el).text().replace(/\s+/g,' ').trim();
  if(raw.length<6||raw.length>550)return;
  const heading=$(el).find('h2,h3,h4').first().text().replace(/\s+/g,' ').trim();
  const name=(heading||raw.split(/(?:Earn |Complete |Challenges\d|Expires|Repeatable)/)[0]).trim().replace(/^New\s+/,'').replace(/\s+[\d,]{3,}$/,'').slice(0,110);
  if(name.length<4||/^(View |Image:)/i.test(name))return;
  const priceMatch=p.kind==='sbc'?raw.match(/\s(\d{1,3}(?:,\d{3})+)\b/):null;
  const desc=raw.slice(name.length).replace(/^\s*[\d,]+\s*/,'').slice(0,240);
  seen.add(u.pathname);
  const obj={name,category:p.cat,description:desc,url:base+u.pathname};
  if(p.kind==='sbc'){if(/(?:solver|cheapest by rating|sbc rating combinations|all sbcs|view rewards)/i.test(name))return;obj.price=priceMatch?Number(priceMatch[1].replace(/,/g,'')):null;}
  out.push(obj);
 });
 return out;
}
(async()=>{
 const file='data/fc27-challenges.json';
 const prev=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):null;
 const result={source:'FUT.GG',checked_at:new Date().toISOString(),sections:{objectives:prev?.sections?.objectives||[],sbc:[]}};
 let success=0;
 for(const p of pages.filter(x=>x.kind==='sbc')){
  try{
   const data=await scrape(p);
   if(data.length){success++;result.sections[p.kind].push(...data);}
  }catch(error){console.warn('Skipping unavailable source',p.path,error.message)}
 }
 for(const k of ['objectives','sbc']){
  result.sections[k]=[...new Map(result.sections[k].map(x=>[x.url,x])).values()];
 }
 // Fail closed: do not overwrite a verified dataset with partial or empty scraping.
 if(success<3||result.sections.objectives.length<3||result.sections.sbc.length<8){
  throw Error('Incomplete extraction: '+success+' sources; '+result.sections.objectives.length+' objectives; '+result.sections.sbc.length+' SBCs. Existing snapshot preserved.');
 }
 fs.mkdirSync('data',{recursive:true});fs.writeFileSync(file,JSON.stringify(result,null,2)+'\n');
 console.log('Updated FC27 listings:',result.sections.objectives.length,result.sections.sbc.length);
})().catch(e=>{console.error(e);process.exitCode=1});
