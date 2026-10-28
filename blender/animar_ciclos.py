"""Anima dos ciclos de la secuencia E0-E5 sobre la escena de crear_escena_tracepack.py (24 fps).

Ciclo 1 (Bulto_Template, lectura OK):   E0 -> E1 posicionado/lectura -> E2 registrando -> E4 evacuacion -> E0
Ciclo 2 (Bulto_NoRead_Template, No Read): carga manual -> E1 -> E3 desvio (S_EXT, S_PASO, S_RET) -> E4 -> E0
Correr despues del script de la escena: exec(open(ruta, encoding="utf-8").read())
"""
import bpy
import math

scene = bpy.context.scene
scene.render.fps = 24
scene.frame_start, scene.frame_end = 1, 384
O = bpy.data.objects
for o in O:
    o.animation_data_clear()

ZB = 0.95  # centro del bulto sobre la cinta
TILT = math.atan2(0.22, 2.0)  # pendiente del carril de excepcion


def key(obj, frame, loc=None, rot=None, scale=None, constant=False):
    if loc is not None:
        obj.location = loc
        obj.keyframe_insert("location", frame=frame)
    if rot is not None:
        obj.rotation_euler = rot
        obj.keyframe_insert("rotation_euler", frame=frame)
    if scale is not None:
        obj.scale = scale
        obj.keyframe_insert("scale", frame=frame)


def emission(mat_name, frame, strength):
    m = bpy.data.materials[mat_name]
    bsdf = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    s = bsdf.inputs["Emission Strength"]
    s.default_value = strength
    s.keyframe_insert("default_value", frame=frame)


def fov(f_on, f_off):
    for i in range(1, 7):
        f = O[f"FOV_R{i}"]
        key(f, f_on - 4, scale=(0.001,) * 3)
        key(f, f_on, scale=(1, 1, 1))
        key(f, f_off - 4, scale=(1, 1, 1))
        key(f, f_off, scale=(0.001,) * 3)


# Ciclo 1: lectura OK
a = O["Bulto_Template"]
key(a, 1, loc=(-4.9, 0, ZB))
key(a, 72, loc=(0, 0, ZB))          # S_ZONA + parada confirmada por encoder
key(a, 132, loc=(0, 0, ZB))         # lectura (72-108) + espera de confirmacion ERP (108-132)
key(a, 204, loc=(4.9, 0, ZB))       # evacuacion por la linea principal
fov(76, 108)

# Ciclo 2: No Read -> desvio
b = O["Bulto_NoRead_Template"]
key(b, 1, loc=(-6.3, 0, ZB), rot=(0, 0, 0))   # espera en la cinta de acumulacion (H3)
key(b, 190, loc=(-6.3, 0, ZB))
key(b, 204, loc=(-4.9, 0, ZB))      # en E0 la acumulacion lo libera al alimentador (E0 -> E1 con S_ING)
key(b, 276, loc=(0, 0, ZB))
key(b, 319, loc=(0, 0, ZB), rot=(0, 0, 0))
key(b, 330, loc=(0, -0.4, ZB), rot=(0, 0, 0))     # empujado por la placa
key(b, 370, loc=(0, -2.3, 0.75), rot=(TILT, 0, 0))  # rueda por el carril, pasa S_PASO
key(b, 382, loc=(0, -3.0, 0.19), rot=(0, 0, 0))     # cae en la zona de revision manual
fov(280, 312)

# Cilindro: VUVG energizada 312-330 (extension), desenergizada 330 (retorno)
p = O["Pusher_Mov"]
key(p, 312, loc=(0, 0, 0))
key(p, 330, loc=(0, -0.75, 0))
key(p, 348, loc=(0, 0, 0))
for f, ext, ret in ((1, 0, 2), (313, 0, 0), (329, 2, 0), (337, 0, 0), (347, 0, 2)):
    emission("Luz_S_EXT", f, ext)
    emission("Luz_S_RET", f, ret)

scene.frame_set(1)
print("Animacion: frames", scene.frame_start, "-", scene.frame_end)
