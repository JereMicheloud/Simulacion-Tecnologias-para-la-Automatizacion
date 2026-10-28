"""Convierte los resultados de FlexSim (resultados_experimentos/) en web/data/flexsim_resultados.js.

Uso:  python exportar_resultados_web.py
Se genera un .js (no .json) para que la web lo cargue con un <script> comun.
"""
import csv
import json
from pathlib import Path
from statistics import mean, stdev

AQUI = Path(__file__).parent
RES = AQUI / "resultados_experimentos"
SALIDA = AQUI.parent / "web" / "data" / "flexsim_resultados.js"

PARAMETROS = {  # valores base cargados en Model.parameters del .fsm
    "IAT_Llegada": (25, "s", "Tiempo medio entre llegadas de bultos (exponencial)"),
    "T_Carga": (5, "s", "Carga manual al alimentador"),
    "T_Transporte": (4, "s", "Traslado a S_ZONA y detección de parada por encoder"),
    "T_Lectura": (1.5, "s", "Adquisición de los 6 lectores R1–R6"),
    "T_Registro": (1.2, "s", "Confirmación de registro ERP por ID de ciclo"),
    "T_Evacuacion": (3, "s", "Evacuación por la línea principal"),
    "T_Desvio": (2.5, "s", "Desvío: S_EXT + S_PASO + S_RET"),
    "Pct_LecturaOK": (92, "%", "Tasa de lectura exitosa"),
    "Pct_FallaRegistro": (2, "%", "Bultos OK con alarma de registro (E5)"),
    "T_Intervencion": (30, "s", "Intervención del operador: reconocer y rearmar"),
}
ESCENARIOS = {
    "Base": {"IAT_Llegada": 25, "Pct_LecturaOK": 92},
    "Lectura_degradada": {"IAT_Llegada": 25, "Pct_LecturaOK": 80},
    "Alta_demanda": {"IAT_Llegada": 14, "Pct_LecturaOK": 92},
    "Pico_saturacion": {"IAT_Llegada": 10, "Pct_LecturaOK": 92},
}


def resumir(filas):
    horas = float(filas[0]["time"]) / 3600
    m = {
        "llegadas": [float(f["Camion_Ingreso_output_value"]) for f in filas],
        "ok": [float(f["Salida_Principal_input_value"]) for f in filas],
        "no_read": [float(f["Revision_Manual_input_value"]) for f in filas],
        "utilizacion": [100 * float(f["Estacion_Inspeccion_content_average"]) for f in filas],
        "cola_max": [float(f["Zona_Carga_content_maximum"]) for f in filas],
        "espera_cola_s": [float(f["Zona_Carga_staytime_average"]) for f in filas],
        "t_estacion_s": [float(f["Estacion_Inspeccion_staytime_average"]) for f in filas],
    }
    m["procesados_h"] = [(o + n) / horas for o, n in zip(m["ok"], m["no_read"])]
    m["pct_ok"] = [100 * o / (o + n) for o, n in zip(m["ok"], m["no_read"])]
    return {k: {"media": round(mean(v), 3), "desvio": round(stdev(v), 3) if len(v) > 1 else 0} for k, v in m.items()} | {
        "replicas": len(filas), "horas": horas, "semillas": [int(f["seed"]) for f in filas]}


with open(RES / "summary.csv", encoding="utf-8") as fh:
    filas = [f for f in csv.DictReader(fh) if f["ok"] in ("1", "True", "true")]
escenarios = []
for nombre, params in ESCENARIOS.items():
    sel = [f for f in filas if f["scenario"] == nombre]
    assert sel, f"sin replicas para {nombre}"
    escenarios.append({"nombre": nombre, "parametros": params, **resumir(sel)})

with open(RES / "historico_base_seed101.csv", encoding="utf-8") as fh:
    historico = [[int(r["id_ciclo"]), float(r["t_ingreso_estacion_s"]), int(r["resultado"]), float(r["t_ciclo_s"])]
                 for r in csv.DictReader(fh)]

# ---- H3: camion + AMR (flexsim/TracePack_H3_Camion_AMR.fsm, resultados_experimentos_h3/summary_h3.csv) ----
PARAMETROS_H3 = {
    "IAT_Camion": (1200, "s", "Intervalo entre camiones"),
    "N_Bultos_Camion": (36, "bultos", "Bultos por camión (3 filas × 4 columnas × 3 niveles)"),
    "T_Agarre": (6, "s", "AMR: visión 3D, aproximación de los dos brazos, vacío y verificación, retiro"),
    "T_Deposito": (3, "s", "AMR: apoyo en el punto de carga y liberación de las ventosas"),
    "T_LecturaManual": (20, "s", "Operario: toma el No Read, lo lee con lector de mano y lo apoya en la cinta de retorno"),
}
ESC_H3 = {"AMR_base": "AMR · camión cada 20 min", "Camiones_seguidos": "AMR · camión cada 7 min",
          "AMR_lento": "AMR lento (agarre 10 s) · cada 7 min", "Manual_asistida": "Referencia: descarga manual asistida · cada 7 min"}
h3 = []
with open(AQUI / "resultados_experimentos_h3" / "summary_h3.csv", encoding="utf-8") as fh:
    filas_h3 = list(csv.DictReader(fh))
for nombre, etiqueta in ESC_H3.items():
    sel = [f for f in filas_h3 if f["escenario"] == nombre]
    assert sel, f"sin replicas H3 para {nombre}"
    horas = float(sel[0]["t"]) / 3600
    met = {
        "descarga_min": [float(f["descarga_media_s"]) / 60 for f in sel],
        "descarga_max_min": [float(f["descarga_max_s"]) / 60 for f in sel],
        "entregas_h": [float(f["entregas_amr"]) / horas for f in sel],
        "procesados_h": [(float(f["ok"]) + float(f["no_read"])) / horas for f in sel],
        "utilizacion": [100 * float(f["util_estacion"]) for f in sel],
        "acu_media": [float(f["acu_media"]) for f in sel],
        "espera_camion_min": [float(f["espera_en_camion_s"]) / 60 for f in sel],
        "camiones": [float(f["camiones_descargados"]) for f in sel],
        "expedidos_h": [float(f["expedidos"]) / horas for f in sel],
        "util_operario": [100 * float(f["util_lectura_manual"]) for f in sel],
    }
    h3.append({"nombre": nombre, "etiqueta": etiqueta, "parametros": {k: float(sel[0][k]) for k in ("IAT_Camion", "T_Agarre", "T_Deposito")},
               "replicas": len(sel), **{k: {"media": round(mean(v), 3), "desvio": round(stdev(v), 3)} for k, v in met.items()}})

data = {
    "modelo": "flexsim/TracePack_Estacion.fsm",
    "parametros": [{"nombre": k, "valor": v[0], "unidad": v[1], "descripcion": v[2]} for k, v in PARAMETROS.items()],
    "escenarios": escenarios,
    "historico_base": {"semilla": 101, "duracion_s": 3600, "columnas": ["id", "t_ingreso", "resultado", "t_ciclo"], "filas": historico},
    "h3": {"modelo": "flexsim/TracePack_H3_Camion_AMR.fsm",
           "parametros": [{"nombre": k, "valor": v[0], "unidad": v[1], "descripcion": v[2]} for k, v in PARAMETROS_H3.items()],
           "escenarios": h3},
}
SALIDA.parent.mkdir(parents=True, exist_ok=True)
SALIDA.write_text("window.FLEXSIM = " + json.dumps(data, ensure_ascii=False) + ";\n", encoding="utf-8")
# la web muestra tambien el programa del PLC y la tabla de E/S
import shutil
for nombre in ("TracePack_PLC.scl", "Tabla_IO.csv"):
    shutil.copy(AQUI.parent / "plc" / nombre, SALIDA.parent / nombre)
print(f"OK -> {SALIDA} ({len(escenarios)} escenarios, {len(historico)} ciclos)")
for e in escenarios:
    print(f"  {e['nombre']:<18} procesados/h={e['procesados_h']['media']:.1f}  %OK={e['pct_ok']['media']:.1f}  util={e['utilizacion']['media']:.1f}%  colaMax={e['cola_max']['media']:.1f}")
