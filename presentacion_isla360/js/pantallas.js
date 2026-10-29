// pantallas.js — pantalla del control (isla 360°) y pantalla de la cinta de desvío.
// Como en el TPI, la isla solo LEE EL CÓDIGO DE BARRAS: resultado OK (código válido,
// se pide el registro al ERP con el ID del ciclo) o No Read (la adquisición terminó
// bien pero ninguna cámara obtuvo un código válido: desvío a revisión manual).
// Se usa como módulo ES; las dependencias de main.js llegan por enlazar() o globalThis.
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pct = (x) => Math.round(100 * x);

// Pasos de la lectura (nombre, segundo en que se completa desde el primer disparo)
export const ETAPAS = [
  ['Bulto detenido en el plato', 0.1],
  ['Giro 360° y disparo C1 · C2 · C3', 0.35],
  ['Búsqueda del código en las 3 vistas', 0.8],
  ['Decodificación Code 128', 1.3],
  ['Resultado de lectura', 1.7],
  ['Acción del PLC', 2.1],
];

// Las 3 cámaras de la isla (mismo color que los conos de luz y el HMI)
export const CAMARAS = [
  { id: 'C1', nombre: 'Superior', color: '#4fc3ff' },
  { id: 'C2', nombre: 'Inferior', color: '#3ccf6e' },
  { id: 'C3', nombre: 'Lateral', color: '#ffc61a' },
];
const ID_CAM = ['C1', 'C2', 'C3'];
const camTxt = (cara) => (cara == null ? 'C1 · C2 · C3' : `${ID_CAM[cara]} ${CAMARAS[cara].nombre.toLowerCase()}`);

export const IMG = {};
if (typeof Image !== 'undefined') {
  for (const k of ['ok', 'tapada', 'rayada']) for (const t of ['foto', 'alineada']) { const i = new Image(); i.src = `assets/caso_${k}_${t}.jpg`; IMG[`${k}_${t}`] = i; }
  IMG.carton = new Image(); IMG.carton.src = 'assets/carton.jpg';
}

const esOK = (c) => c.veredicto === 'OK';
const sinPrefijo = (m) => { const t = String(m).replace(/^No Read: /, ''); return t.charAt(0).toUpperCase() + t.slice(1); };
export function resumenCaso(c, cara = null) {
  const ok = esOK(c);
  return [
    [ETAPAS[0][0], false, 'encoder confirma'],
    [ETAPAS[1][0], false, '3 fotos'],
    [ETAPAS[2][0], !ok, ok ? 'en ' + camTxt(cara) : 'etiqueta en ' + camTxt(cara)],
    [ETAPAS[3][0], !ok, ok ? 'válido' : 'sin código válido'],
    [ETAPAS[4][0], !ok, ok ? 'OK' : 'No Read'],
    [ETAPAS[5][0], !ok, ok ? 'registro en ERP (E2)' : 'desvío a revisión (E3)'],
  ];
}
/** Para la lista de errores del detalle: en No Read, uno solo (el código), sino ninguno. */
export function erroresDe(c, cara = null) {
  if (esOK(c)) return [];
  return [{ caja: c.codigo.caja, titulo: 'No Read', detalle: sinPrefijo(c.motivo), pct: null, grave: true, cam: cara == null ? null : ID_CAM[cara] }];
}
export function motivoHTML(c) {
  if (esOK(c)) return `<div class="mt-simple">Código <b>${esc(c.codigo.leido)}</b> leído y válido: se pide el registro al ERP con el ID del ciclo.</div>`;
  return `<div class="mt-tit">No Read</div><div class="mt-simple">${esc(sinPrefijo(c.motivo))} El bulto se desvía a revisión manual.</div>`;
}

// el recuadro del código sobre la etiqueta (150 × 110,49 mm)
const recuadro = (caja, clase, n = '') => { const [x, y, w, h] = caja, pad = 1.2; return `<div class="err ${clase}" style="left:${100 * (x - pad) / 150}%;top:${100 * (y - pad) / 110.49}%;width:${100 * (w + 2 * pad) / 150}%;height:${100 * (h + 2 * pad) / 110.49}%">${n ? `<i>${n}</i>` : ''}</div>`; };

// ---- montaje de una pantalla (HTML) dentro de un contenedor
const ICO_BIEN = '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M13 34 L27 48 L52 17"/></svg>';
const ICO_ETQ = '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M14 18 H50 V46 H14 Z M22 26 V38 M28 26 V38 M33 26 V38 M40 26 V38"/></svg>';
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
      <button type="button" class="p-boton bien" data-r="bien" disabled>${ICO_BIEN}<span>Leído con el lector de mano</span><small>Se registra el código y el bulto sigue a expedición</small></button>
      <button type="button" class="p-boton mal" data-r="mal" disabled>${ICO_ETQ}<span>Ilegible: etiqueta nueva</span><small>Se reimprime la etiqueta, se registra y sigue a expedición</small></button>
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

let nCiclo = 0;
const idCiclo = (b) => (b && typeof b === 'object' ? (b.idCiclo ||= 'ID ' + String(++nCiclo).padStart(5, '0')) : 'ID —');
function pLimpiar(P) {
  P.splash.className = 'p-splash'; P.marcas.innerHTML = ''; P.errores.innerHTML = ''; P.motivo.textContent = ''; P.motivo.className = 'p-motivo'; P.lado.classList.remove('res');
}
const fotoDe = (tipo) => `assets/caso_${tipo}_foto.jpg`;
const alineadaDe = (tipo) => `assets/caso_${tipo}_alineada.jpg`;
// la cámara que vio la etiqueta muestra la etiqueta; las otras dos, el cartón liso de su cara
const ponerFotos = (P, src) => { P.img.src = src; ['imgSup', 'imgInf', 'imgLat'].forEach((k, i) => { if (P[k]) { P[k].src = P.cara == null || P.cara === i ? src : 'assets/carton.jpg'; P[k].parentNode.classList.toggle('hallada', P.cara === i); } }); };
/** La foto que se está leyendo y los pasos, que se van marcando uno por uno. */
export function pIniciar(P, c, tipo, quien, b = null) {
  P.cara = b?.cara ?? null; P.tipo = tipo; P.campos = false; pLimpiar(P);
  P.etq.textContent = `${quien} · ${idCiclo(b)}`;
  P.sub.textContent = 'Lectura del código de barras · etiqueta en ' + camTxt(P.cara);
  P.ver.className = 'ver leyendo'; P.ver.textContent = 'LEYENDO';
  ponerFotos(P, fotoDe(tipo));
  P.checks.innerHTML = resumenCaso(c, P.cara).map(([n]) => `<li><i></i><span>${esc(n)}</span><b></b></li>`).join('');
  P.flash.classList.remove('dispara'); void P.flash.offsetWidth; P.flash.classList.add('dispara');
  P.escaneo.classList.remove('corre'); void P.escaneo.offsetWidth; P.escaneo.classList.add('corre');
}
export function pChecks(P, c, u, todos = false) {
  const filas = P.checks.children, res = resumenCaso(c, P.cara);
  if (!P.campos && (todos || u >= ETAPAS[2][1])) {                         // código ubicado: se ve la etiqueta derecha con el recuadro del código
    P.campos = true; ponerFotos(P, alineadaDe(P.tipo));
    P.marcas.innerHTML = recuadro(c.codigo.caja, 'campo');
  }
  if (P.campos && (todos || u >= ETAPAS[4][1])) { const el = P.marcas.firstChild; if (el && !el.classList.contains('hecho')) el.classList.add('hecho', esOK(c) ? 'bien' : 'mal'); }
  ETAPAS.forEach(([, t], i) => {
    if ((todos || u >= t) && filas[i] && !filas[i].classList.contains('hecho')) { filas[i].classList.add('hecho'); if (res[i][1]) filas[i].classList.add('mal'); filas[i].lastChild.textContent = res[i][2]; }
  });
}
/** El pantallazo: verde (OK) o rojo (No Read). */
export function pSplash(P, c) {
  const ok = esOK(c);
  P.ver.className = 'ver ' + (ok ? 'OK' : 'NO_OK'); P.ver.textContent = ok ? 'OK' : 'NO READ';
  P.sp_t.textContent = ok ? 'OK' : 'No Read';
  P.sp_m.innerHTML = ok ? `Código <b>${esc(c.codigo.leido)}</b><br>leído por ${esc(camTxt(P.cara))}` : 'Ninguna cámara obtuvo un código válido<br>→ desvío a revisión manual';
  P.sp_p.textContent = 'Certeza de la adquisición ' + pct(c.confianza) + ' %';
  P.splash.className = 'p-splash on ' + (ok ? 'ok' : 'mal');
}
/** El resultado: la etiqueta con el recuadro del código y la ficha de la lectura. */
export function pContenido(P, c, tipo) {
  const ok = esOK(c);
  P.splash.className = 'p-splash';
  ponerFotos(P, alineadaDe(tipo)); P.lado.classList.add('res');
  P.marcas.innerHTML = recuadro(c.codigo.caja, ok ? 'campo hecho bien' : '', ok ? '' : '!');
  const fila = (k, v, cls = '') => `<li class="${cls}"><span><b>${esc(k)}</b><small>${v}</small></span><em></em></li>`;
  P.errores.innerHTML = `<div class="e-prec"><span>Certeza de la adquisición</span><b>${pct(c.confianza)} %</b></div><ol class="e-lista lectura">` +
    fila('Resultado', ok ? 'OK · código válido' : 'No Read', ok ? 'ok' : '') +
    fila('Código', ok ? `<span class="mono">${esc(c.codigo.leido)}</span> · ${esc(c.codigo.simbologia)}` : 'sin código válido', ok ? 'ok' : '') +
    fila('Cámara', ok ? esc(camTxt(P.cara)) : 'ninguna de las 3 lo decodificó', ok ? 'ok' : '') +
    fila('Tiempo de lectura', `${c.segundos.toFixed(2)} s`, 'ok') +
    (ok ? '' : fila('Motivo', esc(sinPrefijo(c.motivo)))) +
    fila('Acción del PLC', ok ? 'E2 · solicita el registro al ERP con el ID del ciclo' : 'E3 · desviador → cinta de desvío → revisión manual', ok ? 'ok' : '') + '</ol>';
  P.motivo.className = 'p-motivo ' + (ok ? 'ok' : 'mal');
  P.motivo.textContent = ok ? 'Se guardan las 3 fotos y el código, con el ID del ciclo.' : 'Se guardan las 3 fotos: el operario puede ver por qué no se leyó.';
}

// ---- contexto: main.js puede inyectar dependencias; si no, se leen de globalThis
const V = { p1: null, p2: null, datos: null, tiempo: null, pintar: null, auto: null };
export function enlazar(ctx = {}) {
  if (ctx.p1) V.p1 = ctx.p1; if (ctx.p2) V.p2 = ctx.p2;
  if (ctx.datos) V.datos = ctx.datos; if (ctx.tiempo) V.tiempo = ctx.tiempo;
  if (ctx.pintar) V.pintar = ctx.pintar; if (ctx.autoRevisa) V.auto = ctx.autoRevisa;
}
const ahora = () => (typeof V.tiempo === 'function' ? V.tiempo() : (globalThis.S && typeof globalThis.S.t === 'number' ? globalThis.S.t : performance.now() / 1000));
const TODOS = () => V.datos || globalThis.datos || {};
const casoDe = (b) => { if (!b) return null; if (typeof b === 'string') return TODOS()[b] || null; return TODOS()[b.tipo] || null; };
const autoRevisa = () => (typeof V.auto === 'function' ? V.auto() : true);

// ---- pantalla del control: sigue la lectura de cada bulto (con el tiempo de la simulación)
export const HUD = { b: null, c: null, t0: 0, ts: 0, fase: '' };
export function hudIniciar(b) {
  const c = casoDe(b); if (!c || !V.p1) return;
  if (globalThis.S) globalThis.S.hudCaja = b;
  HUD.b = b; HUD.c = c; HUD.t0 = ahora(); HUD.fase = 'analisis';
  pIniciar(V.p1, c, b.tipo, 'Isla 360°', b);
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

// ---- pantalla de la cinta de desvío: el operario lee el código con el lector de mano (o reetiqueta)
export const REV = { b: null, c: null, t0: 0, fase: '', decision: null, tD: 0 };
export function revisionAbrir(b) {
  const c = casoDe(b); if (!c || !V.p2) return;
  const P = V.p2;
  REV.b = b; REV.c = c; REV.t0 = ahora(); REV.fase = 'splash'; REV.decision = null;
  pIniciar(P, c, b.tipo, 'Revisión manual', b); pChecks(P, c, 0, true); pSplash(P, c);
  P.bien.disabled = P.mal.disabled = true; P.bien.classList.remove('elegido'); P.mal.classList.remove('elegido'); if (P.botones) P.botones.classList.remove('listo');
  if (V.pintar) V.pintar('revision-splash', c, b.tipo);
}
export function revisionDecidir(b, d) {
  if (REV.b !== b || REV.decision || REV.fase !== 'etiqueta' || !V.p2) return;
  const P = V.p2;
  REV.decision = d; REV.tD = ahora();
  P.bien.disabled = P.mal.disabled = true; (d === 'bien' ? P.bien : P.mal).classList.add('elegido'); if (P.botones) P.botones.classList.remove('listo');
  P.motivo.className = 'p-motivo ok';
  P.motivo.textContent = d === 'bien' ? 'Código leído a mano y registrado: el bulto vuelve por la cinta de retorno y sigue a expedición.' : 'Etiqueta nueva impresa y registrada: el bulto vuelve por la cinta de retorno y sigue a expedición.';
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
  // decisión simulada: con la cinta tapada el lector de mano lee (se despega el pliegue); con el código rayado hace falta etiqueta nueva
  if (REV.fase === 'etiqueta' && !REV.decision && autoRevisa() && u > (visible ? 7 : 4.5)) revisionDecidir(REV.b, REV.b.tipo === 'rayada' ? 'mal' : 'bien');
}
export function revisionCerrar() {
  REV.b = null; REV.decision = null; REV.fase = '';
  if (V.pintar) V.pintar('revision-cierre', null, null);
}
export function paneles() {                                                  // cuál de las dos pantallas se ve en la presentación
  const S = globalThis.S, pant = document.getElementById('pantalla'), rev = document.getElementById('revision');
  const vivo = !!S && S.hud === 'vivo' && S.control;
  if (pant) pant.classList.toggle('oculto', !(vivo && S.pantalla !== 'revision' && !!HUD.b));
  if (rev) rev.classList.toggle('oculto', !(vivo && S.pantalla === 'revision' && !!REV.b));
}
