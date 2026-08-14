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
  reference:null
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
  const n=Number(ev.target.value);

  if(
    state.cells.some(Boolean) &&
    !confirm("Changing resolution clears the layer. Continue?")
  ){
    ev.target.value=state.n;
    return;
  }

  reset(n);
  $("coord").textContent=
    `x: — y: —  |  legal range: 0–${state.n-1}`;
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
  downloadCanvas(
    logicalCanvas(),
    `APE16_${state.n}x${state.n}.png`
  );
};

$("export1024Btn").onclick=()=>{
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

// Initialize the V3 guide/readout system.
ensureNumericReadouts();
setupV3ReferenceControls();
reset(64);
$("coord").textContent="x: — y: —  |  legal range: 0–63";

})();