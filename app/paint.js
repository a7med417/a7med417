'use strict';
const $ = id => document.getElementById(id);
const surface = $('surface'), ctx = surface.getContext('2d');
const W = surface.width, H = surface.height;
const presets = { ink: { size: 18, flow: .8, hardness: 1 }, pencil: { size: 5, flow: .25, hardness: .75 }, air: { size: 100, flow: .06, hardness: 0 }, water: { size: 65, flow: .045, hardness: .35 } };
let layers = [], active = 0, nextId = 1, tool = 'brush', preset = 'ink', zoom = 1, stroke = null, dirty = false;
let history = [], future = [];
const makeCanvas = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
function newLayer(name) { return { id: nextId++, name, canvas: makeCanvas(), visible: true, opacity: 1, blend: 'source-over' }; }
function status(message) { $('status').textContent = message; }
function snapshot() { return { active, layers: layers.map(l => ({ id: l.id, name: l.name, visible: l.visible, opacity: l.opacity, blend: l.blend, pixels: l.canvas.getContext('2d').getImageData(0, 0, W, H) })) }; }
function remember() {
  history.push(snapshot()); future = [];
  // Bound pixel history to roughly 96 MiB, particularly for tablets.
  const memory = () => history.reduce((sum, s) => sum + s.layers.length * W * H * 4, 0);
  while (history.length > 1 && (history.length > 15 || memory() > 96 * 1024 * 1024)) history.shift();
  dirty = true; buttons();
}
function restore(s) { active = s.active; layers = s.layers.map(l => { const c = makeCanvas(); c.getContext('2d').putImageData(l.pixels, 0, 0); return { id: l.id, name: l.name, visible: l.visible, opacity: l.opacity, blend: l.blend, canvas: c }; }); dirty = true; render(); layerUI(); }
function buttons() { $('undo').disabled = !history.length; $('redo').disabled = !future.length; $('delete-layer').disabled = layers.length === 1; $('layer-up').disabled = active === layers.length - 1; $('layer-down').disabled = active === 0; }
function undo() { if (stroke || !history.length) return; future.push(snapshot()); restore(history.pop()); buttons(); }
function redo() { if (stroke || !future.length) return; history.push(snapshot()); restore(future.pop()); buttons(); }
function render() { ctx.clearRect(0, 0, W, H); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H); layers.forEach(l => { if (!l.visible) return; ctx.globalAlpha = l.opacity; ctx.globalCompositeOperation = l.blend; ctx.drawImage(l.canvas, 0, 0); }); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
function layerUI() {
  const list = $('layers'); list.replaceChildren();
  [...layers].reverse().forEach(l => {
    const row = document.createElement('div'); row.className = 'layer' + (layers[active] === l ? ' active' : ''); row.tabIndex = 0;
    const select = () => { active = layers.indexOf(l); layerUI(); };
    row.onclick = select; row.onkeydown = e => { if (e.key === 'Enter') select(); };
    const thumb = document.createElement('canvas'); thumb.width = 86; thumb.height = 54; thumb.className = 'thumb'; thumb.getContext('2d').drawImage(l.canvas, 0, 0, 86, 54);
    const name = document.createElement('span'); name.className = 'title'; name.textContent = l.name;
    const visibility = document.createElement('button'); visibility.className = 'visibility'; visibility.textContent = l.visible ? '◉' : '○'; visibility.title = l.visible ? 'إخفاء الطبقة' : 'إظهار الطبقة'; visibility.setAttribute('aria-label', visibility.title);
    visibility.onclick = e => { e.stopPropagation(); remember(); l.visible = !l.visible; render(); layerUI(); };
    row.append(thumb, name, visibility); list.append(row);
  });
  $('layer-opacity').value = Math.round(layers[active].opacity * 100); $('layer-opacity-value').textContent = $('layer-opacity').value + '%'; $('blend').value = layers[active].blend; buttons();
}
function reset() { layers = [newLayer('الطبقة 1')]; active = 0; history = []; future = []; dirty = false; render(); layerUI(); }
function setZoom(value) { zoom = Math.min(2.5, Math.max(.1, value)); $('paper').style.width = W * zoom + 'px'; $('paper').style.height = H * zoom + 'px'; $('zoom-label').textContent = Math.round(zoom * 100) + '%'; }
function fit() { const r = $('viewport').getBoundingClientRect(); setZoom(Math.min((r.width - 80) / W, (r.height - 80) / H)); }
function point(e) { const r = surface.getBoundingClientRect(); return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height, p: e.pointerType === 'pen' ? Math.max(.01, e.pressure) : .7 }; }
function stamp(x, y, p) {
  const c = layers[active].canvas.getContext('2d');
  const brush = presets[preset];
  const pressure = $('pressure').checked ? .12 + p * .88 : 1;
  const radius = Math.max(.35, Number($('size').value) * pressure / 2);
  c.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
  c.globalAlpha = Number($('opacity').value) / 100 * (tool === 'eraser' ? .8 : brush.flow);
  const color = tool === 'eraser' ? '#000000' : $('color').value;
  if (brush.hardness < 1 && tool !== 'eraser') {
    const g = c.createRadialGradient(x, y, radius * brush.hardness * .4, x, y, radius);
    g.addColorStop(0, color); g.addColorStop(1, color + '00'); c.fillStyle = g;
  } else c.fillStyle = color;
  c.beginPath(); c.arc(x, y, radius, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
}
function segment(from, to) {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const spacing = Math.max(.4, Number($('size').value) * .06);
  const steps = Math.max(1, Math.ceil(distance / spacing));
  for (let i = 1; i <= steps; i++) { const t = i / steps; stamp(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t, from.p + (to.p - from.p) * t); }
}
surface.addEventListener('pointerdown', e => {
  if (stroke || e.button !== 0 || ($('pen-only').checked && e.pointerType !== 'pen')) return;
  if (!layers[active].visible || layers[active].opacity === 0) { status('اختر طبقة ظاهرة للرسم'); return; }
  e.preventDefault(); remember(); const p = point(e); stroke = { id: e.pointerId, last: p }; surface.setPointerCapture(e.pointerId); stamp(p.x, p.y, p.p); render(); status(e.pointerType === 'pen' ? 'قلم متصل — ضغط القلم فعّال' : 'رسم بالماوس — ضغط ثابت');
});
surface.addEventListener('pointermove', e => {
  if (!stroke || e.pointerId !== stroke.id) return;
  const events = e.getCoalescedEvents?.();
  for (const sample of events?.length ? events : [e]) {
    const raw = point(sample), a = 1 - Number($('smooth').value) / 100;
    const next = { x: stroke.last.x + (raw.x - stroke.last.x) * a, y: stroke.last.y + (raw.y - stroke.last.y) * a, p: raw.p };
    segment(stroke.last, next); stroke.last = next;
  }
  render();
});
function finish(e) { if (!stroke || (e && e.pointerId !== stroke.id)) return; stroke = null; layerUI(); }
surface.addEventListener('pointerup', finish); surface.addEventListener('pointercancel', finish); surface.addEventListener('lostpointercapture', finish);
function selectTool(value) { tool = value; document.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('selected', b.dataset.tool === tool)); }
document.querySelectorAll('[data-tool]').forEach(b => b.onclick = () => selectTool(b.dataset.tool));
document.querySelectorAll('[data-preset]').forEach(b => b.onclick = () => { preset = b.dataset.preset; selectTool('brush'); $('size').value = presets[preset].size; updateSettings(); document.querySelectorAll('[data-preset]').forEach(p => p.classList.toggle('selected', p === b)); });
function updateSettings() { $('size-value').textContent = $('size').value + ' px'; $('opacity-value').textContent = $('opacity').value + '%'; $('smooth-value').textContent = $('smooth').value + '%'; }
['size', 'opacity', 'smooth'].forEach(id => $(id).oninput = updateSettings);
function color(value) { $('color').value = value; $('hex').textContent = value.toUpperCase(); }
$('color').oninput = () => color($('color').value);
['#344f65','#161b24','#ece5d7','#bd725b','#d7b577','#869985','#698d9f','#9a8dab','#e5b6bc','#be4749','#397b70','#5363a3'].forEach(value => { const b = document.createElement('button'); b.style.background = value; b.setAttribute('aria-label', value); b.onclick = () => color(value); $('swatches').append(b); });
$('undo').onclick = undo; $('redo').onclick = redo;
$('fit').onclick = fit; $('zoom-in').onclick = () => setZoom(zoom * 1.2); $('zoom-out').onclick = () => setZoom(zoom / 1.2);
$('add-layer').onclick = () => { if (layers.length >= 12) { status('الحد الأقصى لهذه النسخة 12 طبقة'); return; } remember(); layers.push(newLayer('الطبقة ' + nextId)); active = layers.length - 1; layerUI(); };
$('delete-layer').onclick = () => { if (layers.length < 2 || !confirm('حذف الطبقة المحددة؟')) return; remember(); layers.splice(active, 1); active = Math.min(active, layers.length - 1); render(); layerUI(); };
function moveLayer(delta) { const target = active + delta; if (target < 0 || target >= layers.length) return; remember(); [layers[active], layers[target]] = [layers[target], layers[active]]; active = target; render(); layerUI(); }
$('layer-up').onclick = () => moveLayer(1); $('layer-down').onclick = () => moveLayer(-1);
$('layer-opacity').oninput = () => { $('layer-opacity-value').textContent = $('layer-opacity').value + '%'; };
$('layer-opacity').onchange = () => { remember(); layers[active].opacity = Number($('layer-opacity').value) / 100; render(); layerUI(); };
$('blend').onchange = () => { remember(); layers[active].blend = $('blend').value; render(); layerUI(); };
function download(blob, name) { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 60000); }
$('export').onclick = () => { render(); surface.toBlob(blob => { if (blob) { download(blob, 'Nawa-artwork.png'); status('تم تجهيز صورة PNG للحفظ'); } }); };
$('save').onclick = () => { const data = { format: 'nawa', version: 1, width: W, height: H, active, layers: layers.map(l => ({ name: l.name, visible: l.visible, opacity: l.opacity, blend: l.blend, image: l.canvas.toDataURL('image/png') })) }; download(new Blob([JSON.stringify(data)], { type: 'application/json' }), 'Artwork.nawa'); dirty = false; status('تم تجهيز المشروع للحفظ — احتفظ بملف .nawa'); };
$('new').onclick = () => { if (stroke) return; if (dirty && !confirm('بدء لوحة جديدة؟ احفظ المشروع أولاً للاحتفاظ به.')) return; reset(); status('لوحة جديدة جاهزة'); };
$('open').onclick = () => { if (stroke) return; if (dirty && !confirm('فتح مشروع آخر؟ احفظ المشروع الحالي أولاً للاحتفاظ به.')) return; $('project-file').click(); };
$('project-file').onchange = async e => {
  const file = e.target.files[0]; if (!file) return;
  try {
    if (file.size > 80 * 1024 * 1024) throw new Error('المشروع كبير جداً');
    const data = JSON.parse(await file.text());
    if (data.format !== 'nawa' || data.version !== 1 || data.width !== W || data.height !== H || !Array.isArray(data.layers) || data.layers.length < 1 || data.layers.length > 12) throw new Error('صيغة المشروع غير مدعومة');
    const loaded = await Promise.all(data.layers.map(async item => {
      if (typeof item.name !== 'string' || typeof item.visible !== 'boolean' || !Number.isFinite(item.opacity) || item.opacity < 0 || item.opacity > 1 || !['source-over', 'multiply', 'screen'].includes(item.blend) || typeof item.image !== 'string' || !item.image.startsWith('data:image/png;base64,')) throw new Error('بيانات طبقة غير صالحة');
      const image = new Image(); image.src = item.image; await image.decode(); if (image.width !== W || image.height !== H) throw new Error('أبعاد طبقة غير صالحة');
      const layer = newLayer(item.name.slice(0, 80)); layer.visible = item.visible; layer.opacity = item.opacity; layer.blend = item.blend; layer.canvas.getContext('2d').drawImage(image, 0, 0); return layer;
    }));
    layers = loaded; active = Number.isInteger(data.active) ? Math.max(0, Math.min(layers.length - 1, data.active)) : 0; history = []; future = []; dirty = false; render(); layerUI(); status('تم فتح المشروع مع طبقاته');
  } catch (error) { status('تعذر فتح المشروع: ' + error.message); }
  e.target.value = '';
};
document.addEventListener('keydown', e => {
  if (e.target.matches('input,select,textarea') || stroke) return;
  const key = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && key === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
  else if ((e.ctrlKey || e.metaKey) && key === 's') { e.preventDefault(); $('save').click(); }
  else if (key === 'b') selectTool('brush'); else if (key === 'e') selectTool('eraser');
  else if (key === '[' || key === ']') { $('size').value = Math.max(1, Math.min(160, Number($('size').value) + (key === ']' ? 2 : -2))); updateSettings(); }
});
window.addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
reset(); requestAnimationFrame(fit);
if (location.protocol !== 'file:' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => status('الرسم متاح — التخزين دون اتصال غير متاح في هذا المتصفح'));
}
