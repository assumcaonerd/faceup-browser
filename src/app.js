const $ = (selector) => document.querySelector(selector);

const elements = {
  sourceInput: $('#sourceInput'), targetInput: $('#targetInput'), sourceCanvas: $('#sourceCanvas'),
  targetCanvas: $('#targetCanvas'), resultCanvas: $('#resultCanvas'), sourceDrop: $('#sourceDrop'),
  targetDrop: $('#targetDrop'), processButton: $('#processButton'), downloadButton: $('#downloadButton'),
  compareButton: $('#compareButton'), resultSection: $('#resultSection'), statusIcon: $('#statusIcon'),
  statusTitle: $('#statusTitle'), statusText: $('#statusText'), progressBar: $('#progressBar'),
  feather: $('#feather'), colorMatch: $('#colorMatch'), opacity: $('#opacity'),
};

const state = { source: null, target: null, sourcePoints: null, targetPoints: null, busy: false, result: null };
const FACE_OVAL = [10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109];
const FEATURE_POINTS = [1,4,6,9,33,46,52,55,65,70,105,107,133,145,153,159,168,173,246,249,263,276,282,285,295,300,334,336,362,374,380,386,398,466,61,78,80,81,82,87,88,91,95,146,178,181,185,191,267,269,270,291,308,310,311,312,317,318,321,324,375,402,405,409,415];
const MESH_POINTS = [...new Set([...FACE_OVAL, ...FEATURE_POINTS])];

function setStatus(title, text, progress = 10, icon = '1') {
  elements.statusTitle.textContent = title; elements.statusText.textContent = text;
  elements.progressBar.style.width = `${progress}%`; elements.statusIcon.textContent = icon;
}

function validateFile(file) {
  if (!file) throw new Error('Nenhum arquivo selecionado.');
  if (!['image/jpeg','image/png','image/webp'].includes(file.type)) throw new Error('Use uma imagem JPG, PNG ou WebP.');
  if (file.size > 25 * 1024 * 1024) throw new Error('A imagem deve ter no máximo 25 MB.');
}

async function decodeImage(file) {
  validateFile(file);
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const maxSide = 2400; const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d', { alpha: false }).drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
  return canvas;
}

const faceMesh = new globalThis.FaceMesh({
  locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619/${file}`,
});
faceMesh.setOptions({ maxNumFaces: 1, refineLandmarks: true, staticImageMode: true, minDetectionConfidence: 0.65 });
let pendingDetection;
faceMesh.onResults((results) => { pendingDetection?.(results.multiFaceLandmarks?.[0] ?? null); pendingDetection = null; });

async function detectFace(canvas) {
  const normalized = await new Promise((resolve, reject) => {
    pendingDetection = resolve;
    faceMesh.send({ image: canvas }).catch((error) => { pendingDetection = null; reject(error); });
  });
  return normalized?.map((point) => ({ x: point.x * canvas.width, y: point.y * canvas.height })) ?? null;
}

function renderPreview(source, destination) {
  destination.width = source.width; destination.height = source.height;
  destination.getContext('2d').drawImage(source, 0, 0); destination.hidden = false;
  const zone = destination.closest('.drop-zone'); zone.querySelector('.drop-placeholder').hidden = true; zone.querySelector('.replace-button').hidden = false;
}

async function loadSlot(kind, file) {
  if (state.busy) return;
  state.busy = true; elements.processButton.disabled = true;
  const label = kind === 'source' ? 'origem' : 'destino';
  try {
    setStatus(`Lendo a imagem de ${label}`, 'Ajustando tamanho e orientação…', 25, '…');
    const image = await decodeImage(file); renderPreview(image, elements[`${kind}Canvas`]);
    setStatus('Localizando o rosto', `Analisando a foto de ${label} neste dispositivo…`, 52, '…');
    const points = await detectFace(image);
    if (!points) throw new Error(`Nenhum rosto foi encontrado na imagem de ${label}. Tente uma foto frontal e nítida.`);
    state[kind] = image; state[`${kind}Points`] = points;
    const ready = state.sourcePoints && state.targetPoints;
    setStatus(ready ? 'Tudo pronto' : 'Primeiro rosto detectado', ready ? 'Ajuste os controles ou crie o resultado.' : 'Agora escolha a outra imagem.', ready ? 100 : 60, ready ? '✓' : '2');
    elements.processButton.disabled = !ready;
  } catch (error) {
    console.error(error); setStatus('Não foi possível usar esta imagem', error.message, 10, '!');
  } finally { state.busy = false; }
}

function triangleTransform(ctx, source, s0, s1, s2, d0, d1, d2) {
  const det = s0.x * (s1.y - s2.y) + s1.x * (s2.y - s0.y) + s2.x * (s0.y - s1.y);
  if (Math.abs(det) < .01) return;
  const a = (d0.x * (s1.y-s2.y) + d1.x * (s2.y-s0.y) + d2.x * (s0.y-s1.y)) / det;
  const b = (d0.y * (s1.y-s2.y) + d1.y * (s2.y-s0.y) + d2.y * (s0.y-s1.y)) / det;
  const c = (d0.x * (s2.x-s1.x) + d1.x * (s0.x-s2.x) + d2.x * (s1.x-s0.x)) / det;
  const d = (d0.y * (s2.x-s1.x) + d1.y * (s0.x-s2.x) + d2.y * (s1.x-s0.x)) / det;
  const e = (d0.x*(s1.x*s2.y-s2.x*s1.y)+d1.x*(s2.x*s0.y-s0.x*s2.y)+d2.x*(s0.x*s1.y-s1.x*s0.y))/det;
  const f = (d0.y*(s1.x*s2.y-s2.x*s1.y)+d1.y*(s2.x*s0.y-s0.x*s2.y)+d2.y*(s0.x*s1.y-s1.x*s0.y))/det;
  ctx.save(); ctx.beginPath(); ctx.moveTo(d0.x,d0.y); ctx.lineTo(d1.x,d1.y); ctx.lineTo(d2.x,d2.y); ctx.closePath(); ctx.clip();
  ctx.transform(a,b,c,d,e,f); ctx.drawImage(source,0,0); ctx.restore();
}

function createWarpedFace() {
  const canvas = document.createElement('canvas'); canvas.width = state.target.width; canvas.height = state.target.height;
  const ctx = canvas.getContext('2d'); const targetSubset = MESH_POINTS.map((i) => state.targetPoints[i]);
  const triangles = globalThis.Delaunator.from(targetSubset.map((p) => [p.x,p.y])).triangles;
  for (let i=0;i<triangles.length;i+=3) {
    const ia=MESH_POINTS[triangles[i]], ib=MESH_POINTS[triangles[i+1]], ic=MESH_POINTS[triangles[i+2]];
    triangleTransform(ctx,state.source,state.sourcePoints[ia],state.sourcePoints[ib],state.sourcePoints[ic],state.targetPoints[ia],state.targetPoints[ib],state.targetPoints[ic]);
  }
  return canvas;
}

function ovalPath(ctx, points) { ctx.beginPath(); FACE_OVAL.forEach((index,i) => { const p=points[index]; i ? ctx.lineTo(p.x,p.y) : ctx.moveTo(p.x,p.y); }); ctx.closePath(); }

function meanColor(canvas, points) {
  const ctx=canvas.getContext('2d'); const xs=FACE_OVAL.map(i=>points[i].x), ys=FACE_OVAL.map(i=>points[i].y);
  const x=Math.max(0,Math.floor(Math.min(...xs))), y=Math.max(0,Math.floor(Math.min(...ys))), w=Math.min(canvas.width-x,Math.ceil(Math.max(...xs)-x)), h=Math.min(canvas.height-y,Math.ceil(Math.max(...ys)-y));
  const data=ctx.getImageData(x,y,w,h).data; let r=0,g=0,b=0,n=0;
  for(let i=0;i<data.length;i+=40){if(data[i+3]>20){r+=data[i];g+=data[i+1];b+=data[i+2];n++;}}
  return n ? [r/n,g/n,b/n] : [128,128,128];
}

function processSwap() {
  try {
    setStatus('Criando o resultado', 'Alinhando a malha e combinando luz e cor…', 75, '…');
    const warped=createWarpedFace(); const result=elements.resultCanvas; result.width=state.target.width; result.height=state.target.height;
    const ctx=result.getContext('2d'); ctx.drawImage(state.target,0,0);
    const strength=Number(elements.colorMatch.value)/100; const src=meanColor(warped,state.targetPoints), dst=meanColor(state.target,state.targetPoints);
    const brightness=((dst[0]+dst[1]+dst[2])/(src[0]+src[1]+src[2]||1)-1)*strength+1;
    const colored=document.createElement('canvas'); colored.width=result.width; colored.height=result.height; const cctx=colored.getContext('2d');
    cctx.filter=`brightness(${Math.max(.65,Math.min(1.45,brightness))}) saturate(${1-strength*.08})`; cctx.drawImage(warped,0,0);
    const mask=document.createElement('canvas'); mask.width=result.width; mask.height=result.height; const mctx=mask.getContext('2d');
    mctx.filter=`blur(${elements.feather.value}px)`; ovalPath(mctx,state.targetPoints); mctx.fillStyle='#fff'; mctx.fill();
    cctx.globalCompositeOperation='destination-in'; cctx.drawImage(mask,0,0); cctx.globalCompositeOperation='source-over';
    ctx.globalAlpha=Number(elements.opacity.value)/100; ctx.drawImage(colored,0,0); ctx.globalAlpha=1;
    const saved=document.createElement('canvas'); saved.width=result.width; saved.height=result.height; saved.getContext('2d').drawImage(result,0,0);
    state.result=saved; elements.resultSection.hidden=false; setStatus('Resultado concluído','Compare com a foto original ou baixe em alta resolução.',100,'✓');
    elements.resultSection.scrollIntoView({behavior:'smooth',block:'start'});
  } catch(error) { console.error(error); setStatus('Erro ao criar o resultado','Atualize a página e tente novamente com outras fotos.',10,'!'); }
}

function bindDrop(card,input,kind){['dragenter','dragover'].forEach(e=>card.addEventListener(e,(event)=>{event.preventDefault();card.classList.add('dragging')}));['dragleave','drop'].forEach(e=>card.addEventListener(e,(event)=>{event.preventDefault();card.classList.remove('dragging')}));card.addEventListener('drop',(event)=>loadSlot(kind,event.dataTransfer.files[0]));input.addEventListener('change',()=>loadSlot(kind,input.files[0]));card.querySelector('.replace-button').addEventListener('click',(event)=>{event.preventDefault();input.click()});}
bindDrop(elements.sourceDrop,elements.sourceInput,'source'); bindDrop(elements.targetDrop,elements.targetInput,'target');
elements.processButton.addEventListener('click',processSwap);
elements.downloadButton.addEventListener('click',()=>elements.resultCanvas.toBlob((blob)=>{const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`faceup-${Date.now()}.png`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)},'image/png'));
function showOriginal(show){if(!state.target||!state.result)return;const ctx=elements.resultCanvas.getContext('2d');ctx.clearRect(0,0,elements.resultCanvas.width,elements.resultCanvas.height);ctx.drawImage(show?state.target:state.result,0,0);$('#comparisonLabel').hidden=!show;}
['pointerdown','keydown'].forEach(e=>elements.compareButton.addEventListener(e,event=>{if(e==='keydown'&&!['Enter',' '].includes(event.key))return;showOriginal(true)}));['pointerup','pointerleave','keyup'].forEach(e=>elements.compareButton.addEventListener(e,()=>showOriginal(false)));
[['feather','featherValue',''],['colorMatch','colorValue','%'],['opacity','opacityValue','%']].forEach(([id,out,suffix])=>elements[id].addEventListener('input',()=>{$(`#${out}`).value=`${elements[id].value}${suffix}`}));
$('#resetControls').addEventListener('click',()=>{elements.feather.value=24;elements.colorMatch.value=65;elements.opacity.value=100;$('#featherValue').value='24';$('#colorValue').value='65%';$('#opacityValue').value='100%'});
