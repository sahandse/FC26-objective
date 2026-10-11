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
  const descMatch=raw.match(/(?:Earn |Complete |Exchange |Submit |Play |Compete |Use )[A-Za-z\d\s+.,'-]{12,200}/);
  const desc=descMatch?descMatch[0].trim():'';
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
 function parseSquads($){
  const squads=[];
  // Detailed challenge lists are grouped under titled h3/h4/h5 headings.
  $('h3,h4,h5').each((_,node)=>{
   const name=$(node).text().replace(/\s+/g,' ').trim();
   if(name.length<3||name.length>90||/^(rewards|overview|requirements|eligible players|related sbcs|cheapest|sbc solutions)$/i.test(name))return;
   const parent=$(node).parent();
   const block=parent.next().length?parent.next():parent;
   const rules=block.find('li').map((_,el)=>$(el).text().replace(/\s+/g,' ').trim()).get().filter(x=>x.length>5&&x.length<130&&/^(quality|rating|chemistry|team rating|team chemistry|players|rare|league|nation|club|position|same |leagues|nations|rarity|gold|silver|bronze)/i.test(x)).slice(0,12);
   if(rules.length && !squads.some(x=>x.name===name))squads.push({name,requirements:rules});
  });
  return squads.slice(0,20);
 }
 // Extract facts only when explicitly labelled in the challenge detail page.
 for(const rec of result.sections.sbc){
  try{
   const res=await fetch(rec.url,{headers:{'User-Agent':'Mozilla/5.0 FC27Hub/1.0','Accept':'text/html'}});
   if(!res.ok)continue;
   const $=cheerio.load(await res.text());
   const squads=parseSquads($);
   if(squads.length){rec.squads=squads;rec.squads_checked_at=new Date().toISOString();}
   const body=$('body').text().replace(/\s+/g,' ').trim();
   const begin=body.indexOf('Eligible players');
   const end=begin>=0?body.indexOf(' Solve',begin):-1;
   const limits=begin>=0?body.slice(begin+16,end>begin?end:begin+800):'';
   const requirements=[];
   const rulePattern=/(?:Rating|Chemistry|Players|Rare Players|Team Overall Rating):\s*(?:(?:Min|Max)\.\s*)?\d+/gi;
   for(const match of limits.matchAll(rulePattern))requirements.push(match[0].trim());
   if(requirements.length){rec.requirements=[...new Set(requirements)].slice(0,15);rec.requirements_checked_at=new Date().toISOString();}
   // Reward names are recorded only when clearly bracketed by the detail headings.
   const rewardMatch=body.match(/\bRewards\s+(1x\s+.{4,90}?\s+(?:Pack|Player|Pick))(?:\s|$)/i);
   if(rewardMatch)rec.reward=rewardMatch[1].trim();
  }catch(e){console.warn('Detail not available',rec.url,e.message)}
 }
 fs.mkdirSync('data',{recursive:true});fs.writeFileSync(file,JSON.stringify(result,null,2)+'\n');
 console.log('Updated FC27 listings:',result.sections.objectives.length,result.sections.sbc.length);
})().catch(e=>{console.error(e);process.exitCode=1});
