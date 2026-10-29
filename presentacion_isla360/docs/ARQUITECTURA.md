# Arquitectura · Isla de inspección 360° en IMPORTACIÓN (TracePack, 1 página)

## Flujo de bultos

**Camión → descarga → acumulación (3 posiciones) → alimentador → isla 360°
(plato de vidrio + 3 cámaras) → OK: registro en ERP → pallet → expedición / NO OK: desviador →
rampa de rodillos → cinta de desvío → revisión manual → cinta de vuelta → de nuevo a la isla.**

El bulto se baja del camión, espera su turno en la acumulación y entra a la isla por un túnel
con cortina de tiras. El plato lo hace girar 360° en 3,2 s; C1 (superior, anillo de LED),
C2 (inferior, a través del vidrio, anillo difuso) y C3 (lateral, dos barras de LED) sacan su
foto con su propia luz de destello. La etiqueta puede estar en cualquier cara: la cámara que
la encuentra la lee y las otras confirman que no hay otra. La PC compara la etiqueta con el
diseño y con los datos del envío en el ERP. Solo el bulto OK sigue a pallet y expedición; el
NO OK se desvía a revisión y, una vez revisado (etiqueta reimpresa o relectura), vuelve a la isla.

## Equipo de la isla

- Celda de perfiles de aluminio 45 × 45 con paneles de policarbonato ahumado: luz constante adentro.
- Plato de vidrio templado Ø 0,72 m sobre un rodamiento de giro; motorreductor al costado con
  correa, así el centro queda libre para C2. Encoder en el rodamiento.
- Gabinete inferior de acero inoxidable con C2 adentro (frente de policarbonato para verla).
- Fotocélula en la boca de entrada (S_ING), baliza de torre (verde, ámbar, roja y celeste),
  PC industrial colgada del costado y pantalla del control junto a la celda.

## Secuencia E0–E5 + timeouts

- **E0 · Esperando bulto:** camión en posición, isla libre, desviador en reposo (S_RET).
  S_ING crea el ID del ciclo.
- **E1 · Plato e identificación:** el bulto entra al plato, gira 360° y disparan las 3 cámaras.
  Timeout: si el giro no termina o no hay fotos, a E5.
- **E2 · Registrando:** lectura consolidada OK → se guarda el código con el ID, el bulto
  queda retenido en la isla y se espera la confirmación del ERP **para ese mismo ID**.
  Timeout de registro: sin confirmación, a E5 (rechazo/timeout documentado).
- **E3 · Desvío a revisión:** No Read o NO OK → el cilindro saca el bulto, baja por la rampa
  (S_PASO) a la cinta de desvío y espera al operario; el revisado vuelve por la cinta de
  vuelta y reingresa a la isla (nuevo ciclo con trazabilidad al ID anterior).
- **E4 · Pallet y expedición:** con el registro confirmado, el bulto OK sale, se arma el
  pallet y suma a expedición. Se confirma isla libre y se cierra el ciclo.
- **E5 · Falla / intervención:** se frenan ingresos y avance, se guarda el contexto
  (ID, etapa, señales). Salida solo con causa corregida, señales coherentes, alarma
  reconocida y rearme con registro confirmado.

## Criterio OK / NO OK / Falla

- **OK:** la etiqueta coincide con el diseño y con el ERP, el código escanea y el ERP
  confirma el registro para ese ID → pallet/expedición.
- **NO OK (desvío a E3):** defecto de impresión (tinta, línea blanca en la barra de control),
  dato distinto (por ejemplo, el código postal) o lectura sin código (No Read) → cinta de desvío
  y revisión manual (tick verde = defecto real, se reimprime; cruz roja = lectura incorrecta, se repite).
- **Falla (E5):** error de comunicación, dato inválido, contradicción entre cámaras,
  giro sin detención, registro rechazado o timeout → intervención, reconocimiento y rearme.

## Supuestos y límites

- Tiempo de ciclo de la isla: una vuelta de 3,2 s (~18 bultos por minuto). Supuesto a validar.
- Velocidad de cinta, posición de la isla y ángulos de cámara: supuestos de la simulación.
- Las etiquetas son una maqueta estilo Correo Argentino generada por
  `herramientas/generar_etiquetas.py`: remitente, destinatario y número de envío son inventados.
- Tabla de E/S y DB por ID de ciclo: propuesta a validar, no compilada en TIA.
