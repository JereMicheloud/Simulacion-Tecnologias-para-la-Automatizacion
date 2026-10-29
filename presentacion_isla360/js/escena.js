// Escena base de la presentación (flujo IMPORTACIÓN). Sin lógica de bultos:
// renderer, cielo, luces, modelo estacion.glb, bandas, desvío, isla (placeholder),
// pallet de expedición, camión al INICIO, paleta blanco/gris/celeste con detalles
// amarillos (TracePack) y rótulos 3D.
//
// Lo usa el resto de módulos (cajas.js, animacion.js, hud.js, main.js):
//   import { initEscena, scene, camera, G, S, ... } from './escena.js';
//   await initEscena('escena');          // contenedor o id
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// ------------------------------------------------------------------ medidas (metros; x a lo largo de la cinta, z hacia revisión)
export const BELT = 0.8, LX = 0.5, H = 0.18, LZ = 0.34;   // bulto: largo sobre cinta, alto, ancho
export const V = 0.55;                                     // velocidad ilustrativa; en planta ~0,3 m/s
export const BELT_D = 0.5;                                 // cinta de desvío, más baja: recibe lo que baja por rodillos

// Flujo IMPORTACIÓN (de -X a +X):
// camión (MUELLE_IMP) → descarga/acumulación (X_SPAWN) → alimentador → isla (X_ISLA)
//   → salida → pallet de expedición (PAL_X, al otro extremo).
// Las NO OK se separan en X_PUSH hacia la cinta de desvío lateral (z+).
export const MUELLE_IMP = -8.6;                            // dock del camión, al INICIO de la línea
export const X_SPAWN = -7.4;                               // punto de descarga sobre la acumulación
export const X_ISLA = -0.2;                                // isla de 3 cámaras, donde estaba la estación de lectura (la arma isla.js)
export const X_CAM = X_ISLA;                               // alias: donde la versión exportación tenía la cámara
export const X_TRIG = -1.05;                               // fotocélula de disparo, en la boca de la isla
export const X_PUSH = 1.9;                                 // desviador, después de la isla, con la rampa de rodillos
export const X_TOPE = X_PUSH - 3.4;                        // tope de la fila en el desvío
export const X_REIN = X_PUSH - 4.15;                       // subida que devuelve revisadas a la línea
export const CAM_Y = 0.95, CAM_Z = -0.82;                  // altura / lado de lectura (referencia para la isla)
export const PAL_X = 6.0, OP_PAL_X = 5.05;                 // pallet de expedición, al otro extremo
export const CAJAS_PALLET = 12;

// ------------------------------------------------------------------ estado y nodos (los pueblan initEscena / armarEscena)
export const S = {
  t: 0, cajas: [], pal: null, estaticos: [], cargados: [], viaje: null,
  opPal: null, inspMueve: true, pushK: 0, total: 0, ok: 0, mal: 0, pallets: 0,
};
export const G = {};                                       // bandas, pusher, op, baliza, leds, camion, jack, isla, monitores...
export const CALL = {};                                    // rótulos 3D (CSS2D)
export let scene = null, camera = null, renderer = null, composer = null, controls = null, bloom = null;
let r2d = null, contenedor = null, zoomObj = null;

// ------------------------------------------------------------------ materiales de bulto (los usa cajas.js; sin lógica acá)
export const GEO_CAJA = new THREE.BoxGeometry(LX, H, LZ);
export const CINTA_GEO = new THREE.BoxGeometry(0.07, H + 0.002, LZ + 0.002);
export const MAT_CARTON = new THREE.MeshStandardMaterial({ color: 0xa9794a, roughness: 0.88 });
export const MAT_CINTA = new THREE.MeshStandardMaterial({ color: 0xffc61a, roughness: 0.55 });   // cinta de embalar amarilla
export const TEX = {};                                     // etq_ok / etq_dato / etq_linea (se cargan en initEscena)

// ------------------------------------------------------------------ cielo que respira (gris ↔ celeste tenue)
const CIELO = { c: null, g: null, t: null, ult: -1 };
function pintarCielo(c, g, k) {
  const mez = (a, b) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(',')})`;
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, mez([120, 136, 150], [98, 152, 190]));
  gr.addColorStop(0.55, mez([196, 204, 212], [196, 222, 238]));
  gr.addColorStop(1, mez([232, 236, 240], [236, 244, 250]));
  g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
}
function texturaCielo() {
  const c = document.createElement('canvas'); c.width = 4; c.height = 256;
  const g = c.getContext('2d'); pintarCielo(c, g, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  CIELO.c = c; CIELO.g = g; CIELO.t = t; return t;
}
export function tickCielo(t) {                             // la llama el bucle principal cada cuadro
  if (!CIELO.t || t - CIELO.ult < 0.1) return;
  CIELO.ult = t; pintarCielo(CIELO.c, CIELO.g, (Math.sin(t * 0.15) + 1) / 2);
  CIELO.t.needsUpdate = true;
}

// ------------------------------------------------------------------ texturas procedurales (las del visor original)
export function texturaBanda(enZ) {
  const c = document.createElement('canvas'); c.width = enZ ? 64 : 256; c.height = enZ ? 256 : 64;
  const g = c.getContext('2d'); g.fillStyle = '#1b1d20'; g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < 4; i++) {
    g.fillStyle = '#34383e'; if (enZ) g.fillRect(0, i * 64 + 4, 64, 10); else g.fillRect(i * 64 + 4, 0, 10, 64);
    g.fillStyle = '#0e0f11'; if (enZ) g.fillRect(0, i * 64 + 14, 64, 3); else g.fillRect(i * 64 + 14, 0, 3, 64);
  }
  g.fillStyle = '#29a8e0'; if (enZ) { g.fillRect(0, 0, 4, 256); g.fillRect(60, 0, 4, 256); } else { g.fillRect(0, 0, 256, 4); g.fillRect(0, 60, 256, 4); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t;
}
export function texturaPiso(base, manchas, juntas) {
  const N = 512, c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d'); g.fillStyle = base; g.fillRect(0, 0, N, N);
  for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(${manchas},${0.03 + Math.random() * 0.07})`; const r = 1 + Math.random() * 3; g.fillRect(Math.random() * N, Math.random() * N, r, r); }
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * N, y = Math.random() * N, r = 20 + Math.random() * 60, gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(${manchas},0.06)`); gr.addColorStop(1, `rgba(${manchas},0)`); g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  if (juntas) { g.strokeStyle = 'rgba(40,40,45,0.35)'; g.lineWidth = 2; g.strokeRect(1, 1, N - 2, N - 2); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t;
}
function uvPlano(mesh, tile) {
  const p = mesh.geometry.attributes.position, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { uv[2 * i] = p.getX(i) / tile; uv[2 * i + 1] = p.getZ(i) / tile; }
  mesh.geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}
const matPropio = (m) => { m.material = m.material.clone(); return m.material; };

// ---- paleta blanco / gris / celeste con detalles amarillos (celestes animados)
export const CELESTE = 0x29a8e0, CELESTE_OSC = 0x1676a8, AMARILLO = 0xffc61a, BLANCO = 0xf4f5f6;
export const ROJO = CELESTE;                               // nombre viejo: los acentos que eran rojos ahora son celestes
function aPaleta(c) {
  const hsl = {}; c.getHSL(hsl);
  if (hsl.s < 0.2 || hsl.l < 0.28) { c.setHSL(0, 0, hsl.l * (hsl.s < 0.2 ? 1 : 0.85)); return; }
  const azul = hsl.h > 0.45 && hsl.h < 0.75, calido = hsl.h > 0.08 && hsl.h < 0.2;
  if (azul) c.setHex(hsl.l > 0.45 ? CELESTE : 0x4a5560);
  else if (calido) c.setHex(hsl.l > 0.35 ? AMARILLO : 0x6b7077);
  else if (hsl.h < 0.04 || hsl.h > 0.95) c.setHex(hsl.l > 0.62 ? BLANCO : CELESTE);
  else c.setHex(hsl.l > 0.62 ? BLANCO : hsl.l > 0.4 ? CELESTE : 0x6b7077);
}
export function recolorear(raizEscena) {
  const hechos = new Set([MAT_CARTON]);                    // el cartón no se pasa a la paleta
  raizEscena.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of [].concat(o.material)) {
      if (hechos.has(m) || !m.color) continue; hechos.add(m);
      if (!m.map) aPaleta(m.color);
      if (m.emissive && m.emissive.getHex() !== 0) aPaleta(m.emissive);
      if (/^(Linea_Seg|Zona_)/.test(o.name)) m.color.setHex(AMARILLO);   // demarcación del piso en amarillo
    }
  });
}
export const ACENTOS = [];
function acentuar(m) { if (!m.emissive) return; m.emissive.setHex(CELESTE); m.emissiveIntensity = 0.1; ACENTOS.push(m); }
export const LUCES_ROJAS = [];
function luzRoja(k) { const l = new THREE.PointLight(0x3fb6ff, 0, 9, 2); l.userData.k = k; scene.add(l); LUCES_ROJAS.push(l); return l; }

// ------------------------------------------------------------------ rótulos 3D
export function llamada(id, texto, pos, clase = '') {
  const d = document.createElement('div'); d.className = 'etq ' + clase; d.textContent = texto;
  const o = new CSS2DObject(d); o.position.copy(pos); o.visible = false; scene.add(o); CALL[id] = o; return o;
}
export function mostrarLlamadas(ids) { for (const [id, o] of Object.entries(CALL)) o.visible = ids.includes(id); }
function rotulos() {
  llamada('camion', 'Camión de importación: llegan los bultos', new THREE.Vector3(MUELLE_IMP - 3.5, 3.3, 0), 'nuevo');
  llamada('descarga', 'Descarga → acumulación', new THREE.Vector3(X_SPAWN, 1.5, 0), 'nuevo');
  llamada('isla', 'Isla 360° · 3 cámaras con luz propia', new THREE.Vector3(X_ISLA, 2.75, 0), 'nuevo');
  llamada('fotocelula', 'Fotocélula: avisa que entra un bulto', new THREE.Vector3(X_TRIG, 1.45, -0.56));
  llamada('pc', 'Pantalla del control: lo que ve la isla', new THREE.Vector3(X_ISLA - 1.25, 1.85, -1.55));
  llamada('pusher', 'Desviador: separa el bulto No Read', new THREE.Vector3(X_PUSH, 1.45, -1.0), 'alerta');
  llamada('revision', 'Cinta de desvío: bultos frenados para revisar', new THREE.Vector3((X_TOPE + X_PUSH) / 2, 1.3, 3.1), 'alerta');
  llamada('pallet', 'Pallet de expedición: se arma acá', new THREE.Vector3(PAL_X, 1.55, 0));
  llamada('expedicion', 'Expedición', new THREE.Vector3(8.1, 1.6, 0));
}

// ------------------------------------------------------------------ piezas propias
function unir(malla, a, b) {
  const d = b.clone().sub(a);
  malla.position.copy(a).addScaledVector(d, 0.5); malla.scale.set(1, d.length(), 1);
  malla.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
}
function cintaPropia(cx, cy, cz, largo, ancho, enZ, inclina = 0) {
  const g = new THREE.Group(); g.position.set(cx, cy, cz); g.rotation.x = inclina; scene.add(g);
  const tex = texturaBanda(enZ);
  tex.repeat.set(enZ ? ancho / 0.4 : largo / 0.4, enZ ? largo / 0.4 : ancho / 0.4);
  const cuerpo = new THREE.Mesh(new THREE.BoxGeometry(enZ ? ancho : largo, 0.05, enZ ? largo : ancho), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75 }));
  cuerpo.position.y = -0.025; cuerpo.castShadow = cuerpo.receiveShadow = true; g.add(cuerpo);
  const riel = new THREE.MeshStandardMaterial({ color: 0xaab4bd, roughness: 0.5, metalness: 0.3 });
  for (const s of [-1, 1]) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(enZ ? 0.03 : largo, 0.07, enZ ? largo : 0.03), riel);
    r.position.set(enZ ? s * (ancho / 2 + 0.015) : 0, 0, enZ ? 0 : s * (ancho / 2 + 0.015)); r.castShadow = true; g.add(r);
  }
  return { g, tex };
}
const matFilm = new THREE.MeshStandardMaterial({ color: 0xf1f3f5, transparent: true, opacity: 0.22, roughness: 0.2, depthWrite: false });
const matPallet = new THREE.MeshStandardMaterial({ color: 0xb9bec4, roughness: 0.8 });
function crearPallet(x, y, z) {
  const g = new THREE.Group(); g.userData.id = 'pallet'; g.position.set(x, y, z); scene.add(g);
  const tabla = (w, h, d, px, py, pz) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), matPallet); b.position.set(px, py, pz); b.castShadow = b.receiveShadow = true; g.add(b); };
  for (const pz of [-0.45, 0, 0.45]) tabla(1.2, 0.09, 0.09, 0, 0.045, pz);
  for (let i = 0; i < 7; i++) tabla(0.12, 0.025, 1.0, -0.54 + i * 0.18, 0.1375, 0);
  const film = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.62, 0.92), matFilm); film.position.set(0, 0.46, 0); film.visible = false; g.add(film);
  return { estado: 'lista', x, y, z, n: 0, listas: 0, cajas: [], malas: 0, t: 0, g, film, slot: -1 };
}
export function crearMonitor(x, z, yaw) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = yaw; scene.add(g);
  const gris = new THREE.MeshStandardMaterial({ color: 0xd5d9de, roughness: 0.5, metalness: 0.3 }), osc = new THREE.MeshStandardMaterial({ color: 0x2b2f33, roughness: 0.5, metalness: 0.3 });
  const add = (geo, m, px, py, pz) => { const o = new THREE.Mesh(geo, m); o.position.set(px, py, pz); o.castShadow = true; g.add(o); return o; };
  add(new THREE.BoxGeometry(0.34, 0.03, 0.34), gris, 0, 0.015, 0);
  add(new THREE.CylinderGeometry(0.03, 0.035, 1.05, 14), gris, 0, 0.55, 0);
  add(new THREE.BoxGeometry(0.78, 0.5, 0.05), osc, 0, 1.3, 0);
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 620;
  const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const mat = new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.9, roughness: 0.4 });
  const pant = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.436), mat); pant.position.set(0, 1.3, 0.0265); g.add(pant);
  return { g, canvas, ctx: canvas.getContext('2d'), tex, mat };
}
export function pintarMonitor(m, modo, titulo = '', sub = '') {   // versión básica; hud.js pinta el contenido rico
  const g = m.ctx, W = 512, Hh = 310; g.setTransform(2, 0, 0, 2, 0, 0);
  const fondo = modo === 'ok' ? '#12714a' : modo === 'nook' ? '#b02f2f' : '#171c21';
  g.fillStyle = fondo; g.fillRect(0, 0, W, Hh);
  g.fillStyle = '#fff'; g.textAlign = 'center';
  g.font = '700 34px "Segoe UI", sans-serif'; g.fillText(titulo || 'CONTROL DE ETIQUETAS', 256, 140);
  g.font = '500 24px "Segoe UI", sans-serif'; g.fillStyle = '#c9cfd5'; g.fillText(sub || 'esperando bulto…', 256, 185);
  m.tex.needsUpdate = true;
}

// ------------------------------------------------------------------ etiquetas: placeholder + jpg reales si existen
function etqPlaceholder(tipo) {
  const c = document.createElement('canvas'); c.width = 300; c.height = 221;
  const g = c.getContext('2d'); g.fillStyle = '#f4f5f6'; g.fillRect(0, 0, 300, 221);
  g.fillStyle = '#111'; for (let i = 0; i < 12; i++) g.fillRect(20 + i * 22, 30, 10, 80);
  g.font = '700 28px sans-serif'; g.fillText('ETQ ' + tipo.toUpperCase(), 20, 160);
  g.font = '400 20px sans-serif'; g.fillText('lote · vto · EAN', 20, 190);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
function crearTexturasEtiqueta(base) {
  const loader = new THREE.TextureLoader();
  for (const k of ['ok', 'tapada', 'rayada']) {
    TEX[k] = new THREE.MeshStandardMaterial({ map: etqPlaceholder(k), emissive: 0xffffff, emissiveMap: null, emissiveIntensity: 0.28, roughness: 0.55 });
    TEX[k].emissiveMap = TEX[k].map;
    loader.load(`${base}/etq_${k}.jpg`,
      (t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; TEX[k].map = t; TEX[k].emissiveMap = t; TEX[k].needsUpdate = true; },
      undefined, () => {});
  }
}

// ------------------------------------------------------------------ armado del modelo
function armarEscena(gltf) {
  const raiz = gltf.scene; G.raiz = raiz;
  raiz.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true;
    for (const m of [].concat(o.material)) if (m.metalness > 0.5) { m.roughness = Math.max(m.roughness, 0.5); m.metalness = 0.6; }   // sin reflejos que saturen el bloom
  });
  scene.add(raiz);
  const busca = (n) => raiz.getObjectByName(n);
  // Lo que no va en importación: robot de descarga, rack, tótem, colector, senda,
  // muelle de recepción y la zona de expedición vieja del final. El camión NO se
  // oculta: se reubica al INICIO (ver crearTransporte).
  const OCULTAR = /^(Inspeccion_|Encoder$|S_ZONA_|Rack_|Beam_|S_EXC_|Reader_|Colgante_|Soporte_R|Tunel_(?!Poste_\+0\.9_\+1\.0)|Bulto_|Colector_|Retorno_|Revision_Fondo|Revision_Pared|Expedicion_|Cartel_Expedicion|Zona_Revision_Marca|HMI_|Senda_|Piso_Senda|Linea_Seg_S)/;
  raiz.children.forEach((o) => { if (OCULTAR.test(o.name)) o.visible = false; });

  // bandas del modelo con textura (el scroll lo hace el bucle: G.bandas = [nombre, mapa])
  const texX = texturaBanda(false), texZ = texturaBanda(true);
  G.bandas = [];
  for (const n of ['Alimentador', 'Acumulacion', 'Inspeccion', 'Salida']) {
    const o = busca(`${n}_Banda`); if (!o) continue;
    uvPlano(o, 0.4);
    const m = matPropio(o);
    Object.assign(m, { transparent: false, opacity: 1, transmission: 0, depthWrite: true });
    m.map = texX.clone(); m.map.needsUpdate = true; m.color.set(0xffffff); m.roughness = 0.75;
    G.bandas.push([n, m.map]);
  }
  for (const [nombre, tile, base, manchas, juntas] of [['Piso', 4, '#a9aeb3', '60,62,66', true], ['Patio', 6, '#3b3c3f', '10,10,12', false], ['Terreno', 8, '#6f7a6a', '40,48,38', false]]) {
    const o = busca(nombre); if (!o) continue;
    uvPlano(o, tile); const m = matPropio(o); m.map = texturaPiso(base, manchas, juntas); m.color.set(0xffffff); m.roughness = 0.9;
  }

  // desviador del modelo, corrido al X_PUSH nuevo (después de la isla)
  G.pusher = busca('Pusher_Mov');
  const dxPush = X_PUSH - (-0.05);
  for (const n of ['Pusher_Mov', 'Cilindro_Cuerpo', 'Cilindro_Soporte', 'Electrovalvula_VUVG', 'S_EXT_Cuerpo', 'S_RET_Cuerpo', 'LED_S_EXT', 'LED_S_RET']) { const o = busca(n); if (o) { o.userData.id = 'pusher'; o.position.x += dxPush; } }
  // la rampa de rodillos y su sensor de paso van con el desviador (estaban en la estación vieja, x = 0)
  raiz.children.forEach((o) => { if (/^(Carril_|S_PASO_)/.test(o.name)) { o.position.x += X_PUSH; o.userData.id = 'pusher'; } });
  // el cartel de revisión queda detrás del operario
  for (const n of ['Cartel_Revision', 'Cartel_Revision_Poste', 'Cartel_Revision_Texto']) { const o = busca(n); if (o) o.position.x += (X_TOPE - 0.75) - (-1.0); }
  // fotocélula de disparo: la S_ING del modelo, corrida antes de la isla
  for (const n of ['S_ING_Emisor', 'S_ING_Poste_E', 'S_ING_Poste_R', 'S_ING_Reflector']) { const o = busca(n); if (o) o.userData.id = 'fotocelula'; }
  const dx = X_TRIG - (-4.6);
  for (const n of ['S_ING_Emisor', 'S_ING_Poste_E', 'S_ING_Poste_R', 'S_ING_Reflector']) { const o = busca(n); if (o) o.position.x += dx; }
  G.leds = {};
  if (busca('S_ING_Emisor')) G.leds.foto = matPropio(busca('S_ING_Emisor'));
  if (busca('S_ZONA_Emisor')) G.leds.zona = matPropio(busca('S_ZONA_Emisor'));

  // operario de revisión, al final de la cinta de desvío (lado revisión, z+)
  G.op = busca('Operario');
  if (G.op) { G.op.userData.id = 'operario'; G.op.position.set(X_TOPE + 0.45, 0, 4.1); }
  G.opBrazos = [busca('Operario_Brazo_I'), busca('Operario_Brazo_D')].filter(Boolean);
  G.opLector = busca('Operario_Lector') || null;

  // baliza sobre la pantalla del control
  G.baliza = Object.fromEntries([['Verde', 0xffffff], ['Ambar', 0xb7bcc2], ['Roja', 0xff1d3a]].map(([n, col]) => {
    const o = busca('Baliza_' + n); return [n, o ? { mat: matPropio(o), col: new THREE.Color(col) } : null];
  }));
  for (const n of ['Baliza_Mastil', 'Baliza_Verde', 'Baliza_Ambar', 'Baliza_Roja']) { const o = busca(n); if (o) o.visible = false; }   // la isla tiene su torre propia

  // isla: placeholder para que isla.js monte plato + 3 cámaras + cabina
  G.isla = new THREE.Group(); G.isla.position.set(X_ISLA, 0, 0); G.isla.userData.id = 'isla'; scene.add(G.isla);

  // monitores: control (junto a la isla) y desvío (donde el operario revisa)
  G.monControl = crearMonitor(X_ISLA - 1.25, -1.55, Math.PI + 0.5); G.monControl.g.userData.id = 'pc';
  G.monDesvio = crearMonitor(X_TOPE + 1.35, 4.1, -0.3); G.monDesvio.g.userData.id = 'pantalla2';
  pintarMonitor(G.monControl); pintarMonitor(G.monDesvio);
  crearTransporte();
  rotulos();
  recolorear(scene);
  // celestes que respiran: lo que quedó en ROJO + rieles propios + tope + cinta de bultos
  raiz.traverse((o) => { if (o.isMesh && o.material && o.material.color && o.material.color.getHex() === ROJO) { o.material = o.material.clone(); acentuar(o.material); } });
  for (const q of [G.desvio, G.conector, G.descarga].filter(Boolean))
    q.g.children.forEach((o) => { if (o.material && o.material.color && o.material.color.getHex() === 0xaab4bd) { o.material = o.material.clone(); o.material.color.setHex(ROJO); acentuar(o.material); } });
  if (G.tope) acentuar(G.tope.material);
  acentuar(MAT_CINTA);
  luzRoja(0); luzRoja(1);
  // banda celeste de luz que recorre el piso
  const cb = document.createElement('canvas'); cb.width = 256; cb.height = 4;
  const gb = cb.getContext('2d'), gg = gb.createLinearGradient(0, 0, 256, 0);
  gg.addColorStop(0, 'rgba(41,168,224,0)'); gg.addColorStop(0.5, 'rgba(41,168,224,0.5)'); gg.addColorStop(1, 'rgba(41,168,224,0)');
  gb.fillStyle = gg; gb.fillRect(0, 0, 256, 4);
  G.barrido = new THREE.Mesh(new THREE.PlaneGeometry(5, 11), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cb), transparent: true, opacity: 0.35, depthWrite: false }));
  G.barrido.rotation.x = -Math.PI / 2; G.barrido.position.y = 0.006; scene.add(G.barrido);
}

function crearTransporte() {
  const raiz = G.raiz;
  const pataMat = new THREE.MeshStandardMaterial({ color: 0x4a545d, roughness: 0.6, metalness: 0.4 });
  const pata = (x, z, alto) => { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, alto - 0.05, 10), pataMat); p.position.set(x, (alto - 0.05) / 2, z); p.castShadow = true; scene.add(p); };
  // UNA sola cinta de desvío (igual que el original): las NO OK bajan por rodillos y
  // quedan frenadas contra el tope; la revisada sale por el final y una subida corta
  // la devuelve a la línea. Todo corrido al X_PUSH nuevo.
  const cxD = X_PUSH - 2.025;                                  // -0.05-2.025 era el centro original
  G.desvio = cintaPropia(cxD, BELT_D, 3.1, 5.15, 0.8, false);
  for (const x of [cxD - 2.2, cxD - 0.8, cxD + 0.6, cxD + 2.0]) for (const s of [-1, 1]) pata(x, 3.1 + s * 0.36, BELT_D);
  G.tope = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.2, 0.7), new THREE.MeshStandardMaterial({ color: AMARILLO, roughness: 0.5 }));
  G.tope.position.set(X_TOPE - LX / 2 - 0.07, BELT_D + 0.1, 3.1); G.tope.castShadow = true; G.tope.userData.id = 'tope'; scene.add(G.tope);
  for (const s of [-1, 1]) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.08, 0.05), new THREE.MeshStandardMaterial({ color: 0xe6e8ea, roughness: 0.5 })); f.position.set(X_TOPE - LX / 2 + 0.05, BELT_D + 0.14, 3.1 + s * 0.46); scene.add(f); }
  const largo = 2.35, ang = Math.atan2(BELT - BELT_D, largo);
  G.conector = cintaPropia(X_REIN, (BELT + BELT_D) / 2, 2.75 - largo / 2, largo, 0.8, true, ang);
  for (const [z, h] of [[2.55, BELT_D], [0.75, BELT - 0.04]]) for (const s of [-1, 1]) pata(X_REIN + s * 0.36, z, h);
  // pallet de expedición al final de la línea (el autoelevador lo lleva al almacén: almacen.js)
  S.pal = crearPallet(PAL_X, 0, 0); S.estaticos = []; S.cargados = []; S.viaje = null;
  if (G.op) { G.opPal = G.op.clone(true); G.opPal.position.set(OP_PAL_X, 0, 0.95); G.opPal.rotation.y = Math.PI; scene.add(G.opPal); }
  // CAMIÓN y AMR del hito H3, en su lugar original: la cola del camión contra el muelle (descarga.js los mueve)
  G.camion = raiz.getObjectByName('Camion');
  if (G.camion) {
    G.camion.userData.id = 'camion'; G.camion.visible = true; G.camion.rotation.y = 0; G.camion.position.set(0, 0, 0);
    for (const n of ['Remolque_Techo', 'Remolque_Lateral_+1', 'Remolque_Franja_+1']) { const o = raiz.getObjectByName(n); if (o) o.visible = false; }   // se ve la carga desde la línea
    G.camion.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  }
  G.puertas = [raiz.getObjectByName('Puerta_I'), raiz.getObjectByName('Puerta_D')];
  G.amr = raiz.getObjectByName('AMR');
  if (G.amr) {
    G.amr.userData.id = 'amr';
    G.carro = raiz.getObjectByName('AMR_Carro');
    G.brazo = ['I', 'D'].map((n) => ['Hombro', 'Codo', 'Muneca'].map((j) => raiz.getObjectByName(`AMR_${j}_${n}`)));
    G.amrFov = raiz.getObjectByName('AMR_FOV');
    if (G.amrFov) { G.amrFov.castShadow = false; G.amrFov.material = G.amrFov.material.clone(); Object.assign(G.amrFov.material, { transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }); }
    const mats = {}; raiz.traverse((o) => { if (o.isMesh && o.material?.name) mats[o.material.name] = o.material; });
    G.ventosas = [mats.Ventosa_I, mats.Ventosa_D]; G.luzAmr = mats.Luz_AMR_Estado;
  }
}

// ------------------------------------------------------------------ init: renderer, escena, luces, modelo
function armarBase(cont) {
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  cont.appendChild(renderer.domElement);
  r2d = new CSS2DRenderer();
  r2d.domElement.style.cssText = 'position:absolute;inset:0;pointer-events:none';
  cont.appendChild(r2d.domElement);

  scene = new THREE.Scene();
  scene.background = texturaCielo();
  scene.fog = new THREE.Fog(0xdadde1, 70, 240);
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.65;
  camera = new THREE.PerspectiveCamera(42, 1, 0.15, 400);
  camera.position.set(-6.5, 4.2, 7.5);
  composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }));
  composer.addPass(new RenderPass(scene, camera));
  bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.35, 0.3, 2.6);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.minDistance = 0.8; controls.maxDistance = 60;
  controls.enableZoom = true; controls.zoomToCursor = true; controls.zoomSpeed = 1.6;   // la rueda acerca hacia donde apunta el mouse
  controls.screenSpacePanning = true; controls.rotateSpeed = 0.7; controls.dampingFactor = 0.07;
  controls.target.set(-1, 0.8, 0);

  const hemi = new THREE.HemisphereLight(0xeef3f8, 0x4a4f55, 1.1);
  scene.add(hemi);
  const sol = new THREE.DirectionalLight(0xfff4e6, 2.6);
  sol.position.set(4, 15, 9); sol.target.position.set(4, 0, 0);
  scene.add(sol.target);
  sol.castShadow = true; sol.shadow.mapSize.set(2048, 2048);
  Object.assign(sol.shadow.camera, { left: -20, right: 20, top: 16, bottom: -16, near: 1, far: 50 });
  sol.shadow.bias = -0.0004; sol.shadow.normalBias = 0.02;
  scene.add(sol);
  const relleno = new THREE.DirectionalLight(0xdfe8ff, 0.5);
  relleno.position.set(10, 6, -8); scene.add(relleno);
  G.sol = sol;
}
export function pasoZoom(dt) {                             // la llama el bucle: acerca la cámara de a poco
  if (zoomObj == null) return;
  const off = camera.position.clone().sub(controls.target), d = off.length(), nd = d + (zoomObj - d) * Math.min(1, dt * 7);
  camera.position.copy(controls.target).addScaledVector(off.normalize(), nd);
  if (Math.abs(nd - zoomObj) < 0.002) zoomObj = null;
}
export function resize() {
  if (!contenedor || !renderer) return;
  const w = contenedor.clientWidth || 1, h = contenedor.clientHeight || 1;
  camera.aspect = w / h; camera.updateProjectionMatrix();
  renderer.setSize(w, h); composer.setSize(w, h); r2d.setSize(w, h);
}
export function render() { composer.render(); r2d.render(scene, camera); }

export function initEscena(cont, opts = {}) {
  contenedor = typeof cont === 'string' ? document.getElementById(cont) : cont;
  const base = opts.base || 'assets';
  armarBase(contenedor);
  crearTexturasEtiqueta(base);
  resize();
  addEventListener('resize', resize);
  const aviso = opts.onProgreso || (() => {});
  return new Promise((ok, no) => new GLTFLoader().load(`${base}/estacion.glb`, (gltf) => {
    armarEscena(gltf);
    resize();
    ok(G);
  }, (e) => { if (e.total) aviso(Math.round(100 * e.loaded / e.total)); }, no));
}
