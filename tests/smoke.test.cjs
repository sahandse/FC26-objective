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
test('legacy FC26 sample data is not shipped',()=>{
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
