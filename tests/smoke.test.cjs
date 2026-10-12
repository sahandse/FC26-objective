const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');
const html = fs.readFileSync('index.html','utf8');
const sw = fs.readFileSync('sw.js','utf8');
const manifest = JSON.parse(fs.readFileSync('manifest.json','utf8'));
test('Persian RTL document and viewport',()=>{
 assert.match(html,/<html[^>]+dir="rtl"[^>]+lang="fa"/);
 assert.match(html,/name="viewport"/);
});
test('PWA scope and cache version',()=>{
 assert.equal(manifest.start_url,'./');
 assert.equal(manifest.scope,'./');
 assert.match(html,/serviceWorker\.register\('\.\/sw\.js'\)/);
 assert.match(sw,/caches\.keys\(\)/);
});
test('player listing bounded and paginated',()=>{
 assert.match(html,/const PLAYER_PAGE_SIZE=24/);
 assert.match(html,/list\.slice\(\(playerPage-1\)\*PLAYER_PAGE_SIZE,playerPage\*PLAYER_PAGE_SIZE\)/);
});
test('no fabricated rolling expiration or player stats',()=>{
 assert.doesNotMatch(html,/exp:(?:daysFromNow|hoursFromNow)\(/);
 assert.doesNotMatch(html,/Math\.round\(base\+v\*14-7\)/);
 assert.doesNotMatch(html,/hashInt\(p\.id\+i\)/);
});
test('squad picking disallows duplicate members',()=>{
 assert.match(html,/این بازیکن در ترکیب حضور دارد/);
 assert.match(html,/state\.squad\.formation!==f/);
});
test('essential sections are present',()=>{
 for(const id of ['sec-obj','sec-sbc','sec-players','sec-squad','sec-evo']) assert.ok(html.includes('id="'+id+'"'),id);
});

const vm = require('node:vm');
test('main inline JavaScript parses',()=>{
  const chunks=html.split('<script>').slice(1);
  assert.ok(chunks.length>0);
  for(const chunk of chunks)new vm.Script(chunk.split('</script>')[0]);
});
test('legacy sample data is not shipped',()=>{
  for(const name of ['OBJ_RAW','SBC_RAW','PLAYERS_RAW','EVO_RAW']) {
    assert.ok(html.includes('const '+name+'=[]'), name);
  }
  assert.doesNotMatch(html,/Festival of Football - Login Reward/);
  assert.doesNotMatch(html,/id="sec-games"|id="sec-wc"|id="bn-games"|id="bn-wc"/);
  assert.doesNotMatch(html,/const WC26_SQUADS|function renderWC/);
  assert.ok(html.includes('راهنمای انجام'));
  assert.ok(html.includes('FC27_FA'));
});

test('FC27 sourced objectives and SBC feed has real detail URLs',()=>{
 const data=JSON.parse(fs.readFileSync('data/fc27-challenges.json','utf8'));
 assert.equal(data.source,'FUT.GG');
 for(const group of ['objectives','sbc']){
  assert.ok(data.sections[group].length>=3);
  for(const item of data.sections[group]){
   assert.ok(item.name.length>=4);
   assert.equal(new URL(item.url).hostname,'www.fut.gg');
   assert.ok(!/^(Objectives|Live Events|Streamlined SBC SolverNew|1Expiring Soon)$/.test(item.name));
  }
 }
});

test('bilingual FC27 guides and local progress persistence',()=>{
 assert.match(html,/FC27_EN_GUIDES/);
 assert.match(html,/FC27_EN_OBJECTIVES/);
 assert.match(html,/fc27-guide-lang/);
 assert.match(html,/fc27-guide-progress/);
 assert.match(html,/aria-pressed/);
 assert.match(html,/guideFC27\(kind,rec\)/);
 assert.match(html,/fc27EnglishGuide\(kind,rec\)/);
});

test('challenge details remain in-site and portrait lookup is lazy',()=>{
 assert.match(html,/function openFC27Details\(kind,rec\)/);
 assert.match(html,/fc27-detail-overlay/);
 assert.match(html,/openFC27Details\(kind,rec\)/);
 assert.match(html,/function observePlayerPortraits\(/);
 assert.match(html,/Wikimedia unavailable/);
 assert.doesNotMatch(html,/جزئیات چالش ↗/);
});

test('verified FC27 evolutions contain accurate detailed levels',()=>{
 const d=JSON.parse(fs.readFileSync('data/fc27-evolutions.json','utf8'));
 assert.ok(d.evolutions.length>=4);
 const intro=d.evolutions.find(x=>x.name==='Intro to Evolutions');
 assert.ok(intro&&intro.levels.length===3);
 assert.equal(intro.levels.map(l=>l.tasks.length).reduce((a,b)=>a+b,0),3);
});
test('verified SBC segments and objective tasks are available in-site',()=>{
 const d=JSON.parse(fs.readFileSync('data/fc27-challenges.json','utf8'));
 assert.ok(d.sections.objectives.some(x=>x.tasks?.length>=3));
 assert.ok(d.sections.sbc.some(x=>x.squads?.length>=3));
 assert.match(html,/function loadVerifiedEvolutions/);
 assert.match(html,/مراحل تکامل \/ Evolution levels/);
 assert.match(html,/مأموریت‌های دقیق \/ Objective tasks/);
});

test('game navigation and official news are wired to real sections',()=>{
 for(const section of ['home','obj','sbc','players','squad','evo','club','dns','news','settings'])assert.ok(html.includes('id="sec-'+section+'"'));
 assert.match(html,/data-game-nav="home"/);
 assert.doesNotMatch(html,/<nav class="bottom-nav"/);
 assert.match(html,/data\.items\|\|\[\]/);
 assert.match(html,/window\.addEventListener\('popstate'/);
 assert.match(html,/fc-game-nav button:focus-visible/);
});

test('mobile overflow navigation and history restoration are safe',()=>{
 assert.match(html,/function applyFCConsoleMode/);
 assert.match(html,/function fcConsolePoll/);
 assert.match(html,/function toggleFCMobileMore/);
 assert.match(html,/function restoreFC27Section/);
 assert.match(html,/window\.addEventListener\('hashchange',restoreFC27Section\)/);
 assert.match(html,/if\(!fromHistory\)/);
 assert.doesNotMatch(html,/نمایش بسته‌های واقعی فقط بعد از اتصال منبع/);
});

test('console mode supports PS4/PS5 navigation and has no bottom bar',()=>{
 assert.match(html,/fc-console/);
 assert.match(html,/navigator\.getGamepads/);
 assert.match(html,/fcConsoleMove/);
 assert.match(html,/fcConsoleBack/);
 assert.match(html,/fcConsoleToggle/);
 assert.doesNotMatch(html,/<nav class="bottom-nav"/);
 assert.doesNotMatch(html,/id="fcMobileMore"/);
});

test('squad picker supports string and numeric player IDs',()=>{
 assert.match(html,/String\(x\.id\)===String\(pid\)/);
 assert.match(html,/class="squad-pl-item"/);
 assert.match(html,/function renderPitch\(/);
});
test('FC27 Persian headlines and refresh are wired',()=>{
 assert.match(html,/FC27_NEWS_FA/);
 assert.match(html,/fc27NewsTitle\(item\)/);
 assert.match(html,/15\*60\*1000/);
 assert.match(html,/fc27-sbc-player-photo/);
});

test('console DNS page has copy buttons and official service-status links',()=>{
 assert.match(html,/id="sec-dns"/);
 assert.match(html,/function copyFCDns/);
 assert.match(html,/status\.playstation\.com/);
 assert.match(html,/help\.ea\.com\/en\/server-status/);
 assert.doesNotMatch(html,/id="sec-store"/);
});

test('updated FC27 styling and strictly dated card market',()=>{
 assert.match(html,/fc27-visual-relaunch/);
 assert.match(html,/قیمت مشاهده‌شده · زنده نیست/);
 assert.match(html,/age<=3\*3600000/);
 const prices=JSON.parse(fs.readFileSync('data/fc27-market-verified.json','utf8'));
 assert.ok(Array.isArray(prices.cards));
 assert.ok(prices.cards.every(p=>typeof p.verified_at==='string'&&Number.isSafeInteger(p.price_coins)));
 const importer=fs.readFileSync('scripts/import-verified-prices.cjs','utf8');
 assert.match(importer,/Stale or future observation refused/);
});

test('market updater never refreshes timestamp when no observation was verified',()=>{
 const script=fs.readFileSync('scripts/sync-fc27-market.cjs','utf8');
 assert.match(script,/No prices independently verified/);
 assert.match(script,/verified_at:new Date\(\)\.toISOString\(\)/);
 assert.match(html,/async function loadVerifiedMarket\(/);
 assert.match(html,/www\.futnext\.com/);
});

test('official EA news extractor uses article title and excludes FC26',()=>{
 const script=fs.readFileSync('scripts/sync-fc27-news.cjs','utf8');
 assert.match(script,/meta\[property="og:title"\]/);
 assert.ok(script.includes('officialTitle'));
 assert.ok(script.includes('FC\\s*26'));
});
test('PSN status is not confused with DNS resolution',()=>{
 assert.match(html,/آزمایش DNS فقط دسترسی به نام دامنه را نشان می‌دهد/);
 assert.match(html,/status\.playstation\.com/);
 assert.match(html,/fcDnsCheckedAt/);
});
