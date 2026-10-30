// presentacion_facultad/js/main.js — integrador (IMPORTACIÓN: camión → isla 360° → expedición).
//
// Adapta los 11 módulos a sus APIs REALES (no al contrato imaginado del primer borrador):
//   escena.js:    singletons S, G, CALL + initEscena(cont, {base, onProgreso}) que ya carga el GLB,
//                 arma transporte/pallet/camión/monitores básicos y expone consts (V, X_*, LX...).
//   isla.js:      crearIsla(scene, G, THREE, CFG) + animarIsla(S, G, dt). Pide {islaX, islaZ, platoY, T_GIRO}.
//   cajas.js:     initCajas(S, {scene, cfg, callbacks}) + spawn/moverCaja/reasignar/adelantarCaja/palletStep
//                 con callbacks onFoto/onIsla/onVeredicto/onRetencion/onRevisionAbrir/onRevisionCerrar.
//   pantallas.js: montarPantalla(el, conBotones) + enlazar({p1,p2,datos,tiempo,pintar,autoRevisa}) + HUD/REV.
//   monitores.js: pintarMonitor(m, modo, c, tipo, ex) triple + MON (M1/datos/IMG/reloj) + monitorControl.
//   hmi.js:       initHMI(S, callbacks) + actualizarHMI/log/setAlarma. S.paso es string 'E0'..'E5'.
//   grafcet.js:   initGrafcet(svgEl, olEl) + pintarGrafcet(paso, subfase).
//   escenarios.js: initEscenarios({S, P, log}) + ocurre(id) + CASOS (objeto vivo del panel).
//   relato.js:    PASOS/CAMS + initRelato({onPaso, onModo, empezar}) + irPaso/siguiente/anterior/ponerPlay.
//   config.js:    CFG (geometría, isla, cámaras, luces, tiempos, INFO).
import * as THREE from 'three';
import { CFG } from './config.js';
import {
  S, G, CALL, V, LX, X_SPAWN, X_TRIG, X_ISLA,
  initEscena, resize, render, pasoZoom, tickCielo, mostrarLlamadas, llamada, texturaBanda, texturaPiso,
  ACENTOS, LUCES_ROJAS,
} from './escena.js';
import { scene, camera, renderer, controls, composer } from './escena.js';
import { crearIsla, animarIsla } from './isla.js';
import {
  initCajas, crearTexturasEtiqueta as crearTexCajas, crearCaja, crearPallet, proximoTipo, cambiarTipo, moverCaja, reasignar,
  adelantarCaja, quitarCaja, REV as CREV, revisionAbrir as cajasRevisionAbrir, LX as LX_CAJA, H as H_CAJA, BELT as BELT_CAJA,
} from './cajas.js';
import { initDescarga, tickDescarga } from './descarga.js';
import { initAlmacen, tickAlmacen } from './almacen.js';
import { crearEntorno } from './entorno.js';
import {
  montarPantalla, enlazar as enlazarPantallas, HUD, hudIniciar, hudVeredicto, hudActualizar,
  REV as PREV, revisionAbrir as pantRevisionAbrir, revisionActualizar, revisionCerrar as pantRevisionCerrar,
  paneles, erroresDe, motivoHTML, IMG,
} from './pantallas.js';
import { pintarMonitor, MON, monitorControl, monitoresStep } from './monitores.js';
import { initHMI, actualizarHMI, log, setAlarma } from './hmi.js';
import { initGrafcet, pintarGrafcet, tourGrafcet, salirTour } from './grafcet.js';
import { initEscenarios, ocurre, CASOS } from './escenarios.js';
import { PASOS, CAMS, initRelato, irPaso, siguiente, anterior, ponerPlay, estadoRelato } from './relato.js';

const $ = (id) => document.getElementById(id);
const lerp = (a, b, t) => a + (b - a) * t;
const suave = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ------------------------------------------------------------------ estado (se extiende el S de escena.js)
Object.assign(S, {
  control: true, hud: 'oculto', chips: false, pantalla: 'control',
  cola: [], patron: 0, proxSpawn: 0.6, stockCamion: 72, slotCamion: 6, flash: 0,
  opCaja: null, hudCaja: null, isla: null, opT: 0, pushRet: false, avisoT: 0,
  girando: false, alarma: null, auto: true, stopReq: false,
  paso: 'E0', fase: 'espera', faseT: 0, avisado: false,
  velMul: 1, operarioRev: true, modoDescarga: 'manual', comparacion: [],
  camiones: 0, tCamion: 0, kpi: { proc: 0, ok: 0, nr: 0, al: 0, tiempos: [] },
  S_ING: false, S_ZONA: false, platoOK: true,
});
globalThis.S = S;
let datos = null, M1 = null, M2 = null, P1 = null, P2 = null;
let listo = false, tRelato = 0, relojCam = 0, pasoActual = null, tBalizas = 0;
let tween = null, orbitar = false, introVuelo = false;
const TOUR = { ids: null, i: -1, t: 0, dur: 8.5 };
const HL = { id: null, malla: null, reanudar: false };
let E5previo = false;

// ------------------------------------------------------------------ init
const cont = $('escena');
const cargando = $('cargando-txt');
fetch('assets/casos.json')
  .then((r) => { if (!r.ok) throw new Error('casos.json (' + r.status + ')'); return r.json(); })
  .then((d) => {
    datos = d; globalThis.datos = datos;
    return initEscena(cont, {
      base: 'assets',
      onProgreso: (p) => { if (cargando) cargando.textContent = 'modelo 3D ' + p + ' %'; },
    });
  })
  .then(() => {
    crearIsla(scene, G, THREE, { islaX: X_ISLA, islaZ: 0, platoY: 0.8, T_GIRO: 3.2, banda: () => texturaBanda(false), llamada });
    G.T_GIRO = 3.2;
    crearTexCajas();
    M1 = G.monControl; M2 = G.monDesvio; globalThis.M1 = M1;
    pintarMonitor(M1, 'espera', null, null); pintarMonitor(M2, 'espera', null, null);
    P1 = montarPantalla($('pantalla'), false);
    P2 = montarPantalla($('revision'), true);
    enlazarPantallas({
      p1: P1, p2: P2, datos, tiempo: () => S.t,
      pintar: pintarMon, autoRevisa: () => !estadoRelato().libre,
    });
    MON.M1 = M1; MON.datos = datos; MON.IMG = IMG; MON.reloj = () => S.t;
    initCajas(S, {
      scene, cfg: { camionBaseX: -9.6 },
      callbacks: { onFoto, onIsla, onVeredicto, onRetencion, onRevisionAbrir, onRevisionCerrar, onCamionVacio, onPalletListo },
    });
    initDescarga({ G, S, crearCaja, quitarCaja, tipo: () => proximoTipo(S), log,
      alSoltar: (b) => { if (CASOS.etiquetas && b.tipo === 'ok' && Math.random() < 0.4) cambiarTipo(b, Math.random() < 0.5 ? 'tapada' : 'rayada'); }, BELT: BELT_CAJA, H: H_CAJA, LX: LX_CAJA });
    initAlmacen({ scene, S, G, crearPallet, quitarCaja, PAL_X: 6.0, log });
    crearEntorno({ scene, G, texturaPiso });
    initHMI(S, {});
    initGrafcet(null, null);
    initEscenarios({ S, P: { pctOK: 92 }, log });
    camera.position.set(-26, 19, 30); controls.target.set(-2, 0.5, 0);   // cinemática de entrada: vuela desde lejos hasta la línea
    introVuelo = true; $('intro')?.classList.remove('oculto'); setTimeout(() => $('intro')?.classList.add('oculto'), 5200);
    initRelato({ onPaso: aplicarPaso, empezar: 0 });
    cablear();
    S.tCamion = 0;
    $('cargando')?.classList.add('fuera');
    listo = true;
    requestAnimationFrame(bucle);
  })
  .catch((e) => {
    if (cargando) cargando.textContent = 'No se pudo cargar (' + e.message + '). ' +
      (location.protocol === 'file:'
        ? 'Abrí la presentación con INICIAR.bat (doble clic): el visor necesita el servidor local.'
        : 'Revisá que el servidor local esté en marcha (INICIAR.bat).');
  });

// Pintor de monitores 3D para pantallas.js (solo lado revisión; el control lo maneja onFoto/onVeredicto).
function pintarMon(modo, c, tipo, ex = {}) {
  if (!M2 || !c) return;
  if (modo === 'revision-splash') pintarMonitor(M2, 'splash', c, tipo);
  else if (modo === 'revision-etiqueta' || modo === 'revision-decision')
    pintarMonitor(M2, 'etiqueta', c, tipo, { botones: true, decision: PREV.decision, cara: PREV.b?.cara ?? null });
  else pintarMonitor(M2, 'espera', null, null);
}

// ------------------------------------------------------------------ callbacks de cajas.js
function onFoto(b, i) {
  S.flash = 1; S.disparo = { i, t: S.t };
  if (i === 0 && b.tipo && datos[b.tipo]) { hudIniciar(b); monitorControl(b, 'leyendo'); }
  if (ocurre('luz')) log('Isla 360°', 'Destello irregular en una luz: conviene limpiar la óptica y repetir la verificación.', 'Revisar.');
}
function onIsla(b) {
  log('Isla 360°', 'Bulto ' + (b.tipo || '') + ' en el plato: giro 360° y disparo C1·C2·C3.', 'Ciclo en curso.');
  if (S.platoOK === false || ocurre('plato')) return retenerE5(b, 'Plato descentrado', 'El plato vibra y no confirma la detención: recentrarlo en planta y rearmar.');
  if (ocurre('lectura')) return retenerE5(b, 'Lectura inválida', 'Dos cámaras entregan códigos distintos (o se perdió la comunicación): no es No Read, es falla y va a E5.');
}
function onVeredicto(b) {
  S.ver = { ok: !b.malo, t: S.t };
  hudVeredicto(b); monitorControl(b, 'splash');
  S.kpi.proc++; if (b.malo) S.kpi.nr++; else S.kpi.ok++;
  S.kpi.tiempos.push(3.2);
  const c = datos[b.tipo];
  log('Isla 360°', b.malo ? 'No Read: ninguna cámara obtuvo un código válido. Se desvía a revisión manual.' : `Código ${c?.codigo?.leido ?? ''} leído por C${(b.cara ?? 0) + 1}: se pide el registro al ERP con el ID del ciclo.`, b.malo ? 'No Read.' : 'Lectura OK.');
  if (!b.malo && ocurre('erp')) {
    b.holdE5 = true;
    setAlarma('erp', 'ERP sin respuesta', 'No llegó la confirmación del registro para este ID: el bulto queda retenido. Se consulta por ID (sin duplicar) y se rearma.');
    S.paso = 'E5'; S.fase = 'falla ERP';
    return;
  }
  if (b.malo && ocurre('aire')) {
    b.holdE5 = true;
    setAlarma('aire', 'Falta de aire comprimido', 'El desviador no confirma S_EXT: el bulto queda retenido. Se purga la línea y se rearma.');
    S.paso = 'E5'; S.fase = 'falla aire';
  }
}
function onRetencion(b) {
  log('Isla 360°', 'Bulto retenido en el plato (E5): reconocer → resolver en planta → rearmar.', 'Falla.');
}
function onRevisionAbrir(b) {
  cajasRevisionAbrir(b); pantRevisionAbrir(b);
  const c = datos[b.tipo];
  if (c) pintarMonitor(M2, 'splash', c, b.tipo);
}
function onRevisionCerrar(b, dec) {
  pantRevisionCerrar();
  const m = pasoActual?.monitor;
  if (m && datos[m]) pintarMonitor(M2, 'etiqueta', datos[m], m, { botones: true });
  else pintarMonitor(M2, 'espera', null, null);
  log('Revisión manual', dec === 'bien' ? 'Código leído con el lector de mano y registrado: el bulto sigue por la cinta de retorno a expedición.' : 'Etiqueta ilegible: se imprime una nueva, se registra y el bulto sigue por la cinta de retorno a expedición.', 'Registro manual.');
}
function onCamionVacio() {
  const min = (S.t - S.tCamion) / 60;
  S.camiones++; S.comparacion.unshift({ n: S.camiones, modo: S.modoDescarga === 'manual' ? 'manual' : 'asistida', min, bph: min > 0 ? 72 / (min / 60) : 0 });
  S.tCamion = S.t;
  log('Descarga', 'Camión ' + S.camiones + ' vaciado (' + min.toFixed(1) + ' min): llega otro con 72 cajas.', 'Ciclo de descarga.');
}
function onPalletListo(p) {
  log('Expedición', 'Pallet completo (12 bultos identificados): se envuelve y el autoelevador lo lleva al almacén.', 'Pallet armado.');
}
function retenerE5(b, tipo, causa) {
  b.retenida = true;
  setAlarma('isla', tipo, causa);
  S.paso = 'E5'; S.fase = 'falla';
  onRetencion(b);
}

// ------------------------------------------------------------------ relato: aplicar un paso a la simulación
function aplicarPaso(p, i) {
  tRelato = 0; relojCam = 0; pasoActual = p;
  S.control = p.control; S.hud = p.hud || 'oculto'; S.chips = !!p.chips; S.pantalla = p.pantalla || 'control';
  if (p.forzar) { reasignar(p.forzar); S.proxSpawn = Math.min(S.proxSpawn, 1.0); }
  $('contadores')?.classList.toggle('oculto', !p.control);
  if (p.hud === 'vivo') adelantarCaja();
  renderDetalle(p.hud === 'detalle' ? (p.detalle || 'ok') : null);
  $('costos')?.classList.toggle('oculto', p.panel !== 'costos');
  if (p.panel === 'grafcet') $('grafcet')?.classList.remove('oculto'); else if (S.grafcetPorRelato) $('grafcet')?.classList.add('oculto');
  S.grafcetPorRelato = p.panel === 'grafcet';
  if (p.monitor && M2 && datos[p.monitor] && !PREV.b)
    pintarMonitor(M2, 'etiqueta', datos[p.monitor], p.monitor, { botones: true });
  mostrarLlamadas(p.call || []);
  resaltar(p.foco || null);
  TOUR.ids = p.tour || null; TOUR.i = -1; TOUR.t = TOUR.dur;
  if (!p.tour) $('info')?.classList.add('oculto');                   // la ficha del recorrido no queda pegada al cambiar de paso
  document.body.classList.toggle('en-cierre', !!p.cierre);
  $('cierre')?.classList.toggle('oculto', !p.cierre);
  if (p.cierre) { tween = null; mostrarLlamadas([]); }
  orbitar = !!p.orbita && !estadoRelato().libre;
  if (!estadoRelato().libre && p.cam?.[0] && !p.cierre) irCamara(p.cam[0][1]);
}

// Detalle de una lectura: la etiqueta con el recuadro del código y la ficha (OK / No Read).
function renderDetalle(k) {
  const el = $('detalle');
  if (!el) return;
  el.classList.toggle('oculto', !k);
  if (!k || !datos[k]) return;
  document.querySelectorAll('#d-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.c === k));
  const c = datos[k], ok = c.veredicto === 'OK', pct = (x) => Math.round(100 * x);
  const img = $('d-img'); if (img) img.src = `assets/caso_${k}_alineada.jpg`;
  const [x, y, w, h] = c.codigo.caja, pad = 1.2;
  const mk = $('d-marcas'); if (mk) mk.innerHTML = `<div class="err ${ok ? 'campo hecho bien' : ''}" style="left:${100 * (x - pad) / 150}%;top:${100 * (y - pad) / 110.49}%;width:${100 * (w + 2 * pad) / 150}%;height:${100 * (h + 2 * pad) / 110.49}%">${ok ? '' : '<i>!</i>'}</div>`;
  const m = $('d-motivo');
  if (m) { m.className = ok ? 'ok' : 'mal'; m.innerHTML = motivoHTML(c); }
  const dr = $('d-res');
  if (dr) dr.innerHTML = `<span>Resultado <b>${ok ? 'OK' : 'No Read'}</b></span><span>Certeza <b>${pct(c.confianza)} %</b></span><span>Lectura <b>${c.segundos.toFixed(2)} s</b></span>`;
  const filas = [
    ['Variable', 'Resultado de lectura (OK / No Read)', true],
    ['Código', ok ? `${c.codigo.leido} · ${c.codigo.simbologia}` : 'sin código válido', ok],
    ['Cámaras', ok ? 'una de las 3 lo decodificó' : 'las 3 terminaron bien, ninguna lo decodificó', ok],
    ['Etapa siguiente', ok ? 'E2 · registro en el ERP con el ID del ciclo' : 'E3 · desvío a revisión manual', ok],
    ['Revisión manual', ok ? 'no hace falta' : k === 'tapada' ? 'se despega el pliegue y se lee con el lector de mano' : 'se imprime una etiqueta nueva', ok],
    ['Evidencia', 'se guardan las 3 fotos con el ID del ciclo', true],
  ];
  const dl = $('d-campos');
  if (dl) dl.innerHTML = filas.map(([t, v, bien]) => `<li class="${bien ? 'OK' : 'FALTA'}"><span class="pt"></span><span class="tx"><span>${esc(t)}</span><small>${esc(v)}</small></span><span class="pc"></span></li>`).join('');
}
$('d-tabs')?.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) renderDetalle(b.dataset.c); });

// ------------------------------------------------------------------ cierre: recorrido en primera persona (a la altura de los ojos)
// [posición, hacia dónde mira]: camión → AMR → línea → isla → desviador → pallet → rack → desvío → toma general
const RECORRIDO = [
  [[-11.0, 1.7, -2.6], [-13.5, 1.2, 0.0]], [[-9.6, 1.7, -1.9], [-9.0, 0.9, 0.4]], [[-6.5, 1.65, -1.3], [-3.5, 1.0, 0.0]],
  [[-3.2, 1.65, -1.15], [-0.2, 1.1, 0.0]], [[-1.0, 1.6, -1.05], [-0.2, 1.0, 0.0]], [[0.6, 1.65, -1.2], [1.9, 0.9, 0.4]],
  [[1.6, 1.7, -2.0], [3.5, 0.9, 0.0]], [[3.8, 1.65, -1.2], [6.0, 0.6, 0.0]], [[7.4, 1.7, -1.6], [11.4, 1.6, -1.0]],
  [[9.3, 1.8, 0.6], [12.0, 1.5, 1.5]], [[8.0, 1.75, 2.3], [2.0, 0.6, 3.1]], [[2.5, 1.7, 2.1], [-1.5, 0.7, 3.3]],
  [[-1.6, 1.7, 1.7], [-0.2, 1.0, 0.0]], [[-3.5, 3.5, 5.5], [-0.5, 0.8, 0.0]], [[-2.5, 7.5, 11.5], [0.0, 0.5, 0.0]],
];
const CIERRE = {
  pos: new THREE.CatmullRomCurve3(RECORRIDO.map(([p]) => new THREE.Vector3(...p)), false, 'centripetal'),
  mira: new THREE.CatmullRomCurve3(RECORRIDO.map(([, m]) => new THREE.Vector3(...m)), false, 'centripetal'),
  dur: 58,
};
function pasoCierre(t) {
  const u = suave(Math.min(1, t / CIERRE.dur) * 0.98 + 0.01);
  camera.position.copy(CIERRE.pos.getPoint(u)); controls.target.copy(CIERRE.mira.getPoint(u));
  camera.position.y += Math.sin(t * 3.2) * 0.012 * (1 - u);                   // paso suave al caminar
}

// ------------------------------------------------------------------ cámara, resaltado, tour
function irCamara(n, dur = 2.0) {
  const c = CAMS[n]; if (!c || !camera) return;
  if (introVuelo) { introVuelo = false; dur = 5.5; }
  tween = { p0: camera.position.clone(), t0: controls.target.clone(), p1: new THREE.Vector3(...c.p), t1: new THREE.Vector3(...c.t), k: 0, dur };
}
controls?.addEventListener?.('start', () => { tween = null; orbitar = false; });
const idDe = (o) => { while (o) { if (o.userData && o.userData.id) return o.userData.id; o = o.parent; } return null; };
function cajaDe(id) {
  const b = new THREE.Box3();
  scene.traverse((o) => { if (o.isMesh && o.visible && idDe(o) === id && o.raycast !== undefined) b.expandByObject(o); });
  return b;
}
function resaltar(id) {
  if (HL.malla) { HL.malla.removeFromParent(); HL.malla = null; }
  HL.id = id;
  if (!id || !scene) return;
  const caja = cajaDe(id); if (caja.isEmpty()) return;
  caja.expandByScalar(0.06);
  HL.malla = new THREE.Box3Helper(caja, new THREE.Color(0xffc61a));
  HL.malla.material = new THREE.LineBasicMaterial({ color: 0xffc61a, transparent: true, opacity: 1, depthTest: false });
  HL.malla.renderOrder = 10; scene.add(HL.malla);
}
function tarjeta(id, quien = '') {
  const el = $('info'); if (!el) return;
  const i = CFG.info?.[id];
  if (!i) { el.classList.add('oculto'); return; }
  $('i-t').textContent = i.t ?? i[0]; $('i-p').textContent = i.d ?? i[1];
  $('i-x').hidden = quien === 'auto'; el.classList.toggle('auto', quien === 'auto'); el.classList.remove('oculto');
}
function volarA(id, dur = 1.6) {
  const caja = cajaDe(id); if (caja.isEmpty()) return;
  const c = caja.getCenter(new THREE.Vector3()), tam = caja.getSize(new THREE.Vector3()).length();
  const dir = new THREE.Vector3(0.45, 0.45, id === 'pantalla2' || id === 'operario' || id === 'tope' ? 0.9 : -0.9).normalize();
  const d = Math.max(1.6, tam * 1.9 + 1.0);
  tween = { p0: camera.position.clone(), t0: controls.target.clone(), p1: c.clone().addScaledVector(dir, d), t1: c, k: 0, dur };
}
function tourPaso(dt) {
  const { play, libre } = estadoRelato();
  if (!TOUR.ids || !play || libre) return;
  TOUR.t += dt;
  if (TOUR.t >= TOUR.dur) {
    TOUR.t = 0; TOUR.i = (TOUR.i + 1) % TOUR.ids.length; const id = TOUR.ids[TOUR.i];
    resaltar(id); tarjeta(id, 'auto'); volarA(id, 2.0);
    mostrarLlamadas([id]);
  }
}
function latirResaltado() { if (HL.malla) HL.malla.material.opacity = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(S.t * 5)); }

// ------------------------------------------------------------------ estado del proceso E0–E5 (derivado de la simulación real)
const FASES_DESVIO = ['empuje', 'desliza', 'cae', 'desvio', 'espera', 'revisa', 'salida', 'conector'];
function estadoProceso() {
  if (S.alarma) { S.paso = 'E5'; S.fase = 'falla · intervención'; return 'E5 · ' + (S.alarma.titulo || 'falla'); }
  const giro = S.cajas.find((b) => b.fase === 'giro');
  if (giro) {
    S.paso = 'E1'; S.fase = 'girando 360°';
    const sub = 'giro ' + Math.round(Math.min(1, giro.t / 3.2) * 360) + '° · C' + (giro.disparos.filter(Boolean).length + 1);
    return sub;
  }
  if (HUD.b && (HUD.fase === 'analisis' || HUD.fase === 'splash')) { S.paso = 'E2'; S.fase = 'analizando'; return 'lectura C1 · C2 · C3'; }
  if (S.cajas.some((b) => FASES_DESVIO.includes(b.fase))) { S.paso = 'E3'; S.fase = 'desviando'; return 'S_EXT → S_PASO → S_RET'; }
  if (S.cajas.some((b) => b.fase === 'palet')) { S.paso = 'E4'; S.fase = 'a pallet'; return 'evacuando OK'; }
  S.paso = 'E0'; S.fase = 'espera'; return '';
}

// ------------------------------------------------------------------ avanzar + bucle
function avanzar(dt) {
  if (!listo) return;
  let rest = dt;
  while (rest > 0) {
    const h = Math.min(rest, 0.02); rest -= h; S.t += h;
    tickDescarga(h);                                                   // camión + AMR: el PLC autoriza cada recogida (acumulación < 3)
    for (const b of S.cajas.slice()) {
      const prev = b.fase;
      if (b.holdE5) { b.g.position.set(b.x, b.y, b.z); continue; } // retenida por E5: contexto conservado
      moverCaja(b, h);
      if (prev !== 'cae' && b.fase === 'desvio' && ocurre('trabada')) {
        b.holdE5 = true;
        setAlarma('desvio', 'Bulto trabado en rodillos', 'Falta S_PASO: se destraba en planta y el ciclo se cierra documentado.');
        S.paso = 'E5'; S.fase = 'falla desvío';
      }
    }
    tickAlmacen(h);                                                    // pallet completo → autoelevador → rack
    if (S.pushRet) { S.pushK = Math.max(0, S.pushK - h / 0.7); if (S.pushK <= 0) S.pushRet = false; }
    if (S.avisoT > 0) S.avisoT -= h;
    S.flash = Math.max(0, S.flash - h * 5);
  }
  // salir de E5: el rearme libera retenidas (hmi ya puso S.alarma=null y el destino)
  if (E5previo && !S.alarma) {
    for (const b of S.cajas) { b.holdE5 = false; b.retenida = false; }
    log('PLC', 'Rearme: se libera el caja retenido y sigue el ciclo.', 'Rearme.');
  }
  E5previo = !!S.alarma;
  // espejo revisión pantallas.js → cajas.js (el tick/cruz vive en pantallas.REV)
  if (PREV.b && PREV.decision && CREV.b === PREV.b && !CREV.decision) { CREV.decision = PREV.decision; CREV.tD = PREV.tD; }
  hudActualizar(); monitoresStep(); revisionActualizar(); paneles();
  // sensores + giro para la isla
  S.S_ING = S.cajas.some((b) => (b.fase === 'cinta' || b.fase === 'giro') && Math.abs(b.x - X_TRIG) < LX / 2);
  S.girando = S.cajas.some((b) => b.fase === 'giro');
  S.S_ZONA = S.girando || !!S.isla;
  const sub = estadoProceso();
  animar(dt); animarIsla(S, G, dt); pasoZoom(dt); tickCielo(S.t);
  tourPaso(dt); latirResaltado();
  actualizarHMI();
  if (pasoActual?.grafcetTour && !estadoRelato().libre) pintarGrafcet(tourGrafcet(tRelato, dt), '');   // E0–E5 en pantalla completa, etapa por etapa
  else { salirTour(); pintarGrafcet(S.paso, sub); }
  if (pasoActual?.cierre && !estadoRelato().libre) {
    pasoCierre(tRelato);
    if (tRelato > CIERRE.dur) { const off = camera.position.clone().sub(controls.target), a = 0.03 * dt, c = Math.cos(a), s2 = Math.sin(a); camera.position.set(controls.target.x + off.x * c - off.z * s2, camera.position.y, controls.target.z + off.x * s2 + off.z * c); }
  } else if (tween) {
    tween.k = Math.min(1, tween.k + dt / tween.dur); const e = suave(tween.k);
    camera.position.lerpVectors(tween.p0, tween.p1, e);
    controls.target.lerpVectors(tween.t0, tween.t1, e);
    if (tween.k >= 1) tween = null;
  } else if (orbitar) {
    const off = camera.position.clone().sub(controls.target), a = 0.045 * dt, c = Math.cos(a), s = Math.sin(a);
    camera.position.set(controls.target.x + off.x * c - off.z * s, camera.position.y, controls.target.z + off.x * s + off.z * c);
  }
  const { play, libre } = estadoRelato();
  if (play && !libre && pasoActual) {
    tRelato += dt;
    for (const [t, n] of pasoActual.cam.slice(1)) if (relojCam < t && tRelato >= t) irCamara(n);
    relojCam = tRelato;
    const seg = document.querySelector('#puntos button.act i');
    if (seg) seg.style.width = Math.min(100, 100 * tRelato / pasoActual.dur) + '%';
    if (tRelato >= pasoActual.dur) {
      const i = PASOS.indexOf(pasoActual);
      if (i < PASOS.length - 1) irPaso(i + 1); else ponerPlay(false);
    }
  }
}
let tPrev = performance.now();
function bucle(now) {
  const dt = Math.min(0.1, (now - tPrev) / 1000) * (S.velMul || 1); tPrev = now;
  avanzar(dt); controls.update(); render();
  requestAnimationFrame(bucle);
}

// ------------------------------------------------------------------ animación propia (bandas, pusher, tope, operarios, pallet, contadores)
function unir(malla, a, b) {
  const d = b.clone().sub(a);
  malla.position.copy(a).addScaledVector(d, 0.5); malla.scale.set(1, d.length(), 1);
  malla.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
}
function animar(dt) {
  for (const [n, tex] of (G.bandas || [])) {
    if (n === 'Inspeccion' && !S.inspMueve) continue;
    tex.offset.x -= V * dt / 0.4;
  }
  if (G.descarga) G.descarga.tex.offset.x -= V * dt / 0.4;
  const en = (...f) => S.cajas.some((b) => f.includes(b.fase));
  if (G.desvio && en('desvio', 'salida', 'cae')) G.desvio.tex.offset.x += V * dt / 0.4;
  if (G.conector && en('conector')) G.conector.tex.offset.y += V * dt / 0.4;
  if (G.tope) G.tope.position.y = 0.5 + (en('salida', 'conector') || (S.opCaja && PREV.decision) ? -0.18 : 0.1);
  if (G.pusher) G.pusher.position.z = 0.75 * S.pushK;
  const rev = S.opCaja && S.opCaja.fase === 'revisa';
  if (rev) S.opT += dt; else S.opT = Math.max(0, S.opT - dt);
  if (G.op) {
    const k = Math.min(1, S.opT / 0.6);
    G.op.rotation.y = lerp(Math.PI / 2, 1.99, suave(k));
    if (G.opBrazos?.[1]) G.opBrazos[1].rotation.z = lerp(0, -1.25, suave(k));
    if (G.opBrazos?.[0]) G.opBrazos[0].rotation.z = lerp(0, 0.2, suave(k));
  }
  for (const q of [S.pal, S.viaje]) if (q) { q.g.position.set(q.x, q.y, q.z); q.film.visible = q.estado === 'completo' || q.estado === 'viaje'; }
  const tt = S.t, onda = 0.5 + 0.5 * Math.sin(tt * 1.6);
  ACENTOS.forEach((m, i) => { m.emissiveIntensity = 0.06 + 0.2 * (0.5 + 0.5 * Math.sin(tt * 1.6 + i * 0.7)); });
  LUCES_ROJAS.forEach((l) => { const k = l.userData.k; l.position.set(2 + 9 * Math.sin(tt * 0.28 + k * 3.1), 2.6, k ? -2.6 : 3.0); l.intensity = 4 + 3 * Math.sin(tt * 0.9 + k); });
  if (G.barrido) { G.barrido.position.x = ((tt * 1.6) % 30) - 8; G.barrido.material.opacity = 0.18 + 0.2 * onda; }
  const set = (id, v) => { const e = $(id); if (e) e.textContent = v; };
  set('c-total', S.total); set('c-ok', S.ok); set('c-mal', S.mal); set('c-pal', S.pallets);
  tBalizas += dt;
}

// ------------------------------------------------------------------ interacciones
const rayo = new THREE.Raycaster(), ptr = new THREE.Vector2();
function equipoEn(ev) {
  const r = renderer.domElement.getBoundingClientRect();
  ptr.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  rayo.setFromCamera(ptr, camera);
  for (const h of rayo.intersectObjects(scene.children, true)) {
    if (!h.object.visible) continue;
    const id = idDe(h.object); if (id && CFG.info?.[id]) return id;
    if (h.object.isMesh && h.object.material && !h.object.material.transparent) return null;
  }
  return null;
}
function cablear() {
  new ResizeObserver(resize).observe(cont);
  addEventListener('resize', resize); resize();
  renderer.domElement.addEventListener('pointerdown', (e) => { HL.abajo = { x: e.clientX, y: e.clientY, t: performance.now() }; });
  renderer.domElement.addEventListener('pointerup', (e) => {
    const a = HL.abajo; HL.abajo = null;
    if (!a || Math.hypot(e.clientX - a.x, e.clientY - a.y) > 5 || performance.now() - a.t > 500) return;
    const id = equipoEn(e); if (!id) return;
    TOUR.ids = null;
    const { play } = estadoRelato(); ponerPlay(false); HL.reanudar = play;
    resaltar(id); tarjeta(id); volarA(id);
  });
  renderer.domElement.addEventListener('pointermove', (e) => {
    if (e.buttons) return;
    renderer.domElement.style.cursor = equipoEn(e) ? 'pointer' : '';
  });
  $('i-x')?.addEventListener('click', () => {
    $('info')?.classList.add('oculto'); resaltar(null);
    if (HL.reanudar) ponerPlay(true); HL.reanudar = false;
  });
  document.querySelectorAll('#visor-inf [data-cam]').forEach((b) => b.addEventListener('click', () => {
    orbitar = false; irCamara(b.dataset.cam);
    document.querySelectorAll('#visor-inf [data-cam]').forEach((x) => x.classList.toggle('on', x === b));
  }));
  document.querySelectorAll('#visor-inf [data-vel]').forEach((b) => b.addEventListener('click', () => {
    S.velMul = parseFloat(b.dataset.vel) || 1;
    document.querySelectorAll('#visor-inf [data-vel]').forEach((x) => x.classList.toggle('on', x === b));
  }));
  $('btnHerr')?.addEventListener('click', () => {
    const p = $('visor-inf'), abierto = p.classList.toggle('oculto') === false;
    $('btnHerr').setAttribute('aria-expanded', String(abierto));
  });
  const panelVisible = (id) => !$(id)?.classList.contains('oculto');
  const marcarPaneles = () => document.querySelectorAll('#visor-inf [data-panel]').forEach((b) => b.classList.toggle('on', panelVisible(b.dataset.panel)));
  document.querySelectorAll('#visor-inf [data-panel]').forEach((b) => b.addEventListener('click', () => { $(b.dataset.panel)?.classList.toggle('oculto'); marcarPaneles(); }));
  document.querySelectorAll('[data-cerrar]').forEach((b) => b.addEventListener('click', () => { $(b.dataset.cerrar)?.classList.add('oculto'); marcarPaneles(); }));
  $('btnCasos')?.addEventListener('click', () => $('panelCasos')?.classList.toggle('oculto'));
  $('btnCasosCerrar')?.addEventListener('click', () => $('panelCasos')?.classList.add('oculto'));
  $('btnDemo')?.addEventListener('click', () => { $('demo')?.classList.add('oculto'); irPaso(0); ponerPlay(true); });
  $('btnDemoSalir')?.addEventListener('click', () => $('demo')?.classList.add('oculto'));
  const chk = $('chkEtiquetas');
  if (chk) chk.addEventListener('change', () => { S.chips = chk.checked; });
}

// ------------------------------------------------------------------ gancho para pruebas
window.__pres = {
  G, S, THREE, escena: () => scene, camara: () => camera,
  distancia: () => camera.position.distanceTo(controls.target),
  ver: (n) => { tween = null; orbitar = false; const c = CAMS[n]; camera.position.set(...c.p); controls.target.set(...c.t); controls.update(); },
  avanzar: (seg) => { for (let t = 0; t < seg; t += 0.05) avanzar(0.05); controls.update(); },
  hastaFoto: (off) => {
    for (let i = 0; i < 600; i++) {
      avanzar(0.05);
      if (S.cajas.some((c) => c.foto !== null && S.t - c.foto >= off && S.t - c.foto < off + 0.1)) break;
    }
    controls.update();
  },
  hastaRev: (fase, extra = 0) => {
    for (let i = 0; i < 4000 && PREV.fase !== fase; i++) avanzar(0.05);
    for (let t = 0; t < extra; t += 0.05) avanzar(0.05);
    controls.update();
  },
  irPaso: (i) => irPaso(i),
  estado: () => ({
    relato: estadoRelato().paso, e: S.paso, fase: S.fase, t: S.t,
    pallet: S.pal?.estado ?? null, pallets: S.pallets,
    total: S.total, ok: S.ok, mal: S.mal,
    cajas: S.cajas.map((b) => [b.tipo, b.fase, +b.x.toFixed(2), +b.z.toFixed(2)]),
  }),
};
