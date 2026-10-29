// pantallas.js — pantalla del control (isla 360°) y pantalla de la cinta de desvío.
// Deriva de presentacion_3d/js/main.js (ETAPAS, resumenCaso, motivoLimpio,
// erroresDe, recuadro, cajasErr, motivoHTML, montarPantalla, pEncabezado,
// pLimpiar, pIniciar, pChecks, pSplash, pContenido + HUD/REV).
// Se usa como módulo ES: import { montarPantalla, hudIniciar, ... } from './pantallas.js'.
// No toca el 3D ni lee $/S/datos al importar: esas dependencias se resuelven
// en cada llamada (vía enlazar() o vía globalThis), así main.js lo usa igual.
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pct = (x) => Math.round(100 * x);
const limpio = (t) => String(t || '').replace(/^[:; ]+|[.]+$/g, '');

// Las 8 etapas originales (mismo nombre y tiempo) + giro del plato al inicio
// y fusión de las 3 cámaras al final.
export const ETAPAS = [
  ['Giro 360° del plato', 0.1],
  ['Foto de la etiqueta', 0.2], ['Etiqueta ubicada y alineada con el diseño', 0.5], ['Defectos de tinta', 0.85], ['Barra de control', 1.15],
  ['Marcas de esquina', 1.4], ['Líneas y recuadros', 1.65], ['Texto, campo por campo', 2.25], ['Código de barras', 2.55],
  ['Fusión C1+C2+C3', 2.8],
];
const TIPO_DEFECTO = { tinta_de_mas: 'Tinta de más', tinta_faltante: 'Tinta faltante', linea_blanca: 'Línea blanca', linea_negra: 'Línea negra', linea_cortada: 'Línea cortada', marca_de_esquina: 'Marca de esquina' };

// Las 3 cámaras de la isla (mismo color que los leds del HMI).
export const CAMARAS = [
  { id: 'C1', nombre: 'Superior', color: '#4fc3ff' },
  { id: 'C2', nombre: 'Inferior', color: '#3ccf6e' },
  { id: 'C3', nombre: 'Lateral', color: '#ffc61a' },
];
const camColor = (id) => (CAMARAS.find((k) => k.id === id) || {}).color || '#9fb0bf';
const camNombre = (id) => (CAMARAS.find((k) => k.id === id) || {}).nombre || '';

export const IMG = {};
if (typeof Image !== 'undefined') {
  for (const k of ['ok', 'dato', 'linea']) for (const t of ['foto', 'alineada']) { const i = new Image(); i.src = `assets/caso_${k}_${t}.jpg`; IMG[`${k}_${t}`] = i; }
  IMG.carton = new Image(); IMG.carton.src = 'assets/carton.jpg';
}

export function resumenCaso(c) {
  const campos = c.campos, okC = campos.filter((x) => x.estado === 'OK').length;
  const okF = c.formas.filter((f) => f.estado === 'OK').length;
  const tinta = c.defectos.filter((d) => d.tipo !== 'linea_cortada' && d.tipo !== 'marca_de_esquina' && d.tipo !== 'linea_blanca' && !c.campos.some((x) => x.distinto));
  const barraMal = c.barra && !c.barra.ok;
  return [
    [ETAPAS[0][0], false, 'plato 360°'],
    [ETAPAS[1][0], false, 'C1+C2+C3'],
    [ETAPAS[2][0], false, '100 %'],
    [ETAPAS[3][0], tinta.length > 0, tinta.length ? tinta.length + ' marca(s)' : 'ninguno'],
    [ETAPAS[4][0], barraMal, barraMal ? 'línea blanca' : 'sin líneas blancas'],
    [ETAPAS[5][0], false, '4 de 4'],
    [ETAPAS[6][0], okF < c.formas.length && !barraMal, okF + ' / ' + c.formas.length],
    [ETAPAS[7][0], okC < campos.length, okC + ' / ' + campos.length],
    [ETAPAS[8][0], c.codigos.some((k) => k.estado !== 'OK'), c.codigos.every((k) => k.estado === 'OK') ? 'lee y coincide' : 'no coincide'],
    [ETAPAS[9][0], c.veredicto !== 'OK', c.veredicto === 'OK' ? '3/3 coinciden' : 'defecto confirmado'],
  ];
}
function motivoLimpio(c) {
  const d = c.campos.filter((x) => x.distinto);
  if (d.length) return 'Dato distinto: ' + d.map((x) => `${x.campo} dice «${limpio(x.visto)}» y debería decir «${x.esperado}»`).join('; ') + '.';
  return c.motivo;
}
const solapan = (a, b) => a[0] < b[0] + b[2] && a[0] + a[2] > b[0] && a[1] < b[1] + b[3] && a[1] + a[3] > b[1];
// De qué cámara vino cada error: de la que encontró la etiqueta (la etiqueta está en una sola cara del bulto).
const ID_CAM = ['C1', 'C2', 'C3'];
function camaraDe(e, cara) {
  if (cara != null) return ID_CAM[cara];
  const [x, y] = e.caja;
  if (e.fuente === 'barra' || x >= 100) return 'C3';
  return y < 35 ? 'C1' : 'C2';
}
/** Los errores de una lectura, en el orden en que se numeran sobre la etiqueta: primero los campos (con su precisión) y después los defectos de impresión. Cada uno trae `cam` (C1/C2/C3). */
export function erroresDe(c, cara = null) {
  const out = [];
  c.campos.filter((x) => x.estado !== 'OK').forEach((x) => out.push({ caja: x.caja, titulo: x.campo || 'Texto fijo de la plantilla', detalle: `ERP: ${x.esperado} · Leído: «${limpio(x.visto)}»`, pct: pct(x.certeza ?? 0), grave: x.estado === 'FALTA', fuente: 'campo' }));
  if (c.barra && !c.barra.ok) (c.barra.lineas_blancas || []).forEach((l) => {      // la línea blanca que cruza la barra de control (cabezal muerto)
    const [bx, , bw] = c.barra.caja; out.push({ caja: [bx, l.caja[1] - 0.6, bw, Math.max(1.2, l.caja[3] + 1.2)], titulo: 'Línea blanca en la barra de control', detalle: `A ${l.y_mm.toFixed(0)} mm del borde de arriba: probable elemento del cabezal muerto`, pct: null, grave: true, fuente: 'barra' });
  });
  c.defectos.forEach((d) => {
    const caja = [d.x_mm, d.y_mm, d.ancho_mm, d.alto_mm];
    if (out.some((o) => solapan(o.caja, caja.map((v, i) => (i < 2 ? v - 1.5 : v + 3))))) return;
    const bar = c.barra && !c.barra.ok && d.tipo === 'linea_cortada';
    out.push({ caja, titulo: bar ? 'Línea blanca en la barra de control' : (TIPO_DEFECTO[d.tipo] || d.tipo), detalle: bar ? 'Probable elemento del cabezal muerto' : `${d.area_mm2.toFixed(2)} mm² en (${d.x_mm.toFixed(0)}; ${d.y_mm.toFixed(0)}) mm`, pct: null, grave: d.gravedad === 'NO_OK', fuente: bar ? 'barra' : 'defecto' });
  });
  out.forEach((e) => { e.cam = camaraDe(e, cara); });
  return out;
}

// el recuadro de cada campo sobre la etiqueta: solo el contorno, el contenido se lee
const recuadro = (bulto, clase, n = '') => { const [x, y, w, h] = bulto, pad = 0.6; return `<div class="err ${clase}" style="left:${100 * (x - pad) / 150}%;top:${100 * (y - pad) / 110.49}%;width:${100 * (w + 2 * pad) / 150}%;height:${100 * (h + 2 * pad) / 110.49}%">${n ? `<i>${n}</i>` : ''}</div>`; };
const cajasErr = (errs) => errs.map((e, i) => recuadro(e.caja, e.grave ? '' : 'a', i + 1)).join('');
/** El motivo, para mirar y no para leer: cada dato distinto con lo que dice tachado y lo que debería decir al lado. */
export function motivoHTML(c) {
  const d = c.campos.filter((x) => x.distinto);
  if (!d.length) return `<div class="mt-simple">${esc(c.veredicto === 'OK' ? 'Sin diferencias con el diseño ni con los datos del envío.' : c.motivo)}</div>`;
  return `<div class="mt-tit">Dato distinto en ${d.length} ${d.length === 1 ? 'campo' : 'campos'}</div><div class="mt-dif">` +
    d.map((x) => `<div class="mt-f"><span class="mt-c">${esc(x.campo)}</span><s>${esc(limpio(x.visto))}</s><i aria-hidden="true">→</i><b>${esc(x.esperado)}</b></div>`).join('') + '</div>';
}

// ---- montaje de una pantalla (HTML) dentro de un contenedor
const ICO_BIEN = '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M13 34 L27 48 L52 17"/></svg>';
const ICO_MAL = '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M16 16 L48 48 M48 16 L16 48"/></svg>';
const miniVista = (r, cam) => `
    <figure class="p-cam" style="margin:0;min-width:0">
      <img data-r="${r}" alt="Cámara ${cam.id} ${cam.nombre}" style="width:100%;height:52px;object-fit:cover;object-position:top;display:block;border-radius:4px;border:2px solid ${cam.color};background:#05080b">
      <figcaption style="margin-top:2px;font-size:10.5px;font-weight:700;color:${cam.color};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${cam.id} · ${cam.nombre}</figcaption>
    </figure>`;
export function montarPantalla(el, conBotones) {
  el.innerHTML = `
    <div class="p-cab"><div><b data-r="etq"></b><small data-r="sub"></small></div><div class="ver" data-r="ver">—</div></div>
    <div class="p-cuerpo">
      <div class="p-foto">
        <div class="p-vista" data-r="vista" style="position:relative;aspect-ratio:150 / 110.49;background:#05080b;overflow:hidden"><img data-r="img" alt="Etiqueta"><div class="p-marcas" data-r="marcas"></div><div class="p-escaneo" data-r="escaneo"></div><div class="p-flash" data-r="flash"></div></div>
        <div class="p-cams" data-r="cams" style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;padding:6px;background:#05080b">${miniVista('imgSup', CAMARAS[0])}${miniVista('imgInf', CAMARAS[1])}${miniVista('imgLat', CAMARAS[2])}</div>
      </div>
      <div class="p-lado" data-r="lado"><ul class="p-checks" data-r="checks"></ul><div class="p-errores" data-r="errores"></div></div>
      <div class="p-splash" data-r="splash"><b data-r="sp_t"></b><span data-r="sp_m"></span><em data-r="sp_p"></em></div>
    </div>
    <div class="p-motivo" data-r="motivo"></div>` + (conBotones ? `
    <div class="p-botones" data-r="botones">
      <button type="button" class="p-boton bien" data-r="bien" disabled>${ICO_BIEN}<span>Lectura correcta</span><small>El defecto es real: se reimprime la etiqueta y el bulto vuelve a pasar</small></button>
      <button type="button" class="p-boton mal" data-r="mal" disabled>${ICO_MAL}<span>Lectura incorrecta</span><small>Se repite la lectura: el bulto vuelve a pasar por la isla 360°</small></button>
    </div>` : '');
  const r = { raiz: el }; el.querySelectorAll('[data-r]').forEach((n) => { r[n.dataset.r] = n; });
  if (el.id === 'pantalla') V.p1 = r; else if (el.id === 'revision') V.p2 = r;
  if (conBotones && r.bien && !el.dataset.revBtn) {
    el.dataset.revBtn = '1';
    r.bien.addEventListener('click', () => { if (REV.b) revisionDecidir(REV.b, 'bien'); });
    r.mal.addEventListener('click', () => { if (REV.b) revisionDecidir(REV.b, 'mal'); });
  }
  return r;
}

function pEncabezado(P, c, tipo, quien) {
  P.etq.textContent = quien + ' · ' + c.datos.producto.trim();
  P.sub.textContent = 'Envío ' + c.datos.caja + ' · datos del ERP (mock)' + (P.cara != null ? ' · etiqueta en la cara ' + ['de arriba (C1)', 'de abajo (C2)', 'del costado (C3)'][P.cara] : '');
  P.ver.className = 'ver leyendo'; P.ver.textContent = 'LEYENDO';
}
function pLimpiar(P) {
  P.splash.className = 'p-splash'; P.marcas.innerHTML = ''; P.errores.innerHTML = ''; P.motivo.textContent = ''; P.motivo.className = 'p-motivo'; P.lado.classList.remove('res');
}
const fotoDe = (tipo) => `assets/caso_${tipo}_foto.jpg`;
const alineadaDe = (tipo) => `assets/caso_${tipo}_alineada.jpg`;
// la cámara que encontró la etiqueta muestra la etiqueta; las otras dos, el cartón liso de su cara
const ponerFotos = (P, src) => { P.img.src = src; ['imgSup', 'imgInf', 'imgLat'].forEach((k, i) => { if (P[k]) { P[k].src = P.cara == null || P.cara === i ? src : 'assets/carton.jpg'; P[k].parentNode.classList.toggle('hallada', P.cara === i); } }); };
/** La foto que se está analizando y los controles, que se van marcando uno por uno. */
export function pIniciar(P, c, tipo, quien, cara = null) {
  P.cara = cara; pLimpiar(P); pEncabezado(P, c, tipo, quien);
  ponerFotos(P, fotoDe(tipo)); P.tipo = tipo; P.campos = false;
  P.checks.innerHTML = resumenCaso(c).map(([n]) => `<li><i></i><span>${esc(n)}</span><b></b></li>`).join('');
  P.flash.classList.remove('dispara'); void P.flash.offsetWidth; P.flash.classList.add('dispara');
  P.escaneo.classList.remove('corre'); void P.escaneo.offsetWidth; P.escaneo.classList.add('corre');
}
const idxEtapa = (ini) => ETAPAS.findIndex(([n]) => n.startsWith(ini));
export function pChecks(P, c, u, todos = false) {
  const filas = P.checks.children, res = resumenCaso(c);
  const iAlin = idxEtapa('Etiqueta ubicada'), iTexto = idxEtapa('Texto, campo'), iCod = idxEtapa('Código de barras');
  if (!P.campos && (todos || u >= ETAPAS[iAlin][1])) {                       // ubicada: se ve derecha, con el recuadro de cada campo que va a controlar
    P.campos = true; ponerFotos(P, alineadaDe(P.tipo));                     // las 3 mini-vistas también pasan a la foto alineada
    P.marcas.innerHTML = c.campos.map((x) => recuadro(x.caja, 'campo')).join('');
  }
  if (P.campos && (todos || u >= ETAPAS[iTexto][1])) {                       // texto campo por campo: cada recuadro queda verde o rojo, uno detrás de otro
    const k = todos ? 1 : Math.min(1, (u - ETAPAS[iTexto][1]) / (ETAPAS[iCod][1] - ETAPAS[iTexto][1]));
    [...P.marcas.children].forEach((el, i) => { if (i < k * c.campos.length && !el.classList.contains('hecho')) el.classList.add('hecho', c.campos[i].estado === 'OK' ? 'bien' : 'mal'); });
  }
  ETAPAS.forEach(([, t], i) => {                                            // el giro (primera) y la fusión (última) se marcan como las demás
    if ((todos || u >= t) && filas[i] && !filas[i].classList.contains('hecho')) { filas[i].classList.add('hecho'); if (res[i][1]) filas[i].classList.add('mal'); filas[i].lastChild.textContent = res[i][2]; }
  });
}
/** El pantallazo: verde (OK) o rojo (NO OK) con la lectura que se hizo y su precisión. */
export function pSplash(P, c) {
  const ok = c.veredicto === 'OK';
  P.ver.className = 'ver ' + c.veredicto; P.ver.textContent = ok ? 'OK' : 'NO OK';
  P.sp_t.textContent = ok ? 'OK' : 'NO OK';
  P.sp_m.innerHTML = ok ? 'Todo coincide con el diseño y con los datos del envío' : motivoHTML(c);
  P.sp_p.textContent = 'Precisión de la lectura ' + pct(c.confianza) + ' %';
  P.splash.className = 'p-splash on ' + (ok ? 'ok' : 'mal');
}
/** La etiqueta con los errores señalados y numerados (como en el sistema) y la precisión de cada campo. Cada error dice de qué cámara vino (C1/C2/C3). */
export function pContenido(P, c, tipo) {
  const ok = c.veredicto === 'OK', errs = erroresDe(c, P.cara);
  P.splash.className = 'p-splash';
  ponerFotos(P, alineadaDe(tipo)); P.lado.classList.add('res');             // la etiqueta limpia: los errores se señalan encima, sin taparla
  P.marcas.innerHTML = cajasErr(errs);
  const okC = c.campos.filter((x) => x.estado === 'OK').length;
  const menos = c.campos.filter((x) => x.estado === 'OK' && x.certeza != null).sort((a, b) => a.certeza - b.certeza)[0];
  P.errores.innerHTML = `<div class="e-prec"><span>Precisión de la lectura</span><b>${pct(c.confianza)} %</b></div>` + (ok
    ? `<div class="e-ok"><b>Sin errores</b><span>${okC} de ${c.campos.length} campos coinciden<br>${c.formas.filter((f) => f.estado === 'OK').length} de ${c.formas.length} líneas y recuadros<br>${menos ? 'Campo menos seguro: ' + esc(menos.campo || 'texto fijo') + ' ' + pct(menos.certeza) + ' %' : ''}</span></div>`
    : '<ol class="e-lista">' + errs.map((e, i) => `<li class="${e.grave ? '' : 'a'}"><i>${i + 1}</i><span><b>${esc(e.titulo)}</b><small>${esc(e.detalle)}</small><small class="cam" style="color:${camColor(e.cam)}">◉ ${e.cam} · ${camNombre(e.cam)}</small></span>${e.pct != null ? `<em>${e.pct} %<s style="width:${e.pct}%"></s></em>` : '<em></em>'}</li>`).join('') + '</ol>');
  P.motivo.className = 'p-motivo ' + (ok ? 'ok' : 'mal');
  P.motivo.textContent = ok ? 'Se guarda la foto de las 3 caras y el resultado del caja.' : errs.length + (errs.length === 1 ? ' error señalado' : ' errores señalados') + ' en la etiqueta (círculos numerados).';
}

// ---- contexto: main.js puede inyectar dependencias; si no, se leen de globalThis
const V = { p1: null, p2: null, datos: null, tiempo: null, pintar: null, auto: null };
/** Opcional: enlazar({ p1, p2, datos, tiempo, pintar, autoRevisa }). p1/p2 son lo que devolvió montarPantalla; tiempo() devuelve los segundos de simulación; pintar(modo, caso, tipo) repinta el monitor 3D; autoRevisa() dice si la decisión del operario se simula. */
export function enlazar(ctx = {}) {
  if (ctx.p1) V.p1 = ctx.p1; if (ctx.p2) V.p2 = ctx.p2;
  if (ctx.datos) V.datos = ctx.datos; if (ctx.tiempo) V.tiempo = ctx.tiempo;
  if (ctx.pintar) V.pintar = ctx.pintar; if (ctx.autoRevisa) V.auto = ctx.autoRevisa;
}
const ahora = () => (typeof V.tiempo === 'function' ? V.tiempo() : (globalThis.S && typeof globalThis.S.t === 'number' ? globalThis.S.t : performance.now() / 1000));
const TODOS = () => V.datos || globalThis.datos || {};
const casoDe = (b) => { if (!b) return null; if (b.caso) return b.caso; if (typeof b === 'string') return TODOS()[b] || null; return TODOS()[b.tipo] || null; };
const autoRevisa = () => (typeof V.auto === 'function' ? V.auto() : (typeof globalThis.libre === 'boolean' ? !globalThis.libre : true));

// ---- pantalla del control: sigue la lectura de cada bulto (con el tiempo de la simulación)
export const HUD = { b: null, c: null, t0: 0, ts: 0, fase: '' };
export function hudIniciar(b) {
  const c = casoDe(b); if (!c || !V.p1) return;
  if (globalThis.S) globalThis.S.hudCaja = b; if (b && typeof b === 'object') b.hudCaso = c;
  HUD.b = b; HUD.c = c; HUD.t0 = ahora(); HUD.fase = 'analisis';
  pIniciar(V.p1, HUD.c, b.tipo, 'Isla 360°', b.cara ?? null);
}
export function hudVeredicto(b) {
  if (HUD.b !== b || !V.p1) return;
  HUD.fase = 'splash'; HUD.ts = ahora(); pChecks(V.p1, HUD.c, 0, true); pSplash(V.p1, HUD.c);
}
export function hudActualizar() {
  if (!HUD.b || !V.p1) return;
  if (HUD.fase === 'analisis') pChecks(V.p1, HUD.c, ahora() - HUD.t0);
  else if (HUD.fase === 'splash' && ahora() - HUD.ts > 1.5) { HUD.fase = 'resultado'; pContenido(V.p1, HUD.c, HUD.b.tipo); }
}

// ---- pantalla de la cinta de desvío: el operario revisa la primer bulto de la fila y dice si la lectura fue correcta
export const REV = { b: null, c: null, t0: 0, fase: '', decision: null, tD: 0 };
export function revisionAbrir(b) {
  const c = casoDe(b); if (!c || !V.p2) return;
  const P = V.p2;
  REV.b = b; REV.c = c; REV.t0 = ahora(); REV.fase = 'splash'; REV.decision = null;
  pIniciar(P, REV.c, b.tipo, 'Cinta de desvío', b.cara ?? null); pChecks(P, REV.c, 0, true); pSplash(P, REV.c);
  P.bien.disabled = P.mal.disabled = true; P.bien.classList.remove('elegido'); P.mal.classList.remove('elegido'); if (P.botones) P.botones.classList.remove('listo');
  if (V.pintar) V.pintar('revision-splash', REV.c, b.tipo);
}
export function revisionDecidir(b, d) {
  if (REV.b !== b || REV.decision || REV.fase !== 'etiqueta' || !V.p2) return;
  const P = V.p2;
  REV.decision = d; REV.tD = ahora();
  P.bien.disabled = P.mal.disabled = true; (d === 'bien' ? P.bien : P.mal).classList.add('elegido'); if (P.botones) P.botones.classList.remove('listo');
  P.motivo.className = 'p-motivo ' + (d === 'bien' ? 'ok' : 'mal');
  P.motivo.textContent = d === 'bien' ? 'Lectura correcta: se reimprime la etiqueta y el caja vuelve a pasar por la isla para confirmarse.' : 'Lectura incorrecta: se repite la lectura, el caja vuelve a pasar por la isla.';
  if (V.pintar) V.pintar('revision-decision', REV.c, b.tipo, { decision: d });
}
export function revisionActualizar() {
  if (!REV.b || !V.p2) return;
  const u = ahora() - REV.t0;
  if (REV.fase === 'splash' && u > 1.5) {
    REV.fase = 'etiqueta'; pContenido(V.p2, REV.c, REV.b.tipo); V.p2.bien.disabled = V.p2.mal.disabled = false; if (V.p2.botones) V.p2.botones.classList.add('listo');
    if (V.pintar) V.pintar('revision-etiqueta', REV.c, REV.b.tipo);
  }
  const S = globalThis.S, visible = !!S && S.hud === 'vivo' && S.control;
  if (REV.fase === 'etiqueta' && !REV.decision && autoRevisa() && u > (S ? (visible ? 7 : 4.5) : 4.5)) revisionDecidir(REV.b, REV.b.tipo === 'linea' ? 'mal' : 'bien');
}
export function revisionCerrar() {
  REV.b = null; REV.decision = null; REV.fase = '';
  const m = globalThis.PASOS && globalThis.PASOS[globalThis.paso] && globalThis.PASOS[globalThis.paso].monitor;
  if (V.pintar) V.pintar('revision-cierre', m ? casoDe(m) : null, m || null);
}
export function paneles() {                                                  // cuál de las dos pantallas se ve en la presentación
  const S = globalThis.S, pant = typeof document !== 'undefined' && document.getElementById('pantalla'), rev = typeof document !== 'undefined' && document.getElementById('revision');
  if (S && typeof S.hud !== 'undefined') {
    const vivo = S.hud === 'vivo' && S.control;
    if (pant) pant.classList.toggle('oculto', !(vivo && S.pantalla !== 'revision' && !!HUD.b));
    if (rev) rev.classList.toggle('oculto', !(vivo && S.pantalla === 'revision' && !!REV.b));
  } else {
    if (pant && HUD.b) pant.classList.remove('oculto');
    if (rev && REV.b) rev.classList.remove('oculto');
  }
}
