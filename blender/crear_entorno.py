"""Entorno del deposito (solo visual): paredes, columnas, marco del muelle, demarcaciones, rack y carteles.

Se corre despues de crear_escena_tracepack.py, crear_revision_manual.py y crear_descarga_amr.py, en el mismo namespace.
Todo queda fuera de los recorridos del camion, el AMR, las cintas y el operario (nada se atraviesa).
"""
import bpy
import math

C_ENT = collection("Entorno")
ME = {
    "pared": material("Pared_Panel", (0.8, 0.82, 0.84), rough=0.7),
    "zocalo": material("Zocalo_Hormigon", (0.55, 0.56, 0.57), rough=0.9),
    "ventana": material("Ventana", (0.75, 0.88, 1.0), rough=0.1, emit=(0.7, 0.85, 1.0), strength=0.8),
    "columna": material("Columna_Acero", (0.25, 0.35, 0.5), metallic=0.6, rough=0.4),
    "amarillo": material("Franja_Amarilla", (0.98, 0.78, 0.05), rough=0.5),
    "negro": material("Franja_Negra", (0.03, 0.03, 0.03), rough=0.6),
    "burlete": material("Burlete_Muelle", (0.05, 0.05, 0.06), rough=0.9),
    "porton": material("Porton_Enrollable", (0.6, 0.62, 0.66), metallic=0.7, rough=0.35),
    "naranja": material("Demarcacion_AMR", (1.0, 0.45, 0.05), rough=0.6),
    "verde": material("Senda_Peatonal", (0.15, 0.55, 0.3), rough=0.7),
    "blanco": material("Pintura_Blanca", (0.92, 0.92, 0.92), rough=0.6),
    "rack_azul": material("Rack_Montante", (0.12, 0.3, 0.6), metallic=0.4, rough=0.4),
    "rack_naranja": material("Rack_Larguero", (0.95, 0.42, 0.05), metallic=0.3, rough=0.4),
    "film": material("Film_Stretch", (0.75, 0.62, 0.45), rough=0.25),
    "texto": material("Texto_Cartel", (0.95, 0.95, 0.95), rough=0.5, emit=(1, 1, 1), strength=0.4),
}


def texto(nombre, cuerpo, loc, rot, tam, mat):
    bpy.ops.object.text_add(location=loc, rotation=rot)
    t = bpy.context.active_object
    t.name = nombre
    t.data.body = cuerpo
    t.data.size = tam
    t.data.align_x = "CENTER"
    t.data.extrude = 0.004
    t.data.materials.append(mat)
    return link(t, C_ENT)


PAREDES = False  # de momento sin paredes ni columnas: la planta queda abierta y se ve mejor el funcionamiento

if PAREDES:  # paredes norte y este; el lado sur queda abierto hacia la camara
    box("Pared_Norte", (20.4, 0.2, 6.0), (-2.2, 6.0, 3.0), ME["pared"], C_ENT)
    box("Pared_Norte_Zocalo", (20.4, 0.22, 1.2), (-2.2, 5.99, 0.6), ME["zocalo"], C_ENT)
    for i in range(8):
        box(f"Ventana_N_{i}", (1.8, 0.05, 0.9), (-10.6 + i * 2.6, 5.88, 4.6), ME["ventana"], C_ENT)
    box("Pared_Este", (0.2, 12.0, 6.0), (8.1, 0.0, 3.0), ME["pared"], C_ENT)
    box("Pared_Este_Zocalo", (0.22, 12.0, 1.2), (8.09, 0.0, 0.6), ME["zocalo"], C_ENT)
    for x in (-9.0, -4.0, 1.0, 6.0):
        box(f"Columna_{x:+.0f}", (0.3, 0.3, 6.0), (x, 5.7, 3.0), ME["columna"], C_ENT)
    box("Muelle_Pared_N", (0.25, 4.15, 6.0), (-12.52, 3.83, 3.0), ME["pared"], C_ENT)
    box("Muelle_Dintel", (0.25, 3.5, 2.6), (-12.52, 0.0, 4.7), ME["pared"], C_ENT)
    cyl("Porton_Rollo", 0.2, 3.3, (-12.25, 0.0, 3.6), ME["porton"], C_ENT, axis="Y")
    box("Porton_Caja", (0.12, 3.4, 0.45), (-12.07, 0.0, 3.6), ME["porton"], C_ENT)
    texto("Cartel_Muelle", "MUELLE 1", (-12.38, 0.0, 4.0), (math.pi / 2, 0, math.pi / 2), 0.35, ME["texto"])

# ---- muelle: marco con franjas de seguridad y burletes (abrigo del camion) ----
for s in (1, -1):
    for k in range(13):  # poste de seguridad con franjas amarillas y negras
        box(f"Muelle_Poste_{s:+d}_{k:02d}", (0.12, 0.12, 0.25), (-12.32, s * 1.7, 0.125 + k * 0.25),
            ME["amarillo"] if k % 2 == 0 else ME["negro"], C_ENT)
    box(f"Muelle_Burlete_{s:+d}", (0.3, 0.25, 3.1), (-12.55, s * 1.6, 1.55), ME["burlete"], C_ENT)
box("Muelle_Burlete_Sup", (0.3, 3.45, 0.3), (-12.55, 0.0, 3.25), ME["burlete"], C_ENT)
box("Muelle_Travesano", (0.12, 3.52, 0.12), (-12.32, 0.0, 3.31), ME["amarillo"], C_ENT)

# ---- terreno alrededor del deposito (a nivel del patio) ----
box("Terreno", (140, 120, 0.02), (-8.0, 0.0, -1.13), material("Terreno_Cesped", (0.3, 0.37, 0.27), rough=0.95), C_ENT)

# ---- demarcaciones de piso ----
def marco(nombre, x0, x1, y0, y1, ancho, mat):
    box(f"{nombre}_S", (x1 - x0, ancho, 0.004), ((x0 + x1) / 2, y0, 0.004), mat, C_ENT)
    box(f"{nombre}_N", (x1 - x0, ancho, 0.004), ((x0 + x1) / 2, y1, 0.004), mat, C_ENT)
    box(f"{nombre}_O", (ancho, y1 - y0, 0.004), (x0, (y0 + y1) / 2, 0.004), mat, C_ENT)
    box(f"{nombre}_E", (ancho, y1 - y0, 0.004), (x1, (y0 + y1) / 2, 0.004), mat, C_ENT)


marco("Zona_AMR", -12.25, -9.0, -1.65, 1.65, 0.1, ME["naranja"])
for i in range(6):  # rayado diagonal en la esquina de la zona del AMR
    box(f"Zona_AMR_Rayado_{i}", (0.6, 0.08, 0.004), (-9.4 - i * 0.3, 1.35, 0.004), ME["naranja"], C_ENT, rot=(0, 0, math.radians(45)))
texto("Piso_AMR", "ZONA AMR", (-10.6, -1.25, 0.006), (0, 0, 0), 0.28, ME["naranja"])
box("Senda_Peatonal", (17.0, 0.9, 0.004), (-3.0, -4.75, 0.003), ME["verde"], C_ENT)
for y in (-4.28, -5.22):
    box(f"Senda_Borde_{y:.2f}", (17.0, 0.05, 0.004), (-3.0, y, 0.004), ME["blanco"], C_ENT)
texto("Piso_Senda", "SENDA PEATONAL", (-6.0, -4.85, 0.006), (0, 0, 0), 0.22, ME["blanco"])

# ---- rack de almacenamiento junto a la pared norte (fuera del alcance del proyecto) ----
for i, x in enumerate((-7.4, -5.0, -2.6)):
    for y in (4.4, 5.25):
        box(f"Rack_Montante_{i}_{y:.2f}", (0.09, 0.09, 4.4), (x, y, 2.2), ME["rack_azul"], C_ENT)
for z in (1.55, 3.05):
    for y in (4.4, 5.25):
        box(f"Rack_Larguero_{z:.2f}_{y:.2f}", (4.9, 0.06, 0.12), (-5.0, y, z), ME["rack_naranja"], C_ENT)
for bahia, xc in enumerate((-6.2, -3.8)):
    for nivel, z in enumerate((0.0, 1.61, 3.11)):
        box(f"Rack_Pallet_{bahia}_{nivel}", (1.2, 0.8, 0.14), (xc, 4.82, z + 0.07), M["pallet"], C_ENT)
        alto = 0.95 if nivel < 2 else 0.8
        box(f"Rack_Carga_{bahia}_{nivel}", (1.12, 0.74, alto), (xc, 4.82, z + 0.14 + alto / 2), ME["film"], C_ENT, bevel=0.03)

# ---- carteles de las zonas ----
texto("Cartel_Expedicion", "EXPEDICION", (5.65, 1.65, 1.67), (math.pi / 2, 0, 0), 0.13, ME["texto"])
# cartel a la izquierda del contenedor, fuera del lugar del operario
box("Cartel_Revision", (1.1, 0.03, 0.28), (-1.0, -3.95, 1.9), material("Senal_Roja", (0.8, 0.12, 0.1), emit=(0.8, 0.1, 0.1), strength=0.5), C_ENT)
box("Cartel_Revision_Poste", (0.05, 0.05, 1.76), (-1.0, -3.93, 0.88), M["chasis"], C_ENT)
texto("Cartel_Revision_Texto", "REVISION MANUAL", (-1.0, -3.97, 1.86), (math.pi / 2, 0, 0), 0.12, ME["texto"])
print("Entorno: paredes, muelle, demarcaciones, rack y carteles")
