(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports) module.exports=api;
  root.APE16Core=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
"use strict";
const RES=64, CELLS=4096, VERSION="2.0.0";
const LAYERS=["Background","Body","Clothing","Mouth","Eyes","Headwear","Accessories"];
const DEFAULT_CATEGORY_ORDER=LAYERS.filter(x=>x!=="Body");

function makePixels(){return new Uint8ClampedArray(CELLS*4)}
function makeMask(){return new Uint8Array(CELLS)}
function clonePixels(a){return new Uint8ClampedArray(a)}
function cloneMask(a){return new Uint8Array(a)}
function idx(x,y){return y*RES+x}
function inBounds(x,y){return x>=0&&y>=0&&x<RES&&y<RES}
function rgbaAt(p,x,y){let i=idx(x,y)*4;return [p[i],p[i+1],p[i+2],p[i+3]]}
function setRGBA(p,x,y,c){if(!inBounds(x,y))return;let i=idx(x,y)*4;p[i]=c[0];p[i+1]=c[1];p[i+2]=c[2];p[i+3]=c[3]}
function sameRGBA(a,b){return a[0]===b[0]&&a[1]===b[1]&&a[2]===b[2]&&a[3]===b[3]}
function validatePixels(p,{allowEmpty=false}={}){
  if(!(p instanceof Uint8Array || p instanceof Uint8ClampedArray)||p.length!==CELLS*4)
    return {pass:false,issues:["Layer must contain exactly 4,096 RGBA cells."],painted:0,transparent:0,partialAlpha:0,colors:0};
  let painted=0,partial=0;const colors=new Set();
  for(let i=0;i<p.length;i+=4){const a=p[i+3];if(a!==0&&a!==255)partial++;if(a){painted++;colors.add(`${p[i]},${p[i+1]},${p[i+2]},${a}`)}}
  const issues=[];if(partial)issues.push(`${partial} partial-alpha cells found.`);if(!allowEmpty&&!painted)issues.push("Layer is empty.");
  return {pass:!issues.length,issues,painted,transparent:CELLS-painted,partialAlpha:partial,colors:colors.size};
}
function validateMask(m){
  if(!(m instanceof Uint8Array)||m.length!==CELLS)return {pass:false,issues:["Mask must contain exactly 4,096 cells."],masked:0};
  let masked=0,bad=0;for(const v of m){if(v!==0&&v!==1)bad++;if(v)masked++}
  return {pass:bad===0,issues:bad?[`${bad} invalid mask cells.`]:[],masked};
}
function floodFill(p,x,y,color){
  if(!inBounds(x,y))return 0;const target=rgbaAt(p,x,y);if(sameRGBA(target,color))return 0;
  const stack=[[x,y]],seen=new Uint8Array(CELLS);let n=0;
  while(stack.length){const [cx,cy]=stack.pop();if(!inBounds(cx,cy))continue;const k=idx(cx,cy);if(seen[k])continue;seen[k]=1;if(!sameRGBA(rgbaAt(p,cx,cy),target))continue;setRGBA(p,cx,cy,color);n++;
    stack.push([cx+1,cy],[cx-1,cy],[cx,cy+1],[cx,cy-1]);
  }return n;
}
function lineCells(x0,y0,x1,y1){
  const out=[];let dx=Math.abs(x1-x0),sx=x0<x1?1:-1,dy=-Math.abs(y1-y0),sy=y0<y1?1:-1,err=dx+dy;
  while(true){if(inBounds(x0,y0))out.push([x0,y0]);if(x0===x1&&y0===y1)break;let e2=2*err;if(e2>=dy){err+=dy;x0+=sx}if(e2<=dx){err+=dx;y0+=sy}}
  return out;
}
function rectCells(x0,y0,x1,y1,filled=false){
  const out=[];let xa=Math.max(0,Math.min(x0,x1)),xb=Math.min(63,Math.max(x0,x1)),ya=Math.max(0,Math.min(y0,y1)),yb=Math.min(63,Math.max(y0,y1));
  for(let y=ya;y<=yb;y++)for(let x=xa;x<=xb;x++)if(filled||x===xa||x===xb||y===ya||y===yb)out.push([x,y]);return out;
}
function applyBrush(p,x,y,color,size=1,mirror=false){
  size=Math.max(1,Math.min(4,size|0));let changed=0;
  const paint=(px,py)=>{for(let yy=0;yy<size;yy++)for(let xx=0;xx<size;xx++){let x2=px+xx,y2=py+yy;if(inBounds(x2,y2)){setRGBA(p,x2,y2,color);changed++}}};
  paint(x,y);if(mirror)paint(RES-1-x-(size-1),y);return changed;
}
function applyMaskBrush(m,x,y,value=1,size=1,mirror=false){
  size=Math.max(1,Math.min(4,size|0));let changed=0;
  const paint=(px,py)=>{for(let yy=0;yy<size;yy++)for(let xx=0;xx<size;xx++){let x2=px+xx,y2=py+yy;if(inBounds(x2,y2)){m[idx(x2,y2)]=value?1:0;changed++}}};
  paint(x,y);if(mirror)paint(RES-1-x-(size-1),y);return changed;
}
function mirrorPixels(p){const out=clonePixels(p);for(let y=0;y<RES;y++)for(let x=0;x<RES;x++)setRGBA(out,RES-1-x,y,rgbaAt(p,x,y));return out}
function mirrorMask(m){const out=cloneMask(m);for(let y=0;y<RES;y++)for(let x=0;x<RES;x++)out[idx(RES-1-x,y)]=m[idx(x,y)];return out}
function compose(genesis,traits){
  const out=clonePixels(genesis);
  const ordered=[...traits].sort((a,b)=>LAYERS.indexOf(a.category)-LAYERS.indexOf(b.category));
  for(const t of ordered){
    if(t.none)continue;
    if(t.mask){for(let c=0;c<CELLS;c++)if(t.mask[c])out[c*4+3]=0}
    const p=t.pixels;for(let i=0;i<p.length;i+=4)if(p[i+3]){out[i]=p[i];out[i+1]=p[i+1];out[i+2]=p[i+2];out[i+3]=255}
  }return out;
}
function hashSeed(s){let h=2166136261>>>0;for(const c of String(s)){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0}
function rng(seed){let a=hashSeed(seed);return()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}}
function traitKey(t){return `${t.category}::${t.name}`}
function weighted(arr,r){
  let total=arr.reduce((s,t)=>s+Math.max(0,Number(t.weight)||0),0);if(total<=0)return arr[0];
  let x=r()*total;for(const t of arr){x-=Math.max(0,Number(t.weight)||0);if(x<=0)return t}return arr[arr.length-1];
}
function validCombo(combo,conflicts){
  const keys=new Set(combo.map(traitKey));return !conflicts.some(([a,b])=>keys.has(a)&&keys.has(b));
}
function combinationKey(combo){return combo.slice().sort((a,b)=>LAYERS.indexOf(a.category)-LAYERS.indexOf(b.category)).map(traitKey).join("|")}
function generatePlan({traits,conflicts=[],supply=3333,seed="APE16",maxAttempts=null}){
  const by={};for(const c of LAYERS)by[c]=traits.filter(t=>t.category===c);
  const r=rng(seed),seen=new Set(),items=[];const target=Math.max(1,supply|0),cap=maxAttempts||target*1000;let tries=0;
  while(items.length<target&&tries++<cap){
    const combo=[];for(const cat of LAYERS){const arr=by[cat];if(arr.length)combo.push(weighted(arr,r))}
    if(!validCombo(combo,conflicts))continue;const k=combinationKey(combo);if(seen.has(k))continue;seen.add(k);items.push(combo.map(t=>({category:t.category,name:t.name,weight:t.weight,none:!!t.none})));
  }
  return {pass:items.length===target,items,requested:target,tries,unique:items.length};
}
function metadataFor(token,combo,settings={}){
  const attrs=[];let bodySeen=false;
  for(const t of combo){if(t.none)continue;attrs.push({trait_type:t.category,value:t.name});if(t.category==="Body")bodySeen=true}
  if(!bodySeen)attrs.unshift({trait_type:"Body",value:settings.genesisName||"Brown"});
  const imageBase=settings.imageBaseURI||"";const image=imageBase?`${imageBase.replace(/\/$/,"")}/${token}.png`:`${token}.png`;
  return {name:`${settings.collectionName||"APE16"} #${token}`,description:settings.description||"",image,external_url:settings.externalURL||undefined,attributes:attrs};
}
function bytesToB64(bytes){
  if(typeof Buffer!=="undefined")return Buffer.from(bytes).toString("base64");
  let s="";for(let i=0;i<bytes.length;i+=0x8000)s+=String.fromCharCode(...bytes.subarray(i,Math.min(bytes.length,i+0x8000)));return btoa(s);
}
function b64ToBytes(s,clamped=false){
  if(typeof Buffer!=="undefined"){const b=Buffer.from(s,"base64");return clamped?new Uint8ClampedArray(b):new Uint8Array(b)}
  const bin=atob(s),a=clamped?new Uint8ClampedArray(bin.length):new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i);return a;
}
function packPixels(p){return bytesToB64(new Uint8Array(p.buffer,p.byteOffset,p.byteLength))}
function unpackPixels(s){return b64ToBytes(s,true)}
function packMask(m){return bytesToB64(m)}
function unpackMask(s){return b64ToBytes(s,false)}
function serializeProject(project){
  return {
    format:"APE16_STUDIO_PROJECT_V2",version:VERSION,
    settings:{...project.settings},genesisLocked:!!project.genesisLocked,genesis:packPixels(project.genesis),
    traits:project.traits.map(t=>({id:t.id,category:t.category,name:t.name,weight:t.weight,none:!!t.none,revision:t.revision||1,approved:!!t.approved,archived:!!t.archived,pixels:packPixels(t.pixels),mask:t.mask?packMask(t.mask):null})),
    conflicts:project.conflicts.map(x=>[...x]),savedAt:new Date().toISOString()
  };
}
function deserializeProject(p){
  if(!p||p.format!=="APE16_STUDIO_PROJECT_V2"||p.version!==VERSION)throw new Error("Unsupported project file.");
  return {settings:{...p.settings},genesisLocked:!!p.genesisLocked,genesis:unpackPixels(p.genesis),traits:(p.traits||[]).map(t=>({...t,pixels:unpackPixels(t.pixels),mask:t.mask?unpackMask(t.mask):null})),conflicts:(p.conflicts||[]).map(x=>[...x])};
}
function auditProject(project){
  const issues=[],g=validatePixels(project.genesis);
  if(!g.pass)issues.push(...g.issues.map(x=>"Genesis: "+x));if(!project.genesisLocked)issues.push("Genesis is not locked.");
  const seen=new Set();for(const t of project.traits){
    if(t.archived)continue;
    const k=traitKey(t).toLowerCase();if(seen.has(k))issues.push("Duplicate trait: "+traitKey(t));seen.add(k);
    const a=validatePixels(t.pixels,{allowEmpty:!!t.none});if(!a.pass)issues.push(...a.issues.map(x=>`${traitKey(t)}: ${x}`));
    if(t.mask){const m=validateMask(t.mask);if(!m.pass)issues.push(...m.issues.map(x=>`${traitKey(t)} mask: ${x}`))}
    if(!t.approved)issues.push(`${traitKey(t)} is not approved.`);
    if(Number(t.weight)<0)issues.push(`${traitKey(t)} has a negative weight.`);
  }
  const keys=new Set(project.traits.map(traitKey));for(const [a,b] of project.conflicts)if(!keys.has(a)||!keys.has(b))issues.push(`Conflict references missing trait: ${a} / ${b}`);
  return {pass:issues.length===0,issues,genesis:g,traitCount:project.traits.length};
}
return {RES,CELLS,VERSION,LAYERS,DEFAULT_CATEGORY_ORDER,makePixels,makeMask,clonePixels,cloneMask,idx,inBounds,rgbaAt,setRGBA,sameRGBA,validatePixels,validateMask,floodFill,lineCells,rectCells,applyBrush,applyMaskBrush,mirrorPixels,mirrorMask,compose,hashSeed,rng,traitKey,weighted,validCombo,combinationKey,generatePlan,metadataFor,packPixels,unpackPixels,packMask,unpackMask,serializeProject,deserializeProject,auditProject};
});