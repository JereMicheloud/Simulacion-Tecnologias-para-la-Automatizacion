"""TracePack PLC - Estacion de identificacion y desvio (TPI 2026, Grupo 1, H3).

Arma en Blender el tramo de una sola cinta descripto en TPI2026_G01_H3.md:
alimentador -> cinta transparente de inspeccion (6 lectores R1-R6) -> salida principal,
cilindro neumatico (Festo ADN-S + VUVG) que desvia los No Read al carril de excepcion,
sensores S_ING, S_ZONA, S_EXT, S_RET, S_PASO, PLC S7-1200, HMI y baliza.

Unidades: metros, Z arriba, la estacion de lectura/desvio esta en el origen.
Los nombres de objetos (Reader_R1, FOV_R1, Pusher_Mov, Beam_S_ING, Baliza_Roja...) los usa la web.
Correr dentro de Blender: exec(open(ruta, encoding="utf-8").read())
"""
import bpy
import math
from mathutils import Vector

BELT_TOP = 0.80
BOX = (0.40, 0.30, 0.30)


# ---------- utilidades ----------
def clear_scene():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.actions, bpy.data.curves):
        for d in list(coll):
            if d.users == 0:
                coll.remove(d)
    for c in list(bpy.data.collections):
        bpy.data.collections.remove(c)


def collection(name):
    c = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(c)
    return c


def material(name, color, metallic=0.0, rough=0.5, alpha=1.0, emit=None, strength=0.0, transmission=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    ins = bsdf.inputs
    ins["Base Color"].default_value = (*color, 1)
    ins["Metallic"].default_value = metallic
    ins["Roughness"].default_value = rough
    ins["Alpha"].default_value = alpha
    if "Transmission Weight" in ins:
        ins["Transmission Weight"].default_value = transmission
    if emit:
        ins["Emission Color"].default_value = (*emit, 1)
        ins["Emission Strength"].default_value = strength
    m.diffuse_color = (*color, alpha)
    if alpha < 1:
        for attr, val in (("surface_render_method", "BLENDED"), ("blend_method", "BLEND")):
            try:
                setattr(m, attr, val)
            except (AttributeError, TypeError):
                pass
    return m


def link(obj, coll, parent=None):
    for c in obj.users_collection:
        c.objects.unlink(obj)
    coll.objects.link(obj)
    if parent:
        obj.parent = parent
    return obj


def box(name, dims, loc, mat, coll, parent=None, bevel=0.0, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    o.scale = dims
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    o.data.materials.append(mat)
    if bevel:
        mod = o.modifiers.new("Bevel", "BEVEL")
        mod.width = bevel
        mod.segments = 2
    return link(o, coll, parent)


def cyl(name, r, depth, loc, mat, coll, axis="Z", parent=None, verts=24):
    rot = {"X": (0, math.pi / 2, 0), "Y": (math.pi / 2, 0, 0), "Z": (0, 0, 0)}[axis]
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    o.data.materials.append(mat)
    bpy.ops.object.shade_smooth()
    return link(o, coll, parent)


def empty(name, loc, coll, parent=None):
    e = bpy.data.objects.new(name, None)
    e.empty_display_size = 0.2
    e.location = loc
    coll.objects.link(e)
    if parent:
        e.parent = parent
    return e


def mesh_from(name, verts, faces, mat, coll, parent=None):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    o = bpy.data.objects.new(name, me)
    o.data.materials.append(mat)
    coll.objects.link(o)
    if parent:
        o.parent = parent
    return o


# ---------- escena ----------
clear_scene()
scene = bpy.context.scene
scene.unit_settings.system = "METRIC"

C_EST = collection("Estructura")
C_TRA = collection("Transporte")
C_LEC = collection("Lectores")
C_SEN = collection("Sensores")
C_ACT = collection("Actuador")
C_CTL = collection("Control")
C_BUL = collection("Bultos")

M = {
    "piso": material("Piso", (0.32, 0.33, 0.35), rough=0.85),
    "linea": material("Linea_Seguridad", (0.95, 0.75, 0.05), rough=0.6),
    "zona": material("Zona_Revision_Piso", (0.85, 0.2, 0.15), rough=0.7),
    "chasis": material("Chasis_Acero", (0.55, 0.58, 0.62), metallic=0.8, rough=0.35),
    "perfil": material("Perfil_Aluminio", (0.78, 0.8, 0.83), metallic=0.9, rough=0.3),
    "banda": material("Banda_Goma", (0.06, 0.06, 0.07), rough=0.75),
    "transp": material("Banda_Transparente", (0.6, 0.85, 1.0), rough=0.05, alpha=0.35, transmission=0.6),
    "rodillo": material("Rodillo", (0.7, 0.72, 0.75), metallic=1.0, rough=0.25),
    "lector": material("Lector_Cuerpo", (0.12, 0.13, 0.15), metallic=0.4, rough=0.4),
    "lente": material("Lector_Lente", (0.02, 0.02, 0.03), metallic=0.2, rough=0.05),
    "led_lector": material("Lector_LED", (0.2, 1.0, 0.4), emit=(0.2, 1.0, 0.4), strength=3.0),
    "fov": material("FOV_Lector", (0.2, 1.0, 0.45), alpha=0.18, emit=(0.2, 1.0, 0.45), strength=0.6),
    "cilindro": material("Cilindro_Festo", (0.15, 0.35, 0.75), metallic=0.6, rough=0.3),
    "vastago": material("Vastago_Cromo", (0.9, 0.9, 0.92), metallic=1.0, rough=0.1),
    "placa": material("Placa_Empuje", (0.95, 0.55, 0.1), metallic=0.3, rough=0.4),
    "valvula": material("Electrovalvula_VUVG", (0.2, 0.2, 0.22), metallic=0.5, rough=0.4),
    "sensor": material("Sensor_Cuerpo", (0.9, 0.55, 0.1), rough=0.4),
    "reflector": material("Reflector", (0.9, 0.1, 0.1), metallic=0.5, rough=0.2),
    "carton": material("Carton", (0.62, 0.45, 0.27), rough=0.8),
    "cinta_emb": material("Cinta_Embalaje", (0.75, 0.6, 0.38), rough=0.4),
    "tablero": material("Tablero_PLC", (0.82, 0.83, 0.8), rough=0.5),
    "plc": material("PLC_S7_1200", (0.15, 0.4, 0.45), rough=0.5),
    "hmi": material("HMI_Pantalla", (0.05, 0.25, 0.4), emit=(0.1, 0.45, 0.8), strength=1.5),
    "negro": material("Negro", (0.03, 0.03, 0.03), rough=0.5),
    "contenedor": material("Contenedor_Revision", (0.95, 0.75, 0.1), rough=0.6),
    "pallet": material("Pallet_Madera", (0.55, 0.4, 0.22), rough=0.9),
}


def beam_material(name):
    return material(name, (1.0, 0.05, 0.05), alpha=0.6, emit=(1.0, 0.05, 0.05), strength=4.0)


# Piso del deposito: losa de 1.1 m cuyo frente en x = -12.4 es el muelle (el camion estaciona en el patio, mas abajo)
box("Piso", (20.4, 12, 1.1), (-2.2, 0, -0.55), M["piso"], C_EST)
box("Patio", (28, 12, 0.02), (-26.4, 0, -1.11), material("Patio_Asfalto", (0.12, 0.12, 0.13), rough=0.9), C_EST)
for y in (1.8, -3.9):
    box(f"Linea_Seg_{'N' if y > 0 else 'S'}", (17.5, 0.08, 0.005), (-3.0, y, 0.003), M["linea"], C_EST)
box("Zona_Revision_Marca", (1.6, 1.4, 0.005), (0, -3.1, 0.004), M["zona"], C_EST)


# ---------- transporte ----------
def conveyor(prefix, x0, x1, belt_mat, rails=("N", "S"), yc=0.0):
    """Cinta a lo largo de X, centrada en y = yc."""
    L = x1 - x0
    cx = (x0 + x1) / 2
    box(f"{prefix}_Banda", (L, 0.8, 0.04), (cx, yc, BELT_TOP - 0.02), belt_mat, C_TRA, bevel=0.01)
    for side in rails:
        y = yc + (0.43 if side == "N" else -0.43)
        box(f"{prefix}_Baranda_{side}", (L, 0.05, 0.1), (cx, y, BELT_TOP - 0.03), M["perfil"], C_TRA, bevel=0.005)
    for xe in (x0 + 0.05, x1 - 0.05):
        cyl(f"{prefix}_Tambor_{xe:.2f}", 0.045, 0.8, (xe, yc, BELT_TOP - 0.045), M["rodillo"], C_TRA, axis="Y")
    nlegs = max(2, int(L / 1.4) + 1)
    for i in range(nlegs):
        x = x0 + 0.1 + i * (L - 0.2) / (nlegs - 1)
        for y in (0.36, -0.36):
            box(f"{prefix}_Pata_{i}_{'N' if y > 0 else 'S'}", (0.06, 0.06, BELT_TOP - 0.08), (x, yc + y, (BELT_TOP - 0.08) / 2), M["chasis"], C_TRA)
        box(f"{prefix}_Travesano_{i}", (0.05, 0.72, 0.05), (x, yc, 0.25), M["chasis"], C_TRA)


conveyor("Alimentador", -5.2, -1.0, M["banda"])
conveyor("Salida", 1.0, 5.2, M["banda"])
# Cinta de inspeccion: transparente, sin baranda sur (abre al carril de excepcion) y sin travesanos en el paso optico de R6
box("Inspeccion_Banda", (1.9, 0.8, 0.02), (0, 0, BELT_TOP - 0.01), M["transp"], C_TRA)
box("Inspeccion_Baranda_N", (1.9, 0.05, 0.06), (0, 0.43, BELT_TOP - 0.03), M["perfil"], C_TRA)
for xe in (-0.92, 0.92):
    cyl(f"Inspeccion_Tambor_{xe:.2f}", 0.04, 0.8, (xe, 0, BELT_TOP - 0.04), M["rodillo"], C_TRA, axis="Y")
    for y in (0.36, -0.36):
        box(f"Inspeccion_Pata_{xe:.2f}_{y:.2f}", (0.06, 0.06, BELT_TOP - 0.08), (xe, y, (BELT_TOP - 0.08) / 2), M["chasis"], C_TRA)
for y in (0.36, -0.36):
    box(f"Inspeccion_Larguero_{'N' if y > 0 else 'S'}", (1.9, 0.05, 0.05), (0, y, BELT_TOP - 0.06), M["chasis"], C_TRA)

# Carril de excepcion (rodillos por gravedad hacia la zona de revision manual)
LANE_Y0, LANE_Y1, Z0, Z1 = -0.5, -2.5, BELT_TOP - 0.03, 0.55
n = 16
for i in range(n):
    t = i / (n - 1)
    y = LANE_Y0 + (LANE_Y1 - LANE_Y0) * t
    z = Z0 + (Z1 - Z0) * t
    cyl(f"Carril_Rodillo_{i:02d}", 0.03, 0.62, (0, y, z), M["rodillo"], C_TRA, axis="X", verts=16)
lane_len = math.hypot(LANE_Y1 - LANE_Y0, Z1 - Z0)
tilt = math.atan2(Z0 - Z1, LANE_Y0 - LANE_Y1)
for x in (0.34, -0.34):
    box(f"Carril_Baranda_{'E' if x > 0 else 'O'}", (0.04, lane_len, 0.12), (x, (LANE_Y0 + LANE_Y1) / 2, (Z0 + Z1) / 2 + 0.03),
        M["perfil"], C_TRA, rot=(tilt, 0, 0))
    for y, z in ((LANE_Y0 - 0.1, Z0), (LANE_Y1 + 0.1, Z1)):
        box(f"Carril_Pata_{x:.2f}_{y:.2f}", (0.05, 0.05, z - 0.04), (x, y, (z - 0.04) / 2), M["chasis"], C_TRA)
# Contenedor de revision manual
cx, cy = 0, -3.1
box("Revision_Fondo", (1.1, 0.9, 0.04), (cx, cy, 0.02), M["contenedor"], C_TRA)
box("Revision_Pared_E", (0.04, 0.9, 0.45), (cx + 0.55, cy, 0.225), M["contenedor"], C_TRA)
box("Revision_Pared_O", (0.04, 0.9, 0.45), (cx - 0.55, cy, 0.225), M["contenedor"], C_TRA)
box("Revision_Pared_S", (1.1, 0.04, 0.45), (cx, cy - 0.45, 0.225), M["contenedor"], C_TRA)
box("Revision_Pared_N", (1.1, 0.04, 0.2), (cx, cy + 0.45, 0.1), M["contenedor"], C_TRA)

# ---------- tunel de lectura y lectores R1-R6 ----------
for x in (-0.9, 0.9):
    for y in (1.0, -1.0):
        box(f"Tunel_Poste_{x:+.1f}_{y:+.1f}", (0.07, 0.07, 2.3), (x, y, 1.15), M["perfil"], C_EST, bevel=0.006)
    box(f"Tunel_Viga_X{x:+.1f}", (0.07, 2.07, 0.07), (x, 0, 2.3), M["perfil"], C_EST, bevel=0.006)
for y in (1.0, -1.0):
    box(f"Tunel_Viga_Y{y:+.1f}", (1.87, 0.07, 0.07), (0, y, 2.3), M["perfil"], C_EST, bevel=0.006)
box("Tunel_Viga_Central", (0.07, 2.07, 0.07), (0, 0, 2.3), M["perfil"], C_EST, bevel=0.006)
# Soportes elevados para R4 (frontal) y R5 (posterior)
for x, nm in ((1.75, "R4"), (-1.75, "R5")):
    box(f"Soporte_{nm}_Poste", (0.06, 0.06, 1.75), (x, 0.62, 0.875), M["perfil"], C_EST)
    box(f"Soporte_{nm}_Brazo", (0.05, 0.64, 0.05), (x, 0.32, 1.72), M["perfil"], C_EST)
# R6 inferior: soporte en el piso, bajo la cinta transparente
box("Soporte_R6", (0.08, 0.08, 0.2), (0, 0, 0.1), M["perfil"], C_EST)

TARGET = Vector((0, 0, BELT_TOP + BOX[2] / 2))
FOV_H, FOV_V = math.radians(46), math.radians(29)  # Zebra FS40 Wide Angle
READERS = {
    "R1": ((0.0, 0.0, 2.2), "Superior"),
    "R2": ((0.35, 0.95, 1.55), "Izquierdo"),
    "R3": ((0.0, -0.95, 1.6), "Derecho"),
    "R4": ((1.75, 0.0, 1.62), "Frontal"),
    "R5": ((-1.75, 0.0, 1.62), "Posterior"),
    "R6": ((0.0, 0.0, 0.26), "Inferior"),
}
for rid, (pos, desc) in READERS.items():
    root = empty(f"Reader_{rid}", pos, C_LEC)
    d = (TARGET - Vector(pos))
    root.rotation_mode = "QUATERNION"
    root.rotation_quaternion = Vector((0, 0, -1)).rotation_difference(d.normalized())
    root["descripcion"] = desc
    body = box(f"Reader_{rid}_Cuerpo", (0.11, 0.09, 0.13), (0, 0, 0.0), M["lector"], C_LEC, parent=root, bevel=0.01)
    body.location = (0, 0, 0.02)
    lens = cyl(f"Reader_{rid}_Lente", 0.03, 0.03, (0, 0, 0), M["lente"], C_LEC, parent=root)
    lens.location = (0, 0, -0.055)
    led = cyl(f"Reader_{rid}_LED", 0.042, 0.008, (0, 0, 0), M["led_lector"], C_LEC, parent=root)
    led.location = (0, 0, -0.045)
    dist = d.length * 1.1
    hx, hy = math.tan(FOV_H / 2) * dist, math.tan(FOV_V / 2) * dist
    if pos[2] > 1.0 and abs(pos[0]) < 1.0:  # R1-R3 cuelgan de las vigas del tunel
        hang = 2.3 - pos[2]
        box(f"Colgante_{rid}", (0.03, 0.03, hang), (pos[0], pos[1] if abs(pos[1]) < 0.5 else math.copysign(1.0, pos[1]), pos[2] + hang / 2), M["perfil"], C_EST)
    fov = mesh_from(f"FOV_{rid}", [(0, 0, -0.06), (hx, hy, -dist), (-hx, hy, -dist), (-hx, -hy, -dist), (hx, -hy, -dist)],
                    [(0, 1, 2), (0, 2, 3), (0, 3, 4), (0, 4, 1), (1, 4, 3, 2)], M["fov"], C_LEC, parent=root)

# ---------- sensores fotoelectricos ----------
def photo_sensor(name, emitter, reflector, coll, diffuse=False):
    """Barrera con reflector, o sensor difuso (diffuse=True: el haz termina en la cara del bulto, sin reflector)."""
    e, r = Vector(emitter), Vector(reflector)
    box(f"{name}_Emisor", (0.05, 0.05, 0.08), e, M["sensor"], coll, bevel=0.005)
    if not diffuse:
        box(f"{name}_Reflector", (0.05, 0.015, 0.06), r, M["reflector"], coll)
    for p in ((e,) if diffuse else (e, r)):
        box(f"{name}_Poste_{'E' if p is e else 'R'}", (0.03, 0.03, p.z - 0.04), (p.x, p.y, (p.z - 0.04) / 2), M["chasis"], coll)
    mid, vec = (e + r) / 2, r - e
    b = cyl(f"Beam_{name}", 0.006, vec.length, mid, beam_material(f"Haz_{name}"), coll, verts=8)
    b.rotation_mode = "QUATERNION"
    b.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(vec.normalized())


photo_sensor("S_ING", (-4.6, 0.55, BELT_TOP + 0.12), (-4.6, -0.55, BELT_TOP + 0.12), C_SEN)
# S_ZONA difuso: ve el bulto detenido en la estacion; del lado sur no hay reflector porque por ahi sale el desvio
photo_sensor("S_ZONA", (-0.12, 0.55, BELT_TOP + 0.12), (-0.12, 0.16, BELT_TOP + 0.12), C_SEN, diffuse=True)
photo_sensor("S_PASO", (0.45, -1.7, 0.95), (-0.45, -1.7, 0.95), C_SEN)
# Ocupacion de la zona de excepcion
photo_sensor("S_EXC", (0.7, -3.1, 0.35), (-0.7, -3.1, 0.35), C_SEN)

# Encoder en el tambor de la cinta de inspeccion
cyl("Encoder", 0.04, 0.06, (0.92, 0.47, BELT_TOP - 0.04), M["negro"], C_SEN, axis="Y")

# ---------- actuador: cilindro Festo + electrovalvula VUVG ----------
PZ = BELT_TOP + 0.17
box("Cilindro_Cuerpo", (0.12, 0.85, 0.12), (0, 1.025, PZ), M["cilindro"], C_ACT, bevel=0.01)
box("Cilindro_Soporte", (0.3, 0.1, PZ - 0.06), (0, 1.35, (PZ - 0.06) / 2), M["chasis"], C_ACT)
box("Electrovalvula_VUVG", (0.06, 0.12, 0.09), (0.12, 1.3, PZ + 0.02), M["valvula"], C_ACT, bevel=0.005)
for nm, y in (("S_RET", 1.38), ("S_EXT", 0.68)):
    box(f"{nm}_Cuerpo", (0.03, 0.05, 0.02), (0.065, y, PZ + 0.05), M["sensor"], C_SEN)
    led = cyl(f"LED_{nm}", 0.01, 0.01, (0.065, y, PZ + 0.065), material(f"Luz_{nm}", (0.1, 1.0, 0.2), emit=(0.1, 1.0, 0.2), strength=2.0 if nm == "S_RET" else 0.0), C_SEN, verts=12)
mov = empty("Pusher_Mov", (0, 0, 0), C_ACT)  # se traslada en -Y para extender (carrera 0.75 m)
cyl("Pusher_Vastago", 0.018, 0.9, (0, 0.96, PZ), M["vastago"], C_ACT, axis="Y", parent=mov)
box("Pusher_Placa", (0.5, 0.025, 0.2), (0, 0.5, PZ), M["placa"], C_ACT, parent=mov, bevel=0.005)
box("Pusher_Guia", (0.04, 0.6, 0.03), (0.2, 0.81, PZ + 0.08), M["vastago"], C_ACT, parent=mov)

# ---------- control: tablero PLC, HMI, baliza ----------
box("Tablero_Gabinete", (0.6, 0.3, 0.9), (2.6, 2.4, 1.15), M["tablero"], C_CTL, bevel=0.01)
box("Tablero_Patas", (0.5, 0.25, 0.7), (2.6, 2.4, 0.35), M["chasis"], C_CTL)
box("PLC_S7_1200", (0.22, 0.02, 0.12), (2.6, 2.24, 1.3), M["plc"], C_CTL)
box("Tablero_Etiqueta", (0.3, 0.005, 0.05), (2.6, 2.245, 1.52), M["negro"], C_CTL)
box("HMI_Pedestal", (0.06, 0.06, 1.2), (1.6, 1.7, 0.6), M["chasis"], C_CTL)
box("HMI_Marco", (0.42, 0.06, 0.3), (1.6, 1.66, 1.3), M["negro"], C_CTL, bevel=0.01, rot=(math.radians(-20), 0, 0))
box("HMI_Pantalla", (0.36, 0.01, 0.24), (1.6, 1.625, 1.31), M["hmi"], C_CTL, rot=(math.radians(-20), 0, 0))
# Baliza (torre de senalizacion) sobre el tunel
cyl("Baliza_Mastil", 0.015, 0.3, (0.9, 1.0, 2.48), M["perfil"], C_CTL)
for i, (nm, col) in enumerate((("Verde", (0.1, 1.0, 0.2)), ("Ambar", (1.0, 0.6, 0.05)), ("Roja", (1.0, 0.05, 0.05)))):
    cyl(f"Baliza_{nm}", 0.04, 0.07, (0.9, 1.0, 2.66 + i * 0.075), material(f"Luz_Baliza_{nm}", col, alpha=0.9, emit=col, strength=3.0 if nm == "Verde" else 0.0), C_CTL)

# ---------- bultos ----------
import random

# Sticker de identificacion: QR (3 patrones de esquina + modulos), codigo de barras y renglones de texto.
def sticker_qr(nombre="Etiqueta_QR", W=320, H=200, semilla=7):
    rnd = random.Random(semilla)
    img = bpy.data.images.new(nombre, W, H)
    px = [0.97] * (W * H)                       # escala de grises; fila 0 = abajo
    def rect(x0, y0, w, h, v):
        for yy in range(max(0, y0), min(H, y0 + h)):
            for xx in range(max(0, x0), min(W, x0 + w)):
                px[yy * W + xx] = v
    N, m, ox, oy = 25, 6, 14, 25                 # 25x25 modulos de 6 px
    grid = [[rnd.random() < 0.5 for _ in range(N)] for _ in range(N)]
    for cx, cy in ((0, 0), (N - 7, 0), (0, N - 7)):  # patrones de posicion
        for i in range(-1, 8):
            for j in range(-1, 8):
                if 0 <= cx + i < N and 0 <= cy + j < N:
                    borde = i in (0, 6) or j in (0, 6)
                    centro = 2 <= i <= 4 and 2 <= j <= 4
                    grid[cy + j][cx + i] = borde or centro
    for j in range(N):
        for i in range(N):
            if grid[j][i]:
                rect(ox + i * m, oy + (N - 1 - j) * m, m, m, 0.03)
    x = 186                                       # codigo de barras
    while x < 306:
        w = rnd.choice((2, 2, 3, 4))
        rect(x, 28, w, 70, 0.03)
        x += w + rnd.choice((2, 3))
    for k, ancho in enumerate((110, 90, 118, 70)):  # renglones de texto
        rect(186, 112 + k * 18, ancho, 8, 0.25)
    rect(186, 178, 60, 12, 0.03)                  # logo / titulo
    rect(0, 0, W, 4, 0.6); rect(0, H - 4, W, 4, 0.6); rect(0, 0, 4, H, 0.6); rect(W - 4, 0, 4, H, 0.6)
    img.pixels.foreach_set([c for v in px for c in (v, v, v, 1.0)])
    img.pack()
    mat = bpy.data.materials.new("Etiqueta_QR")
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = next(nd for nd in nt.nodes if nd.type == "BSDF_PRINCIPLED")
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.55
    return mat


lbl = sticker_qr()
M["carton_osc"] = material("Carton_Oscuro", (0.5, 0.35, 0.2), rough=0.85)
M["caja_blanca"] = material("Caja_Blanca", (0.86, 0.86, 0.83), rough=0.7)
M["cinta_fragil"] = material("Cinta_Fragil", (0.85, 0.12, 0.1), rough=0.4)
M["cinta_azul"] = material("Cinta_Azul", (0.15, 0.35, 0.8), rough=0.4)
# formatos de bulto: (largo X, ancho Y, alto Z), material, cinta, cara del sticker. La web usa las mismas medidas.
VARIANTES = {
    "Estandar": ((0.40, 0.30, 0.30), "carton", "cinta_emb", "+Z"),
    "Plana": ((0.42, 0.32, 0.16), "carton", "cinta_fragil", "+Z"),
    "Cubica": ((0.32, 0.30, 0.32), "caja_blanca", "cinta_azul", "-Y"),
    "Alta": ((0.30, 0.26, 0.40), "carton_osc", "cinta_emb", "-Y"),
}


def bulto(name, loc, label_face="+Z", coll=C_BUL, variante="Estandar"):
    dims, mat, cinta, cara = VARIANTES[variante]
    if label_face == "auto":
        label_face = cara
    lx, ly, lz = dims
    root = empty(name, loc, coll)
    box(f"{name}_Caja", dims, (0, 0, 0), M[mat], coll, parent=root, bevel=0.008).location = (0, 0, 0)
    box(f"{name}_Cinta", (lx + 0.004, 0.06, lz + 0.004), (0, 0, 0), M[cinta], coll, parent=root).location = (0, 0, 0)
    if label_face:
        pos = {"+Z": ((lx * 0.18, ly * 0.2, lz / 2 + 0.002), (0, 0, 0)),
               "+X": ((lx / 2 + 0.002, 0, 0), (0, math.pi / 2, 0)),
               "-Y": ((lx * 0.18, -ly / 2 - 0.002, 0), (math.pi / 2, 0, 0))}[label_face]
        bpy.ops.mesh.primitive_plane_add(size=1, location=pos[0], rotation=pos[1])
        p = bpy.context.active_object
        p.name = f"{name}_Etiqueta"
        p.scale = (0.15, 0.094, 1)
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
        p.data.materials.append(lbl)
        link(p, coll, root)
        p.location = pos[0]
    return root


# plantillas que clona la web (una por formato); la estacion anima la estandar
for v, nombre in (("Estandar", "Bulto_Template"), ("Plana", "Bulto_Plana_Template"), ("Cubica", "Bulto_Cubica_Template"), ("Alta", "Bulto_Alta_Template")):
    lejos = 0 if v == "Estandar" else 40  # las plantillas sin animar quedan fuera de cuadro
    r = bulto(nombre, (0, lejos, BELT_TOP + VARIANTES[v][0][2] / 2), label_face="auto", variante=v)
    if lejos:  # se exportan para la web pero no salen en los renders
        for o in [r, *r.children_recursive]:
            o.hide_render = True
bulto("Bulto_NoRead_Template", (0, 0, BELT_TOP + BOX[2] / 2), label_face=None)
Z_B = BELT_TOP + BOX[2] / 2
# H3: los bultos llegan en camion y los descarga el AMR (crear_descarga_amr.py)

# ---------- luces y camara ----------
sun = bpy.data.lights.new("Sol", "SUN")
sun.energy = 3.0
so = bpy.data.objects.new("Sol", sun)
so.rotation_euler = (math.radians(45), math.radians(15), math.radians(35))
C_EST.objects.link(so)
area = bpy.data.lights.new("Luz_Tunel", "AREA")
area.energy = 400
area.size = 2.0
ao = bpy.data.objects.new("Luz_Tunel", area)
ao.location = (0.5, -1.5, 3.5)
C_EST.objects.link(ao)
cam = bpy.data.cameras.new("Camara")
cam.lens = 32
co = bpy.data.objects.new("Camara", cam)
co.location = (5.2, -6.2, 3.8)
co.rotation_euler = (Vector((-0.6, -0.4, 0.8)) - co.location).to_track_quat("-Z", "Y").to_euler()
C_EST.objects.link(co)
scene.camera = co
if scene.world is None:
    scene.world = bpy.data.worlds.new("Mundo")
scene.world.use_nodes = True
bg = next(nd for nd in scene.world.node_tree.nodes if nd.type == "BACKGROUND")
bg.inputs["Color"].default_value = (0.55, 0.62, 0.72, 1)
bg.inputs["Strength"].default_value = 0.6
print("TracePack: escena creada,", len(bpy.data.objects), "objetos")
