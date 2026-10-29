// Monitores 3D de la presentación facultad (IMPORTACIÓN · isla 360°).
// Replica crearMonitor / pintarMonitor / MON / monitorControl / monitoresStep de
// presentacion_3d/js/main.js (líneas 728-801). Modos 'espera', 'leyendo' y
// 'splash' idénticos al original; el modo 'etiqueta' es MOSAICO TRIPLE
// (una columna por cámara de la isla).
//
// Cableado (el módulo no toca globales de main.js directamente):
//   import { crearMonitor, pintarMonitor, MON, monitorControl, monitoresStep } from './monitores.js';
//   MON.escena = scene; MON.datos = datos; MON.IMG = IMG; MON.reloj = () => S.t;
//   const M1 = crearMonitor(xIsla, zIsla, yaw);   // pantalla del control, junto a la isla
//   const M2 = crearMonitor(xDesvio, zDesvio, yaw); // pantalla de la cinta de desvío
//   MON.M1 = M1;
// Cada función además acepta los globales (scene, datos, IMG, S, M1) como
// alternativa si existen, y pintarMonitor acepta ex.IMG para la prueba unitaria.
//
// Mosaico 'etiqueta' (canvas 1024×620, lógica 512×310 con setTransform ×2):
//   - Cabecera de 26px: 3 rótulos C1 SUPERIOR (azul #4fc3ff) · C2 INFERIOR
//     (verde #3ccf6e) · C3 LATERAL (ámbar #ffb020), con franja superior de 4px
//     en su color y separadores verticales.
//   - Área de fotos: la misma `${tipo}_alineada` en cada columna (o
//     ex.tipos[i] por cara), encajada con la proporción de la etiqueta
//     (150 × 110,49 mm → 1,3576) y centrada en su columna.
//   - Contornos de error solo con el borde (el campo se lee) + pastilla
//     numerada, filtrados por cara: cada error puede traer `cara` (1/2/3,
//     'C1'/'C2'/'C3', 'sup'/'inf'/'lat' o `camara`/`face`). Sin dato de cara
//     (casos.json de una sola etiqueta) el error se muestra en las 3 columnas
//     con su número global, igual que en el detalle HTML. Con ex.caras =
//     [c1, c2, c3] cada columna usa sus propios errores y su numeración local.
//   - Banda inferior de ancho completo OK (verde #12714a) / NO OK (rojo
//     #b02f2f) + 'precisión NN %' (geometría idéntica al original).
//   - Si ex.botones: tick verde / cruz roja idénticos al original
//     (M2, pantalla de revisión), con atenuado y anillo en ex.decision.
import * as THREE from 'three';

// ---- helpers copiados del original (misma lógica de lectura)
const pct = (x) => Math.round(100 * x);
const limpio = (t) => String(t || '').replace(/^[:; ]+|[.]+$/g, '');
const TIPO_DEFECTO = { tinta_de_mas: 'Tinta de más', tinta_faltante: 'Tinta faltante', linea_blanca: 'Línea blanca', linea_negra: 'Línea negra', linea_cortada: 'Línea cortada', marca_de_esquina: 'Marca de esquina' };
const solapan = (a, b) => a[0] < b[0] + b[2] && a[0] + a[2] > b[0] && a[1] < b[1] + b[3] && a[1] + a[3] > b[1];
/** Los errores de una lectura, en el orden en que se numeran sobre la etiqueta. */
function erroresDe(c) {
  const out = [];
  c.campos.filter((x) => x.estado !== 'OK').forEach((x) => out.push({ caja: x.caja, titulo: x.campo || 'Texto fijo de la plantilla', detalle: `ERP: ${x.esperado} · Leído: «${limpio(x.visto)}»`, pct: pct(x.certeza ?? 0), grave: x.estado === 'FALTA', cara: x.cara ?? x.camara ?? null }));
  if (c.barra && !c.barra.ok) (c.barra.lineas_blancas || []).forEach((l) => {
    const [bx, , bw] = c.barra.caja; out.push({ caja: [bx, l.caja[1] - 0.6, bw, Math.max(1.2, l.caja[3] + 1.2)], titulo: 'Línea blanca en la barra de control', detalle: `A ${l.y_mm.toFixed(0)} mm del borde de arriba: probable elemento del cabezal muerto`, pct: null, grave: true, cara: l.cara ?? c.barra.cara ?? null });
  });
  c.defectos.forEach((d) => {
    const caja = [d.x_mm, d.y_mm, d.ancho_mm, d.alto_mm];
    if (out.some((o) => solapan(o.caja, caja.map((v, i) => (i < 2 ? v - 1.5 : v + 3))))) return;
    const bar = c.barra && !c.barra.ok && d.tipo === 'linea_cortada';
    out.push({ caja, titulo: bar ? 'Línea blanca en la barra de control' : (TIPO_DEFECTO[d.tipo] || d.tipo), detalle: bar ? 'Probable elemento del cabezal muerto' : `${d.area_mm2.toFixed(2)} mm² en (${d.x_mm.toFixed(0)}; ${d.y_mm.toFixed(0)}) mm`, pct: null, grave: d.gravedad === 'NO_OK', cara: d.cara ?? d.camara ?? null });
  });
  return out;
}

// ---- mosaico triple: una columna por cámara (mismo color que el cono FOV)
const CARAS = [
  { id: 'C1', nombre: 'SUPERIOR', color: '#4fc3ff' },
  { id: 'C2', nombre: 'INFERIOR', color: '#3ccf6e' },
  { id: 'C3', nombre: 'LATERAL', color: '#ffc61a' },
];
function normCara(v) {
  if (v == null) return null;
  const s = String(v).trim().toUpperCase();
  if (s === '1' || s === 'C1' || s === 'SUP' || s === 'SUPERIOR') return 0;
  if (s === '2' || s === 'C2' || s === 'INF' || s === 'INFERIOR') return 1;
  if (s === '3' || s === 'C3' || s === 'LAT' || s === 'LATERAL') return 2;
  const n = Number(v); if (n === 1 || n === 2 || n === 3) return n - 1;
  return null;
}
const caraDe = (e) => normCara(e.cara ?? e.camara ?? e.face ?? null);

// ---- monitor físico: idéntico al original (base + mástil + marco + CanvasTexture 1024×620)
export function crearMonitor(x, z, yaw) {
  const escena = MON.escena ?? globalThis.scene ?? null;
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = yaw; if (escena) escena.add(g);
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

export function pintarMonitor(m, modo, c, tipo, ex = {}) {
  const g = m.ctx, W = 512, Hh = 310; g.setTransform(2, 0, 0, 2, 0, 0);
  const IMGS = ex.IMG ?? MON.IMG ?? globalThis.IMG ?? {};
  const fondo = (col) => { g.fillStyle = col; g.fillRect(0, 0, W, Hh); };
  const texto = (t, x, y, tam, col, peso = 700) => { g.fillStyle = col; g.font = `${peso} ${tam}px "Segoe UI", sans-serif`; g.textAlign = 'center'; g.fillText(t, x, y); };
  const imagen = (k, x, y, w, h) => { const i = IMGS[k]; if (i && i.complete && i.naturalWidth) g.drawImage(i, x, y, w, h); };
  if (modo === 'espera') { fondo('#101820'); g.fillStyle = '#29a8e0'; g.fillRect(0, 0, W, 5); g.fillStyle = '#ffc61a'; g.fillRect(0, Hh - 5, W, 5); texto('ISLA 360° · TRACEPACK', 256, 120, 26, '#8fd8ff'); texto('esperando bulto…', 256, 170, 24, '#5d6f7d', 500); }
  else if (modo === 'leyendo') {
    fondo('#12171c'); imagen(`${tipo}_alineada`, 14, 40, 300, 221);
    g.strokeStyle = '#9aa3ab'; g.lineWidth = 1; c.campos.forEach((x) => { const [a, b, w, h] = x.caja; g.strokeRect(14 + a / 150 * 300 - 1.5, 40 + b / 110.49 * 221 - 1.5, w / 150 * 300 + 3, h / 110.49 * 221 + 3); });
    texto('LEYENDO…', 416, 150, 30, '#d5d9de'); texto(c.campos.length + ' campos', 416, 185, 18, '#8a9199', 500); texto('envío ' + c.datos.caja, 416, 210, 16, '#8a9199', 500);
  }
  else if (modo === 'splash') { const ok = c.veredicto === 'OK'; fondo(ok ? '#12714a' : '#b02f2f'); texto(ok ? 'OK' : 'NO OK', 256, 150, 110, '#fff', 800); texto('Precisión de la lectura ' + pct(c.confianza) + ' %', 256, 215, 26, '#fff', 600); }
  else {
    // ---- modo 'etiqueta': mosaico triple C1/C2/C3
    const ok = c.veredicto === 'OK';
    const tipos = ex.tipos ?? [tipo, tipo, tipo];
    const porCara = ex.caras
      ? ex.caras.map((cc) => (cc ? erroresDe(cc) : []))
      : (() => { const todos = erroresDe(c); return [0, 1, 2].map((i) => todos.map((e, k) => ({ e, k })).filter(({ e }) => { const f = caraDe(e); return f == null || f === i; })); })();
    const global = !ex.caras;
    fondo('#0b0f13');
    const colW = W / 3, CAB = 26;
    const areaY = CAB + 4, areaH = ex.botones ? 178 : 210;
    // cabeceras con el color de cada cámara
    CARAS.forEach((cara, i) => {
      const x = i * colW;
      g.fillStyle = cara.color; g.fillRect(x, 0, colW, 4);
      texto(`${cara.id} · ${cara.nombre}`, x + colW / 2, 20, 13, cara.color, 800);
      if (i) { g.strokeStyle = '#2a3138'; g.lineWidth = 1; g.beginPath(); g.moveTo(x + 0.5, 4); g.lineTo(x + 0.5, areaY + areaH); g.stroke(); }
    });
    // cada columna: la alineada + solo los contornos de esa cara
    CARAS.forEach((cara, i) => {
      const x = i * colW;
      const lista = porCara[i] || [];
      const ancho = Math.min(colW - 10, areaH * 1.3576), alto = ancho / 1.3576;
      const x0 = x + (colW - ancho) / 2, y0 = areaY + (areaH - alto) / 2;
      const sinEtq = ex.cara != null && ex.cara !== i;                // esta cara del bulto no tiene etiqueta: se ve el cartón
      if (sinEtq) { imagen('carton', x0, y0, ancho, alto); g.fillStyle = 'rgba(8,12,16,.55)'; g.fillRect(x0, y0, ancho, alto); texto('sin etiqueta', x + colW / 2, y0 + alto / 2 + 5, 13, '#c9d6e0', 700); }
      else { imagen(`${tipos[i]}_alineada`, x0, y0, ancho, alto); if (ex.cara === i) { g.strokeStyle = cara.color; g.lineWidth = 2; g.strokeRect(x0 - 1, y0 - 1, ancho + 2, alto + 2); } }
      if (!sinEtq) lista.forEach((it, j) => {
        const e = global ? it.e : it, n = global ? it.k + 1 : j + 1;
        const [bx, by, bw, bh] = e.caja, px = x0 + bx / 150 * ancho, py = y0 + by / 110.49 * alto;
        g.strokeStyle = e.grave ? '#e0202e' : '#d9a31c'; g.lineWidth = 2; g.strokeRect(px - 3, py - 3, bw / 150 * ancho + 6, bh / 110.49 * alto + 6);
        g.fillStyle = e.grave ? '#e0202e' : '#d9a31c'; g.beginPath(); g.arc(px - 6, py - 12, 9, 0, 7); g.fill(); texto(String(n), px - 6, py - 8, 12, '#fff', 800);
      });
      const nErr = sinEtq ? 0 : lista.length;
      texto(nErr ? nErr + (nErr === 1 ? ' error' : ' errores') : 'sin errores', x + colW / 2, areaY + areaH - 2, 10, nErr ? cara.color : '#5d656d', 600);
    });
    // banda inferior de ancho completo + tick/cruz, geometría idéntica al original
    g.fillStyle = ok ? '#12714a' : '#b02f2f'; g.fillRect(0, Hh - (ex.botones ? 98 : 66), W, ex.botones ? 28 : 66);
    texto((ok ? 'OK' : 'NO OK') + ' · precisión ' + pct(c.confianza) + ' %', 256, Hh - (ex.botones ? 78 : 24), 22, '#fff', 800);
    if (ex.botones) {
      const dec = ex.decision, boton = (cx, col, bien) => {
        g.globalAlpha = dec && dec !== (bien ? 'bien' : 'mal') ? 0.25 : 1; g.fillStyle = col; g.beginPath(); g.arc(cx, Hh - 38, 34, 0, 7); g.fill();
        g.strokeStyle = '#fff'; g.lineWidth = 8; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath();
        if (bien) { g.moveTo(cx - 15, Hh - 36); g.lineTo(cx - 4, Hh - 25); g.lineTo(cx + 16, Hh - 52); } else { g.moveTo(cx - 14, Hh - 52); g.lineTo(cx + 14, Hh - 24); g.moveTo(cx + 14, Hh - 52); g.lineTo(cx - 14, Hh - 24); }
        g.stroke(); if (dec && dec === (bien ? 'bien' : 'mal')) { g.lineWidth = 5; g.beginPath(); g.arc(cx, Hh - 38, 41, 0, 7); g.stroke(); } g.globalAlpha = 1;
      };
      boton(150, '#12864f', true); boton(362, '#c0392b', false);
    }
  }
  m.tex.needsUpdate = true;
}

// ---- pantalla del control (M1, junto a la isla): misma API que el original (splash 1,5 s → etiqueta)
export const MON = { b: null, fase: '', t: 0, M1: null, datos: null, IMG: null, escena: null, reloj: null };
const ahora = () => { if (typeof MON.reloj === 'function') return MON.reloj(); const S = globalThis.S; return (S && typeof S.t === 'number') ? S.t : 0; };
export function monitorControl(b, fase) {
  MON.b = b; MON.fase = fase; MON.t = ahora();
  const D = MON.datos ?? globalThis.datos ?? null, ref = MON.M1 ?? globalThis.M1 ?? null;
  const c = D ? D[b.tipo] : null;
  if (ref && c) pintarMonitor(ref, fase, c, b.tipo, { ...(b.ex ?? {}), cara: b.cara ?? null });
}
export function monitoresStep() {
  if (MON.fase === 'splash' && ahora() - MON.t > 1.5) {
    MON.fase = 'etiqueta';
    const D = MON.datos ?? globalThis.datos ?? null, ref = MON.M1 ?? globalThis.M1 ?? null;
    if (ref && D && MON.b) pintarMonitor(ref, 'etiqueta', D[MON.b.tipo], MON.b.tipo, { ...(MON.b.ex ?? {}), cara: MON.b.cara ?? null });
  }
}
