// js/cajas.js — bultos, etiquetas y flujo IMPORTACIÓN (camión → isla 360° → expedición).
//
// Adaptado de presentacion_3d/js/main.js (líneas 399-590: crearCaja, quitarCaja,
// chip, spawn, reasignar, adelantarCaja, moverCaja, palletStep, slotCamion,
// cargarCamion, vaciarCamion) con la dirección logística invertida: en EXPORTACIÓN
// los bultos nacían en Encajado e iban al camión; acá SE BAJAN DEL CAMIÓN (fase
// 'camion'), corren hacia la isla, giran 360° en el plato (fase 'giro', 3 cámaras)
// y terminan en el pallet de EXPEDICIÓN.
//
// Desacoplado: no importa escena.js (evita ciclos). El estado compartido S y la
// escena se inyectan con initCajas(S, opts); los avisos a HUD/pantallas salen por
// callbacks (onFoto, onVeredicto, ...) para no acoplar módulos. Cada función acepta
// además un S opcional como último parámetro por si main.js lo pasa a mano.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

const lerp = (a, b, t) => a + (b - a) * t;
const suave = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };

// ------------------------------------------------------------------ medidas (mismas bultos que exportación; el flujo corre en +X igual,
// lo invertido es la logística: el camión DESCARGA al inicio y expedición recibe al final)
export const LX = 0.5, H = 0.18, LZ = 0.34;   // bulto: largo sobre la cinta, alto, ancho
export const V = 0.55;                        // velocidad ilustrativa; en planta ~0,3 m/s
export const BELT = 0.8, BELT_D = 0.5;        // altura cinta principal y cinta de desvío (más baja)
export const X_CAMION = -8.6;                 // boca del camión: de acá BAJAN los bultos
export const X_SPAWN = -7.4;                  // punto donde el bulto ya está sobre la cinta
export const T_BAJADA = 1.4;                  // segundos que tarda en bajar del camión a la cinta
export const X_TRIG = -1.05, X_ISLA = -0.2;   // fotocélula (boca de la isla) y centro del plato (igual que escena.js)
export const X_PUSH = 1.9;                    // desviador de NO OK (igual que escena.js: después de la isla)
export const X_TOPE = X_PUSH - 3.4, X_REIN = X_PUSH - 4.15;   // tope de la fila de desvío y subida que devuelve a la línea ANTES de la isla
export const PAL_X = 6.0, X_PAL_ENTRA = 4.98; // pallet de EXPEDICIÓN y punto donde la cinta lo alimenta
export const X_EXP = 8.1;                     // expedición (destino del pallet completo)
export const OP_PAL_X = 5.05;
export const CAJAS_PALLET = 12;
export const T_GIRO = 3.2;                    // el plato gira 360° en 3,2 s; C1/C2/C3 disparan a 0°/120°/240°
export const PATRON = ['ok', 'ok', 'rayada', 'ok', 'ok', 'tapada', 'ok', 'ok'];

// Fases que recorre un bulto (para el GRAFCET/HMI de main.js).
export const FASES = ['enCamion', 'amr', 'camion', 'cinta', 'giro', 'empuje', 'desliza', 'cae', 'desvio', 'espera', 'revisa', 'salida', 'conector', 'palet', 'apilada'];

// ------------------------------------------------------------------ estado inyectado + callbacks
let S = null;                 // estado compartido (lo crea main.js / escena.js)
let scene = null;             // THREE.Scene donde viven bultos y pallets
const CB = {                  // hudIniciar/monitorControl/revisión llegan por acá, no por import
  onFoto: null,               // (b, iCamara 0..2) — cada disparo C1/C2/C3 con su flash
  onIsla: null,               // (b) — el bulto entró al plato
  onVeredicto: null,          // (b) — veredicto fusionado AND de las 3 caras
  onRetencion: null,          // (b) — E5/falla: queda retenido en la isla
  onRevisionAbrir: null,      // (b) — operario empieza a revisar (si falta, usa REV interno)
  onRevisionCerrar: null,     // (b, decision) — operario decidió
  onCamionVacio: null,        // () — se acabó el stock del camión, llega otro
  onPalletListo: null,        // (p) — pallet de expedición completo
};
let CFG = { camionBaseX: 14.6 };   // base en X de los slots del camión (override si escena.js lo pone en otro lado)

// Revisión manual (fallback interno si main.js no inyecta onRevisionAbrir).
export const REV = { b: null, c: null, t0: 0, fase: '', decision: null, tD: 0 };
export function revisionAbrir(b) { REV.b = b; REV.c = b ? b.hudCaso || null : null; REV.t0 = S ? S.t : 0; REV.fase = 'abierta'; REV.decision = null; }
export function revisionCerrar() { const b = REV.b; REV.b = null; REV.fase = ''; return b; }

export function initCajas(estado, opts = {}) {
  S = estado;
  if (opts.scene) scene = opts.scene;
  if (opts.cfg) CFG = { ...CFG, ...opts.cfg };
  setCallbacks(opts.callbacks || opts);
  return { fases: FASES, callbacks: CB };
}
export function setCallbacks(cb = {}) { for (const k of Object.keys(CB)) if (cb[k] !== undefined) CB[k] = cb[k]; return CB; }
export function getCallbacks() { return CB; }
const st = (s) => s || S;

// ------------------------------------------------------------------ bultos y etiquetas
export const TEX = {};
export function crearTexturasEtiqueta() {
  const loader = new THREE.TextureLoader();
  for (const k of ['ok', 'tapada', 'rayada']) {
    const t = loader.load(`assets/etq_${k}.jpg`); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    TEX[k] = new THREE.MeshStandardMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.28, roughness: 0.55 });
  }
  return TEX;
}
const GEO_CAJA = new THREE.BoxGeometry(LX, H, LZ);
const CINTA_GEO = new THREE.BoxGeometry(0.07, H + 0.002, LZ + 0.002);
const MAT_CARTON = new THREE.MeshStandardMaterial({ color: 0xa9794a, roughness: 0.88 });   // cartón marrón, cinta amarilla
const MAT_CINTA = new THREE.MeshStandardMaterial({ color: 0xffc61a, roughness: 0.55 });
const GEO_ETQ = new THREE.PlaneGeometry(0.17, 0.125);

// tipo: 'ok' | 'tapada' | 'rayada'. extras: { desdeCamion?: bool, x?, y?, z? }.
// Si el 2.º argumento no parece S (no trae .cajas), se trata como extras.
export function crearCaja(tipo = 'ok', Sarg = null, extras = {}) {
  let ss = st(Sarg);
  if (ss && !Array.isArray(ss.cajas)) { extras = ss; ss = S; }
  const ex = extras || {};
  const g = new THREE.Group();
  const cuerpo = new THREE.Mesh(GEO_CAJA, MAT_CARTON); cuerpo.castShadow = cuerpo.receiveShadow = true; g.add(cuerpo);
  const cinta = new THREE.Mesh(CINTA_GEO, MAT_CINTA); cinta.position.x = 0.08; g.add(cinta);
  const mat = TEX[tipo] || MAT_CARTON;
  const etq = new THREE.Mesh(GEO_ETQ, mat);   // lateral: la lee la cámara lateral
  etq.position.set(-0.04, 0, -LZ / 2 - 0.0012); etq.rotation.y = Math.PI; g.add(etq);
  const etqSup = new THREE.Mesh(GEO_ETQ, mat); // superior: la lee la cámara de arriba
  etqSup.position.set(-0.04, H / 2 + 0.0012, 0); etqSup.rotation.x = -Math.PI / 2; g.add(etqSup);
  const etqInf = new THREE.Mesh(GEO_ETQ, mat); // inferior: la lee la cámara de abajo, a través del vidrio del plato
  etqInf.position.set(-0.04, -H / 2 - 0.0012, 0); etqInf.rotation.x = Math.PI / 2; g.add(etqInf);
  // los bultos importados llegan como vienen: la etiqueta puede estar arriba, abajo o en un costado
  const cara = ex.cara ?? (() => { const u = Math.random(); return u < 0.45 ? 0 : u < 0.75 ? 2 : 1; })();
  [etqSup, etqInf, etq].forEach((m, i) => { m.visible = i === cara; });
  const el = document.createElement('div'); el.className = 'chip'; el.textContent = '';
  const chipObj = new CSS2DObject(el); chipObj.position.set(0, H / 2 + 0.2, 0); chipObj.visible = false; g.add(chipObj);
  if (!scene) throw new Error('cajas.js: llamá initCajas(S, { scene }) antes de crearCaja');
  scene.add(g);
  const desdeCamion = ex.desdeCamion !== undefined ? ex.desdeCamion : true;  // en importación casi todo baja del camión
  const b = {
    g, tipo, malo: tipo !== 'ok',
    fase: desdeCamion ? 'camion' : 'cinta',
    x: ex.x !== undefined ? ex.x : (desdeCamion ? X_CAMION : X_SPAWN),
    y: ex.y !== undefined ? ex.y : (desdeCamion ? 1.15 : BELT + H / 2),
    z: ex.z !== undefined ? ex.z : (desdeCamion ? 0.62 : 0),
    x0: X_CAMION, y0: 1.15, z0: 0.62,
    ry: 0, rx: 0, t: 0, vz: 0, chip: chipObj, chipEl: el, chipOculto: false,
    etq, etqSup, etqInf, trig: false, trigT: 0,
    cara, pasoIsla: false, disparos: [false, false, false], fotos: [null, null, null],
    foto: null, veredicto: null, retenida: false, slot: -1, retorno: false, vistoMal: false, decision: null,
  };
  ss.cajas.push(b); return b;
}
export function quitarCaja(b, Sarg = null) {
  const ss = st(Sarg); if (!ss) return;
  if (ss.opCaja === b) ss.opCaja = null;
  if (ss.hudCaja === b) ss.hudCaja = null;
  if (ss.isla === b) ss.isla = null;
  b.g.removeFromParent(); ss.cajas = ss.cajas.filter((c) => c !== b);
}
export function chip(b, txt, clase) { b.chipEl.textContent = txt; b.chipEl.className = 'chip ' + (clase || ''); b.chipOculto = !txt; }
export const topeCarril = (z) => (z < 0.5 ? BELT : BELT - 0.11 * (z - 0.5));

export function cambiarTipo(b, t) {                                   // un escenario cambia la etiqueta de un bulto que todavía no se leyó
  b.tipo = t; b.malo = t !== 'ok';
  if (TEX[t]) { b.etq.material = TEX[t]; b.etqSup.material = TEX[t]; b.etqInf.material = TEX[t]; }
}
export const proximoTipo = (Sarg = null) => { const ss = st(Sarg); return ss.cola.length ? ss.cola.shift() : PATRON[ss.patron++ % PATRON.length]; };
export function spawn(Sarg = null) {
  const ss = st(Sarg);
  if (ss.stockCamion !== undefined) {                       // el camión trae stock contado: se va vaciando
    if (ss.stockCamion <= 0) { if (CB.onCamionVacio) CB.onCamionVacio(); vaciarCamion(ss); }
    ss.stockCamion = Math.max(0, (ss.stockCamion || 0) - 1);
  }
  const tipo = ss.cola.length ? ss.cola.shift() : PATRON[ss.patron++ % PATRON.length];
  return crearCaja(tipo, ss, { desdeCamion: true });
}

// con un paso que pide un resultado, los bultos que todavía no llegaron a la isla toman ese resultado, así sale primero
export function reasignar(tipos, Sarg = null) {
  const ss = st(Sarg);
  const libres = ss.cajas.filter((b) => ['cinta', 'camion', 'amr', 'enCamion'].includes(b.fase) && b.foto === null && !b.retorno && b.x < X_ISLA - 0.9)
    .sort((p, q) => (p.fase === 'enCamion') - (q.fase === 'enCamion') || q.x - p.x || (p.orden ?? 0) - (q.orden ?? 0));
  tipos.forEach((t, i) => {
    const b = libres[i]; if (!b) return;
    b.tipo = t; b.malo = t !== 'ok';
    if (TEX[t]) { b.etq.material = TEX[t]; b.etqSup.material = TEX[t]; b.etqInf.material = TEX[t]; }
  });
  ss.cola = tipos.slice(libres.length);
}
// al entrar a un paso con la pantalla, que la próxima bulto llegue enseguida a la isla
export function adelantarCaja(Sarg = null) {
  const ss = st(Sarg);
  if (ss.cajas.some((b) => (b.fase === 'cinta' && b.foto === null && b.x > X_ISLA - 3.2 && b.x < X_ISLA - 0.3) || b.fase === 'giro')) return null;
  const b = crearCaja(ss.cola.length ? ss.cola.shift() : PATRON[ss.patron++ % PATRON.length], ss, { desdeCamion: false });
  b.x = X_ISLA - 2.1; ss.proxSpawn = 4.0; return b;                  // aparece ya cerca de la isla: el paso no espera 10 s
}
// un bulto ya revisado vuelve a la línea (por el costado) solo si no viene otra pasando por ahí
export const ocupadoMerge = (b, Sarg = null) => st(Sarg).cajas.some((o) => o !== b && o.fase === 'cinta' && o.x > X_REIN - 1.0 && o.x < X_REIN + 1.0);
export const palLista = (Sarg = null) => { const ss = st(Sarg); return ss.pal && ss.pal.estado === 'lista' && ss.pal.n < CAJAS_PALLET; };
// si hay otro bulto en la fila de espera más adelante, esta frena detrás
export function limiteFila(b, Sarg = null) {
  const ss = st(Sarg);
  const o = ss.cajas.filter((c) => c !== b && (c.fase === 'desvio' || c.fase === 'espera' || c.fase === 'revisa' || c.fase === 'salida') && c.x < b.x).sort((p, q) => q.x - p.x)[0];
  return Math.max(X_TOPE, o ? o.x + (LX + 0.12) : X_TOPE);
}

export function moverCaja(b, dt, Sarg = null) {
  const ss = st(Sarg);
  switch (b.fase) {
    case 'camion': {                                                  // BAJA DEL CAMIÓN a la cinta
      b.t += dt; const k = Math.min(1, b.t / T_BAJADA);
      b.x = lerp(b.x0, X_SPAWN, suave(k));
      b.y = lerp(b.y0, BELT + H / 2, k * k);
      b.z = lerp(b.z0, 0, suave(k));
      if (k >= 1) { b.fase = 'cinta'; b.x = X_SPAWN; b.y = BELT + H / 2; b.z = 0; b.t = 0; }
      break;
    }
    case 'cinta': {
      const delante = ss.cajas.filter((o) => o !== b && (o.fase === 'cinta' || o.fase === 'empuje' || o.fase === 'giro') && o.x > b.x).sort((p, q) => p.x - q.x)[0];
      let tope = delante ? delante.x - (LX + 0.14) : Infinity;
      if (!b.pasoIsla) {                                              // tramo camión → isla: el plato es de a un bulto
        const islaOcupada = ss.cajas.some((o) => o !== b && o.fase === 'giro');
        tope = Math.min(tope, islaOcupada ? X_ISLA - (LX + 0.14) : X_ISLA);
      }
      if (!palLista(ss)) tope = Math.min(tope, X_PAL_ENTRA - 0.05);    // expedición sin pallet listo: el bulto espera al final de la cinta
      if (b.x < tope) b.x = Math.min(tope, b.x + V * dt);
      // fotocélula: se corta cuando el frente del bulto pasa por el haz
      if (!b.trig && b.x + LX / 2 >= X_TRIG) { b.trig = true; b.trigT = ss.t; }
      // llega a la isla: sube al plato y empieza el giro 360°
      if (!b.pasoIsla && b.x >= X_ISLA - 1e-6) {
        b.x = X_ISLA; b.fase = 'giro'; b.t = 0;
        b.disparos = [false, false, false]; b.fotos = [null, null, null];
        ss.isla = b; ss.flash = 1;
        chip(b, 'En isla…', '');
        if (CB.onIsla) CB.onIsla(b);
        break;
      }
      if (b.veredicto === 'NO_OK' && !b.retorno && b.x >= X_PUSH && ss.inspMueve) { b.x = X_PUSH; b.fase = 'empuje'; b.t = 0; ss.inspMueve = false; }
      if (!ss.control && b.malo && b.x > 2.2 && !b.vistoMal) { b.vistoMal = true; chip(b, 'Etiqueta dañada', 'SIN'); }
      if (b.veredicto === 'OK' && b.x > 2.4) b.chipOculto = true;
      if (b.x >= X_PAL_ENTRA && palLista(ss)) {                        // llega al final: pasa al pallet de EXPEDICIÓN
        const p = ss.pal; b.pal = p; b.slot = p.n++; p.cajas.push(b); b.fase = 'palet'; b.t = 0; b.x0 = b.x; b.y0 = b.y;
        const capa = Math.floor(b.slot / 4), i = b.slot % 4;
        b.ox = (i % 2 ? 0.275 : -0.275) * (capa % 2 ? -1 : 1); b.oz = Math.floor(i / 2) ? 0.19 : -0.19; b.oy = 0.15 + H / 2 + capa * H;
        if (b.malo && !b.retorno) { p.malas++; if (!ss.control) ss.avisoT = 7; }
        if (b.veredicto === 'OK' || b.retorno) b.chipOculto = true;
      }
      break;
    }
    case 'giro': {                                                    // 3,2 s sobre el plato: rota 360° y C1/C2/C3 disparan a 0°/120°/240°
      if (ss.paso === 'E5' || b.retenida) {                           // E5/falla: queda retenido, no avanza hasta el rearme
        if (!b.retenida) { b.retenida = true; chip(b, 'Retenida · E5', 'NO_OK'); if (CB.onRetencion) CB.onRetencion(b); }
        break;                                                        // main.js la libera con b.retenida = false
      }
      b.t += dt; const k = Math.min(1, b.t / T_GIRO);
      b.ry = k * Math.PI * 2;
      for (let i = 0; i < 3; i++) {
        if (!b.disparos[i] && k >= i / 3) {
          b.disparos[i] = true; b.fotos[i] = ss.t; b.foto = b.foto ?? ss.t; ss.flash = 1;
          chip(b, i === b.cara ? `C${i + 1} · etiqueta encontrada` : `C${i + 1} · sin etiqueta en esta cara`, i === b.cara ? 'REV' : '');
          if (CB.onFoto) CB.onFoto(b, i);                             // equivale a hudIniciar + monitorControl('leyendo')
        }
      }
      if (k >= 1) {                                                   // veredicto fusionado AND de las 3 caras
        b.veredicto = (!b.malo && b.disparos.every(Boolean)) ? 'OK' : 'NO_OK';
        ss.total++; if (!b.malo) ss.ok++;
        chip(b, b.malo ? 'No Read' : 'OK', b.malo ? 'NO_OK' : 'OK');
        if (CB.onVeredicto) CB.onVeredicto(b);                        // equivale a monitorControl('splash') + hudVeredicto
        if (ss.isla === b) ss.isla = null;
        b.pasoIsla = true; b.fase = 'cinta';
      }
      break;
    }
    case 'empuje': {
      b.t += dt; ss.pushK = Math.min(1, b.t / 0.7);
      b.z = Math.max(0, -0.32 + 0.75 * ss.pushK);
      if (b.t >= 0.75) { b.fase = 'desliza'; b.vz = 0.3; ss.pushRet = true; }
      break;
    }
    case 'desliza': {                                                 // baja por los rodillos
      b.vz = Math.min(1.1, b.vz + 1.1 * dt); b.z += b.vz * dt;
      if (b.z >= 0.75) ss.inspMueve = true;
      b.y = topeCarril(b.z) + H / 2; b.rx = b.z > 0.5 ? 0.11 : 0;
      if (b.z >= 2.5) { b.fase = 'cae'; b.t = 0; b.z0 = b.z; b.y0 = b.y; b.x0 = b.x; }
      break;
    }
    case 'cae': {                                                     // pasa a la cinta de desvío (más baja), con la etiqueta hacia el operario
      b.t += dt; const k = Math.min(1, b.t / 0.45);
      b.z = lerp(b.z0, 3.1, suave(k)); b.y = lerp(b.y0, BELT_D + H / 2, k * k); b.rx = lerp(0.11, 0, k); b.ry = Math.PI * suave(k);
      if (k >= 1) { b.fase = 'desvio'; chip(b, 'No Read', 'NO_OK'); ss.mal++; }
      break;
    }
    case 'desvio': {                                                  // la cinta lleva el bulto hacia la isla hasta frenar detrás de la anterior
      const lim = limiteFila(b, ss);
      b.x = Math.max(lim, b.x - V * dt);
      if (b.x <= lim + 1e-6) { b.fase = 'espera'; b.t = 0; }
      break;
    }
    case 'espera': {                                                  // frenada: la primera de la fila la revisa el operario
      b.t += dt;
      const lim = limiteFila(b, ss);
      if (lim < b.x - 0.01) { b.fase = 'desvio'; break; }
      if (b.x <= X_TOPE + 0.01 && !ss.opCaja && !REV.b && b.t > 1.4 && ss.operarioRev !== false) {
        ss.opCaja = b; ss.opT = 0; b.fase = 'revisa'; b.t = 0; chip(b, 'Revisando', 'REV');
        if (CB.onRevisionAbrir) CB.onRevisionAbrir(b); else revisionAbrir(b);
      }
      break;
    }
    case 'revisa': {                                                  // el operario mira la pantalla y toca el tick o la cruz
      b.t += dt;
      const revB = REV.b === b ? REV.b : (ss.opCaja === b ? b : null);
      const dec = b.decision || (revB === b && REV.decision ? REV.decision : null);
      const tD = b.decision ? b.t : (REV.b === b ? REV.tD : -1);
      if (revB === b && dec && ss.t - tD > 1.2) {
        b.decision = dec; revisionCerrar(); if (CB.onRevisionCerrar) CB.onRevisionCerrar(b, dec);
        ss.opCaja = null; b.retorno = true; b.fase = 'salida';
        chip(b, dec === 'bien' ? 'Etiqueta corregida' : 'Se vuelve a leer', dec === 'bien' ? 'OK' : 'REV');
      }
      break;
    }
    case 'salida': {                                                  // sale por el final de la cinta de desvío, hacia la subida
      b.x = Math.max(X_REIN, b.x - V * dt);
      if (b.x <= X_REIN + 1e-6) b.fase = 'conector';
      break;
    }
    case 'conector': {                                                // sube y vuelve a la línea ANTES de la isla: se lee de nuevo (3 cámaras)
      if (b.z <= 0.62 && b.z > 0.3 && ocupadoMerge(b, ss)) break;
      b.z -= V * dt;
      const u = suave((3.1 - b.z) / 2.7), enRampa = b.z < 2.7 && b.z > 0.5;
      b.y = BELT_D + (BELT - BELT_D) * u + H / 2; b.rx = enRampa ? Math.atan2(BELT - BELT_D, 2.35) : 0; b.ry = Math.PI * (1 - u);
      if (b.z <= 0.05) {                                              // vuelve a la línea ya registrado a mano: pasa la isla sin detenerse y sigue a expedición
        b.z = 0; b.y = BELT + H / 2; b.rx = 0; b.ry = 0; b.fase = 'cinta';
        b.malo = false; b.pasoIsla = true; b.veredicto = 'OK'; b.manual = true;
        chip(b, 'Registrado a mano', 'OK');
      }
      break;
    }
    case 'palet': {                                                   // pasa del final de la cinta al pallet de expedición
      b.t += dt; const k = Math.min(1, b.t / 0.75), p = b.pal;
      b.x = lerp(b.x0, p.x + b.ox, suave(k)); b.z = lerp(0, p.z + b.oz, suave(k)); b.y = lerp(b.y0, p.y + b.oy, k * k);
      if (k >= 1) {
        b.fase = 'apilada'; p.listas++;
        if (p.listas >= CAJAS_PALLET) { p.estado = 'completo'; p.t = 0; if (CB.onPalletListo) CB.onPalletListo(p); }
      }
      break;
    }
    case 'apilada': {                                                // sigue al pallet (el autoelevador lo puede girar)
      const p = b.pal, c = Math.cos(p.ry || 0), s2 = Math.sin(p.ry || 0);
      b.x = p.x + b.ox * c + b.oz * s2; b.z = p.z - b.ox * s2 + b.oz * c; b.y = p.y + b.oy; b.ry = p.ry || 0; break;
    }
  }
  const sin = b.chipEl.classList.contains('SIN');
  b.chip.visible = !b.chipOculto && !!b.chipEl.textContent && (sin ? !ss.control : (ss.control && ss.chips));
  b.g.position.set(b.x, b.y, b.z); b.g.rotation.set(b.rx, b.ry, 0);
}

// ------------------------------------------------------------------ pallets, camión (al INICIO, trae 6) y expedición (al final)
const matFilm = new THREE.MeshStandardMaterial({ color: 0xf1f3f5, transparent: true, opacity: 0.22, roughness: 0.2, depthWrite: false });
const matPallet = new THREE.MeshStandardMaterial({ color: 0xb9bec4, roughness: 0.8 });
export function crearPallet(x, y, z) {
  if (!scene) throw new Error('cajas.js: llamá initCajas(S, { scene }) antes de crearPallet');
  const g = new THREE.Group(); g.userData.id = 'pallet'; g.position.set(x, y, z); scene.add(g);
  const tabla = (w, h, d, px, py, pz) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), matPallet); m.position.set(px, py, pz); m.castShadow = m.receiveShadow = true; g.add(m); };
  for (const pz of [-0.45, 0, 0.45]) tabla(1.2, 0.09, 0.09, 0, 0.045, pz);
  for (let i = 0; i < 7; i++) tabla(0.12, 0.025, 1.0, -0.54 + i * 0.18, 0.1375, 0);
  const film = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.62, 0.92), matFilm); film.position.set(0, 0.46, 0); film.visible = false; g.add(film);
  return { estado: 'lista', x, y, z, n: 0, listas: 0, cajas: [], malas: 0, t: 0, g, film, slot: -1 };
}
export function palletEstatico(x, z) {                                // un pallet completo que ya viene cargado en el camión
  const p = crearPallet(x, -0.05, z); p.film.visible = true; p.estado = 'cargado';
  for (let i = 0; i < CAJAS_PALLET; i++) {
    const capa = Math.floor(i / 4), j = i % 4, m = new THREE.Mesh(GEO_CAJA, MAT_CARTON);
    m.position.set((j % 2 ? 0.275 : -0.275) * (capa % 2 ? -1 : 1), 0.15 + H / 2 + capa * H, Math.floor(j / 2) ? 0.19 : -0.19); m.castShadow = true; p.g.add(m);
    const t = new THREE.Mesh(CINTA_GEO, MAT_CINTA); t.position.x = 0.08; m.add(t);
  }
  return p;
}
// el camión trae 10 lugares (5 filas de 2 pallets): 6 vienen cargados y se van vaciando con cada bajada; cuando se acaban llega otro camión
export const slotCamion = (k) => [CFG.camionBaseX - 1.2 * Math.floor(k / 2), k % 2 ? 0.62 : -0.62];
export function cargarCamion(Sarg = null) {
  const ss = st(Sarg);
  ss.estaticos = ss.estaticos || []; ss.cargados = ss.cargados || [];
  for (let k = 0; k < 6; k++) { const [x, z] = slotCamion(k); ss.estaticos.push(palletEstatico(x, z)); }
  ss.slotCamion = 6; ss.stockCamion = 6 * CAJAS_PALLET;
}
export function vaciarCamion(Sarg = null) {                           // el camión vacío se va y llega otro lleno
  const ss = st(Sarg);
  for (const p of (ss.cargados || [])) { (p.cajas || []).forEach((b) => quitarCaja(b, ss)); p.g.removeFromParent(); }
  ss.cargados = []; (ss.estaticos || []).forEach((p) => p.g.removeFromParent()); ss.estaticos = []; cargarCamion(ss);
}
// el pallet completo se envuelve y va a EXPEDICIÓN (al final de la línea); se arma otro en su lugar
export function palletStep(h, Sarg = null) {
  const ss = st(Sarg);
  const p = ss.pal; if (!p) return;
  if (p.estado === 'completo') { p.t += h; p.film.visible = true; if (p.t > 1.5) { p.estado = 'viaje'; p.t = 0; ss.viaje = p; p.slot = 0; } }
  const v = ss.viaje;
  if (v && v.estado === 'viaje') {
    if (v.x < X_EXP - 1e-3) v.x = Math.min(X_EXP, v.x + 1.3 * h); else v.z += Math.sign(0 - v.z) * Math.min(Math.abs(0 - v.z), 0.8 * h);
    if (ss.pal === v && v.x > PAL_X + 1.8) ss.pal = crearPallet(PAL_X, 0, 0);   // se arma otro mientras el primero va a expedición
    if (v.x >= X_EXP - 1e-3 && Math.abs(0 - v.z) < 1e-3) {
      v.estado = 'cargado'; ss.pallets++; ss.cargados.push(v); v.cajas.forEach((b) => { b.g.remove(b.chip); }); ss.viaje = null;
    }
  }
  const o = ss.opPal, mov = p.estado === 'completo' ? p : (v && v.estado === 'viaje' ? v : null);
  if (o) {
    if (mov && mov.estado === 'viaje') { o.x = mov.x - 0.9; o.z = mov.z + 0.8; o.yaw = 0; o.marcha = true; }
    else {
      const dx = OP_PAL_X - o.x, dz = 0.85 - o.z;
      if (Math.abs(dx) > 0.02 || Math.abs(dz) > 0.02) { o.x += Math.sign(dx) * Math.min(Math.abs(dx), 1.5 * h); o.z += Math.sign(dz) * Math.min(Math.abs(dz), 1.5 * h); o.yaw = dx < 0 ? Math.PI : 0; o.marcha = true; } else o.marcha = false;
    }
  }
}
