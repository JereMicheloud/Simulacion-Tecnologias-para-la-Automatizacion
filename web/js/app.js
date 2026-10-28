// TracePack PLC - simulacion en vivo (TPI2026_G01_H3)
// H3: llega un camion, el AMR de dos brazos lo descarga a la zona de acumulacion (secciones 19-20).
// H2: la estacion identifica, registra o desvia cada bulto (secuencia E0-E5, seccion 12).
// Revision manual: un operario lee los No Read con un lector de mano y los manda por la cinta de retorno;
// la linea principal y el retorno terminan en el mismo colector hacia expedicion.
// Vista 3D: modelo exportado desde Blender (assets/tracepack_estacion.glb). Tiempos base: modelos FlexSim.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const $ = (id) => document.getElementById(id);
const B = (x, y, z) => new THREE.Vector3(x, z, -y); // Blender (Z arriba) -> three (Y arriba)

// ---------------- parametros ----------------
const PF = Object.fromEntries((window.FLEXSIM?.parametros || []).map((p) => [p.nombre, p.valor]));
const P = {
  tTransporte: PF.T_Transporte ?? 4,
  tLectura: PF.T_Lectura ?? 1.5,
  tRegistro: PF.T_Registro ?? 1.2,
  pctOK: PF.Pct_LecturaOK ?? 92,
  tMaxRegistro: 3, // tiempo maximo de confirmacion (ejemplo del historico 15.3.1)
  tMaxExt: 2, tMaxPaso: 3, tMaxRet: 2, tMaxLiberar: 8, // timeouts de confirmacion fisica
  tEntreCamiones: 12,
  vAMR: 0.9, wAMR: 1.8, // m/s, rad/s
};
const BELT_TOP = 0.8;
const X_SING = -4.6, X_SZONA = -0.12;
const CAP_ACU = 3, X_PUNTO_CARGA = -8.45;
const slotAcu = (i) => -5.75 - 0.55 * i; // posicion i de la acumulacion (con sobrecarga puede haber mas de 3)
const V_CINTA = 4.9 / (P.tTransporte - 0.6); // 0.6 s reservados a la detencion
const TILT = Math.atan2(0.22, 2.0);
// formatos de bulto (blender/crear_escena_tracepack.py, VARIANTES): largo X, ancho Y, alto Z, plantilla del GLB
const VARIANTES = {
  Estandar: [0.40, 0.30, 0.30, 'Bulto_Template'],
  Plana: [0.42, 0.32, 0.16, 'Bulto_Plana_Template'],
  Cubica: [0.32, 0.30, 0.32, 'Bulto_Cubica_Template'],
  Alta: [0.30, 0.26, 0.40, 'Bulto_Alta_Template'],
};
// AMR (blender/crear_descarga_amr.py): agarre por la cara frontal; gira solo fuera del camion
const X_AGARRE = 1.1, X_TRASLADO = 0.85, X_ESPERA = -11.0, X_DEP = X_PUNTO_CARGA - X_AGARRE;
const HOME = { x: -10.2, y: 0 };
const OBST = { x: -10.15, y: 0.0 }; // cono en el recorrido: el lidar frena la base a >= 0.2 m; el bulto va por encima (z > 0.83)
// revision manual y destino final
const OP = { x: 0.75, y: -3.95 }, BIN = { x: 0, y: -3.0 }, RET = { x0: 1.15, y: -3.1 };
// contenedor de revision: 4 lugares en el piso y 4 encima; lleno = S_EXC (no se desvia otro bulto)
const BIN_SLOTS = [[-0.24, -2.84], [0.24, -2.84], [-0.24, -3.26], [0.24, -3.26]], CAP_BIN = 8;
const OP_ACCESO = { x: 6.5, y: -4.75 }; // el operario de revision llega y se va por la senda peatonal
const COL = { x: 5.65, y0: -3.6, fin: 2.6 }, X_FIN_SALIDA = 4.85, X_FIN_RETORNO = 4.85;
const LECTORES = [['R1', 'Superior'], ['R2', 'Izquierdo'], ['R3', 'Derecho'], ['R4', 'Frontal'], ['R5', 'Posterior'], ['R6', 'Inferior']];
const NOMBRE_PASO = {
  E0: 'ESPERANDO BULTO', E1: 'POSICIONADO E IDENTIFICANDO', E2: 'REGISTRANDO',
  E3: 'DERIVANDO A EXCEPCIÓN', E4: 'FINALIZANDO', E5: 'FALLA / INTERVENCIÓN REQUERIDA',
};
const NOMBRE_R = {
  R0: 'Esperando autorización', R1: 'Traslado al camión', R2: 'Localización con visión 3D', R3: 'Aproximación y agarre',
  R4: 'Retiro y traslado', R5: 'Depósito en el punto de carga', R6: 'Retorno',
};

// ---------------- estado ----------------
const S = {
  t: 0, vel: 1, auto: false, stopReq: false,
  paso: 'E0', fase: 'espera', faseT: 0, avisado: false,
  nCiclo: 0, ciclo: null, alarma: null, pendiente: null,
  sig: {
    S_ING: false, S_ZONA: false, ENC: 0, S_EXT: false, S_RET: true, S_PASO: false, S_EXC: false, M_ALIM: false, M_INSP: false,
    Y_VUVG: false, TRIG: false, REG: false, S_CAMION: false, S_CARGA: false, S_ACU: false, M_ACU: false, VAC: false, AGARRE: false, LIDAR: false,
  },
  pusher: 0, atasco: false, encQuieto: 0,
  cajas: [], cajaCinta: null, cajaPaso: false,
  lect: LECTORES.map(() => ({ estado: 'espera', txt: 'En espera' })),
  kpi: { proc: 0, ok: 0, nr: 0, al: 0, tiempos: [], camiones: 0, descargados: 0, recogidas: [], man: 0, exp: 0 },
  forzar: 'auto', forzarRobot: 'normal', robotOn: true, modoDescarga: 'amr', // 'amr' (H3) | 'manual' (H2)
  operarioRev: false, sobreT: 0, // operario de revision manual presente; tiempo con la acumulacion excedida
  comparacion: [], // camiones descargados: { n, modo, min, bph }
  banda: { Alimentador: 0, Acumulacion: 0, Salida: 0, Retorno: 0, Colector: 0 }, // metros recorridos por cada cinta
};
const CAM = { estado: 'AUSENTE', t: 0, dx: -16, puertas: 0, n: 0, tLlegada: 0, cargaIni: 0 };
const R = {
  x: HOME.x, y: HOME.y, yaw: 0, carro: 0.95, cara: 0.7, vacio: false, vision: false,
  cola: [], paso: 'R0', motivo: '', caja: null, objetivo: null, tIni: 0, obst: false, agarreFalla: false, ultMotivo: '',
};
// operario de carga (H2, descarga manual asistida): referencia para comparar con el AMR
const OC = { x: -9.3, y: -1.4, yaw: Math.PI / 2, estado: 'espera', t: 0, caja: null, ruta: [], desde: null, brazos: 0, tIni: 0, fase: 0 };
const OC_VEL = 1.1, OC_TOMAR = 2.0, OC_DEJAR = 1.2, OC_PUESTO = { x: -8.25, y: -0.95 };
const OPE = { estado: 'ausente', x: OP_ACCESO.x, y: OP_ACCESO.y, ruta: [], fase: 0, t: 0, caja: null, yaw: Math.PI, yaw0: Math.PI, brazoI: 0, brazoD: 0, laser: false, desde: null, txt: 'Esperando bultos No Read' };

// ---------------- casos atipicos (interruptores del panel Escenarios) ----------------
// [id, titulo, descripcion, probabilidad por oportunidad (null = modo permanente mientras esta prendido)]
const CASOS_DEF = [
  ['sobrecarga', 'AMR acelerado → sobrecarga de la acumulación', 'El robot entrega 4× más rápido y S_ACU no frena las recogidas: se juntan más de 3 bultos y el PLC da alarma de sobrecarga.', null],
  ['cruzado', 'Bulto cruzado en la transferencia', 'El bulto gira y se traba entre el alimentador y la cinta de inspección: no llega a S_ZONA.', 0.35],
  ['trabaCarril', 'Bulto trabado en el carril de excepción', 'El No Read se atasca en los rodillos y no confirma S_PASO.', 0.5],
  ['etiquetas', 'Etiquetas dañadas', 'La lectura exitosa cae al 60 %: más No Read y el contenedor de revisión se llena antes.', null],
  ['erp', 'ERP sin respuesta', 'El registro de un bulto OK no se confirma dentro del tiempo máximo (E5).', 0.3],
  ['aire', 'Falta de aire comprimido', 'El cilindro no llega a extender: falta S_EXT al desviar un No Read.', 0.4],
  ['lectura', 'Lectura inválida', 'Se pierde la comunicación con un lector o dos lectores leen códigos distintos.', 0.2],
  ['obstaculo', 'Obstáculos en el recorrido del AMR', 'Aparece un objeto en el camino del robot: el lidar lo detiene con el bulto sujeto.', 0.3],
  ['agarre', 'Agarre inestable', 'Las ventosas no verifican el vacío y el robot reintenta antes de levantar.', 0.35],
];
const CASOS = Object.fromEntries(CASOS_DEF.map(([id]) => [id, false]));
const FORZADO = {}; // "Provocar": ocurre en la proxima oportunidad aunque el interruptor este apagado
function ocurre(id) {
  if (FORZADO[id]) { FORZADO[id] = false; return true; }
  const prob = CASOS_DEF.find((c) => c[0] === id)[3];
  return CASOS[id] && Math.random() < prob;
}

// ---------------- historico ----------------
const T0 = 10 * 3600; // 22/10/2026 10:00:00 UTC-03:00
function fechaHora(t) {
  const s = Math.floor(T0 + t), p = (n) => String(n).padStart(2, '0');
  return `22/10/2026 ${p(Math.floor(s / 3600) % 24)}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}`;
}
function log(origen, evento, calidad, clase = '', id = null) {
  const tr = document.createElement('tr');
  if (clase) tr.className = clase;
  for (const v of [fechaHora(S.t), id ?? S.ciclo?.id ?? '—', origen, evento, calidad]) {
    const td = document.createElement('td');
    td.textContent = v;
    tr.appendChild(td);
  }
  const tb = $('tbHist');
  tb.prepend(tr);
  while (tb.children.length > 300) tb.lastChild.remove();
}
const idBulto = (k) => (k ? `CAM${String(k.camion).padStart(2, '0')}-B${String(k.nro).padStart(2, '0')}` : '—');

// ---------------- alarmas ----------------
function activarAlarma(tipo, titulo, causa, origen, ambito = 'estacion') {
  if (S.alarma) { // una a la vez: la otra se presenta despues del rearme
    if (!S.pendiente) S.pendiente = [tipo, titulo, causa, origen, ambito];
    return;
  }
  S.alarma = { tipo, titulo, causa, ambito, reconocida: false, resuelta: false };
  S.kpi.al += 1;
  if (ambito === 'amr') {
    log(origen, `${titulo}: ${causa} Detención coordinada del AMR y de la cinta de acumulación; se bloquean nuevas recogidas y se conserva la sujeción.`, 'Alarma activa · prioridad alta.', 'alarma-f', idBulto(R.caja));
    return;
  }
  if (ambito === 'acu') {
    log(origen, `${titulo}: ${causa} Se detiene el AMR (conserva la sujeción) y se inhiben nuevas recogidas; la estación sigue consumiendo la acumulación.`, 'Alarma activa · prioridad alta.', 'alarma-f', '—');
    return;
  }
  S.sig.M_ALIM = S.sig.M_INSP = false;
  if (!S.atasco) S.sig.Y_VUVG = false;
  S.sig.TRIG = false;
  log(origen, `${titulo}: ${causa} Activación de alarma; se bloquea la continuidad y se conserva el contexto.`, 'Alarma activa · prioridad alta.', 'alarma-f');
  irA('E5', 'falla');
}
const alarmaAMR = () => S.alarma?.ambito === 'amr';

// ---------------- secuencia de la estacion (E0-E5) ----------------
function irA(paso, fase) {
  S.paso = paso; S.fase = fase; S.faseT = 0; S.avisado = false;
}
function sortearResultado() {
  if (S.forzar !== 'auto') { // el forzado (demo) aplica a un solo bulto
    const f = S.forzar;
    S.forzar = 'auto';
    return f;
  }
  for (const [id, res] of [['lectura', Math.random() < 0.5 ? 'COMUNIC' : 'CONTRA'], ['erp', 'FALLA_REG'], ['aire', 'FALLA_DESV']]) {
    if (FORZADO[id]) { FORZADO[id] = false; return res; } // "Provocar": el proximo bulto
  }
  if (ocurre('lectura')) return Math.random() < 0.5 ? 'COMUNIC' : 'CONTRA';
  const pct = CASOS.etiquetas ? Math.min(P.pctOK, 60) : P.pctOK;
  if (Math.random() * 100 < pct) return ocurre('erp') ? 'FALLA_REG' : 'OK';
  return ocurre('aire') ? 'FALLA_DESV' : 'NOREAD';
}
const codigoEAN = () => '779' + String(Math.floor(Math.random() * 1e10)).padStart(10, '0');
const cajasAcu = () => S.cajas.filter((k) => k.modo === 'acu').sort((a, b) => b.x - a.x);

function crearCiclo() { // S_ING detecta el bulto liberado por la acumulacion
  const res = sortearResultado();
  S.nCiclo += 1;
  S.ciclo = {
    id: `TP01-${String(S.nCiclo).padStart(4, '0')}`, res, tIni: S.t,
    codigo: null, resultado: null, registro: '—', desviador: 'En reposo',
    codigoB: res === 'CONTRA' ? codigoEAN() : null,
  };
  S.ciclo.codigoReal = res === 'NOREAD' || res === 'FALLA_DESV' ? null : codigoEAN();
  S.cajaCinta.idCiclo = S.ciclo.id;
  S.cajaCinta.cruzar = ocurre('cruzado');
  if (S.ciclo.codigoReal === null) etiquetaVisible(S.cajaCinta, false); // etiqueta ilegible o tapada
  S.lect = LECTORES.map(() => ({ estado: 'espera', txt: 'En espera' }));
  log('Sensor S_ING', `Ingreso detectado (bulto ${idBulto(S.cajaCinta)}, formato ${S.cajaCinta.variante.toLowerCase()}). Se crea el ID ${S.ciclo.id} e inicia el seguimiento.`, 'Señal digital válida.');
  irA('E1', 'transporte');
}

function prepararLecturas() {
  const c = S.ciclo, r = c.res;
  const conCodigo = new Set();
  if (r === 'OK' || r === 'FALLA_REG' || r === 'COMUNIC') {
    const orden = [0, 1, 2, 3, 4, 5].sort(() => Math.random() - 0.5);
    orden.slice(0, 1 + Math.floor(Math.random() * 3)).forEach((i) => conCodigo.add(i));
    if (r === 'COMUNIC') conCodigo.delete(2);
  }
  S.lecturaPlan = LECTORES.map((_, i) => {
    const tFin = 0.25 + Math.random() * (P.tLectura - 0.35);
    if (r === 'COMUNIC' && i === 2) return { tFin: Infinity, estado: 'error', txt: 'Sin respuesta' };
    if (r === 'CONTRA' && i === 0) return { tFin, estado: 'codigo', txt: c.codigoReal };
    if (r === 'CONTRA' && i === 3) return { tFin, estado: 'codigo', txt: c.codigoB };
    if (conCodigo.has(i)) return { tFin, estado: 'codigo', txt: c.codigoReal };
    return { tFin, estado: 'sincodigo', txt: 'Sin código (adq. OK)' };
  });
  S.lect = LECTORES.map(() => ({ estado: 'leyendo', txt: 'Adquiriendo…' }));
}

function cerrarCiclo(detalle) {
  const c = S.ciclo;
  S.kpi.proc += 1;
  S.kpi.tiempos.push(S.t - c.tIni);
  log('PLC y sensor de estación', `${detalle} Estación libre y desviador en reposo. Cierre del ciclo.`, 'Finalización confirmada.');
  S.ciclo = null;
  S.lect = LECTORES.map(() => ({ estado: 'espera', txt: 'En espera' }));
  irA('E0', 'espera');
  if (S.stopReq) detenerAhora();
}

function detenerAhora() {
  S.auto = false; S.stopReq = false;
  log('Interfaz de operación', 'Detención controlada completada: movimientos inhibidos.', 'Comando ejecutado.');
}

function paso(dt) {
  S.faseT += dt;
  const c = S.ciclo, sg = S.sig;
  switch (S.fase) {
    case 'espera': { // E0: la acumulacion libera el bulto de adelante hacia el alimentador
      sg.M_ALIM = sg.M_INSP = false;
      const frente = cajasAcu()[0];
      if (S.auto && S.alarma?.ambito !== 'estacion' && !S.stopReq && frente && Math.abs(frente.x - slotAcu(0)) < 0.01 && S.faseT >= 0.6) {
        frente.modo = 'cinta';
        S.cajaCinta = frente;
        S.fase = 'liberando'; S.faseT = 0;
      }
      break;
    }
    case 'liberando': // E0: transferencia acumulacion -> alimentador hasta S_ING
      sg.M_ALIM = true;
      if (sg.S_ING) crearCiclo();
      break;

    case 'transporte': { // E1: llevar el bulto a S_ZONA
      sg.M_ALIM = sg.M_INSP = true;
      if (S.cajaCinta.x >= 0) {
        S.cajaCinta.x = 0;
        sg.M_ALIM = sg.M_INSP = false;
        log('Sensor S_ZONA', 'Llegada a la estación confirmada. Alimentador inhibido y parada de la cinta solicitada.', 'Señal digital válida.');
        irA('E1', 'parada');
      } else if (S.faseT > P.tTransporte + 3) {
        if (S.cajaCinta.trabado) activarAlarma('atasco', 'Falla de posicionamiento', 'S_ZONA no confirmó la llegada dentro del tiempo máximo: bulto cruzado y trabado en la transferencia alimentador → cinta de inspección.', 'PLC');
        else activarAlarma('lectura', 'Falla de posicionamiento', 'S_ZONA no confirmó la llegada del bulto.', 'PLC');
      }
      break;
    }
    case 'parada': // E1: el encoder confirma la detencion
      if (S.encQuieto > 0.2) {
        log('Encoder', 'Detención del transporte confirmada (0 pulsos). Disparo de R1–R6 e inicio de la ventana de lectura.', 'Medida válida.');
        prepararLecturas();
        sg.TRIG = true;
        irA('E1', 'lectura');
      } else if (S.faseT > 2) {
        activarAlarma('lectura', 'Falta de detención', 'El encoder no confirmó la parada de la cinta.', 'Encoder');
      }
      break;

    case 'lectura': { // E1: adquisicion multidireccional
      S.lecturaPlan.forEach((pl, i) => { if (S.faseT >= pl.tFin) S.lect[i] = { estado: pl.estado, txt: pl.txt }; });
      if (S.faseT < P.tLectura) break;
      sg.TRIG = false;
      const r = c.res;
      if (r === 'COMUNIC') {
        S.lect[2] = { estado: 'error', txt: 'Sin respuesta' };
        c.resultado = 'No disponible';
        activarAlarma('lectura', 'Alarma de comunicación', 'Pérdida de comunicación con R3 durante la adquisición. No se trata como No Read.', 'PLC y lectores');
      } else if (r === 'CONTRA') {
        c.resultado = 'Inválido';
        activarAlarma('lectura', 'Resultados contradictorios', `R1 leyó ${c.codigoReal} y R4 leyó ${c.codigoB}. No se trata como No Read.`, 'PLC y lectores');
      } else if (r === 'OK' || r === 'FALLA_REG') {
        const vistas = LECTORES.filter((_, i) => S.lect[i].estado === 'codigo').map((l) => l[0]).join(', ');
        c.resultado = 'OK'; c.codigo = c.codigoReal; c.registro = 'Pendiente';
        log('PLC y lectores', `Código ${c.codigo} identificado (${vistas}; lecturas repetidas consolidadas). Resultado OK. Solicitud de registro enviada.`, 'Lectura válida; registro pendiente.', 'ok-f');
        sg.REG = true;
        irA('E2', 'registro');
      } else {
        c.resultado = 'No Read';
        log('PLC y lectores', 'Adquisición finalizada sin código. Resultado No Read. Evento de excepción registrado.', 'Resultado válido; código no leído.', 'evento-f');
        irA('E3', 'interbloqueo');
      }
      break;
    }
    case 'registro': // E2: bulto retenido hasta la confirmacion del ERP para el mismo ID
      if (c.res === 'FALLA_REG') {
        if (S.faseT >= P.tMaxRegistro) {
          c.registro = 'Incierto'; sg.REG = false;
          activarAlarma('registro', 'Alarma de registro', `Venció el tiempo de espera (${P.tMaxRegistro} s) sin confirmación. Bulto retenido; código conservado.`, 'PLC');
        }
      } else if (S.faseT >= P.tRegistro) {
        c.registro = 'Confirmado'; sg.REG = false;
        log('Servicio de integración', `Confirmación de registro recibida para ${c.id}.`, 'Registro confirmado.', 'ok-f');
        irA('E4', 'evacuacion');
      }
      break;

    case 'interbloqueo': // E3: el desvio solo se habilita con bulto presente, cinta detenida, S_RET y zona libre
      if (sg.S_EXC) {
        if (!S.avisado) { log('Sensor S_EXC', 'Contenedor de revisión lleno u ocupado: el desvío espera a que el operario lo vacíe.', 'Condición de espera.'); S.avisado = true; }
        break;
      }
      if (sg.S_ZONA && S.encQuieto > 0.2 && sg.S_RET) {
        sg.Y_VUVG = true; c.desviador = 'Movimiento comandado';
        S.atasco = c.res === 'FALLA_DESV';
        irA('E3', 'extension');
      }
      break;
    case 'extension':
      if (sg.S_EXT) {
        c.desviador = 'Posición confirmada';
        log('Sensor S_EXT', 'Extensión del cilindro confirmada; bulto empujado al carril de excepción.', 'Confirmación física válida.');
        irA('E3', 'paso');
      } else if (S.faseT > P.tMaxExt) {
        c.desviador = 'Falla de posicionamiento';
        activarAlarma('desvio', 'Alarma de desvío', `Falta confirmación de extensión (S_EXT) dentro de ${P.tMaxExt} s.`, 'PLC');
      }
      break;
    case 'paso':
      if (S.cajaPaso) {
        S.cajaPaso = false;
        sg.Y_VUVG = false; c.desviador = 'Retorno comandado';
        log('Sensor S_PASO', 'Paso del bulto al carril de excepción confirmado. Retracción del cilindro.', 'Confirmación física válida.');
        irA('E3', 'retorno');
      } else if (S.faseT > P.tMaxPaso) {
        activarAlarma('desvio', 'Alarma de desvío', 'Falta confirmación de paso del bulto (S_PASO).', 'PLC');
      }
      break;
    case 'retorno':
      if (sg.S_RET) {
        c.desviador = 'En reposo';
        log('Sensor S_RET', 'Retorno del desviador a reposo confirmado.', 'Confirmación física válida.');
        irA('E4', 'cierreDesvio');
      } else if (S.faseT > P.tMaxRet) {
        c.desviador = 'Falla de posicionamiento';
        activarAlarma('desvio', 'Alarma de desvío', 'Falta confirmación de retorno a reposo (S_RET).', 'PLC');
      }
      break;

    case 'evacuacion': // E4 con registro confirmado: evacuar por la linea principal
      sg.M_INSP = true; sg.M_ALIM = false;
      if (!S.cajaCinta || S.cajaCinta.x > 1.25) {
        sg.M_INSP = false;
        S.kpi.ok += 1;
        S.cajaCinta = null;
        cerrarCiclo(`Salida del bulto ${c.codigo} por la línea principal hacia expedición.`);
      } else if (S.faseT > P.tMaxLiberar) {
        activarAlarma('liberar', 'Falla de liberación', 'La estación no quedó libre dentro del tiempo máximo.', 'PLC');
      }
      break;
    case 'cierreDesvio': // E4 tras desvio
      if (!sg.S_ZONA && sg.S_RET) {
        S.kpi.nr += 1;
        cerrarCiclo('Paso al carril de excepción y retorno del desviador confirmados. El bulto queda en revisión manual.');
      }
      break;
    case 'falla': // E5
      sg.M_ALIM = sg.M_INSP = false;
      break;
  }
}

// ---------------- camion ----------------
function generarCarga(n) { // 3 filas x 4 columnas x 3 bultos apilados con su altura real; orden de retiro
  const lista = [];
  [-13.0, -13.45, -13.9].forEach((x, fila) => [-0.6, -0.2, 0.2, 0.6].forEach((y, col) => {
    let z = 0;
    for (let nivel = 0; nivel < 3; nivel++) {
      const v = Object.keys(VARIANTES)[Math.floor(Math.random() * 4)];
      const h = VARIANTES[v][2];
      lista.push({ x, y, z: z + h / 2, fila, col, nivel, v });
      z += h;
    }
  }));
  lista.sort((a, b) => a.fila - b.fila || b.nivel - a.nivel || a.col - b.col);
  lista.forEach((sl, i) => {
    const k = crearCaja(sl.v);
    Object.assign(k, { modo: 'camion', sl, orden: i, camion: n, nro: i + 1, x: sl.x, y: sl.y, z: sl.z });
  });
  return lista.length;
}
function camion(dt) {
  CAM.t += dt;
  const ir = (dest, v) => { const d = dest - CAM.dx; CAM.dx += Math.sign(d) * Math.min(Math.abs(d), v * dt); return Math.abs(dest - CAM.dx) < 1e-3; };
  switch (CAM.estado) {
    case 'AUSENTE':
      if (CAM.t > (CAM.n === 0 ? 0.5 : P.tEntreCamiones)) {
        CAM.n += 1; CAM.dx = -16; CAM.puertas = 0; CAM.estado = 'LLEGANDO'; CAM.t = 0; CAM.tLlegada = S.t;
        CAM.cargaIni = generarCarga(CAM.n);
        CAM.agentes = new Set();
        log('Patio', `Llega el camión ${CAM.n} con ${CAM.cargaIni} bultos de 4 formatos; se detiene antes del muelle y abre las puertas.`, 'Evento logístico.', '', `CAM${String(CAM.n).padStart(2, '0')}`);
      }
      break;
    case 'LLEGANDO': if (ir(-3, Math.max(0.6, Math.abs(CAM.dx + 3) * 0.9))) { CAM.estado = 'ABRIENDO'; CAM.t = 0; } break;
    case 'ABRIENDO': CAM.puertas = Math.min(1, CAM.t / 2.5); if (CAM.puertas >= 1) { CAM.estado = 'MANIOBRA'; CAM.t = 0; } break;
    case 'MANIOBRA':
      if (ir(0, 0.8)) {
        CAM.estado = 'EN_POSICION'; CAM.t = 0;
        log('Sensor S_CAMION', `Camión ${CAM.n} en posición de descarga, con el nivelador apoyado.`, 'Señal digital válida.', '', `CAM${String(CAM.n).padStart(2, '0')}`);
      }
      break;
    case 'EN_POSICION':
      if (!S.cajas.some((k) => k.modo === 'camion') && !R.objetivo && R.x > X_ESPERA + 0.01 && !OC.caja && OC.x > X_ESPERA) {
        S.kpi.camiones += 1;
        const min = (S.t - CAM.tLlegada) / 60;
        S.comparacion.unshift({ n: CAM.n, modo: CAM.agentes.size > 1 ? 'Mixto' : CAM.agentes.has('Manual') ? 'Manual (H2)' : 'AMR (H3)', min, bph: CAM.cargaIni / min * 60 });
        log('PLC', `Camión ${CAM.n} descargado: ${CAM.cargaIni} bultos en ${((S.t - CAM.tLlegada) / 60).toFixed(1)} min. Se libera el muelle.`, 'Evento logístico.', '', `CAM${String(CAM.n).padStart(2, '0')}`);
        CAM.estado = 'SALIENDO'; CAM.t = 0;
      }
      break;
    case 'SALIENDO':
      if (CAM.t < 1.5) ir(-2.5, 1.8);
      else if (CAM.puertas > 0) CAM.puertas = Math.max(0, CAM.puertas - dt / 2);
      else if (ir(-16, 3)) { CAM.estado = 'AUSENTE'; CAM.t = 0; }
      break;
  }
  S.sig.S_CAMION = CAM.estado === 'EN_POSICION';
}

// ---------------- AMR: autorizacion del PLC + planificador de movimientos ----------------
const angDif = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
function tarea(...acciones) { R.cola.push(...acciones); }

function autorizacion() { // seccion 20: el PLC autoriza una nueva recogida
  if (!S.auto || S.stopReq) return 'operación automática no habilitada';
  if (S.alarma) return 'alarma activa';
  if (!S.sig.S_CAMION) return 'sin camión en posición de descarga';
  if (!S.cajas.some((k) => k.modo === 'camion')) return 'camión vacío';
  if (!CASOS.sobrecarga && cajasAcu().length >= CAP_ACU) return 'zona de acumulación sin capacidad (espera normal)'; // con el caso de sobrecarga S_ACU no frena
  return '';
}

function planificarRecogida() {
  const k = S.cajas.filter((c) => c.modo === 'camion').sort((a, b) => a.orden - b.orden)[0];
  R.objetivo = k; R.tIni = S.t;
  CAM.agentes.add('AMR');
  R.agarreFalla = S.forzarRobot === 'AGARRE' || ocurre('agarre');
  const obstaculo = S.forzarRobot === 'OBSTACULO' || ocurre('obstaculo');
  S.forzarRobot = 'normal';
  const sl = k.sl, zCinta = BELT_TOP + k.h / 2;
  log('PLC', `Recogida autorizada para ${idBulto(k)}: camión en posición, operación habilitada, capacidad en acumulación (${cajasAcu().length}/${CAP_ACU}).`, 'Autorización válida.', '', idBulto(k));
  tarea(
    { t: 'paso', p: 'R1' }, { t: 'cara', v: 0.7 },
    { t: 'mover', x: X_ESPERA, y: sl.y }, { t: 'girar', yaw: Math.PI }, { t: 'carro', z: sl.z }, // gira fuera del camion
    { t: 'paso', p: 'R2' }, { t: 'vision', on: true }, { t: 'esperar', s: 1.0 }, { t: 'vision', on: false },
    { t: 'fn', f: () => log('Visión 3D', `Bulto ${k.variante.toLowerCase()} localizado (fila ${sl.fila + 1}, nivel ${sl.nivel + 1}); cara frontal accesible para los dos cabezales.`, 'Dato válido.', '', idBulto(k)) },
    { t: 'paso', p: 'R3' }, { t: 'cara', v: X_AGARRE - k.hx - 0.05 }, { t: 'mover', x: sl.x + X_AGARRE, y: sl.y }, ...agarre(k),
    { t: 'paso', p: 'R4' }, { t: 'carro', z: sl.z + 0.02 }, { t: 'mover', x: X_ESPERA, y: sl.y, atras: true },
    { t: 'cara', v: X_TRASLADO - k.hx }, { t: 'carro', z: zCinta + 0.03 }, // bulto recogido cerca del cuerpo antes de girar
    ...(obstaculo ? [{ t: 'fn', f: () => { R.obst = true; crearObstaculo(); } }] : []),
    { t: 'mover', x: X_DEP - 0.5, y: 0 }, { t: 'girar', yaw: 0 }, { t: 'mover', x: X_DEP, y: 0 },
    { t: 'cond', f: () => !S.sig.S_CARGA, msg: 'Punto de carga ocupado (S_CARGA): depósito en espera.' },
    { t: 'paso', p: 'R5' }, { t: 'cara', v: X_AGARRE - k.hx }, { t: 'carro', z: zCinta }, { t: 'fn', f: () => soltar(k) }, { t: 'cara', v: X_AGARRE - k.hx - 0.1 },
    { t: 'paso', p: 'R6' }, { t: 'mover', x: HOME.x, y: HOME.y, atras: true }, { t: 'cara', v: 0.7 }, { t: 'carro', z: 0.95 },
    { t: 'fn', f: () => { R.objetivo = null; } }, { t: 'paso', p: 'R0' },
  );
}
function agarre(k) {
  const verificar = { t: 'fn', f: () => {
    if (R.agarreFalla) {
      R.agarreFalla = false;
      log('AMR', 'Agarre no verificado: vacío insuficiente en un cabezal. Se liberan las ventosas, se reposicionan y se reintenta (no levanta).', 'Verificación fallida; reintento.', 'evento-f', idBulto(k));
      R.vacio = false; S.sig.AGARRE = false;
      R.cola.unshift({ t: 'cara', v: X_AGARRE - k.hx - 0.05 }, { t: 'esperar', s: 0.5 }, ...agarre(k)); // la accion actual ya salio de la cola
      return;
    }
    S.sig.AGARRE = true; k.modo = 'amr'; R.caja = k;
    log('AMR', 'Vacío activado en los dos cabezales (cara frontal) y agarre verificado: se retira el bulto.', 'Agarre válido.', '', idBulto(k));
  } };
  return [{ t: 'cara', v: X_AGARRE - k.hx }, { t: 'fn', f: () => { R.vacio = true; } }, { t: 'esperar', s: 0.5 }, verificar];
}
function soltar(k) {
  R.vacio = false; S.sig.AGARRE = false; R.caja = null;
  Object.assign(k, { modo: 'acu', x: X_PUNTO_CARGA, y: 0, z: BELT_TOP + k.h / 2, ry: 0 });
  S.kpi.descargados += 1;
  S.kpi.recogidas.push(S.t - R.tIni);
  log('AMR', `Bulto apoyado en el punto de carga y ventosas liberadas. Acumulación: ${cajasAcu().length}/${CAP_ACU}.`, 'Entrega confirmada por S_CARGA.', '', idBulto(k));
}

function robot(dt) {
  S.sig.LIDAR = R.obst && Math.hypot(R.x - OBST.x, R.y - OBST.y) < 1.0;
  if (alarmaAMR() || S.alarma?.ambito === 'acu') return; // detencion coordinada: nada se mueve, el vacio se mantiene
  if (!R.cola.length) {
    const motivo = S.modoDescarga !== 'amr' ? 'descarga manual en curso (modo H2)' : OC.caja ? 'esperando que termine el operario' :
      !S.robotOn ? 'AMR deshabilitado por el operador' : autorizacion();
    R.motivo = motivo;
    if (!motivo) planificarRecogida();
    else if (motivo !== R.ultMotivo && motivo.startsWith('zona')) log('PLC', 'Recogida inhibida: zona de acumulación sin capacidad. Espera normal de funcionamiento.', 'Condición normal.', '', '—');
    R.ultMotivo = motivo;
    return;
  }
  const a = R.cola[0];
  let listo = false;
  switch (a.t) {
    case 'paso': R.paso = a.p; listo = true; break;
    case 'fn': R.cola.shift(); a.f(); return;
    case 'vision': R.vision = a.on; listo = true; break;
    case 'esperar': a.s -= dt; listo = a.s <= 0; break;
    case 'cond':
      listo = a.f();
      if (!listo && !a.avisado) { a.avisado = true; log('PLC', a.msg, 'Condición normal de espera.', '', idBulto(R.caja)); }
      break;
    case 'carro': { const d = a.z - R.carro; R.carro += Math.sign(d) * Math.min(Math.abs(d), 0.5 * dt); listo = Math.abs(a.z - R.carro) < 1e-3; break; }
    case 'cara': { const d = a.v - R.cara; R.cara += Math.sign(d) * Math.min(Math.abs(d), 0.35 * dt); listo = Math.abs(a.v - R.cara) < 1e-3; break; }
    case 'girar': { const d = angDif(R.yaw, a.yaw); R.yaw += Math.sign(d) * Math.min(Math.abs(d), P.wAMR * dt); listo = Math.abs(d) < 1e-3; break; }
    case 'mover': {
      const dx = a.x - R.x, dy = a.y - R.y, dist = Math.hypot(dx, dy);
      if (dist < 1e-3) { listo = true; break; }
      const rumbo = Math.atan2(dy, dx) + (a.atras ? Math.PI : 0);
      const dg = angDif(R.yaw, rumbo);
      if (dist > 0.05 && Math.abs(dg) > 1e-3) { R.yaw += Math.sign(dg) * Math.min(Math.abs(dg), P.wAMR * dt); break; }
      if (S.sig.LIDAR) {
        activarAlarma('amr', 'Obstrucción en el recorrido del AMR', 'El lidar detectó un obstáculo en la trayectoria hacia el punto de carga.', 'AMR (lidar)', 'amr');
        break;
      }
      const v = Math.min(dist, P.vAMR * dt);
      R.x += (dx / dist) * v; R.y += (dy / dist) * v;
      break;
    }
  }
  if (listo) R.cola.shift();
}

// ---------------- operario de carga (modo H2: descarga manual asistida) ----------------
function caminar(o, dt) { // sigue la ruta a velocidad de paso; devuelve true al llegar
  if (!o.ruta.length) return true;
  const w = o.ruta[0], dx = w.x - o.x, dy = w.y - o.y, d = Math.hypot(dx, dy);
  if (d < 1e-3) { o.ruta.shift(); return !o.ruta.length; }
  const paso = Math.min(d, OC_VEL * dt);
  o.x += (dx / d) * paso; o.y += (dy / d) * paso;
  o.yaw += angDif(o.yaw, Math.atan2(dy, dx)) * Math.min(1, dt * 8);
  o.fase += paso * 6;
  return false;
}
function operarioCarga(dt) {
  const o = OC, k = o.caja;
  o.t += dt;
  const manos = () => ({ x: o.x + Math.cos(o.yaw) * 0.45, y: o.y + Math.sin(o.yaw) * 0.45, z: 1.0 });
  const llevar = () => { const m = manos(); Object.assign(k, { x: m.x, y: m.y, z: m.z, ry: o.yaw - Math.PI }); };
  switch (o.estado) {
    case 'espera': {
      o.brazos = lerp(o.brazos, 0, Math.min(1, dt * 4));
      if (S.modoDescarga !== 'manual' || R.cola.length) break;
      if (autorizacion()) break;
      const c = S.cajas.filter((b) => b.modo === 'camion').sort((a, b) => a.orden - b.orden)[0];
      o.caja = c; o.tIni = S.t; c.modo = 'opcarga';
      CAM.agentes.add('Manual');
      o.ruta = [{ x: -9.6, y: -1.0 }, { x: -11.8, y: -1.0 }, { x: c.sl.x + c.hx + 0.35, y: c.sl.y }];
      o.estado = 'irCamion'; o.t = 0;
      log('PLC', `Recogida manual autorizada para ${idBulto(c)} (modo H2): el operario va al camión.`, 'Autorización válida.', '', idBulto(c));
      break;
    }
    case 'irCamion': // el bulto sigue en el camion hasta que el operario lo toma
      k.x = k.sl.x + CAM.dx;
      o.brazos = lerp(o.brazos, 0, Math.min(1, dt * 4));
      if (caminar(o, dt)) { o.estado = 'tomar'; o.t = 0; o.desde = { x: k.x, y: k.y, z: k.z }; }
      break;
    case 'tomar': {
      o.yaw += angDif(o.yaw, Math.PI) * Math.min(1, dt * 6);
      o.brazos = lerp(o.brazos, 0.95, Math.min(1, dt * 5));
      const m = manos(), e = suave(o.t / OC_TOMAR);
      k.x = lerp(o.desde.x, m.x, e); k.y = lerp(o.desde.y, m.y, e); k.z = lerp(o.desde.z, m.z, e);
      if (o.t > OC_TOMAR) { o.ruta = [{ x: -11.8, y: -1.0 }, { x: -9.0, y: -1.0 }, { ...OC_PUESTO }]; o.estado = 'irCinta'; o.t = 0; }
      break;
    }
    case 'irCinta':
      llevar();
      if (caminar(o, dt)) { o.estado = 'esperarCarga'; o.t = 0; }
      break;
    case 'esperarCarga': // antes de apoyar verifica que el punto de carga este libre (S_CARGA)
      o.yaw += angDif(o.yaw, Math.PI / 2 + 0.25) * Math.min(1, dt * 6);
      llevar();
      if (!S.sig.S_CARGA && o.t > 0.3) { o.estado = 'dejar'; o.t = 0; o.desde = { x: k.x, y: k.y, z: k.z }; }
      break;
    case 'dejar': {
      const e = suave(o.t / OC_DEJAR);
      k.x = lerp(o.desde.x, X_PUNTO_CARGA, e); k.y = lerp(o.desde.y, 0, e); k.z = lerp(o.desde.z, BELT_TOP + k.h / 2, e);
      k.ry = lerp(k.ry, 0, e);
      o.brazos = lerp(0.95, 1.2, e);
      if (o.t > OC_DEJAR) {
        Object.assign(k, { modo: 'acu', x: X_PUNTO_CARGA, y: 0, z: BELT_TOP + k.h / 2, ry: 0 });
        S.kpi.descargados += 1;
        S.kpi.recogidas.push(S.t - o.tIni);
        log('Operario de carga', `Bulto apoyado a mano en el punto de carga. Acumulación: ${cajasAcu().length}/${CAP_ACU}.`, 'Entrega confirmada por S_CARGA.', '', idBulto(k));
        o.caja = null; o.estado = 'espera'; o.t = 0;
      }
      break;
    }
  }
}

// ---------------- operario de revision manual ----------------
const lerp = (a, b, t) => a + (b - a) * t;
const suave = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
function manos() { return { x: OPE.x + Math.cos(OPE.yaw) * 0.5, y: OPE.y + Math.sin(OPE.yaw) * 0.5, z: 1.0 }; }
function slotBin() { // primer lugar libre del contenedor: primero el piso, despues encima de otro bulto
  const ocup = S.cajas.filter((b) => ['caida', 'revision'].includes(b.modo));
  for (let j = 0; j < CAP_BIN; j++) {
    if (ocup.some((b) => b.binSlot === j)) continue;
    const abajo = j >= 4 ? ocup.find((b) => b.binSlot === j - 4) : null;
    if (j >= 4 && !abajo) continue; // no se apila sobre el vacio
    return { j, x: BIN_SLOTS[j % 4][0], y: BIN_SLOTS[j % 4][1], base: abajo ? abajo.binZ + abajo.h / 2 : 0.04 };
  }
  return { j: -1, x: 0, y: BIN.y, base: 0.75 }; // shortcut: lleno, encima de todo; S_EXC evita llegar aca
}
function alContenedor(k) {
  const sl = slotBin();
  Object.assign(k, { binSlot: sl.j, binZ: sl.base + k.h / 2, dest: { x: sl.x, y: sl.y, z: sl.base + k.h / 2 } });
  return sl;
}
function operario(dt) {
  const o = OPE;
  o.t += dt;
  const k = o.caja;
  const yawBin = Math.atan2(BIN.y - o.y, BIN.x - o.x), yawCinta = Math.atan2(RET.y - o.y, RET.x0 - o.x);
  const girar = (dest, dur) => { o.yaw = lerp(o.yaw0, dest, suave(o.t / dur)); };
  const sig = (estado) => { o.estado = estado; o.t = 0; o.yaw0 = o.yaw; if (k) o.desde = { x: k.x, y: k.y, z: k.z }; };
  switch (o.estado) {
    case 'ausente': // los No Read se juntan en el contenedor hasta que se llama a un operario
      if (S.operarioRev) {
        Object.assign(o, { x: OP_ACCESO.x, y: OP_ACCESO.y, ruta: [{ x: OP.x, y: OP_ACCESO.y }, { ...OP }], estado: 'llegando', t: 0, txt: 'Operario en camino a la zona de revisión' });
        log('Revisión manual', 'Se llama a un operario a la zona de revisión manual.', 'Evento de operación.', '', '—');
      }
      break;
    case 'llegando':
      if (caminar(o, dt)) { o.txt = 'Esperando bultos No Read'; sig('espera'); log('Operario (lector de mano)', `Operario en la zona de revisión. Bultos en el contenedor: ${S.cajas.filter((b) => b.modo === 'revision').length}.`, 'Evento de operación.', '', '—'); }
      break;
    case 'yendose':
      if (caminar(o, dt)) o.estado = 'ausente';
      break;
    case 'espera': {
      o.brazoI = o.brazoD = lerp(o.brazoD, 0, Math.min(1, dt * 4));
      girar(Math.PI / 2, 0.8);
      if (!S.operarioRev) { // se retira; los proximos No Read vuelven a quedar en el contenedor
        Object.assign(o, { ruta: [{ x: OP.x, y: OP_ACCESO.y }, { ...OP_ACCESO }], estado: 'yendose', t: 0, txt: 'Operario retirándose' });
        log('Revisión manual', 'El operario de revisión se retira de la zona.', 'Evento de operación.', '', '—');
        break;
      }
      // toma primero los de arriba: nunca saca un bulto que tenga otro encima
      const ocup = S.cajas.filter((b) => ['caida', 'revision'].includes(b.modo));
      const nueva = ocup.filter((b) => b.modo === 'revision' && b.s > 0.4 && !ocup.some((c) => c.binSlot === b.binSlot + 4))
        .sort((a, b) => b.binSlot - a.binSlot)[0];
      if (nueva && o.t > 0.8) { o.caja = nueva; o.txt = `Toma el bulto ${nueva.idCiclo ?? ''} del contenedor`; sig('girarBin'); }
      break;
    }
    case 'girarBin': girar(yawBin, 0.6); o.brazoI = o.brazoD = 0.9 * suave(o.t / 0.6); if (o.t > 0.6) { k.modo = 'operario'; k.binSlot = undefined; sig('tomar'); } break;
    case 'tomar': { // levanta el bulto del contenedor hasta las manos
      const m = manos(), e = suave(o.t / 0.7);
      k.x = lerp(o.desde.x, m.x, e); k.y = lerp(o.desde.y, m.y, e); k.z = lerp(o.desde.z, m.z, e);
      if (o.t > 0.7) sig('girarCinta');
      break;
    }
    case 'girarCinta': {
      girar(yawCinta, 0.8);
      const m = manos();
      k.x = m.x; k.y = m.y; k.z = m.z; k.ry = o.yaw;
      if (o.t > 0.8) sig('apoyar');
      break;
    }
    case 'apoyar': { // lo apoya al inicio de la cinta de retorno
      const e = suave(o.t / 0.6);
      k.x = lerp(o.desde.x, RET.x0, e); k.y = lerp(o.desde.y, RET.y, e); k.z = lerp(o.desde.z, BELT_TOP + k.h / 2, e);
      k.ry = lerp(o.yaw, 0, e);
      o.brazoI = o.brazoD = lerp(0.9, 1.25, e);
      if (o.t > 0.6) { k.ry = 0; o.txt = `Leyendo con lector de mano el bulto ${k.idCiclo ?? ''}`; sig('leer'); }
      break;
    }
    case 'leer': // apunta el lector de mano al sticker
      o.brazoI = lerp(o.brazoI, 0.2, Math.min(1, dt * 4));
      o.brazoD = lerp(o.brazoD, 1.35, Math.min(1, dt * 4));
      o.laser = o.t > 0.3 && o.t < 1.5;
      if (o.t > 0.6) etiquetaVisible(k, true); // el operario ubica el sticker (estaba tapado o dañado)
      if (o.t > 1.6) {
        o.laser = false;
        k.codigo = codigoEAN();
        S.kpi.man += 1;
        log('Operario (lector de mano)', `Lectura manual del bulto ${k.idCiclo ?? idBulto(k)}: código ${k.codigo} identificado y registrado. Se envía por la cinta de retorno a expedición.`, 'Dato ingresado manualmente; registro confirmado.', 'ok-f', k.idCiclo ?? idBulto(k));
        k.modo = 'retorno';
        o.caja = null; o.txt = 'Esperando bultos No Read'; // termina este bulto aunque se haya apagado el interruptor
        sig('espera');
      }
      break;
  }
}

// ---------------- fisica simple: cintas, cilindro, carril, retorno y colector ----------------
function laneZ(y, h) { return y >= -0.5 ? BELT_TOP + h / 2 : 0.77 + (0.55 - 0.77) * ((y + 0.5) / -2.0) + 0.03 + h / 2; }
// avance con separacion: un bulto no avanza si tiene otro adelante en la misma cinta a menos de "hueco"
function libre(k, eje, modos, hueco = 0.12) {
  const yo = k[eje];
  return !S.cajas.some((o) => o !== k && modos.includes(o.modo) && o[eje] > yo &&
    o[eje] - yo < (eje === 'x' ? k.hx + o.hx : k.hy + o.hy) + hueco &&
    Math.abs((eje === 'x' ? o.y - k.y : o.x - k.x)) < 0.45);
}
const colectorLibre = (y) => !S.cajas.some((o) => o.modo === 'colector' && Math.abs(o.y - y) < 0.55);

function fisica(dt) {
  const sg = S.sig;
  // cilindro: VUVG energizada extiende, desenergizada retrae (monoestable)
  const lim = S.atasco ? 0.35 : 1;
  if (sg.Y_VUVG) S.pusher = Math.min(lim, S.pusher + dt / 0.8);
  else if (!S.atasco) S.pusher = Math.max(0, S.pusher - dt / 0.7);
  sg.S_EXT = S.pusher >= 0.999;
  sg.S_RET = S.pusher <= 0.001;
  // encoder de la cinta de inspeccion
  const vObj = sg.M_INSP ? V_CINTA : 0;
  sg.ENC = vObj > sg.ENC ? Math.min(vObj, sg.ENC + dt * 6) : Math.max(vObj, sg.ENC - dt * 6);
  S.encQuieto = sg.ENC < 0.005 ? S.encQuieto + dt : 0;
  // cinta de acumulacion: cada bulto avanza hasta su posicion
  const acu = cajasAcu();
  sg.M_ACU = !alarmaAMR() && (S.fase === 'liberando' || acu.some((k, i) => k.x < slotAcu(i) - 1e-3));
  if (sg.M_ACU) acu.forEach((k, i) => { k.x = Math.min(slotAcu(i), k.x + V_CINTA * dt); });
  // sobrecarga: mas bultos que lugares, todos detenidos en la acumulacion
  const exceso = acu.length > CAP_ACU && acu.every((k, i) => k.x >= slotAcu(i) - 1e-3);
  S.sobreT = exceso ? S.sobreT + dt : 0;
  if (S.sobreT > 1.0 && S.alarma?.tipo !== 'sobrecarga') {
    activarAlarma('sobrecarga', 'Sobrecarga en la cinta de acumulación', `${acu.length} bultos en una zona de ${CAP_ACU} lugares: S_ACU no frenó las recogidas y el AMR entrega más rápido de lo que la estación consume.`, 'PLC', 'acu');
  }
  const b = S.banda, avance = V_CINTA * dt; // las de salida, retorno y colector corren siempre
  if (sg.M_ALIM) b.Alimentador += avance;
  if (sg.M_ACU) b.Acumulacion += avance;
  b.Salida += avance; b.Retorno += avance; b.Colector += avance;

  for (const k of [...S.cajas]) {
    switch (k.modo) {
      case 'camion': k.x = k.sl.x + CAM.dx; break;
      case 'amr': {
        const d = R.cara + k.hx;
        k.x = R.x + Math.cos(R.yaw) * d; k.y = R.y + Math.sin(R.yaw) * d; k.z = R.carro; k.ry = R.yaw - Math.PI;
        break;
      }
      case 'cinta': {
        if (k.cruzar && k.x >= -1.15) { k.cruzar = false; k.trabado = true; k.x = -1.15; } // se cruza en la transferencia
        if (k.trabado) { k.ry = lerp(k.ry || 0, 0.55, Math.min(1, dt * 4)); k.rx = lerp(k.rx || 0, 0.07, Math.min(1, dt * 4)); break; }
        let enMarcha = k.x < -5.25 ? sg.M_ACU : k.x < -1 ? sg.M_ALIM : k.x < 1 ? sg.M_INSP : true; // la salida siempre corre
        if (k.x >= 1 && (!libre(k, 'x', ['cinta']) || (k.x >= X_FIN_SALIDA && !colectorLibre(0)))) enMarcha = false;
        if (enMarcha) k.x += V_CINTA * dt;
        if (S.fase === 'transporte' && k === S.cajaCinta) k.x = Math.min(k.x, 0);
        if (k.x >= COL.x) { k.x = COL.x; k.modo = 'colector'; }
        // la placa empuja el bulto (contacto en su cara +Y)
        const yPlaca = 0.4875 - 0.75 * S.pusher;
        if (Math.abs(k.x) < 0.3 && yPlaca - k.hy < k.y) k.y = yPlaca - k.hy;
        if (k.y <= -(0.26 + k.hy)) { k.modo = 'carril'; k.s = 0; k.y0 = k.y; k.trabarse = ocurre('trabaCarril'); if (k === S.cajaCinta) S.cajaCinta = null; }
        break;
      }
      case 'carril': {
        if (k.trabado) { k.ry = lerp(k.ry || 0, 0.45, Math.min(1, dt * 4)); break; } // atascado en los rodillos
        k.s += dt / 1.2;
        const e = Math.min(1, k.s) ** 1.6;
        k.y = k.y0 + (-2.35 - k.y0) * e;
        k.z = laneZ(k.y, k.h);
        k.rx = Math.min(1, (k.y0 - k.y) / 0.15) * TILT;
        if (k.trabarse && k.y <= -1.15) { k.trabarse = false; k.trabado = true; }
        if (k.s >= 1) { alContenedor(k); k.modo = 'caida'; k.s = 0; }
        break;
      }
      case 'caida': { // cae a su lugar en el contenedor (en el piso o encima de otro bulto)
        k.s = Math.min(1, k.s + dt / 0.35);
        const d = k.dest, z0 = laneZ(-2.35, k.h);
        k.x = d.x * k.s;
        k.y = -2.35 + (d.y + 2.35) * k.s;
        k.z = z0 + (d.z - z0) * k.s * k.s;
        k.rx = TILT * (1 - k.s); k.ry = 0;
        if (k.s >= 1) { k.modo = 'revision'; k.s = 0; }
        break;
      }
      case 'revision': k.s += dt; break; // queda en el contenedor hasta que venga un operario
      case 'retorno': // cinta de retorno (+X) hasta el colector
        if (libre(k, 'x', ['retorno']) && (k.x < X_FIN_RETORNO || colectorLibre(RET.y))) k.x += V_CINTA * dt;
        if (k.x >= COL.x) { k.x = COL.x; k.modo = 'colector'; }
        break;
      case 'colector': // colector comun (+Y) hacia expedicion: el mismo destino final para los dos flujos
        if (libre(k, 'y', ['colector', 'cinta', 'retorno'])) k.y += V_CINTA * dt; // cede el paso al que esta entrando
        if (k.y > COL.fin) { S.kpi.exp += 1; quitarCaja(k); }
        break;
    }
  }
  // sensores
  const enCinta = S.cajas.filter((k) => k.modo === 'cinta' && k.y > -0.2);
  const pasoAntes = sg.S_PASO;
  sg.S_ING = enCinta.some((k) => Math.abs(k.x - X_SING) < 0.22);
  sg.S_ZONA = enCinta.some((k) => Math.abs(k.x - X_SZONA) < 0.2);
  sg.S_PASO = S.cajas.some((k) => k.modo === 'carril' && Math.abs(k.y + 1.7) < 0.25);
  const enContenedor = S.cajas.filter((k) => ['carril', 'caida', 'revision'].includes(k.modo)).length;
  sg.S_EXC = S.cajas.some((k) => k.modo === 'caida') || enContenedor >= CAP_BIN; // cayendo o lleno: no se desvia otro
  sg.S_CARGA = cajasAcu().some((k) => Math.abs(k.x - X_PUNTO_CARGA) < 0.25);
  sg.S_ACU = cajasAcu().some((k) => Math.abs(k.x - slotAcu(CAP_ACU - 1)) < 0.22);
  sg.VAC = R.vacio;
  if (sg.S_PASO && !pasoAntes && S.fase === 'paso') S.cajaPaso = true;
}

// ---------------- comandos del operador ----------------
function bloquear(msg) {
  $('bloqueo').textContent = msg;
  log('Interfaz de operación', `Comando rechazado: ${msg}`, 'Comando bloqueado.');
}
function cmdIniciar() {
  if (S.auto) return bloquear('El sistema ya está en automático.');
  if (S.alarma) return bloquear('Hay una falla activa: reconocer, resolver y rearmar.');
  if (!S.sig.S_RET) return bloquear('El desviador no está en reposo (S_RET).');
  if (S.sig.S_ZONA && !S.ciclo) return bloquear('La estación está ocupada por un bulto no procesado.');
  S.auto = true; S.stopReq = false; $('bloqueo').textContent = '';
  log('Interfaz de operación', 'Inicio de operación automática. Estación libre, desviador en reposo, equipos y AMR disponibles.', 'Comando aceptado.');
}
function cmdDetener() {
  if (!S.auto) return bloquear('El sistema ya está detenido.');
  $('bloqueo').textContent = '';
  if (S.paso === 'E0' && S.fase === 'espera') return detenerAhora();
  S.stopReq = true;
  log('Interfaz de operación', 'Detención controlada solicitada: se completan el ciclo y la recogida en curso.', 'Comando aceptado.');
}
function cmdReconocer() {
  if (!S.alarma) return bloquear('No hay alarmas activas.');
  if (S.alarma.reconocida) return bloquear('La alarma ya fue reconocida.');
  S.alarma.reconocida = true; $('bloqueo').textContent = '';
  log('Interfaz de operación', `Operador reconoce la alarma (${S.alarma.titulo}). La causa no se elimina por reconocer.`, 'Reconocimiento registrado.', 'alarma-f');
}
function cmdResolver() {
  const a = S.alarma;
  if (!a || a.resuelta) return;
  const c = S.ciclo;
  if (a.tipo === 'amr') {
    R.obst = false; quitarObstaculo();
    log('Operario', 'Obstáculo retirado del recorrido del AMR. El robot conserva el bulto sujeto.', 'Intervención registrada.', '', idBulto(R.caja));
  } else if (a.tipo === 'sobrecarga') {
    log('Operario', 'Se ajusta la velocidad del AMR y se verifica el sensor S_ACU. La acumulación se descarga hacia la estación.', 'Intervención registrada.', '', '—');
  } else if (a.tipo === 'atasco') {
    if (S.cajaCinta) Object.assign(S.cajaCinta, { trabado: false, ry: 0, rx: 0 });
    log('Operario', 'Bulto enderezado y alineado sobre la cinta; la transferencia queda libre.', 'Intervención registrada.');
  } else if (a.tipo === 'registro') {
    c.registro = 'Confirmado';
    log('Servicio de integración', 'Conexión restablecida. Consulta por ID: el registro ya existía en el ERP. Se recupera su confirmación.', 'Registro confirmado; sin duplicar la transacción.');
  } else {
    S.atasco = false; S.sig.Y_VUVG = false;
    const trabado = S.cajas.find((b) => b.modo === 'carril' && b.trabado);
    if (trabado) Object.assign(trabado, { trabado: false, ry: 0 }); // sigue cayendo al contenedor
    if (S.cajaCinta) { // el operario lleva el bulto al contenedor de revision manual
      const k = S.cajaCinta, sl = alContenedor(k);
      Object.assign(k, { modo: 'revision', s: 0, x: sl.x, y: sl.y, z: k.binZ, rx: 0, ry: 0 });
      S.cajaCinta = null;
    }
    if (c) c.desviador = 'En reposo';
    log('Operario', trabado ? 'Bulto destrabado del carril de excepción; sigue hacia el contenedor de revisión. Cilindro verificado.'
      : a.tipo === 'desvio' ? 'Mecanismo liberado y verificado (aire, VUVG, cilindro). Bulto llevado a revisión manual.'
        : 'Lectores y comunicación verificados. Bulto llevado a revisión manual.', 'Intervención registrada.');
  }
  a.resuelta = true;
  log('PLC', 'Retorno a normal: señales físicas coherentes.', 'Condición normalizada; requiere rearme.', 'alarma-f');
}
function cmdRearmar() {
  const a = S.alarma;
  if (!a) return bloquear('No hay una falla que rearmar.');
  if (!a.reconocida) return bloquear('Primero hay que reconocer la alarma.');
  if (!a.resuelta) return bloquear('La causa de la falla persiste: resolverla en planta.');
  if (!S.sig.S_RET) return bloquear('El desviador todavía no confirma reposo (S_RET).');
  if (a.tipo === 'sobrecarga' && cajasAcu().length > CAP_ACU) return bloquear('La acumulación sigue sobrecargada: esperar a que la estación la descargue.');
  $('bloqueo').textContent = '';
  S.alarma = null;
  log('Interfaz de operación', 'Operador solicita el rearme; condiciones verificadas.', 'Comando aceptado.', 'alarma-f');
  if (a.ambito === 'estacion') {
    const c = S.ciclo;
    if (a.tipo === 'atasco' && S.cajaCinta) irA('E1', 'transporte'); // bulto enderezado: retoma el traslado a S_ZONA
    else if (c && c.registro === 'Confirmado' && S.cajaCinta) irA('E4', 'evacuacion'); // E5 -> E4
    else {
      if (c) {
        S.kpi.proc += 1; S.kpi.tiempos.push(S.t - c.tIni);
        if (c.resultado === 'No Read') S.kpi.nr += 1;
        log('PLC', 'Ciclo resuelto y documentado; bulto en revisión manual. Estación libre, sin transacción pendiente.', 'Cierre por intervención.');
      }
      S.ciclo = null;
      S.lect = LECTORES.map(() => ({ estado: 'espera', txt: 'En espera' }));
      irA('E0', 'espera'); // E5 -> E0
      if (S.stopReq) detenerAhora();
    }
  } else {
    log('AMR', 'Reanudación del AMR: continúa el traslado con el bulto sujeto.', 'Comando aceptado.', '', idBulto(R.caja));
  }
  if (S.pendiente) { const p = S.pendiente; S.pendiente = null; activarAlarma(...p); }
}

// ---------------- 3D ----------------
const cont = $('escena3d');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
cont.appendChild(renderer.domElement);
const etiquetasR = new CSS2DRenderer();
etiquetasR.domElement.style.cssText = 'position:absolute;inset:0;pointer-events:none';
cont.appendChild(etiquetasR.domElement);

function texturaCielo() { // degrade suave para el fondo
  const c = document.createElement('canvas');
  c.width = 4; c.height = 256;
  const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#6f8aa6'); gr.addColorStop(0.55, '#b9c6d3'); gr.addColorStop(1, '#d9dfe5');
  g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function uvPlano(mesh, tile) { // UV en metros (planta X/Y de Blender): las texturas quedan a escala
  const p = mesh.geometry.attributes.position, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { uv[2 * i] = p.getX(i) / tile; uv[2 * i + 1] = p.getZ(i) / tile; }
  mesh.geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}
function texturaBanda(enY) { // banda de goma con nervaduras transversales
  const c = document.createElement('canvas');
  c.width = enY ? 64 : 256; c.height = enY ? 256 : 64;
  const g = c.getContext('2d');
  g.fillStyle = '#1b1d20'; g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < 4; i++) {
    g.fillStyle = '#34383e';
    if (enY) g.fillRect(0, i * 64 + 4, 64, 10); else g.fillRect(i * 64 + 4, 0, 10, 64);
    g.fillStyle = '#0e0f11';
    if (enY) g.fillRect(0, i * 64 + 14, 64, 3); else g.fillRect(i * 64 + 14, 0, 3, 64);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}
function texturaPiso(base, manchas, juntas) { // hormigon / asfalto procedural
  const N = 512, c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, N, N);
  for (let i = 0; i < 9000; i++) {
    const v = Math.random();
    g.fillStyle = `rgba(${manchas},${0.03 + v * 0.07})`;
    const r = 1 + Math.random() * 3;
    g.fillRect(Math.random() * N, Math.random() * N, r, r);
  }
  for (let i = 0; i < 40; i++) { // manchas grandes y suaves
    const x = Math.random() * N, y = Math.random() * N, r = 20 + Math.random() * 60;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(${manchas},0.06)`); gr.addColorStop(1, `rgba(${manchas},0)`);
    g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  if (juntas) { g.strokeStyle = 'rgba(40,40,45,0.35)'; g.lineWidth = 2; g.strokeRect(1, 1, N - 2, N - 2); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

const scene = new THREE.Scene();
scene.background = texturaCielo();
scene.fog = new THREE.Fog(0xc9d2da, 45, 120);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture; // reflejos para los metales
scene.environmentIntensity = 0.65;
const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 220);
// post-procesado: render con MSAA + resplandor (bloom) solo en lo emisivo: haces, baliza, laser, ventosas
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }));
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.35, 0.3, 2.6); // umbral alto: la escena iluminada no brilla, solo lo emisivo
composer.addPass(bloom);
composer.addPass(new OutputPass());
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.49;
scene.add(new THREE.HemisphereLight(0xeef3f8, 0x4a4f55, 1.1));
const sol = new THREE.DirectionalLight(0xfff4e6, 2.6);
sol.position.copy(B(-1, -9, 15));
sol.target.position.copy(B(-4, 0, 0));
scene.add(sol.target);
sol.castShadow = true;
sol.shadow.mapSize.set(4096, 4096);
Object.assign(sol.shadow.camera, { left: -19, right: 19, top: 19, bottom: -19, near: 1, far: 50 });
sol.shadow.bias = -0.0004;
sol.shadow.normalBias = 0.02;
scene.add(sol);
const relleno = new THREE.DirectionalLight(0xdfe8ff, 0.5);
relleno.position.copy(B(10, 8, 6));
scene.add(relleno);

const CAMS = {
  planta: [B(4.0, -13.5, 9.0), B(-4.5, 0.5, 0.3)],
  descarga: [B(-8.6, -4.4, 3.4), B(-11.8, 0.2, 0.7)],
  general: [B(5.2, -6.2, 3.8), B(0, -0.6, 0.8)],
  desvio: [B(2.9, -3.3, 2.3), B(0, -1.1, 0.85)],
  revision: [B(3.4, -7.6, 3.4), B(1.6, -2.6, 0.6)],
  lectores: [B(-2.6, 2.4, 3.0), B(0, 0, 1.2)],
};
let camTween = null;
function irCamara(n) {
  const [p, t] = CAMS[n];
  camTween = { p0: camera.position.clone(), t0: controls.target.clone(), p, t, k: 0 };
}
camera.position.copy(CAMS.planta[0]);
controls.target.copy(CAMS.planta[1]);

const G = {}; // referencias a nodos del GLB
const plantillas = {};
let raiz = null;

function crearCaja(variante = 'Estandar') {
  const [lx, ly, lz, nombre] = VARIANTES[variante];
  const k = { x: 0, y: 0, z: BELT_TOP + lz / 2, rx: 0, ry: 0, modo: 'cinta', s: 0, obj: null, variante, hx: lx / 2, hy: ly / 2, h: lz };
  k.obj = plantillas[nombre].clone(true);
  k.obj.visible = true;
  raiz.add(k.obj);
  S.cajas.push(k);
  return k;
}
function etiquetaVisible(k, v) {
  k?.obj?.traverse((o) => { if (o.name.endsWith('_Etiqueta')) o.visible = v; });
}
function quitarCaja(k) {
  if (k.obj) k.obj.removeFromParent();
  S.cajas = S.cajas.filter((c) => c !== k);
}
function crearObstaculo() {
  const g = new THREE.Group();
  const cono = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.55, 20), new THREE.MeshStandardMaterial({ color: 0xff6a00, roughness: 0.6 }));
  cono.position.y = 0.3; cono.castShadow = true;
  const banda = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.125, 0.08, 20), new THREE.MeshStandardMaterial({ color: 0xffffff }));
  banda.position.y = 0.33;
  g.add(cono, banda);
  g.position.copy(B(OBST.x, OBST.y, 0));
  scene.add(g);
  G.obst = g;
}
function quitarObstaculo() { if (G.obst) { G.obst.removeFromParent(); G.obst = null; } }

function matPropio(mesh) {
  if (!mesh) return null;
  mesh.material = mesh.material.clone();
  return mesh.material;
}
function etiqueta(texto, pos, clase = '', padre = scene) {
  const d = document.createElement('div');
  d.className = 'etq ' + clase;
  d.textContent = texto;
  const o = new CSS2DObject(d);
  o.position.copy(pos);
  padre.add(o);
  return o;
}
const etiquetas = [];

// cinematica inversa de los brazos (misma que blender/crear_descarga_amr.py)
const L1 = 0.45, L2 = 0.45, HOMBRO_X = 0.1, HOMBRO_Y = 0.22, CARRO_X = 0.4, SEP = 0.075, CABEZAL = 0.035;
function ik(tx, ty, s) {
  const d = Math.max(0.05, Math.min(Math.hypot(tx, ty), L1 + L2 - 1e-3));
  const e = Math.acos(Math.max(-1, Math.min(1, (d * d - L1 * L1 - L2 * L2) / (2 * L1 * L2))));
  const a = Math.atan2(ty, tx) + s * Math.atan2(L2 * Math.sin(e), L1 + L2 * Math.cos(e));
  const c = -s * e;
  return [a, c, -(a + c)];
}

new GLTFLoader().load('assets/tracepack_estacion.glb', (gltf) => {
  raiz = gltf.scene;
  raiz.traverse((o) => {
    if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
  });
  scene.add(raiz);
  const busca = (n) => raiz.getObjectByName(n);
  for (const [, , , nombre] of Object.values(VARIANTES)) { plantillas[nombre] = busca(nombre); plantillas[nombre].visible = false; }
  busca('Bulto_NoRead_Template').visible = false;
  G.pusher = busca('Pusher_Mov');
  G.fov = LECTORES.map(([r]) => {
    const m = busca('FOV_' + r);
    m.scale.set(1, 1, 1);
    m.castShadow = m.receiveShadow = false;
    const mat = matPropio(m);
    Object.assign(mat, { transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide });
    m.visible = false;
    return m;
  });
  G.haz = Object.fromEntries(['S_ING', 'S_ZONA', 'S_PASO', 'S_EXC', 'S_CARGA', 'S_ACU', 'S_CAMION'].map((n) => {
    const m = busca('Beam_' + n);
    m.castShadow = false;
    matPropio(m);
    return [n, m];
  }));
  G.led = Object.fromEntries(['S_EXT', 'S_RET'].map((n) => [n, matPropio(busca('LED_' + n))]));
  G.baliza = Object.fromEntries([['Verde', 0x22ff44], ['Ambar', 0xffa020], ['Roja', 0xff2020]].map(([n, col]) => {
    const mat = matPropio(busca('Baliza_' + n));
    return [n, { mat, col: new THREE.Color(col) }];
  }));
  const banda = busca('Inspeccion_Banda');
  if (banda) Object.assign(matPropio(banda), { transparent: true, opacity: 0.35, transmission: 0, depthWrite: false });
  // pisos y bandas con textura (los materiales procedurales de Blender no viajan en el glTF)
  for (const [nombre, tile, base, manchas, juntas] of [['Piso', 4, '#a9aeb3', '60,62,66', true], ['Patio', 6, '#3b3c3f', '10,10,12', false], ['Terreno', 8, '#58694f', '30,45,25', false]]) {
    const o = busca(nombre);
    if (!o) continue;
    uvPlano(o, tile);
    const m = matPropio(o);
    m.map = texturaPiso(base, manchas, juntas); m.color.set(0xffffff); m.roughness = 0.9;
  }
  const texX = texturaBanda(false), texY = texturaBanda(true);
  G.bandas = Object.keys(S.banda).map((n) => {
    const o = busca(`${n}_Banda`);
    uvPlano(o, 0.4); // 4 nervaduras cada 0.4 m
    const m = matPropio(o);
    m.map = (n === 'Colector' ? texY : texX).clone(); m.map.needsUpdate = true;
    m.color.set(0xffffff); m.roughness = 0.75;
    return [n, m.map];
  });
  // H3
  G.camion = busca('Camion');
  G.puertas = [busca('Puerta_I'), busca('Puerta_D')];
  G.amr = busca('AMR');
  G.carro = busca('AMR_Carro');
  G.brazo = ['I', 'D'].map((n) => ['Hombro', 'Codo', 'Muneca'].map((j) => busca(`AMR_${j}_${n}`)));
  G.amrFov = busca('AMR_FOV');
  G.amrFov.scale.set(1, 1, 1);
  G.amrFov.castShadow = false;
  Object.assign(G.amrFov.material, { transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide });
  const mats = {};
  raiz.traverse((o) => { if (o.isMesh) mats[o.material.name] = o.material; });
  G.ventosas = [mats.Ventosa_I, mats.Ventosa_D];
  G.lidar = mats.Luz_AMR_Lidar;
  G.luzAmr = mats.Luz_AMR_Estado;
  // operario y laser del lector de mano
  G.op = busca('Operario');
  G.opBrazos = [busca('Operario_Brazo_I'), busca('Operario_Brazo_D')];
  G.opLector = busca('Operario_Lector');
  G.opCarga = G.op.clone(true); // operario de carga del modo H2 (se clona antes de agregarle etiquetas)
  G.opCarga.name = 'Operario_Carga';
  const chaleco = G.opCarga.getObjectByName('Operario_Chaleco');
  chaleco.material = chaleco.material.clone();
  chaleco.material.color.set(0x8fd12a); chaleco.material.emissive?.set(0x2a4a00);
  G.opCarga.getObjectByName('Operario_Lector').visible = false;
  G.opCargaBrazos = [G.opCarga.getObjectByName('Operario_Brazo_I'), G.opCarga.getObjectByName('Operario_Brazo_D')];
  raiz.add(G.opCarga);
  G.laser = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 1, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.25, 0.25), transparent: true, opacity: 0.9 }));
  G.laser.visible = false;
  scene.add(G.laser);

  const L = (t, p, c) => etiquetas.push(etiqueta(t, p, c));
  [['R1', 0, 0, 2.38], ['R2', 0.35, 0.95, 1.75], ['R3', 0, -0.95, 1.8], ['R4', 1.75, 0, 1.82], ['R5', -1.75, 0, 1.82], ['R6', 0.25, 0, 0.3]]
    .forEach(([n, x, y, z]) => L(`${n} ${LECTORES.find((l) => l[0] === n)[1]}`, B(x, y, z)));
  L('S_ING', B(-4.6, 0.6, 1.1), 'sensor'); L('S_ZONA', B(-0.12, 0.62, 1.08), 'sensor');
  L('S_PASO', B(0.5, -1.7, 1.1), 'sensor'); L('S_EXC', B(-0.75, -3.1, 0.55), 'sensor');
  L('Cilindro ADN-S + VUVG · S_EXT/S_RET', B(0, 1.4, 1.25), 'sensor'); L('Encoder', B(0.95, 0.6, 0.6), 'sensor');
  L('S_CARGA', B(-8.45, 0.62, 1.1), 'sensor'); L('S_ACU', B(-6.85, 0.62, 1.1), 'sensor'); L('S_CAMION', B(-12.15, 1.6, 0.35), 'sensor');
  L('Alimentador', B(-3.2, -0.6, 0.9), 'zona'); L('Cinta de inspección (transparente)', B(0.2, -0.75, 0.55), 'zona');
  L('Salida principal', B(3.4, -0.6, 0.9), 'zona'); L('Carril de excepción', B(-0.5, -1.9, 0.9), 'zona');
  L('Revisión manual', B(-0.2, -3.6, 0.75), 'zona'); L('PLC S7-1200', B(2.6, 2.4, 1.75), 'zona');
  L('HMI local', B(1.6, 1.7, 1.6), 'zona'); L('Baliza', B(0.9, 1.0, 2.95), 'zona');
  L('Acumulación (máx. 3)', B(-7.1, -0.6, 0.9), 'zona'); L('Muelle 1', B(-12.3, -1.9, 0.3), 'zona');
  L('Cinta de retorno', B(3.0, -3.65, 0.95), 'zona'); L('Colector', B(6.2, -1.6, 0.95), 'zona'); L('Expedición', B(5.65, 2.4, 1.8), 'zona');
  etiquetas.push(etiqueta('AMR · 2 brazos multiventosa', new THREE.Vector3(0, 2.55, 0), 'robot', G.amr));
  etiquetas.push(etiqueta('Camión', B(-16, 0, 2.95), 'zona', G.camion));
  G.opEtq = etiqueta('Operario · lectura manual', new THREE.Vector3(0, 2.0, 0), 'robot', G.op);
  G.ocEtq = etiqueta('Operario de carga (H2)', new THREE.Vector3(0, 2.0, 0), 'robot', G.opCarga);
  etiquetas.push(G.opEtq, G.ocEtq);
  etiquetas.forEach((o) => { o.visible = $('chkEtiquetas').checked; }); // arrancan apagadas: se ve el sistema limpio
  $('cargando').classList.add('oculto');
}, undefined, (err) => {
  $('cargando').textContent = 'No se pudo cargar el modelo 3D (' + (err?.message || err) + '). Abrí la web con iniciar_web.bat.';
});

const colorFov = { leyendo: 0x4fc3ff, codigo: 0x3ccf6e, sincodigo: 0xf0a83a, error: 0xff3b3b };
const NEGRO = new THREE.Color(0);
const vA = new THREE.Vector3(), vB = new THREE.Vector3(), Y_ARRIBA = new THREE.Vector3(0, 1, 0);
let parpadeo = 0;
function actualizar3D(dtReal) {
  if (!raiz) return;
  for (const k of S.cajas) {
    k.obj.position.copy(B(k.x, k.y, k.z));
    k.obj.rotation.set(k.rx || 0, k.ry || 0, 0);
  }
  G.pusher.position.copy(B(0, -0.75 * S.pusher, 0));
  const leyendo = S.fase === 'lectura';
  G.fov.forEach((m, i) => {
    const st = S.lect[i].estado;
    m.visible = leyendo || (S.paso === 'E5' && st !== 'espera'); // en falla queda a la vista que lector fallo
    m.material.color.setHex(colorFov[st] ?? colorFov.leyendo);
    m.material.emissive?.setHex(colorFov[st] ?? colorFov.leyendo);
  });
  for (const [n, m] of Object.entries(G.haz)) {
    const on = S.sig[n];
    m.material.emissive.setHex(on ? 0x22ff55 : 0xff2020);
    m.material.color.setHex(on ? 0x22ff55 : 0xff2020);
    m.material.emissiveIntensity = on ? 3 : 1.2;
  }
  for (const [n, mat] of Object.entries(G.led)) {
    mat.emissive.setHex(S.sig[n] ? 0x22ff44 : 0x000000);
    mat.color.setHex(S.sig[n] ? 0x22ff44 : 0x1a2a1a);
    mat.emissiveIntensity = 3;
  }
  parpadeo += dtReal;
  const blink = Math.floor(parpadeo * 2) % 2 === 0;
  const luz = { Verde: S.auto && !S.alarma, Ambar: !S.alarma && (S.paso === 'E3' || !S.auto), Roja: !!S.alarma && blink };
  for (const [n, { mat, col }] of Object.entries(G.baliza)) {
    mat.emissive.copy(luz[n] ? col : NEGRO);
    mat.emissiveIntensity = 3;
    mat.color.copy(col).multiplyScalar(luz[n] ? 1 : 0.25);
  }
  // la textura de cada banda avanza con su cinta (se ve cuando el motor esta en marcha)
  for (const [n, tex] of G.bandas) {
    if (n === 'Colector') tex.offset.y = S.banda[n] / 0.4; else tex.offset.x = -S.banda[n] / 0.4;
  }
  // H3: camion, puertas, AMR
  G.camion.position.x = CAM.dx;
  G.puertas[0].rotation.y = CAM.puertas * 1.5 * Math.PI;
  G.puertas[1].rotation.y = -CAM.puertas * 1.5 * Math.PI;
  G.amr.position.copy(B(R.x, R.y, 0));
  G.amr.rotation.set(0, R.yaw, 0);
  G.carro.position.y = R.carro;
  G.brazo.forEach((js, i) => {
    const s = i === 0 ? 1 : -1;
    const ang = ik(R.cara - CABEZAL - CARRO_X - HOMBRO_X, s * (SEP - HOMBRO_Y), s);
    js.forEach((j, n) => { j.rotation.set(0, ang[n], 0); });
  });
  G.amrFov.visible = R.vision;
  for (const m of G.ventosas) { m.emissive.setHex(0x3399ff); m.emissiveIntensity = R.vacio ? 4 : 0; }
  const colLidar = S.sig.LIDAR ? 0xff2020 : 0x22ff55;
  G.lidar.emissive.setHex(colLidar); G.lidar.color.setHex(colLidar);
  const colAmr = alarmaAMR() ? (blink ? 0xff2020 : 0x330000) : R.cola.length ? 0x22ff55 : 0xffa020;
  G.luzAmr.emissive.setHex(colAmr); G.luzAmr.color.setHex(colAmr);
  // operario de carga: visible en modo manual o mientras termina una recogida
  G.opCarga.visible = S.modoDescarga === 'manual' || !!OC.caja;
  G.opCarga.position.copy(B(OC.x, OC.y, Math.abs(Math.sin(OC.fase)) * 0.025));
  G.opCarga.rotation.set(0, OC.yaw, 0);
  G.opCargaBrazos.forEach((b) => b.rotation.set(0, 0, OC.brazos));
  // operario: gira el cuerpo y levanta los brazos (giro en Y de Blender = -Z de three)
  G.op.visible = OPE.estado !== 'ausente';
  G.op.position.copy(B(OPE.x, OPE.y, Math.abs(Math.sin(OPE.fase)) * 0.025));
  G.op.rotation.set(0, OPE.yaw, 0);
  const conEtq = $('chkEtiquetas').checked; // CSS2D no hereda la visibilidad del padre
  G.opEtq.visible = conEtq && G.op.visible;
  G.ocEtq.visible = conEtq && G.opCarga.visible;
  G.opBrazos[0].rotation.set(0, 0, OPE.brazoI);
  G.opBrazos[1].rotation.set(0, 0, OPE.brazoD);
  G.laser.visible = OPE.laser && !!OPE.caja;
  if (G.laser.visible) { // del lector de mano al sticker del bulto
    G.opLector.getWorldPosition(vA);
    vB.copy(B(OPE.caja.x, OPE.caja.y, OPE.caja.z + OPE.caja.h * 0.3));
    const d = vB.clone().sub(vA);
    G.laser.position.copy(vA).addScaledVector(d, 0.5);
    G.laser.scale.set(1, d.length(), 1);
    G.laser.quaternion.setFromUnitVectors(Y_ARRIBA, d.normalize());
  }
}

function redimensionar() {
  const w = cont.clientWidth, h = cont.clientHeight;
  renderer.setSize(w, h);
  composer.setSize(w, h);
  bloom.setSize(w, h);
  etiquetasR.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(redimensionar).observe(cont);

// ---------------- HMI ----------------
const ioDef = [['S_ING', 'Ingreso de bulto'], ['S_ZONA', 'Presencia en estación'], ['ENC', 'Encoder'], ['TRIG', 'Disparo de lectores'],
  ['M_ALIM', 'Marcha alimentador'], ['M_INSP', 'Marcha cinta inspección'], ['Y_VUVG', 'Electroválvula VUVG'], ['S_EXT', 'Cilindro extendido'],
  ['S_RET', 'Cilindro en reposo'], ['S_PASO', 'Paso a excepción'], ['S_EXC', 'Zona excepción ocupada'], ['REG', 'Solicitud de registro']];
const ioAmrDef = [['S_CAMION', 'Camión en posición'], ['S_CARGA', 'Punto de carga ocupado'], ['S_ACU', 'Acumulación llena'], ['M_ACU', 'Marcha acumulación'],
  ['VAC', 'Vacío en cabezales'], ['AGARRE', 'Agarre verificado'], ['LIDAR', 'Obstáculo (lidar)']];
const pintarIO = (def) => def.map(([n, d]) => `<div><span class="led" id="led_${n}"></span><span class="n">${n}</span><span class="d" id="io_${n}">${d}</span></div>`).join('');
$('io').innerHTML = pintarIO(ioDef);
$('ioAmr').innerHTML = pintarIO(ioAmrDef);
$('lectores').innerHTML = LECTORES.map(([r, d], i) => `<div class="lector" id="lec${i}"><b>${r}</b> <small>${d}</small><small id="lecT${i}">En espera</small></div>`).join('');

const cache = {};
function set(id, txt, cls) {
  const k = id + '|' + txt + '|' + cls;
  if (cache[id] === k) return;
  cache[id] = k;
  const el = $(id);
  el.textContent = txt;
  if (cls !== undefined) el.className = cls;
}
const fmtT = (t) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${(t % 60).toFixed(1).padStart(4, '0')}`;
const prom = (v) => v.reduce((s, x) => s + x, 0) / v.length;
const NOMBRE_CAM = { AUSENTE: 'Sin camión', LLEGANDO: 'Llegando al patio', ABRIENDO: 'Abriendo puertas', MANIOBRA: 'Maniobra al muelle', EN_POSICION: 'En posición de descarga', SALIENDO: 'Saliendo (vacío)' };

function actualizarHMI() {
  const c = S.ciclo, sg = S.sig;
  set('reloj', fmtT(S.t));
  set('badgePaso', `${S.paso} · ${NOMBRE_PASO[S.paso]}`, 'badge ' + S.paso.toLowerCase());
  set('modo', S.auto ? (S.stopReq ? 'DETENIENDO' : 'AUTOMÁTICO') : 'DETENIDO', 'modo ' + (S.auto ? 'on' : 'off'));
  const nom = { E0: 'Esperando bulto', E1: 'Identificando', E2: 'Registrando', E3: 'Derivando a excepción', E4: 'Finalizando', E5: 'Falla / intervención' };
  set('dEstado', S.fase === 'liberando' ? 'Ingresando bulto' : nom[S.paso], S.paso === 'E5' ? 'v-falla' : '');
  const r = c?.resultado ?? '—';
  set('dResultado', r, r === 'OK' ? 'v-ok' : r === 'No Read' ? 'v-nr' : r === '—' ? '' : 'v-falla');
  set('dCodigo', c?.codigo ?? '—', 'mono');
  const dsv = c?.desviador ?? (sg.S_RET ? 'En reposo' : 'Movimiento comandado');
  set('dDesviador', dsv, dsv.startsWith('Falla') ? 'v-falla' : dsv === 'En reposo' ? '' : 'v-nr');
  set('dId', c?.id ?? '—', 'mono');
  const reg = c?.registro ?? '—';
  set('dRegistro', reg, reg === 'Confirmado' ? 'v-ok' : reg === 'Incierto' ? 'v-falla' : reg === 'Pendiente' ? 'v-nr' : '');
  const enRev = S.cajas.filter((k) => ['caida', 'revision'].includes(k.modo)).length;
  const quien = { ausente: 'sin operario', llegando: 'operario en camino', yendose: 'operario retirándose' }[OPE.estado] ?? 'operario presente';
  set('dRev', OPE.caja ? OPE.txt : `${enRev}/${CAP_BIN} en el contenedor · ${quien}`, enRev >= CAP_BIN ? 'v-falla' : enRev ? 'v-nr' : '');
  const activos = Object.values(CASOS).filter(Boolean).length;
  set('btnCasos', `⚙ Escenarios${activos ? ` · ${activos} activos` : ''}`, 'btn-casos' + (activos ? ' on' : ''));
  document.querySelectorAll('[data-provocar]').forEach((b) => {
    const pend = !!FORZADO[b.dataset.provocar];
    if (b.classList.contains('pend') !== pend) { b.classList.toggle('pend', pend); b.textContent = pend ? 'En espera…' : 'Provocar'; }
  });
  if ($('chkOperario').checked !== S.operarioRev) $('chkOperario').checked = S.operarioRev;
  // H3
  set('dCamion', CAM.n ? `${CAM.n} · ${NOMBRE_CAM[CAM.estado]}` : NOMBRE_CAM[CAM.estado]);
  set('dCarga', `${S.cajas.filter((k) => k.modo === 'camion').length} / ${CAM.cargaIni || 36}`, 'mono');
  const rTxt = alarmaAMR() ? `${R.paso} · Detenido por alarma (sujeción conservada)` : R.paso === 'R0' ? `R0 · ${NOMBRE_R.R0}${R.motivo ? ': ' + R.motivo : ''}` : `${R.paso} · ${NOMBRE_R[R.paso]}`;
  set('dRobot', rTxt, alarmaAMR() ? 'v-falla' : R.paso === 'R0' ? '' : 'v-nr');
  set('dAcu', `${cajasAcu().length} / ${CAP_ACU}`, cajasAcu().length >= CAP_ACU ? 'v-nr mono' : 'mono');
  set('dVacio', R.vacio ? (sg.AGARRE ? 'Activo · agarre verificado' : 'Activo · verificando') : 'Sin vacío', R.vacio ? 'v-ok' : '');
  S.lect.forEach((l, i) => {
    const el = $('lec' + i), cls = 'lector ' + (l.estado === 'espera' ? '' : l.estado);
    if (el.className !== cls) el.className = cls;
    set('lecT' + i, l.txt);
  });
  for (const [n] of [...ioDef, ...ioAmrDef]) {
    const v = sg[n];
    const led = $('led_' + n);
    const cls = 'led' + (n === 'ENC' ? (v > 0.005 ? ' on' : '') : v ? (['Y_VUVG', 'S_EXC', 'S_ACU', 'LIDAR'].includes(n) ? ' amb' : ' on') : '');
    if (led.className !== cls) led.className = cls;
    if (n === 'ENC') set('io_ENC', `Encoder ${v.toFixed(2)} m/s${S.encQuieto > 0.2 ? ' · detenido' : ''}`);
  }
  const a = S.alarma;
  $('alarma').classList.toggle('oculto', !a);
  if (a) {
    set('alarmaTipo', a.titulo); set('alarmaCausa', a.causa);
    set('alarmaEstado', `${a.reconocida ? 'reconocida' : 'sin reconocer'} · ${a.resuelta ? 'causa resuelta' : 'causa presente'}`);
    $('btnResolver').disabled = a.resuelta;
  }
  const k = S.kpi;
  set('kProc', String(k.proc)); set('kOK', String(k.ok)); set('kNR', String(k.nr)); set('kAl', String(k.al));
  set('kTasa', k.proc ? `${((100 * k.ok) / k.proc).toFixed(0)} %` : '—');
  set('kCiclo', k.tiempos.length ? `${prom(k.tiempos).toFixed(1)} s` : '—');
  set('kCam', String(k.camiones)); set('kDesc', String(k.descargados));
  set('kRob', k.recogidas.length ? `${prom(k.recogidas).toFixed(1)} s` : '—');
  set('kMan', String(k.man)); set('kExp', String(k.exp));
  pintarComparacion();
  set('kEnCurso', String(S.cajas.filter((c) => c.modo !== 'camion').length));
  // botones: se ven atenuados cuando el PLC rechazaria el comando
  $('btnIniciar').classList.toggle('bloq', S.auto || !!a);
  $('btnIniciar').classList.toggle('pulso', !S.auto && !a && S.kpi.proc === 0);
  $('btnDetener').classList.toggle('bloq', !S.auto);
  $('btnReconocer').classList.toggle('bloq', !a || a.reconocida);
  $('btnRearmar').classList.toggle('bloq', !a || !a.reconocida || !a.resuelta);
  // GRAFCET y secuencia del AMR
  document.querySelectorAll('[data-paso]').forEach((el) => el.classList.toggle('activa', el.dataset.paso === S.paso));
  document.querySelectorAll('[data-rpaso]').forEach((el) => el.classList.toggle('activa', el.dataset.rpaso === R.paso));
}

const REF = (window.FLEXSIM?.h3?.escenarios || []).filter((e) => ['AMR_base', 'Manual_asistida'].includes(e.nombre));
let compPintada = -1;
function pintarComparacion() {
  if (compPintada === S.comparacion.length) return;
  compPintada = S.comparacion.length;
  const filas = S.comparacion.slice(0, 6).map((c) => `<tr><td>${c.n}</td><td>${c.modo}</td><td class="num">${c.min.toFixed(1)}</td><td class="num">${c.bph.toFixed(0)}</td></tr>`).join('');
  const ref = REF.map((e) => `<tr class="ref"><td>FlexSim</td><td>${e.nombre === 'AMR_base' ? 'AMR' : 'Manual asistida'}</td><td class="num">${e.descarga_min.media.toFixed(1)}</td><td class="num">${(36 / e.descarga_min.media * 60).toFixed(0)}</td></tr>`).join('');
  $('tabComp').innerHTML = '<thead><tr><th>Camión</th><th>Descargó</th><th class="num">min</th><th class="num">bultos/h</th></tr></thead><tbody>' +
    (filas || '<tr><td colspan="4">Todavía no se descargó ningún camión.</td></tr>') + ref + '</tbody>';
}

// ---------------- demo guiada ----------------
let demo = null;
const cuadro = () => new Promise((r) => requestAnimationFrame(r));
async function esperar(cond, maxSim = 300) { const t0 = S.t; while (demo?.activo && !cond() && S.t - t0 < maxSim) await cuadro(); }
async function pausa(seg) { const t0 = performance.now(); while (demo?.activo && performance.now() - t0 < seg * 1000) await cuadro(); }
function cartel(titulo, texto) { $('demoTit').textContent = titulo; $('demoTxt').textContent = texto; }
function velocidad(v) { document.querySelector(`[data-vel="${v}"]`).click(); }
function forzarBulto(v) { S.forzar = v; }
function setCasos(valores) { Object.assign(CASOS, valores); document.querySelectorAll('[data-caso]').forEach((c) => { c.checked = CASOS[c.dataset.caso]; }); }
async function correrDemo() {
  demo = { activo: true, casos: { ...CASOS }, operario: S.operarioRev };
  setCasos(Object.fromEntries(Object.keys(CASOS).map((k) => [k, false]))); // la demo muestra el flujo normal y fuerza cada caso
  $('panelCasos').classList.add('oculto');
  $('demo').classList.remove('oculto'); $('btnDemo').classList.add('on'); $('btnDemo').textContent = '■ Demo en curso';
  S.modoDescarga = 'amr'; $('selModo').value = 'amr';
  if (S.alarma) { cartel('Demo guiada', 'Hay una alarma activa: la resuelvo antes de empezar.'); if (!S.alarma.reconocida) cmdReconocer(); cmdResolver(); cmdRearmar(); }
  if (!S.auto) cmdIniciar();
  const D = demo;
  const pasos = async () => {
    cartel('1 · Llega el camión', 'El camión frena antes del muelle, abre las puertas y retrocede. Cuando el sensor S_CAMION confirma la posición, el PLC puede autorizar recogidas.');
    irCamara('planta'); velocidad(2);
    await esperar(() => S.sig.S_CAMION);
    cartel('2 · El AMR va a buscar un bulto', 'El PLC autoriza la recogida: hay camión en posición, automático habilitado y lugar en la acumulación (máx. 3). El robot gira fuera del camión y sube el carro a la altura del bulto.');
    irCamara('descarga'); velocidad(1);
    await esperar(() => R.paso === 'R2');
    cartel('3 · Visión 3D', 'La cámara del mástil localiza el bulto y su cara frontal. Se retira de arriba hacia abajo y desde la puerta, para no desestabilizar la carga.');
    await esperar(() => R.paso === 'R3');
    cartel('4 · Agarre con vacío', 'Los dos brazos apoyan los cabezales multiventosa lado a lado sobre la cara frontal. Se activa el vacío y se verifica el agarre antes de retirar.');
    await esperar(() => R.paso === 'R5');
    cartel('5 · Depósito en la acumulación', 'Con el punto de carga libre (S_CARGA), extiende los brazos sobre la cinta, apoya el bulto y libera las ventosas.');
    await esperar(() => R.paso === 'R6');
    cartel('6 · Un bulto por ciclo', 'En E0 la acumulación libera un solo bulto hacia el alimentador. S_ING lo detecta y se crea el ID del ciclo.');
    irCamara('general'); velocidad(2);
    await esperar(() => S.fase === 'transporte' || S.fase === 'parada');
    velocidad(1);
    await esperar(() => S.fase === 'lectura');
    cartel('7 · Lectura multidireccional (E1)', 'Con el bulto detenido (el encoder lo confirma), se disparan los 6 lectores. Verde: leyó el código. Ámbar: adquisición correcta sin código.');
    velocidad(0.5);
    await esperar(() => S.fase !== 'lectura');
    velocidad(1);
    if (S.paso === 'E2') {
      cartel('8 · Registro y salida (E2 → E4)', 'Lectura OK: el bulto queda retenido hasta que el ERP confirma el registro para el mismo ID. Recién ahí sale por la línea principal.');
      await esperar(() => S.paso === 'E0');
    }
    forzarBulto('NOREAD');
    cartel('9 · No Read y desvío (E3)', 'Fuerzo un No Read en el próximo bulto. El cilindro solo se habilita con el bulto presente, la cinta detenida, S_RET y la zona de excepción libre.');
    velocidad(4);
    await esperar(() => S.paso === 'E3');
    irCamara('desvio'); velocidad(1);
    await esperar(() => S.fase === 'cierreDesvio' || S.paso === 'E0');
    cartel('10 · Revisión manual', 'El No Read queda en el contenedor hasta que venga un operario. Lo llamo: llega por la senda, lee los bultos uno por uno con el lector de mano y los manda por la cinta de retorno a expedición.');
    irCamara('revision');
    S.operarioRev = true;
    await esperar(() => OPE.estado === 'leer');
    await esperar(() => OPE.estado === 'espera');
    forzarBulto('FALLA_REG');
    cartel('11 · Falla de registro (E5)', 'Fuerzo que el ERP no confirme el registro. Al vencer el tiempo máximo, el PLC pasa a E5, retiene el bulto y conserva el código.');
    irCamara('general'); velocidad(4);
    await esperar(() => S.paso === 'E2');
    velocidad(1);
    await esperar(() => S.paso === 'E5');
    await pausa(2.5);
    cartel('12 · Reconocer no alcanza', 'El operador reconoce la alarma, pero eso no elimina la causa ni rearma el sistema.');
    cmdReconocer(); await pausa(3);
    cartel('13 · Resolver y rearmar', 'Vuelve la conexión: se consulta por ID y el registro ya existía, así que no se duplica. Con el rearme deliberado pasa de E5 a E4 y el bulto sale.');
    cmdResolver(); await pausa(2.5); cmdRearmar();
    await esperar(() => S.paso === 'E0');
    S.forzarRobot = 'OBSTACULO';
    cartel('14 · Obstrucción en el recorrido del AMR', 'Fuerzo un obstáculo en el camino del robot. El lidar lo detecta: el robot y la acumulación se detienen y el bulto sigue sujeto con vacío.');
    irCamara('descarga'); velocidad(4);
    await esperar(() => alarmaAMR(), 600);
    velocidad(1); await pausa(3);
    cmdReconocer(); await pausa(1.5); cmdResolver();
    cartel('15 · Se retira el obstáculo', 'El operario saca el cono, se reconoce la alarma y se rearma: el AMR continúa con el bulto que tenía sujeto.');
    await pausa(2); cmdRearmar();
    await esperar(() => R.paso === 'R6');
    cartel('16 · Destino común: expedición', 'Los OK de la línea principal y los No Read leídos a mano terminan en el mismo colector, que los lleva a expedición. El sistema sigue solo.');
    irCamara('planta'); velocidad(2);
    await pausa(8);
  };
  await pasos();
  if (D === demo) salirDemo();
}
function salirDemo() {
  if (demo) { demo.activo = false; setCasos(demo.casos); S.operarioRev = demo.operario; }
  demo = null;
  $('demo').classList.add('oculto'); $('btnDemo').classList.remove('on'); $('btnDemo').textContent = '▶ Demo guiada';
}

// ---------------- eventos UI ----------------
$('btnIniciar').onclick = cmdIniciar;
$('btnDetener').onclick = cmdDetener;
$('btnReconocer').onclick = cmdReconocer;
$('btnRearmar').onclick = cmdRearmar;
$('btnResolver').onclick = cmdResolver;
$('casosGrid').innerHTML = CASOS_DEF.map(([id, tit, desc, prob]) => `<div class="caso">
  <label class="sw" title="Habilitar el caso"><input type="checkbox" role="switch" data-caso="${id}" aria-label="${tit}"><span></span></label>
  <div class="caso-txt"><b>${tit}</b><small>${desc}${prob ? ` Ocurre en el ${Math.round(prob * 100)} % de las oportunidades.` : ''}</small></div>
  ${prob ? `<button class="btn-prov" data-provocar="${id}">Provocar</button>` : ''}</div>`).join('');
document.querySelectorAll('[data-caso]').forEach((c) => {
  c.onchange = () => {
    CASOS[c.dataset.caso] = c.checked;
    log('Interfaz de simulación', `Caso atípico "${CASOS_DEF.find((d) => d[0] === c.dataset.caso)[1]}" ${c.checked ? 'habilitado' : 'deshabilitado'}.`, 'Escenario de prueba.', '', '—');
  };
});
document.querySelectorAll('[data-provocar]').forEach((b) => { b.onclick = () => { FORZADO[b.dataset.provocar] = true; }; });
$('btnCasos').onclick = () => $('panelCasos').classList.toggle('oculto');
$('btnCasosCerrar').onclick = () => $('panelCasos').classList.add('oculto');
$('chkOperario').onchange = (e) => { S.operarioRev = e.target.checked; };
document.querySelectorAll('[role="tab"]').forEach((t) => {
  t.onclick = () => document.querySelectorAll('[role="tab"]').forEach((x) => {
    const on = x === t;
    x.setAttribute('aria-selected', String(on));
    $(x.getAttribute('aria-controls')).hidden = !on;
  });
});
$('chkRobot').onchange = (e) => { S.robotOn = e.target.checked; };
$('selModo').onchange = (e) => {
  S.modoDescarga = e.target.value;
  log('Interfaz de operación', e.target.value === 'manual'
    ? 'Modo de descarga: operario manual asistido (H2, referencia). El AMR termina su recogida y queda en espera.'
    : 'Modo de descarga: AMR de dos brazos (H3). El operario termina su recogida y libera la zona.', 'Comando aceptado.');
};
$('btnDemo').onclick = () => (demo ? salirDemo() : correrDemo());
$('btnDemoSalir').onclick = salirDemo;
$('rngOK').oninput = (e) => { P.pctOK = +e.target.value; $('lblOK').textContent = e.target.value; };
$('chkEtiquetas').onchange = (e) => etiquetas.forEach((o) => { o.visible = e.target.checked; });
document.querySelectorAll('[data-cam]').forEach((b) => { b.onclick = () => irCamara(b.dataset.cam); });
document.querySelectorAll('[data-vel]').forEach((b) => {
  b.onclick = () => {
    S.vel = +b.dataset.vel;
    document.querySelectorAll('[data-vel]').forEach((x) => x.classList.toggle('on', x === b));
  };
});

// ---------------- bucle ----------------
log('PLC', 'Sistema energizado con movimientos inhibidos. Estación libre, desviador en reposo (S_RET), AMR en posición de espera, sin ciclo pendiente.', 'Condiciones iniciales verificadas.');
let tPrev = performance.now(), tHmi = 0;
function bucle(now) {
  const dtReal = Math.min(0.1, (now - tPrev) / 1000);
  tPrev = now;
  let dt = dtReal * S.vel;
  if (raiz) {
    while (dt > 0) { // pasos chicos para que los sensores no se salteen eventos a velocidades altas
      const h = Math.min(dt, 0.02);
      S.t += h;
      camion(h);
      robot(CASOS.sobrecarga ? h * 4 : h); // caso atipico: el AMR entrega mas rapido de lo que la estacion consume
      operarioCarga(h);
      operario(h);
      fisica(h);
      paso(h);
      dt -= h;
    }
  }
  if (camTween) {
    camTween.k = Math.min(1, camTween.k + dtReal / 0.9);
    const e = 1 - (1 - camTween.k) ** 3;
    camera.position.lerpVectors(camTween.p0, camTween.p, e);
    controls.target.lerpVectors(camTween.t0, camTween.t, e);
    if (camTween.k >= 1) camTween = null;
  }
  controls.update();
  actualizar3D(dtReal);
  tHmi += dtReal;
  if (tHmi > 0.08) { tHmi = 0; actualizarHMI(); }
  composer.render();
  etiquetasR.render(scene, camera);
  requestAnimationFrame(bucle);
}
redimensionar();
requestAnimationFrame(bucle);
