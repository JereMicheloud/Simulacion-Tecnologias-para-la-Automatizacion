// Almacén de pallets: racks selectivos al final de la nave y un autoelevador que
// lleva cada pallet completo (12 bultos ya identificados) a un lugar libre del rack.
// Cuando el rack se llena, el pallet más viejo sale (despacho) y deja el lugar.
//
// Uso: initAlmacen({ scene, S, G, crearPallet, quitarCaja, PAL_X, H, LX, LZ, log }); en el bucle: tickAlmacen(dt).
import * as THREE from 'three';

const AMARILLO = 0xffc61a, CELESTE = 0x29a8e0;
export const RACK = { x: 11.4, bahias: 7, z0: -4.2, paso: 1.4, niveles: [0.0, 1.55, 3.1], fondo: 1.2 };
const PARKING = { x: 9.4, z: -3.3, yaw: Math.PI / 2 };
const V = 1.6, W = 1.6, V_HORQ = 0.6, ALCANCE = 1.15;      // m/s, rad/s, m/s, centro del pallet delante del autoelevador

let C = null;
const AE = { x: PARKING.x, z: PARKING.z, yaw: PARKING.yaw, horq: 0.05, cola: [], pallet: null, marcha: 0 };
const lugares = [];                                          // { x, y, z, ocupado: pallet|deco|null, t }
const angDif = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

export function initAlmacen(ctx) {
  C = ctx;
  construirRack();
  C.G.autoelevador = construirAutoelevador();
  C.S.almacen = { AE, lugares };
  // el rack arranca con mercadería de días anteriores
  lugares.forEach((l, i) => { if ((i * 7) % 10 < 6) ponerDeco(l, -100 + i); });
  return AE;
}

// ---------------------------------------------------------------- rack
function construirRack() {
  const g = new THREE.Group(); g.userData.id = 'rack'; C.scene.add(g);
  const naranja = new THREE.MeshStandardMaterial({ color: 0xe8792a, roughness: 0.5, metalness: 0.4 });   // largueros como en los racks reales
  const azulPata = new THREE.MeshStandardMaterial({ color: 0x1f5f8b, roughness: 0.5, metalness: 0.4 });
  const add = (w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; o.userData.id = 'rack'; g.add(o); return o; };
  const { x, bahias, z0, paso, niveles, fondo } = RACK, alto = niveles[niveles.length - 1] + 1.6;
  for (let i = 0; i <= bahias; i++) {
    const z = z0 - paso / 2 + i * paso;
    for (const dx of [0, fondo]) add(0.08, alto, 0.08, azulPata, x + dx, alto / 2, z);
    for (let k = 0; k < 6; k++) add(0.03, 0.03, 0.03, azulPata, x + fondo / 2, 0.4 + k * (alto / 6), z).scale.set(fondo / 0.03, 1, 1);   // diagonales del bastidor (simplificadas)
    add(0.12, 0.08, 0.14, new THREE.MeshStandardMaterial({ color: AMARILLO, roughness: 0.5 }), x - 0.08, 0.04, z);                   // protector de pata
  }
  for (const y of niveles.slice(1)) for (const dx of [0, fondo]) add(0.06, 0.12, bahias * paso, naranja, x + dx, y - 0.06, z0 - paso / 2 + bahias * paso / 2);
  // lugares: centro del pallet
  for (let i = 0; i < bahias; i++) for (const y of niveles) lugares.push({ x: x + fondo / 2, y, z: z0 + i * paso, ocupado: null, t: 0 });
  // cartel del pasillo
  const c = document.createElement('canvas'); c.width = 512; c.height = 128; const cx = c.getContext('2d');
  cx.fillStyle = '#16191c'; cx.fillRect(0, 0, 512, 128); cx.fillStyle = '#ffc61a'; cx.fillRect(0, 112, 512, 16);
  cx.fillStyle = '#fff'; cx.font = '800 54px "Segoe UI", sans-serif'; cx.fillText('ALMACÉN · RACK A', 24, 78);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const cartel = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.6), new THREE.MeshStandardMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.3 }));
  cartel.position.set(x - 0.05, alto + 0.45, 0); cartel.rotation.y = -Math.PI / 2; g.add(cartel);
}

// pallet guardado "liviano": una sola malla con los 12 bultos y el film (no suma objetos a la simulación)
const geoCarga = (() => { const g = new THREE.BoxGeometry(1.1, 0.56, 0.7); g.translate(0, 0.15 + 0.28, 0); return g; })();
const geoBase = (() => { const g = new THREE.BoxGeometry(1.2, 0.14, 1.0); g.translate(0, 0.07, 0); return g; })();
let texCarga = null;
function texturaCarga() {
  if (texCarga) return texCarga;
  const c = document.createElement('canvas'); c.width = 256; c.height = 128; const x = c.getContext('2d');
  x.fillStyle = '#a9794a'; x.fillRect(0, 0, 256, 128);
  x.strokeStyle = 'rgba(60,40,20,.55)'; x.lineWidth = 2;
  for (let i = 0; i <= 4; i++) { x.beginPath(); x.moveTo(i * 64, 0); x.lineTo(i * 64, 128); x.stroke(); }
  for (let j = 0; j <= 3; j++) { x.beginPath(); x.moveTo(0, j * 42.6); x.lineTo(256, j * 42.6); x.stroke(); }
  x.fillStyle = '#ffc61a'; for (let i = 0; i < 4; i++) x.fillRect(i * 64 + 26, 0, 10, 128);
  x.fillStyle = 'rgba(255,255,255,.18)'; x.fillRect(0, 0, 256, 128);
  texCarga = new THREE.CanvasTexture(c); texCarga.colorSpace = THREE.SRGBColorSpace; return texCarga;
}
function ponerDeco(l, t) {
  const g = new THREE.Group(); g.position.set(l.x, l.y, l.z); g.userData.id = 'rack';
  const base = new THREE.Mesh(geoBase, new THREE.MeshStandardMaterial({ color: 0xb9bec4, roughness: 0.8 }));
  const carga = new THREE.Mesh(geoCarga, new THREE.MeshStandardMaterial({ map: texturaCarga(), roughness: 0.75 }));
  base.castShadow = carga.castShadow = true; g.add(base, carga); C.scene.add(g);
  l.ocupado = g; l.t = t;
}
function liberar(l) { if (l.ocupado) { l.ocupado.removeFromParent(); l.ocupado = null; } }

// ---------------------------------------------------------------- autoelevador (hecho con piezas simples)
function construirAutoelevador() {
  const g = new THREE.Group(); g.userData.id = 'autoelevador'; C.scene.add(g);
  const mat = (c, r = 0.5, m = 0.3) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
  const amarillo = mat(AMARILLO, 0.45, 0.2), negro = mat(0x1c2126, 0.6, 0.2), gris = mat(0x5d666f, 0.4, 0.7), acero = mat(0xaab4bd, 0.35, 0.8);
  const add = (geo, m, x, y, z, padre = g) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; o.userData.id = 'autoelevador'; padre.add(o); return o; };
  // chasis y contrapeso (la parte de atrás está en -x local; las horquillas en +x)
  add(new THREE.BoxGeometry(1.3, 0.55, 1.0), amarillo, -0.15, 0.45, 0);
  add(new THREE.BoxGeometry(0.45, 0.75, 1.0), gris, -0.75, 0.55, 0);
  add(new THREE.BoxGeometry(0.5, 0.08, 0.5), negro, -0.15, 0.78, 0);                   // asiento
  add(new THREE.BoxGeometry(0.1, 0.45, 0.45), negro, -0.4, 1.0, 0);                    // respaldo
  // ruedas
  for (const [x, r] of [[0.32, 0.27], [-0.62, 0.22]]) for (const z of [-0.45, 0.45]) {
    const w = add(new THREE.CylinderGeometry(r, r, 0.2, 18), negro, x, r, z); w.rotation.x = Math.PI / 2;
  }
  // techo protector y franja celeste
  for (const x of [0.2, -0.55]) for (const z of [-0.44, 0.44]) add(new THREE.BoxGeometry(0.05, 1.35, 0.05), negro, x, 1.4, z);
  add(new THREE.BoxGeometry(0.85, 0.05, 0.95), negro, -0.17, 2.08, 0);
  add(new THREE.BoxGeometry(1.31, 0.06, 1.01), new THREE.MeshStandardMaterial({ color: CELESTE, roughness: 0.4 }), -0.15, 0.62, 0);
  const baliza = add(new THREE.SphereGeometry(0.06, 12, 12), new THREE.MeshStandardMaterial({ color: 0x332200, emissive: 0xffa000, emissiveIntensity: 2 }), -0.55, 2.16, 0);
  // conductor (operario del modelo)
  if (C.G.op) { const o = C.G.op.clone(true); o.scale.setScalar(0.92); o.position.set(-0.2, 0.35, 0); o.rotation.y = Math.PI; g.add(o); }   // el modelo del operario mira hacia -x
  // mástil fijo + carro móvil con las horquillas
  for (const z of [-0.3, 0.3]) add(new THREE.BoxGeometry(0.08, 2.2, 0.08), gris, 0.55, 1.1, z);
  const carro = new THREE.Group(); carro.position.set(0.62, 0, 0); g.add(carro);
  add(new THREE.BoxGeometry(0.06, 0.6, 0.8), gris, 0, 0.3, 0, carro);
  for (const z of [-0.25, 0.25]) add(new THREE.BoxGeometry(1.1, 0.045, 0.12), acero, 0.55, 0.02, z, carro);
  return { g, carro, baliza };
}

// ---------------------------------------------------------------- tareas
const tarea = (...a) => AE.cola.push(...a);
function lugarLibre() {
  let l = lugares.find((x) => !x.ocupado);
  if (!l) {                                                  // rack lleno: sale el pallet más viejo (despacho) y deja su lugar
    l = lugares.reduce((a, b) => (a.t <= b.t ? a : b));
    liberar(l);
    C.log?.('Almacén', 'Rack lleno: se despacha el pallet más antiguo y se libera su lugar.', 'Evento logístico.');
  }
  return l;
}
function planificar(p) {
  const l = lugarLibre(); l.ocupado = 'reservado';
  const ax = l.x - ALCANCE - 1.5;                            // punto de aproximación frente a la bahía
  tarea(
    { t: 'horq', y: 0.06 },
    { t: 'ir', x: C.PAL_X + ALCANCE + 1.3, z: 0 }, { t: 'girar', yaw: Math.PI },
    { t: 'ir', x: C.PAL_X + ALCANCE, z: 0 },
    { t: 'horq', y: 0.2 }, { t: 'fn', f: () => tomar(p) },
    { t: 'ir', x: C.PAL_X + ALCANCE + 1.6, z: 0, atras: true },
    { t: 'ir', x: ax, z: l.z }, { t: 'girar', yaw: 0 },
    { t: 'horq', y: l.y + 0.2 }, { t: 'ir', x: l.x - ALCANCE, z: l.z },
    { t: 'horq', y: l.y + 0.08 }, { t: 'fn', f: () => dejar(p, l) },
    { t: 'ir', x: ax, z: l.z, atras: true }, { t: 'horq', y: 0.06 },
    { t: 'ir', x: PARKING.x, z: PARKING.z }, { t: 'girar', yaw: PARKING.yaw },
  );
}
function tomar(p) {
  AE.pallet = p; p.estado = 'viaje'; p.film.visible = true;
  // se arma otro pallet vacío en el puesto de la línea
  C.S.pal = C.crearPallet(C.PAL_X, 0, 0);
  C.log?.('Expedición', 'El autoelevador retira el pallet completo (12 bultos) y lo lleva al almacén.', 'Evento logístico.');
}
function dejar(p, l) {
  AE.pallet = null;
  for (const b of p.cajas) C.quitarCaja(b);                 // el pallet guardado pasa a ser una malla liviana
  p.g.removeFromParent();
  ponerDeco(l, C.S.t);
  C.S.pallets = (C.S.pallets || 0) + 1;
}

export function tickAlmacen(dt) {
  if (!C) return;
  const p = C.S.pal;
  if (!AE.cola.length && p && p.estado === 'completo') { p.t = (p.t || 0) + dt; if (p.t > 1.0) planificar(p); }
  const a = AE.cola[0];
  let listo = false;
  AE.marcha = 0;
  if (a) switch (a.t) {
    case 'fn': AE.cola.shift(); a.f(); break;
    case 'horq': { const d = a.y - AE.horq; AE.horq += Math.sign(d) * Math.min(Math.abs(d), V_HORQ * dt); listo = Math.abs(d) < 1e-3; break; }
    case 'girar': { const d = angDif(AE.yaw, a.yaw); AE.yaw += Math.sign(d) * Math.min(Math.abs(d), W * dt); listo = Math.abs(d) < 1e-3; break; }
    case 'ir': {
      const dx = a.x - AE.x, dz = a.z - AE.z, dist = Math.hypot(dx, dz);
      if (dist < 1e-3) { listo = true; break; }
      const rumbo = Math.atan2(-dz, dx) + (a.atras ? Math.PI : 0), dg = angDif(AE.yaw, rumbo);
      if (dist > 0.05 && Math.abs(dg) > 1e-3) { AE.yaw += Math.sign(dg) * Math.min(Math.abs(dg), W * dt); break; }
      const v = Math.min(dist, V * dt); AE.x += (dx / dist) * v; AE.z += (dz / dist) * v; AE.marcha = 1;
      break;
    }
  }
  if (listo) AE.cola.shift();
  // 3D
  const A = C.G.autoelevador; if (!A) return;
  A.g.position.set(AE.x, 0, AE.z); A.g.rotation.y = AE.yaw;
  A.carro.position.y = AE.horq;
  A.baliza.material.emissiveIntensity = Math.sin((C.S.t || 0) * 9) > 0 ? 3 : 0.4;
  if (AE.pallet) {
    const q = AE.pallet, f = new THREE.Vector3(Math.cos(AE.yaw), 0, -Math.sin(AE.yaw));
    q.x = AE.x + f.x * ALCANCE; q.z = AE.z + f.z * ALCANCE; q.y = AE.horq - 0.05; q.ry = AE.yaw + Math.PI;
    q.g.position.set(q.x, q.y, q.z); q.g.rotation.y = q.ry;
  }
}
