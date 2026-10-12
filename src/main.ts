// Migration of the FC27 application runtime to a Vite TypeScript entry point.
// Legacy handlers are explicitly exposed for existing inline HTML events.
// @ts-nocheck

/* ── UTILS ── */
function daysFromNow(d){return null; /* Relative dates are not verified expiry dates. */}
function hoursFromNow(h){return null; /* Relative dates are not verified expiry dates. */}
function fmtExp(iso){
  if(!iso)return{txt:'تاریخ تأیید نشده',cls:'exp-permanent',ico:'📅'};
  const diff=new Date(iso)-Date.now();
  if(!Number.isFinite(diff))return{txt:'تاریخ نامعتبر',cls:'exp-permanent',ico:'📅'};
  if(diff<0)return{txt:'منقضی',cls:'exp-gone',ico:'❌'};
  const h=diff/36e5;
  if(h<6) return{txt:`${Math.floor(h)}ساعت ${Math.floor((h%1)*60)}دقیقه`,cls:'exp-crit',ico:'🔥'};
  if(h<24)return{txt:`${Math.floor(h)} ساعت دیگر`,cls:'exp-warn',ico:'⚠️'};
  const d=Math.floor(h/24),rh=Math.floor(h%24);
  if(d<3) return{txt:`${d} روز ${rh} ساعت`,cls:'exp-warn',ico:'⚠️'};
  return{txt:`${d} روز دیگر`,cls:'exp-ok',ico:'📅'};
}
function isExpiring(o){if(!o.exp)return false;const left=new Date(o.exp)-Date.now();return Number.isFinite(left)&&left>0&&left<3*864e5;}
function cardCls(rat,sp){
  if(rat===0)return'fc-pack';
  if(sp)return'fc-special';
  if(rat>=94)return'fc-tots';
  if(rat>=84)return'fc-gold';
  return'fc-silver';
}
function hl(txt,q){
  if(!q)return txt;
  return txt.replace(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})`,'gi'),'<mark class="hl">$1</mark>');
}

/* ── PLAYER IMAGE MAP ──
   Primary: locally cached images; legacy portraits may differ from FC27 card art
   Fallback: neutral placeholder (do not substitute older seasons as FC27 art)
*/
const PIMG={
  'Erling Haaland':239085,'Kylian Mbappé':231747,'Vinicius Jr':238794,
  'Jude Bellingham':252371,'Rodri':231866,'Lamine Yamal':277643,
  'Pedri':251854,'Jamal Musiala':256790,'Mohamed Salah':209331,
  'Virgil van Dijk':203376,'Bruno Fernandes':212198,'Xavi Simons':245367,
  'Kvaratskhelia':247635,'Rafael Leão':241721,'Ousmane Dembélé':231443,
  'Bukayo Saka':246669,'Diogo Jota':224458,'Marcus Rashford':231677,
  'Theo Hernandez':232656,'Joshua Kimmich':212622,'Kevin De Bruyne':192985,
  'Robert Lewandowski':188545,'Harry Kane':202126,'Alisson':212831,
  'Ederson':210257,'Trent Alexander-Arnold':231281,'Declan Rice':234378,
  'Martin Ødegaard':222665,'William Saliba':243715,'Achraf Hakimi':235212,
  'Marquinhos':207865,'Gianluigi Donnarumma':230621,'Eduardo Camavinga':248243,
  'Phil Foden':237692,'Gabriel Martinelli':251566,
  'Son Heung-min':200104,'Toni Kroos':182521,'Federico Valverde':239053,
  'Bernardo Silva':218667,'Ruben Dias':239818,'Antoine Griezmann':194765,
  'Cole Palmer':257534,'Florian Wirtz':256630,'Rodrygo':243812,
  'Alexander Isak':233731,'Christopher Nkunku':232411,'Bruno Guimarães':247851,
  'Granit Xhaka':199503,'Ferran Torres':254292,'Lionel Messi':158023,
  'Dani Carvajal':204963,'Casemiro':200145,'Reece James':238074,
  'Joao Cancelo':210514,'Leroy Sane':222492,'Kingsley Coman':213345,
  'Niclas Füllkrug':208277,'Jonathan Tah':221458,'Sergio Ramos':199736
};

/* ── PLAYERS DATA ── */
const PLAYERS_RAW=[]; // Populated from validated FC27 public-rating snapshot

function playerFUT(name,rat,pos,sp,big){
  const id=PIMG[name];
  const cls=cardCls(rat,sp)+(big?' big':'');
  const lastName=name?(name.split(' ').pop()||name):'';
  if(id){
    return `<div class="fut-card ${cls}"><div class="fc-inner"><div class="fc-info-col"><div class="fc-rat">${rat}</div><div class="fc-pos">${pos}</div></div><div class="fc-photo"><img class="pface" src="img/players/${id}.png" alt="${name}" loading="lazy" onerror="imgFallback(this,${id})"></div></div><div class="fc-name-band">${lastName}</div></div>`;
  }
  return `<div class="fut-card ${cls}"><div class="fc-inner"><div class="fc-info-col"><div class="fc-rat">${rat||''}</div><div class="fc-pos">${pos||''}</div></div><div class="fc-photo"></div></div><div class="fc-name-band">${lastName||pos||''}</div></div>`;
}
const AVAILABLE_PORTRAITS=new Set();
const VERIFIED_PHOTO_FILES=new Map();
const PORTRAIT_LOOKUP=new Map();let portraitObserver=null;
function portraitHTML(p,size=36){
 const id=Number(p.imgId||PIMG[p.name]||p.id);
 if(AVAILABLE_PORTRAITS.has(id)){const file=VERIFIED_PHOTO_FILES.get(id)||id+".png";return `<img src="img/players/${file}" alt="${p.name}" loading="lazy" onerror="imgFallback(this,${id})">`;}
 const name=String(p.name||'').replace(/[&<>"']/g,'');
 return `<span class="player-photo-empty fc-wiki-portrait" data-player-name="${name}" style="font-size:${size}px;opacity:.45" role="img" aria-label="در حال بررسی تصویر بازیکن">⚽</span>`;
}
function observePlayerPortraits(){
 if(!('IntersectionObserver' in window))return;
 if(!portraitObserver)portraitObserver=new IntersectionObserver(entries=>{for(const e of entries){if(e.isIntersecting){portraitObserver.unobserve(e.target);fetchPlayerPortrait(e.target)}}},{rootMargin:'140px'});
 document.querySelectorAll('.fc-wiki-portrait:not([data-portrait-observed])').forEach(el=>{el.dataset.portraitObserved='1';portraitObserver.observe(el)});
}
async function fetchPlayerPortrait(el){
 const name=el.dataset.playerName;if(!name||!el.isConnected)return;
 if(!PORTRAIT_LOOKUP.has(name)){
  const task=(async()=>{
   const url='https://en.wikipedia.org/w/api.php?'+new URLSearchParams({action:'query',format:'json',origin:'*',prop:'pageimages|extracts',piprop:'thumbnail',pithumbsize:'200',exintro:'1',explaintext:'1',titles:name});
   const response=await fetch(url,{signal:AbortSignal.timeout(6000)});
   if(!response.ok)throw Error('Wikimedia unavailable');
   const data=await response.json();const pages=Object.values(data.query?.pages||{});
   const page=pages.find(p=>p.thumbnail?.source&&p.extract&&p.title);
   if(!page||!/(footballer|soccer player|association football|professional football)/i.test(page.extract.slice(0,520)))return null;
   const normalized=x=>x.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
   const expected=normalized(name),actual=normalized(page.title);
   if(!(actual===expected||actual.startsWith(expected+' (')))return null;
   const imageURL=new URL(page.thumbnail.source);if(!/^(upload\.wikimedia\.org|commons\.wikimedia\.org)$/.test(imageURL.hostname))return null;
   return imageURL.href;
  })().catch(()=>null);
  PORTRAIT_LOOKUP.set(name,task);
 }
 const src=await PORTRAIT_LOOKUP.get(name);
 if(!src||!el.isConnected)return;
 const img=document.createElement('img');img.src=src;img.alt=name;img.loading='lazy';img.decoding='async';img.referrerPolicy='no-referrer';img.onerror=()=>{img.replaceWith(el);el.setAttribute('aria-label','تصویر بازیکن پیدا نشد')};el.replaceWith(img);
}
async function loadPortraitIndex(){try{const r=await fetch('./data/available-portraits.json',{cache:'no-store'});if(!r.ok)throw Error('No portrait index');const data=await r.json();if(!Array.isArray(data.ids))throw Error('Invalid portrait index');AVAILABLE_PORTRAITS.clear();VERIFIED_PHOTO_FILES.clear();for(const id of data.ids)if(Number.isInteger(id))AVAILABLE_PORTRAITS.add(id);for(const [id,file] of Object.entries(data.files||{}))if(/^\d+\.(png|jpg|webp)$/.test(file))VERIFIED_PHOTO_FILES.set(Number(id),file);renderPlayers();}catch(e){console.warn('Portrait index unavailable',e)}}
function imgFallback(el,id){
  const urls=[]; // FC26 CDN fallbacks disabled; use verified FC27 assets only when available.
  const tried=el.dataset.tried?parseInt(el.dataset.tried):0;
  if(tried<urls.length){el.dataset.tried=tried+1;el.src=urls[tried];}
  else{el.onerror=null;el.removeAttribute('src');el.style.display='none';if(el.parentElement&&!el.parentElement.querySelector('.img-placeholder')){const p=document.createElement('span');p.className='img-placeholder';p.textContent='⚽';p.setAttribute('aria-label','تصویر بازیکن موجود نیست');p.style.cssText='position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:24px;opacity:.4';el.parentElement.appendChild(p);}}
}

/* ── OBJECTIVES DATA (Festival of Football - Jun 5 – Jul 24 2026) ── */
const OBJ_RAW=[]; // Awaiting verified FC27 feed

/* ── SBC DATA (June 2026 - futbin/ea fc 26) ── */
const SBC_RAW=[]; // Awaiting verified FC27 feed

/* ── STATE ── */
let state={objFavs:{},objDone:{},objProgs:{},sbcFavs:{},sbcDone:{},plFavs:{},watchlist:{},squad:{formation:'4-3-3',slots:{}},evoProgs:{},compSel:[],owned:{},galleryMode:false};
let objCat='all',objFilters={fav:false,inc:false,exp:false};
let sbcCat='all',sbcFilters={fav:false,inc:false,exp:false};
let plPos='all',plCardType='all',plFilters={fav:false,wl:false};
let activeSquadSlot=null;
let advF={pac:0,sho:0,pas:0,dri:0,def:0,phy:0};
let draftState={picks:{},slot:0};
const DRAFT_SLOTS=[{pos:'GK',type:'GK'},{pos:'RB',type:'DEF'},{pos:'CB',type:'DEF'},{pos:'CB',type:'DEF'},{pos:'LB',type:'DEF'},{pos:'CDM',type:'MID'},{pos:'CM',type:'MID'},{pos:'CAM',type:'MID'},{pos:'RW',type:'ATT'},{pos:'ST',type:'ATT'},{pos:'LW',type:'ATT'}];

function loadState(){try{const s=localStorage.getItem('fc27hub1');if(s)state=JSON.parse(s);}catch(e){}}
function saveState(){try{localStorage.setItem('fc27hub1',JSON.stringify(state));}catch(e){}}

/* ── OBJECTIVE CARD ── */
const OBJ_CAT_NAMES={all:'همه اهداف',weekly:'TOTS هفتگی',daily:'اهداف روزانه',milestone:'مایل‌استون‌ها',event:'جشنواره فوتبال',seasonal:'اهداف فصلی',league:'اهداف رقابتی'};
const OBJ_CAT_COLOR={weekly:'#7EB8FF',daily:'#D4A0FF',milestone:'#F5B014',event:'#FF9090',seasonal:'#6EE6A6',league:'#5EE0D4'};
const OBJ_CAT_BADGE={weekly:'b-weekly',daily:'b-daily',milestone:'b-milestone',event:'b-event',seasonal:'b-seasonal',league:'b-league'};

function objCardHTML(o,q){
  const fav=!!state.objFavs[o.id],done=!!state.objDone[o.id];
  const prog=state.objProgs[o.id]??(o.prog?o.prog.cur:null);
  const exp=fmtExp(o.exp),col=OBJ_CAT_COLOR[o.cat]||'#F5B014',r=o.rew;
  let rewVis=r.type==='xp'?`<div class="fut-card fc-xp"><div class="fc-inner" style="align-items:center;justify-content:center"><span class="fc-icon">⚡</span></div><div class="fc-name-band" style="color:#E0A0FF">XP</div></div>`:
    r.type==='pack'?`<div class="fut-card fc-pack"><div class="fc-inner" style="align-items:center;justify-content:center"><span class="fc-icon">📦</span></div><div class="fc-name-band" style="color:#80C0FF">Pack</div></div>`:
    playerFUT(r.name,r.rat,r.pos,r.sp);
  let progHTML='';
  if(o.prog||prog!=null){
    const max=o.prog?.max||100,cur=prog??0,pct=Math.min(100,Math.round(cur/max*100));
    const pfCls=pct>=100?'pf-green':pct>=50?'pf-gold':'pf-blue';
    progHTML=`<div class="prog-wrap"><div class="prog-head"><span>پیشرفت</span><span>${cur.toLocaleString('fa-IR')} / ${max.toLocaleString('fa-IR')}</span></div><div class="prog-bar"><div class="prog-fill ${pfCls}" style="width:${pct}%"></div></div></div>`;
  }
  return `<div class="card ${done?'done':''} ${fav?'fav':''}" id="oc-${o.id}" style="--cat-color:${col}">
    <div class="card-head">
      <div class="card-head-left">
        <div class="badges">
          <span class="badge ${OBJ_CAT_BADGE[o.cat]||'b-weekly'}">${hl(o.catFA,q)}</span>
          <span class="badge b-${o.dif}">${o.difFA}</span>
          ${done?'<span class="badge b-done">✓ تکمیل</span>':''}
          ${isExpiring(o)&&!done?'<span class="badge" style="background:rgba(249,115,22,.18);color:#FFAC6A">🔥 منقضی می‌شود</span>':''}
        </div>
        <div class="card-name">${hl(o.nameFA,q)}</div>
      </div>
      <button class="fav-btn" onclick="toggleObjFav('${o.id}')">${fav?'⭐':'☆'}</button>
    </div>
    <div class="reward-box">${rewVis}
      <div class="rew-info">
        <div class="rew-lbl">جایزه</div>
        <div class="rew-name">${hl(r.nameFA,q)}</div>
        ${r.nat?`<div class="rew-sub">${r.flag} ${hl(r.nat,q)}${r.club?' • '+r.club:''}</div>`:''}
        <div class="rew-extras">
          ${o.xp?`<span class="rew-extra">+${o.xp.toLocaleString('fa-IR')} XP</span>`:''}
          ${o.coins?`<span class="rew-extra">+${o.coins.toLocaleString('fa-IR')} سکه</span>`:''}
        </div>
      </div>
    </div>
    <div class="req-mb"><div class="req-ttl">شرایط انجام</div>
      <ul class="req-list">${o.reqs.map(r=>`<li class="req-item"><span class="req-dot">›</span><span>${hl(r.fa,q)}</span></li>`).join('')}</ul>
    </div>
    ${progHTML}
    <div class="card-foot">
      <div class="expiry ${exp.cls}"><span>${exp.ico}</span><span>${exp.txt}</span></div>
      <button class="done-btn ${done?'checked':''}" onclick="toggleObjDone('${o.id}')">${done?'✓ تکمیل شد':'○ علامت‌گذاری'}</button>
    </div>
  </div>`;
}

/* ── SBC CARD ── */
const SBC_CAT_NAMES={all:'همه SBC‌ها',iconic:'آیکونیک/لِگِسی',foundation:'پایه/ارتقاء',league:'SBC لیگ',tots:'Path to Glory / TOTS',limited:'محدود / وام'};
const SBC_CAT_COLOR={iconic:'#D4A0FF',foundation:'#5EE0D4',league:'#7EB8FF',tots:'#F5B014',limited:'#FF9090'};
const SBC_CAT_BADGE={iconic:'b-iconic',foundation:'b-foundation',league:'b-league',tots:'b-tots',limited:'b-limited'};

function sbcCardHTML(s,q){
  const fav=!!state.sbcFavs[s.id],done=!!state.sbcDone[s.id];
  const exp=fmtExp(s.exp),col=SBC_CAT_COLOR[s.cat]||'#A855F7',r=s.rew;
  const bigCard=r.type==='pack'
    ?`<div class="fut-card fc-pack big"><div class="fc-inner" style="align-items:center;justify-content:center"><span class="fc-icon">📦</span></div><div class="fc-name-band" style="color:#80C0FF">Pack</div></div>`
    :playerFUT(r.name,r.rat,r.pos,r.sp,true);
  const reqs=s.reqs.map(req=>`<div class="sbc-req-row"><span class="sbc-req-label">${hl(req.label,q)}</span><span class="sbc-req-val">${hl(req.val,q)}</span></div>`).join('');
  const gid=`g-${s.id}`;
  return `<div class="card ${done?'done':''} ${fav?'fav':''}" id="sc-${s.id}" style="--cat-color:${col}">
    <div class="card-head">
      <div class="card-head-left">
        <div class="badges">
          <span class="badge ${SBC_CAT_BADGE[s.cat]||'b-iconic'}">${hl(s.catFA,q)}</span>
          <span class="badge b-${s.dif}">${s.difFA}</span>
          ${done?'<span class="badge b-done">✓ تکمیل</span>':''}
          ${isExpiring(s)&&!done?'<span class="badge" style="background:rgba(249,115,22,.18);color:#FFAC6A">🔥 منقضی می‌شود</span>':''}
        </div>
        <div class="card-name">${hl(s.nameFA,q)}</div>
      </div>
      <button class="fav-btn" onclick="toggleSBCFav('${s.id}')">${fav?'⭐':'☆'}</button>
    </div>
    <div class="sbc-rew-hero">
      ${bigCard}
      <div>
        <div class="rew-name">${hl(r.nameFA,q)}</div>
        ${r.nat?`<div class="rew-sub">${r.flag} ${hl(r.nat,q)}${r.club?' • '+r.club:''}</div>`:''}
        <div class="rew-extras">
          ${r.rat?`<span class="rew-extra">⭐ ${r.rat}</span>`:''}
          ${r.pos?`<span class="rew-extra">${r.pos}</span>`:''}
          ${s.xp?`<span class="rew-extra">+${s.xp.toLocaleString('fa-IR')} XP</span>`:''}
          ${s.coins?`<span class="rew-extra">+${s.coins.toLocaleString('fa-IR')} سکه</span>`:''}
        </div>
      </div>
    </div>
    <div class="sbc-reqs"><div class="req-ttl">شرایط SBC</div>${reqs}</div>
    <div class="sbc-guide">
      <button class="sbc-guide-btn" onclick="toggleGuide('${gid}')">📖 راهنمای انجام SBC ▾</button>
      <div class="sbc-guide-body" id="${gid}">${hl(s.guide,q)}</div>
    </div>
    <div class="card-foot">
      <div style="display:flex;gap:12px;align-items:center">
        <div class="expiry ${exp.cls}"><span>${exp.ico}</span><span>${exp.txt}</span></div>
        ${s.costFA?`<div class="sbc-cost-pill">💰 ${s.costFA}</div>`:''}
      </div>
      <div style="display:flex;gap:6px">
        <button class="solver-btn" onclick="openSolver('${s.id}')">🧮 حل کن</button>
        <button class="done-btn ${done?'checked':''}" onclick="toggleSBCDone('${s.id}')">${done?'✓ تکمیل':'○ علامت'}</button>
      </div>
    </div>
  </div>`;
}

function toggleGuide(id){const el=document.getElementById(id);if(el)el.classList.toggle('open');}

/* ── SBC SOLVER ── */
const SBC_META={
  sbc01:{rat:86,chem:22,league:null,n:11},
  sbc02:{rat:83,chem:22,league:'سری‌آ',n:11},
  sbc03:{rat:85,chem:23,league:'لیگ برتر',n:11},
  sbc04:{rat:84,chem:23,league:'لیگ برتر',n:11},
  sbc05:{rat:87,chem:20,league:null,n:11},
  sbc06:{rat:83,chem:23,league:'لیگ برتر',n:11},
  sbc07:{rat:84,chem:0,league:null,n:10},
  sbc08:{rat:75,chem:20,league:null,n:11},
  sbc09:{rat:78,chem:23,league:'لیگ برتر',n:11},
  sbc10:{rat:78,chem:23,league:'لالیگا',n:11},
  sbc11:{rat:76,chem:18,league:null,n:11},
  sbc12:{rat:82,chem:22,league:'بوندسلیگا',n:11},
  sbc13:{rat:82,chem:22,league:'سری‌آ',n:11},
  sbc14:{rat:81,chem:22,league:'لیگ ۱',n:11},
  sbc15:{rat:86,chem:22,league:null,n:11}
};
let solverSbcId=null;

function openSolver(sbcId){
  solverSbcId=sbcId;
  const s=SBC_RAW.find(x=>x.id===sbcId);
  if(!s)return;
  if(!state.owned)state.owned={};
  document.getElementById('solverTitle').textContent='🧮 '+s.nameFA;
  document.getElementById('solverModal').classList.add('open');
  renderSolver();
}
function closeSolver(){document.getElementById('solverModal').classList.remove('open');solverSbcId=null;}
function toggleOwned(pid){
  if(!state.owned)state.owned={};
  state.owned[pid]=!state.owned[pid];
  saveState();
  renderSolver();
}
function renderSolver(){
  const meta=SBC_META[solverSbcId];
  if(!meta)return;
  if(!state.owned)state.owned={};
  let pool=PLAYERS_RAW.filter(p=>{
    if(p.rat<meta.rat)return false;
    if(meta.league&&p.leagueFA!==meta.league)return false;
    return true;
  });
  pool.sort((a,b)=>{
    const ao=!!state.owned[a.id],bo=!!state.owned[b.id];
    if(ao!==bo)return ao?-1:1;
    return a.price-b.price;
  });
  const squad=pool.slice(0,meta.n);
  const ownedCount=squad.filter(p=>state.owned[p.id]).length;
  const buyPlayers=squad.filter(p=>!state.owned[p.id]);
  const missingPrices=buyPlayers.some(p=>getFC27CardCoins(p)===null);
  const buyCost=missingPrices?null:buyPlayers.reduce((sum,p)=>sum+getFC27CardCoins(p),0);
  const chem=calcChem(squad);
  document.getElementById('solverChemLbl').textContent='⚗️ کمیستری: '+chem;
  document.getElementById('solverChemVal').textContent=chem+' / 33';
  document.getElementById('solverChemFill').style.width=Math.round(chem/33*100)+'%';
  document.getElementById('solverSummary').innerHTML=`
    <div class="slv-stat"><div class="slv-stat-val slv-green">${ownedCount}</div><div class="slv-stat-lbl">دارید</div></div>
    <div class="slv-stat"><div class="slv-stat-val slv-red">${buyPlayers.length}</div><div class="slv-stat-lbl">نیاز خرید</div></div>
    <div class="slv-stat"><div class="slv-stat-val slv-gold">${buyCost===null?'ناموجود':fmtPrice(buyCost)}</div><div class="slv-stat-lbl">هزینه تخمینی</div></div>
    <div class="slv-stat"><div class="slv-stat-val slv-purple">${squad.length}</div><div class="slv-stat-lbl">بازیکن</div></div>`;
  if(!squad.length){
    document.getElementById('solverPlayers').innerHTML=`<div style="text-align:center;padding:30px;color:var(--t3)">بازیکن کافی در دیتابیس یافت نشد</div>`;
    return;
  }
  document.getElementById('solverPlayers').innerHTML=squad.map(p=>{
    const isOwned=!!state.owned[p.id];
    return `<div class="slv-player ${isOwned?'owned':'need-buy'}">
      <div class="slv-rat">${p.rat}</div>
      <div class="slv-info">
        <div class="slv-name">${p.nameFA}</div>
        <div class="slv-club">${p.flag} ${p.club} · ${p.leagueFA}</div>
      </div>
      <div class="slv-price ${isOwned?'zero':''}">${isOwned?'✓ موجود':getFC27CardPriceText(p)}</div>
      <button class="own-toggle ${isOwned?'is-owned':''}" onclick="toggleOwned('${p.id}')">${isOwned?'✓ دارم':'دارم؟'}</button>
    </div>`;
  }).join('');
}

/* ── RENDER OBJECTIVES ── */
function renderObj(){
  const q=document.getElementById('objSearch').value.toLowerCase().trim();
  const srt=document.getElementById('objSort').value,now=Date.now();
  let list=OBJ_RAW.filter(o=>{
    if(objCat!=='all'&&o.cat!==objCat)return false;
    if(objFilters.fav&&!state.objFavs[o.id])return false;
    if(objFilters.inc&&state.objDone[o.id])return false;
    if(objFilters.exp){const left=o.exp?new Date(o.exp)-now:NaN;if(!Number.isFinite(left)||left<=0||left>3*864e5)return false;}
    if(q){const hay=[o.nameFA,o.name,o.catFA,o.rew.nameFA,o.rew.nat,o.difFA,...o.reqs.map(r=>r.fa)].join(' ').toLowerCase();if(!hay.includes(q))return false;}
    return true;
  });
  const DM={hard:3,medium:2,easy:1};
  if(srt==='rew')list.sort((a,b)=>(b.rew.rat||0)-(a.rew.rat||0));
  else if(srt==='exp')list.sort((a,b)=>{if(!a.exp&&!b.exp)return 0;if(!a.exp)return 1;if(!b.exp)return -1;return new Date(a.exp)-new Date(b.exp);});
  else if(srt==='dif')list.sort((a,b)=>DM[b.dif]-DM[a.dif]);
  else if(srt==='az')list.sort((a,b)=>a.nameFA.localeCompare(b.nameFA,'fa'));
  document.getElementById('objSecTitle').textContent=OBJ_CAT_NAMES[objCat]||'همه اهداف';
  document.getElementById('objSecCnt').textContent=list.length+' هدف';
  const g=document.getElementById('objGrid'),e=document.getElementById('objEmpty');
  if(!list.length){g.innerHTML='';e.style.display='block';return;}
  e.style.display='none';g.innerHTML=list.map(o=>objCardHTML(o,q)).join('');
}

/* ── RENDER SBC ── */
function renderSBC(){
  const q=document.getElementById('sbcSearch').value.toLowerCase().trim();
  const srt=document.getElementById('sbcSort').value,now=Date.now();
  let list=SBC_RAW.filter(s=>{
    if(sbcCat!=='all'&&s.cat!==sbcCat)return false;
    if(sbcFilters.fav&&!state.sbcFavs[s.id])return false;
    if(sbcFilters.inc&&state.sbcDone[s.id])return false;
    if(sbcFilters.exp){const left=s.exp?new Date(s.exp)-now:NaN;if(!Number.isFinite(left)||left<=0||left>3*864e5)return false;}
    if(q){const hay=[s.nameFA,s.name,s.catFA,s.rew.nameFA,s.rew.nat,s.difFA,...s.reqs.map(r=>r.label+' '+r.val),s.guide].join(' ').toLowerCase();if(!hay.includes(q))return false;}
    return true;
  });
  const DM={hard:3,medium:2,easy:1};
  if(srt==='rew')list.sort((a,b)=>(b.rew.rat||0)-(a.rew.rat||0));
  else if(srt==='cost')list.sort((a,b)=>(a.cost||0)-(b.cost||0));
  else if(srt==='exp')list.sort((a,b)=>{if(!a.exp&&!b.exp)return 0;if(!a.exp)return 1;if(!b.exp)return -1;return new Date(a.exp)-new Date(b.exp);});
  else if(srt==='dif')list.sort((a,b)=>DM[b.dif]-DM[a.dif]);
  document.getElementById('sbcSecTitle').textContent=SBC_CAT_NAMES[sbcCat]||'همه SBC‌ها';
  document.getElementById('sbcSecCnt').textContent=list.length+' SBC';
  const g=document.getElementById('sbcGrid'),e=document.getElementById('sbcEmpty');
  if(!list.length){g.innerHTML='';e.style.display='block';return;}
  e.style.display='none';g.innerHTML=list.map(s=>sbcCardHTML(s,q)).join('');
}

/* Player attributes must be verified source data; never fabricate stat values. */
function deterministicStats(p){
  const keys=p.posType==='GK'?['DIV','HAN','KIC','REF','SPD','POS']:['PAC','SHO','PAS','DRI','DEF','PHY'];
  const source=p.stats;
  if(!source || typeof source!=='object')return [];
  return keys.filter(k=>Number.isFinite(Number(source[k])) && Number(source[k])>=0 && Number(source[k])<=99)
    .map(lbl=>({lbl,v:Number(source[lbl])}));
}
/* ── FORMATIONS ── */
const FORMATIONS={
  '4-3-3':[{pos:'GK',x:50,y:90},{pos:'RB',x:81,y:75},{pos:'CB',x:63,y:72},{pos:'CB',x:37,y:72},{pos:'LB',x:19,y:75},{pos:'CM',x:70,y:52},{pos:'CDM',x:50,y:56},{pos:'CM',x:30,y:52},{pos:'RW',x:84,y:25},{pos:'ST',x:50,y:16},{pos:'LW',x:16,y:25}],
  '4-2-3-1':[{pos:'GK',x:50,y:90},{pos:'RB',x:81,y:75},{pos:'CB',x:63,y:72},{pos:'CB',x:37,y:72},{pos:'LB',x:19,y:75},{pos:'CDM',x:64,y:58},{pos:'CDM',x:36,y:58},{pos:'RM',x:82,y:38},{pos:'CAM',x:50,y:38},{pos:'LM',x:18,y:38},{pos:'ST',x:50,y:16}],
  '4-4-2':[{pos:'GK',x:50,y:90},{pos:'RB',x:81,y:75},{pos:'CB',x:63,y:72},{pos:'CB',x:37,y:72},{pos:'LB',x:19,y:75},{pos:'RM',x:83,y:52},{pos:'CM',x:63,y:52},{pos:'CM',x:37,y:52},{pos:'LM',x:17,y:52},{pos:'ST',x:65,y:18},{pos:'ST',x:35,y:18}],
  '3-5-2':[{pos:'GK',x:50,y:90},{pos:'CB',x:71,y:74},{pos:'CB',x:50,y:71},{pos:'CB',x:29,y:74},{pos:'RM',x:88,y:52},{pos:'CM',x:69,y:50},{pos:'CDM',x:50,y:55},{pos:'CM',x:31,y:50},{pos:'LM',x:12,y:52},{pos:'ST',x:65,y:18},{pos:'ST',x:35,y:18}],
  '5-3-2':[{pos:'GK',x:50,y:90},{pos:'RB',x:89,y:72},{pos:'CB',x:71,y:75},{pos:'CB',x:50,y:78},{pos:'CB',x:29,y:75},{pos:'LB',x:11,y:72},{pos:'CM',x:68,y:50},{pos:'CDM',x:50,y:52},{pos:'CM',x:32,y:50},{pos:'ST',x:65,y:18},{pos:'ST',x:35,y:18}]
};

/* ── EVOLUTION DATA ── */
const EVO_RAW=[]; // Awaiting verified FC27 feed

/* ── ADVANCED STAT FILTER ── */
const ADV_STATS=['pac','sho','pas','dri','def','phy'];
const ADV_LABELS={pac:'PAC سرعت',sho:'SHO شوت',pas:'PAS پاس',dri:'DRI دریبل',def:'DEF دفاع',phy:'PHY فیزیک'};
function buildAdvGrid(){
  const grid=document.getElementById('advGrid');
  if(!grid)return;
  grid.innerHTML=ADV_STATS.map(s=>`
    <div class="adv-row">
      <div class="adv-lbl"><span>${ADV_LABELS[s]}</span><b id="adv-v-${s}">${advF[s]||0}+</b></div>
      <input type="range" class="adv-range" id="adv-r-${s}" min="0" max="99" value="${advF[s]||0}" oninput="onAdvRange('${s}',this.value)">
    </div>`).join('');
}
function onAdvRange(stat,val){
  advF[stat]=parseInt(val);
  const lbl=document.getElementById('adv-v-'+stat);
  if(lbl)lbl.textContent=val+'+';
  renderPlayers();
}
function toggleAdvFilter(){
  const panel=document.getElementById('advPanel');
  const btn=document.getElementById('advToggleBtn');
  const isOpen=panel.classList.contains('open');
  panel.classList.toggle('open',!isOpen);
  btn.classList.toggle('active',!isOpen);
  if(!isOpen)buildAdvGrid();
}
function resetAdvFilter(){
  ADV_STATS.forEach(s=>{
    advF[s]=0;
    const r=document.getElementById('adv-r-'+s);if(r)r.value=0;
    const v=document.getElementById('adv-v-'+s);if(v)v.textContent='0+';
  });
  renderPlayers();
}

/* ── WATCHLIST ── */
function toggleWatchlist(pid){
  if(!state.watchlist)state.watchlist={};
  state.watchlist[pid]=!state.watchlist[pid];
  saveState();
  const cnt=Object.values(state.watchlist).filter(Boolean).length;
  const el=document.getElementById('wl-cnt');if(el)el.textContent=cnt||'';
  document.getElementById('pfb-wl').classList.toggle('active',plFilters.wl);
  renderPlayers();
  renderWatchlist();
  toast(state.watchlist[pid]?'👁️ به واچ‌لیست اضافه شد':'👁️ از واچ‌لیست حذف شد','i');
}
function renderWatchlist(){
  const wl=PLAYERS_RAW.filter(p=>state.watchlist&&state.watchlist[p.id]);
  const cnt=document.getElementById('wlSecCnt');
  const sec=document.getElementById('wlSection');
  const wlCntEl=document.getElementById('wl-cnt');
  if(wlCntEl)wlCntEl.textContent=wl.length||'';
  if(plFilters.wl){
    if(sec)sec.style.display='block';
    if(cnt)cnt.textContent=wl.length+' بازیکن';
    const container=document.getElementById('wlContent');
    if(!container)return;
    if(!wl.length){
      container.innerHTML=`<div class="empty"><div class="empty-icon">👁️</div><h3>واچ‌لیست خالی است</h3><p>دکمه 👁️ پایین کارت بازیکنان را بزنید</p></div>`;
      return;
    }
    container.innerHTML=wl.map(p=>{
      // Real history requires a timestamped, verified price feed.
      // Until then, never show synthetic price movements.
      const tCls='trend-flat';
      const tTxt='روند نامشخص';
      return `<div class="wl-row">
        <div class="wl-rat">${p.rat}</div>
        <div class="wl-info">
          <div class="wl-name">${p.nameFA}</div>
          <div class="wl-sub">${p.flag} ${p.club} · ${p.pos}</div>
        </div>
        <span style="font-size:10px;color:var(--t3)">داده تاریخی موجود نیست</span>
        <div class="wl-price-col">
          <div class="wl-price">${getFC27CardPriceText(p)}</div>
          <div class="wl-trend ${tCls}">${tTxt}</div>
        </div>
        <button class="wl-del" onclick="toggleWatchlist('${p.id}')">✕</button>
      </div>`;
    }).join('');
  } else {
    if(sec)sec.style.display='none';
  }
}

/* ── PLAYSTYLE GUIDE ── */
const PS_DATA=[
  {pos:'ST / CF', icon:'⚽',roles:'Advanced Forward • Poacher • Target Forward',
   plus:['Finesse Shot+','Power Header+'],reg:['Power Shot','First Touch','Technical','Trivela','Chip Shot','Dead Ball']},
  {pos:'LW / RW', icon:'🏃',roles:'Winger • Inside Forward • Wide Midfielder',
   plus:['Speed Dribble+','Rapid+'],reg:['Trickster','First Touch','Technical','Finesse Shot','Whipped Pass','Incisive Pass']},
  {pos:'CAM', icon:'🔮',roles:'Playmaker • Shadow Striker • Half Winger',
   plus:['Technical+','First Touch+'],reg:['Whipped Pass','Finesse Shot','Incisive Pass','Trickster','Long Ball Pass']},
  {pos:'CM / CDM', icon:'⚡',roles:'Box-to-Box • Deep-Lying Playmaker • Holding',
   plus:['Whipped Pass+','Long Ball Pass+'],reg:['Press Proven','Anticipate','Intercept','Technical','Incisive Pass']},
  {pos:'LB / RB', icon:'🛡️',roles:'Attacking Full Back • Wingback • Full Back',
   plus:['Crosser+','Rapid+'],reg:['First Touch','Incisive Pass','Long Throw','Trickster','Anticipate']},
  {pos:'CB', icon:'🏰',roles:'Central Defender • Ball-Playing CB • Stopper',
   plus:['Anticipate+','Intercept+'],reg:['Aerial','Block','Slide Tackle','Long Ball Pass','Bruiser']},
  {pos:'GK', icon:'🧤',roles:'Goalkeeper • Sweeper Keeper',
   plus:['Far Reach+','Rush Out+'],reg:['Deflector','Footwork','Aerial','Far Throw']}
];
function showPlayStyleGuide(){
  const c=document.getElementById('psContent');
  if(c&&!c.innerHTML){
    c.innerHTML=PS_DATA.map(p=>`
      <div class="ps-sec">
        <div class="ps-pos-hd">
          <span style="font-size:18px">${p.icon}</span>
          <span class="ps-pos-name">${p.pos}</span>
        </div>
        <div class="ps-roles">${p.roles}</div>
        <div class="ps-chips">
          ${p.plus.map(x=>`<span class="ps-chip-plus">★ ${x}</span>`).join('')}
          ${p.reg.map(x=>`<span class="ps-chip-reg">${x}</span>`).join('')}
        </div>
      </div>`).join('');
  }
  document.getElementById('psOverlay').classList.add('open');
}
function closePlayStyleGuide(){document.getElementById('psOverlay').classList.remove('open');}

/* ── DRAFT SIMULATOR ── */
function startDraft(){
  draftState={picks:{},slot:0};
  document.getElementById('draftOverlay').classList.add('open');
  renderDraftSlot();
}
function closeDraft(){document.getElementById('draftOverlay').classList.remove('open');}
function renderDraftSlot(){
  const body=document.getElementById('draftBody');
  const progEl=document.getElementById('draftProg');
  if(!body)return;
  const done=draftState.slot>=DRAFT_SLOTS.length;
  if(progEl)progEl.textContent=done?'تیم کامل شد ✓':`موقعیت ${draftState.slot+1} از ${DRAFT_SLOTS.length}`;
  if(done){
    const picks=Object.values(draftState.picks);
    const chem=calcChem(picks);
    const avg=picks.length?Math.round(picks.reduce((s,p)=>s+p.rat,0)/picks.length):0;
    body.innerHTML=`
      <div class="draft-summary">
        <div class="draft-sum-rat">${avg}</div>
        <div class="draft-sum-lbl">میانگین رتبه تیم</div>
        <div class="draft-sum-chem">⚗️ کمیستری: ${chem} / 33</div>
      </div>
      <div class="draft-result">${picks.map(p=>`
        <div class="draft-res-item">
          <div class="draft-res-rat">${p.rat}</div>
          <div><div class="draft-res-name">${p.nameFA}</div><div class="draft-res-pos">${p.pos}</div></div>
        </div>`).join('')}</div>
      <button class="draft-restart" onclick="startDraft()">🔄 درافت جدید</button>`;
    return;
  }
  const slot=DRAFT_SLOTS[draftState.slot];
  const seed=hashInt(slot.pos+draftState.slot+(Date.now()%9999).toString());
  const already=new Set(Object.values(draftState.picks).map(p=>p.id));
  let pool=PLAYERS_RAW.filter(p=>{
    if(already.has(p.id))return false;
    if(slot.type==='GK')return p.posType==='GK';
    return p.posType===slot.type;
  }).sort((a,b)=>(hashInt(a.id+seed)%10000)-(hashInt(b.id+seed)%10000)).slice(0,5);
  body.innerHTML=`
    <div class="draft-slot-title">
      <div class="draft-slot-lbl">موقعیت ${draftState.slot+1}: انتخاب بازیکن</div>
      <div class="draft-slot-pos">${slot.pos}</div>
    </div>
    <div class="draft-choices" id="draftChoices">
      ${pool.map(p=>`
        <div class="draft-choice-wrap" onclick="pickDraftPlayer('${p.id}')">
          ${playerCardHTML(p)}
        </div>`).join('')}
    </div>`;
}
function pickDraftPlayer(pid){
  const p=PLAYERS_RAW.find(x=>x.id===pid);
  if(!p)return;
  draftState.picks[draftState.slot]=p;
  draftState.slot++;
  renderDraftSlot();
}

/* ── SQUAD CHEMISTRY ── */
function calcChem(players){
  if(!players.length)return 0;
  let total=0;
  for(const p of players){
    let score=0;
    for(const q of players){
      if(p===q)continue;
      if(p.club===q.club)score+=2;
      else if(p.leagueFA===q.leagueFA)score+=1.5;
      else if(p.nat===q.nat)score+=1;
    }
    total+=Math.min(3,Math.floor(score/2));
  }
  return Math.min(33,total);
}

/* ── SQUAD BUILDER FUNCTIONS ── */
function setFormation(f){
  if(!FORMATIONS[f])return;
  if(state.squad.formation!==f)state.squad.slots={};
  state.squad.formation=f;
  document.querySelectorAll('.form-btn').forEach(b=>b.classList.toggle('active',b.dataset.f===f));
  renderPitch();
  saveState();
}
function renderPitch(){
  const f=state.squad.formation;
  const slots=FORMATIONS[f]||FORMATIONS['4-3-3'];
  const container=document.getElementById('pitchSlots');
  if(!container)return;
  container.innerHTML=slots.map((slot,i)=>{
    const p=state.squad.slots[i];
    if(p){
      const img=p.imgId?`<img src="img/players/${p.imgId}.png" onerror="imgFallback(this,${p.imgId})" alt="${p.name}">`:'';
      return `<div class="pitch-slot slot-filled" style="left:${slot.x}%;top:${slot.y}%" onclick="openSquadPicker(${i})">
        <div class="slot-ring">${img}</div>
        <div class="slot-pos">${slot.pos}</div>
        <div class="slot-pname">${p.nameFA}</div>
        <div class="slot-prat">${p.rat}</div>
      </div>`;
    }
    return `<div class="pitch-slot" style="left:${slot.x}%;top:${slot.y}%" onclick="openSquadPicker(${i})">
      <div class="slot-ring">+</div>
      <div class="slot-pos">${slot.pos}</div>
    </div>`;
  }).join('');
  updateChem();
}
function updateChem(){
  const players=Object.values(state.squad.slots||{});
  const chem=calcChem(players);
  const el=document.getElementById('chemVal');
  const fill=document.getElementById('chemFill');
  const badge=document.getElementById('chemBadge');
  if(el)el.textContent=chem;
  if(fill)fill.style.width=Math.round(chem/33*100)+'%';
  if(badge)badge.textContent='شیمی تقریبی: '+chem+' / 33';
}
function openSquadPicker(slotIdx){
  activeSquadSlot=slotIdx;
  const f=state.squad.formation;
  const slots=FORMATIONS[f]||[];
  const slot=slots[slotIdx];
  const title=document.getElementById('squadPickerTitle');
  if(title)title.textContent='انتخاب بازیکن - پوزیشن: '+(slot?slot.pos:'');
  document.getElementById('squadSearch').value='';
  document.getElementById('squadPickerModal').classList.add('open');
  renderSquadPicker();
}
function closeSquadPicker(){
  document.getElementById('squadPickerModal').classList.remove('open');
  activeSquadSlot=null;
}
function renderSquadPicker(){
  const q=document.getElementById('squadSearch').value.toLowerCase();
  const currentFormation=FORMATIONS[state.squad.formation]||FORMATIONS['4-3-3'];
  const target=currentFormation[activeSquadSlot]?.pos;
  let list=PLAYERS_RAW.filter(p=>{
    if(Object.entries(state.squad.slots||{}).some(([slot,used])=>Number(slot)!==activeSquadSlot&&used.id===p.id))return false;
    if(!q)return true;
    return [p.nameFA,p.name,p.pos,p.club].join(' ').toLowerCase().includes(q);
  }).sort((a,b)=>Number(b.pos===target)-Number(a.pos===target)||b.rat-a.rat);
  const container=document.getElementById('squadPickerList');
  if(!container)return;
  container.innerHTML=list.slice(0,40).map(p=>`
    <div class="squad-pl-item" onclick="selectSquadPlayer('${p.id}')">
      <div class="squad-pl-rat">${p.rat}</div>
      <div class="squad-pl-info">
        <div class="squad-pl-name">${p.nameFA}</div>
        <div class="squad-pl-pos">${p.pos} · ${p.flag} ${p.club}</div>
      </div>
    </div>`).join('');
}
function selectSquadPlayer(pid){
  const p=PLAYERS_RAW.find(x=>x.id===pid);
  if(!p||activeSquadSlot===null)return;
  if(Object.entries(state.squad.slots||{}).some(([slot,used])=>Number(slot)!==activeSquadSlot&&used.id===p.id)){toast('این بازیکن در ترکیب حضور دارد','e');return;}
  state.squad.slots[activeSquadSlot]=p;
  saveState();
  closeSquadPicker();
  renderPitch();
}
function clearSquad(){
  if(Object.keys(state.squad.slots||{}).length&&!confirm('همه بازیکنان ترکیب حذف شوند؟'))return;
  state.squad.slots={};
  saveState();
  renderPitch();
  toast('🗑️ تیم پاک شد','i');
}

/* ── COMPARISON FUNCTIONS ── */
function toggleCompare(pid){
  if(!state.compSel)state.compSel=[];
  const idx=state.compSel.indexOf(pid);
  if(idx>=0){state.compSel.splice(idx,1);}
  else{
    if(state.compSel.length>=2)state.compSel.shift();
    state.compSel.push(pid);
  }
  renderPlayers();
  if(state.compSel.length===2)showCompModal();
}
function showCompModal(){
  const [id1,id2]=state.compSel;
  const p1=PLAYERS_RAW.find(p=>p.id===id1),p2=PLAYERS_RAW.find(p=>p.id===id2);
  if(!p1||!p2)return;
  const s1=deterministicStats(p1),s2=deterministicStats(p2);
  const prRow=document.getElementById('compPlayersRow');
  prRow.innerHTML=`
    <div class="comp-pcol"><div class="comp-rat">${p1.rat}</div><div class="comp-pname">${p1.nameFA}</div><div class="comp-ppos">${p1.pos} · ${p1.flag}</div></div>
    <div style="display:flex;align-items:center;color:var(--t3);font-size:18px;font-weight:900">VS</div>
    <div class="comp-pcol"><div class="comp-rat">${p2.rat}</div><div class="comp-pname">${p2.nameFA}</div><div class="comp-ppos">${p2.pos} · ${p2.flag}</div></div>`;
  document.getElementById('compHint').textContent='';
  document.getElementById('compStats').innerHTML=(!s1.length||s1.length!==s2.length)?'<p style="text-align:center;padding:20px;color:var(--t2)">آمار تأییدشده برای مقایسه این بازیکنان موجود نیست.</p>':s1.map((st,i)=>{
    const v1=st.v,v2=s2[i].v,mx=Math.max(v1,v2,1);
    const w1=Math.round(v1/mx*100),w2=Math.round(v2/mx*100);
    const c1=v1>v2?'sv-green':v1<v2?'sv-red':'sv-gold',c2=v2>v1?'sv-green':v2<v1?'sv-red':'sv-gold';
    return `<div class="comp-stat-row">
      <div class="comp-va" style="color:var(--blue)">${v1}</div>
      <div class="comp-bars" style="flex:1">
        <div class="comp-bar-a" style="width:${w1}%;flex:1"></div>
        <div class="comp-lbl">${st.lbl}</div>
        <div class="comp-bar-b" style="width:${w2}%;flex:1"></div>
      </div>
      <div class="comp-vb" style="color:var(--red)">${v2}</div>
    </div>`;
  }).join('');
  document.getElementById('compModal').classList.add('open');
}
function closeComp(){
  document.getElementById('compModal').classList.remove('open');
}

/* ── EVOLUTION FUNCTIONS ── */

let verifiedEvos=[];
async function loadVerifiedEvolutions(){
 try{
  const res=await fetch('./data/fc27-evolutions.json?v='+Date.now(),{cache:'no-store'});
  if(!res.ok)throw Error('Evolutions unavailable');
  const data=await res.json();
  if(!Array.isArray(data.evolutions)||data.source!=='FUT.GG')throw Error('Invalid evolution data');
  verifiedEvos=data.evolutions;
 }catch(error){console.warn('Verified evolutions unavailable',error)}
 renderVerifiedEvolutions();
}
function renderVerifiedEvolutions(){
 const host=document.getElementById('verifiedEvoGrid');if(!host)return;
 host.replaceChildren();
 const counter=document.getElementById('evoSecCnt');if(counter)counter.textContent=verifiedEvos.length.toLocaleString('fa-IR')+' تکامل';
 for(const evo of verifiedEvos){
  const card=fc27Node('article','fc-feed-card');
  card.append(fc27Node('h3','',evo.nameFA||evo.name),fc27Node('p','fc27-original-title',evo.name));
  card.appendChild(fc27Node('p','',evo.description||''));
  const chip=fc27Node('div','fc27-evo-chips');
  for(const req of evo.requirements||[])chip.appendChild(fc27Node('span','fc27-evo-chip',req));
  card.appendChild(chip);
  const open=fc27Node('button','fc27-detail-open','جزئیات تکامل / Evolution details');
  open.type='button';open.onclick=()=>openFC27Details('evolutions',evo);card.appendChild(open);
  host.appendChild(card);
 }
 if(!verifiedEvos.length)host.appendChild(fc27Node('p','fc-feed-meta','اطلاعات تأییدشده تکامل فعلاً در دسترس نیست.'));
}
function renderEvo(){
  const grid=document.getElementById('evoGrid');
  const cnt=document.getElementById('evoSecCnt');
  if(!grid)return;
  if(cnt)cnt.textContent=EVO_RAW.length+' تکامل';
  grid.innerHTML=EVO_RAW.map(e=>{
    const used=state.evoProgs[e.id]||0;
    const maxed=used>=e.maxUses;
    const pct=Math.round(used/e.maxUses*100);
    return `<div class="evo-card${maxed?' maxed':''}" id="ev-${e.id}">
      <div class="evo-head">
        <div class="evo-name">${e.nameFA}</div>
        <div class="evo-badge ${e.badgeCls}">${e.badge}</div>
      </div>
      <div class="evo-desc">${e.desc}</div>
      <div class="evo-reqs">${e.reqs.map(r=>`<span class="evo-req-chip">${r}</span>`).join('')}</div>
      <div class="evo-prog-row"><span>پیشرفت</span><span>${used} / ${e.maxUses}</span></div>
      <div class="evo-prog-bar"><div class="evo-prog-fill" style="width:${pct}%"></div></div>
      <div class="evo-controls">
        <button class="evo-sub" onclick="evoChange('${e.id}',-1)">−</button>
        <div class="evo-count">${used}</div>
        <button class="evo-add" onclick="evoChange('${e.id}',1)">+</button>
        <div class="evo-reward">${e.reward}</div>
      </div>
    </div>`;
  }).join('');
}
function evoChange(id,delta){
  const e=EVO_RAW.find(x=>x.id===id);
  if(!e)return;
  const cur=state.evoProgs[id]||0;
  const nv=Math.max(0,Math.min(e.maxUses,cur+delta));
  state.evoProgs[id]=nv;
  saveState();
  renderEvo();
  if(nv>=e.maxUses)toast('🧬 تکامل کامل شد!','s');
}

/* ── COUNTDOWN TIMER ── */
function startCountdowns(){
  setInterval(()=>{
    document.querySelectorAll('[data-exp]').forEach(el=>{
      const exp=fmtExp(el.dataset.exp);
      el.className='cdpill '+exp.cls.replace('exp-','');
      el.textContent=exp.ico+' '+exp.txt;
    });
  },60000);
}

/* ── PLAYER CARD HTML ── */
function resolvedCT(p){return p.cardType||(p.rat>=84?'gold':p.rat>=64?'silver':'bronze');}
function realCT(p){if(p.cardType)return p.cardType;if(p.rat>=84)return'gold';if(p.rat>=64)return'silver';return'bronze';}
function pcardImgCls(p){
  switch(realCT(p)){
    case'toty':return'pimg-toty';
    case'tots':return'pimg-tots';
    case'hero':return'pimg-hero';
    case'special':return'pimg-special';
    case'fut':return'pimg-fut';
    case'ptg':return'pimg-ptg';
    case'bronze':return'pimg-bronze';
    case'silver':return'pimg-silver';
    default:return'pimg-gold';
  }
}
const CT_BADGE={tots:['TOTS','pbt-tots'],toty:['TOTY','pbt-toty'],hero:['Hero','pbt-hero'],special:['Special','pbt-special'],fut:['FUT Born','pbt-fut'],ptg:['PTG','pbt-ptg']};
function fmtPrice(n){
  if(!Number.isFinite(n))return 'ناموجود';
  if(n>=1000000)return(n/1000000).toFixed(1).replace('.0','')+'M';
  if(n>=1000)return Math.round(n/1000)+'K';
  return n.toLocaleString('fa-IR');
}
function playerCardHTML(p){
  const fav=!!state.plFavs[p.id];
  const inComp=(state.compSel||[]).includes(p.id);
  const inWl=!!(state.watchlist&&state.watchlist[p.id]);
  const bg=pcardImgCls(p);
  const ct=realCT(p);
  const badge=CT_BADGE[ct];
  const img=portraitHTML(p,36);
  const stats=deterministicStats(p);
  const statsHTML=stats.length?stats.map(s=>{
    const cls=s.v>=80?'sv-green':s.v>=65?'sv-gold':'sv-red';
    return `<div class="pstat"><span class="pstat-val ${cls}">${s.v}</span><span class="pstat-lbl">${s.lbl}</span></div>`;
  }).join(''):'<div class="pstat" style="grid-column:1/-1;padding:9px;font-size:11px;color:var(--t2)">آمار دقیق این کارت تأیید نشده</div>';
  const trendHTML='';
  return `<div class="pcard${fav?' fav':''}" id="pc-${p.id}">
    <div class="pcard-upper ${bg}">
      <div class="pcard-inner">
        <div class="pcard-info-col">
          <div class="pci-rat">${p.rat}</div>
          <div class="pci-pos">${p.pos}</div>
          <div class="pci-flag">${p.flag}</div>
          ${badge?`<div class="pci-ctype ${badge[1]}">${badge[0]}</div>`:''}
        </div>
        <div class="pcard-photo">${img}</div>
        <button class="pcard-fav" onclick="togglePlFav('${p.id}')">${fav?'⭐':'☆'}</button>
      </div>
      <div class="pcard-name-band">${p.nameFA}</div>
    </div>
    <div class="pcard-stats">${statsHTML}</div>
    <div class="pcard-body">
      <div class="pcard-club">${p.flag} ${p.club} · ${p.leagueFA}</div>
      <div class="pcard-price-lbl">قیمت تأییدشده برای نسخه کارت و پلتفرم انتخاب‌شده</div>
      <div class="price-row"><div class="pcard-price">${getFC27CardPriceText(p)}</div>${trendHTML}</div>
      <div style="display:flex;gap:5px;margin-top:6px">
        <button class="pcard-compare${inComp?' sel':''}" style="flex:1" onclick="toggleCompare('${p.id}')">${inComp?'✓ انتخاب':'⚖️ مقایسه'}</button>
        <button class="wl-btn-card${inWl?' in-wl':''}" style="flex:1" onclick="toggleWatchlist('${p.id}')">${inWl?'👁️ در لیست':'👁️ دنبال'}</button>
      </div>
    </div>
  </div>`;
}

/* ── RENDER PLAYERS ── */
let playerPage=1;
const PLAYER_PAGE_SIZE=24;
function setPlayerPage(next){playerPage=next;renderPlayers();document.getElementById('plGrid')?.scrollIntoView({block:'start',behavior:'smooth'});}
function renderPlayers(){
  const q=document.getElementById('plSearch').value.toLowerCase().trim();
  const srt=document.getElementById('plSort').value;
  const advActive=ADV_STATS.some(s=>advF[s]>0);
  let list=PLAYERS_RAW.filter(p=>{
    if(plPos!=='all'&&p.posType!==plPos)return false;
    if(plCardType!=='all'&&realCT(p)!==plCardType)return false;
    if(plFilters.fav&&!state.plFavs[p.id])return false;
    if(plFilters.wl&&!(state.watchlist&&state.watchlist[p.id]))return false;
    if(q){const hay=[p.nameFA,p.name,p.club,p.nat,p.leagueFA,p.pos].join(' ').toLowerCase();if(!hay.includes(q))return false;}
    if(advActive){
      const stats=deterministicStats(p);
      if(stats.length!==6)return false;
      const sm={};stats.forEach(s=>sm[s.lbl.toLowerCase()]=s.v);
      for(const k of ADV_STATS){if(advF[k]>0&&(sm[k]||0)<advF[k])return false;}
    }
    return true;
  });
  if(srt==='rat')list.sort((a,b)=>b.rat-a.rat);
  else if(srt==='price-h')list.sort((a,b)=>b.price-a.price);
  else if(srt==='price-l')list.sort((a,b)=>a.price-b.price);
  else if(srt==='az')list.sort((a,b)=>a.nameFA.localeCompare(b.nameFA,'fa'));
  const titles={all:'همه بازیکنان',ATT:'مهاجمان',MID:'هافبک‌ها',DEF:'مدافعان',GK:'دروازه‌بانان'};
  document.getElementById('plSecTitle').textContent=titles[plPos]||'همه بازیکنان';
  document.getElementById('plSecCnt').textContent=list.length+' بازیکن';
  const g=document.getElementById('plGrid'),e=document.getElementById('plEmpty');
  // Watchlist mode: show watchlist section, hide regular grid
  const wlSec=document.getElementById('wlSection');
  if(plFilters.wl){
    const nav=document.getElementById('playerPagination');if(nav)nav.style.display='none';
    g.innerHTML='';e.style.display='none';
    renderWatchlist();
    return;
  }
  if(wlSec)wlSec.style.display='none';
  if(!list.length){g.innerHTML='';e.style.display='block';const nav=document.getElementById('playerPagination');if(nav)nav.style.display='none';return;}
  e.style.display='none';
  const pageCount=Math.max(1,Math.ceil(list.length/PLAYER_PAGE_SIZE));
  playerPage=Math.min(Math.max(1,playerPage),pageCount);
  g.className=state.galleryMode?'pgal-grid':'player-grid';
  const current=list.slice((playerPage-1)*PLAYER_PAGE_SIZE,playerPage*PLAYER_PAGE_SIZE);
  g.innerHTML=current.map(state.galleryMode?galleryCardHTML:playerCardHTML).join('');
  let nav=document.getElementById('playerPagination');
  if(!nav){nav=document.createElement('div');nav.id='playerPagination';nav.className='player-pagination';g.after(nav);}
  nav.style.display=pageCount>1?'flex':'none';
  nav.innerHTML='<button type="button" onclick="setPlayerPage('+Math.max(1,playerPage-1)+')" '+(playerPage===1?'disabled':'')+'>قبلی</button><span>صفحه '+playerPage.toLocaleString('fa-IR')+' از '+pageCount.toLocaleString('fa-IR')+'</span><button type="button" onclick="setPlayerPage('+Math.min(pageCount,playerPage+1)+')" '+(playerPage===pageCount?'disabled':'')+'>بعدی</button>';
}
function galleryCardHTML(p){
  const img=portraitHTML(p,34);
  const nameShort=(p.nameFA||p.name).split(' ').slice(-1)[0];
  return `<div class="pgal-card" onclick="openPlayerModal('${p.id}')">
    <div class="pgal-img">${img}<span class="pgal-rat">${p.rat}</span><span class="pgal-pos">${p.pos}</span><span class="pgal-flag">${p.flag}</span></div>
    <div class="pgal-name">${nameShort}</div>
    <div class="pgal-club">${p.club}</div>
  </div>`;
}
function toggleGallery(){
  playerPage=1;
  state.galleryMode=!state.galleryMode;
  const btn=document.getElementById('galToggleBtn');
  if(btn){btn.classList.toggle('active',state.galleryMode);btn.textContent=state.galleryMode?'🃏 کارت‌ها':'🖼️ گالری';}
  renderPlayers();
}

function setPos(pos){playerPage=1;plPos=pos;document.querySelectorAll('#posTabs .pos-tab').forEach(t=>t.classList.toggle('active',t.dataset.pos===pos));renderPlayers();}
function setCardType(ct){playerPage=1;plCardType=ct;document.querySelectorAll('#cardTypeTabs .ctype-tab').forEach(t=>t.classList.toggle('active',t.dataset.ct===ct));renderPlayers();}
function togglePF(f){
  playerPage=1;
  plFilters[f]=!plFilters[f];
  document.getElementById('pfb-'+f).classList.toggle('active',plFilters[f]);
  renderPlayers();
  if(f==='wl')renderWatchlist();
}
function togglePlFav(id){state.plFavs[id]=!state.plFavs[id];saveState();updateStats();renderPlayers();toast(state.plFavs[id]?'⭐ اضافه شد':'☆ حذف شد','i');}

/* ── STATS ── */
function updateStats(){
  const ot=OBJ_RAW.length,od=Object.values(state.objDone).filter(Boolean).length;
  const st=SBC_RAW.length,sd=Object.values(state.sbcDone).filter(Boolean).length;
  const fav=Object.values(state.objFavs).filter(Boolean).length+Object.values(state.sbcFavs).filter(Boolean).length+Object.values(state.plFavs||{}).filter(Boolean).length;
  const now=Date.now(),exp=OBJ_RAW.filter(o=>{if(!o.exp)return false;const d=new Date(o.exp)-now;return d>0&&d<864e5;}).length;
  document.getElementById('sTotal').textContent=ot;
  document.getElementById('sDone').textContent=od;
  document.getElementById('sSBCTotal').textContent=st;
  document.getElementById('sSBCDone').textContent=sd;
  document.getElementById('sFav').textContent=fav;
  document.getElementById('sExpiring').textContent=exp;
  document.getElementById('sp-obj').textContent=ot;
  document.getElementById('sp-sbc').textContent=st;
  document.getElementById('sp-players').textContent=PLAYERS_RAW.length;
  ['all','weekly','daily','milestone','event','seasonal','league'].forEach(c=>{
    const el=document.getElementById('ocn-'+c);if(el)el.textContent=c==='all'?ot:OBJ_RAW.filter(o=>o.cat===c).length;
  });
  ['all','iconic','foundation','league','tots','limited'].forEach(c=>{
    const el=document.getElementById('scn-'+c);if(el)el.textContent=c==='all'?st:SBC_RAW.filter(s=>s.cat===c).length;
  });
}

/* ── CATEGORY & FILTER ── */
function setObjCat(cat){objCat=cat;document.querySelectorAll('#objCatTabs .cat-tab').forEach(t=>t.classList.toggle('active',t.dataset.cat===cat));renderObj();}
function setSBCCat(cat){sbcCat=cat;document.querySelectorAll('#sbcCatTabs .cat-tab').forEach(t=>t.classList.toggle('active',t.dataset.cat===cat));renderSBC();}
function toggleOF(f){objFilters[f]=!objFilters[f];document.getElementById('ofb-'+f).classList.toggle('active',objFilters[f]);renderObj();}
function toggleSF(f){sbcFilters[f]=!sbcFilters[f];document.getElementById('sfb-'+f).classList.toggle('active',sbcFilters[f]);renderSBC();}
function toggleObjFav(id){state.objFavs[id]=!state.objFavs[id];saveState();updateStats();renderObj();toast(state.objFavs[id]?'⭐ اضافه شد':'☆ حذف شد','i');}
function toggleSBCFav(id){state.sbcFavs[id]=!state.sbcFavs[id];saveState();updateStats();renderSBC();toast(state.sbcFavs[id]?'⭐ اضافه شد':'☆ حذف شد','i');}
function toggleObjDone(id){state.objDone[id]=!state.objDone[id];saveState();updateStats();renderObj();if(state.objDone[id])toast('✅ هدف تکمیل شد!','s');}
function toggleSBCDone(id){state.sbcDone[id]=!state.sbcDone[id];saveState();updateStats();renderSBC();if(state.sbcDone[id])toast('✅ SBC تکمیل شد!','s');}

/* ── FETCH (manual only) ── */
function setStatus(m){
  const p=document.getElementById('statusPill'),t=document.getElementById('statusTxt');
  p.className='status-pill '+m;
  t.textContent=m==='online'?'آنلاین':m==='syncing'?'در حال بروزرسانی...':'آفلاین';
}
async function doFetch(){
  const btn=document.getElementById('refreshBtn');
  if(btn){btn.disabled=true;btn.classList.add('spinning');}
  setStatus('syncing');
  try{
    const res=await fetch('./data/fc27-players.json?v='+Date.now(),{cache:'no-store'});
    if(!res.ok)throw Error('Verified dataset unavailable: '+res.status);
    const feed=await res.json();
    if(!Array.isArray(feed.players)||feed.players.length<18000||!feed.source||!feed.snapshot_date)throw Error('Invalid FC27 player feed');
    const clean=feed.players.filter(p=>typeof p.id==='string'&&typeof p.name==='string'&&Number.isFinite(p.rat)&&p.rat>=1&&p.rat<=99&&p.pos);
    if(clean.length<18000)throw Error('Insufficient validated FC27 records');
    PLAYERS_RAW.splice(0,PLAYERS_RAW.length,...clean);
    renderPlayers();updateStats();renderPitch();
    setStatus('online');
    const stamp=document.getElementById('lastUpd');
    if(stamp)stamp.textContent='بازیکنان FC27: '+clean.length.toLocaleString('fa-IR')+' نفر · نسخه داده: '+feed.snapshot_date+' · همگام‌سازی: '+new Date(feed.synced_at).toLocaleDateString('fa-IR');
    toast('پایگاه امتیازهای واقعی FC27 بارگذاری شد','i');
  }catch(err){
    setStatus('offline');
    const stamp=document.getElementById('lastUpd');
    if(stamp)stamp.textContent='داده FC27 در دسترس نیست؛ اطلاعات ساختگی نمایش داده نمی‌شود';
    console.warn('FC27 data sync unavailable',err);
    toast('داده معتبر FC27 قابل دریافت نبود','e',5000);
  }finally{
    if(btn){btn.disabled=false;btn.classList.remove('spinning');}
  }
}

/* ── TOAST ── */
function toast(msg,type='i',ms=3000){
  const c=document.getElementById('toasts'),el=document.createElement('div');
  el.className='toast '+type;el.textContent=msg;c.appendChild(el);
  setTimeout(()=>el.remove(),ms);
}

/* ── KEYBOARD ── */
document.addEventListener('keydown',e=>{
  if(e.key==='/'&&document.activeElement.tagName!=='INPUT'){e.preventDefault();document.getElementById('objSearch').focus();}
  if(e.key==='Escape'){document.getElementById('objSearch').blur();document.getElementById('sbcSearch').blur();}
});

/* ── SECTION SWITCH ── */
/* ── FEATURE C: CARD CREATOR ── */
function openCC(){document.getElementById('ccOverlay').classList.add('open');renderCC();}
function closeCC(){document.getElementById('ccOverlay').classList.remove('open');}
function renderCC(){
  const name=document.getElementById('ccName').value||'بازیکن شما';
  const rat=Math.min(99,Math.max(1,parseInt(document.getElementById('ccRat').value)||90));
  const pos=document.getElementById('ccPos').value||'ST';
  const flag=document.getElementById('ccFlag').value||'🏳️';
  const club=document.getElementById('ccClub').value||'باشگاه شما';
  const type=document.getElementById('ccType').value||'gold';
  const posTypeMap={ST:'ATT',CF:'ATT',LW:'ATT',RW:'ATT',CAM:'MID',CM:'MID',CDM:'MID',LM:'MID',RM:'MID',LB:'DEF',RB:'DEF',CB:'DEF',GK:'GK'};
  const fp={id:'cc'+name,name,nameFA:name,rat,pos,posType:posTypeMap[pos]||'ATT',flag,club,leagueFA:'',cardType:type,imgId:null,price:0};
  const stats=deterministicStats(fp);
  const statsHTML=stats.map(s=>{const cls=s.v>=80?'sv-green':s.v>=65?'sv-gold':'sv-red';return`<div class="pstat"><span class="pstat-val ${cls}">${s.v}</span><span class="pstat-lbl">${s.lbl}</span></div>`;}).join('');
  const bg=pcardImgCls(fp);const badge=CT_BADGE[type];
  document.getElementById('ccPreview').innerHTML=`
    <div class="pcard" style="width:148px;cursor:default">
      <div class="pcard-img ${bg}">
        <div class="pcard-rat">${rat}</div><div class="pcard-posb">${pos}</div>
        ${badge?`<div class="pcard-type-badge ${badge[1]}">${badge[0]}</div>`:''}
      </div>
      <div class="pcard-stats">${statsHTML}</div>
      <div class="pcard-body">
        <div class="pcard-name">${name}</div>
        <div class="pcard-club">${flag} ${club}</div>
      </div>
    </div>`;
}

/* ── FEATURE N: UPGRADE HUB ── */
let upgFilter='all';
function setUpgFilter(f){
  upgFilter=f;
  document.querySelectorAll('.upg-tab').forEach(t=>t.classList.toggle('active',t.dataset.f===f));
  renderUpgHub();
}
function renderUpgHub(){
  const el=document.getElementById('upgList');if(!el)return;
  const posN={ATT:'مهاجم',MID:'هافبک',DEF:'مدافع',GK:'دروازه‌بان'};
  let players=[...PLAYERS_RAW].filter(p=>{
    const h=hashInt(p.id+'upg2');
    if(upgFilter==='pending')return h%5===0;
    if(upgFilter==='recent')return h%5===1;
    return h%5<=1;
  }).slice(0,18);
  if(!players.length){el.innerHTML=`<div style="text-align:center;padding:20px;color:var(--t3)">بازیکنی یافت نشد</div>`;return;}
  el.innerHTML=players.map(p=>{
    const h=hashInt(p.id+'upg2');
    const isPending=h%5===0;
    const boost=isPending?2:1;
    const after={...p,rat:Math.min(99,p.rat+boost)};
    const bs=deterministicStats(p),as=deterministicStats(after);
    return `<div class="upg-row ${isPending?'hot':''}">
      <div class="upg-side">
        <div class="upg-rat" style="color:var(--t2)">${p.rat}</div>
        <div class="upg-rl">قبل</div>
        <div class="upg-pills">${bs.slice(0,3).map(s=>`<span class="upg-pill">${s.lbl} ${s.v}</span>`).join('')}</div>
      </div>
      <div class="upg-mid">
        <div class="upg-arr">→</div>
        <div class="upg-pname">${p.nameFA}</div>
        <div class="upg-tag ${isPending?'upg-tag-hot':'upg-tag-done'}">${isPending?'در انتظار':'اخیراً'}</div>
        <div style="font-size:8px;color:var(--t3);margin-top:2px">${p.flag} ${posN[p.posType]||p.posType}</div>
      </div>
      <div class="upg-side">
        <div class="upg-rat" style="color:var(--gold)">${after.rat}</div>
        <div class="upg-rl">بعد</div>
        <div class="upg-pills">${as.slice(0,3).map(s=>`<span class="upg-pill" style="color:var(--gold)">${s.lbl} ${s.v}</span>`).join('')}</div>
      </div>
    </div>`;
  }).join('');
}

/* ── FEATURE P: EVO CHAIN RANKING ── */
function renderEvoChain(){
  const el=document.getElementById('evoChainList');if(!el)return;
  const tierScore={rep:5,once:3,event:1};
  const sorted=[...EVO_RAW].map(e=>{
    const used=state.evoProgs[e.id]||0;
    const remaining=Math.max(0,e.maxUses-used);
    const tier=e.badgeCls.includes('rep')?5:e.badgeCls.includes('once')?3:1;
    const score=remaining*tier;
    return{...e,remaining,score};
  }).filter(e=>e.remaining>0).sort((a,b)=>b.score-a.score);
  if(!sorted.length){el.innerHTML=`<div style="text-align:center;padding:20px;color:var(--green)">🎉 همه تکامل‌ها کامل شده!</div>`;return;}
  const medals=['🥇','🥈','🥉'];
  el.innerHTML=sorted.map((e,i)=>`
    <div class="evo-rank-row">
      <div class="evo-rn">${medals[i]||'#'+(i+1)}</div>
      <div class="evo-ri">
        <div class="evo-rname">${e.nameFA}</div>
        <div class="evo-rmeta">${e.remaining} بار باقی‌مانده · ${e.badge} · ${e.reward}</div>
      </div>
      <div class="evo-rxp">اولویت ${e.score}</div>
    </div>`).join('');
}

/* ══════════════════════════════════════
   WORLD CUP 2026 DATA & FUNCTIONS
══════════════════════════════════════ */
function showSec(sec){
  ['obj','sbc','players','squad','evo'].forEach(s=>{
    const el=document.getElementById('sec-'+s);
    const bn=document.getElementById('bn-'+s);
    if(el)el.style.display=s===sec?'block':'none';
    if(bn)bn.classList.toggle('active',s===sec);
  });
  if(sec==='squad')renderPitch();
  if(sec==='evo'){renderEvo();renderUpgHub();renderEvoChain();}
  window.scrollTo({top:0,behavior:'smooth'});
}

/* ── INIT ── */
async function loadOfficialNews(){
 const stamp=document.getElementById('officialFeedStamp'),list=document.getElementById('officialNewsList');
 if(!stamp||!list)return;
 try{
  const res=await fetch('https://raw.githubusercontent.com/sahandse/FC26-objective/claude/fc26-objectives-page-yAjCT/data/fc27-news.json?t='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(10000)});
  if(!res.ok)throw new Error('No verified feed');
  const data=await res.json();
  if(data.source!=='Electronic Arts'||!Array.isArray(data.items)||!data.items.length)throw new Error('Invalid official feed');
  list.replaceChildren();
  for(const item of data.items.slice(0,8)){
   const u=new URL(item.url);if(u.hostname!=='www.ea.com')continue;
   const a=document.createElement('a');a.href=u.href;a.target='_blank';a.rel='noopener noreferrer';a.textContent=item.title+' ↗';list.appendChild(a);
  }
  stamp.textContent='آخرین بررسی خبرها: '+new Date(data.checked_at).toLocaleString('fa-IR');
 }catch(error){
  stamp.textContent='فید خودکار هنوز آماده نیست';
  list.textContent='اخبار را مستقیماً از سایت رسمی EA دنبال کنید.';
  const a=document.createElement('a');a.href='https://www.ea.com/games/ea-sports-fc/fc-27';a.target='_blank';a.rel='noopener noreferrer';a.textContent='اخبار رسمی FC27 ↗';list.appendChild(a);
 }
}

const FC27_FA={
'Weekly Objectives':'اهداف هفتگی','Back to Basics Bonus Objective':'جایزه بازگشت به اصول','Rising Through the Ranks':'پیشرفت در رتبه‌ها',
'Carlos Espí':'کارلوس اِسپی','Weslley Pinto Batista':'وسلی پینتو باتیستا','Liga F POTM September':'بازیکن ماه سپتامبر لیگ زنان اسپانیا','Tarciane':'تارسیانه','LALIGA POTM September':'بازیکن ماه سپتامبر لالیگا','Premier League POTM September':'بازیکن ماه سپتامبر لیگ برتر انگلیس','Bundesliga POTM September':'بازیکن ماه سپتامبر بوندسلیگا','Serie A POTM September':'بازیکن ماه سپتامبر سری آ',
'TOTW Upgrade':'ارتقای تیم منتخب هفته','Max. 86 Base Hero Upgrade':'ارتقای هیرو پایه تا امتیاز ۸۶','5x 80+ Upgrade':'پک پنج بازیکن با امتیاز ۸۰ به بالا','3x 79+ Upgrade':'پک سه بازیکن با امتیاز ۷۹ به بالا','Gold Upgrade':'ارتقای طلایی','Silver Upgrade':'ارتقای نقره‌ای','Bronze Upgrade':'ارتقای برنزی','Marquee Matchups':'مسابقات مهم هفته','Destined for Glory Challenge 4':'چالش چهارم در مسیر افتخار','League & Nation Advanced':'لیگ و ملیت پیشرفته','Intro to Player SBCs':'آشنایی با SBC بازیکنان','Gold Re-Roll':'تعویض مجدد طلایی','Bronze and Silver Re-roll':'تعویض مجدد برنزی و نقره‌ای','Intro to Streamlined SBCs':'آشنایی با SBC ساده‌سازی‌شده','Intro to Upgrade SBCs':'آشنایی با SBC ارتقا','Intro to SBCs':'آشنایی با SBC'
};
const FC27_OBJECTIVE_GUIDES={
'Weekly Objectives':['وارد Ultimate Team شوید و منوی Objectives را باز کنید.','بخش Weekly را انتخاب کنید و شرط هر مأموریت را بخوانید.','با انجام مسابقه یا فعالیت موردنیاز، پیشرفت را بررسی و پاداش را دریافت کنید.'],
'Back to Basics Bonus Objective':['به Ultimate Team و بخش Objectives بروید.','مأموریت Back to Basics را باز کنید و حالت مسابقه موردنیاز را بررسی کنید.','شرط‌های مشخص‌شده را انجام دهید و جایزه را Claim کنید.'],
'Rising Through the Ranks':['در Ultimate Team به Objectives بروید.','هدف Rising Through the Ranks را پیدا کنید و مراحل نمایش‌داده‌شده را بررسی کنید.','هر مرحله را کامل کنید تا پاداش مربوط آزاد شود.']
};
const SBC_STEPS={
'TOTW Upgrade':['در بخش Upgrades چالش تیم منتخب هفته را باز کنید.','جایزه، بازیکن تیم منتخب هفته است؛ شرایط لازم برای ترکیب ارسالی را جداگانه در Requirements بخوانید.','تعداد بازیکنان، Rating و Chemistry خواسته‌شده را دقیقاً مطابق هر بخش تنظیم کنید.','بعد از بررسی بازیکنان مصرفی و هزینه، ارسال را تأیید کنید.'],
'Max. 86 Base Hero Upgrade':['چالش ارتقای هیرو را باز کنید.','سقف ۸۶ مربوط به کارت جایزه است؛ آن را با امتیاز لازم تیم ارسالی اشتباه نگیرید.','هر بخش ترکیب را جدا باز کنید و محدودیت‌های همان بخش را بررسی کنید.','از کارت‌های تکراری و مازاد شروع کنید و قبل از Submit مجموع هزینه را بسنجید.'],
'5x 80+ Upgrade':['چالش پنج کارت ۸۰+ را در Upgrades پیدا کنید.','۸۰+ امتیاز پاداش است و به‌خودی‌خود شرط تیم ارسالی نیست.','Requirements را بخوانید و تیم را با کارت‌های واجد شرایط باشگاه تکمیل کنید.','قبل از ارسال، مطمئن شوید کارت‌های مهم یا گران را از دست نمی‌دهید.'],
'3x 79+ Upgrade':['این چالش را در بخش Upgrades باز کنید.','پاداش سه بازیکن با امتیاز ۷۹+ است؛ شرط تیم را از Requirements بخوانید.','بازیکنان واجد شرایط و ترجیحاً تکراری را انتخاب کنید.','بعد از بررسی ترکیب، تیم را ثبت کنید.'],
'Gold Upgrade':['Gold Upgrade را باز کنید و تعداد و نوع بازیکنان موردنیاز را ببینید.','بازیکنان مازاد واجد شرایط را قرار دهید.','پس از تکمیل تمام شروط و بررسی جایزه، تیم را ارسال کنید.'],
'Silver Upgrade':['Silver Upgrade را در بخش Upgrades باز کنید.','نوع و تعداد کارت‌های مجاز را در Requirements کنترل کنید.','تیم را با کارت‌های مازاد تکمیل و پس از بررسی ثبت کنید.'],
'Bronze Upgrade':['Bronze Upgrade را باز کنید و شروط دقیق ترکیب را ببینید.','از کارت‌های اضافه باشگاه که با شروط سازگارند استفاده کنید.','پس از بررسی ترکیب و جایزه، ثبت کنید.'],
'Marquee Matchups':['Marquee Matchups را باز کنید و هر مسابقه زیرمجموعه را جدا انتخاب کنید.','محدودیت باشگاه، لیگ، ملیت، Chemistry و امتیاز را برای همان مسابقه بخوانید.','برای هر ترکیب ابتدا کارت‌های موجود واجد شرایط را امتحان کنید.','همه زیرچالش‌ها را تکمیل کنید تا پاداش مجموعه باز شود.'],
'League & Nation Advanced':['چالش لیگ و ملیت پیشرفته را در SBC باز کنید.','برای هر زیرچالش، ارتباط لیگ‌ها و ملیت‌ها و Chemistry موردنیاز را بررسی کنید.','کارت‌ها را براساس لینک‌های ترکیب جای‌گذاری کنید و شرایط را سبز کنید.','هر زیرچالش را جداگانه ثبت کنید.']
};
function guideFC27(kind,rec){
 if(kind==='objectives')return FC27_OBJECTIVE_GUIDES[rec.name]||['عنوان همین هدف را در بخش Objectives پیدا کنید.','حالت بازی، تعداد بازی یا گل و محدودیت‌های موردنیاز را در جزئیات همان هدف بخوانید.','پیشرفت هر مرحله را پس از بازی بررسی کنید و جایزه را دریافت کنید.'];
 if(SBC_STEPS[rec.name])return SBC_STEPS[rec.name];
 const title=FC27_FA[rec.name]||rec.name;
 if(rec.category==='players')return ['در SBC بخش بازیکنان، چالش «'+title+'» را انتخاب کنید.','تمام Squadهای زیرمجموعه را بررسی کنید؛ هرکدام ممکن است امتیاز یا شیمی متفاوتی لازم داشته باشند.','ابتدا کارت‌های تکراری و قابل جایگزینی خود را در جایگاه‌های مجاز قرار دهید و شرط‌های صفحه را بررسی کنید.','بعد از تکمیل همه Squadها، کارت ویژه را دریافت کنید.'];
 if(rec.category==='foundation')return ['در Foundations چالش «'+title+'» را باز کنید.','شرط‌های تعداد و نوع بازیکنان هر مرحله را بخوانید.','با کارت‌های موجود ترکیب را بسازید و خطاها را برطرف کنید.','مراحل را به‌ترتیب تأیید و پاداش‌ها را دریافت کنید.'];
 return ['چالش «'+title+'» را در SBC باز کنید.','شرط‌های دقیق Rating و Chemistry و تعداد کارت‌ها را در صفحه Requirements بخوانید؛ این اعداد در داده فعلی تأیید نشده‌اند.','از کارت‌های واجد شرایط و کم‌هزینه‌تر شروع کنید.','قبل از ثبت نهایی، بازیکنان مصرفی و پاداش را کنترل کنید.'];
}
let liveFC27={source:'FUT.GG',checked_at:null,sections:{objectives:[],sbc:[]}};

const FC27_EN_GUIDES={
'TOTW Upgrade':['Find TOTW Upgrade in Squad Building Challenges > Upgrades.','The reward is a Team of the Week item; read the actual squad requirements separately.','Meet each displayed rating, chemistry and player requirement with eligible items.','Review the cost and players consumed before submitting.'],
'Max. 86 Base Hero Upgrade':['Open the Base Hero Upgrade under SBCs.','The 86 rating cap refers to the Hero reward, not necessarily your submitted squad.','Open each segment and meet its own listed squad requirements.','Use spare eligible items first and review the full cost before confirming.'],
'5x 80+ Upgrade':['Find the 5x 80+ Upgrade under SBCs.','The reward is five 80+ rated items; 80+ is not automatically a squad requirement.','Read the displayed requirements and choose eligible surplus players.','Double-check which cards will be permanently submitted.'],
'Marquee Matchups':['Open Marquee Matchups and select one individual matchup.','Review its club, nation, league, chemistry and rating restrictions if listed.','Build the eligible squad using available club items first.','Finish the individual segments to unlock the group reward.'],
'League & Nation Advanced':['Open League & Nation Advanced in SBCs.','Read the league, nationality and chemistry conditions for each segment.','Build links between eligible players and verify all constraints.','Submit the completed segments separately.']
};
const FC27_EN_OBJECTIVES={
'Weekly Objectives':['Open Objectives > Weekly in Ultimate Team.','Check each live task for its exact game mode and actions.','Play the required matches or complete activities, verify progress and claim rewards.'],
'Back to Basics Bonus Objective':['Open the Back to Basics objective in Ultimate Team.','Check the required Exhibition mode and any squad restrictions on the objective itself.','Complete the listed tasks, then claim the reward.'],
'Rising Through the Ranks':['Locate Rising Through the Ranks under Objectives.','Review the exact tasks, game mode and any squad conditions.','Finish each task, track progress, and claim the relevant reward.']
};
let fc27Lang='fa',fc27Progress={};
try{fc27Lang=localStorage.getItem('fc27-guide-lang')||'fa';if(!['fa','en','both'].includes(fc27Lang))fc27Lang='fa';fc27Progress=JSON.parse(localStorage.getItem('fc27-guide-progress')||'{}')||{}}catch(e){}
function setFC27Lang(lang){if(!['fa','en','both'].includes(lang))return;fc27Lang=lang;try{localStorage.setItem('fc27-guide-lang',lang)}catch(e){}renderLiveFC27()}
function fc27EnglishGuide(kind,rec){
 if(kind==='objectives')return FC27_EN_OBJECTIVES[rec.name]||['Find this exact objective in Ultimate Team > Objectives.','Check its live game mode, required actions and any squad restrictions.','Finish each required task, confirm its progress and claim the reward.'];
 if(FC27_EN_GUIDES[rec.name])return FC27_EN_GUIDES[rec.name];
 if(rec.category==='players')return ['Open the '+rec.name+' challenge in the SBC Players category.','Read the requirements of every squad segment, which may differ in rating and chemistry.','Use eligible spare players first and verify all conditions.','Complete every required squad to unlock the player reward.'];
 if(rec.category==='foundation')return ['Open '+rec.name+' in SBC Foundations.','Check the exact number and type of required items for each segment.','Complete the squad and resolve unmet requirements.','Submit segments in order and claim the reward.'];
 return ['Open '+rec.name+' in Squad Building Challenges.','Check each segment’s current rating, chemistry and item requirements; no unverified numbers are shown here.','Choose eligible players while reviewing the total cost.','Review submitted items carefully and claim the reward after completion.'];
}
function fc27Node(tag,cls,text){const el=document.createElement(tag);if(cls)el.className=cls;if(text!=null)el.textContent=String(text);return el}

function openFC27Details(kind,rec){
 const old=document.getElementById('fc27-detail-dialog');if(old)old.remove();
 const overlay=fc27Node('div','fc27-detail-overlay');overlay.id='fc27-detail-dialog';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label','جزئیات چالش');overlay.tabIndex=-1;
 const panel=fc27Node('section','fc27-detail-panel');
 const head=fc27Node('div','fc27-detail-head');const names=fc27Node('div','');
 names.append(fc27Node('h2','',FC27_FA[rec.name]||rec.name),fc27Node('p','fc27-original-title',rec.name));
 const close=fc27Node('button','fc27-detail-close','×');close.type='button';close.setAttribute('aria-label','بستن');close.onclick=()=>overlay.remove();head.append(names,close);panel.appendChild(head);
 const info=fc27Node('div','fc27-detail-facts');
 const fields=[['بخش / Category',rec.category],['پاداش / Reward',rec.reward],['هزینه ثبت‌شده / Recorded cost',Number.isFinite(rec.price)?rec.price.toLocaleString('fa-IR'):''],['آخرین بروزرسانی / Updated',liveFC27.checked_at?new Date(liveFC27.checked_at).toLocaleString('fa-IR'):'']];
 for(const [label,val] of fields){if(val!==undefined&&val!==null&&String(val).trim()){const item=fc27Node('div','fc27-detail-fact');item.append(fc27Node('span','',label),fc27Node('strong','',val));info.appendChild(item)}}
 panel.appendChild(info);
 if(rec.description){panel.appendChild(fc27Node('p','fc27-detail-description',rec.description))}
 if(kind==='evolutions'&&Array.isArray(rec.upgrades)&&rec.upgrades.length){
  const upgrades=fc27Node('section','fc27-detail-subsection');upgrades.appendChild(fc27Node('h3','','ارتقاها / Upgrades'));
  const ul=fc27Node('ul','');for(const value of rec.upgrades)ul.appendChild(fc27Node('li','',value));
  upgrades.appendChild(ul);panel.appendChild(upgrades);
 }
  if(Array.isArray(rec.requirements)&&rec.requirements.length){
  const block=fc27Node('section','fc27-detail-subsection');
  block.appendChild(fc27Node('h3','','بازیکنان مجاز / Eligible players'));
  block.appendChild(fc27Node('p','fc27-detail-note','این موارد محدودیت بازیکنان مجاز هستند؛ ممکن است شرایط کامل Squad نباشند.'));
  const list=fc27Node('ul','');for(const value of rec.requirements)list.appendChild(fc27Node('li','',value));block.appendChild(list);panel.appendChild(block);
 }
 if(Array.isArray(rec.tasks)&&rec.tasks.length){
  const section=fc27Node('section','fc27-detail-subsection');section.appendChild(fc27Node('h3','','مأموریت‌های دقیق / Objective tasks'));
  rec.tasks.forEach((task,i)=>{
   const part=fc27Node('div','fc27-detail-squad');
   part.appendChild(fc27Node('strong','',task.nameFA||task.name));
   part.appendChild(fc27Node('p','fc27-original-title',task.name));
   if(fc27Lang!=='en'&&task.descriptionFA)part.appendChild(fc27Node('p','',task.descriptionFA));
   if(fc27Lang!=='fa'&&task.description)part.appendChild(fc27Node('p','fc27-step-en',task.description));
   if(task.reward)part.appendChild(fc27Node('p','fc27-detail-note','پاداش / Reward: '+task.reward));
   section.appendChild(part);
  });panel.appendChild(section);
 }
 if(Array.isArray(rec.levels)&&rec.levels.length){
  const section=fc27Node('section','fc27-detail-subsection');section.appendChild(fc27Node('h3','','مراحل تکامل / Evolution levels'));
  for(const level of rec.levels){
   const part=fc27Node('div','fc27-detail-squad');part.appendChild(fc27Node('strong','',level.nameFA||level.name));
   if(fc27Lang!=='fa')part.appendChild(fc27Node('p','fc27-original-title',level.name));
   const steps=fc27Node('ol','');
   for(let i=0;i<(level.tasks||[]).length;i++){
    const li=fc27Node('li','');if(fc27Lang!=='en')li.appendChild(fc27Node('span','',level.tasksFA?.[i]||level.tasks[i]));
    if(fc27Lang!=='fa')li.appendChild(fc27Node('p','fc27-step-en',level.tasks[i]));steps.appendChild(li);
   }
   part.appendChild(steps);
   if(level.upgrades?.length){part.appendChild(fc27Node('b','','ارتقاها / Boosts'));const ul=fc27Node('ul','');for(const value of level.upgrades)ul.appendChild(fc27Node('li','',value));part.appendChild(ul)}
   section.appendChild(part);
  }panel.appendChild(section);
 }
 if(Array.isArray(rec.squads)&&rec.squads.length){
  const squads=fc27Node('section','fc27-detail-subsection');squads.appendChild(fc27Node('h3','','بخش‌های تیم / Squad segments'));
  for(const seg of rec.squads){const part=fc27Node('div','fc27-detail-squad');part.appendChild(fc27Node('strong','',seg.nameFA||seg.name||'Squad'));if(seg.nameFA)part.appendChild(fc27Node('p','fc27-original-title',seg.name));if(seg.reward)part.appendChild(fc27Node('p','fc27-detail-note','پاداش / Reward: '+seg.reward));if(Array.isArray(seg.requirements)){const ul=fc27Node('ul','');for(const rule of seg.requirements)ul.appendChild(fc27Node('li','',rule));part.appendChild(ul)}squads.appendChild(part)}panel.appendChild(squads);
 }else{panel.appendChild(fc27Node('p','fc27-detail-note',kind==='sbc'?'شرایط دقیق تیم هنوز دریافت نشده‌اند. اطلاعات تأییدنشده نمایش داده نمی‌شوند.':'مراحل و شروط دقیق این هدف هنوز به‌صورت ساختاری دریافت نشده‌اند.'))}
 const walkthrough=fc27Node('section','fc27-detail-subsection');walkthrough.appendChild(fc27Node('h3','','راهنمای انجام / Walkthrough'));
 const fa=kind==='evolutions'?['در Ultimate Team وارد Evolutions شوید.','این تکامل را پیدا کنید و شرایط موقعیت، امتیاز و PlayStyles را با کارت بازیکن مقایسه کنید.','قبل از شروع، ارتقاها و مهلت دقیق مراحل را در بازی بررسی کنید.','مراحل مسابقات یا تمرین را انجام دهید و پاداش تکامل را دریافت کنید.']:guideFC27(kind,rec);
 const en=kind==='evolutions'?['Open Evolutions in Ultimate Team.','Find this evolution and match its position, overall and PlayStyle restrictions to your selected item.','Check the exact level upgrades and deadlines in-game before confirming.','Complete the listed match or training tasks and claim each upgrade.']:fc27EnglishGuide(kind,rec);
 const ol=fc27Node('ol','');
 for(let i=0;i<Math.max(fa.length,en.length);i++){const li=fc27Node('li','');if(fc27Lang!=='en'&&fa[i])li.appendChild(fc27Node('p','',fa[i]));if(fc27Lang!=='fa'&&en[i]){const p=fc27Node('p','fc27-step-en',en[i]);p.dir='ltr';li.appendChild(p)}ol.appendChild(li)}walkthrough.appendChild(ol);panel.appendChild(walkthrough);
 overlay.appendChild(panel);overlay.addEventListener('click',e=>{if(e.target===overlay)overlay.remove()});const esc=e=>{if(e.key==='Escape'){overlay.remove();document.removeEventListener('keydown',esc)}};document.addEventListener('keydown',esc);document.body.appendChild(overlay);close.focus();
}
function renderLiveFC27(){
 for(const kind of ['objectives','sbc']){
  const host=document.getElementById('live-'+kind),status=document.getElementById('live-'+kind+'-status');
  if(!host||!status)continue;
  const records=liveFC27.sections[kind]||[];
  const query=(document.getElementById('live-'+kind+'-search')?.value||'').trim().toLowerCase();
  const visible=records.filter(r=>([r.name,FC27_FA[r.name]||'',r.description||''].join(' ')).toLowerCase().includes(query));
  host.replaceChildren();
  const top=fc27Node('div','fc27-lang-control');
  const langLabel=fc27Node('span','fc27-lang-label','زبان راهنما / Guide language');
  top.appendChild(langLabel);
  for(const [value,label] of [['fa','فارسی'],['en','English'],['both','هر دو']]){
   const btn=fc27Node('button','fc27-lang-btn'+(fc27Lang===value?' active':''),label);
   btn.type='button';btn.setAttribute('aria-pressed',String(fc27Lang===value));btn.addEventListener('click',()=>setFC27Lang(value));top.appendChild(btn);
  }
  host.appendChild(top);
  const age=liveFC27.checked_at?Math.floor((Date.now()-Date.parse(liveFC27.checked_at))/86400000):Infinity;
  status.textContent=records.length?records.length.toLocaleString('fa-IR')+' مورد · '+(age>1?'آخرین داده ثبت‌شده: ':'آخرین بررسی: ')+new Date(liveFC27.checked_at).toLocaleString('fa-IR'):'داده معتبر در دسترس نیست';
  for(const rec of visible){
   let linkUrl;try{linkUrl=new URL(rec.url)}catch{continue}
   if(linkUrl.hostname!=='www.fut.gg')continue;
   const card=fc27Node('article','fc-feed-card');
   const title=fc27Node('h3','',FC27_FA[rec.name]||rec.name);
   const englishTitle=fc27Node('p','fc27-original-title',rec.name);
   const desc=fc27Node('p','fc27-card-description',kind==='objectives'?'جزئیات مأموریت و مراحل تکمیل':'مراحل تکمیل چالش و بررسی ترکیب');
   const meta=fc27Node('div','fc-feed-meta',kind==='sbc'?(Number.isFinite(rec.price)?'هزینه ثبت‌شده: '+rec.price.toLocaleString('fa-IR'):'هزینه تأییدشده موجود نیست'):(rec.reward||'جایزه در جزئیات هدف'));
   if(kind==='sbc'&&Array.isArray(rec.requirements)&&rec.requirements.length){
    const rules=fc27Node('div','fc27-verified-rules');
    rules.appendChild(fc27Node('strong','',fc27Lang==='en'?'Eligible player restrictions (not full squad requirements)':fc27Lang==='fa'?'محدودیت بازیکنان مجاز (نه شرایط کامل ترکیب)':'محدودیت بازیکنان مجاز / Eligible players — not full squad requirements'));
    const ul=document.createElement('ul');for(const rule of rec.requirements){const li=document.createElement('li');if(fc27Lang!=='en'&&/^Rating:\s*Min\.\s*(\d+)/i.test(rule)){const m=rule.match(/\d+/);li.appendChild(fc27Node('span','','حداقل امتیاز بازیکن مجاز: '+m[0]));if(fc27Lang==='both')li.appendChild(fc27Node('span','fc27-step-en',rule));}else{li.textContent=rule}ul.appendChild(li)}rules.appendChild(ul);card.appendChild(rules);
   }
   const details=fc27Node('details','fc-steps');
   const summary=fc27Node('summary','','راهنمای انجام / Walkthrough');details.appendChild(summary);
   const fa=guideFC27(kind,rec),en=fc27EnglishGuide(kind,rec);
   const key=kind+':'+rec.url;const checked=Array.isArray(fc27Progress[key])?fc27Progress[key]:[];
   for(let i=0;i<Math.max(fa.length,en.length);i++){
    const row=fc27Node('label','fc27-step');
    const check=document.createElement('input');check.type='checkbox';check.checked=!!checked[i];check.setAttribute('aria-label','Step '+(i+1));
    check.addEventListener('change',()=>{const current=Array.isArray(fc27Progress[key])?fc27Progress[key].slice():[];current[i]=check.checked;fc27Progress[key]=current;try{localStorage.setItem('fc27-guide-progress',JSON.stringify(fc27Progress))}catch(e){}row.classList.toggle('completed',check.checked)});
    const content=fc27Node('span','fc27-step-text');
    if(fc27Lang!=='en'&&fa[i])content.appendChild(fc27Node('span','fc27-step-fa',fa[i]));
    if(fc27Lang!=='fa'&&en[i]){const t=fc27Node('span','fc27-step-en',en[i]);t.dir='ltr';content.appendChild(t)}
    row.classList.toggle('completed',check.checked);row.append(check,content);details.appendChild(row);
   }
   const open=fc27Node('button','fc27-detail-open','جزئیات کامل در همین سایت / Details');
   open.type='button';open.addEventListener('click',()=>openFC27Details(kind,rec));
   card.append(title,englishTitle,desc,meta,details,open);host.appendChild(card);
  }
  if(!visible.length)host.appendChild(fc27Node('p','fc-feed-meta','موردی برای نمایش پیدا نشد.'));
 }
}
async function loadLiveFC27(){
 try{
  const response=await fetch('./data/fc27-challenges.json?updated='+Date.now(),{cache:'no-store'});
  if(!response.ok)throw Error('Data feed unavailable');
  const data=await response.json();
  if(data.source!=='FUT.GG'||!Array.isArray(data.sections?.objectives)||!Array.isArray(data.sections?.sbc)||!Number.isFinite(Date.parse(data.checked_at)))throw Error('Invalid data');
  liveFC27=data;
 }catch(error){console.warn('FC27 sourced data not available',error)}
 renderLiveFC27();
}
function init(){
  const photoWatcher=new MutationObserver(()=>observePlayerPortraits());photoWatcher.observe(document.body,{childList:true,subtree:true});
  loadState();
  loadLiveFC27();
  loadVerifiedEvolutions();
  loadPortraitIndex();
  if(!state.squad)state.squad={formation:'4-3-3',slots:{}};
  if(!state.compSel)state.compSel=[];
  if(!state.evoProgs)state.evoProgs={};
  if(!state.watchlist)state.watchlist={};
  // Init watchlist badge count
  const wlN=Object.values(state.watchlist).filter(Boolean).length;
  const wlEl=document.getElementById('wl-cnt');if(wlEl&&wlN)wlEl.textContent=wlN;
  if(!state.owned)state.owned={};
  updateStats();renderObj();renderSBC();renderPlayers();
  startCountdowns();
  // Legacy mini-games use non-verified player pools; disabled until supported.
  setTimeout(doFetch,100);
}
document.addEventListener('DOMContentLoaded',init);
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(err => console.warn('Service worker registration failed:', err)));
}


Object.assign(window,{
daysFromNow,
hoursFromNow,
fmtExp,
isExpiring,
cardCls,
hl,
playerFUT,
portraitHTML,
observePlayerPortraits,
fetchPlayerPortrait,
loadPortraitIndex,
imgFallback,
loadState,
saveState,
objCardHTML,
sbcCardHTML,
toggleGuide,
openSolver,
closeSolver,
toggleOwned,
renderSolver,
renderObj,
renderSBC,
deterministicStats,
buildAdvGrid,
onAdvRange,
toggleAdvFilter,
resetAdvFilter,
toggleWatchlist,
renderWatchlist,
showPlayStyleGuide,
closePlayStyleGuide,
startDraft,
closeDraft,
renderDraftSlot,
pickDraftPlayer,
calcChem,
setFormation,
renderPitch,
updateChem,
openSquadPicker,
closeSquadPicker,
renderSquadPicker,
selectSquadPlayer,
clearSquad,
toggleCompare,
showCompModal,
closeComp,
loadVerifiedEvolutions,
renderVerifiedEvolutions,
renderEvo,
evoChange,
startCountdowns,
resolvedCT,
realCT,
pcardImgCls,
fmtPrice,
playerCardHTML,
setPlayerPage,
renderPlayers,
galleryCardHTML,
toggleGallery,
setPos,
setCardType,
togglePF,
togglePlFav,
updateStats,
setObjCat,
setSBCCat,
toggleOF,
toggleSF,
toggleObjFav,
toggleSBCFav,
toggleObjDone,
toggleSBCDone,
setStatus,
doFetch,
toast,
openCC,
closeCC,
renderCC,
setUpgFilter,
renderUpgHub,
renderEvoChain,
showSec,
loadOfficialNews,
guideFC27,
setFC27Lang,
fc27EnglishGuide,
fc27Node,
openFC27Details,
renderLiveFC27,
loadLiveFC27,
init
});


type MarketPlatform='pc'|'ps'|'xbox';
type MarketQuote={cardId:string;versionId:string;platform:MarketPlatform;coins:number|null;checkedAt:string|null;sourceUrl:string|null;status:string};
let verifiedMarketPrices=new Map<string,MarketQuote>();
async function loadVerifiedMarketPrices(){
 verifiedMarketPrices.clear();
 try{
  const response=await fetch('./data/fc27-prices.json',{cache:'no-store'});
  if(!response.ok)throw Error('No price feed');
  const data=await response.json();
  if(!Array.isArray(data.prices))throw Error('Invalid price snapshot');
  for(const item of data.prices){
   if(!item||!/^\\d+$/.test(String(item.versionId)))continue;
   if(!['pc','ps','xbox'].includes(item.platform))continue;
   if(!Number.isInteger(item.coins)||item.coins<0)continue;
   if(typeof item.sourceUrl!=='string'||!item.sourceUrl.startsWith('https://'))continue;
   if(typeof item.checkedAt!=='string')continue;
   const when=Date.parse(item.checkedAt),now=Date.now();
   if(!Number.isFinite(when)||when>now||now-when>45*60*1000)continue;
   const key=item.versionId+':'+item.platform;
   verifiedMarketPrices.set(key,item);
  }
 }catch(err){console.warn('Verified market price feed unavailable',err)}
 if(document.getElementById('plGrid'))renderPlayers();
}
function getFC27CardCoins(p){
 const version=String(p.versionId||p.itemId||'');
 if(!/^\\d+$/.test(version))return null;
 const platform=document.getElementById('fcPricePlatform')?.value||'ps';
 const item=verifiedMarketPrices.get(version+':'+platform);
 return item&&Number.isInteger(item.coins)?item.coins:null;
}
function getFC27CardPriceText(p){
 const value=getFC27CardCoins(p);
 return value===null?'قیمت معتبر موجود نیست':value.toLocaleString('fa-IR')+' سکه';
}
function showVerifiedCardPrice(){
 const output=document.getElementById('fcPriceResult');
 if(!output)return;
 const version=String(document.getElementById('fcPriceVersion')?.value||'').trim();
 const platform=document.getElementById('fcPricePlatform')?.value||'ps';
 output.replaceChildren();
 if(!/^\\d+$/.test(version)){output.textContent='شناسه نسخه کارت باید عددی باشد. / Enter an exact numeric version ID.';return}
 const quote=verifiedMarketPrices.get(version+':'+platform);
 if(!quote){output.textContent='برای این نسخه و پلتفرم، قیمت تازه و قابل‌تأیید موجود نیست. / No verified fresh quote for this card version and platform.';return}
 const amount=document.createElement('strong');amount.textContent=quote.coins.toLocaleString('fa-IR')+' Coins';
 const time=document.createElement('span');time.textContent=' · آخرین بررسی: '+new Date(quote.checkedAt).toLocaleString('fa-IR');
 const link=document.createElement('a');link.textContent=' · منبع قیمت ↗';link.href=quote.sourceUrl;link.rel='noopener noreferrer';link.target='_blank';link.className='fc-price-sourced';
 output.append(amount,time,link);
}
document.addEventListener('DOMContentLoaded',async()=>{
 const trigger=document.getElementById('fcPriceCheck');
 if(trigger)trigger.addEventListener('click',showVerifiedCardPrice);
 document.getElementById('fcPricePlatform')?.addEventListener('change',()=>{showVerifiedCardPrice();renderPlayers()});
 await loadVerifiedMarketPrices();
});
