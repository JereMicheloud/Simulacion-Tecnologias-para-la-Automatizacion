// Relato de la presentación · IMPORTACIÓN (Facultad, TracePack).
// Las cajas SE BAJAN DEL CAMIÓN y las cintas corren AL REVÉS vs exportación:
// camión → descarga → isla (plato + 3 cámaras) → pallet/expedición.
// Módulo desacoplado: no toca el estado global S; avisa por onPaso(p, i).
// API: { PASOS, CAMS, initRelato, irPaso, siguiente, anterior, ponerPlay }

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
  expedicion:{ p: [3.6, 4.4, -5.4],   t: [9.0, 0.9, 0.2] },
  almacen:   { p: [6.2, 6.0, -5.9],   t: [12.2, 1.6, 0.0] },
  amr:       { p: [-7.4, 2.6, -3.4],  t: [-10.6, 0.9, 0.0] },
  muelles:   { p: [-6.5, 6.5, 9.5],   t: [-14.5, 0.0, 0.0] },
  arriba:    { p: [2.0, 19.0, 3.5],   t: [2.0, 0, 0.6] },
};
CAMS.planta = CAMS.general; CAMS.desvio = CAMS.pusher; CAMS.lectores = CAMS.giro;   // botones de la barra del visor


const TOUR_ISLA = ['fotocelula', 'plato', 'camaraSup', 'camaraInf', 'camaraLat', 'luces', 'pc'];

export const PASOS = [
  { k: 'TracePack · TPI 2026 · Grupo 1', t: 'Isla de inspección 360°', p: 'Los bultos <b>se bajan del camión</b> con un AMR, pasan por una isla que <b>busca el código de barras en todas sus caras</b> y, si lo lee, <b>se registran solos</b> en el ERP. Si no, se desvían a revisión manual.',
    lista: ['Recorrido de unos 9 minutos sobre la línea de importación, en 3D.', 'Flechas o espacio para avanzar y pausar; <b>Explorar</b> para mover la cámara; menú <b>Simulación</b> para el HMI, el GRAFCET y los escenarios.'],
    cifras: [['3 cámaras', 'arriba, abajo y al costado, cada una con su luz'], ['1 vuelta', 'del plato: 3,2 s por bulto']], cam: [[0, 'general']], orbita: true, control: true, hud: null, call: ['camion', 'isla', 'pallet', 'expedicion'], dur: 26 },
  { k: 'El problema', t: 'Registrar cada bulto, uno por uno', p: 'Hoy, para registrar cada unidad, un operario <b>toma el bulto, busca la etiqueta</b>, lo gira si hace falta y la lee con una <b>pistola lectora</b>. Los bultos importados llegan <b>con la etiqueta en cualquier cara y orientación</b>.',
    lista: ['Es lento y depende de la persona.', 'Un bulto sin registrar rompe la trazabilidad.', 'La variable a medir es una sola: el <b>resultado de lectura</b>, OK o <b>No Read</b>.'],
    cam: [[0, 'muelles'], [20, 'descarga']], control: false, hud: null, call: ['camion'], dur: 38 },
  { k: 'Descarga', t: 'El AMR baja los bultos del camión', p: 'Con el camión en posición (<b>S_CAMION</b>), el PLC <b>autoriza cada recogida</b> solo si la acumulación tiene lugar (menos de 3 bultos). El AMR mira con <b>visión 3D</b>, toma el bulto con <b>dos cabezales de ventosas</b> y lo apoya en el punto de carga (<b>S_CARGA</b>).',
    lista: ['Esperar por falta de lugar es una condición normal, no una alarma.', 'Se retira de la puerta hacia adentro y de arriba hacia abajo.', 'Cuando el camión queda vacío, se va y llega el siguiente.'],
    cifras: [['≤ 3', 'bultos en acumulación'], ['R0–R6', 'secuencia del AMR']], cam: [[0, 'amr'], [24, 'descarga']], control: true, hud: null, call: ['camion', 'descarga'], dur: 40 },
  { k: 'La isla 360°', t: 'Una celda cerrada con un plato de vidrio', p: 'Perfiles de aluminio y <b>policarbonato ahumado</b>: adentro la luz es siempre la misma. El bulto entra por un túnel con cortina de tiras y queda sobre un <b>plato de vidrio</b> que gira sobre un <b>rodamiento</b>: el motor va al costado, así <b>el centro queda libre</b> para leer desde abajo.',
    lista: ['Fotocélula en la boca (S_ING): crea el ID del ciclo.', 'Encoder en el rodamiento: confirma la detención antes de disparar.', 'Baliza de torre: verde libre, ámbar girando, roja con falla, celeste en cada disparo.'],
    cifras: [['Ø 0,72 m', 'plato de vidrio templado'], ['360°', 'una vuelta por bulto']], cam: [[0, 'isla']], control: true, hud: null, call: ['fotocelula', 'plato', 'camaraSup', 'camaraInf', 'camaraLat', 'luces', 'pc'], dur: 40, chips: true, tour: TOUR_ISLA },
  { k: 'Las tres cámaras', t: 'Arriba, abajo y al costado, cada una con su luz', p: '<b>C1</b> lee desde arriba con un <b>anillo de LED</b>. <b>C2</b> está dentro del gabinete y lee <b>a través del vidrio</b> con un anillo difuso: no hace falta dar vuelta el bulto. <b>C3</b> lee el costado entre <b>dos barras de LED</b>: con el giro ve <b>los cuatro lados</b>.',
    lista: ['Con eso se cubren las 6 caras del bulto en una sola vuelta.', 'Cada luz destella 60 a 100 µs: la foto sale nítida aunque el plato gire.', 'Las tres cámaras van por cable a una PC industrial colgada de la celda.'],
    cam: [[0, 'sup'], [11, 'inf'], [22, 'lat']], control: true, hud: null, call: ['camaraSup', 'camaraInf', 'camaraLat'], dur: 34, fov: true, chips: true },
  { k: 'La lectura', t: 'Una vuelta, tres disparos, un resultado', p: 'El bulto queda detenido en el plato y el encoder lo confirma. El plato <b>gira 360° en 3,2 s</b> y cada cámara dispara cuando le toca. La que tiene la etiqueta enfrente <b>decodifica el código</b>.',
    lista: ['Fijate en el cono de luz de cada cámara cuando dispara.', 'El rótulo sobre el bulto dice qué cámara encontró la etiqueta.', 'Resultado: <b>OK</b> si hay un código válido; <b>No Read</b> si las tres terminaron bien y ninguna lo leyó.'], cam: [[0, 'giro'], [24, 'monitor1']], control: true, hud: 'vivo', call: ['plato', 'pc'], dur: 42, fov: true, chips: true, foco: 'plato' },
  { k: 'Lectura OK', t: 'Se registra y sigue a expedición', p: 'Con un código válido, el PLC <b>pide el registro al ERP con el ID del ciclo</b> (E2) y <b>retiene el bulto</b> hasta recibir la confirmación para ese mismo ID. Recién ahí sale (E4) y se arma el pallet de expedición.',
    lista: ['Quedan guardadas las 3 fotos y el código, con el ID del ciclo.', 'Si el ERP no confirma a tiempo, no es No Read: es una falla y va a E5.'], forzar: ['ok', 'ok'], cam: [[0, 'isla'], [18, 'pallet']], control: true, hud: 'vivo', call: ['pallet', 'expedicion'], dur: 38, chips: true },
  { k: 'No Read', t: 'Se desvía a revisión manual', p: 'Si ninguna cámara obtiene un código válido, el resultado es <b>No Read</b> (E3): el <b>desviador</b> empuja el bulto (S_EXT → S_PASO → S_RET) a la rampa de rodillos y queda frenado en la <b>cinta de desvío</b>.',
    lista: ['En la pantalla de la cinta de desvío el operario ve las 3 fotos y por qué no se leyó.', 'Lo lee con el <b>lector de mano</b> o, si el código está dañado, <b>le pega una etiqueta nueva</b>; en los dos casos queda registrado.', 'El bulto vuelve por la <b>cinta de retorno</b> y sigue a expedición.'], forzar: ['tapada', 'rayada', 'ok'],
    cam: [[0, 'isla'], [9, 'pusher'], [20, 'revision']], control: true, hud: 'vivo', pantalla: 'revision', call: ['pusher', 'revision'], dur: 60, chips: true },
  { k: 'Lo que ve el operario', t: 'Por qué no se leyó, con las 3 fotos', p: 'Primero un <b>pantallazo verde o rojo</b> con el resultado; después la etiqueta con el <b>recuadro del código</b>, qué cámara lo leyó (o que ninguna pudo) y la <b>acción del PLC</b>.',
    lista: ['Verde: código válido, se registra. Rojo: No Read, a revisión.', 'Todo queda en el histórico con su ID de ciclo, exportable a CSV.'], cam: [[0, 'monitor2']], control: true, hud: 'detalle', call: [], dur: 40, detalle: 'tapada', vista: 'izq', monitor: 'tapada' },
  { k: 'Control', t: 'La secuencia E0–E5', p: 'El PLC S7-1200 sigue una secuencia de seis etapas. Mirá cómo se recorre cada una.',
    lista: [], cam: [[0, 'isla']], control: true, hud: null, panel: 'grafcet', grafcetTour: true, call: [], dur: 64 },
  { k: 'Expedición', t: 'Del pallet al almacén', p: 'Cada <b>12 bultos identificados</b> se completa un pallet, se envuelve con film y un <b>autoelevador</b> lo lleva a un lugar libre del <b>rack</b>. Cuando el rack se llena, sale el pallet más antiguo hacia despacho.',
    lista: ['Al almacén solo llegan bultos registrados: por la isla o a mano en la revisión.', 'El puesto de la línea arma enseguida un pallet nuevo.'], cam: [[0, 'expedicion'], [20, 'almacen']], control: true, hud: null, call: ['pallet', 'expedicion'], dur: 40 },
  { k: 'Ventajas', t: 'Por qué una isla 360°', p: 'Una celda compacta que <b>encuentra el código en cualquier cara</b> y deja la evidencia de cada lectura.',
    lista: [], cam: [[0, 'arriba']], control: true, hud: null, panel: 'costos', call: [], dur: 50, orbita: true },
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
