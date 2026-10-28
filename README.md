# TracePack PLC: simulación de descarga robotizada, identificación y registro de bultos (TPI 2026 · Grupo 1 · H3)

Simulación del caso de `TPI2026_G01_H3.md` sobre el tramo de una sola cinta.

## Cómo abrirlo
Doble clic en **`INICIAR.bat`**, o en el acceso **`TracePack - Simulacion TPI.bat`** del escritorio, que abre el mismo menú:

| Opción | Qué hace |
|---|---|
| 1 | Abre la **simulación web** en el navegador (recomendada). Deja abierta la ventana del servidor mientras la usás. |
| 2 | Abre el modelo 3D en Blender. |
| 3 / 4 | Abre el modelo de FlexSim H3 (camión + AMR) o H2 (carga manual). |
| 5 | Vuelve a pasar a la web los resultados de FlexSim (necesita Python). |

La web no necesita Python, internet ni instalar nada. El servidor es un script de PowerShell (`web/servidor.ps1`) que sirve solo esa carpeta y solo en `localhost`. Para mostrarla, usá el botón **▶ Demo guiada**.

1. **H3, descarga.** Llega un camión con 36 bultos de 4 formatos. Un AMR de dos brazos con cabezales multiventosa los toma por la cara frontal. Los traslada a una cinta de acumulación de capacidad 3, solo cuando el PLC lo autoriza.
2. **H2, identificación.** La acumulación libera un bulto por ciclo. La estación lo lee con 6 lectores (R1–R6) sobre una cinta transparente. Si la lectura es OK, se registra y sale por la línea principal. Si es No Read, el cilindro lo desvía. Es la secuencia E0–E5, con interbloqueos, fallas y rearme.
3. **Revisión manual.** El No Read queda en el contenedor. Un operario lo toma, lo lee con un lector de mano y lo apoya en una cinta de retorno.
4. **Destino final común.** La línea principal y el retorno terminan en el mismo colector, que lleva todo a expedición.

| Carpeta | Herramienta | Contenido |
|---|---|---|
| `flexsim/` | FlexSim 2026 (vía MCP) | Lógica de flujo y experimentos (H2 y H3) |
| `blender/` | Blender 5.2 (vía MCP) | Modelo 3D, animación y renders |
| `web/` | three.js | Simulación interactiva: 3D, HMI, GRAFCET, secuencia del AMR, resultados y PLC |
| `plc/` | TIA Portal (SCL) | Programa del S7-1200 (secuencia E0–E5 y autorización del AMR) y tabla de E/S |

## plc/
- **`TracePack_PLC.scl`:** fuente SCL (IEC 61131-3) para importar en TIA Portal ("Fuentes externas" → "Generar bloques desde la fuente"). Incluye dos bloques:
  - `FB_Estacion`: secuencia E0–E5 con sus subfases. Tiene temporizadores de supervisión (transporte, parada, ventana de lectura, registro, S_EXT/S_PASO/S_RET, liberación), interbloqueos del desvío, comandos por flanco y rearme deliberado. También maneja la baliza.
  - `FB_AutorizacionAMR`: autorización de recogida y de depósito. La espera por capacidad no es alarma, y la obstrucción provoca una detención coordinada.
- **`Tabla_IO.csv`:** asignación preliminar en el CPU 1214C: 14 entradas (encoder en HSC1), 10 salidas, los lectores por PROFINET y los DB de intercambio con el ERP y la HMI.

Las direcciones y los tiempos son una propuesta a validar en el diseño de detalle (sección 10.3). No se probó en un PLC real.

## flexsim/
- **`TracePack_H3_Camion_AMR.fsm`** (modelo principal):
  - `Camion_Llegada` (Source: 36 bultos juntos cada `IAT_Camion`) → `Camion_Caja`.
  - **`AMR_Robot`** (Transporter, `T_Agarre` + `T_Deposito`) → `Zona_Acumulacion` (máx. 3).
  - `Alimentador` (máx. 1) → `Estacion_Inspeccion` (capacidad 1; resultado y tiempo por FlexScript).
  - Salida OK: `Salida_Principal` → `Expedicion`.
  - Salida No Read: `Revision_Manual` → `Lectura_Manual` (Processor atendido por el Operator `Operario`, `T_LecturaManual`) → `Expedicion`.
  - Tablas `Historico`, `Descargas` y `Camiones` (se vacían en cada reset).
- **`TracePack_Estacion.fsm`**: modelo H2 con carga manual, como referencia.
- **Resultados:**
  - `resultados_experimentos_h3/summary_h3.csv`: 4 escenarios × 3 semillas × 8 h (AMR base, camiones cada 7 min, AMR lento y descarga manual asistida).
  - `resultados_experimentos/`: los escenarios H2 y el histórico de 1 h.
- **`exportar_resultados_web.py`**: pasa los CSV a `web/data/flexsim_resultados.js`. Correr `python flexsim/exportar_resultados_web.py` después de cada experimento nuevo.

## blender/
`TracePack_Estacion.blend` se genera con estos scripts. Se corren en este orden, en la consola Python de Blender y en el mismo namespace:
1. `crear_escena_tracepack.py`: estación, sensores, cilindro y lectores. También los **4 formatos de bulto** (estándar, plana con cinta de frágil, cúbica blanca y alta) con un **sticker QR** de patrones de esquina, código de barras y texto.
2. `crear_revision_manual.py`: operario con chaleco, casco y lector de mano; cinta de retorno; colector; túnel de expedición.
3. `crear_descarga_amr.py`: muelle a nivel, camión con puertas, carga apilada por altura real, cinta de acumulación (S_CARGA, S_ACU) y **AMR**. El AMR tiene base, mástil, carro elevable y dos brazos de dos eslabones con cinemática inversa y cabezales de 4 ventosas.
4. `crear_entorno.py`: terreno, marco y burletes del muelle, demarcación de la zona AMR, senda peatonal, rack y carteles. Las paredes, columnas y portón están apagados (`PAREDES = False`); se reactivan cambiando esa línea.
5. `animar_ciclos.py` y `animar_descarga_amr.py`: 384 cuadros. El camión llega y el AMR hace una recogida completa; además hay un ciclo OK y uno No Read.

Ejemplo: `ns = {}; exec(open(r"...\crear_escena_tracepack.py", encoding="utf-8").read(), ns)` y lo mismo con los demás, pasando `ns`.

En `renders/` hay 8 imágenes EEVEE: lectura, salida OK, desvío, carril, agarre del AMR, depósito, revisión manual y planta completa.

**Sin colisiones.** El AMR toma el bulto por la cara frontal, la única accesible en la pared de carga, así los brazos nunca se meten entre bultos ni tocan el camión. Gira solo fuera del camión (x = −11), con el bulto recogido cerca del cuerpo. Deposita con la base frente a la cinta, sin tocarla, extendiendo los brazos por encima de las barandas.

## web/
Se abre con `INICIAR.bat` (opción 1) o con `web/iniciar_web.bat`. Levanta `http://localhost:8000` con PowerShell; si el puerto está ocupado, usa el siguiente libre. three.js está incluido, así que funciona sin internet.

- **▶ Demo guiada:** recorre sola los 16 pasos del sistema, con la cámara moviéndose y un cartel explicativo en cada uno (unos 2 minutos):
  - llegada del camión y descarga del AMR (visión 3D, agarre con vacío, depósito);
  - un bulto por ciclo, lectura multidireccional, registro y salida;
  - No Read con desvío y revisión manual;
  - falla de registro con reconocer, resolver y rearmar;
  - obstrucción del AMR;
  - expedición.
  
  Se corta con "Salir".
- **⚙ Escenarios:** abre un panel horizontal sobre el 3D con un interruptor por cada caso atípico.
  - Mientras el interruptor está prendido, el caso puede ocurrir al azar en cada oportunidad. "Provocar" lo fuerza en la próxima, aunque esté apagado.
  - Casos: AMR acelerado con sobrecarga de la acumulación, bulto cruzado en la transferencia, bulto trabado en el carril de excepción, etiquetas dañadas, ERP sin respuesta, falta de aire comprimido, lectura inválida, obstáculos para el AMR y agarre inestable.
  - Cada uno pasa por las alarmas y el rearme del PLC. El bulto cruzado retoma su ciclo con el mismo ID; la sobrecarga no deja rearmar hasta que la estación vacía la acumulación.
  - En el mismo panel: **operario de revisión en planta**, AMR habilitado y porcentaje de lectura OK.
- **Revisión manual:** los No Read se apilan en el contenedor (4 en el piso y 4 encima) y quedan ahí. Con el interruptor del operario prendido, llega por la senda peatonal, los lee de a uno (primero los de arriba) y los manda por la cinta de retorno a expedición. Al apagarlo, termina el bulto que tiene en la mano y se va. Con el contenedor lleno, S_EXC bloquea el desvío.
- **HMI:** los comandos y la alarma quedan siempre arriba; el resto se reparte en pestañas (Proceso, Descarga, Señales).
- **Comparación H2 vs H3:** el selector "Modo de descarga del camión" alterna entre el AMR y un operario de carga (chaleco verde) que descarga a mano con las mismas reglas de autorización. Cada camión descargado se anota con su tiempo y bultos/h, al lado de la referencia de FlexSim.

- **3D en vivo:**
  - el camión llega, abre las puertas y se arrima al muelle;
  - el AMR descarga siguiendo la secuencia R0–R6 de las secciones 19 y 20;
  - la acumulación libera un bulto por ciclo a la estación (E0–E5);
  - los No Read caen al contenedor y el operario los lee (se ve el láser del lector);
  - todo termina en expedición.
  
  Cámaras: Planta, Descarga, Estación, Desviador, Revisión y Lectores. Velocidad de ½× a 16×. Las etiquetas arrancan apagadas: el casillero "Etiquetas" las muestra.
- **Visual:** las bandas tienen nervaduras que avanzan solo cuando su motor está en marcha. Hay resplandor (bloom) en haces de sensores, conos de lectura, baliza, láser y ventosas, además de texturas de hormigón, asfalto y césped.
- **HMI:**
  - estado del ciclo, resultado, código, ID, registro y desviador;
  - revisión manual;
  - camión, carga, estado del AMR, acumulación y vacío;
  - lectores R1–R6 y señales de campo;
  - comandos con bloqueos;
  - indicadores: procesados, lectura exitosa, camiones, recogidas, leídos a mano y expedición.
- **Panel de pruebas:**
  - para el próximo bulto: OK, No Read, falla de registro, cilindro trabado, códigos contradictorios o pérdida de comunicación;
  - para la próxima recogida del AMR: agarre no verificado (reintenta) u obstrucción (detención coordinada, conserva la sujeción, rearme).
- **Secciones:** histórico (formato 15.3.1, con botón **Exportar CSV**), GRAFCET E0–E5, secuencia del AMR, resultados de FlexSim H2 y H3, arquitectura, **programa del PLC** con su tabla de E/S, y renders.

## MCP usados
- **Blender**: el MCP `blender` construyó, animó, renderizó y exportó toda la escena.
- **FlexSim**: tu servidor `MCP_Flexsim` (`...\Simulación\TP Simulación\MCP_Flexsim`). Armó los dos modelos, corrió los experimentos y sacó las capturas. El `.mcp.json` de esta carpeta lo apunta, así que se carga al abrir Claude Code acá (aprobalo la primera vez).

## Supuestos (a validar, secciones 15.5 y 21)
- Estación: transporte 4–5 s, lectura 1,5 s, registro 1,2 s, desvío 2,5 s; lectura OK 92 %.
- AMR: agarre 6 s, depósito 3 s, 0,9 m/s.
- Lectura manual: 20 s por bulto.
- Camiones: 36 bultos cada 20 min.

Son valores ilustrativos, no mediciones.
