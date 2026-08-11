import { FaceLandmarker, FilesetResolver, ImageSegmenter } from '@mediapipe/tasks-vision';

const $ = (selector) => document.querySelector(selector);

const elements = {
  sourceInput: $('#sourceInput'), targetInput: $('#targetInput'), sourceCanvas: $('#sourceCanvas'),
  targetCanvas: $('#targetCanvas'), resultCanvas: $('#resultCanvas'), sourceDrop: $('#sourceDrop'),
  targetDrop: $('#targetDrop'), processButton: $('#processButton'), downloadButton: $('#downloadButton'),
  compareButton: $('#compareButton'), resultSection: $('#resultSection'), statusIcon: $('#statusIcon'),
  statusTitle: $('#statusTitle'), statusText: $('#statusText'), progressBar: $('#progressBar'),
  feather: $('#feather'), colorMatch: $('#colorMatch'), opacity: $('#opacity'), includeHair: $('#includeHair'),
  processingModes: [...document.querySelectorAll('input[name="processingMode"]')],
};

const state = { source: null, target: null, sourceFile: null, targetFile: null, sourcePoints: null, targetPoints: null, sourceParts: null, targetParts: null, busy: false, result: null };
const FACE_OVAL = [10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109];

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

let visionPromise, segmenterPromise, faceLandmarkerPromise;

function getVision() {
  visionPromise ??= FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm');
  return visionPromise;
}

function getSegmenter() {
  segmenterPromise ??= getVision().then((vision) => ImageSegmenter.createFromOptions(vision, {
      baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite' },
      runningMode: 'IMAGE', outputCategoryMask: true, outputConfidenceMasks: false,
    }));
  return segmenterPromise;
}

function getFaceLandmarker() {
  faceLandmarkerPromise ??= getVision().then((vision) => FaceLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task' },
    runningMode: 'IMAGE', numFaces: 1, minFaceDetectionConfidence: 0.5,
  }));
  return faceLandmarkerPromise;
}

async function segmentParts(canvas) {
  const segmenter = await getSegmenter();
  const result = segmenter.segment(canvas);
  const mask = result.categoryMask;
  if (!mask) throw new Error('O modelo não retornou a segmentação de cabelo.');
  const parts = { width: mask.width, height: mask.height, data: new Uint8Array(mask.getAsUint8Array()) };
  result.close();
  return parts;
}

async function detectFace(canvas) {
  const detector = await getFaceLandmarker();
  const normalized = detector.detect(canvas).faceLandmarks?.[0] ?? null;
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
    setStatus('Analisando rosto e cabelo', `Mapeando a foto de ${label} neste dispositivo…`, 52, '…');
    const points = await detectFace(image);
    const parts = await segmentParts(image);
    if (!points) throw new Error(`Nenhum rosto foi encontrado na imagem de ${label}. Tente uma foto frontal e nítida.`);
    state[kind] = image; state[`${kind}File`] = file; state[`${kind}Points`] = points; state[`${kind}Parts`] = parts;
    const ready = state.sourcePoints && state.targetPoints;
    setStatus(ready ? 'Tudo pronto' : 'Primeiro rosto detectado', ready ? 'Ajuste os controles ou crie o resultado.' : 'Agora escolha a outra imagem.', ready ? 100 : 60, ready ? '✓' : '2');
    elements.processButton.disabled = !ready;
  } catch (error) {
    console.error(error); setStatus('Não foi possível usar esta imagem', error.message, 10, '!');
  } finally { state.busy = false; }
}

function createWarpedFace() {
  const canvas = document.createElement('canvas'); canvas.width = state.target.width; canvas.height = state.target.height;
  const ctx = canvas.getContext('2d'); const transform=eyeTransform();
  ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.translate(transform.targetCenter.x,transform.targetCenter.y);ctx.rotate(transform.rotation);ctx.scale(transform.scale,transform.scale);ctx.translate(-transform.sourceCenter.x,-transform.sourceCenter.y);ctx.drawImage(state.source,0,0);
  return canvas;
}

function ovalPath(ctx, points) { ctx.beginPath(); FACE_OVAL.forEach((index,i) => { const p=points[index]; i ? ctx.lineTo(p.x,p.y) : ctx.moveTo(p.x,p.y); }); ctx.closePath(); }

function eyeTransform() {
  const sourceLeft=state.sourcePoints[33], sourceRight=state.sourcePoints[263];
  const targetLeft=state.targetPoints[33], targetRight=state.targetPoints[263];
  const sourceCenter={x:(sourceLeft.x+sourceRight.x)/2,y:(sourceLeft.y+sourceRight.y)/2};
  const targetCenter={x:(targetLeft.x+targetRight.x)/2,y:(targetLeft.y+targetRight.y)/2};
  const sourceDistance=Math.hypot(sourceRight.x-sourceLeft.x,sourceRight.y-sourceLeft.y);
  const targetDistance=Math.hypot(targetRight.x-targetLeft.x,targetRight.y-targetLeft.y);
  return {sourceCenter,targetCenter,scale:targetDistance/sourceDistance,rotation:Math.atan2(targetRight.y-targetLeft.y,targetRight.x-targetLeft.x)-Math.atan2(sourceRight.y-sourceLeft.y,sourceRight.x-sourceLeft.x)};
}

function maskForCategory(parts, category, width, height, blur=0) {
  const small=document.createElement('canvas'); small.width=parts.width; small.height=parts.height;
  const image=small.getContext('2d').createImageData(parts.width,parts.height);
  for(let i=0;i<parts.data.length;i+=1){const alpha=parts.data[i]===category?255:0;image.data[i*4]=255;image.data[i*4+1]=255;image.data[i*4+2]=255;image.data[i*4+3]=alpha;}
  small.getContext('2d').putImageData(image,0,0);
  const mask=document.createElement('canvas'); mask.width=width; mask.height=height; const ctx=mask.getContext('2d');
  ctx.filter=blur?`blur(${blur}px)`:'none'; ctx.drawImage(small,0,0,width,height); return mask;
}

function categoryColorStats(canvas, parts, category) {
  const sample=document.createElement('canvas'); sample.width=parts.width; sample.height=parts.height; const ctx=sample.getContext('2d');
  ctx.drawImage(canvas,0,0,sample.width,sample.height); const pixels=ctx.getImageData(0,0,sample.width,sample.height).data;
  let r=0,g=0,b=0,count=0;
  for(let i=0;i<parts.data.length;i+=1){if(parts.data[i]===category){r+=pixels[i*4];g+=pixels[i*4+1];b+=pixels[i*4+2];count+=1;}}
  return count?[r/count,g/count,b/count]:[128,110,90];
}

function createRecoloredTargetHair() {
  if(!state.sourceParts||!state.targetParts)return null;
  const sourceMean=categoryColorStats(state.source,state.sourceParts,1); const targetMean=categoryColorStats(state.target,state.targetParts,1);
  const layer=document.createElement('canvas'); layer.width=state.target.width; layer.height=state.target.height; const ctx=layer.getContext('2d'); ctx.drawImage(state.target,0,0);
  const mask=maskForCategory(state.targetParts,1,layer.width,layer.height,3); const maskData=mask.getContext('2d').getImageData(0,0,layer.width,layer.height).data;
  const image=ctx.getImageData(0,0,layer.width,layer.height); const pixels=image.data;
  const gain=sourceMean.map((value,index)=>Math.max(.75,Math.min(3.2,value/(targetMean[index]||1))));
  for(let i=0;i<pixels.length;i+=4){const strength=maskData[i+3]/255*.9;if(strength>.01){for(let channel=0;channel<3;channel+=1){const adjusted=Math.min(255,pixels[i+channel]*gain[channel]);pixels[i+channel]=pixels[i+channel]*(1-strength)+adjusted*strength;}}}
  ctx.putImageData(image,0,0); ctx.globalCompositeOperation='destination-in'; ctx.drawImage(mask,0,0); return layer;
}

function meanColor(canvas, points) {
  const ctx=canvas.getContext('2d'); const xs=FACE_OVAL.map(i=>points[i].x), ys=FACE_OVAL.map(i=>points[i].y);
  const x=Math.max(0,Math.floor(Math.min(...xs))), y=Math.max(0,Math.floor(Math.min(...ys))), w=Math.min(canvas.width-x,Math.ceil(Math.max(...xs)-x)), h=Math.min(canvas.height-y,Math.ceil(Math.max(...ys)-y));
  const data=ctx.getImageData(x,y,w,h).data; let r=0,g=0,b=0,n=0;
  for(let i=0;i<data.length;i+=40){if(data[i+3]>20){r+=data[i];g+=data[i+1];b+=data[i+2];n++;}}
  return n ? [r/n,g/n,b/n] : [128,128,128];
}

function finishResult(canvas) {
  const rendered=document.createElement('canvas'); rendered.width=canvas.width; rendered.height=canvas.height; rendered.getContext('2d').drawImage(canvas,0,0);
  const result=elements.resultCanvas; result.width=rendered.width; result.height=rendered.height; result.getContext('2d').drawImage(rendered,0,0);
  const saved=document.createElement('canvas'); saved.width=result.width; saved.height=result.height; saved.getContext('2d').drawImage(result,0,0);
  state.result=saved; elements.resultSection.hidden=false; setStatus('Resultado concluído','Compare com a foto original ou baixe em alta resolução.',100,'✓');
  elements.resultSection.scrollIntoView({behavior:'smooth',block:'start'});
}

function processLocalSwap() {
  try {
    setStatus('Criando o resultado', 'Alinhando a malha e combinando luz e cor…', 75, '…');
    const warped=createWarpedFace(); const result=elements.resultCanvas; result.width=state.target.width; result.height=state.target.height;
    const ctx=result.getContext('2d'); ctx.drawImage(state.target,0,0);
    if(elements.includeHair.checked){const recolored=createRecoloredTargetHair();if(recolored)ctx.drawImage(recolored,0,0);}
    const strength=Number(elements.colorMatch.value)/100; const src=meanColor(warped,state.targetPoints), dst=meanColor(state.target,state.targetPoints);
    const brightness=((dst[0]+dst[1]+dst[2])/(src[0]+src[1]+src[2]||1)-1)*strength+1;
    const colored=document.createElement('canvas'); colored.width=result.width; colored.height=result.height; const cctx=colored.getContext('2d');
    cctx.filter=`brightness(${Math.max(.65,Math.min(1.45,brightness))}) saturate(${1-strength*.08})`; cctx.drawImage(warped,0,0);
    const mask=document.createElement('canvas'); mask.width=result.width; mask.height=result.height; const mctx=mask.getContext('2d');
    mctx.filter=`blur(${elements.feather.value}px)`; ovalPath(mctx,state.targetPoints); mctx.fillStyle='#fff'; mctx.fill();
    cctx.globalCompositeOperation='destination-in'; cctx.drawImage(mask,0,0); cctx.globalCompositeOperation='source-over';
    ctx.globalAlpha=Number(elements.opacity.value)/100; ctx.drawImage(colored,0,0); ctx.globalAlpha=1;
    finishResult(result);
  } catch(error) { console.error(error); setStatus('Erro ao criar o resultado','Atualize a página e tente novamente com outras fotos.',10,'!'); }
}

async function decodeGeneratedImage(base64, mimeType) {
  const response=await fetch(`data:${mimeType};base64,${base64}`); const blob=await response.blob(); const bitmap=await createImageBitmap(blob);
  const canvas=document.createElement('canvas'); canvas.width=bitmap.width; canvas.height=bitmap.height; canvas.getContext('2d').drawImage(bitmap,0,0); bitmap.close(); return canvas;
}

async function processGenerativeSwap() {
  state.busy=true; elements.processButton.disabled=true;
  try {
    setStatus('Criando rosto e penteado','Enviando as duas imagens ao backend generativo. Isso pode levar alguns minutos…',35,'…');
    const form=new FormData(); form.append('target',state.targetFile); form.append('source',state.sourceFile); form.append('includeHair',String(elements.includeHair.checked));
    const response=await fetch('/api/generative-swap',{method:'POST',body:form,signal:AbortSignal.timeout(240_000)}); const payload=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(payload.error||`Falha no backend generativo (${response.status}).`);
    setStatus('Finalizando a imagem','Preparando a visualização em alta resolução…',90,'…'); finishResult(await decodeGeneratedImage(payload.image,payload.mimeType||'image/png'));
  } catch(error) {
    console.error(error); setStatus('Modo generativo indisponível',`${error.message} Se preferir, selecione o modo local e tente novamente.`,10,'!');
  } finally { state.busy=false; elements.processButton.disabled=false; }
}

function selectedMode(){return elements.processingModes.find((input)=>input.checked)?.value||'local';}
function processSwap(){if(state.busy)return;if(selectedMode()==='generative')processGenerativeSwap();else processLocalSwap();}

async function detectGenerativeAvailability(){
  const input=elements.processingModes.find((item)=>item.value==='generative'); const note=$('#generativeAvailability');
  try{const response=await fetch('/api/generative-swap',{headers:{Accept:'application/json'}});const payload=await response.json();if(!response.ok||!payload.available)throw new Error();input.disabled=false;input.checked=true;note.textContent=`Disponível com ${payload.model||'modelo generativo'}. Transfere rosto e penteado completos.`;}
  catch{input.disabled=true;note.textContent='Backend não configurado. O modo local continua disponível.';}
}

function bindDrop(card,input,kind){['dragenter','dragover'].forEach(e=>card.addEventListener(e,(event)=>{event.preventDefault();card.classList.add('dragging')}));['dragleave','drop'].forEach(e=>card.addEventListener(e,(event)=>{event.preventDefault();card.classList.remove('dragging')}));card.addEventListener('drop',(event)=>loadSlot(kind,event.dataTransfer.files[0]));input.addEventListener('change',()=>loadSlot(kind,input.files[0]));card.querySelector('.replace-button').addEventListener('click',(event)=>{event.preventDefault();input.click()});}
bindDrop(elements.sourceDrop,elements.sourceInput,'source'); bindDrop(elements.targetDrop,elements.targetInput,'target');
elements.processButton.addEventListener('click',processSwap);
elements.downloadButton.addEventListener('click',()=>elements.resultCanvas.toBlob((blob)=>{const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`faceup-${Date.now()}.png`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)},'image/png'));
function showOriginal(show){if(!state.target||!state.result)return;const ctx=elements.resultCanvas.getContext('2d');ctx.clearRect(0,0,elements.resultCanvas.width,elements.resultCanvas.height);ctx.drawImage(show?state.target:state.result,0,0);$('#comparisonLabel').hidden=!show;}
['pointerdown','keydown'].forEach(e=>elements.compareButton.addEventListener(e,event=>{if(e==='keydown'&&!['Enter',' '].includes(event.key))return;showOriginal(true)}));['pointerup','pointerleave','keyup'].forEach(e=>elements.compareButton.addEventListener(e,()=>showOriginal(false)));
[['feather','featherValue',''],['colorMatch','colorValue','%'],['opacity','opacityValue','%']].forEach(([id,out,suffix])=>elements[id].addEventListener('input',()=>{$(`#${out}`).value=`${elements[id].value}${suffix}`}));
$('#resetControls').addEventListener('click',()=>{elements.feather.value=34;elements.colorMatch.value=65;elements.opacity.value=100;$('#featherValue').value='34';$('#colorValue').value='65%';$('#opacityValue').value='100%'});
detectGenerativeAvailability();
