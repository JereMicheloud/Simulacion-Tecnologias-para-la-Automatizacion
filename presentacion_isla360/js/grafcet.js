// GRAFCET E0–E5 + rama de descarga D0–D2 · Isla de inspección 360° (ETIQUETAS).
// Sin dependencias externas. Estilo oscuro HMI coherente con la presentación.
// API: { initGrafcet, pintarGrafcet } (+ ETAPAS, TRANSICIONES, NOMBRE_PASO).
// Referencia: simulacion-referencia/web (svgGrafcet + NOMBRE_PASO E0–E5 y
// resalte con [data-paso].classList.toggle('activa', ...)) adaptado a:
// plato de vidrio 360° + C1–C3 en E1, fusión/ERP mismo ID en E2,
// S_EXT→S_PASO→S_RET en E3, E5 con reconocer→resolver→rearmar.

export const NOMBRE_PASO = {
  E0: 'ESPERANDO BULTO',
  E1: 'EN PLATO E IDENTIFICANDO (3 CARAS)',
  E2: 'ANALIZANDO Y REGISTRANDO',
  E3: 'DERIVANDO A REVISIÓN',
  E4: 'FINALIZANDO (LIBERA A EXPEDICIÓN)',
  E5: 'FALLA / INTERVENCIÓN',
  D0: 'CAMIÓN EN POSICIÓN',
  D1: 'DESCARGANDO A CINTA',
  D2: 'ACUMULACIÓN LISTA',
};

// Etapa: id, título corto, descripción (va a la lista <ol>), acciones y sub etiqueta SVG.
export const ETAPAS = [
  {
    id: 'E0', titulo: 'Esperando bulto',
    desc: 'S_ZONA libre + desviador en reposo. Se habilita la recepción y al crear el ID se arma el ciclo.',
    acciones: ['Cámaras en espera', 'Desviador en reposo (S_RET)', 'Recepción habilitada'],
  },
  {
    id: 'E1', titulo: 'Posicionado y girando',
    desc: 'Bulto en plato: se inhibe el alimentador, el plato gira 360° y disparan C1–C3 con su luz.',
    acciones: ['Inhibe alimentador', 'Gira plato 360° (~3 s)', 'Dispara C1 superior · C2 inferior · C3 lateral'],
  },
  {
    id: 'E2', titulo: 'Analizando y registrando',
    desc: 'Fusión de las 3 caras contra el diseño + datos. Retiene el bulto hasta la confirmación del ERP para el mismo ID.',
    acciones: ['Compara tinta, barra, texto y código', 'Retiene bulto en la isla', 'Espera ERP del mismo ID'],
  },
  {
    id: 'E3', titulo: 'Derivando a revisión',
    desc: 'NO OK o dato distinto: el brazo saca el bulto a la cinta de revisión.',
    acciones: ['S_EXT (brazo extendido)', 'S_PASO (bulto en desvío)', 'S_RET (brazo retraído)'],
  },
  {
    id: 'E4', titulo: 'Finalizando',
    desc: 'Evacúa el OK a pallet/expedición o verifica que el NO OK quedó en revisión. Confirma isla libre y cierra el ciclo.',
    acciones: ['OK → pallet y expedición', 'NO OK → verifica desvío', 'Isla libre · cierra ciclo'],
  },
  {
    id: 'E5', titulo: 'Falla',
    desc: 'Bloquea ingresos y avance, conserva el contexto. Salida: reconocer → resolver causa → rearmar.',
    acciones: ['Inhibe ingresos y avance', 'Conserva código + ID', 'Reconocer · resolver · rearmar'],
  },
  {
    id: 'D0', titulo: 'Camión en posición',
    desc: 'Rama descarga: camión en portón de recepción, se autoriza la bajada si hay lugar en acumulación.',
    acciones: ['Camión en posición', 'Lugar en acumulación (< 3)'],
    descarga: true,
  },
  {
    id: 'D1', titulo: 'Descargando a cinta',
    desc: 'Se baja el bulto a la cinta de descarga (punto S_CARGA libre).',
    acciones: ['Bajada a cinta', 'S_CARGA libre'],
    descarga: true,
  },
  {
    id: 'D2', titulo: 'Acumulación lista',
    desc: 'Bulto en acumulación esperando entrar a la isla. Alimenta E0.',
    acciones: ['Hasta 3 en espera', 'Alimenta E0 vía S_ING'],
    descarga: true,
  },
];

// Transición: de → a + condición (etiqueta que se dibuja sobre la flecha).
export const TRANSICIONES = [
  { de: 'D0', a: 'D1', cond: 'camión en posición + lugar libre' },
  { de: 'D1', a: 'D2', cond: 'caja en cinta (S_CARGA libre)' },
  { de: 'D2', a: 'E0', cond: 'caja a línea · S_ING' },
  { de: 'E0', a: 'E1', cond: 'S_ING detecta · se crea el ID' },
  { de: 'E1', a: 'E2', cond: 'encoder quieto + giro 360° + C1–C3' },
  { de: 'E2', a: 'E4', cond: 'fusión OK + ERP del mismo ID' },
  { de: 'E2', a: 'E3', cond: 'NO OK (dato distinto / No Read)' },
  { de: 'E2', a: 'E5', cond: 'timeout registro / contradicción' },
  { de: 'E3', a: 'E4', cond: 'S_EXT → S_PASO → S_RET' },
  { de: 'E3', a: 'E5', cond: 'sin S_EXT / S_PASO / S_RET' },
  { de: 'E4', a: 'E0', cond: 'ciclo cerrado · isla libre · S_RET' },
  { de: 'E4', a: 'E5', cond: 'sin liberar la isla (tMaxLiberar)' },
  { de: 'E5', a: 'E4', cond: 'rearme con registro confirmado' },
  { de: 'E5', a: 'E0', cond: 'rearme · ciclo resuelto · isla libre' },
];

let _svg = null;
let _ol = null;
let _estadoTxt = null;

const NS = 'http://www.w3.org/2000/svg';
const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function cssGrafcet() {
  return `<style>
    #svgGrafcet .et rect.caja{fill:#0e1620;stroke:#2a3a4a;stroke-width:1.5}
    #svgGrafcet .et.doble rect.fuera{fill:none;stroke:#2a3a4a;stroke-width:1}
    #svgGrafcet .et text{fill:#d7e3ee;font:600 15px system-ui,sans-serif;text-anchor:middle}
    #svgGrafcet .et text.sub{fill:#8fa3b5;font:500 10.5px system-ui,sans-serif}
    #svgGrafcet .et.descarga rect.caja{fill:#0c1219;stroke-dasharray:5 3}
    #svgGrafcet .et.descarga text{fill:#9fb2c3;font-size:13px}
    #svgGrafcet .et.activa rect.caja{stroke:#4fc3ff;stroke-width:2.5;filter:drop-shadow(0 0 6px rgba(79,195,255,.55))}
    #svgGrafcet .et.activa text{fill:#ffffff}
    #svgGrafcet .et.e3 rect.caja{stroke:#8a6a1f}
    #svgGrafcet .et.e3.activa rect.caja{stroke:#ffb020}
    #svgGrafcet .et.e5 rect.caja{stroke:#7a2b2b}
    #svgGrafcet .et.e5.activa rect.caja{stroke:#ff5252;filter:drop-shadow(0 0 6px rgba(255,82,82,.55))}
    #svgGrafcet .tr path{fill:none;stroke:#5b7183;stroke-width:1.6;color:#5b7183}
    #svgGrafcet .tr path.dash{stroke-dasharray:6 4}
    #svgGrafcet .tr path.activa{stroke:#4fc3ff;color:#4fc3ff;stroke-width:2.2}
    #svgGrafcet .tr text{fill:#8fa3b5;font:400 11.5px system-ui,sans-serif}
    #svgGrafcet .tr text.salto{fill:#ff8a8a;font-weight:700}
    #svgGrafcet .estado text{fill:#cfe3f5;font:600 12px system-ui,sans-serif}
  </style>`;
}

// Dibuja el GRAFCET completo dentro de svgEl y la lista dentro de olEl.
// Acepta nulos: busca #svgGrafcet / #etapas. Idempotente (redibuja).
export function initGrafcet(svgEl, olEl) {
  _svg = svgEl || document.getElementById('svgGrafcet');
  _ol = olEl || document.getElementById('etapas');
  if (!_svg) return null;

  _svg.setAttribute('viewBox', '0 0 900 560');
  _svg.setAttribute('role', 'img');
  _svg.setAttribute('aria-label', 'Diagrama de etapas E0 a E5 más descarga D0 a D2');
  _svg.innerHTML = `${cssGrafcet()}
    <defs><marker id="fl" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
    <g class="tr">
      <path data-de="D0" data-a="D1" d="M66,70 V126" marker-end="url(#fl)"/><text x="76" y="102">camión + lugar libre</text>
      <path data-de="D1" data-a="D2" d="M66,174 V260" marker-end="url(#fl)"/><text x="76" y="220">bulto en cinta</text>
      <path data-de="D2" data-a="E0" class="dash" d="M120,286 C250,286 300,52 390,52" marker-end="url(#fl)"/><text x="180" y="272">bulto a línea · S_ING</text>
      <path data-de="E0" data-a="E1" d="M450,78 V128" marker-end="url(#fl)"/><text x="462" y="108">S_ING detecta · se crea el ID</text>
      <path data-de="E1" data-a="E2" d="M450,182 V262" marker-end="url(#fl)"/><text x="462" y="216">encoder quieto + giro 360°</text><text x="462" y="230">(C1–C3 disparan)</text>
      <path data-de="E2" data-a="E3" d="M390,290 H250" marker-end="url(#fl)"/><text x="320" y="282" text-anchor="middle">NO OK / dato distinto</text>
      <path data-de="E2" data-a="E5" class="dash" d="M510,290 H700" marker-end="url(#fl)"/><text x="605" y="282" text-anchor="middle">timeout registro /</text><text x="605" y="296" text-anchor="middle">contradicción</text>
      <path data-de="E2" data-a="E4" d="M450,316 V396" marker-end="url(#fl)"/><text x="462" y="352">fusión OK + ERP</text><text x="462" y="366">del mismo ID</text>
      <path data-de="E3" data-a="E4" d="M190,316 C200,380 320,412 390,418" marker-end="url(#fl)"/><text x="206" y="372">S_EXT → S_PASO → S_RET</text>
      <path data-de="E3" data-a="E5" class="dash" d="M130,290 H96 V200 H130" marker-end="url(#fl)"/><text x="80" y="246" text-anchor="middle" class="salto">E5</text><text x="80" y="336" text-anchor="middle">sin S_EXT,</text><text x="80" y="350" text-anchor="middle">S_PASO o S_RET</text>
      <path data-de="E5" data-a="E4" class="dash" d="M760,316 C760,380 620,416 510,420" marker-end="url(#fl)"/><text x="690" y="380">rearme con registro</text><text x="690" y="394">confirmado (bulto en isla)</text>
      <path data-de="E4" data-a="E0" d="M392,436 H60 V52 H390" marker-end="url(#fl)"/><text x="70" y="456">ciclo cerrado · isla libre · S_RET</text>
      <path data-de="E5" data-a="E0" class="dash" d="M818,290 H860 V40 H510" marker-end="url(#fl)"/><text x="850" y="30" text-anchor="end">rearme · ciclo resuelto · isla libre</text>
      <path data-de="E4" data-a="E5" class="dash" d="M450,450 V492" marker-end="url(#fl)"/><text x="450" y="510" text-anchor="middle" class="salto">E5</text><text x="462" y="474">sin liberar la isla</text>
    </g>
    <g class="et descarga" data-paso="D0"><rect class="caja" x="14" y="26" width="104" height="44" rx="4"/><text x="66" y="52">D0</text></g>
    <g class="et descarga" data-paso="D1"><rect class="caja" x="14" y="130" width="104" height="44" rx="4"/><text x="66" y="156">D1</text></g>
    <g class="et descarga" data-paso="D2"><rect class="caja" x="14" y="264" width="104" height="44" rx="4"/><text x="66" y="290">D2</text></g>
    <g class="et doble" data-paso="E0"><rect class="caja" x="392" y="26" width="116" height="52" rx="4"/><rect class="fuera" x="398" y="32" width="104" height="40" rx="2"/><text x="450" y="59">E0</text></g>
    <g class="et" data-paso="E1"><rect class="caja" x="392" y="130" width="116" height="52" rx="4"/><text x="450" y="158">E1</text><text class="sub" x="450" y="172">plato · C1–C3</text></g>
    <g class="et" data-paso="E2"><rect class="caja" x="392" y="264" width="116" height="52" rx="4"/><text x="450" y="292">E2</text><text class="sub" x="450" y="306">fusión + ERP</text></g>
    <g class="et e3" data-paso="E3"><rect class="caja" x="132" y="264" width="116" height="52" rx="4"/><text x="190" y="292">E3</text><text class="sub" x="190" y="306">S_EXT·PASO·RET</text></g>
    <g class="et e5" data-paso="E5"><rect class="caja" x="702" y="264" width="116" height="52" rx="4"/><text x="760" y="292">E5</text><text class="sub" x="760" y="306">falla</text></g>
    <g class="et" data-paso="E4"><rect class="caja" x="392" y="398" width="116" height="52" rx="4"/><text x="450" y="426">E4</text><text class="sub" x="450" y="440">expedición</text></g>
    <g class="estado"><text id="grafcetEstado" x="450" y="540" text-anchor="middle"></text></g>`;

  if (_ol) {
    _ol.innerHTML = ETAPAS.map((e) => {
      const acc = (e.acciones || []).map((a) => `<span>${esc(a)}</span>`).join(' · ');
      return `<li data-paso="${e.id}"><b>${e.id} · ${esc(e.titulo)}</b> ${esc(e.desc)}<br><small>${acc}</small><em class="subfase" hidden></em></li>`;
    }).join('');
    // Compat: el namespace SVG no aplica acá; solo lista HTML.
    void NS;
  }

  _estadoTxt = _svg.querySelector('#grafcetEstado');
  return { svg: _svg, ol: _ol };
}

// Resalta la etapa activa en el SVG (.activa) y en la lista.
// paso: 'E0'..'E5' (+ 'D0'..'D2' de la rama de descarga).
// subfase: texto libre (ej. 'girando 180°', 'esperando ERP', 'S_EXT ok') que se
// muestra junto al paso activo sin tocar el estado global.
export function pintarGrafcet(paso, subfase) {
  const p = String(paso || 'E0').toUpperCase();
  const svg = _svg || document.getElementById('svgGrafcet');
  const ol = _ol || document.getElementById('etapas');
  if (svg) {
    svg.querySelectorAll('.et[data-paso]').forEach((el) => {
      el.classList.toggle('activa', el.dataset.paso === p);
    });
    svg.querySelectorAll('.tr path[data-a]').forEach((el) => {
      el.classList.toggle('activa', el.dataset.a === p);
    });
    const t = svg.querySelector('#grafcetEstado');
    if (t) {
      const nombre = NOMBRE_PASO[p] || p;
      t.textContent = `${p} · ${nombre}${subfase ? ' — ' + subfase : ''}`;
    }
  }
  if (ol) {
    ol.querySelectorAll('li[data-paso]').forEach((li) => {
      const on = li.dataset.paso === p;
      li.classList.toggle('activa', on);
      if (on) li.setAttribute('aria-current', 'step');
      else li.removeAttribute('aria-current');
      const em = li.querySelector('.subfase');
      if (em) {
        if (on && subfase) { em.hidden = false; em.textContent = ' · ' + subfase; }
        else { em.hidden = true; em.textContent = ''; }
      }
    });
    const act = ol.querySelector('li.activa');
    if (act && act.scrollIntoView) {
      try { act.scrollIntoView({ block: 'nearest' }); } catch { /* panel chico: no rompe */ }
    }
  }
  return p;
}
