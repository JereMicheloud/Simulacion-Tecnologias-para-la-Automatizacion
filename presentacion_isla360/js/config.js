// Presentación facultad — IMPORTACIÓN: control de etiquetas en isla de vidrio.
// El flujo corre invertido vs exportación: entra por el camión (+X) y sale
// hacia expedición (-X). Camión → descarga → acumulación → plato → pallet.
// Módulo ES: exporta CFG con geometría, hardware, tiempos, pasos y textos
// (español rioplatense) para que main.js arme la escena sin números hardcodeados.
export const CFG = {
  // Dirección del flujo sobre X: -1 = de +X hacia -X (importación).
  DIR: -1,

  geometria: {
    BELT: 0.8,   // altura de la cinta (m)
    BELT_D: 0.5, // la cinta de desvío va más baja: recibe lo que sale por el brazo
    LX: 0.5,     // largo del bulto sobre la cinta
    H: 0.18,     // alto del bulto
    LZ: 0.34,    // ancho del bulto
    V: 0.55,     // velocidad ilustrativa en planta (~0,3 m/s real)
    // Recorrido importación (+X → -X):
    X_CAMION: 8.1,    // camión al INICIO (portón de recepción)
    X_DESCARGA: 6.0,  // punto donde se baja el bulto a la cinta
    X_ACU: 3.0,       // zona de acumulación (hasta 3 bultos en espera)
    X_REIN: 2.2,      // la cinta de retorno devuelve a la línea acá (antes del brazo)
    X_PUSH: 1.6,      // brazo empujador/centrador: acomoda el bulto antes del plato
    X_TOPE: 1.0,      // tope de la cinta de desvío: frena la primer bulto NO OK
    X_TRIG: -1.2,     // fotocélula: dispara las 3 cámaras cuando la corta el bulto
    X_ISLA: -0.2,     // centro del plato de vidrio (isla de inspección)
    // Expedición al FINAL opuesto (lado -X):
    X_PAL_ENTRA: -4.98,
    OP_PAL_X: -5.05,  // puesto del operario que arma el pallet
    PAL_X: -6.0,      // pallet de expedición
    X_FONDO: -11.7,   // fondo de la nave del lado expedición
    CAJAS_PALLET: 12,
  },

  isla: {
    PLATO_R: 0.32,  // radio del plato (vidrio Ø 0,64 m)
    PLATO_Y: 0.8,   // altura del plato, al mismo nivel que la cinta
    T_GIRO: 3.2,    // segundos por vuelta: en un giro se sacan las 3 fotos
  },

  // Cámaras de la isla (coords three.js: y arriba). pos = dónde está, look = a dónde mira.
  camaras: {
    CAM_SUP: {
      pos: [-0.2, 2.05, 0.0],
      look: [-0.2, 0.8, 0.0],
      mp: '12 MP mono, obturador global',
      nota: 'Mira la cara de arriba a través del giro del plato.',
    },
    CAM_INF: {
      pos: [-0.2, 0.22, 0.0],
      look: [-0.2, 0.8, 0.0],
      mp: '12 MP mono, obturador global',
      nota: 'Va ABAJO del vidrio y lee la cara de abajo sin dar vuelta el bulto.',
    },
    CAM_LAT: {
      pos: [-0.2, 1.0, -0.95],
      look: [-0.2, 0.95, 0.0],
      mp: '12 MP mono, obturador global',
      nota: 'Mira la etiqueta del costado, como en la línea de exportación.',
    },
  },

  // Cada cámara tiene SU luz propia (se disparan juntas, destello 60-100 µs).
  luces: {
    LUZ_SUP: { tipo: 'anillo', para: 'CAM_SUP', pos: [-0.2, 1.8, 0.0], color: 0xffffff, nota: 'Anillo arriba: luz pareja sin brillos sobre el cartón.' },
    LUZ_INF: { tipo: 'panel difuso', para: 'CAM_INF', pos: [-0.2, 0.45, 0.0], color: 0xffffff, nota: 'Panel difuso bajo el vidrio: atraviesa el plato sin encandilar.' },
    LUZ_LAT: { tipo: '2 barras', para: 'CAM_LAT', pos: [-0.2, 1.0, -0.7], color: 0xffffff, nota: 'Dos barras al costado: iluminan la etiqueta del costado sin reflejos.' },
  },

  // Color del cono FOV de cada cámara en la escena.
  fov: { sup: 0x4fc3ff, inf: 0x3ccf6e, lat: 0xffb020 },

  tiempos: {
    tTransporte: 4,    // cinta descarga → isla (base FlexSim T_Transporte)
    tLectura: 3.2,     // 3 caras en un giro del plato (T_GIRO)
    tRegistro: 1.2,    // alta en ERP (base FlexSim T_Registro)
    tDesvio: 2.0,      // brazo saca el bulto No Read a la cinta de desvío
    T_GIRO: 3.2,
    T_VISUAL: 1.7,     // lo visual aparece ~1,7 s después de la foto
    T_TEXTO: 2.75,     // el texto campo por campo, un segundo después
  },

  timeouts: {
    tMaxTransporte: 7, // el bulto no llegó a la fotocélula: se alarma
    tMaxDetencion: 2,  // el bulto no frenó en el plato: se alarma
    tMaxRegistro: 3,   // el ERP no confirmó el alta: reintento + aviso
    tMaxExt: 2,        // el brazo no confirmó extendido
    tMaxPaso: 3,       // el bulto no pasó el punto de control
    tMaxRet: 2,        // el brazo no confirmó retraído
    tMaxLiberar: 8,    // el plato no se liberó: se pide intervención
  },

  // Secuencia de resultados que muestra la demo (8 bultos en loop).
  patron: ['ok', 'ok', 'rayada', 'ok', 'ok', 'tapada', 'ok', 'ok'],

  // Secuencia E0-E5 adaptada a etiquetas (estación E2 de referencia H2).
  pasos: {
    E0: 'ESPERANDO BULTO',
    E1: 'EN PLATO E IDENTIFICANDO (3 CARAS)',
    E2: 'REGISTRANDO EN ERP',
    E3: 'DERIVANDO A REVISIÓN',
    E4: 'FINALIZANDO (LIBERA A EXPEDICIÓN)',
    E5: 'FALLA / PIDEN AYUDA AL OPERARIO',
  },

  lectores: ['C1 Superior', 'C2 Inferior', 'C3 Lateral'],

  // Casos para inyectar fallas en la demo. prob = tasa base por caja.
  casos: [
    { id: 'cruzado', nombre: 'Etiqueta cruzada', prob: 0.04, desc: 'Viene la etiqueta de otro producto o de otro mercado. El código lee pero el diseño no coincide: mirá el aviso ámbar.' },
    { id: 'trabaCarril', nombre: 'Traba en el carril', prob: 0.02, desc: 'Un bulto se cruza antes del plato y tapa la fotocélula. Hay que acomodarla a mano y darle marcha de nuevo.' },
    { id: 'etiquetas', nombre: 'Etiqueta faltante / mal pegada', prob: 0.05, desc: 'Etiqueta ausente, arrugada o a medio pegar: la cámara la ve torcida y la da No Read directo.' },
    { id: 'erp', nombre: 'ERP caído', prob: 0.02, desc: 'Se corta la conexión con el ERP: los bultos se acumulan y el registro queda pendiente hasta que vuelve.' },
    { id: 'aire', nombre: 'Falta de aire', prob: 0.015, desc: 'Sin presión el brazo no empuja: el bulto No Read queda en el plato y se frena la línea hasta que se purga.' },
    { id: 'lectura', nombre: 'No Read (dudosa)', prob: 0.06, desc: 'Foto movida o reflejo en el vidrio: el lector no se anima y la manda a revisión manual con el lector de mano.' },
  ],

  // Textos de los callouts: qué es cada equipo y qué mirarle.
  info: {
    plato: { t: 'Plato de vidrio', d: 'Vidrio templado de Ø 0,72 m sobre un rodamiento de giro. El motor va al costado y lo mueve con una correa: el centro queda libre para que la cámara de abajo vea. Una vuelta (3,2 s) por bulto; la marca amarilla es el 0°.' },
    camaraSup: { t: 'Cámara superior (C1)', d: 'Cuelga del travesaño y mira la cara de arriba con su anillo de LED. Es la que más etiquetas encuentra: casi siempre el bulto viene con la etiqueta arriba.' },
    camaraInf: { t: 'Cámara inferior (C2)', d: 'Está dentro del gabinete, ABAJO del vidrio, con un anillo difuso. Lee la cara de abajo sin dar vuelta el bulto: ahorra una pasada entera.' },
    camaraLat: { t: 'Cámara lateral (C3)', d: 'Mira el costado entre dos barras de LED. Como el plato gira, ve los cuatro lados del bulto en una sola vuelta.' },
    luces: { t: 'Luces (una por cámara)', d: 'Anillo arriba, anillo difuso abajo y dos barras al costado. Destellan 60 a 100 microsegundos solo cuando dispara su cámara: la foto sale nítida aunque el plato gire.' },
    fotocelula: { t: 'Fotocélula', d: 'En la boca de la isla. Cuando el bulto corta el haz, el PLC lo da por ingresado (E0 → E1): crea el ID del ciclo y prepara el giro.' },
    pc: { t: 'PC industrial y pantalla del control', d: 'La PC va colgada de la celda y recibe las 3 cámaras por cable. Busca y decodifica el código de barras en las 3 fotos, entrega al PLC el resultado (OK o No Read) y lo muestra en la pantalla de al lado.' },
    pusher: { t: 'Desviador', d: 'Cilindro neumático después de la isla: saca el bulto No Read a la rampa de rodillos y de ahí a la cinta de desvío. Si le falta aire, el PLC va a E5.' },
    tope: { t: 'Tope y retorno', d: 'Los bultos No Read quedan frenados uno tras otro en el tope. El operario los lee con el lector de mano (o les pega una etiqueta nueva) y vuelven por la cinta de retorno hacia expedición.' },
    operario: { t: 'Operario', d: 'Arma el pallet en expedición y atiende la revisión: mira la pantalla de la cinta de desvío y, si hace falta, lee el código con el lector de mano.' },
    pallet: { t: 'Pallet de expedición', d: 'Acá se arma el pallet de 12 bultos, del lado opuesto al camión. Solo llegan bultos registrados: por la isla o a mano en la revisión. Completo, el autoelevador lo lleva al rack.' },
    camion: { t: 'Camión (recepción)', d: 'En importación el camión está al INICIO: llega al muelle, abre las puertas y S_CAMION confirma que está en posición. Trae 36 bultos apilados que descarga el AMR.' },
    amr: { t: 'AMR de dos brazos', d: 'Robot móvil del hito H3: con visión 3D localiza el bulto, lo toma con dos cabezales de ventosas, verifica el agarre y lo apoya en el punto de carga. Solo recoge si el PLC lo autoriza (acumulación con lugar).' },
    autoelevador: { t: 'Autoelevador', d: 'Retira cada pallet completo del puesto de la línea y lo guarda en un lugar libre del rack.' },
    rack: { t: 'Rack de pallets', d: 'Estantería selectiva de 7 bahías y 3 niveles. Cuando se llena, el pallet más antiguo sale a despacho.' },
  },
};
