// Escenarios y casos atípicos · IMPORTACIÓN (isla 360° + ETIQUETAS).
// Adaptado de DOCUMENTACION.md §5.3 (simulación de referencia, TracePack E0–E5)
// a la línea de importación: camión → cinta → isla (plato de vidrio + C1/C2/C3,
// cada cámara con su luz) → pallet/expedición, con brazo de desvío neumático
// (S_EXT/S_RET) y cinta de desvío con tope (máx. 8, S_EXC).
//
// API: { CASOS, initEscenarios, ocurre, forzarProximo }.
//   CASOS[id]        bool por caso: prendido = puede salir al azar.
//   ocurre(id, ctx)  true si el caso sale en esta oportunidad (consume el
//                    forzado; si no, sortea con la probabilidad del caso).
//                    ctx = { resultado } para los casos que solo valen en
//                    cierto resultado ('OK' o 'NOREAD'/'DATO'/'LINEA').
//   forzarProximo(id) "Provocar": el caso sale en la próxima oportunidad
//                    válida aunque su interruptor esté apagado.
//   initEscenarios({S, P, log}) arma el panel (interruptor + Provocar por
//                    caso, chkOperario, chkPlato, rngOK) y devuelve
//                    { flags, casos, setCasos, lecturaOK }.
//
// Dónde se sortea cada caso (para main.js):
//   E1 transporte .... ocurre('cruzada') ......... el bulto se traba y vence
//                      el tiempo de S_ZONA → E5 ('atasco').
//   E1 giro .......... !flags.plato || ocurre('plato') → el plato vibra y no
//                      confirma la detención → E5 ('plato').
//   E1 lectura ....... const pct = lecturaOK(); // base rngOK, 60 % si hay
//                      etiquetas dañadas; sorteo OK/NO OK; después:
//                      ocurre('lectura') → COMUNIC (se pierde C1/C2) o CONTRA
//                      (C1 y C2 se contradicen) → E5 ('lectura'). NO es NO OK.
//                      ocurre('luz') → destello débil: se penaliza la
//                      confianza; bajo el umbral → E5 ('iluminacion').
//   E2 (solo OK) ..... ocurre('erp', {resultado:'OK'}) → vence tMaxRegistro
//                      con el bulto retenido → E5 ('registro').
//   E3 (solo NO OK) .. ocurre('aire', {resultado}) → falta S_EXT → E5.
//                      ocurre('trabada', {resultado}) → falta S_PASO → E5.
//
// Rearme deliberado (igual que la referencia): reconocer → resolver la causa
// en planta → rearmar. Destino por caso en cada ficha (campo `rearme`).

// [id, título, descripción, prob. por oportunidad (null = permanente),
//  oportunidad, alarma E5 {tipo, título, causa}, resolución, destino de rearme]
const CASOS_DEF = [
  {
    id: 'cruzada', titulo: 'Bulto cruzado en la entrada', prob: 0.35,
    desc: 'El bulto entra cruzado y se traba antes de la isla: vence el tiempo de S_ZONA y el PLC va a E5. El operario la endereza y con el rearme sigue con el mismo ID.',
    oportunidad: 'por bulto, en el transporte a la isla',
    alarma: { tipo: 'atasco', titulo: 'Falla de posicionamiento', causa: 'S_ZONA no confirmó la llegada dentro del tiempo máximo: bulto cruzado y trabada antes de la isla.' },
    resolucion: 'El operario endereza el bulto y libera la entrada.',
    rearme: 'E1: retoma el traslado a la isla con el mismo ID.',
  },
  {
    id: 'trabada', titulo: 'Bulto trabado en los rodillos de desvío', prob: 0.5,
    solo: ['NOREAD', 'NO_OK', 'DATO', 'LINEA'],
    desc: 'El NO OK se atasca en los rodillos y no confirma S_PASO: alarma de desvío y E5. Al destrabarla sigue a revisión y el ciclo se cierra documentado.',
    oportunidad: '50 % de los NO OK, en el paso por el desvío',
    alarma: { tipo: 'desvio', titulo: 'Alarma de desvío', causa: 'Falta confirmación de paso del bulto (S_PASO): quedó trabado en los rodillos.' },
    resolucion: 'El operario destraba los rodillos; el bulto sigue a la cinta de desvío.',
    rearme: 'E0: ciclo cerrado y documentado, isla libre.',
  },
  {
    id: 'etiquetas', titulo: 'Etiquetas dañadas (impresión corrida)', prob: null,
    desc: 'Mientras está prendido la lectura OK cae al 60 %: hay más NO OK y la cinta de desvío se llena antes. No es falla: cada bulto va a E3 y a revisión.',
    oportunidad: 'permanente mientras está prendido',
    alarma: null, // condición, no falla: no dispara E5 por sí mismo
    resolucion: 'Avisar a impresión (cabezal de la impresora, ribbon) y reponer etiquetas.',
    rearme: 'Sin rearme: al apagarlo la lectura vuelve a la base.',
  },
  {
    id: 'erp', titulo: 'ERP sin respuesta', prob: 0.3,
    solo: ['OK'],
    desc: 'El registro de una OK no se confirma en tiempo: E5 con el bulto retenido. Se consulta por ID, el registro ya existía y no se duplica: con el rearme pasa a E4 y sale a pallet.',
    oportunidad: '30 % de los OK, en el registro',
    alarma: { tipo: 'registro', titulo: 'Alarma de registro', causa: 'Venció el tiempo de espera sin confirmación. Bulto retenido en la isla; código conservado.' },
    resolucion: 'Vuelve la conexión: se consulta por ID y se recupera la confirmación sin duplicar.',
    rearme: 'E4: sale a pallet y expedición.',
  },
  {
    id: 'aire', titulo: 'Falta de aire comprimido', prob: 0.4,
    solo: ['NOREAD', 'NO_OK', 'DATO', 'LINEA'],
    desc: 'El brazo no llega a extender: falta S_EXT al desviar una NO OK y salta la alarma de desvío (E5). Se purga, se verifica la electroválvula y el bulto va a revisión.',
    oportunidad: '40 % de los NO OK, en la extensión del brazo',
    alarma: { tipo: 'desvio', titulo: 'Alarma de desvío', causa: 'Falta confirmación de extensión (S_EXT) dentro del tiempo máximo: sin presión el brazo no empuja.' },
    resolucion: 'El operario purga la línea y verifica aire y electroválvula; el bulto se lleva a revisión.',
    rearme: 'E0: ciclo cerrado y documentado, isla libre.',
  },
  {
    id: 'lectura', titulo: 'Lectura inválida (C1/C2)', prob: 0.2,
    desc: 'C1 y C2 se contradicen o se pierde comunicación con una cámara: va a E5 y NO se trata como NO OK. Se verifican cámaras y comunicación.',
    oportunidad: '20 % por bulto, en la lectura de la isla',
    alarma: { tipo: 'lectura', titulo: 'Lectura inválida', causa: 'C1 y C2 leen datos distintos, o se perdió comunicación con una cámara durante el giro. No se trata como NO OK.' },
    resolucion: 'El operario verifica cámaras, luces y comunicación; el bulto se lleva a revisión.',
    rearme: 'E0: ciclo cerrado y documentado, isla libre.',
  },
  {
    id: 'plato', titulo: 'Plato descentrado', prob: 0.25,
    desc: 'El plato vibra y no frena clavado en la marca: no se confirma la detención y el PLC va a E5. Se recentra y con el rearme se repite el giro con el mismo bulto.',
    oportunidad: '25 % por bulto, en el giro del plato',
    alarma: { tipo: 'plato', titulo: 'Falta de detención', causa: 'El plato vibra (descentrado) y no confirmó la parada clavada en la marca dentro del tiempo máximo.' },
    resolucion: 'El operario recentra el plato y verifica que frene en la marca.',
    rearme: 'E1: reintento de giro con el mismo bulto e ID.',
  },
  {
    id: 'luz', titulo: 'Luz parpadeante', prob: 0.3,
    desc: 'Una luz destella débil y la confianza de la lectura baja. Si cae bajo el umbral pide limpieza del difusor (E5); si no, el bulto va a revisión como REVISAR.',
    oportunidad: '30 % por bulto, en la lectura de la isla',
    alarma: { tipo: 'iluminacion', titulo: 'Iluminación inestable', causa: 'Destello débil o parpadeante: la confianza cayó bajo el umbral y la lectura no es válida.' },
    resolucion: 'El operario limpia el difusor y verifica el destello.',
    rearme: 'E1: se repiten giro y fotos con el mismo bulto.',
  },
];

export const CASOS = Object.fromEntries(CASOS_DEF.map((c) => [c.id, false]));
const FORZADO = {}; // "Provocar": sale en la próxima oportunidad válida aunque esté apagado

// Condición de planta (interruptores del panel, no casos): se sincronizan con
// S/P en initEscenarios; main.js los lee desde lo que devuelve init.
const flags = { operario: false, plato: true, pctOK: 92 };
const CAP_REVISION = 8; // la cinta de desvío frena hasta 8 bultos (tope); llena, S_EXC bloquea el desvío (espera normal)

const norm = (r) => String(r ?? '').toUpperCase().replace(/\s+/g, '_');

export function ocurre(id, contexto) {
  const def = CASOS_DEF.find((c) => c.id === id);
  if (!def) return false;
  // Oportunidad válida: los casos de desvío solo valen en NO OK y el del ERP
  // solo en OK. Si no corresponde, no se consume el forzado: queda pendiente
  // para la próxima oportunidad válida.
  if (contexto && contexto.resultado && def.solo && !def.solo.includes(norm(contexto.resultado))) return false;
  if (FORZADO[id]) { FORZADO[id] = false; refrescarBoton(id); return true; }
  if (id === 'plato' && !flags.plato) return true; // planta descentrada: vibra en todos los giros hasta recentrar
  if (def.prob == null) return !!CASOS[id]; // permanente mientras está prendido
  return !!CASOS[id] && Math.random() < def.prob;
}

export function forzarProximo(id) {
  if (!CASOS_DEF.some((c) => c.id === id)) return false;
  FORZADO[id] = true;
  refrescarBoton(id);
  return true;
}

function refrescarBoton(id) {
  const doc = globalThis.document;
  if (!doc || typeof doc.querySelector !== 'function') return;
  const b = doc.querySelector(`[data-provocar="${id}"]`);
  if (!b) return;
  const pend = !!FORZADO[id];
  b.classList.toggle('pend', pend);
  b.textContent = pend ? 'En espera…' : 'Provocar';
}

// Lectura OK base (rngOK, 50–100 %) con el degradado de etiquetas dañadas.
// Llamar UNA sola vez por bulto: consume el forzado de 'etiquetas' si lo hay.
function lecturaOK() {
  const base = flags.pctOK;
  return ocurre('etiquetas') ? Math.min(base, 60) : base;
}

function setCasos(valores) {
  Object.assign(CASOS, valores);
  const doc = globalThis.document;
  if (!doc || typeof doc.querySelectorAll !== 'function') return;
  doc.querySelectorAll('[data-caso]').forEach((c) => { c.checked = !!CASOS[c.dataset.caso]; });
}

function avisar(log, titulo, prendido) {
  if (typeof log === 'function') log('Interfaz de simulación', `Caso atípico "${titulo}" ${prendido ? 'habilitado' : 'deshabilitado'}.`, 'Escenario de prueba.');
}

// Estilos del panel (los mismos de la referencia; la hoja de la facultad no
// los trae). Se inyectan una sola vez.
function asegurarEstilos(doc) {
  if (!doc || doc.getElementById('estilos-escenarios')) return;
  const st = doc.createElement('style');
  st.id = 'estilos-escenarios';
  st.textContent = [
    '.casos-cab{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}',
    '.casos-cab b{display:block;font-size:.95rem}',
    '.casos-cab small{color:var(--tenue);font-size:.76rem}',
    '.casos-cab button{flex:none;background:transparent;border:1px solid var(--borde);color:var(--tenue);border-radius:4px;padding:3px 8px;cursor:pointer;font:inherit;font-size:.75rem}',
    '.casos-oper{display:grid;grid-template-columns:1.3fr 1fr 1fr;gap:8px;margin:10px 0}',
    '.casos-oper>label{background:var(--panel2);border-radius:6px;padding:8px 10px;font-size:.8rem}',
    '.sw-fila{display:flex;gap:10px;align-items:flex-start;cursor:pointer}',
    '.sw-fila b{display:block}.sw-fila small{color:var(--tenue);font-size:.72rem}',
    '.rng{display:flex;flex-direction:column;gap:6px}',
    '.rng b{display:block;font-size:.8rem}.rng small{color:var(--tenue);font-size:.72rem}',
    '.rng input{width:100%}',
    '.casos-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(255px,1fr));gap:8px}',
    '.caso{display:flex;gap:10px;align-items:flex-start;background:var(--panel);border:1px solid var(--borde);border-left:3px solid var(--borde);border-radius:6px;padding:9px 10px}',
    '.caso:has(input:checked){border-left-color:var(--nr);background:#241d10}',
    '.caso-txt{flex:1;min-width:0}.caso-txt b{display:block;font-size:.82rem}',
    '.caso-txt small{display:block;color:var(--tenue);font-size:.72rem;line-height:1.35;margin-top:2px}',
    '.btn-prov{flex:none;align-self:center;font:inherit;font-size:.72rem;font-weight:600;padding:5px 8px;border-radius:4px;cursor:pointer;background:transparent;color:var(--acento);border:1px solid var(--acento)}',
    '.btn-prov.pend{color:var(--nr);border-color:var(--nr)}',
    '.btn-prov:focus-visible{outline:2px solid var(--acento);outline-offset:2px}',
    '.sw{position:relative;flex:none;width:36px;height:20px;margin-top:1px}',
    '.sw input{position:absolute;opacity:0;width:100%;height:100%;margin:0;cursor:pointer;z-index:1}',
    '.sw span{position:absolute;inset:0;background:#3a4552;border-radius:10px;transition:background .15s}',
    '.sw span::after{content:"";position:absolute;left:3px;top:3px;width:14px;height:14px;border-radius:50%;background:#dfe6ec;transition:transform .15s}',
    '.sw input:checked+span{background:var(--nr)}',
    '.sw input:checked+span::after{transform:translateX(16px)}',
    '.sw input:focus-visible+span{outline:2px solid var(--acento);outline-offset:2px}',
    '@media(max-width:760px){.casos-oper{grid-template-columns:1fr}}',
    '@media(prefers-reduced-motion:reduce){.sw span,.sw span::after{transition:none}}',
  ].join('\n');
  doc.head.appendChild(st);
}

// Si el HTML no trae el interruptor del plato (chkPlato), se agrega al lado
// de los otros interruptores de condición.
function asegurarChkPlato(doc) {
  if (!doc || doc.getElementById('chkPlato')) return;
  const oper = doc.querySelector('.casos-oper');
  if (!oper) return;
  const lab = doc.createElement('label');
  lab.className = 'sw-fila';
  lab.innerHTML = '<span class="sw"><input type="checkbox" role="switch" id="chkPlato" checked><span></span></span> ' +
    '<span><b>Plato de vidrio centrado</b><small>Apagado: el plato queda descentrado (vibra) y cada bulto pide intervención en E5 hasta recentrarlo.</small></span>';
  oper.appendChild(lab);
}

export function initEscenarios(opts = {}) {
  const { S = null, P = null, log = null } = opts;
  const doc = opts.document ?? globalThis.document;
  if (S) {
    if (typeof S.operarioRev === 'boolean') flags.operario = S.operarioRev;
    if (typeof S.platoOK === 'boolean') flags.plato = S.platoOK;
  }
  if (P && isFinite(+P.pctOK)) flags.pctOK = Math.min(100, Math.max(50, +P.pctOK));
  if (!doc || typeof doc.getElementById !== 'function') return { flags, casos: CASOS_DEF, setCasos, lecturaOK, CAP_REVISION };

  asegurarEstilos(doc);
  asegurarChkPlato(doc);

  const grid = doc.getElementById('casosGrid');
  if (grid && !grid.dataset.init) {
    grid.dataset.init = '1';
    grid.innerHTML = CASOS_DEF.map((c) => {
      const pct = c.prob == null ? 'Permanente mientras está prendido.' : `Sale en el ${Math.round(c.prob * 100)} % de las oportunidades (${c.oportunidad}).`;
      return `<div class="caso"><label class="sw" title="Habilitar el caso"><input type="checkbox" role="switch" data-caso="${c.id}" aria-label="${c.titulo}"><span></span></label>` +
        `<div class="caso-txt"><b>${c.titulo}</b><small>${c.desc} ${pct}</small></div>` +
        `<button class="btn-prov" data-provocar="${c.id}" type="button">Provocar</button></div>`;
    }).join('');
    grid.querySelectorAll('[data-caso]').forEach((sw) => {
      sw.checked = !!CASOS[sw.dataset.caso];
      sw.onchange = () => {
        CASOS[sw.dataset.caso] = sw.checked;
        const def = CASOS_DEF.find((c) => c.id === sw.dataset.caso);
        avisar(log, def ? def.titulo : sw.dataset.caso, sw.checked);
      };
    });
    grid.querySelectorAll('[data-provocar]').forEach((b) => {
      b.onclick = () => {
        forzarProximo(b.dataset.provocar);
        const def = CASOS_DEF.find((c) => c.id === b.dataset.provocar);
        if (typeof log === 'function' && def) log('Interfaz de simulación', `Caso "${def.titulo}" provocado: sale en la próxima oportunidad.`, 'Escenario de prueba.');
      };
    });
  }

  const chkOp = doc.getElementById('chkOperario');
  if (chkOp && !chkOp.dataset.init) {
    chkOp.dataset.init = '1';
    chkOp.checked = flags.operario;
    chkOp.onchange = (e) => {
      flags.operario = e.target.checked;
      if (S) S.operarioRev = flags.operario;
      if (typeof log === 'function') log('Interfaz de operación', flags.operario
        ? `Operario de revisión en planta: viene y lee los NO OK uno por uno en la cinta de desvío (tope de ${CAP_REVISION}).`
        : `Sin operario: los NO OK se juntan en la cinta de desvío (tope de ${CAP_REVISION}); llena, S_EXC bloquea el desvío.`, 'Comando aceptado.');
    };
  }
  const chkPl = doc.getElementById('chkPlato');
  if (chkPl && !chkPl.dataset.init) {
    chkPl.dataset.init = '1';
    chkPl.checked = flags.plato;
    chkPl.onchange = (e) => {
      flags.plato = e.target.checked;
      if (S) S.platoOK = flags.plato;
      if (typeof log === 'function') log('Interfaz de operación', flags.plato
        ? 'Plato de vidrio centrado y habilitado: gira 360° y frena en la marca.'
        : 'Plato descentrado: vibra en cada giro y cada bulto pide intervención en E5 hasta recentrarlo.', 'Comando aceptado.');
    };
  }
  const rng = doc.getElementById('rngOK');
  const lbl = doc.getElementById('lblOK');
  if (rng && !rng.dataset.init) {
    rng.dataset.init = '1';
    rng.min = '50'; rng.max = '100'; rng.value = String(flags.pctOK);
    if (lbl) lbl.textContent = String(flags.pctOK);
    rng.oninput = (e) => {
      flags.pctOK = Math.min(100, Math.max(50, +e.target.value || 92));
      if (P) P.pctOK = flags.pctOK;
      if (lbl) lbl.textContent = String(flags.pctOK);
    };
  }
  const btnCasos = doc.getElementById('btnCasos');
  const panel = doc.getElementById('panelCasos');
  if (btnCasos && panel && !btnCasos.dataset.init) {
    btnCasos.dataset.init = '1';
    btnCasos.onclick = () => panel.classList.toggle('oculto');
  }
  const btnCerrar = doc.getElementById('btnCasosCerrar');
  if (btnCerrar && panel && !btnCerrar.dataset.init) {
    btnCerrar.dataset.init = '1';
    btnCerrar.onclick = () => panel.classList.add('oculto');
  }

  return { flags, casos: CASOS_DEF, setCasos, lecturaOK, CAP_REVISION };
}
