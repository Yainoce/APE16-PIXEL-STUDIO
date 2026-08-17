
(() => {
"use strict";

const VERSION="8.0.0";
const LAYER_ORDER=["Background","Body","Clothing","Mouth","Eyes","Headwear","Accessories"];
const ANCHOR_RATIOS={
  head:[0.50,0.14],leftEye:[0.41,0.40],rightEye:[0.59,0.40],
  leftEar:[0.27,0.48],rightEar:[0.73,0.48],mouth:[0.50,0.61],
  neck:[0.50,0.74],shoulders:[0.50,0.88]
};
function anchorsForResolution(n){
  const out={};
  for(const [k,[rx,ry]] of Object.entries(ANCHOR_RATIOS)){
    out[k]=[Math.round(rx*(n-1)),Math.round(ry*(n-1))];
  }
  return out;
}
const STORAGE_KEY="APE16_STUDIO_V7_AUTOSAVE";
const SNAPSHOT_KEY="APE16_STUDIO_V8_MANUAL_SNAPSHOT";
const HISTORY_KEY="APE16_STUDIO_V8_AUTOSAVE_HISTORY";
const $=id=>document.getElementById(id);

const state={
  page:"setup",
  projectName:"APE16",
  supply:3333,
  resolution:64,
  resolutionLocked:false,
  reference:{img:null,dataURL:null,scale:100,x:0,y:0,opacity:55,locked:false},
  genesis:{cells:[],locked:false,revision:1,palette:["#000000","#5b1908","#8a2c0f","#bd4c18","#f2a534","#ffd078","#ffffff"]},
  history:[],redo:[],
  tool:"pencil",color:"#000000",showGrid:true,showReference:true,genesisCellSize:8,traitCellSize:8,
  traitReference:{img:null,dataURL:null,scale:100,x:0,y:0,opacity:55,locked:false},
  workingTrait:null,
  traitHistory:[],traitRedo:[],traitTool:"pencil",
  traits:[],
  autosaveTimer:null
};

function makeCells(n){return new Array(n*n).fill(null)}
function idx(x,y,n=state.resolution){return y*n+x}
function cloneColor(c){return c?c.slice():null}
function rgbaCss(c){return c?`rgba(${c[0]},${c[1]},${c[2]},${(c[3]??255)/255})`:"rgba(0,0,0,0)"}
function hexToRgba(hex){
  const h=hex.replace("#","");
  const v=parseInt(h,16);
  return [(v>>16)&255,(v>>8)&255,v&255,255];
}
function rgbaToHex(c){return "#"+c.slice(0,3).map(v=>v.toString(16).padStart(2,"0")).join("")}
function safeName(s){return (s||"Trait").trim().replace(/[^a-z0-9]+/gi,"_").replace(/^_+|_+$/g,"")||"Trait"}
function setStatus(text,cls="ok"){$("saveState").textContent=text;$("saveState").className="pill "+cls}
function downloadBlob(blob,name){
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;
  document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1500);
}

function currentCanvasCells(){
  return state.page==="traits" && state.workingTrait ? state.workingTrait.cells : state.genesis.cells;
}

function initCellsForResolution(n){
  state.genesis.cells=makeCells(n);
  state.history=[];state.redo=[];
  if(state.workingTrait){
    state.workingTrait.cells=makeCells(n);
    state.workingTrait.mask=new Array(n*n).fill(false);
  }
}

function setPage(page){
  const target=$("page-"+page);
  if(!target){
    const s=$("startupStatus");
    if(s)s.textContent=`Navigation error: missing page-${page}`;
    return false;
  }
  state.page=page;
  document.querySelectorAll(".page").forEach(p=>p.classList.add("hidden"));
  target.classList.remove("hidden");
  document.querySelectorAll(".flowStep").forEach(b=>b.classList.toggle("active",b.dataset.page===page));
  if(page==="genesis") drawEditor();
  if(page==="traits"){drawTraitEditor();refreshTraitPreviews();renderAssetLibrary()}
  if(page==="export") updateExportAudit(false);
  return true;
}
document.querySelectorAll(".flowStep").forEach(b=>b.onclick=()=>setPage(b.dataset.page));

function loadImageFromDataURL(dataURL,cb){
  const im=new Image();im.onload=()=>cb(im);im.src=dataURL;
}
function fileToDataURL(file,cb){
  const r=new FileReader();r.onload=()=>cb(r.result);r.readAsDataURL(file);
}

async function loadBuiltInReference(){
  try{
    const r=await fetch("brown_reference.png",{cache:"no-store"});
    const blob=await r.blob();
    const fr=new FileReader();
    fr.onload=()=>setReference(fr.result);
    fr.readAsDataURL(blob);
  }catch(e){
    $("refStatus").textContent="Could not load built-in reference. Choose the PNG manually.";
  }
}
function setReference(dataURL){
  state.reference.dataURL=dataURL;
  loadImageFromDataURL(dataURL,img=>{
    state.reference.img=img || null;
    $("refStatus").textContent=img ? `Reference loaded · ${img.width}×${img.height}` : "Reference load failed.";
    renderResolutionPreviews();
    drawEditor();
    scheduleAutosave();
  });
}
$("loadBuiltInRef").onclick=loadBuiltInReference;
$("referenceFile").onchange=e=>{const f=e.target.files[0];if(f)fileToDataURL(f,setReference)};

function renderResolutionPreviews(){
  document.querySelectorAll(".resCard").forEach(card=>{
    const n=Number(card.dataset.res),c=card.querySelector("canvas"),x=c.getContext("2d");
    x.clearRect(0,0,c.width,c.height);x.imageSmoothingEnabled=false;
    if(!state.reference || !state.reference.img || !state.reference.img.width)return;
    const tmp=document.createElement("canvas");tmp.width=tmp.height=n;
    const tx=tmp.getContext("2d");tx.imageSmoothingEnabled=false;
    fitReference(tx,state.reference.img,n,state.reference.scale,state.reference.x,state.reference.y,1);
    x.drawImage(tmp,0,0,c.width,c.height);
  });
}
document.querySelectorAll(".resCard").forEach(card=>card.onclick=()=>{
  if(state.resolutionLocked)return;
  document.querySelectorAll(".resCard").forEach(x=>x.classList.remove("selected"));
  card.classList.add("selected");state.resolution=Number(card.dataset.res);
  $("resolutionStatus").textContent=`Selected: ${state.resolution}×${state.resolution} · 4K scale ×${4096/state.resolution}`;
});
$("lockResolution").onclick=()=>{
  if(state.resolutionLocked)return;
  state.resolutionLocked=true;initCellsForResolution(state.resolution);
  $("resolutionStatus").textContent=`LOCKED: ${state.resolution}×${state.resolution} · exact 4K ×${4096/state.resolution}`;
  $("lockResolution").disabled=true;document.querySelectorAll(".resCard").forEach(x=>x.disabled=true);
  drawEditor();scheduleAutosave();
};

function fitReference(ctx,img,n,scalePct,xOff,yOff,alpha){
  if(!img || !img.width || !img.height) return false;
  const s=(scalePct/100)*Math.min(n/img.width,n/img.height);
  const w=img.width*s,h=img.height*s;
  const x=(n-w)/2+xOff,y=(n-h)/2+yOff;
  ctx.globalAlpha=alpha;
  ctx.imageSmoothingEnabled=false;
  ctx.drawImage(img,x,y,w,h);
  ctx.globalAlpha=1;
  return true;
}
["refScale","refOpacity","refX","refY"].forEach(id=>{
  $(id).oninput=e=>{
    if(state.reference.locked){e.target.value=id==="refScale"?state.reference.scale:id==="refOpacity"?state.reference.opacity:id==="refX"?state.reference.x:state.reference.y;return}
    const v=Number(e.target.value);
    if(id==="refScale")state.reference.scale=v;
    if(id==="refOpacity")state.reference.opacity=v;
    if(id==="refX")state.reference.x=v;
    if(id==="refY")state.reference.y=v;
    $("refScaleOut").textContent=state.reference.scale+"%";$("refOpacityOut").textContent=state.reference.opacity+"%";
    $("refXOut").textContent=state.reference.x;$("refYOut").textContent=state.reference.y;
    renderResolutionPreviews();drawEditor();scheduleAutosave();
  }
});
$("lockReference").onclick=()=>{
  if(!state.reference.img){$("referenceLockStatus").textContent="Load a reference first.";return}
  state.reference.locked=true;$("lockReference").disabled=true;$("unlockReference").disabled=false;
  $("referenceLockStatus").textContent=`LOCKED · ${state.reference.scale}% · X ${state.reference.x} · Y ${state.reference.y}`;
  scheduleAutosave();
};
$("unlockReference").onclick=()=>{state.reference.locked=false;$("lockReference").disabled=false;$("unlockReference").disabled=true;$("referenceLockStatus").textContent="Reference unlocked"};

function snapshot(cells){return cells.map(cloneColor)}
function pushHistory(kind){
  if(kind==="trait"){state.traitHistory.push(snapshot(state.workingTrait.cells));if(state.traitHistory.length>60)state.traitHistory.shift();state.traitRedo=[]}
  else{state.history.push(snapshot(state.genesis.cells));if(state.history.length>60)state.history.shift();state.redo=[]}
}

function configureLogicalCanvas(canvas,cellSize){
  const n=state.resolution;
  const px=n*cellSize;
  if(canvas.width!==px)canvas.width=px;
  if(canvas.height!==px)canvas.height=px;
  canvas.style.width=px+"px";
  canvas.style.height=px+"px";
}

function drawGridCanvas(canvas,cells,reference,mask=null,compositeBase=null,cellSize=10){
  const n=state.resolution;
  configureLogicalCanvas(canvas,cellSize);
  const ctx=canvas.getContext("2d");
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.imageSmoothingEnabled=false;

  if(reference && state.showReference){
    const tmp=document.createElement("canvas");
    tmp.width=tmp.height=n;
    const tx=tmp.getContext("2d");
    tx.imageSmoothingEnabled=false;
    fitReference(tx,reference.img,n,reference.scale,reference.x,reference.y,(reference.opacity??55)/100);
    ctx.drawImage(tmp,0,0,n,n,0,0,n*cellSize,n*cellSize);
  }

  if(compositeBase){
    for(let y=0;y<n;y++)for(let x=0;x<n;x++){
      const i=idx(x,y,n);
      if(mask&&mask[i])continue;
      const c=compositeBase[i];
      if(!c)continue;
      ctx.fillStyle=rgbaCss(c);
      ctx.fillRect(x*cellSize,y*cellSize,cellSize,cellSize);
    }
  }

  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    const c=cells[idx(x,y,n)];
    if(!c)continue;
    ctx.fillStyle=rgbaCss(c);
    ctx.fillRect(x*cellSize,y*cellSize,cellSize,cellSize);
  }

  if(mask){
    ctx.fillStyle="rgba(255,0,150,.22)";
    for(let y=0;y<n;y++)for(let x=0;x<n;x++){
      if(mask[idx(x,y,n)])ctx.fillRect(x*cellSize,y*cellSize,cellSize,cellSize);
    }
  }

  if(state.showGrid){
    ctx.strokeStyle="rgba(255,255,255,.28)";
    ctx.lineWidth=1;
    ctx.beginPath();
    for(let i=0;i<=n;i++){
      const p=i*cellSize+.5;
      ctx.moveTo(p,0);ctx.lineTo(p,n*cellSize);
      ctx.moveTo(0,p);ctx.lineTo(n*cellSize,p);
    }
    ctx.stroke();
  }
}
function drawEditor(){
  drawGridCanvas($("editorCanvas"),state.genesis.cells,state.reference,null,null,state.genesisCellSize);
}
function drawTraitEditor(){
  const c=$("traitEditorCanvas");
  configureLogicalCanvas(c,state.traitCellSize);
  if(!state.workingTrait){c.getContext("2d").clearRect(0,0,c.width,c.height);return}
  drawGridCanvas(c,state.workingTrait.cells,state.traitReference,state.workingTrait.mask,state.genesis.cells,state.traitCellSize);
}
function eventCell(e,canvas){
  const r=canvas.getBoundingClientRect();
  const cellSize = canvas.id==="traitEditorCanvas" ? state.traitCellSize : state.genesisCellSize;
  const scaleX=canvas.width/r.width;
  const scaleY=canvas.height/r.height;
  const localX=(e.clientX-r.left)*scaleX;
  const localY=(e.clientY-r.top)*scaleY;
  const x=Math.floor(localX/cellSize);
  const y=Math.floor(localY/cellSize);
  return {
    x:Math.max(0,Math.min(state.resolution-1,x)),
    y:Math.max(0,Math.min(state.resolution-1,y))
  };
}

function sampleReferenceAtCell(reference,x,y){
  if(!reference.img)return null;
  const n=state.resolution,tmp=document.createElement("canvas");tmp.width=tmp.height=n;
  const tx=tmp.getContext("2d",{willReadFrequently:true});tx.imageSmoothingEnabled=false;
  fitReference(tx,reference.img,n,reference.scale,reference.x,reference.y,1);
  const d=tx.getImageData(x,y,1,1).data;
  return d[3]===0?null:[d[0],d[1],d[2],255];
}
function colorDistanceSq(a,b){
  const dr=a[0]-b[0],dg=a[1]-b[1],db=a[2]-b[2];
  return dr*dr+dg*dg+db*db;
}
function nearestPaletteColor(rgb){
  const palette=(state.genesis.palette||[]).map(hexToRgba);
  if(!palette.length)return [rgb[0],rgb[1],rgb[2],255];
  let best=palette[0],bestD=Infinity;
  for(const p of palette){const d=colorDistanceSq(rgb,p);if(d<bestD){bestD=d;best=p}}
  return best.slice();
}
function isNeutralLight(rgb){
  const [r,g,b]=rgb;
  const hi=Math.max(r,g,b),lo=Math.min(r,g,b);
  return (hi-lo)<=30 && (r+g+b)/3>=172;
}
function buildEdgeBackgroundMask(image,n){
  const candidate=new Uint8Array(n*n);
  const bg=new Uint8Array(n*n);
  for(let p=0;p<n*n;p++){
    const i=p*4;
    if(image[i+3]<128){candidate[p]=1;continue;}
    if(isNeutralLight([image[i],image[i+1],image[i+2]]))candidate[p]=1;
  }

  const q=[];
  const push=(x,y)=>{
    const p=y*n+x;
    if(candidate[p]&&!bg[p]){bg[p]=1;q.push(p);}
  };
  for(let x=0;x<n;x++){push(x,0);push(x,n-1);}
  for(let y=0;y<n;y++){push(0,y);push(n-1,y);}

  for(let qi=0;qi<q.length;qi++){
    const p=q[qi],x=p%n,y=Math.floor(p/n);
    if(x>0)push(x-1,y);
    if(x<n-1)push(x+1,y);
    if(y>0)push(x,y-1);
    if(y<n-1)push(x,y+1);
  }
  return bg;
}
function traceReferenceToGrid(){
  if(state.genesis.locked){$("traceStatus").textContent="Genesis is locked. Create a revision before retracing.";return false;}
  if(!state.resolutionLocked){$("traceStatus").textContent="Lock the logical resolution before tracing.";return false;}
  if(!state.reference||!state.reference.img){$("traceStatus").textContent="Load the Brown reference before tracing.";return false;}

  pushHistory("genesis");
  const n=state.resolution,tmp=document.createElement("canvas");
  tmp.width=tmp.height=n;
  const tx=tmp.getContext("2d",{willReadFrequently:true});
  tx.clearRect(0,0,n,n);tx.imageSmoothingEnabled=false;
  fitReference(tx,state.reference.img,n,state.reference.scale,state.reference.x,state.reference.y,1);

  const image=tx.getImageData(0,0,n,n).data;
  const bgMask=buildEdgeBackgroundMask(image,n);
  const next=makeCells(n);
  let painted=0,bgRemoved=0,alphaRemoved=0;

  for(let p=0;p<n*n;p++){
    const i=p*4;
    if(bgMask[p]){bgRemoved++;continue;}
    if(image[i+3]<128){alphaRemoved++;continue;}
    next[p]=nearestPaletteColor([image[i],image[i+1],image[i+2],255]);
    painted++;
  }

  state.genesis.cells=next;
  const transparent=n*n-painted;
  $("traceStatus").textContent=`TRACE PASS · ${painted} ape cells · ${transparent} transparent · ${n}×${n} · palette snapped`;
  $("traceMetrics").textContent=`Edge background removed ${bgRemoved} · alpha removed ${alphaRemoved}`;
  drawEditor();scheduleAutosave();
  return painted>0 && painted<n*n;
}

function floodFill(cells,x,y,newColor){
  const n=state.resolution,start=idx(x,y,n),old=cells[start];
  const eq=(a,b)=>a===b||(!a&&!b)||(a&&b&&a[0]===b[0]&&a[1]===b[1]&&a[2]===b[2]&&(a[3]??255)===(b[3]??255));
  if(eq(old,newColor))return;
  const q=[[x,y]],seen=new Uint8Array(n*n);
  while(q.length){
    const [cx,cy]=q.pop(),i=idx(cx,cy,n);if(seen[i]||!eq(cells[i],old))continue;seen[i]=1;cells[i]=cloneColor(newColor);
    if(cx>0)q.push([cx-1,cy]);if(cx<n-1)q.push([cx+1,cy]);if(cy>0)q.push([cx,cy-1]);if(cy<n-1)q.push([cx,cy+1]);
  }
}
function applyGenesisTool(x,y,first=false){
  if(state.genesis.locked)return;
  const i=idx(x,y);if(first)pushHistory("genesis");
  if(state.tool==="pencil")state.genesis.cells[i]=hexToRgba(state.color);
    if(state.tool==="eraser")state.genesis.cells[i]=null;
  if(state.tool==="eyedropper"){const c=state.genesis.cells[i];if(c){state.color=rgbaToHex(c);$("colorPicker").value=state.color;renderPalette()}}
  if(state.tool==="fill")floodFill(state.genesis.cells,x,y,hexToRgba(state.color));
  drawEditor();scheduleAutosave();
}

let drawing=false,lastCell="";
$("editorCanvas").addEventListener("pointerdown",e=>{drawing=true;$("editorCanvas").setPointerCapture(e.pointerId);const p=eventCell(e,$("editorCanvas"));lastCell=p.x+","+p.y;applyGenesisTool(p.x,p.y,true)});
$("editorCanvas").addEventListener("pointermove",e=>{const p=eventCell(e,$("editorCanvas"));$("cursorInfo").textContent=`x: ${p.x} · y: ${p.y} · cell ${idx(p.x,p.y)}`;if(drawing&&["pencil","eraser"].includes(state.tool)&&lastCell!==p.x+","+p.y){lastCell=p.x+","+p.y;applyGenesisTool(p.x,p.y,false)}});
window.addEventListener("pointerup",()=>drawing=false);
document.querySelectorAll(".tool").forEach(b=>b.onclick=()=>{state.tool=b.dataset.tool;document.querySelectorAll(".tool").forEach(x=>x.classList.toggle("active",x===b))});
$("undoBtn").onclick=()=>{if(!state.history.length)return;state.redo.push(snapshot(state.genesis.cells));state.genesis.cells=state.history.pop();drawEditor();scheduleAutosave()};
$("redoBtn").onclick=()=>{if(!state.redo.length)return;state.history.push(snapshot(state.genesis.cells));state.genesis.cells=state.redo.pop();drawEditor();scheduleAutosave()};
$("toggleGrid").onclick=()=>{state.showGrid=!state.showGrid;$("toggleGrid").textContent=state.showGrid?"Grid ON":"Grid OFF";drawEditor();drawTraitEditor()};
$("toggleReference").onclick=()=>{state.showReference=!state.showReference;$("toggleReference").textContent=state.showReference?"Reference ON":"Reference OFF";drawEditor();drawTraitEditor()};
$("traceReferenceAll").onclick=()=>{const ok=traceReferenceToGrid();if(ok)$("validateGenesis").click();};
$("genesisCellSize").onchange=e=>{
  state.genesisCellSize=Number(e.target.value);
  drawEditor();
};
$("traitCellSize").onchange=e=>{
  state.traitCellSize=Number(e.target.value);
  drawTraitEditor();
};
function bestCellSizeForViewport(viewport){
  const n=state.resolution;
  const w=Math.max(320,(viewport?.clientWidth||window.innerWidth)-8);
  const h=Math.max(320,window.innerHeight*0.64);
  const raw=Math.floor(Math.min(w,h)/n);
  const allowed=[4,6,8,10,14];
  let best=4;
  for(const v of allowed)if(v<=raw)best=v;
  return best;
}
$("fitGenesisScreen").onclick=()=>{
  state.genesisCellSize=bestCellSizeForViewport($("genesisViewport"));
  $("genesisCellSize").value=String(state.genesisCellSize);
  drawEditor();
};
$("fitTraitScreen").onclick=()=>{
  state.traitCellSize=bestCellSizeForViewport($("traitViewport"));
  $("traitCellSize").value=String(state.traitCellSize);
  drawTraitEditor();
};

$("colorPicker").oninput=e=>{state.color=e.target.value;if(!state.genesis.palette.includes(state.color))state.genesis.palette.push(state.color);renderPalette()};
$("addPaletteColor").onclick=()=>{if(!state.genesis.palette.includes(state.color))state.genesis.palette.push(state.color);renderPalette()};
function renderPalette(){
  const host=$("palette");host.innerHTML="";
  for(const c of state.genesis.palette){const b=document.createElement("button");b.className="swatch"+(c===state.color?" active":"");b.style.background=c;b.title=c;b.onclick=()=>{state.color=c;$("colorPicker").value=c;renderPalette()};host.appendChild(b)}
}
renderPalette();

function validateCells(cells,{allowEmpty=false}={}){
  const issues=[],n=state.resolution;
  let painted=0,partial=0,isolated=0;
  for(let i=0;i<cells.length;i++)if(cells[i]){painted++;if((cells[i][3]??255)!==255)partial++}
  for(let i=0;i<cells.length;i++){
    if(!cells[i])continue;const x=i%n,y=Math.floor(i/n);let neighbors=0;
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){if(!dx&&!dy)continue;const xx=x+dx,yy=y+dy;if(xx>=0&&yy>=0&&xx<n&&yy<n&&cells[idx(xx,yy,n)])neighbors++}
    if(!neighbors)isolated++;
  }
  if(!allowEmpty&&!painted)issues.push("No painted cells.");
  if(partial)issues.push(`${partial} partial-alpha cells.`);
  if(isolated)issues.push(`${isolated} isolated cells (review; may be intentional).`);
  return {pass:painted>0&&partial===0,painted,partial,isolated,issues};
}
$("validateGenesis").onclick=()=>{
  const v=validateCells(state.genesis.cells);const el=$("genesisValidation");
  el.className="validation "+(v.pass?"pass":"fail");
  el.textContent=(v.pass?"HARD RULES PASS":"VALIDATION FAIL")+`\nPainted: ${v.painted} / ${state.resolution**2}\nPartial alpha: ${v.partial}\nIsolated: ${v.isolated}`+(v.issues.length?"\n"+v.issues.join("\n"):"");
};
$("approveGenesis").onclick=()=>{
  const v=validateCells(state.genesis.cells);if(!v.pass){$("validateGenesis").click();return}
  state.genesis.locked=true;$("genesisLockBadge").textContent="APPROVED + LOCKED";$("genesisLockBadge").className="pill ok";
  $("approveGenesis").disabled=true;$("createGenesisRevision").disabled=false;writeAutosaveNow();
};
$("createGenesisRevision").onclick=()=>{state.genesis.locked=false;state.genesis.revision++;$("genesisLockBadge").textContent=`REVISION ${state.genesis.revision}`;$("genesisLockBadge").className="pill warn";$("approveGenesis").disabled=false;$("createGenesisRevision").disabled=true;writeAutosaveNow()};

function cellsCanvas(cells,n=state.resolution){
  const c=document.createElement("canvas");c.width=c.height=n;const x=c.getContext("2d");x.imageSmoothingEnabled=false;
  for(let i=0;i<cells.length;i++){const v=cells[i];if(!v)continue;x.fillStyle=rgbaCss(v);x.fillRect(i%n,Math.floor(i/n),1,1)}
  return c;
}
function maskCanvas(mask,n=state.resolution){
  const c=document.createElement("canvas");c.width=c.height=n;const x=c.getContext("2d");
  x.fillStyle="#fff";for(let i=0;i<mask.length;i++)if(mask[i])x.fillRect(i%n,Math.floor(i/n),1,1);return c;
}
function canvasBlob(canvas){return new Promise(res=>canvas.toBlob(res,"image/png"))}
async function exportCells(cells,size,name){
  const src=cellsCanvas(cells),out=document.createElement("canvas");out.width=out.height=size;const x=out.getContext("2d");x.imageSmoothingEnabled=false;x.drawImage(src,0,0,size,size);downloadBlob(await canvasBlob(out),name)
}
$("exportGenesisLogical").onclick=()=>exportCells(state.genesis.cells,state.resolution,`APE16_Brown_Genesis_${state.resolution}x${state.resolution}.png`);
$("exportGenesis4k").onclick=()=>exportCells(state.genesis.cells,4096,"APE16_Brown_Genesis_4096x4096.png");

function setTraitReference(dataURL){
  state.traitReference.dataURL=dataURL;
  loadImageFromDataURL(dataURL,img=>{
    state.traitReference.img=img || null;
    drawTraitEditor();
    scheduleAutosave();
  });
}
$("traitReferenceFile").onchange=e=>{const f=e.target.files[0];if(f)fileToDataURL(f,setTraitReference)};
["traitRefScale","traitRefOpacity","traitRefX","traitRefY"].forEach(id=>{
  $(id).oninput=e=>{
    if(state.traitReference.locked){
      e.target.value=id==="traitRefScale"?state.traitReference.scale:id==="traitRefOpacity"?state.traitReference.opacity:id==="traitRefX"?state.traitReference.x:state.traitReference.y;
      return;
    }
    const v=Number(e.target.value);
    if(id==="traitRefScale")state.traitReference.scale=v;
    if(id==="traitRefOpacity")state.traitReference.opacity=v;
    if(id==="traitRefX")state.traitReference.x=v;
    if(id==="traitRefY")state.traitReference.y=v;
    $("traitRefScaleOut").textContent=state.traitReference.scale+"%";
    $("traitRefOpacityOut").textContent=state.traitReference.opacity+"%";
    $("traitRefXOut").textContent=state.traitReference.x;
    $("traitRefYOut").textContent=state.traitReference.y;
    drawTraitEditor();scheduleAutosave();
  }
});
$("lockTraitReference").onclick=()=>{
  if(!state.traitReference.img){$("traitRefLockStatus").textContent="Load a trait reference first.";return}
  state.traitReference.locked=true;$("lockTraitReference").disabled=true;$("unlockTraitReference").disabled=false;
  $("traitRefLockStatus").textContent=`LOCKED · ${state.traitReference.scale}% · X ${state.traitReference.x} · Y ${state.traitReference.y}`;
  scheduleAutosave();
};
$("unlockTraitReference").onclick=()=>{
  state.traitReference.locked=false;$("lockTraitReference").disabled=false;$("unlockTraitReference").disabled=true;
  $("traitRefLockStatus").textContent="Trait reference unlocked";
};

$("newTrait").onclick=()=>{
  if(!state.genesis.locked){$("traitValidation").className="validation fail";$("traitValidation").textContent="Lock Brown Genesis before creating traits.";return}
  const name=$("traitName").value.trim();if(!name){$("traitValidation").className="validation fail";$("traitValidation").textContent="Enter a trait name first.";return}
  state.workingTrait={category:$("traitCategory").value,name,weight:Number($("traitWeight").value)||1,allowEmpty:$("allowEmptyTrait").checked,revision:1,cells:makeCells(state.resolution),mask:new Array(state.resolution**2).fill(false),approved:false};
  state.traitHistory=[];state.traitRedo=[];$("reviewConfirmed").checked=false;$("approveTrait").disabled=true;drawTraitEditor();refreshTraitPreviews();$("traitValidation").className="validation";$("traitValidation").textContent="Working trait created. Draw directly on the logical grid.";scheduleAutosave();
};

function applyTraitTool(x,y,first=false){
  const t=state.workingTrait;if(!t||t.approved)return;const i=idx(x,y);
  if(first){state.traitHistory.push({cells:snapshot(t.cells),mask:t.mask.slice()});if(state.traitHistory.length>60)state.traitHistory.shift();state.traitRedo=[]}
  if(state.traitTool==="pencil")t.cells[i]=hexToRgba(state.color);
  if(state.traitTool==="trace"){const c=sampleReferenceAtCell(state.traitReference,x,y);if(c)t.cells[i]=c}
  if(state.traitTool==="eraser")t.cells[i]=null;
  if(state.traitTool==="eyedropper"){const c=t.cells[i];if(c){state.color=rgbaToHex(c);$("colorPicker").value=state.color;renderPalette()}}
  if(state.traitTool==="fill")floodFill(t.cells,x,y,hexToRgba(state.color));
  if(state.traitTool==="mask")t.mask[i]=true;
  if(state.traitTool==="unmask")t.mask[i]=false;
  drawTraitEditor();refreshTraitPreviews();scheduleAutosave();
}
let traitDrawing=false,traitLast="";
$("traitEditorCanvas").addEventListener("pointerdown",e=>{traitDrawing=true;$("traitEditorCanvas").setPointerCapture(e.pointerId);const p=eventCell(e,$("traitEditorCanvas"));traitLast=p.x+","+p.y;applyTraitTool(p.x,p.y,true)});
$("traitEditorCanvas").addEventListener("pointermove",e=>{const p=eventCell(e,$("traitEditorCanvas"));$("traitCursorInfo").textContent=`x: ${p.x} · y: ${p.y} · cell ${idx(p.x,p.y)}`;if(traitDrawing&&["pencil","trace","eraser","mask","unmask"].includes(state.traitTool)&&traitLast!==p.x+","+p.y){traitLast=p.x+","+p.y;applyTraitTool(p.x,p.y,false)}});
window.addEventListener("pointerup",()=>traitDrawing=false);
document.querySelectorAll(".traitTool").forEach(b=>b.onclick=()=>{state.traitTool=b.dataset.traitTool;document.querySelectorAll(".traitTool").forEach(x=>x.classList.toggle("active",x===b))});
$("traitUndo").onclick=()=>{if(!state.workingTrait||!state.traitHistory.length)return;state.traitRedo.push({cells:snapshot(state.workingTrait.cells),mask:state.workingTrait.mask.slice()});const h=state.traitHistory.pop();state.workingTrait.cells=h.cells;state.workingTrait.mask=h.mask;drawTraitEditor();refreshTraitPreviews();scheduleAutosave()};
$("traitRedo").onclick=()=>{if(!state.workingTrait||!state.traitRedo.length)return;state.traitHistory.push({cells:snapshot(state.workingTrait.cells),mask:state.workingTrait.mask.slice()});const h=state.traitRedo.pop();state.workingTrait.cells=h.cells;state.workingTrait.mask=h.mask;drawTraitEditor();refreshTraitPreviews();scheduleAutosave()};

function renderToCanvas(canvas,cells,base=null,mask=null,category=null){
  const n=state.resolution,x=canvas.getContext("2d");x.clearRect(0,0,canvas.width,canvas.height);x.imageSmoothingEnabled=false;
  const logical=document.createElement("canvas");logical.width=logical.height=n;const lx=logical.getContext("2d");lx.imageSmoothingEnabled=false;
  const drawCells=(arr)=>{for(let i=0;i<arr.length;i++){const v=arr[i];if(!v)continue;lx.fillStyle=rgbaCss(v);lx.fillRect(i%n,Math.floor(i/n),1,1)}};
  if(category==="Background"){drawCells(cells);if(base)drawCells(base)}
  else{
    if(base){for(let i=0;i<base.length;i++){if(mask&&mask[i])continue;const v=base[i];if(!v)continue;lx.fillStyle=rgbaCss(v);lx.fillRect(i%n,Math.floor(i/n),1,1)}}
    drawCells(cells);
  }
  x.drawImage(logical,0,0,canvas.width,canvas.height);
}
function refreshTraitPreviews(){
  if(!state.workingTrait){["traitOnlyPreview","compositePreview"].forEach(id=>{const c=$(id);c.getContext("2d").clearRect(0,0,c.width,c.height)});return}
  renderToCanvas($("traitOnlyPreview"),state.workingTrait.cells);
  renderToCanvas($("compositePreview"),state.workingTrait.cells,state.genesis.cells,state.workingTrait.mask,state.workingTrait.category);
}
function validateWorkingTrait(){
  if(!state.workingTrait)return {pass:false,msg:"No working trait."};
  const allowEmpty=!!state.workingTrait.allowEmpty;
  const v=validateCells(state.workingTrait.cells,{allowEmpty});
  const pass=allowEmpty ? v.partial===0 : v.pass;
  if(!pass)return {pass:false,msg:`FAIL\nPainted: ${v.painted}\nPartial alpha: ${v.partial}\n${v.issues.join("\n")}`};
  return {pass:true,msg:`PASS\n${state.workingTrait.category} / ${state.workingTrait.name}${allowEmpty?" · intentional empty allowed":""}\nPainted cells: ${v.painted}\nMask cells: ${state.workingTrait.mask.filter(Boolean).length}\nCanvas: ${state.resolution}×${state.resolution}`};
}
$("validateTrait").onclick=()=>{const v=validateWorkingTrait();$("traitValidation").className="validation "+(v.pass?"pass":"fail");$("traitValidation").textContent=v.msg;$("approveTrait").disabled=!(v.pass&&$("reviewConfirmed").checked)};
$("reviewConfirmed").onchange=()=>$("validateTrait").click();
$("approveTrait").onclick=()=>{
  const v=validateWorkingTrait();if(!v.pass||!$("reviewConfirmed").checked)return;
  const t=state.workingTrait;t.approved=true;
  const existing=state.traits.findIndex(x=>x.category===t.category&&x.name===t.name);
  const saved={category:t.category,name:t.name,weight:t.weight,allowEmpty:!!t.allowEmpty,revision:t.revision,cells:snapshot(t.cells),mask:t.mask.slice(),approved:true};
  if(existing>=0){saved.revision=state.traits[existing].revision+1;state.traits[existing]=saved}else state.traits.push(saved);
  $("approveTrait").disabled=true;$("exportTraitLogical").disabled=false;$("exportTrait4k").disabled=false;$("nextTrait").disabled=false;
  $("traitValidation").className="validation pass";$("traitValidation").textContent=`APPROVED + LOCKED\n${saved.category} / ${saved.name} · revision ${saved.revision}`;
  renderAssetLibrary();writeAutosaveNow();
};
$("nextTrait").onclick=()=>{$("traitName").value="";$("allowEmptyTrait").checked=false;state.workingTrait=null;state.traitReference={img:null,dataURL:null,scale:100,x:0,y:0,opacity:55,locked:false};$("traitReferenceFile").value="";$("reviewConfirmed").checked=false;["approveTrait","exportTraitLogical","exportTrait4k","nextTrait"].forEach(id=>$(id).disabled=true);drawTraitEditor();refreshTraitPreviews();$("traitValidation").className="validation";$("traitValidation").textContent="Ready for next trait."};
$("maskFromTrait").onclick=()=>{if(!state.workingTrait)return;pushTraitHistory();state.workingTrait.mask=state.workingTrait.cells.map(Boolean);drawTraitEditor();refreshTraitPreviews();scheduleAutosave()};
$("clearMask").onclick=()=>{if(!state.workingTrait)return;pushTraitHistory();state.workingTrait.mask.fill(false);drawTraitEditor();refreshTraitPreviews();scheduleAutosave()};
$("clearTrait").onclick=()=>{if(!state.workingTrait)return;pushTraitHistory();state.workingTrait.cells=makeCells(state.resolution);drawTraitEditor();refreshTraitPreviews();scheduleAutosave()};
function pushTraitHistory(){if(!state.workingTrait)return;state.traitHistory.push({cells:snapshot(state.workingTrait.cells),mask:state.workingTrait.mask.slice()});state.traitRedo=[]}
$("exportTraitLogical").onclick=()=>{const t=state.workingTrait;if(t)exportCells(t.cells,state.resolution,`${t.category}_${safeName(t.name)}_${state.resolution}x${state.resolution}.png`)};
$("exportTrait4k").onclick=()=>{const t=state.workingTrait;if(t)exportCells(t.cells,4096,`${t.category}_${safeName(t.name)}_4096x4096.png`)};

function renderAssetLibrary(){
  const host=$("assetLibrary");host.innerHTML="";
  $("traitCountBadge").textContent=`${state.traits.length} APPROVED`;
  if(!state.traits.length){host.innerHTML='<div class="muted">No approved traits yet.</div>';return}
  state.traits.slice().sort((a,b)=>LAYER_ORDER.indexOf(a.category)-LAYER_ORDER.indexOf(b.category)||a.name.localeCompare(b.name)).forEach(t=>{
    const row=document.createElement("div");row.className="assetRow";
    const i=state.traits.findIndex(x=>x.category===t.category&&x.name===t.name);
    row.innerHTML=`<b>${t.category}</b><span>${t.name}${t.allowEmpty?" · None":""}</span><span>w ${t.weight}</span><span>v${t.revision}</span>
      <span class="assetActions"><button data-revise="${i}">Revise</button><button data-delete="${i}" class="danger">Delete</button></span>`;
    host.appendChild(row);
  });
  host.querySelectorAll("[data-revise]").forEach(b=>b.onclick=()=>{
    const t=state.traits[Number(b.dataset.revise)];
    state.workingTrait={category:t.category,name:t.name,weight:t.weight,allowEmpty:!!t.allowEmpty,revision:t.revision+1,cells:snapshot(t.cells),mask:t.mask.slice(),approved:false};
    $("traitCategory").value=t.category;$("traitName").value=t.name;$("traitWeight").value=t.weight;$("allowEmptyTrait").checked=!!t.allowEmpty;
    $("reviewConfirmed").checked=false;["approveTrait","exportTraitLogical","exportTrait4k","nextTrait"].forEach(id=>$(id).disabled=true);
    drawTraitEditor();refreshTraitPreviews();$("traitValidation").className="validation";$("traitValidation").textContent=`Revision ${t.revision+1} working copy loaded. Original approved asset remains unchanged until re-approved.`;
  });
  host.querySelectorAll("[data-delete]").forEach(b=>b.onclick=()=>{
    const i=Number(b.dataset.delete),t=state.traits[i];
    if(!confirm(`Delete approved trait ${t.category} / ${t.name}?`))return;
    state.traits.splice(i,1);renderAssetLibrary();writeAutosaveNow();
  });
}
function sparseCells(cells){const out=[];for(let i=0;i<cells.length;i++)if(cells[i])out.push([i,cells[i]]);return out}
function inflateCells(sparse,n){const c=makeCells(n);for(const [i,v] of sparse||[])c[i]=v;return c}
function serializeProject(includeRefs=true){
  return {
    format:"APE16_STUDIO_V7",version:VERSION,savedAt:new Date().toISOString(),projectName:state.projectName,supply:state.supply,resolution:state.resolution,resolutionLocked:state.resolutionLocked,genesisCellSize:state.genesisCellSize,traitCellSize:state.traitCellSize,
    reference:{dataURL:includeRefs?state.reference.dataURL:null,scale:state.reference.scale,x:state.reference.x,y:state.reference.y,opacity:state.reference.opacity,locked:state.reference.locked},
    genesis:{cells:sparseCells(state.genesis.cells),locked:state.genesis.locked,revision:state.genesis.revision,palette:state.genesis.palette},
    traits:state.traits.map(t=>({category:t.category,name:t.name,weight:t.weight,allowEmpty:!!t.allowEmpty,revision:t.revision,cells:sparseCells(t.cells),mask:t.mask.map((v,i)=>v?i:-1).filter(i=>i>=0),approved:true}))
  };
}
function restoreProject(p){
  if(!p||!["APE16_STUDIO_V7","APE16_STUDIO_V8"].includes(p.format))throw new Error("Not a compatible APE16 Studio project.");

  state.projectName=p.projectName||"APE16";
  state.supply=Number(p.supply)||3333;
  state.resolution=[32,64,128].includes(Number(p.resolution))?Number(p.resolution):64;
  state.resolutionLocked=!!p.resolutionLocked;
  state.genesisCellSize=[4,6,8,10,14].includes(Number(p.genesisCellSize))?Number(p.genesisCellSize):8;
  state.traitCellSize=[4,6,8,10,14].includes(Number(p.traitCellSize))?Number(p.traitCellSize):8;
  if($("genesisCellSize"))$("genesisCellSize").value=String(state.genesisCellSize);
  if($("traitCellSize"))$("traitCellSize").value=String(state.traitCellSize);

  $("projectName").value=state.projectName;
  $("collectionSupply").value=state.supply;

  const ref=p.reference||{};
  state.reference={
    img:null,
    dataURL:ref.dataURL||null,
    scale:Number(ref.scale)||100,
    x:Number(ref.x)||0,
    y:Number(ref.y)||0,
    opacity:Number(ref.opacity)||55,
    locked:!!ref.locked
  };

  const g=p.genesis||{};
  state.genesis={
    cells:inflateCells(g.cells||[],state.resolution),
    locked:!!g.locked,
    revision:Number(g.revision)||1,
    palette:Array.isArray(g.palette)&&g.palette.length?g.palette:["#000000","#5b1908","#8a2c0f","#bd4c18","#f2a534","#ffd078","#ffffff"]
  };

  state.traits=(p.traits||[]).map(t=>({
    category:t.category||"Accessories",
    name:t.name||"Trait",
    weight:Number(t.weight)||1,
    allowEmpty:!!t.allowEmpty,
    revision:Number(t.revision)||1,
    cells:inflateCells(t.cells||[],state.resolution),
    mask:(()=>{
      const m=new Array(state.resolution**2).fill(false);
      for(const i of (t.mask||[])) if(Number.isInteger(i)&&i>=0&&i<m.length)m[i]=true;
      return m;
    })(),
    approved:true
  }));

  state.workingTrait=null;
  state.history=[];
  state.redo=[];
  state.traitHistory=[];
  state.traitRedo=[];

  $("resolutionStatus").textContent=state.resolutionLocked
    ? `LOCKED: ${state.resolution}×${state.resolution} · exact 4K ×${4096/state.resolution}`
    : `Selected: ${state.resolution}×${state.resolution} · 4K scale ×${4096/state.resolution}`;

  $("lockResolution").disabled=state.resolutionLocked;
  document.querySelectorAll(".resCard").forEach(x=>{
    x.disabled=state.resolutionLocked;
    x.classList.toggle("selected",Number(x.dataset.res)===state.resolution);
  });

  if(state.genesis.locked){
    $("genesisLockBadge").textContent="APPROVED + LOCKED";
    $("genesisLockBadge").className="pill ok";
    $("approveGenesis").disabled=true;
    $("createGenesisRevision").disabled=false;
  }else{
    $("genesisLockBadge").textContent="WORKING";
    $("genesisLockBadge").className="pill warn";
    $("approveGenesis").disabled=false;
    $("createGenesisRevision").disabled=true;
  }

  renderPalette();
  renderAssetLibrary();
  drawEditor();
  drawTraitEditor();
  refreshTraitPreviews();

  if(state.reference.dataURL){
    loadImageFromDataURL(state.reference.dataURL,img=>{
      state.reference.img=img||null;
      renderResolutionPreviews();
      drawEditor();
      const s=$("recoveryStatus");
      if(s)s.textContent=img ? "Autosave restored with reference." : "Autosave restored; reference image unavailable.";
    });
  }else{
    state.reference.img=null;
    renderResolutionPreviews();
    drawEditor();
    const s=$("recoveryStatus");
    if(s)s.textContent="Autosave restored; no embedded reference image.";
  }
}function projectFingerprint(p){
  const q=JSON.parse(JSON.stringify(p));delete q.savedAt;
  return JSON.stringify(q);
}
function readHistory(){
  try{const h=JSON.parse(localStorage.getItem(HISTORY_KEY)||"[]");return Array.isArray(h)?h:[]}catch(e){return []}
}
function writeAutosaveNow(){
  state.projectName=$("projectName").value||"APE16";
  state.supply=Number($("collectionSupply").value)||3333;
  let p;
  try{p=serializeProject(true)}
  catch(e){p=serializeProject(false)}
  try{
    const oldRaw=localStorage.getItem(STORAGE_KEY),old=oldRaw?JSON.parse(oldRaw):null;
    if(old && projectFingerprint(old)!==projectFingerprint(p)){
      const h=readHistory();h.unshift(old);localStorage.setItem(HISTORY_KEY,JSON.stringify(h.slice(0,5)));
    }
    try{localStorage.setItem(STORAGE_KEY,JSON.stringify(p))}
    catch(e){p=serializeProject(false);localStorage.setItem(STORAGE_KEY,JSON.stringify(p))}
    $("recoveryStatus").textContent=p.reference?.dataURL?"Autosave current with reference.":"Autosave current; reference omitted.";
    $("autosaveStamp").textContent="Autosaved "+new Date(p.savedAt).toLocaleTimeString();
    setStatus("SAVED","ok");return true;
  }catch(e){$("recoveryStatus").textContent="Autosave unavailable — use Save Editable Project.";return false}
}
function scheduleAutosave(){
  clearTimeout(state.autosaveTimer);
  state.autosaveTimer=setTimeout(writeAutosaveNow,700);
}
["projectName","collectionSupply"].forEach(id=>$(id).oninput=scheduleAutosave);

$("saveSnapshot").onclick=()=>{
  try{localStorage.setItem(SNAPSHOT_KEY,JSON.stringify(serializeProject(true)));$("recoveryStatus").textContent="Manual snapshot saved exactly."}
  catch(e){try{localStorage.setItem(SNAPSHOT_KEY,JSON.stringify(serializeProject(false)));$("recoveryStatus").textContent="Manual snapshot saved; reference omitted."}catch(_){$("recoveryStatus").textContent="Snapshot unavailable — use Save Editable Project."}}
};
$("restoreSnapshot").onclick=()=>{
  try{const r=localStorage.getItem(SNAPSHOT_KEY);if(!r){$("recoveryStatus").textContent="No manual snapshot found.";return}restoreProject(JSON.parse(r));$("recoveryStatus").textContent="Manual snapshot restored exactly."}
  catch(e){$("recoveryStatus").textContent="Snapshot restore failed safely: "+(e?.message||String(e))}
};
$("restorePrevious").onclick=()=>{
  try{const h=readHistory();if(!h.length){$("recoveryStatus").textContent="No previous autosave found.";return}restoreProject(h[0]);$("recoveryStatus").textContent="Previous autosave restored exactly."}
  catch(e){$("recoveryStatus").textContent="Previous autosave restore failed safely: "+(e?.message||String(e))}
};
$("restoreAutosave").onclick=()=>{
  try{const r=localStorage.getItem(STORAGE_KEY);if(!r){$("recoveryStatus").textContent="No latest autosave found.";return}restoreProject(JSON.parse(r));$("recoveryStatus").textContent="Latest autosave restored exactly."}
  catch(e){$("recoveryStatus").textContent="Latest autosave restore failed safely: "+(e?.message||String(e))}
};
$("clearAutosave").onclick=()=>{localStorage.removeItem(STORAGE_KEY);localStorage.removeItem(SNAPSHOT_KEY);localStorage.removeItem(HISTORY_KEY);$("recoveryStatus").textContent="Local recovery cleared.";$("autosaveStamp").textContent="No autosave yet.";};
$("exportProjectJson").onclick=()=>downloadBlob(new Blob([JSON.stringify(serializeProject(true),null,2)],{type:"application/json"}),`${safeName(state.projectName)}_V8_project.ape16.json`);
$("loadProjectJson").onchange=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{try{restoreProject(JSON.parse(r.result));writeAutosaveNow()}catch(err){alert(err.message)}};r.readAsText(f)};

function updateExportAudit(enable=true){
  const issues=[];
  if(!state.resolutionLocked)issues.push("Resolution is not locked.");
  if(!state.genesis.locked)issues.push("Brown Genesis is not approved + locked.");
  if(state.genesis.cells.length!==state.resolution**2)issues.push("Genesis canvas length does not match locked resolution.");
  const duplicate=new Set(),seen=new Set();
  for(const t of state.traits){
    const k=t.category+"/"+t.name;
    if(seen.has(k))duplicate.add(k);seen.add(k);
    if(t.cells.length!==state.resolution**2)issues.push(`Canvas mismatch: ${k}`);
    if(t.mask.length!==state.resolution**2)issues.push(`Mask mismatch: ${k}`);
    for(const c of t.cells)if(c&&(c[3]??255)!==255){issues.push(`Partial alpha: ${k}`);break}
  }
  for(const d of duplicate)issues.push(`Duplicate trait: ${d}`);
  const el=$("exportAudit");
  if(issues.length){el.className="validation fail";el.textContent="PROJECT NOT READY\n"+issues.join("\n");$("exportGeneratorZip").disabled=true;return false}
  el.className="validation pass";el.textContent=`PROJECT PASS\nResolution: ${state.resolution}×${state.resolution}\n4K scale: ×${4096/state.resolution}\nApproved traits: ${state.traits.length}\nLayer order: ${LAYER_ORDER.join(" → ")}\nGenerator package ready.`;
  $("exportGeneratorZip").disabled=!enable;return true;
}
$("runProjectAudit").onclick=()=>updateExportAudit(true);

function crc32(bytes){
  let c=0xffffffff;
  for(const b of bytes){c^=b;for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0)}
  return (c^0xffffffff)>>>0;
}
function u16(n){return [n&255,(n>>>8)&255]}
function u32(n){return [n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255]}
function strBytes(s){return new TextEncoder().encode(s)}
function makeZip(entries){
  const chunks=[],central=[];let offset=0;
  for(const e of entries){
    const name=strBytes(e.name),data=e.data instanceof Uint8Array?e.data:new Uint8Array(e.data);
    const crc=crc32(data),local=new Uint8Array([
      ...u32(0x04034b50),...u16(20),...u16(0),...u16(0),...u16(0),...u16(0),...u32(crc),...u32(data.length),...u32(data.length),...u16(name.length),...u16(0),...name
    ]);
    chunks.push(local,data);
    central.push(new Uint8Array([
      ...u32(0x02014b50),...u16(20),...u16(20),...u16(0),...u16(0),...u16(0),...u16(0),...u32(crc),...u32(data.length),...u32(data.length),
      ...u16(name.length),...u16(0),...u16(0),...u16(0),...u16(0),...u32(0),...u32(offset),...name
    ]));
    offset+=local.length+data.length;
  }
  const centralOffset=offset,centralSize=central.reduce((s,c)=>s+c.length,0);
  chunks.push(...central,new Uint8Array([...u32(0x06054b50),...u16(0),...u16(0),...u16(entries.length),...u16(entries.length),...u32(centralSize),...u32(centralOffset),...u16(0)]));
  return new Blob(chunks,{type:"application/zip"});
}
async function pngBytes(cells){
  const blob=await canvasBlob(cellsCanvas(cells));return new Uint8Array(await blob.arrayBuffer());
}
async function maskPngBytes(mask){
  const blob=await canvasBlob(maskCanvas(mask));return new Uint8Array(await blob.arrayBuffer());
}
$("exportGeneratorZip").onclick=async()=>{
  if(!updateExportAudit(true))return;
  setStatus("PACKAGING","warn");
  const entries=[],manifest={format:"APE16_GENERATOR_ASSETS_V1",studioVersion:VERSION,project:state.projectName,supply:state.supply,resolution:state.resolution,layerOrder:LAYER_ORDER,anchors:anchorsForResolution(state.resolution),maskSemantics:"Before drawing a trait, erase underlying composite pixels wherever its mask PNG is opaque (destination-out), then draw trait source-over.",generatedAt:new Date().toISOString()};
  // Entry order intentionally matches generator compositing order.
  for(const cat of LAYER_ORDER){
    if(cat==="Body")entries.push({name:`Body/Brown_Genesis.png`,data:await pngBytes(state.genesis.cells)});
    for(const t of state.traits.filter(x=>x.category===cat).sort((a,b)=>a.name.localeCompare(b.name))){
      entries.push({name:`${cat}/${safeName(t.name)}.png`,data:await pngBytes(t.cells)});
    }
  }
  for(const t of state.traits.filter(t=>t.mask.some(Boolean))){
    entries.push({name:`masks/${t.category}/${safeName(t.name)}_mask.png`,data:await maskPngBytes(t.mask)});
  }
  const traitMeta=state.traits.map(t=>({category:t.category,name:t.name,weight:t.weight,allowEmpty:!!t.allowEmpty,revision:t.revision,asset:`${t.category}/${safeName(t.name)}.png`,mask:t.mask.some(Boolean)?`masks/${t.category}/${safeName(t.name)}_mask.png`:null}));
  entries.push({name:"metadata/project_manifest.json",data:strBytes(JSON.stringify(manifest,null,2))});
  entries.push({name:"metadata/traits.json",data:strBytes(JSON.stringify(traitMeta,null,2))});
  downloadBlob(makeZip(entries),`${safeName(state.projectName)}_GENERATOR_ASSETS_V7.zip`);
  setStatus("PACKAGE READY","ok");
};

function __selfTest(){
  const results={},assert=(name,v)=>results[name]=!!v;
  const oldRes=state.resolution,oldLocked=state.genesis.locked,oldCells=state.genesis.cells;
  state.resolution=32;state.genesis.cells=makeCells(32);state.genesis.locked=false;state.color="#123456";
  state.tool="pencil";applyGenesisTool(3,4,true);
  assert("Atomic pencil fills exactly one logical cell",state.genesis.cells.filter(Boolean).length===1&&rgbaToHex(state.genesis.cells[idx(3,4,32)])==="#123456");
  state.tool="eraser";applyGenesisTool(3,4,true);assert("Eraser clears exactly one cell",state.genesis.cells.filter(Boolean).length===0);
  state.genesis.cells[idx(0,0,32)]=[1,2,3,255];state.genesis.cells[idx(1,0,32)]=[1,2,3,255];floodFill(state.genesis.cells,0,0,[9,9,9,255]);
  assert("Flood fill respects contiguous logical cells",state.genesis.cells[idx(0,0,32)][0]===9&&state.genesis.cells[idx(1,0,32)][0]===9);
  state.genesis.locked=true;const before=JSON.stringify(state.genesis.cells);state.tool="pencil";applyGenesisTool(5,5,true);assert("Genesis lock prevents pixel edits",JSON.stringify(state.genesis.cells)===before);
  assert("All permitted resolutions scale exactly to 4096",[32,64,128].every(n=>4096%n===0));
  assert("Generator layer order is deterministic",LAYER_ORDER.join("|")==="Background|Body|Clothing|Mouth|Eyes|Headwear|Accessories");
  const sparse=sparseCells(state.genesis.cells),round=inflateCells(sparse,32);assert("Sparse project save round-trips cells",JSON.stringify(round)===JSON.stringify(state.genesis.cells));
  const z=makeZip([{name:"Background/A.png",data:new Uint8Array([1,2,3])},{name:"Body/B.png",data:new Uint8Array([4])}]);
  assert("Built-in ZIP writer produces ZIP blob",z.type==="application/zip"&&z.size>50);
  assert("Filename sanitizer is generator safe",safeName("Orange Bucket Hat!")==="Orange_Bucket_Hat");
  const t={cells:makeCells(32),mask:new Array(32*32).fill(false)};t.cells[idx(5,5,32)]=[255,0,0,255];t.mask[idx(5,5,32)]=true;
  assert("Trait artwork and mask use same logical origin",t.cells.length===t.mask.length&&t.mask[idx(5,5,32)]===true);
  state.resolution=oldRes;state.genesis.locked=oldLocked;state.genesis.cells=oldCells;drawEditor();
  return results;
}
window.__APE16_SELFTEST__=__selfTest;

if(location.search.includes("selftest=1")){
  window.addEventListener("load",()=>{
    const r=__selfTest(),pass=Object.values(r).every(Boolean),el=$("selftest");
    el.classList.remove("hidden");el.textContent=JSON.stringify({pass,results:r},null,2);
    document.body.dataset.selftest=pass?"PASS":"FAIL";
  });
}

function exactCellsEqual(a,b){if(!Array.isArray(a)||!Array.isArray(b)||a.length!==b.length)return false;for(let i=0;i<a.length;i++){const x=a[i],y=b[i];if(x===null&&y===null)continue;if(!x||!y||x.length!==y.length)return false;for(let j=0;j<x.length;j++)if(x[j]!==y[j])return false;}return true;}
window.__APE16_V7_TEST__={state,traceReferenceToGrid,setPage,serializeProject,restoreProject,exactCellsEqual,makeCells,idx,floodFill,hexToRgba,isNeutralLight,buildEdgeBackgroundMask};

function startupCheck(){
  const required=["page-setup","page-genesis","page-traits","page-export","editorCanvas","traitEditorCanvas"];
  const missing=required.filter(id=>!$(id));
  const status=$("startupStatus");
  if(missing.length){
    if(status)status.textContent="STARTUP FAIL · missing: "+missing.join(", ");
    return false;
  }
  if(status)status.textContent=`STARTUP PASS · V${VERSION} · all production pages loaded`;
  const chain=$("chainStatus");if(chain)chain.textContent="CHAIN READY · logical editor online";
  return true;
}

window.addEventListener("beforeunload",()=>{try{writeAutosaveNow()}catch(e){}});
startupCheck();
setPage("setup");
renderAssetLibrary();
drawEditor();
drawTraitEditor();
refreshTraitPreviews();
loadBuiltInReference();
})();
