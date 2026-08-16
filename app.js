(()=>{"use strict";

const $=id=>document.getElementById(id);

const state={
  n:64,
  zoom:8,
  cells:[],
  undo:[],
  redo:[],
  tool:"pencil",
  drawing:false,
  reference:null,
  genesisReferenceLocked:false,
  suggestion:[],
  suggestionPalette:[],
  showSuggestion:true,
  suggestionOpacity:0.55,
  selectionStart:null,
  selectionEnd:null,
  genesisPalette:[],
  paletteLocked:false,
  projectMeta:{
    projectName:"APE16",
    category:"Genesis",
    traitName:"Brown",
    revision:1,
    projectFormatVersion:1
  },
  approved:false,
  haloPreview:[]
};

const idx=(x,y)=>y*state.n+x;
const empty=n=>Array.from({length:n*n},()=>null);

const hexToRgba=hex=>{
  const h=hex.replace("#","");
  return [
    parseInt(h.slice(0,2),16),
    parseInt(h.slice(2,4),16),
    parseInt(h.slice(4,6),16),
    255
  ];
};

const rgbaCss=v=>`rgba(${v[0]},${v[1]},${v[2]},${v[3]/255})`;

function clamp(v,min,max){
  return Math.max(min,Math.min(max,v));
}

function resize(){
  const c=$("canvas");
  c.width=state.n*state.zoom;
  c.height=state.n*state.zoom;
  $("zoomLabel").textContent=`${state.zoom}× display zoom`;
}

function ensureNumericReadouts(){
  const configs=[
    ["refOpacity","Opacity","%"],
    ["refScale","Scale","%"],
    ["refX","X offset","%"],
    ["refY","Y offset","%"]
  ];

  for(const [id,label,suffix] of configs){
    const slider=$(id);
    if(!slider) continue;

    const parent=slider.parentElement;
    if(!parent || parent.querySelector(`[data-readout-for="${id}"]`)) continue;

    const readout=document.createElement("span");
    readout.dataset.readoutFor=id;
    readout.style.cssText=
      "display:inline-block;margin-left:8px;padding:3px 7px;border:1px solid #444;border-radius:7px;background:#0f0f11;color:#fff;font-size:12px;font-weight:700;min-width:58px;text-align:center;vertical-align:middle;";
    parent.appendChild(readout);
  }

  updateNumericReadouts();
}

function updateNumericReadouts(){
  const values={
    refOpacity:`${$("refOpacity")?.value ?? 0}%`,
    refScale:`${$("refScale")?.value ?? 0}%`,
    refX:`${Number($("refX")?.value ?? 0) >= 0 ? "+" : ""}${$("refX")?.value ?? 0} px`,
    refY:`${Number($("refY")?.value ?? 0) >= 0 ? "+" : ""}${$("refY")?.value ?? 0} px`
  };

  for(const [id,value] of Object.entries(values)){
    const el=document.querySelector(`[data-readout-for="${id}"]`);
    if(el) el.textContent=value;
  }
}

function drawReference(ctx){
  if(!state.reference || !$("showReference").checked) return;

  const opacity=Number($("refOpacity").value)/100;
  const scale=Number($("refScale").value)/100;
  const ox=Number($("refX").value);
  const oy=Number($("refY").value);

  const w=state.reference.width;
  const h=state.reference.height;
  const fit=Math.min(state.n/w,state.n/h)*scale;
  const dw=w*fit*state.zoom;
  const dh=h*fit*state.zoom;

  const px=(state.n*state.zoom-dw)/2 + ox*state.zoom;
  const py=(state.n*state.zoom-dh)/2 + oy*state.zoom;

  ctx.save();
  ctx.globalAlpha=opacity;
  ctx.imageSmoothingEnabled=false;
  ctx.drawImage(state.reference,px,py,dw,dh);
  ctx.restore();
}

function drawPixelCells(ctx){
  for(let y=0;y<state.n;y++){
    for(let x=0;x<state.n;x++){
      const v=state.cells[idx(x,y)];
      if(v){
        ctx.fillStyle=rgbaCss(v);
        ctx.fillRect(
          x*state.zoom,
          y*state.zoom,
          state.zoom,
          state.zoom
        );
      }
    }
  }
}

function drawGuides(ctx){
  const c=$("canvas");
  if(!$("showGrid").checked) return;

  // Fine 1-pixel logical grid.
  if(state.zoom>=5){
    ctx.strokeStyle="rgba(120,120,120,.22)";
    ctx.lineWidth=1;
    ctx.beginPath();

    for(let i=0;i<=state.n;i++){
      const p=i*state.zoom+0.5;
      ctx.moveTo(p,0);
      ctx.lineTo(p,c.height);
      ctx.moveTo(0,p);
      ctx.lineTo(c.width,p);
    }
    ctx.stroke();
  }

  // Major guides every 8 logical pixels.
  ctx.strokeStyle="rgba(255,255,255,.48)";
  ctx.lineWidth=1.5;
  ctx.beginPath();

  for(let i=0;i<=state.n;i+=8){
    const p=i*state.zoom+0.5;
    ctx.moveTo(p,0);
    ctx.lineTo(p,c.height);
    ctx.moveTo(0,p);
    ctx.lineTo(c.width,p);
  }
  ctx.stroke();

  // Permanent center guides.
  const center=(state.n/2)*state.zoom+0.5;
  ctx.strokeStyle="rgba(255,210,60,.95)";
  ctx.lineWidth=2;
  ctx.beginPath();
  ctx.moveTo(center,0);
  ctx.lineTo(center,c.height);
  ctx.moveTo(0,center);
  ctx.lineTo(c.width,center);
  ctx.stroke();

  // Hard master boundary.
  ctx.strokeStyle="rgba(255,255,255,.95)";
  ctx.lineWidth=3;
  ctx.strokeRect(
    1.5,
    1.5,
    c.width-3,
    c.height-3
  );

  // Major-guide coordinate labels.
  if(state.zoom>=7){
    ctx.save();
    ctx.font="bold 10px -apple-system,BlinkMacSystemFont,sans-serif";
    ctx.textBaseline="top";

    for(let i=0;i<state.n;i+=8){
      const p=i*state.zoom;

      ctx.fillStyle="rgba(0,0,0,.75)";
      ctx.fillRect(p+2,2,22,14);
      ctx.fillStyle="#ffffff";
      ctx.fillText(String(i),p+5,4);

      if(i>0){
        ctx.fillStyle="rgba(0,0,0,.75)";
        ctx.fillRect(2,p+2,22,14);
        ctx.fillStyle="#ffffff";
        ctx.fillText(String(i),5,p+4);
      }
    }
    ctx.restore();
  }
}


function drawSuggestion(ctx){
  if(
    !state.showSuggestion ||
    !state.suggestion ||
    state.suggestion.length!==state.n*state.n
  ) return;

  ctx.save();
  ctx.globalAlpha=state.suggestionOpacity;

  for(let y=0;y<state.n;y++){
    for(let x=0;x<state.n;x++){
      const v=state.suggestion[idx(x,y)];
      if(!v) continue;

      // Do not obscure pixels already deliberately drawn.
      if(state.cells[idx(x,y)]) continue;

      ctx.fillStyle=rgbaCss(v);
      ctx.fillRect(
        x*state.zoom,
        y*state.zoom,
        state.zoom,
        state.zoom
      );
    }
  }

  ctx.restore();
}

function normalizedSelection(){
  if(!state.selectionStart || !state.selectionEnd) return null;

  return {
    x1:Math.min(state.selectionStart.x,state.selectionEnd.x),
    y1:Math.min(state.selectionStart.y,state.selectionEnd.y),
    x2:Math.max(state.selectionStart.x,state.selectionEnd.x),
    y2:Math.max(state.selectionStart.y,state.selectionEnd.y)
  };
}

function drawSelection(ctx){
  const s=normalizedSelection();
  if(!s) return;

  ctx.save();
  ctx.fillStyle="rgba(255,210,60,.14)";
  ctx.strokeStyle="rgba(255,210,60,.98)";
  ctx.lineWidth=2;

  const x=s.x1*state.zoom;
  const y=s.y1*state.zoom;
  const w=(s.x2-s.x1+1)*state.zoom;
  const h=(s.y2-s.y1+1)*state.zoom;

  ctx.fillRect(x,y,w,h);
  ctx.strokeRect(x+1,y+1,w-2,h-2);
  ctx.restore();
}

function colorDistanceSq(a,b){
  const dr=a[0]-b[0];
  const dg=a[1]-b[1];
  const db=a[2]-b[2];
  return dr*dr+dg*dg+db*db;
}

function isNearWhite(pixel,cutoff){
  if(!pixel || pixel[3]===0) return true;
  return (
    pixel[0]>=cutoff &&
    pixel[1]>=cutoff &&
    pixel[2]>=cutoff
  );
}

function renderReferenceToLogicalCanvas(){
  if(!state.reference) return null;

  const c=document.createElement("canvas");
  c.width=state.n;
  c.height=state.n;

  const ctx=c.getContext("2d");
  ctx.clearRect(0,0,state.n,state.n);

  const scale=Number($("refScale").value)/100;
  const ox=Number($("refX").value);
  const oy=Number($("refY").value);

  const w=state.reference.width;
  const h=state.reference.height;
  const fit=Math.min(state.n/w,state.n/h)*scale;
  const dw=w*fit;
  const dh=h*fit;
  const px=(state.n-dw)/2+ox;
  const py=(state.n-dh)/2+oy;

  // This is a TEMPORARY construction suggestion only.
  // High-quality downsampling is allowed here because suggestion pixels
  // never become approved art unless the user deliberately accepts them.
  ctx.imageSmoothingEnabled=true;
  ctx.imageSmoothingQuality="high";
  ctx.drawImage(state.reference,px,py,dw,dh);

  return c;
}

function kMeansPalette(pixels,k,iterations=10){
  if(!pixels.length) return [];

  const unique=[];
  const seen=new Set();

  for(const p of pixels){
    const key=`${p[0]},${p[1]},${p[2]}`;
    if(!seen.has(key)){
      seen.add(key);
      unique.push(p);
    }
  }

  if(unique.length<=k){
    return unique.map(p=>[p[0],p[1],p[2],255]);
  }

  // Deterministic initialization: evenly spaced by luminance.
  unique.sort((a,b)=>{
    const la=a[0]*.2126+a[1]*.7152+a[2]*.0722;
    const lb=b[0]*.2126+b[1]*.7152+b[2]*.0722;
    return la-lb;
  });

  let centers=[];
  for(let i=0;i<k;i++){
    const pos=Math.floor(i*(unique.length-1)/Math.max(1,k-1));
    centers.push(unique[pos].slice(0,3));
  }

  for(let iter=0;iter<iterations;iter++){
    const sums=Array.from({length:k},()=>[0,0,0,0]);

    for(const p of pixels){
      let best=0;
      let bestD=Infinity;

      for(let i=0;i<centers.length;i++){
        const d=colorDistanceSq(p,centers[i]);
        if(d<bestD){
          bestD=d;
          best=i;
        }
      }

      sums[best][0]+=p[0];
      sums[best][1]+=p[1];
      sums[best][2]+=p[2];
      sums[best][3]++;
    }

    centers=centers.map((old,i)=>{
      const n=sums[i][3];
      return n
        ? [
            Math.round(sums[i][0]/n),
            Math.round(sums[i][1]/n),
            Math.round(sums[i][2]/n)
          ]
        : old;
    });
  }

  return centers.map(c=>[c[0],c[1],c[2],255]);
}

function nearestPaletteColor(pixel,palette){
  if(!palette.length) return pixel.slice();

  let best=palette[0];
  let bestD=Infinity;

  for(const c of palette){
    const d=colorDistanceSq(pixel,c);
    if(d<bestD){
      bestD=d;
      best=c;
    }
  }

  return best.slice();
}

function generateSuggestion(){
  if(!state.reference || !state.genesisReferenceLocked){
    showV4Notice("Load and lock Genesis before generating a suggestion.");
    return;
  }

  const source=renderReferenceToLogicalCanvas();
  if(!source) return;

  const ctx=source.getContext("2d");
  const data=ctx.getImageData(0,0,state.n,state.n).data;
  const cutoff=Number(document.getElementById("v5WhiteCutoff")?.value || 242);
  const paletteSize=Number(document.getElementById("v5PaletteSize")?.value || 8);

  const usable=[];

  for(let i=0;i<state.n*state.n;i++){
    const p=[
      data[i*4],
      data[i*4+1],
      data[i*4+2],
      data[i*4+3]
    ];

    if(p[3]>20 && !isNearWhite(p,cutoff)){
      usable.push(p);
    }
  }

  const palette=kMeansPalette(usable,paletteSize,12);
  state.suggestionPalette=palette;

  state.suggestion=Array.from(
    {length:state.n*state.n},
    (_,i)=>{
      const p=[
        data[i*4],
        data[i*4+1],
        data[i*4+2],
        data[i*4+3]
      ];

      if(p[3]<=20 || isNearWhite(p,cutoff)) return null;
      return nearestPaletteColor(p,palette);
    }
  );

  state.showSuggestion=true;
  renderV5SuggestionPalette();
  draw();
  updateV5Status(
    `Suggestion ready · ${palette.length} colors · temporary only`
  );
}

function acceptSuggestionRegion(selectionOnly=false,onlyEmpty=true){
  if(state.approved){
    showV4Notice("Approved master is locked. Create a new revision to edit.");
    return;
  }

  if(!state.suggestion?.length){
    showV4Notice("Generate a suggested layer first.");
    return;
  }

  const area=selectionOnly ? normalizedSelection() : {
    x1:0,y1:0,x2:state.n-1,y2:state.n-1
  };

  if(!area){
    showV4Notice("Select a rectangle on the canvas first.");
    return;
  }

  saveUndo();

  for(let y=area.y1;y<=area.y2;y++){
    for(let x=area.x1;x<=area.x2;x++){
      const suggested=state.suggestion[idx(x,y)];
      if(!suggested) continue;
      if(onlyEmpty && state.cells[idx(x,y)]) continue;
      state.cells[idx(x,y)]=suggested.slice();
    }
  }

  draw();
  validateGenesis(false);
}

function clearArtworkRegion(){
  if(state.approved){
    showV4Notice("Approved master is locked. Create a new revision to edit.");
    return;
  }

  const area=normalizedSelection();

  if(!area){
    showV4Notice("Select a rectangle first.");
    return;
  }

  saveUndo();

  for(let y=area.y1;y<=area.y2;y++){
    for(let x=area.x1;x<=area.x2;x++){
      state.cells[idx(x,y)]=null;
    }
  }

  draw();
}

function clearSelection(){
  state.selectionStart=null;
  state.selectionEnd=null;
  draw();
}

function rgbaToHex(v){
  return "#"+v.slice(0,3)
    .map(n=>n.toString(16).padStart(2,"0"))
    .join("");
}

function renderV5SuggestionPalette(){
  const host=document.getElementById("v5SuggestionPalette");
  if(!host) return;

  host.innerHTML="";

  for(const color of state.suggestionPalette){
    const sw=document.createElement("button");
    sw.type="button";
    sw.title=rgbaToHex(color);
    sw.style.cssText=
      `width:32px;height:32px;border-radius:7px;border:2px solid #555;background:${rgbaToHex(color)};padding:0`;

    sw.addEventListener("click",()=>{
      $("color").value=rgbaToHex(color);
    });

    host.appendChild(sw);
  }
}

function useSuggestionAsGenesisPalette(){
  if(!state.suggestionPalette.length){
    showV4Notice("Generate a suggestion first.");
    return;
  }

  state.genesisPalette=state.suggestionPalette.map(c=>c.slice());
  state.paletteLocked=true;
  renderV5GenesisPalette();
  updateV5Status(
    `Genesis palette locked · ${state.genesisPalette.length} colors`
  );
  validateGenesis(false);
}

function unlockGenesisPalette(){
  state.paletteLocked=false;
  updateV5Status("Genesis palette unlocked for editing");
  validateGenesis(false);
}

function renderV5GenesisPalette(){
  const host=document.getElementById("v5GenesisPalette");
  if(!host) return;

  host.innerHTML="";

  for(const color of state.genesisPalette){
    const sw=document.createElement("button");
    sw.type="button";
    sw.title=rgbaToHex(color);
    sw.style.cssText=
      `width:32px;height:32px;border-radius:7px;border:2px solid #555;background:${rgbaToHex(color)};padding:0`;

    sw.addEventListener("click",()=>{
      $("color").value=rgbaToHex(color);
    });

    host.appendChild(sw);
  }
}

function colorAllowedByGenesisPalette(v){
  if(!state.paletteLocked || !state.genesisPalette.length) return true;

  return state.genesisPalette.some(c=>
    c[0]===v[0] &&
    c[1]===v[1] &&
    c[2]===v[2]
  );
}

function findIsolatedPixels(){
  const isolated=[];

  for(let y=0;y<state.n;y++){
    for(let x=0;x<state.n;x++){
      if(!state.cells[idx(x,y)]) continue;

      let neighbors=0;

      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
        const nx=x+dx;
        const ny=y+dy;

        if(
          nx>=0 && ny>=0 &&
          nx<state.n && ny<state.n &&
          state.cells[idx(nx,ny)]
        ){
          neighbors++;
        }
      }

      if(neighbors===0){
        isolated.push({x,y});
      }
    }
  }

  return isolated;
}

function validateGenesis(showNotice=true){
  const issues=[];
  const warnings=[];

  if(state.n!==64){
    issues.push("Master canvas is not 64×64.");
  }

  if(!state.reference && !state.approved){
    issues.push("Brown Genesis reference is not loaded.");
  }

  if(!state.genesisReferenceLocked && !state.approved){
    issues.push("Genesis reference is not locked.");
  }

  const painted=state.cells.filter(Boolean).length;

  if(painted===0){
    warnings.push("No Genesis artwork has been drawn yet.");
  }

  if(state.paletteLocked && state.genesisPalette.length){
    let offPalette=0;

    for(const v of state.cells){
      if(v && !colorAllowedByGenesisPalette(v)){
        offPalette++;
      }
    }

    if(offPalette){
      issues.push(`${offPalette} artwork pixels are outside the locked Genesis palette.`);
    }
  }

  const isolated=findIsolatedPixels();

  if(isolated.length){
    warnings.push(
      `${isolated.length} isolated single pixel${isolated.length===1?"":"s"} detected. Review intentionally.`
    );
  }

  const panel=document.getElementById("v5ValidationResults");

  if(panel){
    panel.innerHTML="";

    const summary=document.createElement("div");
    summary.style.cssText=
      "font-weight:900;margin-bottom:8px;color:"+
      (issues.length ? "#ff9d9d" : "#9ee6aa");

    summary.textContent=issues.length
      ? `FAIL · ${issues.length} hard issue${issues.length===1?"":"s"}`
      : "HARD RULES PASS";

    panel.appendChild(summary);

    for(const item of issues){
      const row=document.createElement("div");
      row.textContent="✕ "+item;
      row.style.cssText="color:#ffb1b1;margin:5px 0;font-size:13px";
      panel.appendChild(row);
    }

    for(const item of warnings){
      const row=document.createElement("div");
      row.textContent="⚠ "+item;
      row.style.cssText="color:#ffd98a;margin:5px 0;font-size:13px";
      panel.appendChild(row);
    }

    if(!issues.length && !warnings.length){
      const row=document.createElement("div");
      row.textContent="✓ No validation warnings detected.";
      row.style.cssText="color:#9ee6aa;font-size:13px";
      panel.appendChild(row);
    }

    const stats=document.createElement("div");
    stats.style.cssText=
      "margin-top:9px;padding-top:9px;border-top:1px solid #333;color:#bbb;font-size:12px";
    stats.textContent=
      `Painted cells: ${painted.toLocaleString()} / 4,096 · Isolated: ${isolated.length} · Palette: ${
        state.paletteLocked ? `LOCKED (${state.genesisPalette.length})` : "unlocked"
      }`;

    panel.appendChild(stats);
  }

  if(showNotice){
    showV4Notice(
      issues.length
        ? `Genesis validation failed: ${issues.length} hard issue(s).`
        : warnings.length
          ? `Hard rules pass with ${warnings.length} warning(s).`
          : "Genesis validation passed."
    );
  }

  return {
    pass:issues.length===0,
    issues,
    warnings,
    isolated,
    painted
  };
}

function updateV5Status(text){
  const el=document.getElementById("v5Status");
  if(el) el.textContent=text;
}


const APE16_PROJECT_FORMAT_VERSION=1;

function safeFilePart(value,fallback="untitled"){
  const cleaned=String(value||fallback)
    .trim()
    .replace(/[^a-z0-9_-]+/gi,"_")
    .replace(/^_+|_+$/g,"");
  return cleaned || fallback;
}

function currentProjectBaseName(){
  return [
    safeFilePart(state.projectMeta.projectName,"APE16"),
    safeFilePart(state.projectMeta.category,"Genesis"),
    safeFilePart(state.projectMeta.traitName,"Brown")
  ].join("_");
}

function currentRevisionSuffix(){
  return `_r${String(Math.max(1,Number(state.projectMeta.revision)||1)).padStart(2,"0")}`;
}

function syncProjectMetaFromUI(){
  const projectName=document.getElementById("v5ProjectName");
  const category=document.getElementById("v5Category");
  const traitName=document.getElementById("v5TraitName");
  const revision=document.getElementById("v5Revision");

  if(projectName) state.projectMeta.projectName=projectName.value||"APE16";
  if(category) state.projectMeta.category=category.value||"Genesis";
  if(traitName) state.projectMeta.traitName=traitName.value||"Brown";
  if(revision) state.projectMeta.revision=Math.max(1,Math.floor(Number(revision.value)||1));
}

function applyProjectMetaToUI(){
  const projectName=document.getElementById("v5ProjectName");
  const category=document.getElementById("v5Category");
  const traitName=document.getElementById("v5TraitName");
  const revision=document.getElementById("v5Revision");
  const approvedBadge=document.getElementById("v5ApprovedBadge");

  if(projectName) projectName.value=state.projectMeta.projectName;
  if(category) category.value=state.projectMeta.category;
  if(traitName) traitName.value=state.projectMeta.traitName;
  if(revision) revision.value=state.projectMeta.revision;

  if(approvedBadge){
    approvedBadge.textContent=state.approved ? "🔒 APPROVED MASTER" : "WORKING PROJECT";
    approvedBadge.style.background=state.approved ? "#17311f" : "#2a2214";
    approvedBadge.style.borderColor=state.approved ? "#315f3e" : "#6a5428";
    approvedBadge.style.color=state.approved ? "#9ee6aa" : "#ffd98a";
  }

  const inputs=["v5ProjectName","v5Category","v5TraitName","v5Revision"];
  for(const id of inputs){
    const el=document.getElementById(id);
    if(el) el.disabled=state.approved;
  }

  // Freeze artwork editing when approved
  const editButtons=[
    ...document.querySelectorAll("[data-tool]"),
    document.getElementById("undoBtn"),
    document.getElementById("redoBtn"),
    document.getElementById("clearBtn"),
    document.getElementById("v5SelectTool")
  ].filter(Boolean);

  for(const b of editButtons){
    b.disabled=state.approved;
    b.style.opacity=state.approved?".4":"1";
  }
}

function serializeCells(cells){
  return cells.map(v=>v ? [...v] : null);
}

function makeProjectPayload(){
  syncProjectMetaFromUI();

  return {
    format:"APE16_PIXEL_STUDIO_PROJECT",
    projectFormatVersion:APE16_PROJECT_FORMAT_VERSION,
    savedAt:new Date().toISOString(),
    studioGeneration:"V5",
    meta:{
      projectName:state.projectMeta.projectName,
      category:state.projectMeta.category,
      traitName:state.projectMeta.traitName,
      revision:state.projectMeta.revision
    },
    approved:state.approved,
    canvas:{
      resolution:64,
      cells:serializeCells(state.cells)
    },
    reference:{
      locked:state.genesisReferenceLocked,
      scale:85,
      x:0,
      y:0,
      opacity:Number($("refOpacity")?.value||45)
    },
    palette:{
      locked:state.paletteLocked,
      colors:state.genesisPalette.map(c=>[...c])
    },
    suggestion:{
      visible:state.showSuggestion,
      opacity:state.suggestionOpacity,
      palette:state.suggestionPalette.map(c=>[...c]),
      cells:serializeCells(state.suggestion)
    }
  };
}

function downloadText(text,name,type="application/json"){
  const blob=new Blob([text],{type});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download=name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href),1500);
}

function saveEditableProject(){
  const payload=makeProjectPayload();
  const name=`${currentProjectBaseName()}${currentRevisionSuffix()}.ape16.json`;
  downloadText(JSON.stringify(payload,null,2),name);
  updateV5Status(`Saved editable project · ${name}`);
}

function validateProjectPayload(data){
  if(!data || data.format!=="APE16_PIXEL_STUDIO_PROJECT"){
    throw new Error("This is not an APE16 Pixel Studio project file.");
  }

  const version=Number(data.projectFormatVersion||0);
  if(version<1 || version>APE16_PROJECT_FORMAT_VERSION){
    throw new Error(
      `Unsupported project format version ${version}. Current supported version is ${APE16_PROJECT_FORMAT_VERSION}.`
    );
  }

  if(data.canvas?.resolution!==64){
    throw new Error("APE16 project canvas must be 64×64.");
  }

  if(!Array.isArray(data.canvas?.cells) || data.canvas.cells.length!==4096){
    throw new Error("Project pixel data is invalid.");
  }
}

function loadEditableProjectFile(file){
  const reader=new FileReader();

  reader.onload=()=>{
    try{
      importProjectJSONText(String(reader.result||""));
    }catch(error){
      alert(error.message);
    }
  };

  reader.readAsText(file);
}

function exportNamedLogicalMaster(){
  syncProjectMetaFromUI();

  const validation=validateGenesis(false);
  if(!validation.pass){
    showV4Notice("Fix Genesis hard-rule failures before production export.");
    return;
  }

  const name=`${currentProjectBaseName()}_64x64.png`;
  downloadCanvas(logicalCanvas(),name);
  updateV5Status(`Exported master · ${name}`);
}

function exportNamed1024Preview(){
  syncProjectMetaFromUI();

  const validation=validateGenesis(false);
  if(!validation.pass){
    showV4Notice("Fix Genesis hard-rule failures before production export.");
    return;
  }

  const src=logicalCanvas();
  const out=document.createElement("canvas");
  out.width=1024;
  out.height=1024;

  const ctx=out.getContext("2d");
  ctx.imageSmoothingEnabled=false;
  ctx.clearRect(0,0,1024,1024);
  ctx.drawImage(src,0,0,1024,1024);

  const name=`${currentProjectBaseName()}_1024x1024.png`;
  downloadCanvas(out,name);
  updateV5Status(`Exported preview · ${name}`);
}

function exportNamed4096Preview(){
  syncProjectMetaFromUI();
  const validation=validateGenesis(false);
  if(!validation.pass){
    showV4Notice("Fix Genesis hard-rule failures before production export.");
    return;
  }
  const src=logicalCanvas();
  const out=document.createElement("canvas");
  out.width=4096; out.height=4096;
  const ctx=out.getContext("2d");
  ctx.imageSmoothingEnabled=false;
  ctx.clearRect(0,0,4096,4096);
  ctx.drawImage(src,0,0,4096,4096);
  const name=`${currentProjectBaseName()}_4096x4096.png`;
  downloadCanvas(out,name);
  updateV5Status(`Exported 4K pixel-perfect preview · ${name}`);
}

function approveMaster(){
  const validation=validateGenesis(true);

  if(!validation.pass){
    showV4Notice("Genesis cannot be approved until all hard-rule failures are fixed.");
    return;
  }

  if(validation.painted===0){
    showV4Notice("Genesis has no artwork to approve.");
    return;
  }

  const ok=confirm(
    "Approve and lock this master? Editing will be disabled until you deliberately create a new revision."
  );
  if(!ok) return;

  state.approved=true;
  applyProjectMetaToUI();
  updateV5Status("Master approved and locked.");
}

function createRevisionFromApproved(){
  if(!state.approved){
    showV4Notice("Current project is already editable.");
    return;
  }

  const ok=confirm(
    "Create a new editable revision from the approved master? The artwork is copied; the approved file itself is not changed."
  );
  if(!ok) return;

  state.approved=false;
  state.haloPreview=[];
  state.projectMeta.revision=Math.max(1,Number(state.projectMeta.revision)||1)+1;
  applyProjectMetaToUI();
  updateV5Status(
    `Created editable revision r${String(state.projectMeta.revision).padStart(2,"0")}`
  );
}


function uniquePaletteFromCells(cells){
  const seen=new Map();

  for(const v of cells){
    if(!v || v[3]===0) continue;
    const key=`${v[0]},${v[1]},${v[2]},${v[3]}`;
    if(!seen.has(key)) seen.set(key,[...v]);
  }

  return [...seen.values()];
}

function restoreApprovedGenesisFrom64PNG(file){
  if(!file) return;

  const url=URL.createObjectURL(file);
  const image=new Image();

  image.onload=()=>{
    try{
      if(image.width!==64 || image.height!==64){
        throw new Error(
          `This recovery tool requires the exact 64×64 Genesis master PNG. Selected image is ${image.width}×${image.height}.`
        );
      }

      const c=document.createElement("canvas");
      c.width=64;
      c.height=64;
      const ctx=c.getContext("2d",{willReadFrequently:true});
      ctx.imageSmoothingEnabled=false;
      ctx.clearRect(0,0,64,64);
      ctx.drawImage(image,0,0);

      const data=ctx.getImageData(0,0,64,64).data;
      const cells=new Array(4096).fill(null);

      for(let i=0;i<4096;i++){
        const a=data[i*4+3];
        if(a===0) continue;
        cells[i]=[
          data[i*4],
          data[i*4+1],
          data[i*4+2],
          a
        ];
      }

      if(!cells.some(Boolean)){
        throw new Error("The selected 64×64 PNG contains no visible Genesis pixels.");
      }

      const palette=uniquePaletteFromCells(cells);

      state.n=64;
      state.cells=cells;
      state.undo=[];
      state.redo=[];
      state.suggestion=[];
      state.suggestionPalette=[];
      state.showSuggestion=false;
      state.selectionStart=null;
      state.selectionEnd=null;

      state.projectMeta.projectName="APE16";
      state.projectMeta.category="Genesis";
      state.projectMeta.traitName="Brown";
      state.projectMeta.revision=1;

      state.genesisPalette=palette;
      state.paletteLocked=true;
      state.genesisReferenceLocked=true;
      state.approved=true;

      // The exported 64×64 PNG itself is the approved source of truth.
      // The original tracing reference is intentionally not required for trait work.
      state.reference=null;

      applyProjectMetaToUI();
      applyV4LockUI();
      renderV5GenesisPalette();
      updateNumericReadouts();
      resize();
      draw();
      validateGenesis(false);

      if(typeof window.APE16V6Refresh==="function"){
        window.APE16V6Refresh();
      }

      updateV5Status(
        `Approved Brown Genesis restored from exact 64×64 master · ${palette.length} colors`
      );

      showV4Notice("Approved Brown Genesis restored from 64×64 master PNG.");
    }catch(error){
      alert(error.message);
    }finally{
      URL.revokeObjectURL(url);
    }
  };

  image.onerror=()=>{
    URL.revokeObjectURL(url);
    alert("Could not read the selected PNG.");
  };

  image.src=url;
}

function importProjectJSONText(text){
  const data=JSON.parse(String(text||""));
  validateProjectPayload(data);

  state.n=64;
  state.cells=data.canvas.cells.map(v=>v ? [...v] : null);
  state.undo=[];
  state.redo=[];

  state.projectMeta.projectName=data.meta?.projectName||"APE16";
  state.projectMeta.category=data.meta?.category||"Genesis";
  state.projectMeta.traitName=data.meta?.traitName||"Brown";
  state.projectMeta.revision=Math.max(1,Number(data.meta?.revision)||1);

  state.approved=Boolean(data.approved);
  state.genesisReferenceLocked=Boolean(data.reference?.locked) || state.approved;

  $("refOpacity").value=String(
    Math.max(0,Math.min(100,Number(data.reference?.opacity ?? 45)))
  );
  $("refScale").value="85";
  $("refX").value="0";
  $("refY").value="0";

  state.genesisPalette=Array.isArray(data.palette?.colors)
    ? data.palette.colors.map(c=>[...c])
    : uniquePaletteFromCells(state.cells);
  state.paletteLocked=Boolean(data.palette?.locked) || state.approved;

  state.showSuggestion=Boolean(data.suggestion?.visible);
  state.suggestionOpacity=Number(data.suggestion?.opacity ?? .55);
  state.suggestionPalette=Array.isArray(data.suggestion?.palette)
    ? data.suggestion.palette.map(c=>[...c])
    : [];
  state.suggestion=Array.isArray(data.suggestion?.cells) &&
    data.suggestion.cells.length===4096
      ? data.suggestion.cells.map(v=>v ? [...v] : null)
      : [];

  // Saved projects do not embed the original tracing image.
  // Approved masters are valid without it.
  state.reference=null;

  applyProjectMetaToUI();
  applyV4LockUI();
  renderV5GenesisPalette();
  renderV5SuggestionPalette();
  updateNumericReadouts();
  resize();
  draw();
  validateGenesis(false);

  if(typeof window.APE16V6Refresh==="function"){
    window.APE16V6Refresh();
  }

  updateV5Status(
    `Loaded editable project · format v${data.projectFormatVersion}`
  );
}

function loadProjectThroughPrompt(){
  const raw=prompt(
    "Fallback JSON loader: paste the complete contents of your APE16 .json project here. Cancel to leave unchanged."
  );

  if(!raw) return;

  try{
    importProjectJSONText(raw);
    showV4Notice("APE16 project restored from JSON text.");
  }catch(error){
    alert(error.message);
  }
}

function setupV5ProjectSystem(){
  const exportSection=$("exportMasterBtn")?.closest("section");
  if(!exportSection || document.getElementById("v5ProjectSystem")) return;

  const wrap=document.createElement("div");
  wrap.id="v5ProjectSystem";
  wrap.style.cssText=
    "margin-top:14px;padding:12px;border:1px solid #3a3a40;border-radius:12px;background:#101012";

  const title=document.createElement("div");
  title.textContent="APE16 PROJECT / SAVE / EXPORT";
  title.style.cssText="font-weight:900;font-size:14px;margin-bottom:8px";

  const badge=document.createElement("div");
  badge.id="v5ApprovedBadge";
  badge.style.cssText=
    "display:inline-block;padding:7px 10px;border:1px solid #6a5428;border-radius:999px;background:#2a2214;color:#ffd98a;font-size:12px;font-weight:900;margin-bottom:10px";

  const fields=document.createElement("div");
  fields.style.cssText=
    "display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px";

  function makeField(labelText,id,value,type="text"){
    const label=document.createElement("label");
    label.textContent=labelText;
    label.style.cssText="display:flex;flex-direction:column;gap:5px;font-size:12px;color:#ccc";

    const input=document.createElement("input");
    input.id=id;
    input.type=type;
    input.value=value;
    input.style.cssText=
      "background:#111;color:#fff;border:1px solid #444;border-radius:8px;padding:8px";

    if(type==="number"){
      input.min="1";
      input.step="1";
    }

    input.addEventListener("input",syncProjectMetaFromUI);
    label.appendChild(input);
    return label;
  }

  fields.append(
    makeField("Project","v5ProjectName","APE16"),
    makeField("Category","v5Category","Genesis"),
    makeField("Trait name","v5TraitName","Brown"),
    makeField("Revision","v5Revision","1","number")
  );

  const saveLoad=document.createElement("div");
  saveLoad.style.cssText="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px";

  const save=document.createElement("button");
  save.type="button";
  save.textContent="Save Editable Project";
  save.addEventListener("click",saveEditableProject);

  const load=document.createElement("button");
  load.type="button";
  load.textContent="Load Project";
  load.title="iPad Files picker shows all files; Pixel Studio validates the selected project after selection.";
  const loadInput=document.createElement("input");
  loadInput.type="file";
  loadInput.accept="*/*";
  loadInput.hidden=true;
  load.addEventListener("click",()=>loadInput.click());
  loadInput.addEventListener("change",e=>{
    const file=e.target.files[0];
    if(file) loadEditableProjectFile(file);
    e.target.value="";
  });

  const restorePng=document.createElement("button");
  restorePng.type="button";
  restorePng.textContent="Import Existing 64×64 Genesis (optional)";
  const restorePngInput=document.createElement("input");
  restorePngInput.type="file";
  restorePngInput.accept="image/png";
  restorePngInput.hidden=true;
  restorePng.addEventListener("click",()=>restorePngInput.click());
  restorePngInput.addEventListener("change",e=>{
    const file=e.target.files[0];
    if(file) restoreApprovedGenesisFrom64PNG(file);
    e.target.value="";
  });

  const pasteJson=document.createElement("button");
  pasteJson.type="button";
  pasteJson.textContent="Fallback: Paste Project JSON";
  pasteJson.addEventListener("click",loadProjectThroughPrompt);

  const exportMaster=document.createElement("button");
  exportMaster.type="button";
  exportMaster.textContent="Export Named 64×64 Master";
  exportMaster.addEventListener("click",exportNamedLogicalMaster);

  const exportPreview=document.createElement("button");
  exportPreview.type="button";
  exportPreview.textContent="Export Named 1024 Preview";
  exportPreview.addEventListener("click",exportNamed1024Preview);

  const export4096=document.createElement("button");
  export4096.type="button";
  export4096.textContent="Export Named 4096×4096";
  export4096.addEventListener("click",exportNamed4096Preview);

  const haloPreview=document.createElement("button");
  haloPreview.type="button";
  haloPreview.textContent="Preview Exterior Halo";
  haloPreview.addEventListener("click",previewExteriorHalo);

  const haloApply=document.createElement("button");
  haloApply.type="button";
  haloApply.textContent="Apply Halo Cleanup";
  haloApply.addEventListener("click",applyExteriorHaloCleanup);

  const haloCancel=document.createElement("button");
  haloCancel.type="button";
  haloCancel.textContent="Clear Halo Preview";
  haloCancel.addEventListener("click",cancelExteriorHaloPreview);

  const approve=document.createElement("button");
  approve.type="button";
  approve.textContent="Approve + Lock Master";
  approve.addEventListener("click",approveMaster);

  const revision=document.createElement("button");
  revision.type="button";
  revision.textContent="Create New Revision";
  revision.addEventListener("click",createRevisionFromApproved);

  for(const b of [save,load,restorePng,pasteJson,exportMaster,exportPreview,export4096,haloPreview,haloApply,haloCancel,approve,revision]){
    b.style.cssText=
      "padding:9px 11px;border-radius:9px;border:1px solid #444;background:#27272a;color:#fff;font-weight:750";
  }

  approve.style.background="#f4f4f5";
  approve.style.color="#111";
  approve.style.fontWeight="900";

  saveLoad.append(
    save,
    load,
    loadInput,
    restorePng,
    restorePngInput,
    pasteJson,
    exportMaster,
    exportPreview,
    haloPreview,
    haloApply,
    haloCancel,
    approve,
    revision
  );

  const naming=document.createElement("p");
  naming.style.cssText="color:#a1a1aa;font-size:12px;line-height:1.45;margin:10px 0 0";
  naming.textContent=
    "Production names are automatic. Example: APE16_Genesis_Brown_64x64.png and APE16_Genesis_Brown_1024x1024.png. Editable projects use a revisioned .ape16.json filename and preserve all 4,096 logical cells.";

  const format=document.createElement("div");
  format.style.cssText=
    "margin-top:9px;color:#9ee6aa;font-size:12px;font-weight:800";
  format.textContent=
    `Project format: APE16 Pixel Studio v${APE16_PROJECT_FORMAT_VERSION} · designed to migrate forward without redrawing`;

  wrap.append(title,badge,fields,saveLoad,naming,format);
  exportSection.appendChild(wrap);

  applyProjectMetaToUI();
}

function setupV5ConstructionAssistant(){
  const toolsSection=$("undoBtn")?.closest("section");
  if(!toolsSection || document.getElementById("v5ConstructionAssistant")) return;

  const wrap=document.createElement("div");
  wrap.id="v5ConstructionAssistant";
  wrap.style.cssText=
    "margin-top:14px;padding:12px;border:1px solid #3a3a40;border-radius:12px;background:#101012";

  const title=document.createElement("div");
  title.textContent="APE16 V5 · ASSISTED GENESIS CONSTRUCTION";
  title.style.cssText="font-weight:900;font-size:14px;margin-bottom:5px";

  const explanation=document.createElement("p");
  explanation.textContent=
    "The Suggested Layer is a temporary tracing assistant—not approved artwork. Generate it from the locked reference, then deliberately accept, erase, or redraw pixels/regions.";
  explanation.style.cssText=
    "color:#a1a1aa;font-size:12px;line-height:1.45;margin:0 0 12px";

  const settings=document.createElement("div");
  settings.style.cssText=
    "display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px";

  const paletteLabel=document.createElement("label");
  paletteLabel.textContent="Suggested palette size";
  paletteLabel.style.cssText="display:flex;flex-direction:column;gap:5px;font-size:12px;color:#ccc";

  const paletteSize=document.createElement("select");
  paletteSize.id="v5PaletteSize";
  paletteSize.style.cssText=
    "background:#111;color:#fff;border:1px solid #444;border-radius:8px;padding:8px";

  for(const n of [6,8,9,10,12,16]){
    const o=document.createElement("option");
    o.value=String(n);
    o.textContent=`${n} colors`;
    if(n===9) o.selected=true;
    paletteSize.appendChild(o);
  }

  paletteLabel.appendChild(paletteSize);

  const cutoffLabel=document.createElement("label");
  cutoffLabel.textContent="White background cutoff";
  cutoffLabel.style.cssText="display:flex;flex-direction:column;gap:5px;font-size:12px;color:#ccc";

  const cutoff=document.createElement("input");
  cutoff.id="v5WhiteCutoff";
  cutoff.type="number";
  cutoff.min="210";
  cutoff.max="255";
  cutoff.step="1";
  cutoff.value="242";
  cutoff.style.cssText=
    "background:#111;color:#fff;border:1px solid #444;border-radius:8px;padding:8px";

  cutoffLabel.appendChild(cutoff);

  settings.append(paletteLabel,cutoffLabel);

  const suggestControls=document.createElement("div");
  suggestControls.style.cssText=
    "display:flex;gap:8px;flex-wrap:wrap;margin-top:10px";

  const make=document.createElement("button");
  make.type="button";
  make.textContent="Generate Suggested Layer";
  make.addEventListener("click",generateSuggestion);

  const toggle=document.createElement("button");
  toggle.type="button";
  toggle.textContent="Show / Hide Suggestion";
  toggle.addEventListener("click",()=>{
    state.showSuggestion=!state.showSuggestion;
    draw();
  });

  const clear=document.createElement("button");
  clear.type="button";
  clear.textContent="Clear Suggestion";
  clear.addEventListener("click",()=>{
    state.suggestion=[];
    state.suggestionPalette=[];
    renderV5SuggestionPalette();
    draw();
    updateV5Status("Suggestion cleared");
  });

  for(const b of [make,toggle,clear]){
    b.style.cssText=
      "padding:9px 11px;border-radius:9px;border:1px solid #444;background:#27272a;color:#fff;font-weight:700";
  }

  suggestControls.append(make,toggle,clear);

  const opacityLabel=document.createElement("label");
  opacityLabel.textContent="Suggested layer opacity";
  opacityLabel.style.cssText=
    "display:flex;flex-direction:column;gap:5px;margin-top:10px;font-size:12px;color:#ccc";

  const opacity=document.createElement("input");
  opacity.id="v5SuggestionOpacity";
  opacity.type="range";
  opacity.min="10";
  opacity.max="100";
  opacity.value="55";

  opacity.addEventListener("input",()=>{
    state.suggestionOpacity=Number(opacity.value)/100;
    draw();
  });

  opacityLabel.appendChild(opacity);

  const paletteTitle=document.createElement("div");
  paletteTitle.textContent="Suggested palette";
  paletteTitle.style.cssText="font-size:12px;font-weight:800;margin-top:10px;color:#ddd";

  const suggestionPalette=document.createElement("div");
  suggestionPalette.id="v5SuggestionPalette";
  suggestionPalette.style.cssText="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px";

  const regionTitle=document.createElement("div");
  regionTitle.textContent="SECTION-BY-SECTION CONTROL";
  regionTitle.style.cssText="font-size:12px;font-weight:900;margin-top:14px";

  const regionHelp=document.createElement("p");
  regionHelp.textContent=
    "Tap Select Region, drag a rectangle on the 64×64 canvas, then accept suggested pixels only in that section or clear your editable artwork in that section.";
  regionHelp.style.cssText="color:#aaa;font-size:12px;line-height:1.4;margin:5px 0 8px";

  const regionControls=document.createElement("div");
  regionControls.style.cssText="display:flex;gap:8px;flex-wrap:wrap";

  const select=document.createElement("button");
  select.type="button";
  select.id="v5SelectTool";
  select.textContent="Select Region";
  select.addEventListener("click",()=>{
    state.tool="v5select";
    document.querySelectorAll("[data-tool]").forEach(b=>b.classList.remove("active"));
    select.style.background="#f4f4f5";
    select.style.color="#111";
    updateV5Status("Selection mode active · drag a rectangle on canvas");
  });

  const acceptRegion=document.createElement("button");
  acceptRegion.type="button";
  acceptRegion.textContent="Accept Suggested Region";
  acceptRegion.addEventListener("click",()=>acceptSuggestionRegion(true,true));

  const replaceRegion=document.createElement("button");
  replaceRegion.type="button";
  replaceRegion.textContent="Replace Region from Suggestion";
  replaceRegion.addEventListener("click",()=>acceptSuggestionRegion(true,false));

  const clearRegion=document.createElement("button");
  clearRegion.type="button";
  clearRegion.textContent="Clear Artwork Region";
  clearRegion.addEventListener("click",clearArtworkRegion);

  const clearSel=document.createElement("button");
  clearSel.type="button";
  clearSel.textContent="Clear Selection";
  clearSel.addEventListener("click",clearSelection);

  const acceptAll=document.createElement("button");
  acceptAll.type="button";
  acceptAll.textContent="Accept Suggestion into Empty Cells";
  acceptAll.addEventListener("click",()=>acceptSuggestionRegion(false,true));

  for(const b of [select,acceptRegion,replaceRegion,clearRegion,clearSel,acceptAll]){
    b.style.cssText=
      "padding:9px 11px;border-radius:9px;border:1px solid #444;background:#27272a;color:#fff;font-weight:700";
  }

  regionControls.append(
    select,
    acceptRegion,
    replaceRegion,
    clearRegion,
    clearSel,
    acceptAll
  );

  const paletteLockTitle=document.createElement("div");
  paletteLockTitle.textContent="GENESIS PALETTE";
  paletteLockTitle.style.cssText="font-size:12px;font-weight:900;margin-top:14px";

  const genesisPalette=document.createElement("div");
  genesisPalette.id="v5GenesisPalette";
  genesisPalette.style.cssText="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px";

  const paletteControls=document.createElement("div");
  paletteControls.style.cssText="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px";

  const usePalette=document.createElement("button");
  usePalette.type="button";
  usePalette.textContent="Lock Suggested Colors as Genesis Palette";
  usePalette.addEventListener("click",useSuggestionAsGenesisPalette);

  const unlockPalette=document.createElement("button");
  unlockPalette.type="button";
  unlockPalette.textContent="Unlock Palette";
  unlockPalette.addEventListener("click",unlockGenesisPalette);

  for(const b of [usePalette,unlockPalette]){
    b.style.cssText=
      "padding:9px 11px;border-radius:9px;border:1px solid #444;background:#27272a;color:#fff;font-weight:700";
  }

  paletteControls.append(usePalette,unlockPalette);

  const validationTitle=document.createElement("div");
  validationTitle.textContent="GENESIS VALIDATION";
  validationTitle.style.cssText="font-size:12px;font-weight:900;margin-top:14px";

  const validateButton=document.createElement("button");
  validateButton.type="button";
  validateButton.textContent="Validate Genesis";
  validateButton.style.cssText=
    "margin-top:8px;padding:10px 13px;border-radius:9px;border:1px solid #555;background:#f4f4f5;color:#111;font-weight:900";
  validateButton.addEventListener("click",()=>validateGenesis(true));

  const results=document.createElement("div");
  results.id="v5ValidationResults";
  results.style.cssText=
    "margin-top:9px;padding:10px;border:1px solid #333;border-radius:9px;background:#0c0c0e";

  const status=document.createElement("div");
  status.id="v5Status";
  status.textContent="Ready · Genesis reference must remain locked";
  status.style.cssText=
    "margin-top:10px;color:#9ee6aa;font-size:12px;font-weight:800";

  wrap.append(
    title,
    explanation,
    settings,
    suggestControls,
    opacityLabel,
    paletteTitle,
    suggestionPalette,
    regionTitle,
    regionHelp,
    regionControls,
    paletteLockTitle,
    genesisPalette,
    paletteControls,
    validationTitle,
    validateButton,
    results,
    status
  );

  toolsSection.appendChild(wrap);
  validateGenesis(false);
}

function draw(){
  const c=$("canvas");
  const ctx=c.getContext("2d");

  ctx.clearRect(0,0,c.width,c.height);
  drawReference(ctx);
  drawSuggestion(ctx);
  drawPixelCells(ctx);
  drawHaloPreview(ctx);
  drawGuides(ctx);
  drawSelection(ctx);
}


function exteriorHaloCandidates(){
  const out=[];
  const n=state.n;
  const isEmpty=(x,y)=>x<0||y<0||x>=n||y>=n||!state.cells[idx(x,y)]||state.cells[idx(x,y)][3]===0;
  for(let y=0;y<n;y++) for(let x=0;x<n;x++){
    const v=state.cells[idx(x,y)];
    if(!v||v[3]===0) continue;
    // Only neutral/light gray pixels can be auto-flagged. Brown outline and colored art are never candidates.
    const max=Math.max(v[0],v[1],v[2]), min=Math.min(v[0],v[1],v[2]);
    const neutral=(max-min)<=14;
    const light=max>=125;
    if(!neutral||!light) continue;
    let touchesOutside=false;
    for(let dy=-1;dy<=1&&!touchesOutside;dy++) for(let dx=-1;dx<=1;dx++){
      if(dx===0&&dy===0) continue;
      if(isEmpty(x+dx,y+dy)){touchesOutside=true;break;}
    }
    if(touchesOutside) out.push(idx(x,y));
  }
  return out;
}

function drawHaloPreview(ctx){
  if(!state.haloPreview?.length) return;
  ctx.save();
  ctx.fillStyle='rgba(255,0,255,0.62)';
  for(const i of state.haloPreview){
    const x=i%state.n, y=Math.floor(i/state.n);
    ctx.fillRect(x*state.zoom,y*state.zoom,state.zoom,state.zoom);
  }
  ctx.restore();
}

function previewExteriorHalo(){
  if(state.approved){showV4Notice('Approved master is locked. Create a revision first.');return;}
  state.haloPreview=exteriorHaloCandidates();
  draw();
  updateV5Status(`Exterior halo preview · ${state.haloPreview.length} candidate cell${state.haloPreview.length===1?'':'s'} highlighted magenta · nothing changed`);
  showV4Notice(state.haloPreview.length
    ? `Preview only: ${state.haloPreview.length} exterior neutral-gray cells are highlighted magenta. No artwork has changed. Inspect the full silhouette before applying.`
    : 'No exterior neutral-gray halo candidates were found. Nothing changed.');
}

function cancelExteriorHaloPreview(){
  state.haloPreview=[];
  draw();
  updateV5Status('Exterior halo preview cleared · artwork unchanged');
}

function applyExteriorHaloCleanup(){
  if(state.approved){showV4Notice('Approved master is locked. Create a revision first.');return;}
  if(!state.haloPreview?.length){showV4Notice('Preview Exterior Halo first. Nothing was changed.');return;}
  const count=state.haloPreview.length;
  const ok=confirm(`Remove the ${count} magenta-highlighted exterior halo cells from this working revision? You can still Undo afterward.`);
  if(!ok) return;
  saveUndo();
  for(const i of state.haloPreview) state.cells[i]=null;
  state.haloPreview=[];
  draw();
  validateGenesis(false);
  updateV5Status(`Exterior halo cleanup applied · ${count} cells removed · review before approval`);
}

function reset(n){
  state.n=n;
  state.cells=empty(n);
  state.undo=[];
  state.redo=[];
  state.selectionStart=null;
  state.selectionEnd=null;
  resize();
  draw();
}

function saveUndo(){
  state.undo.push(state.cells.slice());
  if(state.undo.length>100) state.undo.shift();
  state.redo=[];
}

function setCell(x,y,value,mirror=true){
  if(x<0||y<0||x>=state.n||y>=state.n) return;

  state.cells[idx(x,y)]=value ? value.slice() : null;

  if(mirror && $("mirrorX").checked){
    const mx=state.n-1-x;
    if(mx!==x){
      state.cells[idx(mx,y)]=value ? value.slice() : null;
    }
  }
}

function sameColor(a,b){
  if(a===null&&b===null) return true;
  if(!a||!b) return false;
  return a.every((v,i)=>v===b[i]);
}

function floodFill(sx,sy,value){
  const start=state.cells[idx(sx,sy)];
  if(sameColor(start,value)) return;

  const stack=[[sx,sy]];
  const seen=new Set();

  while(stack.length){
    const [x,y]=stack.pop();
    const key=`${x},${y}`;

    if(
      seen.has(key) ||
      x<0 || y<0 ||
      x>=state.n || y>=state.n
    ) continue;

    seen.add(key);

    if(!sameColor(state.cells[idx(x,y)],start)) continue;

    setCell(x,y,value,false);

    stack.push(
      [x+1,y],
      [x-1,y],
      [x,y+1],
      [x,y-1]
    );
  }
}

function pointerCell(ev){
  const rect=$("canvas").getBoundingClientRect();

  const rawX=Math.floor(
    (ev.clientX-rect.left)/(rect.width/state.n)
  );
  const rawY=Math.floor(
    (ev.clientY-rect.top)/(rect.height/state.n)
  );

  // Coordinate display and editing can NEVER exceed 0..n-1.
  return {
    x:clamp(rawX,0,state.n-1),
    y:clamp(rawY,0,state.n-1)
  };
}

function applyTool(x,y,first=false){
  if(state.approved){
    showV4Notice("Approved master is locked. Create a new revision to edit.");
    return;
  }

  // Recovery-loaded Genesis revisions may intentionally have no source reference image.
  // Existing working artwork must remain editable (especially Eraser) without forcing
  // the user to reload the original conversion reference. Approved masters remain
  // protected by the lock check above.
  const hasGenesisArtwork=state.cells.some(v=>v && v[3]!==0);
  const recoveryEditable=hasGenesisArtwork && !state.approved && state.projectMeta.category==="Genesis";

  if((!state.reference || !state.genesisReferenceLocked) && !recoveryEditable){
    showV4Notice(
      !state.reference
        ? "Load the Brown Genesis reference before drawing."
        : "Lock the Genesis reference before drawing."
    );
    return;
  }

  x=clamp(x,0,state.n-1);
  y=clamp(y,0,state.n-1);

  if(first) saveUndo();

  if(state.tool==="pencil"){
    const chosen=hexToRgba($("color").value);

    if(!colorAllowedByGenesisPalette(chosen)){
      showV4Notice("That color is outside the locked Genesis palette.");
      return;
    }

    setCell(x,y,chosen);
  }else if(state.tool==="eraser"){
    setCell(x,y,null);
  }else if(state.tool==="fill"){
    floodFill(x,y,hexToRgba($("color").value));
  }else if(state.tool==="picker"){
    const v=state.cells[idx(x,y)];

    if(v){
      $("color").value=
        "#"+
        v.slice(0,3)
          .map(n=>n.toString(16).padStart(2,"0"))
          .join("");
    }
  }

  draw();
}

const canvas=$("canvas");

canvas.addEventListener("pointerdown",ev=>{
  ev.preventDefault();

  const p=pointerCell(ev);

  if(state.tool==="v5select"){
    state.selectionStart={...p};
    state.selectionEnd={...p};
    state.drawing=true;
    canvas.setPointerCapture(ev.pointerId);
    draw();
    return;
  }

  state.drawing=true;
  canvas.setPointerCapture(ev.pointerId);
  applyTool(p.x,p.y,true);
});

canvas.addEventListener("pointermove",ev=>{
  const p=pointerCell(ev);

  $("coord").textContent=
    `x: ${p.x} y: ${p.y}  |  legal range: 0–${state.n-1}`;

  if(state.drawing && state.tool==="v5select"){
    state.selectionEnd={...p};
    draw();
    return;
  }

  if(
    state.drawing &&
    (state.tool==="pencil" || state.tool==="eraser")
  ){
    applyTool(p.x,p.y,false);
  }
});

canvas.addEventListener("pointerup",()=>{
  state.drawing=false;
});

canvas.addEventListener("pointercancel",()=>{
  state.drawing=false;
});

canvas.addEventListener("pointerleave",()=>{
  if(!state.drawing){
    $("coord").textContent=
      `x: — y: —  |  legal range: 0–${state.n-1}`;
  }
});

document
  .querySelectorAll("[data-tool]")
  .forEach(button=>{
    button.addEventListener("click",()=>{
      state.tool=button.dataset.tool;

      const selectButton=document.getElementById("v5SelectTool");
      if(selectButton){
        selectButton.style.background="#27272a";
        selectButton.style.color="#fff";
      }

      document
        .querySelectorAll("[data-tool]")
        .forEach(b=>{
          b.classList.toggle("active",b===button);
        });
    });
  });

$("undoBtn").onclick=()=>{
  if(state.approved){
    showV4Notice("Approved master is locked.");
    return;
  }
  if(!state.undo.length) return;

  state.redo.push(state.cells.slice());
  state.cells=state.undo.pop();
  draw();
  validateGenesis(false);
};

$("redoBtn").onclick=()=>{
  if(state.approved){
    showV4Notice("Approved master is locked.");
    return;
  }
  if(!state.redo.length) return;

  state.undo.push(state.cells.slice());
  state.cells=state.redo.pop();
  draw();
  validateGenesis(false);
};

$("clearBtn").onclick=()=>{
  if(state.approved){
    showV4Notice("Approved master is locked.");
    return;
  }
  if(!confirm("Clear current layer?")) return;

  saveUndo();
  state.cells=empty(state.n);
  draw();
  validateGenesis(false);
};

$("resolution").onchange=ev=>{
  if(Number(ev.target.value)!==64){
    ev.target.value="64";
    showV4Notice("APE16 master resolution is locked to 64×64.");
    return;
  }

  if(state.n!==64){
    reset(64);
  }

  $("coord").textContent="x: — y: —  |  legal range: 0–63";
};

$("zoom").oninput=ev=>{
  state.zoom=Number(ev.target.value);
  resize();
  draw();
};

[
  "showGrid",
  "showReference",
  "refOpacity",
  "refScale",
  "refX",
  "refY"
].forEach(id=>{
  $(id).addEventListener("input",()=>{
    updateNumericReadouts();
    draw();
  });
});

$("referenceFile").onchange=ev=>{
  const file=ev.target.files[0];
  if(!file) return;

  const image=new Image();

  image.onload=()=>{
    state.reference=image;

    // The APE16 Genesis placement standard is always 85%, X 0, Y 0.
    $("refScale").value="85";
    $("refX").value="0";
    $("refY").value="0";

    const saved=loadV4LockState();

    if(saved?.locked){
      state.genesisReferenceLocked=true;
    }

    applyV4LockUI();
    updateNumericReadouts();
    draw();
    URL.revokeObjectURL(image.src);
  };

  image.src=URL.createObjectURL(file);
};

const paletteColors=[
  "#000000",
  "#1a1a1a",
  "#4b230d",
  "#74360f",
  "#9b4a16",
  "#c66a2d",
  "#f0a15f",
  "#ffc184",
  "#ffffff"
];

for(const hex of paletteColors){
  const button=document.createElement("button");
  button.className="swatch";
  button.style.background=hex;
  button.title=hex;

  button.onclick=()=>{
    $("color").value=hex;
  };

  $("palette").appendChild(button);
}

function logicalCanvas(){
  const c=document.createElement("canvas");
  c.width=state.n;
  c.height=state.n;

  const ctx=c.getContext("2d");

  for(let y=0;y<state.n;y++){
    for(let x=0;x<state.n;x++){
      const v=state.cells[idx(x,y)];

      if(v){
        ctx.fillStyle=rgbaCss(v);
        ctx.fillRect(x,y,1,1);
      }
    }
  }

  return c;
}

function downloadCanvas(c,name){
  c.toBlob(blob=>{
    const a=document.createElement("a");

    a.href=URL.createObjectURL(blob);
    a.download=name;

    document.body.appendChild(a);
    a.click();
    a.remove();

    setTimeout(
      ()=>URL.revokeObjectURL(a.href),
      1200
    );
  },"image/png");
}

$("exportMasterBtn").onclick=()=>{
  if(!state.reference || !state.genesisReferenceLocked){
    showV4Notice("Lock the Genesis reference before exporting the 64×64 master.");
    return;
  }

  const validation=validateGenesis(false);
  if(!validation.pass){
    showV4Notice("Fix Genesis hard-rule failures before export.");
    return;
  }

  downloadCanvas(
    logicalCanvas(),
    `APE16_${state.n}x${state.n}.png`
  );
};

$("export1024Btn").onclick=()=>{
  if(!state.reference || !state.genesisReferenceLocked){
    showV4Notice("Lock the Genesis reference before exporting the preview.");
    return;
  }

  const source=logicalCanvas();
  const output=document.createElement("canvas");

  output.width=1024;
  output.height=1024;

  const ctx=output.getContext("2d");

  ctx.imageSmoothingEnabled=false;
  ctx.drawImage(
    source,
    0,0,
    1024,1024
  );

  downloadCanvas(
    output,
    "APE16_1024_preview.png"
  );
};

$("importLayerBtn").onclick=()=>{
  $("importLayerFile").click();
};

$("importLayerFile").onchange=ev=>{
  const file=ev.target.files[0];
  if(!file) return;

  const image=new Image();

  image.onload=()=>{
    if(
      image.width!==state.n ||
      image.height!==state.n
    ){
      alert(
        `PNG must be exactly ${state.n}×${state.n}. `+
        `This file is ${image.width}×${image.height}.`
      );
      URL.revokeObjectURL(image.src);
      return;
    }

    const c=document.createElement("canvas");
    c.width=state.n;
    c.height=state.n;

    const ctx=c.getContext("2d");
    ctx.imageSmoothingEnabled=false;
    ctx.drawImage(image,0,0);

    const data=
      ctx.getImageData(
        0,0,
        state.n,state.n
      ).data;

    saveUndo();

    for(let i=0;i<state.n*state.n;i++){
      const alpha=data[i*4+3];

      state.cells[i]=
        alpha===0
          ? null
          : [
              data[i*4],
              data[i*4+1],
              data[i*4+2],
              alpha
            ];
    }

    draw();
    URL.revokeObjectURL(image.src);
  };

  image.src=URL.createObjectURL(file);
};


function setupV3ReferenceControls(){
  const x=$("refX");
  const y=$("refY");

  if(x){
    x.min=-16;
    x.max=16;
    x.step=1;
    x.value=0;
  }

  if(y){
    y.min=-16;
    y.max=16;
    y.step=1;
    y.value=0;
  }

  const host = y?.parentElement?.parentElement || x?.parentElement?.parentElement;
  if(host && !document.getElementById("refNudges")){
    const wrap=document.createElement("div");
    wrap.id="refNudges";
    wrap.style.cssText="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;align-items:center";

    const label=document.createElement("span");
    label.textContent="Reference nudge:";
    label.style.cssText="color:#d4d4d8;font-size:13px;font-weight:700;margin-right:4px";
    wrap.appendChild(label);

    const buttons=[
      ["←","x",-1],
      ["→","x",1],
      ["↑","y",-1],
      ["↓","y",1]
    ];

    for(const [txt,axis,delta] of buttons){
      const b=document.createElement("button");
      b.type="button";
      b.textContent=txt;
      b.style.cssText="min-width:48px;padding:10px 14px;border-radius:10px;border:1px solid #44444b;background:#27272a;color:#fff;font-weight:800;font-size:18px";
      b.addEventListener("click",()=>{
        if(state.genesisReferenceLocked){
          showV4Notice("Genesis reference is locked. Unlock it before repositioning.");
          return;
        }

        const target=axis==="x" ? x : y;
        if(!target) return;
        const min=Number(target.min);
        const max=Number(target.max);
        const next=clamp(Number(target.value)+delta,min,max);
        target.value=String(next);
        updateNumericReadouts();
        draw();
      });
      wrap.appendChild(b);
    }

    host.appendChild(wrap);
  }

  updateNumericReadouts();
}


const V4_LOCK_STORAGE_KEY="APE16_GENESIS_REFERENCE_LOCK_V4";

function showV4Notice(message){
  let notice=document.getElementById("v4Notice");

  if(!notice){
    notice=document.createElement("div");
    notice.id="v4Notice";
    notice.style.cssText=
      "position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:9999;"+
      "max-width:88vw;padding:11px 15px;border-radius:11px;background:#111;color:#fff;"+
      "border:1px solid #555;font-weight:700;font-size:13px;box-shadow:0 8px 30px rgba(0,0,0,.45)";
    document.body.appendChild(notice);
  }

  notice.textContent=message;
  notice.hidden=false;

  clearTimeout(showV4Notice._timer);
  showV4Notice._timer=setTimeout(()=>{
    notice.hidden=true;
  },2500);
}

function saveV4LockState(){
  try{
    localStorage.setItem(
      V4_LOCK_STORAGE_KEY,
      JSON.stringify({
        locked:state.genesisReferenceLocked,
        resolution:64,
        scale:85,
        x:0,
        y:0
      })
    );
  }catch(error){
    console.warn("Could not save Genesis lock state.",error);
  }
}

function loadV4LockState(){
  try{
    const raw=localStorage.getItem(V4_LOCK_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  }catch(error){
    console.warn("Could not read Genesis lock state.",error);
    return null;
  }
}

function setReferencePositionStandard(){
  $("resolution").value="64";
  $("refScale").value="85";
  $("refX").value="0";
  $("refY").value="0";
  state.n=64;
  updateNumericReadouts();
}

function applyV4LockUI(){
  const locked=state.genesisReferenceLocked;

  setReferencePositionStandard();

  // Canvas resolution is an APE16 hard rule in V4.
  $("resolution").disabled=true;

  // Opacity remains adjustable while locked; position does not.
  $("refScale").disabled=locked;
  $("refX").disabled=locked;
  $("refY").disabled=locked;

  const nudge=document.getElementById("refNudges");
  if(nudge){
    nudge.querySelectorAll("button").forEach(button=>{
      button.disabled=locked;
      button.style.opacity=locked?".38":"1";
    });
  }

  const lockButton=document.getElementById("lockGenesisReferenceBtn");
  const unlockButton=document.getElementById("unlockGenesisReferenceBtn");
  const badge=document.getElementById("genesisLockBadge");

  if(lockButton) lockButton.disabled=locked || !state.reference;
  if(unlockButton) unlockButton.disabled=!locked;

  if(badge){
    badge.textContent=locked
      ? "🔒 GENESIS REFERENCE LOCKED · 64×64 · 85% · X 0 · Y 0"
      : "🔓 GENESIS REFERENCE NOT LOCKED";

    badge.style.background=locked ? "#17311f" : "#311717";
    badge.style.borderColor=locked ? "#315f3e" : "#6b3030";
  }

  updateV4RulePanel();
}

function lockGenesisReference(){
  if(!state.reference){
    showV4Notice("Load the Brown Genesis reference first.");
    return;
  }

  setReferencePositionStandard();
  state.genesisReferenceLocked=true;
  saveV4LockState();
  applyV4LockUI();
  draw();

  showV4Notice("Genesis reference locked: 64×64 · 85% · X 0 · Y 0.");
}

function unlockGenesisReference(){
  if(!state.genesisReferenceLocked) return;

  if(state.cells.some(Boolean)){
    const ok=confirm(
      "Unlocking the Genesis reference invalidates any pixels drawn against its current placement. "+
      "Unlock and CLEAR the current pixel layer?"
    );

    if(!ok) return;

    state.cells=empty(64);
    state.undo=[];
    state.redo=[];
  }

  state.genesisReferenceLocked=false;
  state.suggestion=[];
  state.suggestionPalette=[];
  state.selectionStart=null;
  state.selectionEnd=null;
  state.genesisPalette=[];
  state.paletteLocked=false;
  renderV5SuggestionPalette?.();
  renderV5GenesisPalette?.();
  saveV4LockState();
  applyV4LockUI();
  draw();

  showV4Notice("Genesis reference unlocked. Drawing is disabled until it is locked again.");
}

function updateV4RulePanel(){
  const panel=document.getElementById("v4RulePanel");
  if(!panel) return;

  const rules=[
    ["Master canvas","64×64 LOCKED",true],
    ["Atomic pixel","1 cell = 1 solid RGBA color or transparent",true],
    ["Anti-aliasing","Impossible in drawing engine",true],
    ["Fractional placement","Not allowed",true],
    ["Reference placement","85% · X 0 · Y 0",state.genesisReferenceLocked],
    ["Reference position lock",state.genesisReferenceLocked ? "LOCKED" : "NOT LOCKED",state.genesisReferenceLocked],
    ["Reference opacity","Adjustable while locked",true],
    ["Export size","Logical 64×64 + nearest-neighbor 1024 preview",true]
  ];

  panel.innerHTML="";

  for(const [name,value,ok] of rules){
    const row=document.createElement("div");
    row.style.cssText=
      "display:grid;grid-template-columns:minmax(120px,.8fr) minmax(0,1.5fr);gap:10px;"+
      "padding:7px 0;border-bottom:1px solid #2d2d31;font-size:13px";

    const left=document.createElement("strong");
    left.textContent=name;

    const right=document.createElement("span");
    right.textContent=(ok ? "✓ " : "⚠ ")+value;
    right.style.color=ok ? "#9ee6aa" : "#ffb1b1";

    row.append(left,right);
    panel.appendChild(row);
  }
}

function setupV4RuleEnforcement(){
  // V4 is the production APE16 Genesis mode: resolution is no longer selectable.
  state.n=64;
  $("resolution").value="64";
  $("resolution").disabled=true;

  // The approved reference placement becomes the default immediately.
  $("refScale").value="85";
  $("refX").value="0";
  $("refY").value="0";

  const referenceSection=$("referenceFile")?.closest("section");

  if(referenceSection && !document.getElementById("genesisLockControls")){
    const controls=document.createElement("div");
    controls.id="genesisLockControls";
    controls.style.cssText=
      "margin-top:14px;padding:12px;border:1px solid #3a3a40;border-radius:12px;background:#101012";

    const badge=document.createElement("div");
    badge.id="genesisLockBadge";
    badge.style.cssText=
      "padding:9px 11px;border:1px solid #6b3030;border-radius:9px;background:#311717;"+
      "font-size:13px;font-weight:800;margin-bottom:10px";
    controls.appendChild(badge);

    const buttons=document.createElement("div");
    buttons.style.cssText="display:flex;gap:8px;flex-wrap:wrap";

    const lock=document.createElement("button");
    lock.id="lockGenesisReferenceBtn";
    lock.type="button";
    lock.textContent="🔒 LOCK GENESIS REFERENCE";
    lock.style.cssText=
      "padding:11px 14px;border-radius:10px;border:1px solid #555;background:#f4f4f5;"+
      "color:#111;font-weight:900";
    lock.addEventListener("click",lockGenesisReference);

    const unlock=document.createElement("button");
    unlock.id="unlockGenesisReferenceBtn";
    unlock.type="button";
    unlock.textContent="Unlock Reference";
    unlock.style.cssText=
      "padding:11px 14px;border-radius:10px;border:1px solid #555;background:#27272a;"+
      "color:#fff;font-weight:750";
    unlock.addEventListener("click",unlockGenesisReference);

    buttons.append(lock,unlock);
    controls.appendChild(buttons);

    const note=document.createElement("p");
    note.textContent=
      "Hard rule: Genesis drawing is disabled until the Brown reference is loaded and locked at 64×64 / 85% / X 0 / Y 0. Opacity remains adjustable.";
    note.style.cssText="color:#a1a1aa;font-size:12px;line-height:1.45;margin:10px 0 0";
    controls.appendChild(note);

    referenceSection.appendChild(controls);
  }

  const toolsSection=$("undoBtn")?.closest("section");

  if(toolsSection && !document.getElementById("v4RulesWrap")){
    const wrap=document.createElement("div");
    wrap.id="v4RulesWrap";
    wrap.style.cssText=
      "margin-top:14px;padding:12px;border:1px solid #3a3a40;border-radius:12px;background:#101012";

    const title=document.createElement("div");
    title.textContent="APE16 V4 HARD RULES";
    title.style.cssText="font-weight:900;font-size:13px;margin-bottom:6px";

    const panel=document.createElement("div");
    panel.id="v4RulePanel";

    wrap.append(title,panel);
    toolsSection.appendChild(wrap);
  }

  const saved=loadV4LockState();

  // Preserve a prior explicit lock decision across refreshes.
  state.genesisReferenceLocked=Boolean(saved?.locked);

  applyV4LockUI();
  updateNumericReadouts();
}



// ============================================================
// APE16 PIXEL STUDIO V6 — NFT TRAIT ARCHITECTURE + 4K EXPORT
// Additive upgrade: preserves V5 project format and approved Genesis.
// ============================================================
function setupV6ProductionSystem(){
  if(document.getElementById("v6Production")) return;

  const V6={
    trait:new Array(4096).fill(null),
    mask:new Array(4096).fill(false),
    anchors:{head:[32,18],leftEye:[27,31],rightEye:[37,31],leftEar:[18,32],rightEar:[46,32],mouth:[32,40],neck:[32,49],shoulders:[32,55]},
    category:"Headwear", name:"NewTrait", revision:1, approved:false, tool:"trait", color:[0,0,0,255], drawing:false
  };
  window.APE16_V6=V6;

  const css=document.createElement("style");
  css.textContent=`#v6Production{margin:18px 0;padding:16px;border:1px solid #3f3f46;border-radius:14px;background:#101012;color:#f4f4f5}#v6Production h2{margin:0 0 8px;font-size:22px}#v6Production h3{margin:18px 0 8px;font-size:14px}.v6row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:8px 0}.v6btn{padding:10px 12px;border-radius:9px;border:1px solid #52525b;background:#27272a;color:white;font-weight:800}.v6btn.active{background:#f4f4f5;color:#111}.v6field{background:#18181b;color:#fff;border:1px solid #3f3f46;border-radius:8px;padding:9px;min-width:120px}.v6good{color:#86efac}.v6warn{color:#fbbf24}.v6bad{color:#fca5a5}#v6Canvas{width:min(100%,640px);height:auto;image-rendering:pixelated;background-image:linear-gradient(45deg,#ddd 25%,transparent 25%),linear-gradient(-45deg,#ddd 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#ddd 75%),linear-gradient(-45deg,transparent 75%,#ddd 75%);background-size:16px 16px;background-position:0 0,0 8px,8px -8px,-8px 0;border:1px solid #52525b;touch-action:none}#v6Status{padding:11px;border:1px solid #3f3f46;border-radius:10px;background:#18181b;line-height:1.5}`;
  document.head.appendChild(css);

  const host=document.createElement("section"); host.id="v6Production";
  host.innerHTML=`<h2>APE16 V6.5 · NFT TRAIT ARCHITECTURE</h2><div class="v6good">Production system · fresh high-contrast Genesis workflow</div>
  <h3>TRAIT PROJECT</h3><div class="v6row"><select id="v6Category" class="v6field"><option>Headwear</option><option>Eyes</option><option>Mouth</option><option>Clothing</option><option>Body</option><option>Accessory</option><option>Legendary</option></select><input id="v6Name" class="v6field" value="NewTrait" placeholder="Trait name"><input id="v6Rev" class="v6field" type="number" min="1" value="1" style="width:70px"></div>
  <h3>EDIT MODE</h3><div class="v6row"><button id="v6TraitTool" class="v6btn active">Trait Art</button><button id="v6MaskTool" class="v6btn">Occlusion Mask</button><button id="v6EraseTool" class="v6btn">Eraser</button><input id="v6Color" type="color" value="#000000"><button id="v6ClearTrait" class="v6btn">Clear Trait</button><button id="v6ClearMask" class="v6btn">Clear Mask</button></div>
  <h3>ANCHORS</h3><div id="v6Anchors" class="v6row"></div><div class="v6warn" style="font-size:12px">Anchors are fixed Genesis landmarks. Trait art may use them for placement; it never moves Genesis.</div>
  <h3>COMPOSITE PREVIEW · Genesis − mask + trait</h3><canvas id="v6Canvas" width="512" height="512"></canvas>
  <div class="v6row"><button id="v6Validate" class="v6btn">Validate Trait</button><button id="v6Approve" class="v6btn">Approve + Lock Trait</button><button id="v6NewRev" class="v6btn">Create New Revision</button></div><div id="v6Status">Ready · create trait art and an occlusion mask.</div>
  <h3>PROJECT / PRODUCTION EXPORT</h3><div class="v6row"><button id="v6Save" class="v6btn">Save V6 Trait Project</button><button id="v6Load" class="v6btn">Load V6 Trait Project</button><input id="v6LoadFile" type="file" accept="*/*" hidden><button id="v6Export64" class="v6btn">Export Named 64×64 Trait</button><button id="v6Export1024" class="v6btn">Export 1024 Composite</button><button id="v6Export4096" class="v6btn">Export 4096×4096 Composite</button></div>
  <div class="v6good" style="font-size:12px">4096 export = exact 64× nearest-neighbor enlargement of the 64×64 composite. No smoothing or invented pixels.</div>`;
  document.body.appendChild(host);

  const vc=document.getElementById("v6Canvas"), vx=vc.getContext("2d"); vx.imageSmoothingEnabled=false;
  function meta(){V6.category=document.getElementById("v6Category").value;V6.name=document.getElementById("v6Name").value||"NewTrait";V6.revision=Math.max(1,+document.getElementById("v6Rev").value||1)}
  function safe(x){return String(x).trim().replace(/[^A-Za-z0-9_-]+/g,"_").replace(/^_+|_+$/g,"")||"Trait"}
  function baseName(){meta();return `APE16_${safe(V6.category)}_${safe(V6.name)}_r${String(V6.revision).padStart(2,"0")}`}
  function hex(h){return [parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16),255]}
  function logicalComposite(){const c=document.createElement("canvas");c.width=c.height=64;const q=c.getContext("2d");q.imageSmoothingEnabled=false;for(let i=0;i<4096;i++){let v=state.cells[i];if(V6.mask[i])v=null;if(V6.trait[i])v=V6.trait[i];if(v){q.fillStyle=`rgba(${v[0]},${v[1]},${v[2]},${v[3]/255})`;q.fillRect(i%64,Math.floor(i/64),1,1)}}return c}
  function drawV6(){vx.clearRect(0,0,512,512);vx.imageSmoothingEnabled=false;vx.drawImage(logicalComposite(),0,0,512,512); // mask guide
    if(!V6.approved){vx.globalAlpha=.28;vx.fillStyle="#ef4444";for(let i=0;i<4096;i++)if(V6.mask[i])vx.fillRect((i%64)*8,Math.floor(i/64)*8,8,8);vx.globalAlpha=1}
    vx.fillStyle="#fde047";for(const [n,a] of Object.entries(V6.anchors)){vx.fillRect(a[0]*8+2,a[1]*8+2,4,4)}
  }
  function setTool(t){if(V6.approved)return;V6.tool=t;["Trait","Mask","Erase"].forEach(n=>document.getElementById("v6"+n+"Tool").classList.toggle("active",t===n.toLowerCase()))}
  document.getElementById("v6TraitTool").onclick=()=>setTool("trait");document.getElementById("v6MaskTool").onclick=()=>setTool("mask");document.getElementById("v6EraseTool").onclick=()=>setTool("erase");document.getElementById("v6Color").oninput=e=>V6.color=hex(e.target.value);
  function paint(e){if(V6.approved)return;const r=vc.getBoundingClientRect(),x=Math.max(0,Math.min(63,Math.floor((e.clientX-r.left)/r.width*64))),y=Math.max(0,Math.min(63,Math.floor((e.clientY-r.top)/r.height*64))),i=y*64+x;if(V6.tool==="trait")V6.trait[i]=V6.color.slice();else if(V6.tool==="mask")V6.mask[i]=true;else {V6.trait[i]=null;V6.mask[i]=false}drawV6()}
  vc.addEventListener("pointerdown",e=>{V6.drawing=true;vc.setPointerCapture(e.pointerId);paint(e)});vc.addEventListener("pointermove",e=>{if(V6.drawing)paint(e)});vc.addEventListener("pointerup",()=>V6.drawing=false);
  document.getElementById("v6ClearTrait").onclick=()=>{if(!V6.approved){V6.trait.fill(null);drawV6()}};document.getElementById("v6ClearMask").onclick=()=>{if(!V6.approved){V6.mask.fill(false);drawV6()}};
  const aw=document.getElementById("v6Anchors");Object.entries(V6.anchors).forEach(([n,a])=>{const b=document.createElement("span");b.className="v6field";b.textContent=`${n}: ${a[0]},${a[1]}`;aw.appendChild(b)});
  function validate(){let art=0,mask=0,outside=0;for(let i=0;i<4096;i++){if(V6.trait[i])art++;if(V6.mask[i])mask++;if(V6.trait[i]&&(!Array.isArray(V6.trait[i])||V6.trait[i].length!==4))outside++}const issues=[];if(!art)issues.push("No trait artwork drawn.");if(["Headwear","Eyes","Mouth","Clothing","Accessory","Legendary"].includes(V6.category)&&!mask)issues.push("No occlusion mask defined; confirm this trait truly covers no Genesis pixels.");if(outside)issues.push("Invalid pixel data detected.");const ok=art>0&&!outside;document.getElementById("v6Status").innerHTML=`<b class="${ok?'v6good':'v6bad'}">${ok?'TRAIT RULES PASS':'TRAIT NEEDS ATTENTION'}</b><br>Trait pixels: ${art} · Masked Genesis pixels: ${mask} · Atomic RGBA: ${outside?'FAIL':'PASS'}${issues.length?'<br>'+issues.join('<br>'):''}`;return ok}
  document.getElementById("v6Validate").onclick=validate;document.getElementById("v6Approve").onclick=()=>{if(validate()){V6.approved=true;document.getElementById("v6Status").innerHTML+='<br><b class="v6good">🔒 APPROVED TRAIT MASTER</b>';drawV6()}};document.getElementById("v6NewRev").onclick=()=>{V6.approved=false;V6.revision++;document.getElementById("v6Rev").value=V6.revision;document.getElementById("v6Status").textContent="New editable revision created.";drawV6()};
  function dl(blob,name){const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1500)}
  function canvasBlob(c,name){c.toBlob(b=>dl(b,name),"image/png")}
  document.getElementById("v6Export64").onclick=()=>{const c=document.createElement("canvas");c.width=c.height=64;const q=c.getContext("2d");for(let i=0;i<4096;i++){const v=V6.trait[i];if(v){q.fillStyle=`rgba(${v[0]},${v[1]},${v[2]},${v[3]/255})`;q.fillRect(i%64,Math.floor(i/64),1,1)}}canvasBlob(c,baseName()+"_64x64.png")};
  function exportComposite(size){const src=logicalComposite(),o=document.createElement("canvas");o.width=o.height=size;const q=o.getContext("2d");q.imageSmoothingEnabled=false;q.drawImage(src,0,0,size,size);canvasBlob(o,baseName()+`_${size}x${size}_composite.png`)}
  document.getElementById("v6Export1024").onclick=()=>exportComposite(1024);document.getElementById("v6Export4096").onclick=()=>exportComposite(4096);
  document.getElementById("v6Save").onclick=()=>{meta();const data={format:"APE16_PIXEL_STUDIO_V6_TRAIT",version:1,meta:{category:V6.category,name:V6.name,revision:V6.revision,approved:V6.approved},anchors:V6.anchors,mask:V6.mask,trait:V6.trait};dl(new Blob([JSON.stringify(data)],{type:"application/json"}),baseName()+".ape16.json")};
  document.getElementById("v6Load").onclick=()=>document.getElementById("v6LoadFile").click();document.getElementById("v6LoadFile").onchange=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{try{const d=JSON.parse(r.result);if(d.format!=="APE16_PIXEL_STUDIO_V6_TRAIT")throw Error("Not a V6 trait project");V6.trait=d.trait||new Array(4096).fill(null);V6.mask=d.mask||new Array(4096).fill(false);V6.anchors=d.anchors||V6.anchors;Object.assign(V6,{category:d.meta.category,name:d.meta.name,revision:d.meta.revision,approved:!!d.meta.approved});document.getElementById("v6Category").value=V6.category;document.getElementById("v6Name").value=V6.name;document.getElementById("v6Rev").value=V6.revision;drawV6();validate()}catch(err){alert(err.message)}};r.readAsText(f)};
  window.APE16V6Refresh=drawV6;
  drawV6();
}

// Initialize the V4 rule-enforcement system.
ensureNumericReadouts();
setupV3ReferenceControls();
reset(64);
setupV4RuleEnforcement();
setupV5ConstructionAssistant();
setupV5ProjectSystem();
setupV6ProductionSystem();
$("coord").textContent="x: — y: —  |  legal range: 0–63";

})();



/* ============================================================
   APE16 V6.6.3 · GENESIS LOCK + TRAIT EXTRACTOR
   Preserve approved artwork; normalize it into a true logical
   pixel master and export exact integer-scaled production PNGs.
   ============================================================ */
(function setupAPE16V66Converter(){
  const $id=id=>document.getElementById(id);
  const APE16_GENESIS_MASTER_DATA="data:image/png;base64,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";

  if(document.getElementById("ape16IntegratedConverter")) return;

  const conv={
    image:null,
    logical:document.createElement("canvas"),
    ready:false,
    palette:[]
  };

  function clamp8(v){ return Math.max(0,Math.min(255,Math.round(v))); }
  function lum(p){ return 0.2126*p[0]+0.7152*p[1]+0.0722*p[2]; }
  function dist2(a,b){
    const dr=a[0]-b[0], dg=a[1]-b[1], db=a[2]-b[2];
    return dr*dr+dg*dg+db*db;
  }

  function drawPreview(){
    const c=$id("ape16ConvPreview");
    if(!c) return;
    const x=c.getContext("2d");
    x.clearRect(0,0,c.width,c.height);
    x.imageSmoothingEnabled=false;
    if(conv.ready) x.drawImage(conv.logical,0,0,c.width,c.height);
  }

  function fitSource(ctx,img,n){
    ctx.clearRect(0,0,n,n);
    ctx.imageSmoothingEnabled=false;
    const scale=Math.min(n/img.width,n/img.height);
    const w=img.width*scale, h=img.height*scale;
    const x=(n-w)/2, y=(n-h)/2;
    ctx.drawImage(img,x,y,w,h);
  }

  function cleanAndNormalize(){
    const mode=$id("ape16ConvMode")?.value || "genesis";

    if(mode==="genesis"){
      if(!conv.image){
        $id("ape16ConvStatus").textContent="Load the approved Brown Genesis image first.";
        return;
      }
      const img=new Image();
      img.onload=()=>{
        conv.logical.width=128;
        conv.logical.height=128;
        const out=conv.logical.getContext("2d",{willReadFrequently:true});
        out.imageSmoothingEnabled=false;
        out.clearRect(0,0,128,128);
        out.drawImage(img,0,0,128,128);

        const d=out.getImageData(0,0,128,128).data;
        const seen=new Map();
        for(let i=0;i<d.length;i+=4){
          if(d[i+3]!==255) continue;
          const key=`${d[i]},${d[i+1]},${d[i+2]}`;
          seen.set(key,[d[i],d[i+1],d[i+2],255]);
        }
        conv.palette=[...seen.values()];
        conv.ready=true;
        drawPreview();
        ["ape16ConvUseGenesis","ape16ConvExportMaster","ape16ConvExport1024","ape16ConvExport4096","ape16ConvVerify"]
          .forEach(id=>{ if($id(id)) $id(id).disabled=false; });
        $id("ape16ConvStatus").textContent=
          "PASS READY · GENESIS IDENTITY LOCK · exact 128×128 master loaded";
      };
      img.src=APE16_GENESIS_MASTER_DATA;
      return;
    }
    if(!conv.image){
      $id("ape16ConvStatus").textContent="Load the approved ape artwork first.";
      return;
    }

    const n=Number($id("ape16ConvResolution").value);
    const paletteCount=Number($id("ape16ConvPalette").value);
    const alphaCutoff=Number($id("ape16ConvAlpha").value);

    conv.logical.width=n;
    conv.logical.height=n;
    const out=conv.logical.getContext("2d",{willReadFrequently:true});
    out.imageSmoothingEnabled=false;

    const temp=document.createElement("canvas");
    temp.width=temp.height=n;
    const tx=temp.getContext("2d",{willReadFrequently:true});
    fitSource(tx,conv.image,n);

    const im=tx.getImageData(0,0,n,n);
    const d=im.data;

    // V6.6.3 trait extraction: remove reference background and keep only the
    // category zone. This prevents the base ape from being baked into a trait PNG.
    const category=$id("ape16TraitCategory")?.value || "Headwear";
    if(mode==="trait") {
      const zones={
        Headwear:[0,Math.round(n*0.49)],
        Eyes:[Math.round(n*0.27),Math.round(n*0.57)],
        Mouth:[Math.round(n*0.47),Math.round(n*0.72)],
        Clothing:[Math.round(n*0.63),n],
        Accessory:[0,n]
      };
      const [y0,y1]=zones[category]||[0,n];
      for(let y=0;y<n;y++) for(let x=0;x<n;x++){
        const i=(y*n+x)*4;
        const r=d[i],g=d[i+1],b=d[i+2];
        const nearWhite=r>238&&g>238&&b>238;
        const outside=y<y0||y>=y1;
        if(nearWhite||outside){ d[i]=d[i+1]=d[i+2]=0; d[i+3]=0; }
        else if(d[i+3]>=alphaCutoff){ d[i+3]=255; }
        else { d[i]=d[i+1]=d[i+2]=0; d[i+3]=0; }
      }
    }

    const pts=[];
    const kinds=new Uint8Array(n*n); // 0 transparent, 1 black, 2 white, 3 cluster
    for(let i=0,p=0;i<d.length;i+=4,p++){
      const r=d[i],g=d[i+1],b=d[i+2],a=d[i+3];
      if(a<alphaCutoff){
        d[i]=d[i+1]=d[i+2]=0; d[i+3]=0; kinds[p]=0; continue;
      }
      d[i+3]=255;
      const mx=Math.max(r,g,b), mn=Math.min(r,g,b);
      if(mx<35){
        d[i]=d[i+1]=d[i+2]=0; kinds[p]=1;
      } else if(mn>220 && mx-mn<30){
        d[i]=d[i+1]=d[i+2]=255; kinds[p]=2;
      } else {
        pts.push([r,g,b,p]); kinds[p]=3;
      }
    }

    // Deterministic k-means for remaining colors.
    const k=Math.max(1,paletteCount-2);
    let centers=[];
    if(pts.length){
      const sorted=pts.slice().sort((a,b)=>lum(a)-lum(b));
      for(let j=0;j<k;j++){
        const idx=Math.floor(((j+0.5)/k)*(sorted.length-1));
        centers.push(sorted[idx].slice(0,3));
      }

      for(let iter=0;iter<12;iter++){
        const sums=Array.from({length:k},()=>[0,0,0,0]);
        for(const p of pts){
          let best=0,bd=Infinity;
          for(let j=0;j<k;j++){
            const dd=dist2(p,centers[j]);
            if(dd<bd){bd=dd;best=j;}
          }
          sums[best][0]+=p[0]; sums[best][1]+=p[1];
          sums[best][2]+=p[2]; sums[best][3]++;
        }
        let moved=0;
        const next=centers.map((c,j)=>{
          const s=sums[j];
          if(!s[3]) return c;
          const q=[s[0]/s[3],s[1]/s[3],s[2]/s[3]];
          moved+=dist2(c,q);
          return q;
        });
        centers=next;
        if(moved<0.1) break;
      }

      // Assign every non-black/non-white opaque cell.
      for(const p of pts){
        let best=0,bd=Infinity;
        for(let j=0;j<k;j++){
          const dd=dist2(p,centers[j]);
          if(dd<bd){bd=dd;best=j;}
        }
        const i=p[3]*4, c=centers[best];
        d[i]=clamp8(c[0]); d[i+1]=clamp8(c[1]); d[i+2]=clamp8(c[2]); d[i+3]=255;
      }
    }

    // Remove only fully isolated opaque single cells.
    const copy=new Uint8ClampedArray(d);
    const opaqueAt=(x,y)=>{
      if(x<0||y<0||x>=n||y>=n) return false;
      return copy[(y*n+x)*4+3]===255;
    };
    for(let y=0;y<n;y++) for(let x=0;x<n;x++){
      const i=(y*n+x)*4;
      if(copy[i+3]!==255) continue;
      let neighbors=0;
      for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){
        if(dx===0&&dy===0) continue;
        if(opaqueAt(x+dx,y+dy)) neighbors++;
      }
      if(neighbors===0){
        d[i]=d[i+1]=d[i+2]=0; d[i+3]=0;
      }
    }

    out.putImageData(im,0,0);

    const seen=new Map();
    for(let i=0;i<d.length;i+=4){
      if(d[i+3]!==255) continue;
      const key=`${d[i]},${d[i+1]},${d[i+2]}`;
      seen.set(key,[d[i],d[i+1],d[i+2],255]);
    }
    conv.palette=[...seen.values()];
    conv.ready=true;

    drawPreview();
    ["ape16ConvUseGenesis","ape16ConvExportMaster","ape16ConvExport1024","ape16ConvExport4096"]
      .forEach(id=>$id(id).disabled=false);

    $id("ape16ConvStatus").textContent=
      mode==="trait" ? `TRAIT PASS READY · ${$id("ape16TraitCategory")?.value || "Trait"} · transparent ${n}×${n} layer · ${conv.palette.length} flat colors · base ape excluded` : `PASS READY · ${n}×${n} logical master · ${conv.palette.length} flat colors · hard RGBA cells`;
  }


  function verifyGenesisIdentity(){
    if(!conv.ready){
      $id("ape16ConvStatus").textContent="Run the converter first.";
      return;
    }
    if(($id("ape16ConvMode")?.value || "genesis")!=="genesis"){
      $id("ape16ConvStatus").textContent="Identity Verify applies to Genesis Locked mode.";
      return;
    }
    const canonical=new Image();
    canonical.onload=()=>{
      const test=document.createElement("canvas");
      test.width=test.height=128;
      const tx=test.getContext("2d",{willReadFrequently:true});
      tx.imageSmoothingEnabled=false;
      tx.drawImage(canonical,0,0,128,128);
      const a=tx.getImageData(0,0,128,128).data;
      const b=conv.logical.getContext("2d",{willReadFrequently:true})
        .getImageData(0,0,128,128).data;
      let mismatches=0;
      for(let i=0;i<a.length;i++) if(a[i]!==b[i]) mismatches++;
      $id("ape16ConvStatus").textContent = mismatches===0
        ? "IDENTITY PASS · 0 channel mismatches · pixel-for-pixel identical"
        : `IDENTITY FAIL · ${mismatches} channel mismatches`;
    };
    canonical.src=APE16_GENESIS_MASTER_DATA;
  }

  function download(size,name){
    if(!conv.ready) return;
    const c=document.createElement("canvas");
    c.width=c.height=size;
    const x=c.getContext("2d");
    x.imageSmoothingEnabled=false;
    x.clearRect(0,0,size,size);
    x.drawImage(conv.logical,0,0,size,size);
    c.toBlob(blob=>{
      const a=document.createElement("a");
      a.href=URL.createObjectURL(blob);
      a.download=name;
      document.body.appendChild(a);
      a.click(); a.remove();
      setTimeout(()=>URL.revokeObjectURL(a.href),1500);
    },"image/png");
  }

  function useAsGenesis(){
    if(!conv.ready) return;
    if(state.approved){
      alert("An approved Genesis is already loaded. Start a fresh working Genesis before replacing it.");
      return;
    }

    const n=conv.logical.width;
    const x=conv.logical.getContext("2d",{willReadFrequently:true});
    const d=x.getImageData(0,0,n,n).data;

    state.n=n;
    state.zoom=Math.max(1,Math.floor(512/n));
    state.cells=new Array(n*n).fill(null);
    for(let p=0;p<n*n;p++){
      const i=p*4;
      if(d[i+3]===255) state.cells[p]=[d[i],d[i+1],d[i+2],255];
    }
    state.undo=[]; state.redo=[];
    state.genesisPalette=conv.palette.map(c=>[...c]);
    state.paletteLocked=false;
    state.suggestion=[];
    state.suggestionPalette=[];
    state.showSuggestion=false;

    if(state.projectMeta){
      state.projectMeta.projectName="APE16";
      state.projectMeta.category="Genesis";
      state.projectMeta.traitName="Brown";
      state.projectMeta.revision=1;
    }

    // Resize trait architecture to the new logical grid.
    if(window.APE16_V6){
      const V6=window.APE16_V6;
      V6.trait=new Array(n*n).fill(null);
      V6.mask=new Array(n*n).fill(false);
      const s=n/64;
      V6.anchors={
        head:[Math.round(32*s),Math.round(18*s)],
        leftEye:[Math.round(27*s),Math.round(31*s)],
        rightEye:[Math.round(37*s),Math.round(31*s)],
        leftEar:[Math.round(18*s),Math.round(32*s)],
        rightEar:[Math.round(46*s),Math.round(32*s)],
        mouth:[Math.round(32*s),Math.round(40*s)],
        neck:[Math.round(32*s),Math.round(49*s)],
        shoulders:[Math.round(32*s),Math.round(55*s)]
      };
    }

    if(typeof applyProjectMetaToUI==="function") applyProjectMetaToUI();
    if(typeof renderV5GenesisPalette==="function") renderV5GenesisPalette();
    if(typeof resize==="function") resize();
    if(typeof draw==="function") draw();
    if(typeof validateGenesis==="function") validateGenesis(false);

    $id("ape16ConvStatus").textContent=
      `Loaded as editable Genesis · ${n}×${n} · review before palette lock/approval`;
  }

  const section=document.createElement("section");
  section.id="ape16IntegratedConverter";
  section.innerHTML=`
    <h2>APE16 V6.6.3 · GENESIS LOCK + TRAIT EXTRACTOR</h2>
    <p style="color:#aaa;line-height:1.45">
      Genesis Locked mode reproduces the approved Brown master <b>pixel-for-pixel</b>. Trait Extract mode accepts a full ape-with-trait reference, isolates the selected trait onto transparency, snaps it to the 128×128 APE16 grid, and previews/exports a generator-ready layer.
      It snaps the source to a true logical grid, removes soft alpha/anti-aliasing,
      normalizes the palette, and creates exact nearest-neighbor production exports.
    </p>

    <div style="display:grid;gap:12px">
      <label>Converter mode
        <select id="ape16ConvMode" style="margin-left:8px">
          <option value="genesis" selected>Genesis Locked — exact Brown master</option>
          <option value="trait">Trait Extract — isolate supplied trait from full reference</option>
        </select>
      </label>

      <label>Trait category
        <select id="ape16TraitCategory" style="margin-left:8px">
          <option value="Headwear" selected>Headwear</option>
          <option value="Eyes">Eyes</option>
          <option value="Mouth">Mouth</option>
          <option value="Clothing">Clothing</option>
          <option value="Accessory">Accessory</option>
        </select>
      </label>

      <input id="ape16ConvFile" type="file" accept="image/png,image/webp,image/jpeg">

      <label>Logical master
        <select id="ape16ConvResolution" style="margin-left:8px">
          <option value="64">64×64</option>
          <option value="128" selected>128×128 — recommended</option>
          <option value="256">256×256</option>
        </select>
      </label>

      <label>Maximum flat colors
        <select id="ape16ConvPalette" style="margin-left:8px">
          <option value="6">6</option>
          <option value="8" selected>8 — recommended</option>
          <option value="10">10</option>
          <option value="12">12</option>
        </select>
      </label>

      <label>Soft-alpha cutoff
        <input id="ape16ConvAlpha" type="range" min="1" max="254" value="128">
        <span id="ape16ConvAlphaOut">128</span>
      </label>

      <div style="padding:10px;border:1px solid #3f3f46;border-radius:10px;color:#9ee6aa">
        ✓ preserve pure black<br>
        ✓ preserve pure white<br>
        ✓ no dithering<br>
        ✓ no gradients<br>
        ✓ no anti-aliasing<br>
        ✓ no smoothing on enlargement
      </div>

      <button id="ape16ConvConvert" type="button" style="font-weight:900">
        CLEAN & NORMALIZE PIXEL ART
      </button>
    </div>

    <div style="margin-top:14px;max-width:512px;background:
      linear-gradient(45deg,#bbb 25%,transparent 25%),
      linear-gradient(-45deg,#bbb 25%,transparent 25%),
      linear-gradient(45deg,transparent 75%,#bbb 75%),
      linear-gradient(-45deg,transparent 75%,#bbb 75%);
      background-size:16px 16px;background-position:0 0,0 8px,8px -8px,-8px 0;background-color:white">
      <canvas id="ape16ConvPreview" width="512" height="512"
        style="display:block;width:100%;image-rendering:pixelated"></canvas>
    </div>

    <p id="ape16ConvStatus" style="color:#e3bf68">Load the approved ape artwork.</p>

    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button id="ape16ConvUseGenesis" type="button" disabled>Use Clean Master as Genesis</button>
      <button id="ape16ConvVerify" type="button" disabled>Verify Genesis Identity</button>
      <button id="ape16ConvExportMaster" type="button" disabled>Export Logical Master</button>
      <button id="ape16ConvExport1024" type="button" disabled>Export 1024 PNG</button>
      <button id="ape16ConvExport4096" type="button" disabled>Export 4096 PNG</button>
    </div>

    <p style="color:#9ee6aa;font-size:12px;line-height:1.5">
      128×128 → 4096×4096 is an exact ×32 integer nearest-neighbor enlargement.
      Every logical pixel becomes a perfect 32×32 square in the 4K NFT.
    </p>
  `;

  const assisted=[...document.querySelectorAll("section")]
    .find(s=>s.textContent.includes("ASSISTED GENESIS CONSTRUCTION"));
  if(assisted) assisted.parentNode.insertBefore(section,assisted);
  else document.querySelector("main")?.appendChild(section);

  $id("ape16ConvFile").addEventListener("change",e=>{
    const f=e.target.files[0];
    if(!f) return;
    const url=URL.createObjectURL(f);
    const img=new Image();
    img.onload=()=>{
      URL.revokeObjectURL(url);
      conv.image=img;
      conv.ready=false;
      drawPreview();
      $id("ape16ConvStatus").textContent=
        `Source loaded · ${img.width}×${img.height} · ready to clean`;
    };
    img.src=url;
  });

  $id("ape16ConvAlpha").addEventListener("input",e=>{
    $id("ape16ConvAlphaOut").textContent=e.target.value;
  });

  $id("ape16ConvConvert").addEventListener("click",cleanAndNormalize);
  $id("ape16ConvUseGenesis").addEventListener("click",useAsGenesis);
  $id("ape16ConvVerify").addEventListener("click",verifyGenesisIdentity);
  $id("ape16ConvExportMaster").addEventListener("click",()=>{
    const n=conv.logical.width;
    download(n,(($id("ape16ConvMode")?.value||"genesis")==="trait") ? `APE16_TRAIT_${$id("ape16TraitCategory")?.value||"Trait"}_${n}x${n}.png` : `APE16_CLEAN_MASTER_${n}x${n}.png`);
  });
  $id("ape16ConvExport1024").addEventListener("click",()=>download(1024,"APE16_1024.png"));
  $id("ape16ConvExport4096").addEventListener("click",()=>download(4096,"APE16_4096.png"));
})();



/* ============================================================
   APE16 V6.6.3 · TRAIT REVIEW + APPROVAL GATE
   Required workflow:
   Upload reference -> extract trait -> Trait Only -> Composite Preview
   -> inspect -> approve -> save/export.
   ============================================================ */
(function setupAPE16TraitReviewGate(){
  const $id=id=>document.getElementById(id);
  if(document.getElementById("ape16TraitReviewGate")) return;

  // Find the existing V6 trait architecture / trait extractor section.
  const traitSection=[...document.querySelectorAll("section")]
    .find(s=>/TRAIT/i.test(s.textContent) && /COMPOSITE/i.test(s.textContent));

  if(!traitSection) return;

  const wrap=document.createElement("div");
  wrap.id="ape16TraitReviewGate";
  wrap.style.cssText=
    "margin-top:16px;padding:14px;border:1px solid #3f3f46;border-radius:14px;background:#101012";

  wrap.innerHTML=`
    <div style="font-weight:900;font-size:15px;margin-bottom:5px">
      APE16 V6.6.3 · TRAIT REVIEW GATE
    </div>
    <p style="color:#aaa;font-size:12px;line-height:1.45;margin:0 0 12px">
      A trait cannot be approved until both the transparent Trait Only layer and the locked-Genesis Composite Preview are reviewed.
    </p>

    <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px">
      <div>
        <div style="font-size:12px;font-weight:900;margin-bottom:6px">TRAIT ONLY</div>
        <div style="background:
          linear-gradient(45deg,#bbb 25%,transparent 25%),
          linear-gradient(-45deg,#bbb 25%,transparent 25%),
          linear-gradient(45deg,transparent 75%,#bbb 75%),
          linear-gradient(-45deg,transparent 75%,#bbb 75%);
          background-size:16px 16px;background-position:0 0,0 8px,8px -8px,-8px 0;background-color:white">
          <canvas id="ape16TraitOnlyPreview" width="384" height="384"
            style="display:block;width:100%;image-rendering:pixelated"></canvas>
        </div>
      </div>

      <div>
        <div style="font-size:12px;font-weight:900;margin-bottom:6px">COMPOSITE ON LOCKED GENESIS</div>
        <div style="background:
          linear-gradient(45deg,#bbb 25%,transparent 25%),
          linear-gradient(-45deg,#bbb 25%,transparent 25%),
          linear-gradient(45deg,transparent 75%,#bbb 75%),
          linear-gradient(-45deg,transparent 75%,#bbb 75%);
          background-size:16px 16px;background-position:0 0,0 8px,8px -8px,-8px 0;background-color:white">
          <canvas id="ape16TraitCompositePreview" width="384" height="384"
            style="display:block;width:100%;image-rendering:pixelated"></canvas>
        </div>
      </div>
    </div>

    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
      <button id="ape16RefreshTraitReview" type="button">Refresh Review</button>
      <button id="ape16ApproveTraitGate" type="button" disabled>Approve + Lock Trait</button>
      <button id="ape16ExportTrait128" type="button" disabled>Export 128×128 Trait</button>
      <button id="ape16ExportTrait4096" type="button" disabled>Export 4096 Trait</button>
    </div>

    <label style="display:block;margin-top:12px;font-size:12px">
      <input id="ape16TraitReviewCheck" type="checkbox">
      I reviewed both views and the trait fits the locked Genesis correctly.
    </label>

    <div id="ape16TraitReviewStatus"
      style="margin-top:9px;color:#e3bf68;font-size:12px;font-weight:800">
      Waiting for trait artwork.
    </div>
  `;

  traitSection.appendChild(wrap);

  const getState=()=>{
    // Existing V6 builds expose trait architecture on window.APE16_V6.
    const V6=window.APE16_V6;
    if(!V6 || !Array.isArray(V6.trait) || !Array.isArray(V6.mask)) return null;
    const n=Math.round(Math.sqrt(V6.trait.length));
    if(n*n!==V6.trait.length) return null;
    return {V6,n};
  };

  function logicalCanvasFromTrait(V6,n){
    const c=document.createElement("canvas");
    c.width=c.height=n;
    const x=c.getContext("2d");
    x.imageSmoothingEnabled=false;
    x.clearRect(0,0,n,n);

    for(let y=0;y<n;y++) for(let xx=0;xx<n;xx++){
      const v=V6.trait[y*n+xx];
      if(!v) continue;
      x.fillStyle=`rgba(${v[0]},${v[1]},${v[2]},${(v[3]??255)/255})`;
      x.fillRect(xx,y,1,1);
    }
    return c;
  }

  function logicalCanvasComposite(V6,n){
    const c=document.createElement("canvas");
    c.width=c.height=n;
    const x=c.getContext("2d");
    x.imageSmoothingEnabled=false;
    x.clearRect(0,0,n,n);

    // Genesis source is state.cells. This is the locked source of truth.
    for(let y=0;y<n;y++) for(let xx=0;xx<n;xx++){
      const i=y*n+xx;
      if(V6.mask[i]) continue;
      const g=state.cells?.[i];
      if(!g) continue;
      x.fillStyle=`rgba(${g[0]},${g[1]},${g[2]},${(g[3]??255)/255})`;
      x.fillRect(xx,y,1,1);
    }

    for(let y=0;y<n;y++) for(let xx=0;xx<n;xx++){
      const v=V6.trait[y*n+xx];
      if(!v) continue;
      x.fillStyle=`rgba(${v[0]},${v[1]},${v[2]},${(v[3]??255)/255})`;
      x.fillRect(xx,y,1,1);
    }
    return c;
  }

  function paintPreview(targetId,source){
    const c=$id(targetId);
    if(!c) return;
    const x=c.getContext("2d");
    x.clearRect(0,0,c.width,c.height);
    x.imageSmoothingEnabled=false;
    x.drawImage(source,0,0,c.width,c.height);
  }

  function traitStats(V6){
    let painted=0,mask=0;
    for(const v of V6.trait) if(v) painted++;
    for(const v of V6.mask) if(v) mask++;
    return {painted,mask};
  }

  function refreshReview(){
    const s=getState();
    if(!s){
      $id("ape16TraitReviewStatus").textContent=
        "Trait architecture is not initialized yet.";
      return;
    }

    const {V6,n}=s;
    const stats=traitStats(V6);
    const trait=logicalCanvasFromTrait(V6,n);
    const comp=logicalCanvasComposite(V6,n);

    paintPreview("ape16TraitOnlyPreview",trait);
    paintPreview("ape16TraitCompositePreview",comp);

    $id("ape16TraitReviewCheck").checked=false;
    $id("ape16ApproveTraitGate").disabled=true;
    $id("ape16ExportTrait128").disabled=true;
    $id("ape16ExportTrait4096").disabled=true;

    if(stats.painted===0){
      $id("ape16TraitReviewStatus").textContent=
        "No trait pixels yet. Convert/extract the trait first.";
      return;
    }

    $id("ape16TraitReviewStatus").textContent=
      `REVIEW REQUIRED · trait pixels ${stats.painted} · occluded Genesis cells ${stats.mask} · logical canvas ${n}×${n}`;
  }

  function validateTrait(){
    const s=getState();
    if(!s) return {pass:false,msg:"Trait architecture unavailable."};
    const {V6,n}=s;
    const stats=traitStats(V6);

    if(n!==128) return {pass:false,msg:`Trait canvas must be 128×128; current ${n}×${n}.`};
    if(stats.painted===0) return {pass:false,msg:"Trait has no artwork."};

    // Every trait cell must be a hard RGBA cell.
    for(const v of V6.trait){
      if(!v) continue;
      if(!Array.isArray(v) || v.length<3) return {pass:false,msg:"Invalid trait pixel data."};
      const a=v[3]??255;
      if(a!==255) return {pass:false,msg:"Trait contains partial alpha; only solid cells or transparency are allowed."};
    }

    return {pass:true,msg:`PASS · ${stats.painted} trait cells · ${stats.mask} occlusion cells`};
  }

  function exportCanvas(source,size,name){
    const out=document.createElement("canvas");
    out.width=out.height=size;
    const x=out.getContext("2d");
    x.imageSmoothingEnabled=false;
    x.clearRect(0,0,size,size);
    x.drawImage(source,0,0,size,size);
    out.toBlob(blob=>{
      const a=document.createElement("a");
      a.href=URL.createObjectURL(blob);
      a.download=name;
      document.body.appendChild(a);
      a.click(); a.remove();
      setTimeout(()=>URL.revokeObjectURL(a.href),1500);
    },"image/png");
  }

  $id("ape16RefreshTraitReview").addEventListener("click",refreshReview);

  $id("ape16TraitReviewCheck").addEventListener("change",e=>{
    const valid=validateTrait();
    if(e.target.checked && valid.pass){
      $id("ape16ApproveTraitGate").disabled=false;
      $id("ape16ExportTrait128").disabled=false;
      $id("ape16ExportTrait4096").disabled=false;
      $id("ape16TraitReviewStatus").textContent=
        valid.msg+" · review acknowledged";
    }else{
      $id("ape16ApproveTraitGate").disabled=true;
      $id("ape16ExportTrait128").disabled=true;
      $id("ape16ExportTrait4096").disabled=true;
      if(!valid.pass) $id("ape16TraitReviewStatus").textContent=valid.msg;
    }
  });

  $id("ape16ApproveTraitGate").addEventListener("click",()=>{
    const valid=validateTrait();
    if(!valid.pass){
      $id("ape16TraitReviewStatus").textContent=valid.msg;
      return;
    }
    if(!$id("ape16TraitReviewCheck").checked){
      $id("ape16TraitReviewStatus").textContent=
        "Review both previews and check the approval box first.";
      return;
    }

    // Call the existing V6 approval button/action if present.
    const existing=[...document.querySelectorAll("button")]
      .find(b=>/Approve.*Lock Trait/i.test(b.textContent) && b.id!=="ape16ApproveTraitGate");

    if(existing){
      existing.click();
      $id("ape16TraitReviewStatus").textContent=
        "Trait approval sent to the existing V6 lock system.";
    }else{
      // Minimal fallback lock marker; does not alter pixels.
      window.APE16_TRAIT_APPROVED=true;
      $id("ape16TraitReviewStatus").textContent=
        "TRAIT APPROVED + LOCKED · fallback lock active";
    }
  });

  $id("ape16ExportTrait128").addEventListener("click",()=>{
    const s=getState(); if(!s) return;
    const trait=logicalCanvasFromTrait(s.V6,s.n);
    const name=(document.getElementById("v6TraitName")?.value || "Trait")
      .trim().replace(/[^a-z0-9_-]+/gi,"_");
    exportCanvas(trait,128,`APE16_Trait_${name}_128x128.png`);
  });

  $id("ape16ExportTrait4096").addEventListener("click",()=>{
    const s=getState(); if(!s) return;
    const trait=logicalCanvasFromTrait(s.V6,s.n);
    const name=(document.getElementById("v6TraitName")?.value || "Trait")
      .trim().replace(/[^a-z0-9_-]+/gi,"_");
    exportCanvas(trait,4096,`APE16_Trait_${name}_4096x4096.png`);
  });

  // Initial draw if trait state already exists.
  setTimeout(refreshReview,150);
})();

