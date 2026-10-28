"""Revision manual de los No Read + destino final comun.

Se corre despues de crear_escena_tracepack.py, en el mismo namespace (usa box, cyl, empty, material, conveyor...).
- Operario en la zona de revision (detras del contenedor): toma el bulto, lo apoya en la cinta de retorno y lo lee
  con un lector de mano (la web dibuja el laser entre "Operario_Lector" y el bulto).
- Cinta de retorno (y = -3.1, x 0.8 -> 5.2) hasta el colector.
- Colector (x = 5.65, avanza en +Y): recibe la linea principal (entrada en y = 0) y el retorno (entrada en y = -3.1)
  y lleva todo a expedicion (tunel con cortina en y = 2.0): el mismo lugar final para los dos flujos.
"""
import bpy
import math

C_REV = collection("Revision_Manual")
MR = {
    "piel": material("Piel", (0.78, 0.58, 0.45), rough=0.6),
    "pantalon": material("Pantalon_Trabajo", (0.12, 0.16, 0.25), rough=0.8),
    "camisa": material("Camisa_Trabajo", (0.2, 0.32, 0.55), rough=0.7),
    "chaleco": material("Chaleco_AltaVisibilidad", (1.0, 0.45, 0.05), rough=0.5, emit=(1.0, 0.35, 0.0), strength=0.15),
    "reflectivo": material("Banda_Reflectiva", (0.85, 0.87, 0.9), metallic=0.8, rough=0.2),
    "casco": material("Casco", (1.0, 0.8, 0.05), rough=0.35),
    "botin": material("Botin", (0.06, 0.05, 0.05), rough=0.7),
    "lector": material("Lector_Mano", (0.15, 0.15, 0.17), rough=0.4),
    "tunel": material("Tunel_Expedicion", (0.25, 0.3, 0.36), metallic=0.4, rough=0.5),
    "cortina": material("Cortina_PVC", (0.75, 0.85, 0.9), rough=0.1, alpha=0.45),
    "senal": material("Senal_Verde", (0.1, 0.55, 0.3), rough=0.5, emit=(0.1, 0.6, 0.3), strength=0.6),
}

# ---------- cinta de retorno y colector ----------
conveyor("Retorno", 0.8, 5.2, M["banda"], yc=-3.1)

Y0, Y1, XC = -3.6, 2.0, 5.65
L = Y1 - Y0
box("Colector_Banda", (0.8, L, 0.04), (XC, (Y0 + Y1) / 2, BELT_TOP - 0.02), M["banda"], C_TRA, bevel=0.01)
box("Colector_Baranda_E", (0.05, L, 0.1), (XC + 0.43, (Y0 + Y1) / 2, BELT_TOP - 0.03), M["perfil"], C_TRA, bevel=0.005)
# baranda oeste con huecos donde entran la linea principal (y = 0) y el retorno (y = -3.1)
for i, (a, b) in enumerate(((Y0, -3.55), (-2.65, -0.45), (0.45, Y1))):
    box(f"Colector_Baranda_O_{i}", (0.05, b - a, 0.1), (XC - 0.43, (a + b) / 2, BELT_TOP - 0.03), M["perfil"], C_TRA, bevel=0.005)
box("Colector_Baranda_S", (0.86, 0.05, 0.1), (XC, Y0 - 0.02, BELT_TOP - 0.03), M["perfil"], C_TRA)
for ye in (Y0 + 0.05, Y1 - 0.05):
    cyl(f"Colector_Tambor_{ye:.2f}", 0.045, 0.8, (XC, ye, BELT_TOP - 0.045), M["rodillo"], C_TRA, axis="X")
for i, y in enumerate((Y0 + 0.15, -2.0, -1.0, 1.0, Y1 - 0.15)):
    for dx in (0.36, -0.36):
        box(f"Colector_Pata_{i}_{dx:+.2f}", (0.06, 0.06, BELT_TOP - 0.08), (XC + dx, y, (BELT_TOP - 0.08) / 2), M["chasis"], C_TRA)
# expedicion: tunel con cortina de PVC donde terminan ambos flujos
box("Expedicion_Techo", (1.1, 1.3, 0.05), (XC, Y1 + 0.35, 1.55), MR["tunel"], C_TRA)
for dx in (0.55, -0.55):
    box(f"Expedicion_Lateral_{dx:+.2f}", (0.05, 1.3, 1.55), (XC + dx, Y1 + 0.35, 0.775), MR["tunel"], C_TRA)
box("Expedicion_Fondo", (1.1, 0.05, 1.55), (XC, Y1 + 1.0, 0.775), MR["tunel"], C_TRA)
box("Expedicion_Piso", (1.0, 1.0, 0.8), (XC, Y1 + 0.5, 0.4), MR["tunel"], C_TRA)  # empieza donde termina el colector
for i in range(7):  # faldon de PVC por encima del bulto mas alto (0.40 m): los bultos pasan por debajo
    box(f"Expedicion_Tira_{i}", (0.13, 0.01, 0.28), (XC - 0.42 + i * 0.14, Y1 - 0.28, 1.39), MR["cortina"], C_TRA)
box("Expedicion_Cartel", (0.9, 0.03, 0.25), (XC, Y1 - 0.32, 1.72), MR["senal"], C_TRA)

# ---------- operario con lector de mano ----------
op = empty("Operario", (0.75, -3.95, 0), C_REV)
op.rotation_euler = (0, 0, math.radians(90))  # el modelo mira a +X local
for s in (1, -1):
    cyl(f"Operario_Pierna_{s:+d}", 0.065, 0.82, (0, 0, 0), MR["pantalon"], C_REV, parent=op).location = (0, s * 0.1, 0.45)
    box(f"Operario_Botin_{s:+d}", (0.24, 0.1, 0.08), (0, 0, 0), MR["botin"], C_REV, parent=op, bevel=0.02).location = (0.04, s * 0.1, 0.04)
box("Operario_Torso", (0.22, 0.38, 0.56), (0, 0, 0), MR["camisa"], C_REV, parent=op, bevel=0.05).location = (0, 0, 1.15)
box("Operario_Chaleco", (0.24, 0.4, 0.4), (0, 0, 0), MR["chaleco"], C_REV, parent=op, bevel=0.04).location = (0, 0, 1.18)
for z in (1.08, 1.24):
    box(f"Operario_Reflectivo_{z:.2f}", (0.25, 0.41, 0.035), (0, 0, 0), MR["reflectivo"], C_REV, parent=op).location = (0, 0, z)
bpy.ops.mesh.primitive_uv_sphere_add(radius=0.105, location=(0, 0, 0))
cabeza = bpy.context.active_object
cabeza.name = "Operario_Cabeza"
cabeza.data.materials.append(MR["piel"])
bpy.ops.object.shade_smooth()
link(cabeza, C_REV, op)
cabeza.location = (0, 0, 1.58)
bpy.ops.mesh.primitive_uv_sphere_add(radius=0.125, location=(0, 0, 0))
casco = bpy.context.active_object
casco.name = "Operario_Casco"
casco.scale = (1.0, 1.0, 0.7)
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
casco.data.materials.append(MR["casco"])
bpy.ops.object.shade_smooth()
link(casco, C_REV, op)
casco.location = (0, 0, 1.64)
box("Operario_Visera", (0.1, 0.2, 0.015), (0, 0, 0), MR["casco"], C_REV, parent=op).location = (0.12, 0, 1.62)
# brazos: pivote en el hombro; cuelgan en -Z y se levantan girando en Y (la web y la animacion usan ese eje)
for nm, s in (("I", 1), ("D", -1)):
    hb = empty(f"Operario_Brazo_{nm}", (0, s * 0.24, 1.4), C_REV, parent=op)
    cyl(f"Operario_Brazo_{nm}_Sup", 0.045, 0.3, (0, 0, 0), MR["camisa"], C_REV, parent=hb).location = (0, 0, -0.15)
    cyl(f"Operario_Brazo_{nm}_Inf", 0.04, 0.27, (0, 0, 0), MR["piel"], C_REV, parent=hb).location = (0, 0, -0.43)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.045, location=(0, 0, 0))
    mano = bpy.context.active_object
    mano.name = f"Operario_Mano_{nm}"
    mano.data.materials.append(MR["piel"])
    link(mano, C_REV, hb)
    mano.location = (0, 0, -0.6)
    if nm == "D":
        lec = empty("Operario_Lector", (0.0, 0.0, -0.66), C_REV, parent=hb)
        box("Operario_Lector_Cuerpo", (0.05, 0.04, 0.16), (0, 0, 0), MR["lector"], C_REV, parent=lec, bevel=0.01).location = (0.03, 0, -0.02)
        box("Operario_Lector_Cabezal", (0.07, 0.06, 0.05), (0, 0, 0), MR["lector"], C_REV, parent=lec, bevel=0.01).location = (0.05, 0, -0.1)

print("Revision manual: operario, cinta de retorno, colector y expedicion")
