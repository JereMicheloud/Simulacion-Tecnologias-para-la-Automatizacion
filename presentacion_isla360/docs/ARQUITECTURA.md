# Arquitectura · Isla de inspección 360° en IMPORTACIÓN (TracePack, 1 página)

## Flujo de bultos

**Camión → AMR → acumulación (3 posiciones) → alimentador → isla 360° (plato de vidrio + 3 cámaras)
→ OK: registro en ERP → pallet → autoelevador → rack / No Read: desviador → rampa de rodillos →
cinta de desvío → revisión manual (lector de mano o etiqueta nueva) → cinta de retorno → expedición.**

El AMR de dos brazos baja el bulto del camión solo cuando el PLC lo autoriza (camión en posición,
operación en automático, sin alarma y acumulación con lugar). El bulto espera su turno en la
acumulación y entra a la isla por un túnel con cortina de tiras. El plato lo hace girar 360° en 3,2 s; C1 (superior, anillo de LED),
C2 (inferior, a través del vidrio, anillo difuso) y C3 (lateral, dos barras de LED) sacan su
foto con su propia luz de destello. La etiqueta puede estar en cualquier cara: la PC busca y
decodifica el **código de barras** en las 3 fotos. Como en el TPI, la variable es el **resultado de
lectura: OK o No Read**. Con OK se registra; con No Read el bulto se desvía, el operario lo lee con
el lector de mano (o le pega una etiqueta nueva), queda registrado y sigue por la cinta de retorno
a expedición sin volver a pasar por la isla.

## Almacén

Cada 12 bultos se completa un pallet; un autoelevador lo lleva a un lugar libre del rack (7 bahías ×
3 niveles). Con el rack lleno, el pallet más antiguo sale a despacho.

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
  Código válido → E2; No Read → E3; comunicación, dato inválido o códigos contradictorios → E5.
- **E2 · Registrando:** lectura consolidada OK → se guarda el código con el ID, el bulto
  queda retenido en la isla y se espera la confirmación del ERP **para ese mismo ID**.
  Timeout de registro: sin confirmación, a E5 (rechazo/timeout documentado).
- **E3 · Desvío a revisión:** No Read → el cilindro saca el bulto (S_EXT → S_PASO → S_RET), baja
  por la rampa a la cinta de desvío y espera al operario, que lo lee con el lector de mano (o le
  pega una etiqueta nueva); ya registrado, vuelve por la cinta de retorno y sigue a expedición.
- **E4 · Pallet y expedición:** con el registro confirmado, el bulto OK sale, se arma el
  pallet y suma a expedición. Se confirma isla libre y se cierra el ciclo.
- **E5 · Falla / intervención:** se frenan ingresos y avance, se guarda el contexto
  (ID, etapa, señales). Salida solo con causa corregida, señales coherentes, alarma
  reconocida y rearme con registro confirmado.

## Criterio OK / No Read / Falla

- **OK:** alguna cámara obtiene un código válido y coherente; el ERP confirma el registro para
  ese ID → pallet, expedición y rack.
- **No Read (desvío a E3):** las 3 cámaras terminaron bien y ninguna obtuvo un código válido
  (etiqueta tapada, rayada o dañada) → cinta de desvío y revisión manual.
- **Falla (E5):** error de comunicación, dato inválido, contradicción entre cámaras,
  giro sin detención, registro rechazado o timeout → intervención, reconocimiento y rearme.

## Supuestos y límites

- Tiempo de ciclo de la isla: una vuelta de 3,2 s. El ritmo real lo marca el AMR. Supuestos a validar.
- Velocidad de cinta, posición de la isla y ángulos de cámara: supuestos de la simulación.
- Las etiquetas son una maqueta estilo Correo Argentino generada por
  `herramientas/generar_etiquetas.py`: remitente, destinatario y número de envío son inventados.
- Tabla de E/S y DB por ID de ciclo: propuesta a validar, no compilada en TIA.
