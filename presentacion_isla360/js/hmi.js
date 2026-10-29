// HMI local · Control de etiquetas en isla 360° (presentación facultad).
// Adaptado de simulacion-referencia/web/js/app.js (sección HMI: comandos,
// actualizarHMI, NOMBRE_PASO, alarma, log) + presentacion_3d/js/main.js
// (animar contadores, baliza). Sin AMR: descarga manual + plato de vidrio.
// Señales: C1/C2/C3 + S_ING/S_ZONA/ENC/S_EXT/S_RET/S_PASO/S_EXC con LEDs.
// API: { initHMI, actualizarHMI, log, exportarCSV, setAlarma }.
// Tono operario, rioplatense, sin insultos.
import { CFG } from './config.js';

const $ = (id) => document.getElementById(id);

const NOMBRE_PASO = CFG.pasos ?? {
  E0: 'ESPERANDO BULTO', E1: 'EN PLATO E IDENTIFICANDO', E2: 'REGISTRANDO',
  E3: 'DERIVANDO A REVISIÓN', E4: 'FINALIZANDO', E5: 'FALLA / INTERVENCIÓN REQUERIDA',
};
const NOMBRE_CORTO = {
  E0: 'Esperando caja', E1: 'Identificando (3 caras)', E2: 'Registrando',
  E3: 'Derivando a revisión', E4: 'Finalizando', E5: 'Falla / intervención',
};
const NOMBRE_CAM = {
  AUSENTE: 'Sin camión', LLEGANDO: 'Llegando a recepción', ABRIENDO: 'Abriendo puertas',
  MANIOBRA: 'Maniobra al punto de descarga', EN_POSICION: 'En posición de descarga',
  SALIENDO: 'Saliendo (vacío)',
};
// Prioridad del cartel de alarma por tipo.
const PRIO = { registro: 'ALTA', lectura: 'ALTA', desvio: 'ALTA', sobrecarga: 'ALTA', transporte: 'MEDIA', plato: 'ALTA' };

// Señales de campo (tab Señales) y de descarga (tab Descarga, sin AMR).
const IO_DEF = [
  ['S_ING', 'Ingreso de bulto'], ['S_ZONA', 'Presencia en plato'], ['ENC', 'Encoder'],
  ['TRIG', 'Disparo de cámaras'], ['M_ALIM', 'Marcha cinta'], ['M_PLATO', 'Marcha plato'],
  ['Y_VUVG', 'Electroválvula brazo'], ['S_EXT', 'Brazo extendido'], ['S_RET', 'Brazo en reposo'],
  ['S_PASO', 'Paso a desvío'], ['S_EXC', 'Desvío ocupado'], ['REG', 'Solicitud de registro'],
];
const IO_DESC_DEF = [
  ['S_CAMION', 'Camión en posición'], ['S_CARGA', 'Punto de descarga ocupado'],
  ['S_ACU', 'Acumulación llena'], ['M_ACU', 'Marcha acumulación'],
];
const LECTORES = (CFG.lectores ?? ['C1 Superior', 'C2 Inferior', 'C3 Lateral'])
  .map((t) => { const [id, ...r] = String(t).split(' '); return [id, r.join(' ') || id]; });

export const IDS = ['badgePaso', 'reloj', 'modo', 'bloqueo',
  'btnIniciar', 'btnDetener', 'btnReconocer', 'btnRearmar', 'btnResolver', 'btnCsv',
  'alarma', 'alarmaTipo', 'alarmaCausa', 'alarmaEstado',
  'dEstado', 'dResultado', 'dCodigo', 'dDesviador', 'dId', 'dRegistro', 'dRev',
  'kProc', 'kOK', 'kNR', 'kAl', 'kTasa', 'kCiclo', 'kMan', 'kExp',
  'dCamion', 'dCarga', 'dRobot', 'dAcu', 'dVacio', 'tabComp', 'kCam', 'kDesc', 'kRob',
  'io', 'ioAmr', 'lectores', 'tbHist'];

let S = null;
let CB = {};
const cache = {};

function set(id, txt, cls) {
  const el = $(id);
  if (!el) return;
  const k = txt + '|' + cls;
  if (cache[id] === k) return;
  cache[id] = k;
  el.textContent = txt;
  if (cls !== undefined) el.className = cls;
}

const fmtT = (t) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${(t % 60).toFixed(1).padStart(4, '0')}`;
const prom = (v) => v.reduce((s, x) => s + x, 0) / v.length;

const T0 = 10 * 3600; // 22/10/2026 10:00 hora local, como la referencia
function fechaHora(t) {
  const s = Math.floor(T0 + (t || 0)), p = (n) => String(n).padStart(2, '0');
  return `22/10/2026 ${p(Math.floor(s / 3600) % 24)}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}`;
}

const capAcu = () => S?.capAcu ?? 3;
const cajasAcu = () => (S?.cajas ?? []).filter((k) => k.modo === 'acu');
const enCamion = () => (S?.cajas ?? []).filter((k) => k.modo === 'camion');

function hayCamion() {
  if (S?.sig && 'S_CAMION' in S.sig) return !!S.sig.S_CAMION;
  if (S?.camion) return S.camion.estado === 'EN_POSICION';
  if (S?.cajas) return enCamion().length > 0;
  return null; // sin dato: no se exige
}

// ---------------- histórico ----------------
export function log(origen, evento, calidad = '—', clase = '', id = null) {
  const tb = $('tbHist');
  if (!tb) return;
  const tr = document.createElement('tr');
  if (clase) tr.className = clase;
  for (const v of [fechaHora(S?.t), id ?? S?.ciclo?.id ?? '—', origen, evento, calidad]) {
    const td = document.createElement('td');
    td.textContent = v;
    tr.appendChild(td);
  }
  tb.prepend(tr);
  while (tb.children.length > 300) tb.lastChild.remove();
}

export function exportarCSV() {
  const filas = [['Fecha y hora', 'ID del ciclo', 'Origen', 'Evento o dato', 'Calidad o validez']];
  $('tbHist')?.querySelectorAll('tr').forEach((tr) => {
    filas.push([...tr.children].map((td) => td.textContent));
  });
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = '﻿' + filas.map((f) => f.map(esc).join(';')).join('\r\n');
  try {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = 'historico-etiquetas.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  } catch { /* sin descarga en este contexto: igual se devuelve el texto */ }
  return csv;
}

// ---------------- alarma (E5: conserva contexto, inhibe movimientos) ----------------
export function setAlarma(tipo, titulo, causa, origen = 'PLC', ambito = 'estacion') {
  if (!S) return null;
  if (S.alarma) {
    if (!S.pendiente) S.pendiente = [tipo, titulo, causa, origen, ambito];
    return S.alarma;
  }
  S.alarma = { tipo, titulo, causa, ambito, reconocida: false, resuelta: false, t: S.t };
  if (S.kpi) S.kpi.al = (S.kpi.al ?? 0) + 1;
  // Inhibe movimientos pero conserva el contexto (ciclo, bulto en plato, registro).
  if (S.sig) { S.sig.M_ALIM = false; S.sig.M_PLATO = false; S.sig.M_INSP = false; S.sig.TRIG = false; S.sig.Y_VUVG = false; }
  log(origen, `${titulo}: ${causa} Se frenan ingresos y avance y se guarda el contexto para retomar.`, 'Alarma activa · prioridad alta.', 'alarma-f');
  irA('E5', 'falla');
  return S.alarma;
}

function irA(paso, fase) {
  S.paso = paso; S.fase = fase; S.faseT = 0; S.avisado = false;
}

function detenerAhora() {
  S.auto = false; S.stopReq = false;
  log('HMI', 'Detención completada: movimientos inhibidos, che.', 'Comando ejecutado.');
}

// ---------------- comandos (bloqueos que explican el porqué) ----------------
function bloquear(msg) {
  set('bloqueo', msg);
  log('HMI', `Comando rechazado: ${msg}`, 'Comando bloqueado.');
}

function cmdIniciar() {
  if (S.auto) return bloquear('Ya está en automático, no hace falta darle de nuevo.');
  if (S.alarma) return bloquear('Hay una falla activa: reconocela, resolvela en planta y rearmá antes de arrancar.');
  const cam = hayCamion();
  if (cam === false) return bloquear('No hay camión en posición de descarga: sin bultos no se puede arrancar.');
  if (S.sig && S.sig.S_RET === false) return bloquear('El brazo no está en reposo (S_RET): dejalo volver antes de arrancar.');
  if (S.sig?.S_ZONA && !S.ciclo) return bloquear('El plato está ocupado por un bulto sin procesar: sacalo primero.');
  S.auto = true; S.stopReq = false;
  set('bloqueo', '');
  log('HMI', 'Arranque en automático: plato libre, brazo en reposo y camión en posición. A laburar.', 'Comando aceptado.');
  CB.onIniciar?.(S);
}

function cmdDetener() {
  if (!S.auto) return bloquear('Ya está detenido, tranqui.');
  set('bloqueo', '');
  if (S.paso === 'E0' && (S.fase === 'espera' || !S.fase)) return detenerAhora();
  S.stopReq = true;
  log('HMI', 'Parada pedida: se termina el bulto en curso y después se frena todo.', 'Comando aceptado.');
  CB.onDetener?.(S);
}

function cmdReconocer() {
  const a = S.alarma;
  if (!a) return bloquear('No hay ninguna alarma activa para reconocer.');
  if (a.reconocida) return bloquear('Ya la reconociste: eso solo la silencia, no arregla la causa. Resolvela en planta.');
  a.reconocida = true;
  set('bloqueo', '');
  log('HMI', `Reconociste la alarma (${a.titulo}). Ojo: reconocer no alcanza, falta resolver y rearmar.`, 'Reconocimiento registrado.', 'alarma-f');
  CB.onReconocer?.(a, S);
}

function cmdResolver() {
  const a = S.alarma;
  if (!a || a.resuelta) return;
  let ok = true;
  if (CB.onResolver) ok = CB.onResolver(a, S) !== false;
  else log('Operario', 'Causa atendida en planta: se acomodó lo que frenaba y se verificaron las señales.', 'Intervención registrada.');
  if (!ok) return;
  a.resuelta = true;
  log('PLC', 'Vuelta a normal: señales coherentes. Falta el rearme para seguir.', 'Condición normalizada; requiere rearme.', 'alarma-f');
  actualizarHMI();
}

function cmdRearmar() {
  const a = S.alarma;
  if (!a) return bloquear('No hay ninguna falla para rearmar: el sistema ya está sano.');
  if (!a.reconocida) return bloquear('Primero reconocé la alarma: es el acuse de que la viste.');
  if (!a.resuelta) return bloquear('La causa sigue presente: resolvela en planta con el botón "Resolver causa" antes de rearmar.');
  if (S.sig && S.sig.S_RET === false) return bloquear('El brazo todavía no volvió a reposo (S_RET): esperá que confirme.');
  if (cajasAcu().length > capAcu()) return bloquear('La acumulación sigue pasada de bultos: dejá que el plato la vaya consumiendo.');
  set('bloqueo', '');
  S.alarma = null;
  log('HMI', 'Rearme aceptado: condiciones verificadas, se retoma.', 'Comando aceptado.', 'alarma-f');
  const c = S.ciclo;
  let destino = 'E0';
  if (CB.onRearmar) {
    destino = (c && c.registro === 'Confirmado') ? 'E4' : 'E0';
    CB.onRearmar(destino, a, S);
  } else if (c && c.registro === 'Confirmado') {
    destino = 'E4';
    irA('E4', 'evacuacion'); // E5 -> E4: el bulto sigue en el plato con registro confirmado
  } else {
    if (c) {
      if (S.kpi) { S.kpi.proc += 1; S.kpi.tiempos?.push(S.t - (c.tIni ?? S.t)); if (c.resultado === 'No Read') S.kpi.nr += 1; }
      log('PLC', 'Ciclo resuelto y documentado; el bulto queda en revisión manual. Plato libre.', 'Cierre por intervención.');
    }
    S.ciclo = null;
    S.lect = LECTORES.map(() => ({ estado: 'espera', txt: 'En espera' }));
    irA('E0', 'espera'); // E5 -> E0
    if (S.stopReq) detenerAhora();
  }
  if (S.pendiente) { const p = S.pendiente; S.pendiente = null; setAlarma(...p); }
  actualizarHMI();
}

// ---------------- refresco ----------------
export function actualizarHMI() {
  if (!S) return;
  const c = S.ciclo, sg = S.sig ?? {};
  set('reloj', fmtT(S.t ?? 0));
  set('badgePaso', `${S.paso ?? 'E0'} · ${NOMBRE_PASO[S.paso] ?? '—'}`, 'badge ' + String(S.paso ?? 'E0').toLowerCase());
  set('modo', S.auto ? (S.stopReq ? 'DETENIENDO' : 'AUTOMÁTICO') : 'DETENIDO', 'modo ' + (S.auto ? 'on' : 'off'));

  set('dEstado', S.fase === 'liberando' || S.fase === 'ingresando' ? 'Ingresando bulto' : (NOMBRE_CORTO[S.paso] ?? '—'), S.paso === 'E5' ? 'v-falla' : '');
  const r = c?.resultado ?? '—';
  set('dResultado', r, r === 'OK' ? 'v-ok' : r === 'No Read' ? 'v-nr' : r === '—' ? '' : 'v-falla');
  set('dCodigo', c?.codigo ?? '—', 'mono');
  const dsv = c?.desviador ?? (sg.S_RET ? 'En reposo' : 'Movimiento comandado');
  set('dDesviador', dsv, String(dsv).startsWith('Falla') ? 'v-falla' : dsv === 'En reposo' ? '' : 'v-nr');
  set('dId', c?.id ?? '—', 'mono');
  const reg = c?.registro ?? '—';
  set('dRegistro', reg, reg === 'Confirmado' ? 'v-ok' : reg === 'Incierto' ? 'v-falla' : reg === 'Pendiente' ? 'v-nr' : '');
  const enRev = (S.cajas ?? []).filter((k) => ['desvio', 'revision'].includes(k.modo)).length;
  const capRev = S.capRev ?? 6;
  const opTxt = S.operarioRev ? 'operario presente' : 'sin operario';
  set('dRev', `${enRev} en revisión · ${opTxt}`, enRev >= capRev ? 'v-falla' : enRev ? 'v-nr' : '');

  // Descarga manual + plato (sin AMR).
  const cam = S.camion;
  set('dCamion', cam ? `${cam.n ?? '—'} · ${NOMBRE_CAM[cam.estado] ?? cam.estado}` : (sg.S_CAMION ? 'En posición de descarga' : 'Sin camión'));
  const totCam = cam?.cargaIni ?? enCamion().length;
  set('dCarga', `${enCamion().length} / ${totCam || '—'}`, 'mono');
  const modoD = S.modoDescarga === 'manual' ? 'Manual' : 'Asistida';
  const plato = S.plato?.girando ? 'plato girando' : S.plato?.ocupado ? 'plato ocupado' : 'plato libre';
  set('dRobot', `${modoD} · ${S.operarioDescarga ?? 'operario en punto de descarga'} · ${plato}`, S.paso === 'E5' ? 'v-falla' : '');
  const nAcu = cajasAcu().length;
  set('dAcu', `${nAcu} / ${capAcu()}`, nAcu >= capAcu() ? 'v-nr mono' : 'mono');
  if ('VAC' in sg) set('dVacio', sg.VAC ? 'Activo · verificado' : 'Sin vacío', sg.VAC ? 'v-ok' : '');
  else set('dVacio', S.plato?.girando ? 'Girando 360°' : 'Detenido', S.plato?.girando ? 'v-nr' : '');

  // Cámaras C1/C2/C3.
  (S.lect ?? []).forEach((l, i) => {
    const el = $('lec' + i);
    if (el) el.className = 'lector ' + (l.estado === 'espera' ? '' : l.estado);
    set('lecT' + i, l.txt);
  });
  // LEDs de campo.
  for (const [n] of [...IO_DEF, ...IO_DESC_DEF]) {
    const v = sg[n];
    const led = $('led_' + n);
    if (!led) continue;
    const cls = 'led' + (n === 'ENC' ? (v > 0.005 ? ' on' : '') : v ? (['Y_VUVG', 'S_EXC', 'S_ACU'].includes(n) ? ' amb' : ' on') : '');
    if (led.className !== cls) led.className = cls;
    if (n === 'ENC') set('io_ENC', `Encoder ${(+v || 0).toFixed(2)} m/s${(S.encQuieto ?? 0) > 0.2 ? ' · detenido' : ''}`);
  }

  // Alarma con prioridad.
  const a = S.alarma;
  $('alarma')?.classList.toggle('oculto', !a);
  if (a) {
    set('alarmaTipo', a.titulo);
    set('alarmaCausa', a.causa);
    set('alarmaEstado', `${a.reconocida ? 'reconocida' : 'sin reconocer'} · ${a.resuelta ? 'causa resuelta' : 'causa presente'}`);
    const pri = $('alarma')?.querySelector('.pri');
    if (pri) pri.textContent = 'PRIORIDAD ' + (PRIO[a.tipo] ?? 'ALTA');
    if ($('btnResolver')) $('btnResolver').disabled = !!a.resuelta;
  }

  // KPIs + contadores.
  const k = S.kpi ?? {};
  set('kProc', String(k.proc ?? 0)); set('kOK', String(k.ok ?? 0));
  set('kNR', String(k.nr ?? 0)); set('kAl', String(k.al ?? 0));
  set('kTasa', k.proc ? `${((100 * (k.ok ?? 0)) / k.proc).toFixed(0)} %` : '—');
  set('kCiclo', k.tiempos?.length ? `${prom(k.tiempos).toFixed(1)} s` : '—');
  set('kMan', String(k.man ?? 0)); set('kExp', String(k.exp ?? 0));
  set('kCam', String(k.camiones ?? 0)); set('kDesc', String(k.descargados ?? 0));
  set('kRob', k.recogidas?.length ? `${prom(k.recogidas).toFixed(1)} s` : '—');
  if ($('kEnCurso')) set('kEnCurso', String((S.cajas ?? []).filter((x) => x.modo !== 'camion').length));
  pintarComparacion();

  // Botones: atenuados cuando el comando sería rechazado.
  $('btnIniciar')?.classList.toggle('bloq', !!S.auto || !!a);
  $('btnIniciar')?.classList.toggle('pulso', !S.auto && !a && (k.proc ?? 0) === 0);
  $('btnDetener')?.classList.toggle('bloq', !S.auto);
  $('btnReconocer')?.classList.toggle('bloq', !a || !!a.reconocida);
  $('btnRearmar')?.classList.toggle('bloq', !a || !a.reconocida || !a.resuelta);

  document.querySelectorAll('[data-paso]').forEach((el) => el.classList.toggle('activa', el.dataset.paso === S.paso));
}

function pintarComparacion() {
  const el = $('tabComp');
  if (!el) return;
  const filas = (S.comparacion ?? []).slice(0, 6)
    .map((x) => `<tr><td>${x.n}</td><td>${x.modo}</td><td class="num">${(+x.min).toFixed(1)}</td><td class="num">${(+x.bph).toFixed(0)}</td></tr>`).join('');
  el.innerHTML = '<thead><tr><th>Camión</th><th>Descargó</th><th class="num">min</th><th class="num">bultos/h</th></tr></thead><tbody>' +
    (filas || '<tr><td colspan="4">Todavía no se descargó ningún camión.</td></tr>') + '</tbody>';
}

// ---------------- init ----------------
export function initHMI(estado, callbacks = {}) {
  S = estado; CB = callbacks;
  const pintarIO = (def) => def.map(([n, d]) => `<div><span class="led" id="led_${n}"></span><span class="n">${n}</span><span class="d" id="io_${n}">${d}</span></div>`).join('');
  if ($('io')) $('io').innerHTML = pintarIO(IO_DEF);
  if ($('ioAmr')) $('ioAmr').innerHTML = pintarIO(IO_DESC_DEF);
  if ($('lectores')) $('lectores').innerHTML = LECTORES.map(([idL, d], i) => `<div class="lector" id="lec${i}"><b>${idL}</b> <small>${d}</small><small id="lecT${i}">En espera</small></div>`).join('');

  if ($('btnIniciar')) $('btnIniciar').onclick = cmdIniciar;
  if ($('btnDetener')) $('btnDetener').onclick = cmdDetener;
  if ($('btnReconocer')) $('btnReconocer').onclick = cmdReconocer;
  if ($('btnRearmar')) $('btnRearmar').onclick = cmdRearmar;
  if ($('btnResolver')) $('btnResolver').onclick = cmdResolver;
  if ($('btnCsv')) $('btnCsv').onclick = () => {
    exportarCSV();
    log('HMI', 'Histórico exportado a CSV para analizarlo en planilla.', 'Comando ejecutado.');
  };
  document.querySelectorAll('[role="tab"]').forEach((t) => {
    t.onclick = () => document.querySelectorAll('[role="tab"]').forEach((x) => {
      const on = x === t;
      x.setAttribute('aria-selected', String(on));
      const p = $(x.getAttribute('aria-controls'));
      if (p) p.hidden = !on;
    });
  });
  if ($('selModo')) {
    if (S.modoDescarga) $('selModo').value = S.modoDescarga;
    $('selModo').onchange = (e) => {
      S.modoDescarga = e.target.value;
      log('HMI', e.target.value === 'manual'
        ? 'Descarga manual: el operario baja los bultos a la cinta, de a una.'
        : 'Descarga asistida: se ayuda al operario en el punto de descarga.', 'Comando aceptado.');
    };
  }
  if ($('chkOperario')) {
    $('chkOperario').checked = !!S.operarioRev;
    $('chkOperario').onchange = (e) => { S.operarioRev = e.target.checked; };
  }
  actualizarHMI();
  return { actualizarHMI, log, exportarCSV, setAlarma };
}
