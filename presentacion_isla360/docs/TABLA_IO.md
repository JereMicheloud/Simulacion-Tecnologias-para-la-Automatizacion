# Tabla de E/S propuesta · Isla de inspección 360° (IMPORTACIÓN)

> **Propuesta a validar, no compilada en TIA.** Direcciones orientativas para un S7-1200,
> adaptadas de `simulacion-referencia` (`plc/Tabla_IO.csv` y `web/data/Tabla_IO.csv`).
> La isla reemplaza la cinta de inspección transparente por un **plato de vidrio giratorio**
> con **3 cámaras** (C1 superior, C2 inferior a través del vidrio, C3 lateral), cada una
> con su luz de destello y su trigger.

## Entradas digitales (%I)

| Tag | Dirección propuesta | Origen | Descripción |
| --- | --- | --- | --- |
| ENC_A | %I0.0 | Encoder del plato (canal A) | Contador rápido HSC1: velocidad y detención del giro 360° |
| ENC_B | %I0.1 | Encoder del plato (canal B) | Contador rápido HSC1: sentido de giro |
| S_ING | %I0.2 | Fotoeléctrico 24 V DC | Ingreso de bulto a la isla: crea el ID del ciclo |
| S_ZONA | %I0.3 | Fotoeléctrico difuso 24 V DC | Bulto presente en el plato (lo confirma también el encoder) |
| S_EXT | %I0.4 | Fin de carrera del cilindro ADN-S | Desviador extendido |
| S_RET | %I0.5 | Fin de carrera del cilindro ADN-S | Desviador en reposo (condición de rearme) |
| S_PASO | %I0.6 | Fotoeléctrico 24 V DC | Paso del bulto por la rampa de desvío |
| S_EXC | %I0.7 | Fotoeléctrico 24 V DC | Zona de desvío / revisión manual ocupada |
| S_CAMION | %I1.0 | Sensor del muelle | Camión en posición de descarga |
| S_CARGA | %I1.1 | Fotoeléctrico 24 V DC | Punto de carga de la acumulación ocupado |
| S_ACU | %I1.2 | Fotoeléctrico 24 V DC | Acumulación completa (tercera posición) |
| C1_OK | %I1.3 | Cámara superior C1 (salida digital) | Lectura válida de la cara superior (alternativa: trigger por PROFINET) |
| C2_OK | %I1.4 | Cámara inferior C2 (salida digital) | Lectura válida de la cara inferior (alternativa: trigger por PROFINET) |
| C3_OK | %I1.5 | Cámara lateral C3 (salida digital) | Lectura válida de la cara lateral (alternativa: trigger por PROFINET) |
| PRESOSTATO | %I1.6 | Presostato de línea neumática | Presión de aire disponible para el desviador |
| PARADA_EMERG | %I1.7 | Pulsador de emergencia (contacto NC) | Cadena de seguridad: corta todos los accionamientos |

Nota: si las cámaras solo disparan por red, C1_OK/C2_OK/C3_OK se reemplazan por los
triggers C1_TRIG/C2_TRIG/C3_TRIG enviados por PROFINET y el resultado consolidado
llega por el bloque de cámaras (ver Red).

## Salidas digitales (%Q)

| Tag | Dirección propuesta | Destino | Descripción |
| --- | --- | --- | --- |
| M_ALIM | %Q0.0 | Variador del alimentador | Marcha de la cinta de alimentación (bajada del camión) |
| M_ISLA | %Q0.1 | Variador / motor del plato | Giro 360° del plato de vidrio (3,2 s por bulto) |
| M_DESVIO | %Q0.2 | Variador de la cinta de desvío | Marcha de la cinta de desvío y vuelta |
| Y_VUVG | %Q0.3 | Electroválvula Festo VUVG 5/2 24 V DC | Extensión del cilindro desviador (sin señal: retorno) |
| PC_TRIG | %Q0.4 | Entrada de disparo de C1–C3 / PC | Inicio de la adquisición (también por PROFINET) |
| BALIZA_VERDE | %Q0.5 | Torre de señalización | Automático sin alarmas |
| BALIZA_AMBAR | %Q0.6 | Torre de señalización | Revisión en curso o sistema detenido |
| BALIZA_ROJA | %Q0.7 | Torre de señalización | Alarma activa (intermitente) |
| BALIZA_CELESTE | %Q1.3 | Torre de señalización | Disparo de cámara en curso |
| LUZ_C1 | %Q1.0 | Destello de la cámara superior | Luz propia de C1 (destello 60–100 µs) |
| LUZ_C2 | %Q1.1 | Destello de la cámara inferior | Luz propia de C2 (destello 60–100 µs) |
| LUZ_C3 | %Q1.2 | Destello de la cámara lateral | Luz propia de C3 (destello 60–100 µs) |

## Red PROFINET

- **PLC ↔ cámaras C1–C3 / PC de visión:** disparo, código leído, resultado por cara y
  diagnóstico (consolidados en AdqFin / AdqCodigoValido / AdqSinCodigo / AdqError).
- **PLC ↔ variadores:** marcha y estado de M_ALIM / M_ISLA / M_DESVIO.

## DB de intercambio con el ERP (por ID de ciclo)

- **DB10 (ERP_INTERCAMBIO):** solicitud de registro por ID de ciclo, confirmación,
  rechazo y disponibilidad. El bulto OK queda retenido en la isla hasta la confirmación
  del ERP **para ese mismo ID**; sin confirmación (o con rechazo / timeout) no sale a pallet.
- **DB20 (HMI_COMANDOS):** iniciar, detener, reconocer y rearmar (solicitudes que el PLC acepta o rechaza).

Referencia original: `simulacion-referencia/plc/Tabla_IO.csv` (entradas S_ING/S_ZONA/S_EXT/
S_RET/S_PASO/S_EXC/S_CAMION/S_CARGA/S_ACU, salidas M_ALIM/M_INSP/M_ACU/Y_VUVG/TRIG_LECT/
balizas, bloques PROFINET de lectores, DB10 ERP y DB20 HMI). Aquí M_INSP pasa a ser
M_ISLA (plato), M_ACU pasa a ser M_DESVIO, TRIG_LECT pasa a ser PC_TRIG y se agregan
C1_OK/C2_OK/C3_OK (o triggers) y LUCES C1–C3.
