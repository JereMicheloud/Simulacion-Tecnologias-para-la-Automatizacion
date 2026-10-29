// Entorno de la planta: piso del almacén, nave industrial (columnas, cabriadas,
// luminarias y pared del fondo; el frente queda abierto para mirar adentro),
// muelles con portones y un segundo camión en el patio, y señalética de seguridad.
// Uso: crearEntorno({ scene, G, texturaPiso });
import * as THREE from 'three';

const AMARILLO = 0xffc61a, CELESTE = 0x29a8e0;
const X0 = -12.4, X1 = 18, Z0 = -6.6, Z1 = 6.6, ALTO = 8.2;

export function crearEntorno({ scene, G, texturaPiso }) {
  const g = new THREE.Group(); g.name = 'Entorno'; scene.add(g);
  const mat = (c, r = 0.6, m = 0.2, extra = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m, ...extra });
  const add = (geo, m, x, y, z, padre = g, sombra = true) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = sombra; o.receiveShadow = true; padre.add(o); return o; };
  const caja = (w, h, d, m, x, y, z, padre = g) => add(new THREE.BoxGeometry(w, h, d), m, x, y, z, padre);

  // ---- piso del almacén (continúa la losa de la nave) y vereda exterior
  const tx = texturaPiso('#a9aeb3', '60,62,66', true); tx.repeat.set((X1 - 8) / 4, 13.2 / 4);
  caja(X1 - 8 + 0.6, 1.1, 13.2, new THREE.MeshStandardMaterial({ map: tx, roughness: 0.9 }), (8 + X1 + 0.6) / 2, -0.55, 0);

  // ---- columnas y cabriadas
  const acero = mat(0x7f8b96, 0.45, 0.6), aceroOsc = mat(0x55606b, 0.5, 0.5);
  const xsCol = []; for (let x = X0 + 0.3; x <= X1 + 0.01; x += 6) xsCol.push(x);
  for (const x of xsCol) for (const z of [Z0 + 0.2, Z1 - 0.2]) {
    caja(0.32, ALTO, 0.32, acero, x, ALTO / 2, z);
    caja(0.42, 1.0, 0.42, mat(AMARILLO, 0.5), x, 0.5, z);                                 // protección amarilla al pie
    const fr = caja(0.44, 0.08, 0.44, mat(0x16191c), x, 1.02, z); fr.castShadow = false;
  }
  for (const x of xsCol) {                                                                  // cabriada a dos aguas
    const cord = (z1, y1, z2, y2, s = 0.12) => {
      const d = Math.hypot(z2 - z1, y2 - y1), o = caja(s, d, s, aceroOsc, x, (y1 + y2) / 2, (z1 + z2) / 2);
      o.rotation.x = Math.atan2(z2 - z1, y2 - y1); o.castShadow = false;
    };
    cord(Z0, ALTO, 0, ALTO + 1.6); cord(0, ALTO + 1.6, Z1, ALTO);
    cord(Z0, ALTO, Z1, ALTO, 0.09);
    for (let k = 1; k < 6; k++) { const z = Z0 + k * (Z1 - Z0) / 6, y = ALTO + 1.6 * (1 - Math.abs(z) / Z1); cord(z, ALTO, z, y, 0.06); }
  }
  for (const z of [-4.4, -2.2, 0, 2.2, 4.4]) {                                              // correas
    const o = caja(X1 - X0, 0.08, 0.08, aceroOsc, (X0 + X1) / 2, ALTO + 1.6 * (1 - Math.abs(z) / Z1) + 0.06, z); o.castShadow = false;
  }
  // luminarias LED de nave (campana) colgando
  const lum = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xf4fbff, emissiveIntensity: 1.6 });
  for (let x = X0 + 3.3; x < X1; x += 6) for (const z of [-3, 3]) {
    caja(0.02, 1.3, 0.02, aceroOsc, x, ALTO - 0.65, z).castShadow = false;
    const c = add(new THREE.CylinderGeometry(0.22, 0.38, 0.28, 20, 1, true), mat(0x9aa3ab, 0.4, 0.6, { side: THREE.DoubleSide }), x, ALTO - 1.4, z, g, false);
    add(new THREE.CircleGeometry(0.34, 20), lum, x, ALTO - 1.535, z, g, false).rotation.x = Math.PI / 2;
    c.userData.lum = true;
  }

  // ---- pared del fondo (z-) con chapa acanalada, franja celeste y ventanas altas
  const chapa = texturaChapa(); chapa.repeat.set((X1 - X0) / 3, 1);
  const pared = add(new THREE.PlaneGeometry(X1 - X0, ALTO + 0.5), new THREE.MeshStandardMaterial({ map: chapa, roughness: 0.7, metalness: 0.2 }), (X0 + X1) / 2, (ALTO + 0.5) / 2, Z0 - 0.02, g, false);
  pared.receiveShadow = true;
  add(new THREE.PlaneGeometry(X1 - X0, 0.5), mat(CELESTE, 0.5), (X0 + X1) / 2, 1.4, Z0 - 0.005, g, false);
  add(new THREE.PlaneGeometry(X1 - X0, 0.12), mat(AMARILLO, 0.5), (X0 + X1) / 2, 1.1, Z0 - 0.004, g, false);
  const vidrio = new THREE.MeshStandardMaterial({ color: 0xcfe9f7, emissive: 0x9fd2ee, emissiveIntensity: 0.35, roughness: 0.2, metalness: 0.1 });
  for (let x = X0 + 1.5; x < X1 - 1; x += 3) add(new THREE.PlaneGeometry(2.2, 0.9), vidrio, x, ALTO - 1.0, Z0 + 0.0, g, false);
  // logo pintado en la pared
  add(new THREE.PlaneGeometry(6.4, 1.6), new THREE.MeshStandardMaterial({ map: cartelTexto(['TRACEPACK', 'Centro de importación · Recepción e identificación de bultos'], '#0f1a24', '#ffffff', '#29a8e0'), roughness: 0.6 }), -2.0, 5.3, Z0 + 0.01, g, false);

  // ---- pared de muelles (x0) con 3 portones: el del medio es el del camión que se descarga
  const muro = mat(0xd5dbe0, 0.85, 0.05);
  const puertas = [-3.9, 0, 3.9], ANCHO = 3.2, ALTO_P = 3.7;
  const zs = [Z0, ...puertas.flatMap((z) => [z - ANCHO / 2, z + ANCHO / 2]), Z1];
  for (let i = 0; i < zs.length; i += 2) { const a = zs[i], b = zs[i + 1]; if (b - a > 0.01) caja(0.3, ALTO, b - a, muro, X0 - 0.15, ALTO / 2, (a + b) / 2); }
  for (const z of puertas) {
    caja(0.3, ALTO - ALTO_P, ANCHO, muro, X0 - 0.15, ALTO_P + (ALTO - ALTO_P) / 2, z);
    // burletes de muelle (negros) y marco amarillo/negro
    for (const s of [-1, 1]) caja(0.35, ALTO_P, 0.25, mat(0x1c2126, 0.9), X0 - 0.42, ALTO_P / 2 - 0.4, z + s * (ANCHO / 2 - 0.1));
    caja(0.35, 0.35, ANCHO, mat(0x1c2126, 0.9), X0 - 0.42, ALTO_P - 0.4, z);
    const ray = texturaRayas(); ray.repeat.set(1, 6);
    for (const s of [-1, 1]) caja(0.02, ALTO_P, 0.16, new THREE.MeshStandardMaterial({ map: ray }), X0 + 0.02, ALTO_P / 2, z + s * (ANCHO / 2 + 0.08));
    // portón seccional: abierto (arriba) en el muelle activo, cerrado en los otros
    const abierto = z === 0;
    const porton = caja(0.06, abierto ? 0.5 : ALTO_P, ANCHO, mat(0xb9c2ca, 0.5, 0.4), X0 - 0.05, abierto ? ALTO_P - 0.25 : ALTO_P / 2, z);
    porton.castShadow = false;
    // número del muelle y semáforo
    add(new THREE.PlaneGeometry(0.9, 0.6), new THREE.MeshStandardMaterial({ map: cartelTexto(['M' + (puertas.indexOf(z) + 1)], '#16191c', '#ffc61a'), emissive: 0xffffff, emissiveIntensity: 0.2 }), X0 + 0.02, ALTO_P + 0.6, z, g, false).rotation.y = Math.PI / 2;
    for (const [dy, c] of [[0.15, abierto ? 0x22ff55 : 0x113311], [-0.15, abierto ? 0x331111 : 0xff3030]])
      add(new THREE.SphereGeometry(0.07, 12, 12), new THREE.MeshStandardMaterial({ color: 0x111111, emissive: c, emissiveIntensity: 1.5 }), X0 + 0.05, 2.2 + dy, z + ANCHO / 2 + 0.45, g, false);
  }
  // pared del otro extremo (x1) con portón de despacho
  const zsF = [Z0, -1.8, 1.8, Z1];
  caja(0.3, ALTO, zsF[1] - zsF[0], muro, X1 + 0.75, ALTO / 2, (zsF[0] + zsF[1]) / 2);
  caja(0.3, ALTO, zsF[3] - zsF[2], muro, X1 + 0.75, ALTO / 2, (zsF[2] + zsF[3]) / 2);
  caja(0.3, ALTO - 4, 3.6, muro, X1 + 0.75, 4 + (ALTO - 4) / 2, 0);
  caja(0.06, 4, 3.6, mat(0xb9c2ca, 0.5, 0.4), X1 + 0.62, 2, 0);
  add(new THREE.PlaneGeometry(2.2, 0.5), new THREE.MeshStandardMaterial({ map: cartelTexto(['DESPACHO'], '#16191c', '#ffffff', '#ffc61a'), emissive: 0xffffff, emissiveIntensity: 0.2 }), X1 + 0.58, 4.4, 0, g, false).rotation.y = -Math.PI / 2;

  // ---- patio: segundo camión estacionado en el muelle 1 y demarcación
  if (G.camion) {
    const otro = G.camion.clone(true); otro.position.set(-1.2, 0, 3.9); otro.userData.id = 'camion2';
    otro.traverse((o) => { if (/^Remolque_/.test(o.name)) o.visible = true; if (/^Puerta_/.test(o.name)) o.rotation.y = 0; });
    g.add(otro);
  }
  const blanco = new THREE.MeshBasicMaterial({ color: 0xe8ecef });
  for (const z of [-5.85, -1.95, 1.95, 5.85]) add(new THREE.PlaneGeometry(14, 0.12), blanco, X0 - 8, -1.085, z, g, false).rotation.x = -Math.PI / 2;
  for (const z of [-3.9, 0, 3.9]) { const f = add(new THREE.PlaneGeometry(2.4, 0.5), new THREE.MeshBasicMaterial({ map: cartelTexto(['M' + (z / 3.9 + 2)], '#3b3c3f', '#ffc61a') }), X0 - 3, -1.084, z, g, false); f.rotation.set(-Math.PI / 2, 0, Math.PI / 2); }

  // ---- señalética en el piso: senda peatonal verde, zona de autoelevadores y flechas de flujo
  const piso = (w, d, m, x, z, rz = 0) => { const o = add(new THREE.PlaneGeometry(w, d), m, x, 0.012, z, g, false); o.rotation.set(-Math.PI / 2, 0, rz); return o; };
  const verde = new THREE.MeshStandardMaterial({ color: 0x2e9e5b, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -3 });
  piso(X1 - X0 - 1, 0.9, verde, (X0 + X1) / 2, -5.6);
  for (let x = X0 + 1; x < X1 - 1; x += 1.2) piso(0.5, 0.08, new THREE.MeshBasicMaterial({ color: 0xffffff }), x, -5.6);
  const zona = texturaRayas(); zona.repeat.set(8, 8);
  piso(2.6, 9.6, new THREE.MeshStandardMaterial({ map: zona, transparent: true, opacity: 0.55, polygonOffset: true, polygonOffsetFactor: -3 }), 9.6, 0);
  piso(3.2, 0.6, new THREE.MeshBasicMaterial({ map: cartelTexto(['ZONA AUTOELEVADOR'], '#ffc61a', '#16191c'), polygonOffset: true, polygonOffsetFactor: -4 }), 9.6, 4.6, -Math.PI / 2);
  const flecha = new THREE.MeshBasicMaterial({ map: texturaFlecha(), transparent: true, polygonOffset: true, polygonOffsetFactor: -3 });
  for (const x of [-7, -4, 3.5]) piso(0.9, 0.5, flecha, x, -0.95);

  // ---- carteles en columnas, matafuegos y barandas
  const cartelCol = (x, z, lineas, fondo, texto, borde) => {
    const o = add(new THREE.PlaneGeometry(0.9, 0.6), new THREE.MeshStandardMaterial({ map: cartelTexto(lineas, fondo, texto, borde), roughness: 0.6 }), x, 2.4, z + (z < 0 ? 0.17 : -0.17), g, false);
    if (z > 0) o.rotation.y = Math.PI;
  };
  cartelCol(xsCol[1], Z0 + 0.2, ['USO OBLIGATORIO', 'CASCO · CHALECO'], '#1f5fbf', '#ffffff');
  cartelCol(xsCol[3], Z0 + 0.2, ['PRECAUCIÓN', 'AUTOELEVADORES'], '#ffc61a', '#16191c', '#16191c');
  cartelCol(xsCol[4], Z0 + 0.2, ['SALIDA', 'DE EMERGENCIA →'], '#2e9e5b', '#ffffff');
  cartelCol(xsCol[2], Z1 - 0.2, ['ZONA DE', 'INSPECCIÓN 360°'], '#29a8e0', '#ffffff');
  for (const [x, z] of [[xsCol[1], Z1 - 0.2], [xsCol[3], Z1 - 0.2], [xsCol[4], Z0 + 0.2]]) {
    const s = z < 0 ? 1 : -1;
    add(new THREE.CylinderGeometry(0.08, 0.08, 0.5, 14), mat(0xd01f1f, 0.4, 0.3), x + 0.3, 0.75, z + s * 0.25);
    add(new THREE.PlaneGeometry(0.3, 0.3), new THREE.MeshStandardMaterial({ map: cartelTexto(['🧯'], '#d01f1f', '#ffffff') }), x + 0.3, 1.35, z + s * 0.17, g, false).rotation.y = z < 0 ? 0 : Math.PI;
  }
  const baranda = mat(AMARILLO, 0.45, 0.3);
  for (const [x0, x1, z] of [[8.3, 10.6, -4.9], [8.3, 10.6, 4.9]]) {
    caja(x1 - x0, 0.08, 0.08, baranda, (x0 + x1) / 2, 1.0, z); caja(x1 - x0, 0.08, 0.08, baranda, (x0 + x1) / 2, 0.5, z);
    for (let x = x0; x <= x1 + 0.01; x += (x1 - x0) / 2) caja(0.08, 1.05, 0.08, baranda, x, 0.52, z);
  }
  return g;
}

// ---------------------------------------------------------------- texturas de canvas
function texturaChapa() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64; const x = c.getContext('2d');
  const gr = x.createLinearGradient(0, 0, 32, 0); gr.addColorStop(0, '#c9d1d8'); gr.addColorStop(0.5, '#e4e9ed'); gr.addColorStop(1, '#bcc5cd');
  for (let i = 0; i < 8; i++) { x.save(); x.translate(i * 32, 0); x.fillStyle = gr; x.fillRect(0, 0, 32, 64); x.restore(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; return t;
}
function texturaRayas() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 64; const x = c.getContext('2d');
  x.fillStyle = '#ffc61a'; x.fillRect(0, 0, 64, 64); x.fillStyle = '#16191c';
  for (let i = -2; i < 4; i++) { x.beginPath(); x.moveTo(i * 32, 64); x.lineTo(i * 32 + 16, 64); x.lineTo(i * 32 + 80, 0); x.lineTo(i * 32 + 64, 0); x.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
function texturaFlecha() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 64; const x = c.getContext('2d');
  x.fillStyle = 'rgba(255,255,255,.9)'; x.beginPath(); x.moveTo(0, 20); x.lineTo(80, 20); x.lineTo(80, 4); x.lineTo(128, 32); x.lineTo(80, 60); x.lineTo(80, 44); x.lineTo(0, 44); x.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function cartelTexto(lineas, fondo, texto, borde = null) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256; const x = c.getContext('2d');
  x.fillStyle = fondo; x.fillRect(0, 0, 512, 256);
  if (borde) { x.strokeStyle = borde; x.lineWidth = 18; x.strokeRect(9, 9, 494, 238); }
  x.fillStyle = texto; x.textAlign = 'center'; x.textBaseline = 'middle';
  const n = lineas.length, tam = n === 1 ? 120 : 64;
  lineas.forEach((l, i) => { x.font = `800 ${i && n > 1 ? Math.round(tam * 0.62) : tam}px "Segoe UI", sans-serif`; x.fillText(l, 256, 128 + (i - (n - 1) / 2) * (tam * 1.05), 480); });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
