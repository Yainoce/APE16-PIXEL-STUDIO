(()=>{"use strict";
const RES=64,SUPPLY=3333,LAYERS=["Background","Body","Clothing","Mouth","Eyes","Headwear","Accessories"],VERSION="1.0";
const $=id=>document.getElementById(id), clone=o=>JSON.parse(JSON.stringify(o));
const state={name:"APE16",supply:SUPPLY,genesis:null,genesisLocked:false,traits:[],conflicts:[],working:null,plan:null};
const categories=LAYERS.filter(x=>x!=="Body");
categories.forEach(c=>{let o=document.createElement("option");o.value=o.textContent=c;$("category").appendChild(o)});
document.querySelectorAll("nav button").forEach(b=>b.onclick=()=>{document.querySelectorAll("nav button,.page").forEach(x=>x.classList.remove("active"));b.classList.add("active");$(b.dataset.page).classList.add("active");if(b.dataset.page==="rules")renderRuleSelectors()});
function setStatus(s){$("status").textContent=s}
function safe(s){return (s||"Trait").trim().replace(/[^a-z0-9]+/gi,"_").replace(/^_+|_+$/g,"")}
function dl(blob,name){const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1000)}
function canvasPixels(canvas){return canvas.getContext("2d").getImageData(0,0,RES,RES)}
function put(canvas,data){canvas.getContext("2d").putImageData(data,0,0)}
function normalizeImage(img){
 const c=document.createElement("canvas");c.width=c.height=RES;const x=c.getContext("2d",{willReadFrequently:true});x.imageSmoothingEnabled=false;x.clearRect(0,0,RES,RES);x.drawImage(img,0,0,RES,RES);
 const d=x.getImageData(0,0,RES,RES),p=d.data;for(let i=0;i<p.length;i+=4){if(p[i+3]<128){p[i]=p[i+1]=p[i+2]=p[i+3]=0}else p[i+3]=255}return d
}
function readImage(file){return new Promise((res,rej)=>{const r=new FileReader();r.onerror=rej;r.onload=()=>{const im=new Image();im.onerror=rej;im.onload=()=>res({img:im,url:r.result});im.src=r.result};r.readAsDataURL(file)})}
function encodeData(d){return Array.from(d.data)}
function decodeData(a){return new ImageData(new Uint8ClampedArray(a),RES,RES)}
function auditData(d,allowEmpty=false){
 let partial=0,painted=0;for(let i=3;i<d.data.length;i+=4){let a=d.data[i];if(a!==0&&a!==255)partial++;if(a)painted++}
 return {pass:(allowEmpty||painted>0)&&partial===0,painted,transparent:RES*RES-painted,partialAlpha:partial,size:`${d.width}×${d.height}`}
}
function composite(trait=null){
 const c=$("compositeCanvas"),x=c.getContext("2d");x.clearRect(0,0,RES,RES);if(state.genesis)x.putImageData(state.genesis,0,0);
 if(trait&&trait.mask){const m=trait.mask.data,g=x.getImageData(0,0,RES,RES);for(let i=0;i<m.length;i+=4)if(m[i+3])g.data[i+3]=0;x.putImageData(g,0,0)}
 if(trait&&trait.data)x.drawImage(imageDataCanvas(trait.data),0,0);return x.getImageData(0,0,RES,RES)
}
function imageDataCanvas(d){const c=document.createElement("canvas");c.width=c.height=RES;c.getContext("2d").putImageData(d,0,0);return c}
async function loadGenesis(){
 const im=new Image();im.onload=()=>{state.genesis=normalizeImage(im);put($("genesisCanvas"),state.genesis);$("genesisReport").textContent=report(auditData(state.genesis));};im.src="APE16_BROWN_GENESIS_64x64.png"
}
function report(a){return `${a.pass?"PASS":"FAIL"}\nGrid: ${a.size}\nPainted cells: ${a.painted} / 4096\nTransparent cells: ${a.transparent}\nPartial alpha: ${a.partialAlpha}`}
$("auditGenesis").onclick=()=>{$("genesisReport").textContent=report(auditData(state.genesis));setStatus(auditData(state.genesis).pass?"GENESIS PASS":"FAIL")};
$("lockGenesis").onclick=()=>{if(!auditData(state.genesis).pass)return alert("Genesis audit must pass.");state.genesisLocked=true;$("lockGenesis").disabled=true;setStatus("GENESIS LOCKED")};
$("traitFile").onchange=async e=>{const f=e.target.files[0];if(!f)return;const r=await readImage(f),data=normalizeImage(r.img);state.working={data,mask:null,source:{name:f.name,w:r.img.width,h:r.img.height}};put($("traitCanvas"),data);put($("compositeCanvas"),composite(state.working));$("traitStatus").textContent=`LOADED · ${r.img.width}×${r.img.height} → normalized 64×64`; $("traitReport").textContent="Not validated."; $("approveTrait").disabled=true};
$("maskFile").onchange=async e=>{const f=e.target.files[0];if(!f||!state.working)return;const r=await readImage(f),d=normalizeImage(r.img);for(let i=0;i<d.data.length;i+=4){let a=d.data[i+3]?255:0;d.data[i]=d.data[i+1]=d.data[i+2]=255;d.data[i+3]=a}state.working.mask=d;put($("compositeCanvas"),composite(state.working));};
$("noneTrait").onchange=()=>{if($("noneTrait").checked){$("traitFile").value="";state.working={data:new ImageData(RES,RES),mask:null,source:{name:"NONE",w:RES,h:RES}};put($("traitCanvas"),state.working.data);put($("compositeCanvas"),composite(state.working))}};
$("validateTrait").onclick=()=>{
 if(!state.genesisLocked)return alert("Lock Genesis first.");
 const name=$("traitName").value.trim(),none=$("noneTrait").checked;if(!name)return alert("Enter a trait name.");if(!state.working)return alert("Choose a trait PNG or select None.");
 const a=auditData(state.working.data,none),dup=state.traits.some(t=>t.category===$("category").value&&t.name.toLowerCase()===name.toLowerCase());
 const issues=[];if(!a.pass)issues.push("Pixel/alpha audit failed.");if(dup)issues.push("Duplicate category + name.");if(Number($("weight").value)<0)issues.push("Weight cannot be negative.");
 $("traitReport").textContent=(issues.length?"FAIL\n"+issues.join("\n"):"PASS\n")+report(a);$("approveTrait").disabled=issues.length>0;setStatus(issues.length?"TRAIT FAIL":"TRAIT PASS")
};
$("approveTrait").onclick=()=>{
 const t={category:$("category").value,name:$("traitName").value.trim(),weight:Number($("weight").value),none:$("noneTrait").checked,data:encodeData(state.working.data),mask:state.working.mask?encodeData(state.working.mask):null,source:state.working.source,revision:1};
 state.traits.push(t);state.working=null;$("traitFile").value=$("maskFile").value="";$("traitName").value="";$("noneTrait").checked=false;$("approveTrait").disabled=true;$("traitStatus").textContent="Trait locked.";renderLibrary();setStatus("TRAIT LOCKED")
};
function renderLibrary(){const h=$("assetLibrary");h.innerHTML="";state.traits.forEach((t,i)=>{const d=document.createElement("div");d.className="asset";d.innerHTML=`<span><b>${t.category}</b> · ${t.name} · weight ${t.weight}${t.mask?" · mask":""}</span><button data-i="${i}">Remove</button>`;d.querySelector("button").onclick=()=>{if(confirm("Remove this approved trait?")){state.traits.splice(i,1);renderLibrary()}};h.appendChild(d)});if(!state.traits.length)h.textContent="No approved traits yet."}
function traitKey(t){return `${t.category}::${t.name}`}
function renderRuleSelectors(){[$("ruleA"),$("ruleB")].forEach(s=>{s.innerHTML="";state.traits.forEach(t=>{let o=document.createElement("option");o.value=traitKey(t);o.textContent=`${t.category} / ${t.name}`;s.appendChild(o)})});renderRules()}
$("addConflict").onclick=()=>{let a=$("ruleA").value,b=$("ruleB").value;if(!a||!b||a===b)return;if(!state.conflicts.some(r=>(r[0]===a&&r[1]===b)||(r[0]===b&&r[1]===a)))state.conflicts.push([a,b]);renderRules()};
function renderRules(){$("rulesList").innerHTML=state.conflicts.map((r,i)=>`<div class="asset"><span>${r[0]} ✕ ${r[1]}</span><button onclick="window.rmRule(${i})">Remove</button></div>`).join("")||"No conflicts."}
window.rmRule=i=>{state.conflicts.splice(i,1);renderRules()};
function hashSeed(s){let h=2166136261>>>0;for(const c of s){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0}
function rng(seed){let a=hashSeed(seed);return()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}}
function weighted(arr,r){let total=arr.reduce((s,t)=>s+Math.max(0,t.weight),0);if(total<=0)return arr[0];let x=r()*total;for(const t of arr){x-=Math.max(0,t.weight);if(x<=0)return t}return arr[arr.length-1]}
function validCombo(c){let keys=new Set(c.map(traitKey));return !state.conflicts.some(([a,b])=>keys.has(a)&&keys.has(b))}
function makePlan(n){
 const r=rng($("seed").value),by={};categories.forEach(c=>by[c]=state.traits.filter(t=>t.category===c));let out=[],seen=new Set(),tries=0,max=n*500;
 while(out.length<n&&tries++<max){let c=[];for(const cat of categories)if(by[cat].length)c.push(weighted(by[cat],r));if(!validCombo(c))continue;let key=c.map(traitKey).join("|");if(seen.has(key))continue;seen.add(key);out.push(c)}
 return {items:out,requested:n,tries,capacityReached:out.length<n}
}
function renderCombo(c,canvas){let x=canvas.getContext("2d");x.clearRect(0,0,RES,RES);x.putImageData(state.genesis,0,0);for(const cat of categories){let t=c.find(q=>q.category===cat);if(!t||t.none)continue;if(t.mask){let m=new Uint8ClampedArray(t.mask),g=x.getImageData(0,0,RES,RES);for(let i=0;i<m.length;i+=4)if(m[i+3])g.data[i+3]=0;x.putImageData(g,0,0)}x.drawImage(imageDataCanvas(decodeData(t.data)),0,0)}}
$("previewGenerate").onclick=()=>{let p=makePlan(24);$("generateReport").textContent=`Generated ${p.items.length}/24 unique valid combinations in ${p.tries} attempts.`;let h=$("comboPreview");h.innerHTML="";p.items.forEach(c=>{let cv=document.createElement("canvas");cv.width=cv.height=RES;renderCombo(c,cv);h.appendChild(cv)})};
$("planFull").onclick=()=>{state.plan=makePlan(Number($("supply").value)||SUPPLY);$("generateReport").textContent=`Planned ${state.plan.items.length}/${state.plan.requested} unique combinations.\nAttempts: ${state.plan.tries}\n${state.plan.capacityReached?"FAIL: trait pool/rules cannot currently produce enough unique combinations.":"PASS: full supply is achievable."}`};
function projectObject(){return {format:"APE16_PROJECT_V1",version:VERSION,name:$("projectName").value,supply:Number($("supply").value),resolution:RES,genesisLocked:state.genesisLocked,genesis:encodeData(state.genesis),traits:state.traits,conflicts:state.conflicts,seed:$("seed").value}}
$("saveProject").onclick=()=>dl(new Blob([JSON.stringify(projectObject())],{type:"application/json"}),`${safe($("projectName").value)}_editable_project.json`);
$("loadProject").onchange=e=>{const f=e.target.files[0];if(!f)return;let r=new FileReader();r.onload=()=>{let p=JSON.parse(r.result);if(p.resolution!==RES)throw Error("Project must be 64×64.");state.name=p.name;state.supply=p.supply;state.genesisLocked=!!p.genesisLocked;state.genesis=decodeData(p.genesis);state.traits=p.traits||[];state.conflicts=p.conflicts||[];$("projectName").value=p.name;$("supply").value=p.supply;$("seed").value=p.seed||"APE16-GENESIS-3333";put($("genesisCanvas"),state.genesis);$("lockGenesis").disabled=state.genesisLocked;renderLibrary();setStatus("PROJECT LOADED")};r.readAsText(f)};
function audit(){
 let issues=[],ga=auditData(state.genesis);if(!ga.pass)issues.push("Genesis pixel audit failed.");if(!state.genesisLocked)issues.push("Genesis is not locked.");if(Number($("supply").value)!==3333)issues.push("Supply must remain 3,333 for this APE16 build.");
 let keys=new Set();for(const t of state.traits){let k=traitKey(t);if(keys.has(k))issues.push("Duplicate "+k);keys.add(k);let a=auditData(decodeData(t.data),t.none);if(!a.pass)issues.push("Invalid trait "+k);if(t.mask&&t.mask.length!==RES*RES*4)issues.push("Bad mask "+k)}
 for(const [a,b] of state.conflicts)if(!keys.has(a)||!keys.has(b))issues.push("Conflict references missing trait.");
 let p=makePlan(3333);if(p.capacityReached)issues.push(`Only ${p.items.length} unique combinations can be generated with current approved traits/rules.`);
 state.plan=p;return {pass:!issues.length,issues,plan:p}
}
$("runAudit").onclick=()=>{let a=audit();$("auditReport").textContent=a.pass?`PROJECT PASS\n64×64 canonical grid\nGenesis locked\n${state.traits.length} approved traits\n3,333 unique valid combinations verified\nNo partial alpha\nConflict references valid\nDeterministic seed: ${$("seed").value}`:`PROJECT NOT READY\n`+a.issues.join("\n");$("exportAssets").disabled=$("exportPlan").disabled=!a.pass;setStatus(a.pass?"PROJECT PASS":"AUDIT FAIL")};
function crc32(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0)}return(c^0xffffffff)>>>0}
const u16=n=>[n&255,n>>>8&255],u32=n=>[n&255,n>>>8&255,n>>>16&255,n>>>24&255],sb=s=>new TextEncoder().encode(s);
function zip(entries){let chunks=[],central=[],off=0;for(const e of entries){let name=sb(e.name),data=e.data instanceof Uint8Array?e.data:new Uint8Array(e.data),crc=crc32(data),local=new Uint8Array([...u32(0x04034b50),...u16(20),...u16(0),...u16(0),...u16(0),...u16(0),...u32(crc),...u32(data.length),...u32(data.length),...u16(name.length),...u16(0),...name]);chunks.push(local,data);central.push(new Uint8Array([...u32(0x02014b50),...u16(20),...u16(20),...u16(0),...u16(0),...u16(0),...u16(0),...u32(crc),...u32(data.length),...u32(data.length),...u16(name.length),...u16(0),...u16(0),...u16(0),...u16(0),...u32(0),...u32(off),...name]));off+=local.length+data.length}let co=off,cs=central.reduce((s,c)=>s+c.length,0);chunks.push(...central,new Uint8Array([...u32(0x06054b50),...u16(0),...u16(0),...u16(entries.length),...u16(entries.length),...u32(cs),...u32(co),...u16(0)]));return new Blob(chunks,{type:"application/zip"})}
async function pngBytes(d,size=RES){let c=document.createElement("canvas");c.width=c.height=size;let x=c.getContext("2d");x.imageSmoothingEnabled=false;x.drawImage(imageDataCanvas(d),0,0,size,size);let b=await new Promise(r=>c.toBlob(r,"image/png"));return new Uint8Array(await b.arrayBuffer())}
$("exportAssets").onclick=async()=>{let a=audit();if(!a.pass)return;let e=[{name:"Body/Brown_Genesis.png",data:await pngBytes(state.genesis)}];for(const t of state.traits){e.push({name:`${t.category}/${safe(t.name)}.png`,data:await pngBytes(decodeData(t.data))});if(t.mask)e.push({name:`masks/${t.category}/${safe(t.name)}_mask.png`,data:await pngBytes(decodeData(t.mask))})}e.push({name:"metadata/project.json",data:sb(JSON.stringify(projectObject(),null,2))});dl(zip(e),"APE16_GENERATOR_ASSETS.zip")};
$("exportPlan").onclick=()=>{let a=audit();if(!a.pass)return;let e=[],items=a.plan.items;items.forEach((c,i)=>{let attrs=c.map(t=>({trait_type:t.category,value:t.name}));let meta={name:`APE16 #${i+1}`,description:"APE16",image:`${i+1}.png`,attributes:attrs};e.push({name:`metadata/${i+1}.json`,data:sb(JSON.stringify(meta,null,2))})});let manifest=items.map((c,i)=>({token:i+1,traits:c.map(t=>({category:t.category,name:t.name}))}));e.push({name:"combination_plan.json",data:sb(JSON.stringify(manifest,null,2))});dl(zip(e),"APE16_3333_METADATA_PLAN.zip")};
function selfTest(){
 let r={};const ok=(n,v)=>r[n]=!!v;let d=new ImageData(RES,RES);d.data[3]=255;ok("64x64 cell count",d.data.length===64*64*4);ok("alpha audit",auditData(d).pass);d.data[7]=127;ok("partial alpha rejected",!auditData(d).pass);ok("4096 integer scale",4096%RES===0&&4096/RES===64);ok("layer order",LAYERS.join(">")==="Background>Body>Clothing>Mouth>Eyes>Headwear>Accessories");let z=zip([{name:"a.txt",data:sb("x")}]);ok("zip writer",z.size>50&&z.type==="application/zip");let rr=rng("same"),aa=[rr(),rr()],rr2=rng("same");ok("deterministic RNG",aa[0]===rr2()&&aa[1]===rr2());let pass=Object.values(r).every(Boolean);$("selftest").textContent=`SELFTEST: ${pass?"PASS":"FAIL"} · ${Object.keys(r).length} checks`;return {pass,r}
}
loadGenesis();renderLibrary();selfTest();
})();