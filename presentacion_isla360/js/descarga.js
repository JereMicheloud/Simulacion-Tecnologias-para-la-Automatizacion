// Descarga del camión con el AMR de dos brazos (hito H3 de TracePack).
// Portado de la simulación de referencia (web/js/app.js: camion, autorizacion,
// planificarRecogida, robot, ik). Coordenadas internas en el plano de Blender
// (x a lo largo de la línea, y lateral, z arriba); en three: (x, z, -y).
//
// El PLC autoriza una recogida solo si hay camión en posición, la operación está
// en automático, no hay alarma y la acumulación tiene lugar (menos de 3 bultos).
// Esperar por falta de lugar es una condición normal, no una alarma.
//
// Uso: initDescarga({ G, S, crearCaja, quitarCaja, tipo, log, BELT, H, LX }); en el bucle: tickDescarga(dt).

const P = { vAMR: 1.25, wAMR: 2.6, vCarro: 0.7, vCara: 0.55, tEntreCamiones: 8 };
const CAP_ACU = 3, X_PUNTO_CARGA = -8.45;
const X_AGARRE = 1.1, X_TRASLADO = 0.85, X_ESPERA = -11.0, X_DEP = X_PUNTO_CARGA - X_AGARRE;
const HOME = { x: -10.2, y: 0 };
const L1 = 0.45, L2 = 0.45, HOMBRO_X = 0.1, HOMBRO_Y = 0.22, CARRO_X = 0.4, SEP = 0.075, CABEZAL = 0.035;

const CAM = { estado: 'AUSENTE', t: 0, dx: -16, puertas: 0, n: 0, tLlegada: 0, cargaIni: 0 };
const R = { x: HOME.x, y: HOME.y, yaw: 0, carro: 0.95, cara: 0.7, vacio: false, vision: false, cola: [], paso: 'R0', motivo: '', caja: null, objetivo: null, tIni: 0 };
const PASOS_R = {
  R0: 'Esperando autorización', R1: 'Traslado al camión', R2: 'Visión 3D', R3: 'Agarre con ventosas',
  R4: 'Retiro y traslado', R5: 'Depósito en la cinta', R6: 'Regreso',
};
export const NOMBRE_CAM = { AUSENTE: 'Sin camión', LLEGANDO: 'Llegando al muelle', ABRIENDO: 'Abriendo puertas', MANIOBRA: 'Retrocediendo al nivelador', EN_POSICION: 'En posición de descarga', SALIENDO: 'Saliendo' };

let C = null;                       // contexto: { G, S, crearCaja, quitarCaja, tipo, log, BELT, H, LX }
const angDif = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const tarea = (...a) => R.cola.push(...a);
const enCamion = () => C.S.cajas.filter((k) => k.fase === 'enCamion');
// bultos esperando entrar a la isla (acumulación + alimentador): los que manda el AMR
export const enAcumulacion = () => C.S.cajas.filter((k) => k.fase === 'cinta' && !k.pasoIsla && !k.retorno && k.x < -0.9).length;

export function initDescarga(ctx) {
  C = ctx;
  C.S.camion = CAM; C.S.robot = R;
  C.S.sig ||= {};
  return { CAM, R };
}

// 3 filas × 4 columnas × 3 niveles; se retira de la puerta hacia adentro y de arriba hacia abajo
function generarCarga(n) {
  const { H, LX } = C, lista = [];
  [-12.95, -13.5, -14.05].forEach((x, fila) => [-0.6, -0.2, 0.2, 0.6].forEach((y, col) => {
    for (let nivel = 0; nivel < 3; nivel++) lista.push({ x, y, z: H / 2 + nivel * H + 0.002, fila, col, nivel });
  }));
  lista.sort((a, b) => a.fila - b.fila || b.nivel - a.nivel || a.col - b.col);
  lista.forEach((sl, i) => {
    const b = C.crearCaja(C.tipo(), C.S, { desdeCamion: false });
    Object.assign(b, { fase: 'enCamion', modo: 'camion', sl, orden: i, camionN: n, nro: i + 1, ry: 0 });
    colocarEnCamion(b);
  });
  return lista.length;
}
function colocarEnCamion(b) { b.x = b.sl.x + CAM.dx; b.y = b.sl.z; b.z = -b.sl.y; }

function camion(dt) {
  CAM.t += dt;
  const ir = (dest, v) => { const d = dest - CAM.dx; CAM.dx += Math.sign(d) * Math.min(Math.abs(d), v * dt); return Math.abs(dest - CAM.dx) < 1e-3; };
  switch (CAM.estado) {
    case 'AUSENTE':
      if (CAM.t > (CAM.n === 0 ? 0.3 : P.tEntreCamiones)) {
        CAM.n += 1; CAM.dx = CAM.n === 1 ? -3 : -16; CAM.puertas = 0; CAM.estado = 'LLEGANDO'; CAM.t = 0; CAM.tLlegada = C.S.t;
        CAM.cargaIni = generarCarga(CAM.n);
        C.log?.('Patio', `Llega el camión ${CAM.n} con ${CAM.cargaIni} bultos; se detiene antes del muelle y abre las puertas.`, 'Evento logístico.');
      }
      break;
    case 'LLEGANDO': if (ir(-3, Math.max(0.6, Math.abs(CAM.dx + 3) * 0.9))) { CAM.estado = 'ABRIENDO'; CAM.t = 0; } break;
    case 'ABRIENDO': CAM.puertas = Math.min(1, CAM.t / 2.0); if (CAM.puertas >= 1) { CAM.estado = 'MANIOBRA'; CAM.t = 0; } break;
    case 'MANIOBRA':
      if (ir(0, 0.9)) { CAM.estado = 'EN_POSICION'; CAM.t = 0; C.log?.('Sensor S_CAMION', `Camión ${CAM.n} en posición de descarga, con el nivelador apoyado.`, 'Señal digital válida.'); }
      break;
    case 'EN_POSICION':
      if (!enCamion().length && !R.objetivo && !R.cola.length) {
        C.S.camiones = (C.S.camiones || 0) + 1;
        C.log?.('PLC', `Camión ${CAM.n} descargado: ${CAM.cargaIni} bultos en ${((C.S.t - CAM.tLlegada) / 60).toFixed(1)} min. Se libera el muelle.`, 'Evento logístico.');
        CAM.estado = 'SALIENDO'; CAM.t = 0;
      }
      break;
    case 'SALIENDO':
      if (CAM.t < 1.2) ir(-2.5, 1.8);
      else if (CAM.puertas > 0) CAM.puertas = Math.max(0, CAM.puertas - dt / 1.6);
      else if (ir(-16, 3.5)) { CAM.estado = 'AUSENTE'; CAM.t = 0; }
      break;
  }
  for (const b of enCamion()) colocarEnCamion(b);
  C.S.sig.S_CAMION = CAM.estado === 'EN_POSICION';
}

function autorizacion() {
  const S = C.S;
  if (S.auto === false || S.stopReq) return 'operación automática no habilitada';
  if (S.alarma) return 'alarma activa';
  if (S.robotOn === false) return 'AMR deshabilitado por el operador';
  if (!S.sig.S_CAMION) return 'sin camión en posición de descarga';
  if (!enCamion().length) return 'camión vacío';
  if (enAcumulacion() >= CAP_ACU) return 'acumulación sin lugar (espera normal)';
  return '';
}

function planificarRecogida() {
  const k = enCamion().sort((a, b) => a.orden - b.orden)[0];
  R.objetivo = k; R.tIni = C.S.t;
  const sl = k.sl, hx = C.LX / 2, zCinta = C.BELT + C.H / 2;
  tarea(
    { t: 'paso', p: 'R1' }, { t: 'cara', v: 0.7 },
    { t: 'mover', x: X_ESPERA, y: sl.y }, { t: 'girar', yaw: Math.PI }, { t: 'carro', z: sl.z },
    { t: 'paso', p: 'R2' }, { t: 'vision', on: true }, { t: 'esperar', s: 0.7 }, { t: 'vision', on: false },
    { t: 'paso', p: 'R3' }, { t: 'cara', v: X_AGARRE - hx - 0.05 }, { t: 'mover', x: sl.x + X_AGARRE, y: sl.y },
    { t: 'cara', v: X_AGARRE - hx }, { t: 'fn', f: () => { R.vacio = true; } }, { t: 'esperar', s: 0.35 },
    { t: 'fn', f: () => { C.S.sig.AGARRE = true; k.fase = 'amr'; k.modo = 'amr'; R.caja = k; } },
    { t: 'paso', p: 'R4' }, { t: 'carro', z: sl.z + 0.02 }, { t: 'mover', x: X_ESPERA, y: sl.y, atras: true },
    { t: 'cara', v: X_TRASLADO - hx }, { t: 'carro', z: zCinta + 0.03 },
    { t: 'mover', x: X_DEP - 0.5, y: 0 }, { t: 'girar', yaw: 0 }, { t: 'mover', x: X_DEP, y: 0 },
    { t: 'cond', f: () => !C.S.sig.S_CARGA },
    { t: 'paso', p: 'R5' }, { t: 'cara', v: X_AGARRE - hx }, { t: 'carro', z: zCinta }, { t: 'fn', f: () => soltar(k) }, { t: 'cara', v: X_AGARRE - hx - 0.1 },
    { t: 'paso', p: 'R6' }, { t: 'mover', x: HOME.x, y: HOME.y, atras: true }, { t: 'cara', v: 0.7 }, { t: 'carro', z: 0.95 },
    { t: 'fn', f: () => { R.objetivo = null; } }, { t: 'paso', p: 'R0' },
  );
}
function soltar(k) {
  R.vacio = false; C.S.sig.AGARRE = false; R.caja = null;
  Object.assign(k, { fase: 'cinta', modo: 'acu', x: X_PUNTO_CARGA, y: C.BELT + C.H / 2, z: 0, ry: 0, rx: 0 });
  C.S.kpi && (C.S.kpi.descargados = (C.S.kpi.descargados || 0) + 1);
  C.alSoltar?.(k);
  C.log?.('AMR', `Bulto apoyado en el punto de carga y ventosas liberadas. Acumulación: ${enAcumulacion()}/${CAP_ACU}.`, 'Entrega confirmada por S_CARGA.');
}

function robot(dt) {
  if (C.S.alarma) return;                                    // detención coordinada: nada se mueve, el vacío se mantiene
  if (!R.cola.length) {
    R.motivo = autorizacion();
    if (!R.motivo) planificarRecogida();
    return;
  }
  const a = R.cola[0];
  let listo = false;
  switch (a.t) {
    case 'paso': R.paso = a.p; listo = true; break;
    case 'fn': R.cola.shift(); a.f(); return;
    case 'vision': R.vision = a.on; listo = true; break;
    case 'esperar': a.s -= dt; listo = a.s <= 0; break;
    case 'cond': listo = a.f(); break;
    case 'carro': { const d = a.z - R.carro; R.carro += Math.sign(d) * Math.min(Math.abs(d), P.vCarro * dt); listo = Math.abs(a.z - R.carro) < 1e-3; break; }
    case 'cara': { const d = a.v - R.cara; R.cara += Math.sign(d) * Math.min(Math.abs(d), P.vCara * dt); listo = Math.abs(a.v - R.cara) < 1e-3; break; }
    case 'girar': { const d = angDif(R.yaw, a.yaw); R.yaw += Math.sign(d) * Math.min(Math.abs(d), P.wAMR * dt); listo = Math.abs(d) < 1e-3; break; }
    case 'mover': {
      const dx = a.x - R.x, dy = a.y - R.y, dist = Math.hypot(dx, dy);
      if (dist < 1e-3) { listo = true; break; }
      const rumbo = Math.atan2(dy, dx) + (a.atras ? Math.PI : 0), dg = angDif(R.yaw, rumbo);
      if (dist > 0.05 && Math.abs(dg) > 1e-3) { R.yaw += Math.sign(dg) * Math.min(Math.abs(dg), P.wAMR * dt); break; }
      const v = Math.min(dist, P.vAMR * dt);
      R.x += (dx / dist) * v; R.y += (dy / dist) * v;
      break;
    }
  }
  if (listo) R.cola.shift();
}

function ik(tx, ty, s) {
  const d = Math.max(0.05, Math.min(Math.hypot(tx, ty), L1 + L2 - 1e-3));
  const e = Math.acos(Math.max(-1, Math.min(1, (d * d - L1 * L1 - L2 * L2) / (2 * L1 * L2))));
  const a = Math.atan2(ty, tx) + s * Math.atan2(L2 * Math.sin(e), L1 + L2 * Math.cos(e));
  const c = -s * e;
  return [a, c, -(a + c)];
}

export function tickDescarga(dt) {
  if (!C) return;
  const S = C.S;
  S.sig.S_CARGA = S.cajas.some((k) => k.fase === 'cinta' && Math.abs(k.x - X_PUNTO_CARGA) < C.LX);
  S.sig.S_ACU = enAcumulacion() >= CAP_ACU;
  S.sig.VAC = R.vacio;
  camion(dt);
  robot(dt);
  // el bulto que lleva el AMR va pegado a los cabezales
  if (R.caja) {
    const d = R.cara + C.LX / 2, k = R.caja;
    k.x = R.x + Math.cos(R.yaw) * d; k.z = -(R.y + Math.sin(R.yaw) * d); k.y = R.carro; k.ry = R.yaw - Math.PI; k.rx = 0;
  }
  S.operarioDescarga = `AMR ${R.paso} · ${PASOS_R[R.paso]}` + (R.paso === 'R0' && R.motivo ? ` (${R.motivo})` : '');
  // 3D
  const G = C.G;
  if (G.camion) G.camion.position.x = CAM.dx;
  if (G.puertas) { if (G.puertas[0]) G.puertas[0].rotation.y = CAM.puertas * 1.5 * Math.PI; if (G.puertas[1]) G.puertas[1].rotation.y = -CAM.puertas * 1.5 * Math.PI; }
  if (G.amr) {
    G.amr.position.set(R.x, 0, -R.y); G.amr.rotation.set(0, R.yaw, 0);
    if (G.carro) G.carro.position.y = R.carro;
    (G.brazo || []).forEach((js, i) => {
      const s = i === 0 ? 1 : -1, ang = ik(R.cara - CABEZAL - CARRO_X - HOMBRO_X, s * (SEP - HOMBRO_Y), s);
      js.forEach((j, n) => { if (j) j.rotation.set(0, ang[n], 0); });
    });
    if (G.amrFov) G.amrFov.visible = R.vision;
    for (const m of G.ventosas || []) if (m) { m.emissive.setHex(0x29a8e0); m.emissiveIntensity = R.vacio ? 4 : 0; }
    if (G.luzAmr) { const c = S.alarma ? 0xff2020 : R.cola.length ? 0x22ff55 : 0xffc61a; G.luzAmr.emissive.setHex(c); G.luzAmr.color.setHex(c); }
  }
}
