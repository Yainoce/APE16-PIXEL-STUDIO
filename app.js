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
  genesisReferenceLocked:false
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

function draw(){
  const c=$("canvas");
  const ctx=c.getContext("2d");

  ctx.clearRect(0,0,c.width,c.height);
  drawReference(ctx);
  drawPixelCells(ctx);
  drawGuides(ctx);
}

function reset(n){
  state.n=n;
  state.cells=empty(n);
  state.undo=[];
  state.redo=[];
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
  if(!state.reference || !state.genesisReferenceLocked){
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
    setCell(x,y,hexToRgba($("color").value));
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
  state.drawing=true;
  canvas.setPointerCapture(ev.pointerId);
  applyTool(p.x,p.y,true);
});

canvas.addEventListener("pointermove",ev=>{
  const p=pointerCell(ev);

  $("coord").textContent=
    `x: ${p.x} y: ${p.y}  |  legal range: 0–${state.n-1}`;

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

      document
        .querySelectorAll("[data-tool]")
        .forEach(b=>{
          b.classList.toggle("active",b===button);
        });
    });
  });

$("undoBtn").onclick=()=>{
  if(!state.undo.length) return;

  state.redo.push(state.cells.slice());
  state.cells=state.undo.pop();
  draw();
};

$("redoBtn").onclick=()=>{
  if(!state.redo.length) return;

  state.undo.push(state.cells.slice());
  state.cells=state.redo.pop();
  draw();
};

$("clearBtn").onclick=()=>{
  if(!confirm("Clear current layer?")) return;

  saveUndo();
  state.cells=empty(state.n);
  draw();
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

// Initialize the V4 rule-enforcement system.
ensureNumericReadouts();
setupV3ReferenceControls();
reset(64);
setupV4RuleEnforcement();
$("coord").textContent="x: — y: —  |  legal range: 0–63";

})();