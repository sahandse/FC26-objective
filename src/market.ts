import {validatedPrice,type CardPrice,type Platform} from './prices';
interface CardIdentity{versionId?:string|number;itemId?:string|number}
interface PriceFeed {updated_at:string|null;prices:CardPrice[]}
const quotes=new Map<string,CardPrice>();
const platforms=new Set<Platform>(['pc','ps','xbox']);
function currentPlatform():Platform{
 const el=document.getElementById('fcPricePlatform') as HTMLSelectElement|null;
 const val=el?.value as Platform|undefined;
 return val&&platforms.has(val)?val:'ps';
}
function verifiedQuote(versionId:string,platform:Platform):CardPrice|null{
 const item=quotes.get(versionId+':'+platform);
 if(!item)return null;
 const latest=validatedPrice(item);
 return latest.status==='verified'?latest:null;
}
export function getFC27CardCoins(card:CardIdentity):number|null{
 const version=String(card.versionId??card.itemId??'');
 if(!/^\d+$/.test(version))return null;
 return verifiedQuote(version,currentPlatform())?.coins??null;
}
export function getFC27CardPriceText(card:CardIdentity):string{
 const amount=getFC27CardCoins(card);
 return amount===null?'قیمت معتبر موجود نیست':amount.toLocaleString('fa-IR')+' سکه';
}
function showVerifiedCardPrice():void{
 const output=document.getElementById('fcPriceResult');
 const version=(document.getElementById('fcPriceVersion') as HTMLInputElement|null)?.value.trim()||'';
 if(!output)return;
 output.replaceChildren();
 if(!/^\d+$/.test(version)){output.textContent='شناسه دقیق نسخه کارت را وارد کنید / Enter an exact numeric card version ID.';return}
 const quote=verifiedQuote(version,currentPlatform());
 if(!quote||quote.coins===null||!quote.checkedAt||!quote.sourceUrl){output.textContent='قیمت تازه و معتبر برای این نسخه و پلتفرم موجود نیست / No verified fresh quote.';return}
 const amount=document.createElement('strong');amount.textContent=quote.coins.toLocaleString('fa-IR')+' Coins';
 const stamp=document.createElement('span');stamp.textContent=' · بررسی: '+new Date(quote.checkedAt).toLocaleString('fa-IR');
 const source=document.createElement('a');source.href=quote.sourceUrl;source.rel='noopener noreferrer';source.target='_blank';source.className='fc-price-sourced';source.textContent=' · مشاهده منبع ↗';
 output.append(amount,stamp,source);
}
async function refreshPrices():Promise<void>{
 quotes.clear();
 try{
  const response=await fetch('./data/fc27-prices.json',{cache:'no-store'});
  if(!response.ok)throw new Error('No verified price snapshot');
  const data:PriceFeed=await response.json();
  if(!Array.isArray(data.prices))throw new Error('Invalid prices');
  for(const record of data.prices){
   if(!record||!/^\d+$/.test(String(record.versionId))||!platforms.has(record.platform))continue;
   const safe=validatedPrice(record);
   if(safe.status==='verified')quotes.set(safe.versionId+':'+safe.platform,safe);
  }
 }catch(error){console.warn('Price feed unavailable; market remains unquoted',error)}
}
export function setupVerifiedMarkets(onUpdate:()=>void):void{
 document.getElementById('fcPriceCheck')?.addEventListener('click',showVerifiedCardPrice);
 document.getElementById('fcPricePlatform')?.addEventListener('change',()=>{showVerifiedCardPrice();onUpdate()});
 void refreshPrices().then(onUpdate);
}
