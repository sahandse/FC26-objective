export type Platform='pc'|'ps'|'xbox';
export type PriceStatus='verified'|'stale'|'unavailable';
export interface CardPrice { cardId:string; versionId:string; platform:Platform; coins:number|null; status:PriceStatus; sourceUrl:string|null; checkedAt:string|null; }
const MAX_AGE=45*60*1000;
export function validatedPrice(item:CardPrice,now=Date.now()):CardPrice{
 const timestamp=item.checkedAt?Date.parse(item.checkedAt):NaN;
 const sourceOk=typeof item.sourceUrl==='string'&&item.sourceUrl.startsWith('https://');
 const current=Number.isFinite(timestamp)&&timestamp<=now&&now-timestamp<=MAX_AGE;
 const valid=sourceOk&&current&&Number.isFinite(item.coins)&&item.coins!==null&&item.coins>=0;
 return {...item,status:valid?'verified':Number.isFinite(timestamp)?'stale':'unavailable',coins:valid?item.coins:null};
}
