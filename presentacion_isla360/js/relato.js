// Relato de la presentación · IMPORTACIÓN (Facultad, TracePack).
// Las cajas SE BAJAN DEL CAMIÓN y las cintas corren AL REVÉS vs exportación:
// camión → descarga → isla (plato + 3 cámaras) → pallet/expedición.
// Módulo desacoplado: no toca el estado global S; avisa por onPaso(p, i).
// API: { PASOS, CAMS, FALTA, initRelato, irPaso, siguiente, anterior, ponerPlay }

export const CAMS = {
  general:   { p: [-2.5, 7.2, 11.0],  t: [-0.8, 0.4, 0.6] },
  descarga:  { p: [-4.6, 3.4, -5.2],  t: [-9.4, 1.0, 0.2] },
  camion:    { p: [-6.2, 2.4, -3.6],  t: [-10.5, 1.2, 0] },
  isla:      { p: [1.75, 2.45, -2.95], t: [-0.25, 1.05, 0] },
  giro:      { p: [0.75, 1.42, -1.6],  t: [-0.2, 0.86, 0] },
  sup:       { p: [0.55, 1.62, -1.65], t: [-0.2, 1.72, 0] },
  inf:       { p: [0.55, 0.42, -1.75], t: [-0.2, 0.42, 0] },
  lat:       { p: [-1.35, 1.25, -1.5], t: [-0.15, 0.92, -0.45] },
  monitor1:  { p: [-2.35, 1.45, -3.0], t: [-1.45, 1.3, -1.55] },
  pusher:    { p: [4.6, 3.0, -3.0],   t: [1.9, 0.7, 1.2] },
  revision:  { p: [0.4, 3.1, 7.9],    t: [-0.8, 0.6, 3.4] },
  monitor2:  { p: [0.06, 1.42, 5.75], t: [-0.1, 1.3, 4.1] },
  pallet:    { p: [8.6, 3.0, 4.4],    t: [6.2, 0.6, 0.2] },
  expedicion:{ p: [10.6, 3.4, -6.0],  t: [7.0, 0.6, -1.0] },
  arriba:    { p: [0.0, 15.5, 2.5],   t: [0.0, 0, 0.9] },
};
CAMS.planta = CAMS.general; CAMS.desvio = CAMS.pusher; CAMS.lectores = CAMS.giro;   // botones de la barra del visor


export const FALTA = [
  ['Ritmo real de la línea', 'medir cuántos bultos por minuto bajan del camión (la simulación usa un valor ilustrativo).'],
  ['Tamaños de bulto', 'el plato de Ø 0,72 m cubre los 4 formatos del TPI; confirmar el más grande antes de fijar la celda.'],
  ['Integración con el PLC', 'sumar a la tabla de E/S del S7-1200 el encoder del plato, el disparo de las 3 cámaras y la presencia en la isla.'],
  ['Etiquetas reales', 'la demo usa una maqueta estilo Correo Argentino, sin datos reales: falta probar con etiquetas impresas del operador.'],
  ['Luz y óptica', 'elegir lentes y anillos según la distancia de cada cámara y verificar la foto con el plato girando.'],
  ['FlexSim', 'volver a correr los experimentos H3 con el tiempo de ciclo de la isla (3,2 s por vuelta).'],
];

const TOUR_ISLA = ['fotocelula', 'plato', 'camaraSup', 'camaraInf', 'camaraLat', 'luces', 'pc'];

export const PASOS = [
  { k: 'TracePack · TPI 2026 · Grupo 1', t: 'Isla de inspección 360°', p: 'Los bultos <b>se bajan del camión</b>, pasan por una isla que los <b>mira por todas sus caras</b> y, además de leer el código, <b>controla que la etiqueta esté bien impresa y diga lo que tiene que decir</b>. Solo lo correcto sigue a expedición.',
    lista: ['Recorrido de unos 9 minutos sobre la línea de importación, en 3D.', 'Flechas o espacio para avanzar y pausar; <b>Explorar</b> para mover la cámara; menú <b>Simulación</b> para el HMI, el GRAFCET y los escenarios.'],
    cifras: [['3 cámaras', 'arriba, abajo y al costado, cada una con su luz'], ['1 vuelta', 'del plato: 3,2 s por bulto']], cam: [[0, 'general']], orbita: true, control: true, hud: null, call: ['camion', 'isla', 'pallet', 'expedicion'], dur: 26 },
  { k: 'El problema', t: 'La etiqueta puede venir en cualquier cara… y mal', p: 'En importación el bulto llega <b>como lo cargaron</b>: la etiqueta puede estar arriba, abajo o en un costado. Y no alcanza con encontrarla: puede venir <b>mal impresa</b> o con <b>datos que no coinciden</b> con el aviso de llegada.',
    lista: ['Un <b>No Read</b> frena la trazabilidad: el bulto queda sin registrar.', 'Un cabezal de impresora con un punto muerto deja una <b>línea blanca</b>: hoy nadie la ve hasta que el código deja de escanear.', 'Un <b>código postal o un peso distinto</b> al del ERP termina en un envío mal ruteado.'],
    forzar: ['linea', 'ok', 'dato'], cam: [[0, 'descarga'], [24, 'general']], control: false, hud: null, call: ['camion', 'expedicion'], dur: 42 },
  { k: 'Importación', t: 'Del camión a la isla', p: 'El camión está al <b>inicio</b> de la línea: los bultos bajan a la <b>acumulación</b> y el <b>alimentador</b> los entrega <b>de a uno</b> a la isla. Las cintas corren al revés que en una línea de exportación: <b>entran desde el camión</b>.',
    lista: ['La secuencia de la estación es la misma del hito H2: <b>E0 a E5</b>.', 'La isla reemplaza a la estación de 6 lectores en el mismo lugar de la cinta.', 'El bulto NO OK se separa <b>antes</b> de armar el pallet de expedición.'],
    cifras: [['≤ 3', 'bultos en acumulación'], ['1 a 1', 'el plato atiende un bulto por vez']], cam: [[0, 'descarga'], [16, 'general']], control: true, hud: null, call: ['camion', 'descarga', 'isla', 'pusher', 'revision', 'pallet'], dur: 38 },
  { k: 'El equipo', t: 'Una celda cerrada con un plato de vidrio', p: 'Perfiles de aluminio y <b>policarbonato ahumado</b>: adentro la luz es siempre la misma. El bulto entra por un túnel con cortina de tiras y queda sobre un <b>plato de vidrio</b> que gira sobre un <b>rodamiento</b>: el motor va al costado, así <b>el centro queda libre</b> para mirar desde abajo.',
    lista: ['Fotocélula en la boca: avisa que entra un bulto.', 'Encoder en el rodamiento: el PLC sabe en qué ángulo está el plato.', 'Baliza de torre: verde libre, ámbar girando, roja con falla, celeste en cada disparo.'],
    cifras: [['Ø 0,72 m', 'plato de vidrio templado'], ['360°', 'una vuelta por bulto']], cam: [[0, 'isla']], control: true, hud: null, call: ['fotocelula', 'plato', 'camaraSup', 'camaraInf', 'camaraLat', 'luces', 'pc'], dur: 40, chips: true, tour: TOUR_ISLA },
  { k: 'Las tres cámaras', t: 'Arriba, abajo y al costado, cada una con su luz', p: '<b>C1</b> mira desde arriba con un <b>anillo de LED</b>. <b>C2</b> está dentro del gabinete y mira <b>a través del vidrio</b> con un anillo difuso: lee la cara de abajo sin dar vuelta el bulto. <b>C3</b> mira el costado entre <b>dos barras de LED</b>: con el giro ve <b>los cuatro lados</b>.',
    lista: ['Con eso se cubren las 6 caras del bulto en una sola vuelta.', 'Cada luz destella 60 a 100 µs: la foto sale nítida aunque el plato gire.', 'Las tres cámaras van por cable a una PC industrial colgada de la celda.'],
    cam: [[0, 'sup'], [11, 'inf'], [22, 'lat']], control: true, hud: null, call: ['camaraSup', 'camaraInf', 'camaraLat'], dur: 34, fov: true, chips: true },
  { k: 'El giro', t: 'La fotocélula dispara, el plato da una vuelta', p: 'El bulto corta el haz y queda en el plato: <b>gira 360° en 3,2 segundos</b> y cada cámara dispara cuando le toca. La que encuentra la etiqueta <b>la lee</b>; las otras confirman que en su cara no hay otra.',
    lista: ['Fijate en el cono de luz de cada cámara cuando dispara.', 'El rótulo sobre el bulto dice qué cámara encontró la etiqueta.', 'En la pantalla del control, la vista de esa cámara queda resaltada.'], cam: [[0, 'giro']], control: true, hud: 'vivo', call: ['plato'], dur: 38, fov: true, chips: true, foco: 'plato' },
  { k: 'Qué controla', t: 'Cuatro controles sobre la etiqueta', p: 'La foto se compara con el <b>diseño de la etiqueta</b> y con los <b>datos del envío en el ERP</b>. Lo visual sale en 1 a 2 segundos; el texto, un segundo después.',
    lista: ['<b>Impresión:</b> tinta de más o de menos, recuadros cortados, impresión corrida.', '<b>Barra de control:</b> un punto muerto del cabezal la cruza con una línea blanca.', '<b>Texto, campo por campo:</b> destinatario, código postal, peso, fecha y declaración de aduana contra el ERP.', '<b>Código de barras:</b> se lee como un escáner (Code 128); si no lee, es No Read.'],
    nota: 'Las etiquetas de la demo son una maqueta estilo Correo Argentino: remitente, destinatario y número de envío son inventados.',
    cam: [[0, 'isla'], [22, 'monitor1']], control: true, hud: 'vivo', call: ['pc'], dur: 46, fov: true, chips: true },
  { k: 'Resultado', t: 'Bulto OK: se registra y sigue a expedición', p: 'Si la etiqueta está bien y coincide con el ERP, el bulto <b>se registra con su ID de ciclo</b> (E2) y <b>sigue solo</b>: se arma el pallet y sale a expedición.',
    lista: ['Queda guardada la foto de las tres caras y el resultado, con su número de envío.', 'Es la prueba ante un reclamo: se puede mostrar cómo llegó el bulto.'], forzar: ['ok', 'ok'], cam: [[0, 'isla'], [16, 'pallet']], control: true, hud: 'vivo', call: ['pallet', 'expedicion'], dur: 38, chips: true },
  { k: 'Resultado', t: 'Bulto NO OK: se desvía y vuelve a pasar', p: 'Si hay un defecto o un dato que no coincide, el bulto es <b>NO OK</b>: el <b>desviador</b> lo empuja a la rampa de rodillos y baja a la <b>cinta de desvío</b>, donde queda frenado esperando revisión.',
    lista: ['Ejemplo: el código postal impreso dice <b>X2440</b> y el ERP dice <b>X2400</b>.', 'En la pantalla de la cinta de desvío el operario ve la etiqueta con los errores señalados y toca el <b>tick verde</b> si la lectura fue correcta o la <b>cruz roja</b> si no lo fue.', 'En los dos casos el bulto sube por la cinta de vuelta y <b>pasa de nuevo por la isla</b>.'], forzar: ['dato', 'linea', 'dato', 'ok'],
    cam: [[0, 'isla'], [9, 'pusher'], [20, 'revision']], control: true, hud: 'vivo', pantalla: 'revision', call: ['pusher', 'revision'], dur: 62, chips: true },
  { k: 'Lo que ve el operario', t: 'Cada error, señalado y con su precisión', p: 'Primero un <b>pantallazo verde o rojo</b> con la lectura y su precisión; después la etiqueta con los <b>errores numerados</b> y, campo por campo, lo que dice el ERP, lo que se leyó y qué tan seguro está.',
    lista: ['Rojo: dato distinto o línea cortada. Ámbar: lectura dudosa.', 'Cada error dice de qué cámara vino.', 'Todo queda en el histórico, exportable a CSV.'], cam: [[0, 'monitor2']], control: true, hud: 'detalle', call: [], dur: 44, detalle: 'dato', vista: 'izq', monitor: 'dato' },
  { k: 'Control', t: 'La misma secuencia E0–E5', p: 'El PLC sigue la secuencia del hito H2. La isla solo cambia lo que pasa en <b>E1</b>: en vez de 6 lectores fijos, <b>una vuelta del plato y tres disparos</b>. No Read y NO OK van a E3; las fallas (ERP caído, falta de aire, plato que no confirma) van a <b>E5</b>.',
    lista: ['La etapa activa se resalta en vivo.', 'Desde el menú Simulación se abren el HMI y los escenarios para provocar fallas.'],
    cam: [[0, 'isla']], control: true, hud: null, panel: 'grafcet', call: ['isla'], dur: 40 },
  { k: 'Comparación', t: 'Qué gana la línea con la isla', p: 'La estación de 6 lectores responde <b>¿qué bulto es?</b>. La isla responde eso y además <b>¿la etiqueta está bien?</b>',
    lista: [], nota: 'Comparación cualitativa: los tiempos son supuestos de la simulación.',
    cam: [[0, 'arriba']], control: true, hud: null, panel: 'costos', call: [], dur: 50 },
  { k: 'Para llevarlo a la línea', t: 'Qué falta', p: '<ul class="falta">' + FALTA.map(([a, b]) => `<li><i></i><span><b>${a}:</b> ${b}</span></li>`).join('') + '</ul>',
    nota: 'Todo lo de esta presentación es simulado: las fotos y los datos de las etiquetas son de maqueta.',
    cam: [[0, 'general']], control: true, hud: null, call: ['camion', 'isla', 'revision', 'pallet', 'expedicion'], dur: 45, orbita: true },
];

// ---------------------------------------------------------------- estado interno
let paso = -1, play = true, libre = false;
let cbPaso = null, cbModo = null;
let $ = (id) => document.getElementById(id);
let wired = false;

function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function pintarTexto(p, i, cambio) {
  const el = $('relato'); if (!el) return;
  if (cambio) el.classList.add('cambia');
  setTimeout(() => {
    const k = $('r-k'), t = $('r-t'), c = $('r-p'), l = $('r-lista'), cf = $('r-cifras'), n = $('r-nota');
    if (k) k.textContent = `${i + 1} de ${PASOS.length} · ${p.k}`;
    if (t) t.textContent = p.t;
    if (c) c.innerHTML = p.p.startsWith('<ul') ? p.p : '<p>' + p.p + '</p>';
    if (l) l.innerHTML = (p.lista || []).map((x) => `<li>${x}</li>`).join('');
    if (cf) cf.innerHTML = (p.cifras || []).map(([a, b]) => `<div><b>${esc(a)}</b><small>${esc(b)}</small></div>`).join('');
    if (n) n.textContent = p.nota || '';
    el.classList.remove('cambia');
  }, cambio ? 260 : 0);
  document.querySelectorAll('#puntos button').forEach((b, k2) => {
    b.classList.toggle('act', k2 === i);
    b.classList.toggle('hecho', k2 < i);
    if (b.firstChild) b.firstChild.style.width = k2 < i ? '100%' : '0';
  });
  const tn = $('t-nombre'), tm = $('t-num');
  if (tn) tn.textContent = p.t;
  if (tm) tm.textContent = (i + 1) + ' de ' + PASOS.length;
}

export function irPaso(i) {
  i = Math.max(0, Math.min(PASOS.length - 1, i));
  const p = PASOS[i];
  const cambio = paso >= 0;
  paso = i;
  pintarTexto(p, i, cambio);
  if (cbPaso) cbPaso(p, i);
  return p;
}
export function siguiente() { if (paso < PASOS.length - 1) irPaso(paso + 1); }
export function anterior() { irPaso(paso - 1 < 0 ? 0 : paso - 1); }
export function ponerPlay(v) {
  play = !!v;
  const b = $('b-play');
  if (b) b.classList.toggle('pausado', !play);
  if (cbModo) cbModo({ play, libre });
}
export function estadoRelato() { return { paso, play, libre }; }

// Conecta DOM (puntos, botones, teclas, fullscreen) y dispara el paso 0.
// opts: { onPaso(p, i), onModo({play, libre}), $get?, empezar? }
export function initRelato(opts = {}) {
  cbPaso = opts.onPaso || null;
  cbModo = opts.onModo || null;
  if (opts.$get) $ = opts.$get;
  if (wired) { irPaso(paso < 0 ? 0 : paso); return; }
  wired = true;
  const pt = $('puntos');
  if (pt) {
    pt.innerHTML = PASOS.map((p, i) => `<button data-i="${i}" title="${i + 1}. ${esc(p.t)}" aria-label="${esc(p.t)}"><i></i></button>`).join('');
    pt.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) irPaso(+b.dataset.i); });
  }
  $('b-sig')?.addEventListener('click', siguiente);
  $('b-ant')?.addEventListener('click', anterior);
  $('b-play')?.addEventListener('click', () => ponerPlay(!play));
  $('b-libre')?.addEventListener('click', () => {
    libre = !libre;
    $('b-libre')?.classList.toggle('on', libre);
    ponerPlay(!libre ? true : false);
  });
  // Pantalla completa de una sola tarjeta (relato, pantallas, detalle o costos)
  const ICO_MAX = '<svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';
  const ICO_MIN = '<svg viewBox="0 0 24 24"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>';
  for (const id of ['relato', 'pantalla', 'revision', 'detalle', 'costos']) {
    const el = $(id); if (!el || el.querySelector('.b-max')) continue;
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'b-max'; b.title = 'Pantalla completa';
    b.setAttribute('aria-label', 'Ver en pantalla completa'); b.innerHTML = ICO_MAX;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      if (document.fullscreenElement === el) { document.exitFullscreen(); return; }
      el.dataset.w = el.offsetWidth; el.dataset.h = el.scrollHeight;
      el.requestFullscreen?.();
    });
    el.appendChild(b);
  }
  document.addEventListener('fullscreenchange', () => {
    document.querySelectorAll('.maxi').forEach((x) => { x.classList.remove('maxi'); x.style.zoom = ''; const b = x.querySelector('.b-max'); if (b) b.innerHTML = ICO_MAX; });
    const el = document.fullscreenElement;
    if (el && el.dataset?.w) {
      el.classList.add('maxi');
      el.style.zoom = String(Math.min((innerWidth || screen.width) / +el.dataset.w, (innerHeight || screen.height) / +el.dataset.h) * 0.94);
      const b = el.querySelector('.b-max'); if (b) b.innerHTML = ICO_MIN;
    }
  });
  $('b-pant')?.addEventListener('click', () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.(); });
  addEventListener('keydown', (e) => {
    if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown') siguiente();
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') anterior();
    else if (e.key === ' ') { e.preventDefault(); ponerPlay(!play); }
    else if (e.key === 'f' || e.key === 'F') $('b-pant')?.click();
  });
  ponerPlay(opts.play ?? true);
  irPaso(opts.empezar ?? 0);
}
