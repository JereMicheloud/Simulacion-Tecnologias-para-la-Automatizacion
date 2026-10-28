"""H3 - Descarga robotizada: camion, muelle, cinta de acumulacion y AMR de dos brazos con cabezales multiventosa.

Se corre DESPUES de crear_escena_tracepack.py y en el mismo namespace (usa sus funciones box, cyl, empty, material...):
    ns = {}; exec(open(".../crear_escena_tracepack.py", encoding="utf-8").read(), ns)
    exec(open(".../crear_descarga_amr.py", encoding="utf-8").read(), ns)

Geometria (metros, Blender):
- Muelle en x = -12.4. El camion estaciona en el patio (z = -1.1), asi su piso queda al nivel del deposito (z = 0)
  y el AMR puede entrar a la caja.
- Carga: 36 bultos (4 formatos) en 3 filas x 4 columnas x 3 bultos apilados junto a las puertas (lista CARGA).
- Acumulacion: cinta x en [-8.9, -5.25]; punto de carga del AMR en x = -8.45 (S_CARGA); capacidad 3 (S_ACU).
- AMR: raiz "AMR" (avanza en +X local). Carro elevable "AMR_Carro" en el mastil; brazos planos de 2 eslabones
  (AMR_Hombro_I/D -> AMR_Codo_I/D -> AMR_Muneca_I/D) con cabezales multiventosa que sujetan el bulto por su cara frontal.
"""
import bpy
import math

C_CAM = collection("Camion")
C_CARGA = collection("Carga_Camion")  # solo para renders; la web crea su propia carga
C_AMR = collection("AMR")
C_ACU = collection("Acumulacion")

MH = {
    "remolque": material("Remolque_Blanco", (0.88, 0.89, 0.9), rough=0.45),
    "franja": material("Remolque_Franja", (0.1, 0.35, 0.75), rough=0.4),
    "chasis_cam": material("Camion_Chasis", (0.08, 0.08, 0.09), metallic=0.5, rough=0.5),
    "rueda": material("Neumatico", (0.03, 0.03, 0.03), rough=0.8),
    "llanta": material("Llanta", (0.7, 0.7, 0.72), metallic=1.0, rough=0.3),
    "cabina": material("Cabina_Camion", (0.75, 0.12, 0.1), metallic=0.3, rough=0.35),
    "vidrio": material("Vidrio_Cabina", (0.05, 0.08, 0.12), metallic=0.2, rough=0.05),
    "hormigon": material("Hormigon_Muelle", (0.5, 0.5, 0.48), rough=0.9),
    "goma": material("Tope_Goma", (0.04, 0.04, 0.04), rough=0.9),
    "chapa": material("Chapa_Niveladora", (0.45, 0.47, 0.5), metallic=0.8, rough=0.4),
    "amr": material("AMR_Carcasa", (0.95, 0.47, 0.08), rough=0.4),
    "amr_gris": material("AMR_Gris", (0.2, 0.21, 0.23), metallic=0.3, rough=0.5),
    "brazo": material("AMR_Brazo", (0.92, 0.93, 0.94), metallic=0.2, rough=0.35),
    "articulacion": material("AMR_Articulacion", (0.15, 0.15, 0.17), metallic=0.5, rough=0.4),
}

# ---------- muelle ----------
box("Muelle_Nivelador", (0.55, 2.1, 0.03), (-12.62, 0, -0.015), MH["chapa"], C_EST)
for y in (1.45, -1.45):
    box(f"Muelle_Tope_{'N' if y > 0 else 'S'}", (0.12, 0.3, 0.35), (-12.46, y, -0.3), MH["goma"], C_EST)
box("Muelle_Borde", (0.06, 12, 0.08), (-12.43, 0, -0.04), M["linea"], C_EST)
photo_sensor("S_CAMION", (-12.15, 1.55, 0.12), (-12.5, 1.55, 0.12), C_SEN, diffuse=True)

# ---------- camion (raiz en el origen = posicion de estacionado; la web/animacion la desplaza en X) ----------
cam = empty("Camion", (0, 0, 0), C_CAM)
X0, X1 = -19.6, -12.45  # caja del remolque
L = X1 - X0
cx = (X0 + X1) / 2
box("Remolque_Piso", (L, 2.5, 0.1), (cx, 0, -0.05), MH["chasis_cam"], C_CAM, parent=cam)
for s in (1, -1):
    box(f"Remolque_Lateral_{s:+d}", (L, 0.05, 2.6), (cx, s * 1.235, 1.3), MH["remolque"], C_CAM, parent=cam)
    box(f"Remolque_Franja_{s:+d}", (L * 0.9, 0.01, 0.25), (cx - 0.2, s * 1.265, 1.6), MH["franja"], C_CAM, parent=cam)
    box(f"Remolque_Marco_{s:+d}", (0.1, 0.1, 2.7), (X1, s * 1.22, 1.3), M["chasis"], C_CAM, parent=cam)
box("Remolque_Techo", (L, 2.52, 0.06), (cx, 0, 2.63), MH["remolque"], C_CAM, parent=cam)
box("Remolque_Frente", (0.05, 2.5, 2.6), (X0 + 0.025, 0, 1.3), MH["remolque"], C_CAM, parent=cam)
box("Remolque_Dintel", (0.1, 2.5, 0.12), (X1, 0, 2.6), M["chasis"], C_CAM, parent=cam)
box("Remolque_Chasis", (L - 0.3, 1.0, 0.3), (cx - 0.15, 0, -0.27), MH["chasis_cam"], C_CAM, parent=cam)
box("Remolque_Paragolpes", (0.12, 2.2, 0.12), (X1 + 0.05, 0, -0.75), MH["chasis_cam"], C_CAM, parent=cam)
for x in (-14.6, -15.75, -21.6):
    for y in (0.95, -0.95):
        cyl(f"Rueda_{x:.1f}_{y:+.2f}", 0.5, 0.36, (x, y, -0.6), MH["rueda"], C_CAM, axis="Y", parent=cam)
        cyl(f"Llanta_{x:.1f}_{y:+.2f}", 0.28, 0.38, (x, y, -0.6), MH["llanta"], C_CAM, axis="Y", parent=cam)
box("Cabina", (2.0, 2.4, 2.1), (-21.1, 0, 0.55), MH["cabina"], C_CAM, parent=cam, bevel=0.08)
box("Cabina_Parabrisas", (0.04, 2.0, 0.8), (-22.11, 0, 1.0), MH["vidrio"], C_CAM, parent=cam)
for s in (1, -1):
    box(f"Cabina_Ventana_{s:+d}", (0.9, 0.03, 0.7), (-21.4, s * 1.2, 1.0), MH["vidrio"], C_CAM, parent=cam)
box("Cabina_Chasis", (3.0, 1.0, 0.3), (-20.9, 0, -0.55), MH["chasis_cam"], C_CAM, parent=cam)
# puertas traseras: pivote en la bisagra; cerradas se extienden hacia el centro. Abiertas: +/-270 grados (contra el lateral)
for nm, s in (("I", 1), ("D", -1)):
    piv = empty(f"Puerta_{nm}", (X1 + 0.02, s * 1.25, 1.3), C_CAM, parent=cam)
    p = box(f"Puerta_{nm}_Hoja", (0.04, 1.23, 2.5), (0, 0, 0), MH["remolque"], C_CAM, parent=piv)
    p.location = (0, -s * 0.615, 0)
    for z in (-0.6, 0.6):
        b = box(f"Puerta_{nm}_Barra_{z:+.1f}", (0.05, 0.04, 0.9), (0, 0, 0), M["chasis"], C_CAM, parent=piv)
        b.location = (0.03, -s * 0.9, z * 0.4)

# Carga: 3 filas (desde la puerta) x 4 columnas x 3 bultos apilados; cada columna se apila con la altura real de cada formato.
# CARGA queda en orden de retiro: fila mas cercana a la puerta primero y, dentro de la fila, de arriba hacia abajo.
rnd = random.Random(11)
CARGA = []
for fila, x in enumerate((-13.0, -13.45, -13.9)):
    for col, y in enumerate((-0.6, -0.2, 0.2, 0.6)):
        z = 0.0
        for nivel in range(3):
            v = rnd.choice(list(VARIANTES))
            h = VARIANTES[v][0][2]
            CARGA.append({"fila": fila, "col": col, "nivel": nivel, "x": x, "y": y, "z": z + h / 2, "variante": v})
            z += h
CARGA.sort(key=lambda c: (c["fila"], -c["nivel"], c["col"]))
for i, c in enumerate(CARGA):
    c["nombre"] = f"Carga_{i:02d}"
    bulto(c["nombre"], (c["x"], c["y"], c["z"]), label_face="auto", coll=C_CARGA, variante=c["variante"])

# ---------- cinta de acumulacion (zona previa al alimentador) ----------
conveyor("Acumulacion", -8.9, -5.25, M["banda"])
photo_sensor("S_CARGA", (-8.45, 0.55, BELT_TOP + 0.12), (-8.45, -0.55, BELT_TOP + 0.12), C_ACU)
photo_sensor("S_ACU", (-6.85, 0.55, BELT_TOP + 0.12), (-6.85, -0.55, BELT_TOP + 0.12), C_ACU)

# ---------- AMR de dos brazos ----------
L1 = L2 = 0.45
HOMBRO_X, HOMBRO_Y = 0.1, 0.22     # en el sistema del carro
SEP = 0.075                         # los dos cabezales se apoyan lado a lado sobre la cara frontal del bulto
CABEZAL = 0.035                     # placa + ventosas: de la muñeca a la cara del bulto
CARRO_X = 0.4                       # el carro sube y baja delante del mastil


def ik(tx, ty, s):
    """Brazo plano de 2 eslabones: hombro en el origen, muñeca en (tx, ty); codo hacia afuera (lado s = +1 izq / -1 der).
    Devuelve (hombro, codo, muñeca) en radianes; la muñeca deja el cabezal paralelo al eje X del robot."""
    d = max(0.05, min(math.hypot(tx, ty), L1 + L2 - 1e-3))
    e = math.acos(max(-1.0, min(1.0, (d * d - L1 * L1 - L2 * L2) / (2 * L1 * L2))))
    a = math.atan2(ty, tx) + s * math.atan2(L2 * math.sin(e), L1 + L2 * math.cos(e))
    c = -s * e
    return a, c, -(a + c)


def pose_brazos(x_cara):
    """Apoya los dos cabezales sobre una cara frontal ubicada en x_cara (eje X del robot), a +/-SEP del eje.
    Los brazos quedan siempre por delante de esa cara: no se meten entre bultos vecinos ni tocan las paredes."""
    for nm, s in (("I", 1), ("D", -1)):
        a, c, w = ik(x_cara - CABEZAL - CARRO_X - HOMBRO_X, s * (SEP - HOMBRO_Y), s)
        bpy.data.objects[f"AMR_Hombro_{nm}"].rotation_euler = (0, 0, a)
        bpy.data.objects[f"AMR_Codo_{nm}"].rotation_euler = (0, 0, c)
        bpy.data.objects[f"AMR_Muneca_{nm}"].rotation_euler = (0, 0, w)


amr = empty("AMR", (0, 0, 0), C_AMR)
box("AMR_Chasis", (0.9, 0.7, 0.28), (0, 0, 0.19), MH["amr"], C_AMR, parent=amr, bevel=0.03)
box("AMR_Paragolpes", (0.92, 0.72, 0.05), (0, 0, 0.08), MH["goma"], C_AMR, parent=amr)
box("AMR_Contrapeso", (0.3, 0.6, 0.22), (-0.25, 0, 0.44), MH["amr_gris"], C_AMR, parent=amr, bevel=0.02)
for x in (0.3, -0.3):
    for y in (0.36, -0.36):
        cyl(f"AMR_Rueda_{x:+.1f}_{y:+.2f}", 0.08, 0.06, (x, y, 0.08), MH["rueda"], C_AMR, axis="Y", parent=amr)
cyl("AMR_Lidar", 0.06, 0.07, (0.36, 0, 0.37), material("Luz_AMR_Lidar", (0.1, 0.9, 0.3), emit=(0.1, 0.9, 0.3), strength=2.0), C_AMR, parent=amr)
box("AMR_Luz_Estado", (0.04, 0.5, 0.03), (-0.43, 0, 0.34), material("Luz_AMR_Estado", (0.1, 0.9, 0.3), emit=(0.1, 0.9, 0.3), strength=2.0), C_AMR, parent=amr)
box("AMR_Mastil", (0.1, 0.26, 1.95), (0.28, 0, 1.3), M["perfil"], C_AMR, parent=amr, bevel=0.01)
box("AMR_Camara3D", (0.07, 0.2, 0.06), (0.36, 0, 2.2), MH["amr_gris"], C_AMR, parent=amr, bevel=0.01)
# campo de vision 3D (se muestra en la web durante la localizacion)
fov3d = mesh_from("AMR_FOV", [(0.4, 0, 2.18), (2.0, 0.9, 0.0), (2.0, -0.9, 0.0), (2.0, -0.9, 1.6), (2.0, 0.9, 1.6)],
                  [(0, 1, 2), (0, 2, 3), (0, 3, 4), (0, 4, 1)],
                  material("FOV_Vision3D", (0.3, 0.6, 1.0), alpha=0.16, emit=(0.3, 0.6, 1.0), strength=0.6), C_AMR, parent=amr)
carro = empty("AMR_Carro", (CARRO_X, 0, 0.95), C_AMR, parent=amr)
box("AMR_Carro_Placa", (0.08, 0.72, 0.18), (0, 0, 0), MH["amr_gris"], C_AMR, parent=carro, bevel=0.01).location = (0, 0, 0)
for nm, s in (("I", 1), ("D", -1)):
    h = empty(f"AMR_Hombro_{nm}", (HOMBRO_X, s * HOMBRO_Y, 0), C_AMR, parent=carro)
    cyl(f"AMR_Hombro_{nm}_Eje", 0.06, 0.13, (0, 0, 0), MH["articulacion"], C_AMR, parent=h).location = (0, 0, 0)
    box(f"AMR_Brazo_{nm}", (L1, 0.07, 0.07), (0, 0, 0), MH["brazo"], C_AMR, parent=h, bevel=0.015).location = (L1 / 2, 0, 0)
    co = empty(f"AMR_Codo_{nm}", (L1, 0, 0), C_AMR, parent=h)
    cyl(f"AMR_Codo_{nm}_Eje", 0.05, 0.11, (0, 0, 0), MH["articulacion"], C_AMR, parent=co).location = (0, 0, 0)
    box(f"AMR_Antebrazo_{nm}", (L2, 0.06, 0.06), (0, 0, 0), MH["brazo"], C_AMR, parent=co, bevel=0.015).location = (L2 / 2, 0, 0)
    mu = empty(f"AMR_Muneca_{nm}", (L2, 0, 0), C_AMR, parent=co)
    cyl(f"AMR_Muneca_{nm}_Eje", 0.04, 0.09, (0, 0, 0), MH["articulacion"], C_AMR, parent=mu).location = (0, 0, 0)
    # cabezal multiventosa: placa en el plano YZ; las 4 ventosas miran hacia adelante (+X), a la cara frontal del bulto
    box(f"AMR_Cabezal_{nm}", (0.03, 0.13, 0.12), (0, 0, 0), MH["amr_gris"], C_AMR, parent=mu, bevel=0.005).location = (0, 0, 0)
    mv = material(f"Ventosa_{nm}", (0.15, 0.2, 0.3), emit=(0.2, 0.6, 1.0), strength=0.0)
    for vy in (-0.035, 0.035):
        for vz in (-0.03, 0.03):
            cyl(f"AMR_Ventosa_{nm}_{vy:+.3f}_{vz:+.2f}", 0.022, 0.02, (0, 0, 0), mv, C_AMR, axis="X", parent=mu, verts=12).location = (0.025, vy, vz)

pose_brazos(0.7)  # reposo: cabezales recogidos delante del carro
amr.location = (-10.4, 0, 0)

# camara para los renders de la descarga
from mathutils import Vector
cd = bpy.data.objects.new("Camara_Descarga", bpy.data.cameras.new("Camara_Descarga"))
cd.data.lens = 30
cd.location = (-7.0, -4.6, 3.3)
cd.rotation_euler = (Vector((-11.6, 0.3, 0.6)) - cd.location).to_track_quat("-Z", "Y").to_euler()
C_EST.objects.link(cd)
print("H3: camion, muelle, acumulacion y AMR creados")
