# TracePack PLC: documentación de la simulación

**TPI 2026 · Tecnologías para la Automatización · Grupo 1 · Hito H3**
UTN FRSFco · Díaz Aimar, Mecchia, Micheloud, Sereno · Prof. Oberto

Este documento describe la parte **simulada** del proyecto: qué se construyó, qué hace cada pieza y qué resultados da. El caso, los requisitos y las decisiones de diseño están en el entregable `TPI2026_G01_H3.md`, que esta documentación no reemplaza. Las referencias del tipo "sección 12.4" apuntan a ese documento.

---

## 1. Qué se simuló

Se simuló el **tramo de una sola cinta** del sistema TracePack: desde que llega un camión con bultos hasta que cada bulto termina en expedición, identificado y registrado.

```
Camión ──► AMR de dos brazos ──► Acumulación (máx. 3) ──► Alimentador ──► Estación de lectura y desvío
                                                                             │
                                                     ┌───────── OK ──────────┤
                                                     ▼                       │ No Read
                                        Línea principal                      ▼
                                                     │        Contenedor de revisión (máx. 8)
                                                     │                       │ operario con lector de mano
                                                     │                       ▼
                                                     │              Cinta de retorno
                                                     ▼                       ▼
                                                  Colector común ──► Expedición
```

El sistema tiene cuatro partes:

| Parte | Hito | Qué hace |
|---|---|---|
| **Descarga robotizada** | H3 (secciones 16–21) | Un AMR con dos brazos y cabezales multiventosa saca los bultos del camión y los deja en una cinta de acumulación. Solo recoge cuando el PLC lo autoriza. |
| **Estación de identificación** | H2 (secciones 9–15) | Procesa **un bulto por ciclo**: lo detiene, lo lee con 6 lectores (R1–R6), lo registra en el ERP o lo desvía si es No Read. Sigue la secuencia E0–E5. |
| **Revisión manual** | H2 (sección 13) | Los No Read se juntan en un contenedor hasta que un operario los lee con un lector de mano y los devuelve al flujo. |
| **Expedición** | — | La línea principal y la cinta de retorno terminan en el mismo colector, así que todos los bultos llegan al mismo destino. |

### Herramientas y para qué se usó cada una

| Herramienta | Para qué | Dónde |
|---|---|---|
| **FlexSim 2026** | La **lógica de flujo** y los experimentos: caudal, utilización, colas y tiempos de descarga en turnos de 8 h con varias semillas. | `flexsim/` |
| **Blender 5.2** | El **modelo 3D**: la planta, el camión, el AMR, los lectores, los sensores, el cilindro y el operario. También las animaciones y los renders. | `blender/` |
| **Web (three.js)** | La **simulación interactiva**: el modelo de Blender movido por la lógica de control en tiempo real, con HMI, alarmas y casos atípicos. | `web/` |
| **SCL (IEC 61131-3)** | El **programa del PLC** S7-1200 con la misma secuencia, para importar en TIA Portal. | `plc/` |

FlexSim y Blender se manejaron desde Claude Code a través de sus servidores MCP: los modelos se armaron, corrieron y exportaron por script.

---

## 2. Cómo funciona el sistema simulado

### 2.1 Descarga del camión (secuencia del AMR, R0–R6)

1. **Llegada del camión.** Frena antes del muelle, abre las puertas y retrocede hasta el nivelador. El sensor **S_CAMION** confirma la posición. Trae **36 bultos de 4 formatos** apilados en 3 filas × 4 columnas × 3 niveles.
2. **Autorización del PLC (R0).** Autoriza una recogida solo si se cumplen todas estas condiciones:
   - hay camión en posición;
   - la operación está en automático;
   - no hay alarmas;
   - hay lugar en la acumulación (menos de 3 bultos).

   Esperar por falta de lugar es una **condición normal**, no una alarma (sección 20).
3. **Traslado (R1).** El robot gira **fuera del camión**, en la zona AMR demarcada, y sube o baja el carro a la altura del bulto.
4. **Visión 3D (R2).** Localiza el bulto y su cara frontal. Se retira de arriba hacia abajo y desde la puerta, para no desestabilizar la carga restante.
5. **Agarre (R3).** Entra en línea recta y apoya los **dos cabezales de 4 ventosas** lado a lado sobre la cara frontal. Activa el vacío y **verifica el agarre antes de levantar**; si no se verifica, reposiciona y reintenta.
6. **Retiro y traslado (R4).** Sale en línea recta, recoge el bulto cerca del cuerpo y lo lleva por encima de las barandas. Si el lidar detecta un obstáculo, hay **detención coordinada** del robot y de la acumulación, y el bulto **sigue sujeto**.
7. **Depósito (R5).** Con el punto de carga libre (**S_CARGA**), extiende los brazos sobre la cinta, apoya el bulto y libera las ventosas.
8. **Retorno (R6).** Cuando el camión queda vacío, se va y llega el siguiente.

La geometría se armó para que **nada atraviese nada**. Los brazos (cinemática inversa de dos eslabones) siempre quedan por delante de la cara del bulto. La base nunca toca la cinta. Los giros se hacen en zona libre.

### 2.2 Estación de identificación (secuencia E0–E5, sección 12.4)

| Etapa | Qué pasa | Pasa a… |
|---|---|---|
| **E0 · Esperando bulto** | La acumulación libera un solo bulto hacia el alimentador. **S_ING** lo detecta y se crea un **ID de ciclo** propio, independiente del código del producto. | E1 |
| **E1 · Posicionado e identificando** | El bulto llega a **S_ZONA**, se inhibe el alimentador y se para la cinta. El **encoder** confirma la detención y se disparan **R1–R6**. | E2 si hay código válido · E3 si es No Read · E5 si hay falla |
| **E2 · Registrando** | El bulto queda **retenido** hasta que el ERP confirma el registro para el **mismo ID**. | E4 · E5 si vence el tiempo |
| **E3 · Derivando a excepción** | El cilindro solo se habilita con bulto presente, cinta detenida, **S_RET** y contenedor con lugar (**S_EXC**). Se confirman **S_EXT → S_PASO → S_RET**. | E4 · E5 si falta una confirmación |
| **E4 · Finalizando** | Si hubo registro, el bulto sale por la línea principal. Se confirma estación libre y desviador en reposo. | E0 |
| **E5 · Falla / intervención** | Se inhiben los movimientos y se conserva el contexto. Para salir: **reconocer → resolver la causa en planta → rearmar**. Reconocer solo no alcanza. | E4 (registro confirmado y bulto en la estación) · E1 (bulto enderezado) · E0 (ciclo resuelto) |

**Un No Read es distinto de una falla.** Un No Read es una adquisición correcta sin código, y va al desvío. Una pérdida de comunicación o dos lectores con códigos distintos son una **falla**, y van a E5 (sección 13.2).

**Tiempos máximos de supervisión** (supuestos, sección 15.5):

| Supervisión | Tiempo máximo |
|---|---|
| Transporte hasta S_ZONA | 7 s |
| Detención confirmada por el encoder | 2 s |
| Confirmación del registro en el ERP | 3 s (como en el ejemplo de la sección 15.3.1) |
| Extensión del cilindro (S_EXT) | 2 s |
| Paso por el carril (S_PASO) | 3 s |
| Retorno del cilindro (S_RET) | 2 s |
| Liberación de la estación | 8 s |

### 2.3 Revisión manual

- Los No Read caen a un contenedor con **8 lugares**: 4 en el piso y 4 encima. **Quedan ahí**; no hay un operario fijo.
- Con el interruptor **"Operario de revisión en planta"**, se llama a un operario. Llega caminando por la senda peatonal y toma los bultos **de a uno, empezando por los de arriba**. Los apoya en la cinta de retorno y los lee con el **lector de mano** (se ve el láser). Después siguen el mismo flujo que el resto hasta expedición.
- Al apagar el interruptor, el operario **termina el bulto que tiene en la mano** y se va.
- Si el contenedor se llena, **S_EXC bloquea el desvío** y la estación espera, como pide el interbloqueo de la sección 13.1.

### 2.4 Señales de campo simuladas

| Señal | Qué indica |
|---|---|
| S_ING, S_ZONA | Ingreso al alimentador y presencia en la estación |
| Encoder | Velocidad y detención de la cinta de inspección |
| R1–R6 | Resultado de cada lector: leyendo, código, sin código o error |
| S_EXT, S_RET, Y_VUVG | Cilindro extendido o en reposo, y bobina de la electroválvula |
| S_PASO, S_EXC | Paso por el carril de excepción y contenedor ocupado o lleno |
| S_CAMION, S_CARGA, S_ACU | Camión en posición, punto de carga ocupado y acumulación llena |
| M_ALIM, M_INSP, M_ACU | Marcha de cada cinta |
| VAC, AGARRE, LIDAR | Vacío en los cabezales, agarre verificado y obstáculo detectado |

---

## 3. Simulación en FlexSim

Los modelos se armaron por script (FlexScript) desde el MCP de FlexSim. Todos los tiempos y porcentajes están en **`Model.parameters`**, así que se pueden cambiar sin tocar código.

### 3.1 Modelo H3: camión + AMR (`flexsim/TracePack_H3_Camion_AMR.fsm`)

```
Camion_Llegada → Camion_Caja → [AMR_Robot] → Zona_Acumulacion (máx. 3) → Alimentador (máx. 1) → Estacion_Inspeccion (cap. 1)
                                                                              ├─ OK ──────► Salida_Principal ──► Expedicion
                                                                              └─ No Read ─► Revision_Manual ──► Lectura_Manual [Operario] ──► Expedicion
```

- **Camion_Llegada:** una Source que entrega los 36 bultos juntos cada `IAT_Camion`.
- **AMR_Robot:** un Transporter. Solo recoge cuando la acumulación tiene lugar, igual que la autorización del PLC.
- **Estacion_Inspeccion:** un Processor de capacidad 1. Su tiempo de proceso, escrito en FlexScript, sortea el resultado (OK, No Read o OK con falla de registro). Con eso suma transporte + lectura + (registro + evacuación, o desvío) + intervención.
- **Lectura_Manual:** un Processor atendido por un Operator.
- **Tablas:**
  - `Historico`: cada ciclo con su ID, su resultado y su tiempo.
  - `Descargas`: cada entrega del AMR, de donde sale el tiempo de descarga por camión.
  - `Camiones`: llegada de cada camión.

**Parámetros:**

| Parámetro | Valor |
|---|---|
| `IAT_Camion` | 1200 s (un camión cada 20 min) |
| `N_Bultos_Camion` | 36 |
| `T_Agarre` | 6 s |
| `T_Deposito` | 3 s |
| `T_LecturaManual` | 20 s |
| `T_Transporte` | 5 s |
| `T_Lectura` | 1,5 s |
| `T_Registro` | 1,2 s |
| `T_Evacuacion` | 3 s |
| `T_Desvio` | 2,5 s |
| `Pct_LecturaOK` | 92 % |
| `Pct_FallaRegistro` | 2 % |
| `T_Intervencion` | 30 s |

**Resultados** (`flexsim/resultados_experimentos_h3/summary_h3.csv`; promedio de 3 semillas, turnos de 8 h):

| Escenario | Descarga por camión | Bultos a expedición / h | Estación | Operario de revisión |
|---|---|---|---|---|
| AMR, un camión cada 20 min | **6,8 min** (máx. 7,1) | 108 | 33 % | 5 % |
| AMR, un camión cada 7 min | **6,9 min** (máx. 8,1) | 308 | **95 %** | 14 % |
| AMR lento (agarre 10 s), cada 7 min | **81 min** (máx. 152) | 214 | 66 % | 10 % |
| Descarga manual asistida, cada 7 min | **6,1 min** (máx. 7,6) | 309 | 96 % | 14 % |

**Lectura de los resultados:**
- **Camiones cada 20 min:** el AMR descarga un camión en menos de 7 min y sobra capacidad en toda la línea.
- **Camiones cada 7 min:** el robot sigue el ritmo, pero la **estación de lectura pasa a ser el cuello de botella** (95 %). Es el costo de procesar un bulto por ciclo con retención hasta confirmar el registro (sección 15.5).
- **AMR lento:** con un agarre de 10 s el robot no da abasto. Un bulto espera en promedio **77 min** dentro del camión y los camiones se acumulan.
- **Descarga manual asistida:** tarda parecido. La ventaja del AMR no está en el caudal, que limita la estación, sino en **sacar la tarea repetitiva y el esfuerzo físico** del operario. Es la comparación que pide la sección 21.

### 3.2 Modelo H2: estación con carga manual (`flexsim/TracePack_Estacion.fsm`)

Es el modelo de referencia, sin robot: un bulto llega cada `IAT_Llegada` y un operario lo carga.

| Escenario | Procesados / h | Lectura exitosa | Estación | Cola máx. | Espera en cola |
|---|---|---|---|---|---|
| Base (un bulto cada 25 s) | 146 | 91 % | 41 % | 4 | 1 s |
| Lectura degradada (80 %) | 146 | 79 % | 40 % | 4 | 1 s |
| Alta demanda (cada 14 s) | 255 | 92 % | 72 % | 11 | 8 s |
| Pico (cada 10 s) | 353 | 91 % | **99 %** | **77** | **6,7 min** |

Un ciclo OK dura unos 9,7 s, así que la estación procesa como máximo unos **370 bultos/h**. Bajar la lectura exitosa no frena la línea, pero **multiplica los No Read**: 243 contra 102 por turno, todos a revisión manual.

Para volver a pasar los resultados a la web, después de correr experimentos nuevos: `python flexsim/exportar_resultados_web.py` (u opción 5 del `INICIAR.bat`).

---

## 4. Modelo 3D en Blender (`blender/`)

`TracePack_Estacion.blend` se genera con scripts. Se corren en este orden, en la consola Python de Blender y en el mismo espacio de nombres:

| Script | Construye |
|---|---|
| `crear_escena_tracepack.py` | Alimentador, cinta transparente de inspección, túnel con los lectores R1–R6 y sus campos de visión (46° × 29°, Zebra FS40), sensores, encoder, cilindro Festo ADN-S + VUVG, carril de excepción, contenedor, PLC, HMI y baliza. También los **4 formatos de bulto** (estándar, plana con cinta de frágil, cúbica y alta) con un **sticker con QR**, código de barras y texto. |
| `crear_revision_manual.py` | Operario con chaleco, casco y lector de mano. También la cinta de retorno, el colector común y el túnel de expedición. |
| `crear_descarga_amr.py` | Muelle a nivel, camión con puertas, carga apilada por altura real, cinta de acumulación (S_CARGA, S_ACU) y el **AMR**: base, lidar, mástil, carro elevable, dos brazos de dos eslabones y cabezales de 4 ventosas. |
| `crear_entorno.py` | Terreno, marco y burletes del muelle, zona AMR, senda peatonal, rack y carteles. Las paredes están apagadas (`PAREDES = False`). |
| `animar_ciclos.py` · `animar_descarga_amr.py` | 384 cuadros: llegada del camión, una recogida completa del AMR, un ciclo OK y un ciclo No Read. |

- **Renders:** `blender/renders/` tiene 8 imágenes EEVEE: lectura, salida OK, desvío, carril, agarre del AMR, depósito, revisión manual y planta completa.
- **Exportación a la web:** el modelo se exporta como `web/assets/tracepack_estacion.glb`, que es el que usa la web.

---

## 5. Simulación interactiva (web)

Se abre con **`INICIAR.bat` → opción 1**. Funciona sin internet y sin Python: lo sirve un script de PowerShell, solo en `localhost`.

### 5.1 Qué se ve

- **Vista 3D en vivo.** El modelo de Blender se mueve con la misma lógica de control. Se ven:
  - las cintas, con nervaduras que avanzan solo cuando su motor está en marcha;
  - los haces de los sensores: rojo cuando están libres, verde cuando detectan;
  - los conos de lectura: azul leyendo, verde con código, ámbar sin código;
  - el cilindro, la baliza, el robot y el operario.
- **Cámaras:** Planta, Descarga, Estación, Desviador, Revisión y Lectores.
- **Velocidad:** de ½× a 16×.
- **Etiquetas:** arrancan apagadas; se prenden con su casillero.

### 5.2 HMI (panel derecho)

- **Siempre visibles arriba:** los comandos **Iniciar, Detener, Reconocer y Rearmar** y la alarma activa. Los comandos son *solicitudes*: el PLC los rechaza, y explica por qué, si no se cumplen las condiciones (sección 15.1.5).
- **Pestaña Proceso:**
  - estado del ciclo, resultado, código, ID, registro y desviador;
  - estado del contenedor de revisión;
  - indicadores: procesados, OK, No Read, alarmas, lectura exitosa, tiempo de ciclo, leídos a mano, expedidos y bultos en planta.
- **Pestaña Descarga:**
  - camión, carga restante, paso del AMR, acumulación y vacío;
  - el **modo de descarga**: AMR (H3) u operario manual asistido (H2);
  - la tabla comparativa de camiones descargados, junto a la referencia de FlexSim.
- **Pestaña Señales:** cada lector y todas las entradas y salidas de campo.

### 5.3 Escenarios y casos atípicos (botón ⚙ Escenarios)

Es un panel con un interruptor por caso:
- **Interruptor prendido:** el caso puede ocurrir al azar en cada oportunidad.
- **"Provocar":** fuerza el caso en la próxima oportunidad, aunque el interruptor esté apagado.

Cada caso pasa por las alarmas y el rearme reales de la secuencia.

| Caso | Qué pasa | Cómo responde el sistema |
|---|---|---|
| **AMR acelerado → sobrecarga** (permanente) | El robot entrega 4 veces más rápido y S_ACU no frena las recogidas. | Con más de 3 bultos, el PLC da alarma de sobrecarga y detiene el robot (que conserva la sujeción). La estación sigue vaciando la acumulación. No deja rearmar hasta que vuelva a haber 3 o menos. |
| **Bulto cruzado** (35 %) | El bulto gira y se traba en la transferencia del alimentador a la cinta de inspección. | Vence el tiempo de S_ZONA y pasa a E5. El operario lo endereza y, con el rearme, **retoma el ciclo con el mismo ID**. |
| **Bulto trabado en el carril** (50 % de los No Read) | Queda atascado en los rodillos. | Falta S_PASO y salta la alarma de desvío. Al destrabarlo, sigue al contenedor y el ciclo se cierra documentado. |
| **Etiquetas dañadas** (permanente) | La lectura exitosa cae al 60 %. | Hay más No Read y el contenedor se llena antes. |
| **ERP sin respuesta** (30 % de los OK) | No llega la confirmación del registro. | E5 con el bulto retenido. Se consulta por ID, el registro ya existía y no se duplica: pasa de E5 a E4. |
| **Falta de aire comprimido** (40 % de los No Read) | El cilindro no llega a extender. | Falta S_EXT y salta la alarma de desvío. El bulto va a revisión manual. |
| **Lectura inválida** (20 %) | Se pierde la comunicación con un lector o dos lectores leen códigos distintos. | Va a E5: **no se trata como No Read**. |
| **Obstáculos para el AMR** (30 % de las recogidas) | Aparece un cono en el camino del robot. | El lidar lo detecta y hay detención coordinada con el bulto sujeto. Se retira el obstáculo y se rearma. |
| **Agarre inestable** (35 % de las recogidas) | El vacío no se verifica. | El robot reintenta antes de levantar. No es una alarma. |

En el mismo panel están el interruptor del **operario de revisión**, la habilitación del AMR y el porcentaje de **lectura OK**.

### 5.4 Demo guiada (botón ▶ Demo guiada)

Recorre sola los **16 pasos** del sistema en unos 2 minutos, moviendo la cámara y con un cartel explicativo en cada uno:
1. Llegada del camión y descarga del AMR: visión 3D, agarre con vacío y depósito.
2. Un bulto por ciclo, lectura multidireccional, registro y salida.
3. No Read con desvío y revisión manual (llama al operario).
4. Falla de registro con reconocer, resolver y rearmar.
5. Obstrucción del AMR.
6. Expedición.

Mientras corre, apaga los casos atípicos; al terminar deja todo como estaba.

### 5.5 Resto de la página

- **Histórico del proceso:** sigue el formato de la sección 15.3.1 (fecha y hora, ID, origen, evento, calidad del dato). Tiene un botón **Exportar CSV**.
- **GRAFCET E0–E5** y **secuencia del AMR:** la etapa activa se resalta en vivo.
- **Resultados de FlexSim:** H2 y H3, con tablas, barras y conclusiones.
- **Arquitectura funcional** (sección 15.4).
- **Programa del PLC** con la tabla de E/S.
- **Galería de renders.**

---

## 6. Programa del PLC (`plc/`)

- **`TracePack_PLC.scl`:** fuente SCL (IEC 61131-3) para el **S7-1200 CPU 1214C**. Se importa en TIA Portal desde "Fuentes externas" → "Generar bloques desde la fuente".
  - **`FB_Estacion`:** la secuencia E0–E5 con sus subfases. Incluye temporizadores de supervisión, interbloqueos del desvío, comandos de la HMI por flanco, rearme deliberado con destino válido (E4 o E0) y la baliza.
  - **`FB_AutorizacionAMR`:** autoriza la recogida (camión en posición, automático, sin alarma, capacidad) y el depósito (punto de carga libre). Decide la detención coordinada ante una obstrucción.
- **`Tabla_IO.csv`:** asignación preliminar de entradas y salidas: 14 entradas (el encoder en el contador rápido HSC1), 10 salidas, los lectores por PROFINET y los DB de intercambio con el ERP y la HMI.

Es la misma lógica que corre en la web. **No se compiló en TIA Portal ni se probó en un PLC real.** Las direcciones y los tiempos son una propuesta a validar en el diseño de detalle (sección 10.3).

---

## 7. Supuestos y límites

- **Valores ilustrativos.** Todos los tiempos, porcentajes y probabilidades son supuestos, no mediciones (secciones 15.5 y 21). Hay que validarlos con equipos reales.

  | Elemento | Valores supuestos |
  |---|---|
  | Estación | Transporte 4–5 s, lectura 1,5 s, registro 1,2 s, desvío 2,5 s, lectura OK 92 % |
  | AMR | Agarre 6 s, depósito 3 s, 0,9 m/s |
  | Revisión manual | Lectura manual 20 s por bulto |
  | Camiones | 36 bultos cada 20 min |
- **Dos modelos distintos.** La web y FlexSim usan los mismos parámetros base, pero son modelos distintos. FlexSim da las **estadísticas** (muchas horas, varias semillas). La web muestra el **comportamiento** ciclo a ciclo, con fallas y operación manual.
- **Solo en la web.** Los casos atípicos y la revisión manual con operario intermitente están solo en la web: no se agregaron a FlexSim ni al programa del PLC.
- **Simplificaciones de la web:**
  - la física es cinemática (no hay dinámica de cajas);
  - las probabilidades de los casos atípicos son fijas;
  - el robot y el operario siguen trayectorias planificadas, no una navegación real.
- **Modelo 3D:**
  - las paredes del depósito están desactivadas para ver mejor el funcionamiento;
  - el operario aparece quieto en la animación de Blender (donde se lo ve trabajar es en la web).

---

## 8. Mapa de archivos

```
Simulación Tecnologías/
├── INICIAR.bat                  menú: web, Blender, FlexSim H3/H2, actualizar resultados
├── DOCUMENTACION.md             este documento
├── README.md                    resumen y cómo abrirlo
├── TPI2026_G01_H3.md            entregable del TPI (no se modifica)
├── flexsim/
│   ├── TracePack_H3_Camion_AMR.fsm      modelo principal (camión + AMR + revisión manual)
│   ├── TracePack_Estacion.fsm           modelo H2 de referencia (carga manual)
│   ├── resultados_experimentos_h3/      summary_h3.csv
│   ├── resultados_experimentos/         summary.csv, historico_base_seed101.csv
│   ├── captura_flexsim*.png
│   └── exportar_resultados_web.py       CSV → web/data/flexsim_resultados.js (+ archivos del PLC)
├── blender/
│   ├── TracePack_Estacion.blend
│   ├── crear_*.py · animar_*.py         scripts que generan y animan la escena
│   └── renders/                         8 imágenes
├── web/
│   ├── index.html · css/ · js/          simulación interactiva (app.js: lógica y 3D; resultados.js: resultados y PLC)
│   ├── assets/                          modelo 3D (.glb), renders y capturas
│   ├── data/                            resultados de FlexSim, programa del PLC y tabla de E/S
│   ├── vendor/three/                    three.js r160 incluido (funciona sin internet)
│   ├── servidor.ps1 · iniciar_web.bat   servidor local
└── plc/
    ├── TracePack_PLC.scl                FB_Estacion + FB_AutorizacionAMR
    └── Tabla_IO.csv                     entradas y salidas del CPU 1214C
```
