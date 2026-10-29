// Monitores 3D de la presentación facultad (IMPORTACIÓN · isla 360°).
// La isla solo lee el código de barras (OK / No Read, como en el TPI). Modos:
//   'espera'   · sin bulto en la isla
//   'leyendo'  · la etiqueta con el recuadro del código mientras se lee
//   'splash'   · pantallazo verde (OK + código) o rojo (No Read)
//   'etiqueta' · una columna por cámara (C1/C2/C3): la que tiene la etiqueta la muestra con el
//                recuadro del código; las otras, el cartón liso. Con ex.botones, los dos botones del
//                operario de revisión (lector de mano / etiqueta nueva).
import * as THREE from 'three';

// ---- helpers copiados del original (misma lógica de lectura)
const pct = (x) => Math.round(100 * x);
// ---- mosaico triple: una columna por cámara (mismo color que el cono FOV)
const CARAS = [
  { id: 'C1', nombre: 'SUPERIOR', color: '#4fc3ff' },
  { id: 'C2', nombre: 'INFERIOR', color: '#3ccf6e' },
  { id: 'C3', nombre: 'LATERAL', color: '#ffc61a' },
];

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
  const texto = (t, x, y, tam, col, peso = 700, al = 'center') => { g.fillStyle = col; g.font = `${peso} ${tam}px "Segoe UI", sans-serif`; g.textAlign = al; g.fillText(t, x, y); };
  const imagen = (k, x, y, w, h) => { const i = IMGS[k]; if (i && i.complete && i.naturalWidth) g.drawImage(i, x, y, w, h); };
  const marcoCodigo = (x0, y0, ancho, alto, col) => {                       // recuadro del código de barras sobre la etiqueta
    const [bx, by, bw, bh] = c.codigo.caja;
    g.strokeStyle = col; g.lineWidth = 2.5; g.strokeRect(x0 + (bx - 1.2) / 150 * ancho, y0 + (by - 1.2) / 110.49 * alto, (bw + 2.4) / 150 * ancho, (bh + 2.4) / 110.49 * alto);
  };
  const ok = c ? c.veredicto === 'OK' : false;
  if (modo === 'espera') { fondo('#101820'); g.fillStyle = '#29a8e0'; g.fillRect(0, 0, W, 5); g.fillStyle = '#ffc61a'; g.fillRect(0, Hh - 5, W, 5); texto('ISLA 360° · TRACEPACK', 256, 120, 26, '#8fd8ff'); texto('esperando bulto…', 256, 170, 24, '#5d6f7d', 500); }
  else if (modo === 'leyendo') {
    fondo('#12171c'); imagen(`${tipo}_alineada`, 14, 40, 300, 221); marcoCodigo(14, 40, 300, 221, '#9aa3ab');
    texto('LEYENDO…', 416, 140, 30, '#d5d9de'); texto('código de barras', 416, 172, 18, '#8a9199', 500); texto('C1 · C2 · C3', 416, 198, 16, '#8fd8ff', 600);
  }
  else if (modo === 'splash') {
    fondo(ok ? '#12714a' : '#b02f2f'); texto(ok ? 'OK' : 'NO READ', 256, 140, ok ? 110 : 76, '#fff', 800);
    texto(ok ? c.codigo.leido : 'sin código válido → revisión manual', 256, 200, 24, '#fff', 600);
    texto('Certeza de la adquisición ' + pct(c.confianza) + ' %', 256, 240, 18, '#e6f4ee', 500);
  }
  else {
    // ---- 'etiqueta': una columna por cámara; la que tiene la etiqueta la muestra con el recuadro del código
    fondo('#0b0f13');
    const colW = W / 3, CAB = 26, areaY = CAB + 4, areaH = ex.botones ? 178 : 210;
    CARAS.forEach((cara, i) => {
      const x = i * colW;
      g.fillStyle = cara.color; g.fillRect(x, 0, colW, 4);
      texto(`${cara.id} · ${cara.nombre}`, x + colW / 2, 20, 13, cara.color, 800);
      if (i) { g.strokeStyle = '#2a3138'; g.lineWidth = 1; g.beginPath(); g.moveTo(x + 0.5, 4); g.lineTo(x + 0.5, areaY + areaH); g.stroke(); }
      const ancho = Math.min(colW - 10, areaH * 1.3576), alto = ancho / 1.3576, x0 = x + (colW - ancho) / 2, y0 = areaY + (areaH - alto) / 2;
      const sinEtq = ex.cara != null && ex.cara !== i;
      if (sinEtq) { imagen('carton', x0, y0, ancho, alto); g.fillStyle = 'rgba(8,12,16,.55)'; g.fillRect(x0, y0, ancho, alto); texto('sin etiqueta', x + colW / 2, y0 + alto / 2 + 5, 13, '#c9d6e0', 700); }
      else {
        imagen(`${tipo}_alineada`, x0, y0, ancho, alto); marcoCodigo(x0, y0, ancho, alto, ok ? '#3ccf6e' : '#e0202e');
        if (ex.cara === i) { g.strokeStyle = cara.color; g.lineWidth = 2; g.strokeRect(x0 - 1, y0 - 1, ancho + 2, alto + 2); }
      }
      texto(sinEtq ? '—' : ok ? 'código leído' : 'no se decodifica', x + colW / 2, areaY + areaH - 2, 10, sinEtq ? '#5d656d' : ok ? '#3ccf6e' : '#ff8a8a', 600);
    });
    g.fillStyle = ok ? '#12714a' : '#b02f2f'; g.fillRect(0, Hh - (ex.botones ? 98 : 66), W, ex.botones ? 28 : 66);
    texto(ok ? 'OK · ' + c.codigo.leido : 'NO READ · revisión manual', 256, Hh - (ex.botones ? 78 : 24), 20, '#fff', 800);
    if (ex.botones) {
      const dec = ex.decision, boton = (cx, col, bien) => {
        g.globalAlpha = dec && dec !== (bien ? 'bien' : 'mal') ? 0.25 : 1; g.fillStyle = col; g.beginPath(); g.arc(cx, Hh - 38, 34, 0, 7); g.fill();
        g.strokeStyle = '#fff'; g.lineWidth = 6; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath();
        if (bien) { g.moveTo(cx - 15, Hh - 36); g.lineTo(cx - 4, Hh - 25); g.lineTo(cx + 16, Hh - 52); }
        else { g.strokeRect(cx - 17, Hh - 50, 34, 24); for (const dx of [-9, -3, 3, 9]) { g.moveTo(cx + dx, Hh - 45); g.lineTo(cx + dx, Hh - 31); } }
        g.stroke(); if (dec && dec === (bien ? 'bien' : 'mal')) { g.lineWidth = 5; g.beginPath(); g.arc(cx, Hh - 38, 41, 0, 7); g.stroke(); } g.globalAlpha = 1;
      };
      boton(150, '#12864f', true); boton(362, '#1676a8', false);
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
