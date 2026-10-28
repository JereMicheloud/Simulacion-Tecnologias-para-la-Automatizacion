# TracePack PLC: simulación (TPI 2026 · Grupo 1 · H3)

Simulación del sistema TracePack sobre el tramo de una sola cinta:
1. **Descarga:** llega un camión y un **AMR de dos brazos** lo descarga.
2. **Identificación:** una **estación con 6 lectores** identifica cada bulto.
3. **Registro o desvío:** el bulto se registra en el ERP o, si es No Read, se desvía a **revisión manual**.
4. **Expedición:** todo termina en expedición.

📄 La documentación completa (qué se simuló, cómo funciona, resultados y límites) está en **[DOCUMENTACION.md](DOCUMENTACION.md)**.
El entregable del TPI es `TPI2026_G01_H3.md`.

## Cómo abrirlo

Doble clic en **`INICIAR.bat`** (o en el acceso `TracePack - Simulacion TPI.bat` del escritorio):

| Opción | Qué hace |
|---|---|
| 1 | **Simulación web** en el navegador (recomendada). Dejá abierta la ventana del servidor mientras la usás. |
| 2 | Modelo 3D en Blender. |
| 3 / 4 | Modelo de FlexSim H3 (camión + AMR) o H2 (carga manual). |
| 5 | Vuelve a pasar a la web los resultados de FlexSim (necesita Python). |

La web no necesita Python, internet ni instalar nada.
- **▶ Demo guiada:** recorre todo el sistema solo, en unos 2 minutos.
- **⚙ Escenarios:** prende y apaga los casos atípicos y el operario de revisión.

## Qué hay en cada carpeta

| Carpeta | Herramienta | Contenido |
|---|---|---|
| `flexsim/` | FlexSim 2026 | Lógica de flujo y experimentos (modelos H3 y H2, resultados en CSV) |
| `blender/` | Blender 5.2 | Modelo 3D, scripts que lo generan, animación y renders |
| `web/` | three.js | Simulación interactiva: 3D, HMI, casos atípicos, GRAFCET, resultados y PLC |
| `plc/` | TIA Portal (SCL) | Programa del S7-1200 y tabla de entradas y salidas |

FlexSim y Blender se manejaron por sus servidores MCP. El `.mcp.json` de esta carpeta apunta al servidor de FlexSim (`...\Simulación\TP Simulación\MCP_Flexsim`).

Los tiempos y porcentajes son supuestos ilustrativos a validar (secciones 15.5 y 21 del TPI).
