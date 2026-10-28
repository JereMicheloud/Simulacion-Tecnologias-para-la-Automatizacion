// Seccion "Resultados FlexSim": tablas, barras y linea de tiempo desde data/flexsim_resultados.js
const D = window.FLEXSIM;
const $ = (id) => document.getElementById(id);
const NOMBRES = { Base: 'Base', Lectura_degradada: 'Lectura degradada', Alta_demanda: 'Alta demanda', Pico_saturacion: 'Pico (saturación)' };
const f1 = (v) => v.toLocaleString('es-AR', { maximumFractionDigits: 1, minimumFractionDigits: 1 });

if (!D) {
  $('tabEsc').innerHTML = '<tr><td>Falta data/flexsim_resultados.js (correr flexsim/exportar_resultados_web.py).</td></tr>';
} else {
  const E = D.escenarios;
  const cols = [
    ['Llegada media', (e) => `cada ${e.parametros.IAT_Llegada} s`],
    ['Lectura OK (param.)', (e) => `${e.parametros.Pct_LecturaOK} %`],
    ['Procesados / h', (e) => e.procesados_h],
    ['Lectura exitosa', (e) => e.pct_ok, ' %'],
    ['No Read (8 h)', (e) => e.no_read],
    ['Utilización estación', (e) => e.utilizacion, ' %'],
    ['Cola máx. zona de carga', (e) => e.cola_max],
    ['Espera media en cola', (e) => e.espera_cola_s, ' s'],
    ['Tiempo en estación', (e) => e.t_estacion_s, ' s'],
  ];
  let h = '<thead><tr><th>Indicador</th>' + E.map((e) => `<th class="num">${NOMBRES[e.nombre] ?? e.nombre}</th>`).join('') + '</tr></thead><tbody>';
  for (const [n, fn, u = ''] of cols) {
    h += `<tr><td>${n}</td>` + E.map((e) => {
      const v = fn(e);
      return typeof v === 'string' ? `<td class="num">${v}</td>` : `<td class="num">${f1(v.media)}${u} <span class="sd">±${f1(v.desvio)}</span></td>`;
    }).join('') + '</tr>';
  }
  $('tabEsc').innerHTML = h + '</tbody>';

  const barras = [
    ['Utilización de la estación (%)', (e) => e.utilizacion.media, 100, (v) => v > 85],
    ['Bultos procesados por hora', (e) => e.procesados_h.media, Math.max(...E.map((e) => e.procesados_h.media)), () => false],
    ['Cola máxima en la zona de carga (bultos)', (e) => e.cola_max.media, Math.max(...E.map((e) => e.cola_max.media)), (v) => v > 20],
  ];
  $('barras').innerHTML = barras.map(([t, fn, max, alto]) => `<div class="barra-g"><h4>${t}</h4>` + E.map((e) => {
    const v = fn(e);
    return `<div class="barra"><span>${NOMBRES[e.nombre]}</span><span class="pista"><span class="rell${alto(v) ? ' alto' : ''}" style="width:${(100 * v) / max}%"></span></span><span class="val">${f1(v)}</span></div>`;
  }).join('') + '</div>').join('');

  const [b, deg, , pico] = E;
  const capOK = D.parametros.reduce((s, p) => s + (['T_Transporte', 'T_Lectura', 'T_Registro', 'T_Evacuacion'].includes(p.nombre) ? p.valor : 0), 0);
  $('concl').textContent = `Con una llegada cada ${b.parametros.IAT_Llegada} s la estación trabaja al ${f1(b.utilizacion.media)} % y la cola casi no crece. ` +
    `Un ciclo OK dura ${f1(capOK)} s (transporte, lectura, registro y evacuación), así que la capacidad ronda ${Math.round(3600 / capOK)} bultos/h: ` +
    `en el escenario pico la estación queda al ${f1(pico.utilizacion.media)} % y la cola llega a ${f1(pico.cola_max.media)} bultos. ` +
    `Bajar la lectura exitosa a ${deg.parametros.Pct_LecturaOK} % no frena la línea pero multiplica los No Read (${f1(deg.no_read.media)} vs ${f1(b.no_read.media)} por turno) que pasan a revisión manual. ` +
    'Es el costo esperado de “un bulto por ciclo” (sección 15.5).';

  const tb = D.parametros.map((p) => `<tr><td><code>${p.nombre}</code></td><td class="num">${p.valor} ${p.unidad}</td><td>${p.descripcion}</td></tr>`).join('');
  $('tabPar').innerHTML = '<thead><tr><th>Parámetro</th><th class="num">Valor</th><th>Descripción</th></tr></thead><tbody>' + tb + '</tbody>';

  // linea de tiempo: x = instante de ingreso a la estacion, alto = duracion del ciclo
  const svg = $('svgTimeline'), H = D.historico_base, W = 640, AL = 230, m = { l: 34, r: 8, t: 10, b: 26 };
  const maxT = Math.max(...H.filas.map((r) => r[3]));
  const sx = (t) => m.l + (t / H.duracion_s) * (W - m.l - m.r);
  const sy = (v) => AL - m.b - (v / maxT) * (AL - m.t - m.b);
  const color = { 1: 'var(--ok)', 2: 'var(--nr)', 3: 'var(--falla)' };
  const nombreRes = { 1: 'OK', 2: 'No Read', 3: 'OK + alarma de registro' };
  let s = '';
  for (let mm = 0; mm <= 60; mm += 10) s += `<line x1="${sx(mm * 60)}" x2="${sx(mm * 60)}" y1="${m.t}" y2="${AL - m.b}" stroke="#2b3743"/><text x="${sx(mm * 60)}" y="${AL - 8}" text-anchor="middle">${mm} min</text>`;
  for (const v of [0, 10, 20, 30, 40]) if (v <= maxT) s += `<text x="${m.l - 6}" y="${sy(v) + 4}" text-anchor="end">${v} s</text>`;
  for (const [id, t, res, dur] of H.filas) {
    s += `<rect x="${sx(t) - 1.4}" y="${sy(dur)}" width="2.8" height="${AL - m.b - sy(dur)}" fill="${color[res]}"><title>Ciclo ${id} · t=${t.toFixed(0)} s · ${nombreRes[res]} · ${dur.toFixed(1)} s</title></rect>`;
  }
  svg.innerHTML = s;

  // ---- H3: camion + AMR ----
  const EH = D.h3?.escenarios;
  if (EH) {
    const filas = [
      ['Llegada de camiones', (e) => `cada ${e.parametros.IAT_Camion / 60} min`],
      ['Agarre + depósito', (e) => `${e.parametros.T_Agarre} + ${e.parametros.T_Deposito} s`],
      ['Descarga por camión', (e) => e.descarga_min, ' min'],
      ['Peor descarga', (e) => e.descarga_max_min, ' min'],
      ['Bultos descargados / h', (e) => e.entregas_h],
      ['Bultos procesados / h', (e) => e.procesados_h],
      ['Utilización estación', (e) => e.utilizacion, ' %'],
      ['Ocupación media acumulación', (e) => e.acu_media],
      ['Espera media de un bulto en el camión', (e) => e.espera_camion_min, ' min'],
      ['Llegan a expedición / h (OK + leídos a mano)', (e) => e.expedidos_h],
      ['Ocupación del operario de lectura manual', (e) => e.util_operario, ' %'],
    ];
    let t = '<thead><tr><th>Indicador</th>' + EH.map((e) => `<th class="num">${e.etiqueta}</th>`).join('') + '</tr></thead><tbody>';
    for (const [n, fn, u = ''] of filas) {
      t += `<tr><td>${n}</td>` + EH.map((e) => {
        const v = fn(e);
        return typeof v === 'string' ? `<td class="num">${v}</td>` : `<td class="num">${f1(v.media)}${u} <span class="sd">±${f1(v.desvio)}</span></td>`;
      }).join('') + '</tr>';
    }
    $('tabH3').innerHTML = t + '</tbody>';
    const maxD = Math.max(...EH.map((e) => e.descarga_min.media));
    $('barrasH3').innerHTML = '<div class="barra-g">' + EH.map((e) => {
      const v = e.descarga_min.media, lim = e.parametros.IAT_Camion / 60;
      return `<div class="barra"><span>${e.etiqueta.split(' · ')[0]}</span><span class="pista"><span class="rell${v > lim ? ' alto' : ''}" style="width:${(100 * v) / maxD}%"></span></span><span class="val">${f1(v)}</span></div>`;
    }).join('') + '</div><p class="leyenda">En rojo: la descarga tarda más que el intervalo entre camiones y la cola de camiones crece.</p>';
    const [base, seguidos, lento, manual] = EH;
    $('conclH3').textContent = `Con un camión cada ${base.parametros.IAT_Camion / 60} min, el AMR descarga los 36 bultos en ${f1(base.descarga_min.media)} min y la estación queda al ${f1(base.utilizacion.media)} %. ` +
      `Con camiones cada ${seguidos.parametros.IAT_Camion / 60} min, el robot sigue el ritmo (${f1(seguidos.descarga_min.media)} min por camión), pero la estación de lectura pasa al ${f1(seguidos.utilizacion.media)} % y se vuelve el cuello de botella del conjunto: es el límite de "un bulto por ciclo". ` +
      `Si el agarre tarda ${lento.parametros.T_Agarre} s, el AMR no da abasto y un bulto espera en promedio ${f1(lento.espera_camion_min.media)} min dentro del camión. ` +
      `La referencia manual asistida (${f1(manual.descarga_min.media)} min) es parecida en tiempo. La ventaja del AMR está en sacar la tarea repetitiva y el esfuerzo físico, no en el caudal, que sigue limitado por la estación (sección 21).`;
  }
}

// ---- programa del PLC y tabla de E/S (archivos de plc/, copiados en data/) ----
const esc = (t) => t.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const CLAVES = /\b(FUNCTION_BLOCK|END_FUNCTION_BLOCK|VAR_INPUT|VAR_OUTPUT|VAR CONSTANT|VAR|END_VAR|BEGIN|CASE|OF|END_CASE|IF|THEN|ELSIF|ELSE|END_IF|AND|OR|NOT|TRUE|FALSE)\b/g;
fetch('data/TracePack_PLC.scl').then((r) => r.text()).then((t) => {
  // resaltado minimo: palabras clave y comentarios
  $('codPLC').innerHTML = t.split(/\r?\n/).map((l) => {
    const i = l.indexOf('//');
    const cod = esc(i >= 0 ? l.slice(0, i) : l).replace(CLAVES, '<b>$1</b>');
    return i >= 0 ? cod + '<i>' + esc(l.slice(i)) + '</i>' : cod;
  }).join('\n');
}).catch(() => { $('codPLC').textContent = 'No se pudo cargar data/TracePack_PLC.scl'; });
fetch('data/Tabla_IO.csv').then((r) => r.text()).then((t) => {
  const [cab, ...filas] = t.trim().split(/\r?\n/).map((l) => l.split(';'));
  $('tabIO').innerHTML = '<thead><tr>' + [cab[0], cab[2], cab[4]].map((c) => `<th>${esc(c)}</th>`).join('') + '</tr></thead><tbody>' +
    filas.map((f) => `<tr><td><code>${esc(f[0])}</code></td><td class="mono">${esc(f[2])}</td><td>${esc(f[4])}</td></tr>`).join('') + '</tbody>';
}).catch(() => { $('tabIO').innerHTML = '<tr><td>No se pudo cargar data/Tabla_IO.csv</td></tr>'; });

// ---- exportar el historico (como lo guardaria el servicio de integracion) ----
$('btnCsv').onclick = () => {
  const filas = [['Fecha y hora', 'ID del ciclo', 'Origen', 'Evento o dato', 'Calidad o validez'],
    ...[...document.querySelectorAll('#tbHist tr')].reverse().map((tr) => [...tr.cells].map((td) => td.textContent))];
  const csv = '\ufeff' + filas.map((f) => f.map((v) => `"${v.replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = 'TracePack_historico.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
