# Presentación FACULTAD · TracePack · Isla de inspección 360° (IMPORTACIÓN)

Recorrido de unos 9 minutos sobre la línea de importación de TracePack, en 3D, para el TPI 2026
(Tecnologías para la Automatización, UTN FRSFco, Grupo 1).

**Es una línea de IMPORTACIÓN:** el **AMR** baja los bultos del camión, pasan por la acumulación y el
alimentador y entran a la **isla 360°**, que **solo lee el código de barras**, como dice el TPI: resultado
**OK** (se registra en el ERP con el ID del ciclo) o **No Read** (se desvía a revisión manual). Los pallets
completos los lleva un autoelevador al rack del almacén.

## La isla 360°

- Celda de **perfiles de aluminio con policarbonato ahumado** (luz constante adentro), túnel de entrada y
  salida con cortina de tiras y franja de seguridad amarilla en el piso.
- **Plato de vidrio** Ø 0,72 m sobre un rodamiento de giro, con el motor al costado: el centro queda libre
  para mirar desde abajo. Una vuelta (3,2 s) por bulto.
- **3 cámaras, cada una con su luz:** C1 superior con anillo de LED, C2 inferior **a través del vidrio** con
  anillo difuso, C3 lateral entre dos barras de LED (con el giro ve los 4 costados). Al disparar se ve el cono
  de luz de cada una.
- La etiqueta viene en **una sola cara al azar** (arriba, abajo o costado): el rótulo sobre el bulto y la
  pantalla del control muestran qué cámara la encontró.
- **No Read:** el operario de la cinta de desvío lo lee con el lector de mano (o le pega una etiqueta nueva)
  y el bulto sigue por la cinta de retorno a expedición, ya registrado.

## La planta

- **Descarga con el AMR** de dos brazos del hito H3: el camión llega al muelle, abre las puertas y el PLC
  autoriza cada recogida solo con lugar en la acumulación (menos de 3 bultos). Así la línea nunca se llena.
- **Almacén:** rack selectivo de 7 bahías × 3 niveles y un autoelevador que guarda cada pallet completo.
- **Nave:** columnas, cabriadas y luminarias, pared con muelles y portones (con un segundo camión en el patio),
  senda peatonal, zona de autoelevadores, carteles de seguridad, matafuegos y barandas.
- Baliza de torre (verde libre, ámbar girando, roja con falla, celeste en cada disparo) y tira de LED en el techo.

## Cómo abrirla

Doble clic en **`INICIAR.bat`**. Abre el navegador en `http://localhost:8201`. Dejá abierta la ventana negra
mientras presentás; cerrala para terminar. No necesita internet, Python ni instalar nada (usa PowerShell).
**No abre con doble clic en `index.html`**: el navegador bloquea el modelo 3D si la página se abre como archivo.

## Cómo se usa

- Flechas izquierda y derecha, o los puntos de abajo: pasar de paso. Espacio: pausar o seguir. `F`: pantalla completa.
- **Explorar**: pausa el recorrido y deja mover la cámara con el mouse. La rueda acerca **hacia donde apunta el
  mouse** (también pellizco en el touchpad); clic derecho arrastra. Tocá un equipo para ver su ficha.
- **La secuencia E0–E5** se muestra en pantalla completa: el diagrama hace zoom a cada etapa y la explica.
- **Cierre:** recorrido en primera persona por toda la planta, apenas desenfocado, con el agradecimiento y «¿Preguntas?».
- Menú **Simulación** (abajo a la izquierda): vistas de cámara (incluidas C1, C2 y C3 de cerca), velocidad,
  **HMI** estilo TracePack, **GRAFCET E0–E5** en vivo, **histórico** exportable a CSV y **escenarios** para
  provocar casos atípicos (ERP caído, falta de aire, plato descentrado, No Read…).

## Las pantallas

- **Pantalla del control** (junto a la isla): por bulto, las 3 vistas C1/C2/C3 (resaltada la que tiene la
  etiqueta), los pasos de la lectura, un **pantallazo verde (OK + código) o rojo (No Read)** y la ficha: código,
  cámara, tiempo, certeza y acción del PLC (E2 registro / E3 desvío).
- **Pantalla de la cinta de desvío**: lo mismo, más dos botones: **leído con el lector de mano** o **etiqueta nueva**.
  En los dos casos el bulto queda registrado y sigue a expedición.

## Qué es real y qué es ilustrativo

- **Las etiquetas son una maqueta estilo Correo Argentino, sin datos reales**: remitente, destinatario y número de
  envío son inventados. Las genera `herramientas/generar_etiquetas.py` (fotos, etiqueta enderezada, textura 3D y
  `assets/casos.json`); el código de barras es un Code 128 real que el script verifica leyéndolo con zxing-cpp:

  ```
  pip install pillow opencv-python numpy zxing-cpp
  python presentacion_isla360/herramientas/generar_etiquetas.py
  ``` Casos: etiqueta OK y dos No Read reales
  (el script verifica que zxing no los lea): un pliegue de cinta de embalar sobre el código y un código rayado y manchado.
- Tiempos, velocidad de cinta y ritmo son supuestos de la simulación, como en el TPI (secciones 15.5 y 21).
- La tabla de E/S (`docs/TABLA_IO.md`) y la arquitectura (`docs/ARQUITECTURA.md`) son una **propuesta a validar, no compilada en TIA**.

## Créditos

Modelo 3D de la planta (cintas, operario, desviador, sensores, camión), visor con Three.js y criterio de trabajo:
**TracePack PLC**, TPI 2026, Tecnologías para la Automatización, UTN FRSFco. Grupo 1: Díaz Aimar, Mecchia, Micheloud,
Sereno. Prof. Oberto. Se agregaron la isla 360° con sus 3 cámaras y luces, la cinta de desvío con su pantalla, la cinta
de vuelta, el pallet y la zona de expedición, y la paleta blanco/gris/celeste con detalles amarillos.
Three.js (`vendor/three`) es MIT, © 2010-2023 los autores de Three.js.
