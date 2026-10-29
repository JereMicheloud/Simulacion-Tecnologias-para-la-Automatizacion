// GRAFCET E0–E5 + rama de descarga D0–D2 · Isla de inspección 360° (TracePack).
// Fiel al TPI: la isla lee el código; con código válido E1 → E2 (registro con el ID del
// ciclo), con No Read E1 → E3 (desvío a revisión) y con falla de comunicación, dato inválido
// o códigos contradictorios E1 → E5. Un No Read no es una falla.
// API: { initGrafcet, pintarGrafcet, tourGrafcet, salirTour } (+ ETAPAS, NOMBRE_PASO).

export const NOMBRE_PASO = {
  E0: 'ESPERANDO BULTO',
  E1: 'EN PLATO E IDENTIFICANDO (3 CARAS)',
  E2: 'REGISTRANDO EN ERP',
  E3: 'DERIVANDO A REVISIÓN',
  E4: 'FINALIZANDO (LIBERA A EXPEDICIÓN)',
  E5: 'FALLA / INTERVENCIÓN',
  D0: 'CAMIÓN EN POSICIÓN',
  D1: 'AMR DESCARGANDO',
  D2: 'ACUMULACIÓN LISTA',
};

// Etapa: id, título corto, descripción, acciones y a dónde sale (para el recorrido guiado)
export const ETAPAS = [
  { id: 'E0', titulo: 'Esperando bulto',
    desc: 'Isla libre, desviador en reposo (S_RET) y lectores en espera. Cuando S_ING detecta un bulto se crea un ID de ciclo propio, independiente del código.',
    acciones: ['Cámaras en espera', 'Desviador en reposo (S_RET)', 'Crea el ID del ciclo'],
    sale: ['E1 · S_ING detecta el bulto'] },
  { id: 'E1', titulo: 'Posicionado e identificando',
    desc: 'El bulto llega al plato, se inhibe el alimentador y el encoder confirma la detención. El plato gira 360° y disparan C1, C2 y C3, cada una con su luz.',
    acciones: ['Inhibe el alimentador', 'Gira el plato 360° (3,2 s)', 'Dispara C1 · C2 · C3'],
    sale: ['E2 · código válido y coherente', 'E3 · No Read: las 3 terminaron bien y no hay código', 'E5 · comunicación, dato inválido o códigos contradictorios'] },
  { id: 'E2', titulo: 'Registrando',
    desc: 'Con el código válido, el PLC pide el registro al ERP con el ID del ciclo y retiene el bulto en la isla hasta recibir la confirmación para ese mismo ID.',
    acciones: ['Solicita el registro (ID)', 'Retiene el bulto', 'Espera la confirmación del ERP'],
    sale: ['E4 · el ERP confirma el mismo ID', 'E5 · rechazo o tiempo vencido'] },
  { id: 'E3', titulo: 'Derivando a revisión',
    desc: 'No Read: con el bulto presente y S_RET confirmado se extiende el cilindro. Se confirman S_EXT → S_PASO → S_RET y el bulto queda en la cinta de desvío para revisión manual.',
    acciones: ['S_EXT (cilindro extendido)', 'S_PASO (bulto en el desvío)', 'S_RET (cilindro en reposo)'],
    sale: ['E4 · desvío confirmado', 'E5 · falta S_EXT, S_PASO o S_RET'] },
  { id: 'E4', titulo: 'Finalizando',
    desc: 'Si hubo registro, el bulto sale hacia el pallet de expedición. Se confirma isla libre y desviador en reposo, y se cierra el ciclo.',
    acciones: ['OK → pallet y expedición', 'Isla libre', 'Cierra el ciclo'],
    sale: ['E0 · ciclo cerrado, isla libre', 'E5 · la isla no se libera'] },
  { id: 'E5', titulo: 'Falla / intervención',
    desc: 'Se inhiben ingresos y movimientos y se conserva el contexto (ID, etapa, señales). Para salir: reconocer → resolver la causa en planta → rearmar. Reconocer solo no alcanza.',
    acciones: ['Inhibe ingresos y avance', 'Conserva ID y código', 'Reconocer · resolver · rearmar'],
    sale: ['E4 · registro confirmado y bulto en la isla', 'E0 · ciclo resuelto y documentado'] },
  { id: 'D0', titulo: 'Camión en posición', descarga: true,
    desc: 'Rama de descarga (H3): S_CAMION confirma el camión en el muelle. El PLC autoriza una recogida si hay lugar en la acumulación.',
    acciones: ['S_CAMION', 'Acumulación < 3'], sale: ['D1 · recogida autorizada'] },
  { id: 'D1', titulo: 'AMR descargando', descarga: true,
    desc: 'El AMR localiza el bulto con visión 3D, lo toma con las ventosas, verifica el agarre y lo apoya en el punto de carga (S_CARGA).',
    acciones: ['Visión 3D', 'Agarre verificado', 'S_CARGA'], sale: ['D2 · bulto en la acumulación'] },
  { id: 'D2', titulo: 'Acumulación lista', descarga: true,
    desc: 'El bulto espera su turno en la acumulación y el alimentador lo entrega de a uno a la isla.',
    acciones: ['Hasta 3 en espera', 'Alimenta E0 por S_ING'], sale: ['E0 · el bulto llega a S_ING'] },
];

// rectángulo de cada etapa en el SVG (x, y, ancho, alto)
const POS = {
  D0: [14, 26, 104, 44], D1: [14, 130, 104, 44], D2: [14, 264, 104, 44],
  E0: [392, 26, 116, 52], E1: [392, 130, 116, 52], E2: [392, 264, 116, 52],
  E3: [132, 264, 116, 52], E5: [702, 264, 116, 52], E4: [392, 398, 116, 52],
};
const VB0 = [0, 0, 900, 560];

let _svg = null, _ol = null, _sec = null, _cap = null;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function cssGrafcet() {
  return `<style>
    #svgGrafcet .et rect.caja{fill:#0e1620;stroke:#2a3a4a;stroke-width:1.5;transition:stroke .3s}
    #svgGrafcet .et.doble rect.fuera{fill:none;stroke:#2a3a4a;stroke-width:1}
    #svgGrafcet .et text{fill:#d7e3ee;font:600 15px system-ui,sans-serif;text-anchor:middle}
    #svgGrafcet .et text.sub{fill:#8fa3b5;font:500 10.5px system-ui,sans-serif}
    #svgGrafcet .et.descarga rect.caja{fill:#0c1219;stroke-dasharray:5 3}
    #svgGrafcet .et.descarga text{fill:#9fb2c3;font-size:13px}
    #svgGrafcet .et.activa rect.caja{stroke:#4fc3ff;stroke-width:2.5;filter:drop-shadow(0 0 6px rgba(79,195,255,.55))}
    #svgGrafcet .et.activa text{fill:#ffffff}
    #svgGrafcet .et.e3 rect.caja{stroke:#8a6a1f}
    #svgGrafcet .et.e3.activa rect.caja{stroke:#ffc61a;filter:drop-shadow(0 0 6px rgba(255,198,26,.55))}
    #svgGrafcet .et.e5 rect.caja{stroke:#7a2b2b}
    #svgGrafcet .et.e5.activa rect.caja{stroke:#ff5252;filter:drop-shadow(0 0 6px rgba(255,82,82,.55))}
    #svgGrafcet .tr path{fill:none;stroke:#5b7183;stroke-width:1.6;color:#5b7183}
    #svgGrafcet .tr path.dash{stroke-dasharray:6 4}
    #svgGrafcet .tr path.activa{stroke:#4fc3ff;color:#4fc3ff;stroke-width:2.2}
    #svgGrafcet .tr path.sale{stroke:#ffc61a;color:#ffc61a;stroke-width:2.4}
    #svgGrafcet .tr text{fill:#8fa3b5;font:400 11.5px system-ui,sans-serif}
    #svgGrafcet .tr text.salto{fill:#ff8a8a;font-weight:700}
    #svgGrafcet .estado text{fill:#cfe3f5;font:600 12px system-ui,sans-serif}
  </style>`;
}

// Dibuja el GRAFCET dentro de svgEl y la lista dentro de olEl (acepta nulos: #svgGrafcet / #etapas).
export function initGrafcet(svgEl, olEl) {
  _svg = svgEl || document.getElementById('svgGrafcet');
  _ol = olEl || document.getElementById('etapas');
  _sec = document.getElementById('grafcet');
  if (!_svg) return null;
  _svg.setAttribute('viewBox', VB0.join(' '));
  _svg.setAttribute('aria-label', 'Diagrama de etapas E0 a E5 más la rama de descarga D0 a D2');
  _svg.innerHTML = `${cssGrafcet()}
    <defs><marker id="fl" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
    <g class="tr">
      <path data-de="D0" data-a="D1" d="M66,70 V126" marker-end="url(#fl)"/><text x="76" y="102">recogida autorizada</text>
      <path data-de="D1" data-a="D2" d="M66,174 V260" marker-end="url(#fl)"/><text x="76" y="220">S_CARGA</text>
      <path data-de="D2" data-a="E0" class="dash" d="M118,280 H125 V40 H390" marker-end="url(#fl)"/><text x="132" y="230">bulto</text><text x="132" y="244">a línea</text>
      <path data-de="E0" data-a="E1" d="M450,78 V128" marker-end="url(#fl)"/><text x="462" y="108">S_ING · se crea el ID</text>
      <path data-de="E1" data-a="E2" d="M450,182 V262" marker-end="url(#fl)"/><text x="462" y="216">código válido</text><text x="462" y="230">y coherente</text>
      <path data-de="E1" data-a="E3" d="M392,160 C280,165 200,200 190,262" marker-end="url(#fl)"/><text x="270" y="196" text-anchor="middle">No Read</text>
      <path data-de="E1" data-a="E5" class="dash" d="M508,160 C640,165 750,200 760,262" marker-end="url(#fl)"/><text x="660" y="186" text-anchor="middle">comunicación · dato inválido</text><text x="660" y="200" text-anchor="middle">códigos contradictorios</text>
      <path data-de="E2" data-a="E5" class="dash" d="M510,290 H700" marker-end="url(#fl)"/><text x="605" y="282" text-anchor="middle">rechazo / tiempo</text><text x="605" y="308" text-anchor="middle">vencido</text>
      <path data-de="E2" data-a="E4" d="M450,316 V396" marker-end="url(#fl)"/><text x="462" y="352">ERP confirma</text><text x="462" y="366">el mismo ID</text>
      <path data-de="E3" data-a="E4" d="M190,316 C200,380 320,412 390,418" marker-end="url(#fl)"/><text x="206" y="372">S_EXT → S_PASO → S_RET</text>
      <path data-de="E3" data-a="E5" class="dash" d="M160,316 V505 H805 V320" marker-end="url(#fl)"/><text x="480" y="522" text-anchor="middle">falta S_EXT, S_PASO o S_RET</text>
      <path data-de="E5" data-a="E4" class="dash" d="M725,316 V412 H512" marker-end="url(#fl)"/><text x="718" y="370" text-anchor="end">rearme con registro</text><text x="718" y="384" text-anchor="end">confirmado</text>
      <path data-de="E4" data-a="E0" d="M392,430 H300 V64 H390" marker-end="url(#fl)"/><text x="306" y="400">ciclo cerrado</text><text x="306" y="414">isla libre</text>
      <path data-de="E5" data-a="E0" class="dash" d="M818,290 H860 V40 H510" marker-end="url(#fl)"/><text x="850" y="30" text-anchor="end">rearme · ciclo resuelto y documentado</text>
      <path data-de="E4" data-a="E5" class="dash" d="M508,438 H780 V320" marker-end="url(#fl)"/><text x="644" y="456" text-anchor="middle">la isla no se libera</text>
    </g>
    <g class="et descarga" data-paso="D0"><rect class="caja" x="14" y="26" width="104" height="44" rx="4"/><text x="66" y="52">D0</text></g>
    <g class="et descarga" data-paso="D1"><rect class="caja" x="14" y="130" width="104" height="44" rx="4"/><text x="66" y="156">D1</text></g>
    <g class="et descarga" data-paso="D2"><rect class="caja" x="14" y="264" width="104" height="44" rx="4"/><text x="66" y="290">D2</text></g>
    <g class="et doble" data-paso="E0"><rect class="caja" x="392" y="26" width="116" height="52" rx="4"/><rect class="fuera" x="398" y="32" width="104" height="40" rx="2"/><text x="450" y="59">E0</text></g>
    <g class="et" data-paso="E1"><rect class="caja" x="392" y="130" width="116" height="52" rx="4"/><text x="450" y="158">E1</text><text class="sub" x="450" y="172">plato · C1–C3</text></g>
    <g class="et" data-paso="E2"><rect class="caja" x="392" y="264" width="116" height="52" rx="4"/><text x="450" y="292">E2</text><text class="sub" x="450" y="306">registro ERP</text></g>
    <g class="et e3" data-paso="E3"><rect class="caja" x="132" y="264" width="116" height="52" rx="4"/><text x="190" y="292">E3</text><text class="sub" x="190" y="306">desvío · No Read</text></g>
    <g class="et e5" data-paso="E5"><rect class="caja" x="702" y="264" width="116" height="52" rx="4"/><text x="760" y="292">E5</text><text class="sub" x="760" y="306">falla</text></g>
    <g class="et" data-paso="E4"><rect class="caja" x="392" y="398" width="116" height="52" rx="4"/><text x="450" y="426">E4</text><text class="sub" x="450" y="440">expedición</text></g>
    <g class="estado"><text id="grafcetEstado" x="450" y="545" text-anchor="middle"></text></g>`;
  if (_ol) {
    _ol.innerHTML = ETAPAS.filter((e) => !e.descarga).map((e) => {
      const acc = e.acciones.map((a) => `<span>${esc(a)}</span>`).join(' · ');
      return `<li data-paso="${e.id}"><b>${e.id} · ${esc(e.titulo)}</b> ${esc(e.desc)}<br><small>${acc}</small><em class="subfase" hidden></em></li>`;
    }).join('');
  }
  if (_sec && !_sec.querySelector('.g-tour')) {
    _cap = document.createElement('div'); _cap.className = 'g-tour'; _cap.setAttribute('aria-live', 'polite');
    _sec.appendChild(_cap);
  }
  return { svg: _svg, ol: _ol };
}

// Resalta la etapa activa en el SVG (.activa) y en la lista. subfase: texto libre junto al paso.
export function pintarGrafcet(paso, subfase) {
  const p = String(paso || 'E0').toUpperCase();
  const svg = _svg || document.getElementById('svgGrafcet');
  const ol = _ol || document.getElementById('etapas');
  if (svg) {
    svg.querySelectorAll('.et[data-paso]').forEach((el) => el.classList.toggle('activa', el.dataset.paso === p));
    svg.querySelectorAll('.tr path[data-a]').forEach((el) => {
      el.classList.toggle('activa', !TOUR.on && el.dataset.a === p);
      el.classList.toggle('sale', TOUR.on && el.dataset.de === p);
    });
    const t = svg.querySelector('#grafcetEstado');
    if (t) t.textContent = `${p} · ${NOMBRE_PASO[p] || p}${subfase ? ' — ' + subfase : ''}`;
  }
  if (ol) {
    ol.querySelectorAll('li[data-paso]').forEach((li) => {
      const on = li.dataset.paso === p;
      li.classList.toggle('activa', on);
      const em = li.querySelector('.subfase');
      if (em) { em.hidden = !(on && subfase); em.textContent = on && subfase ? ' · ' + subfase : ''; }
    });
  }
  return p;
}

// ---------------------------------------------------------------- recorrido guiado en pantalla completa
// Cada parada: qué etapa, cuánto dura y a qué parte del diagrama se acerca.
const PARADAS = [
  { p: null, dur: 5, vb: VB0, t: 'La secuencia E0–E5', d: 'Seis etapas para la isla (al centro) y la rama de descarga del AMR (a la izquierda). Vamos etapa por etapa.' },
  { p: 'D0', dur: 5 }, { p: 'D1', dur: 5 }, { p: 'D2', dur: 4.5 },
  { p: 'E0', dur: 5.5 }, { p: 'E1', dur: 7 }, { p: 'E2', dur: 6 }, { p: 'E3', dur: 6.5 }, { p: 'E4', dur: 5.5 }, { p: 'E5', dur: 6.5 },
  { p: null, dur: 6, vb: VB0, t: 'No Read no es falla', d: 'Un No Read es una lectura que terminó bien sin código: va a E3 y a revisión. Una falla (comunicación, dato inválido, códigos contradictorios, tiempos vencidos) va a E5 y pide intervención.' },
];
const TOUR = { on: false, vb: VB0.slice(), idx: -1 };
function vbDe(p) {
  const [x, y, w, h] = POS[p], cx = x + w / 2, cy = y + h / 2, W = 380, H = W * 560 / 900;
  return [Math.min(900 - W, Math.max(0, cx - W / 2)), Math.min(560 - H, Math.max(0, cy - H / 2)), W, H];
}
export function tourGrafcet(t, dt) {
  if (!_svg || !_sec) return null;
  if (!TOUR.on) { TOUR.on = true; TOUR.idx = -1; TOUR.vb = VB0.slice(); _sec.classList.add('pleno'); }
  let acc = 0, i = 0;
  for (; i < PARADAS.length - 1 && t >= acc + PARADAS[i].dur; i++) acc += PARADAS[i].dur;
  const P = PARADAS[i], meta = P.vb || vbDe(P.p);
  const k = Math.min(1, (dt || 0.016) * 2.2);
  TOUR.vb = TOUR.vb.map((v, j) => v + (meta[j] - v) * k);
  _svg.setAttribute('viewBox', TOUR.vb.map((v) => v.toFixed(1)).join(' '));
  if (TOUR.idx !== i) {
    TOUR.idx = i;
    const e = ETAPAS.find((x) => x.id === P.p);
    _cap.innerHTML = e
      ? `<small>${e.descarga ? 'Rama de descarga' : 'Etapa'} ${esc(e.id)}</small><h3>${esc(e.id)} · ${esc(e.titulo)}</h3><p>${esc(e.desc)}</p><ul>${e.sale.map((s) => `<li>→ ${esc(s)}</li>`).join('')}</ul>`
      : `<small>GRAFCET</small><h3>${esc(P.t)}</h3><p>${esc(P.d)}</p>`;
    _cap.classList.remove('entra'); void _cap.offsetWidth; _cap.classList.add('entra');
  }
  return P.p || 'E0';
}
export function salirTour() {
  if (!TOUR.on) return;
  TOUR.on = false; TOUR.idx = -1;
  _sec?.classList.remove('pleno');
  _svg?.setAttribute('viewBox', VB0.join(' '));
  if (_cap) _cap.innerHTML = '';
}
