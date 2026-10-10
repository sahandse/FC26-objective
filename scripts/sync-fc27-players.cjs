const fs=require('node:fs');
const path=require('node:path');
const url='https://raw.githubusercontent.com/LakshmiKanth11/EA_FC_ANALYSIS/main/EA_FC_PLAYERS_DATASET_AND_%20DASHBOARD/data/players.csv';
function parseCSV(text){
 const rows=[];let row=[],cell='',quoted=false;
 for(let i=0;i<text.length;i++){const c=text[i];
  if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
  else if(c===','&&!quoted){row.push(cell);cell='';}
  else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(Boolean))rows.push(row);row=[];cell='';}
  else cell+=c;
 }
 if(cell||row.length){row.push(cell);rows.push(row);}
 const [keys,...values]=rows;return values.map(cols=>Object.fromEntries(keys.map((k,i)=>[k.trim().replace(/^\uFEFF/,''),cols[i]||''])));
}
async function main(){
 const response=await fetch(url,{headers:{'User-Agent':'FC27Hub/1.0','Accept':'text/csv'}});
 if(!response.ok)throw Error('EA FC dataset download '+response.status);
 const raw=await response.text();
 const rows=parseCSV(raw);
 if(rows.length<18000)throw Error('Unexpected source row count '+rows.length);
 const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0};
 const type=pos=>pos==='GK'?'GK':['ST','CF','LW','RW','LF','RF'].includes(pos)?'ATT':['CB','LB','RB','LWB','RWB'].includes(pos)?'DEF':'MID';
 const players=rows.map(p=>{
 const name=(p.common_name||[p.first_name,p.last_name].filter(Boolean).join(' ')).trim();
 const pos=p.position;
 const stats=pos==='GK'?{DIV:num(p.goalkeeping_diving),HAN:num(p.goalkeeping_handling),KIC:num(p.goalkeeping_kicking),REF:num(p.goalkeeping_reflexes),SPD:num(p.pace),POS:num(p.goalkeeping_positioning)}:{PAC:num(p.pace),SHO:num(p.shooting),PAS:num(p.passing),DRI:num(p.dribbling),DEF:num(p.defending),PHY:num(p.physicality)};
 return {id:String(p.player_id),name,nameFA:name,rat:num(p.overall_rating),pos,posType:type(pos),nat:p.nationality,flag:'⚽',club:p.club,leagueFA:p.league,price:null,imgId:null,stats,cardType:num(p.overall_rating)>=75?'gold':num(p.overall_rating)>=65?'silver':'bronze',gender:p.gender};
 }).filter(p=>p.id&&p.name&&p.rat>=1&&p.rat<=99&&p.pos);
 if(players.length<18000)throw Error('Invalid player schema '+players.length);
 const edition=new Set(rows.map(p=>p.edition).filter(Boolean));
 if(edition.size&&!Array.from(edition).some(x=>/27/i.test(x)))throw Error('Source is not FC27');
 const payload={source:'EA SPORTS FC 27 public ratings via LakshmiKanth11/EA_FC_ANALYSIS',source_url:url,snapshot_date:'2026-09-12',synced_at:new Date().toISOString(),live_market_prices:false,players};
 fs.mkdirSync('data',{recursive:true});fs.writeFileSync('data/fc27-players.json',JSON.stringify(payload));
 console.log('Verified FC27 base player records:',players.length);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
