"""H3 - Anima la llegada del camion y una recogida completa del AMR (cuadros 1-384, 24 fps).

Correr despues de crear_escena_tracepack.py, crear_revision_manual.py, crear_descarga_amr.py, crear_entorno.py y
animar_ciclos.py, en el mismo namespace (usa CARGA, VARIANTES y pose_brazos).
Seccion 19 del TPI: localizar con vision 3D -> apoyar los cabezales -> vacio y verificacion -> retirar y trasladar
-> apoyar en el punto de carga y liberar. Para no atravesar nada, el AMR gira solo fuera del camion (x = -11) y
lleva el bulto recogido cerca del cuerpo; recien sobre la cinta extiende los brazos.
"""
import bpy
import math

O = bpy.data.objects
X_AGARRE, X_TRASLADO = 1.1, 0.85   # centro del bulto delante del AMR: al agarrar/depositar y al trasladar
X_ESPERA = -11.0                    # zona libre para girar, fuera del camion
X_DEP = -8.45 - X_AGARRE            # AMR frente a la cinta de acumulacion (la base no la toca)


def ease(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def tramo(keys, f):
    """keys = [(cuadro, valor), ...] -> valor interpolado (escalares o tuplas)."""
    if f <= keys[0][0]:
        return keys[0][1]
    for (f0, v0), (f1, v1) in zip(keys, keys[1:]):
        if f <= f1:
            t = ease((f - f0) / (f1 - f0))
            if isinstance(v0, tuple):
                return tuple(a + (b - a) * t for a, b in zip(v0, v1))
            return v0 + (v1 - v0) * t
    return keys[-1][1]


obj = CARGA[0]  # primero en el orden de retiro: fila de la puerta, bulto de arriba
(lx, ly, lz) = VARIANTES[obj["variante"]][0]
hx, zc, zcinta = lx / 2, obj["z"], BELT_TOP + lz / 2
h1 = math.atan2(obj["y"], X_ESPERA + 10.2)
h2 = math.atan2(-obj["y"], X_DEP - X_ESPERA)

CAM_X = [(1, -12.0), (50, -3.0), (80, -3.0), (110, 0.0)]
PUERTA = [(1, 0.0), (52, 0.0), (80, 1.0), (384, 1.0)]
POSE = [(1, (-10.2, 0.0, 0.0)), (110, (-10.2, 0.0, 0.0)), (125, (-10.2, 0.0, h1)), (150, (X_ESPERA, obj["y"], h1)),
        (165, (X_ESPERA, obj["y"], math.pi)), (189, (X_ESPERA, obj["y"], math.pi)), (225, (obj["x"] + X_AGARRE, obj["y"], math.pi)),
        (245, (obj["x"] + X_AGARRE, obj["y"], math.pi)), (275, (X_ESPERA, obj["y"], math.pi)), (300, (X_ESPERA, obj["y"], h2)),
        (335, (X_DEP, 0.0, h2)), (342, (X_DEP, 0.0, 0.0)), (372, (X_DEP, 0.0, 0.0)), (384, (-10.2, 0.0, 0.0))]
CARRO = [(1, 0.95), (150, 0.95), (165, zc), (245, zc), (250, zc + 0.02), (300, zc + 0.02), (335, zcinta + 0.03),
         (352, zcinta + 0.03), (360, zcinta), (372, zcinta), (384, 0.95)]
CARA = [(1, 0.7), (189, 0.7), (205, X_AGARRE - hx - 0.05), (225, X_AGARRE - hx - 0.05), (233, X_AGARRE - hx), (250, X_AGARRE - hx),
        (275, X_TRASLADO - hx), (335, X_TRASLADO - hx), (350, X_AGARRE - hx), (360, X_AGARRE - hx), (372, X_AGARRE - hx - 0.1), (384, 0.7)]
VISION = [(1, 0.0), (165, 0.0), (169, 1.0), (185, 1.0), (189, 0.0), (384, 0.0)]
VACIO = [(1, 0.0), (231, 0.0), (233, 4.0), (358, 4.0), (360, 0.0), (384, 0.0)]
carga = [o for o in O if o.name.startswith("Carga_") and o.type == "EMPTY"]
base_carga = {o.name: tuple(o.location) for o in carga}
mv = [bpy.data.materials["Ventosa_I"], bpy.data.materials["Ventosa_D"]]
fov = O["AMR_FOV"]

for f in range(1, 385, 2):
    dx = tramo(CAM_X, f)
    O["Camion"].location.x = dx
    O["Camion"].keyframe_insert("location", frame=f)
    p = tramo(PUERTA, f)
    O["Puerta_I"].rotation_euler.z = p * 1.5 * math.pi
    O["Puerta_D"].rotation_euler.z = -p * 1.5 * math.pi
    O["Puerta_I"].keyframe_insert("rotation_euler", frame=f)
    O["Puerta_D"].keyframe_insert("rotation_euler", frame=f)
    x, y, rumbo = tramo(POSE, f)
    O["AMR"].location = (x, y, 0)
    O["AMR"].rotation_euler = (0, 0, rumbo)
    O["AMR"].keyframe_insert("location", frame=f)
    O["AMR"].keyframe_insert("rotation_euler", frame=f)
    cz = tramo(CARRO, f)
    O["AMR_Carro"].location.z = cz
    O["AMR_Carro"].keyframe_insert("location", frame=f)
    cara = tramo(CARA, f)
    pose_brazos(cara)
    for nm in ("I", "D"):
        for j in ("Hombro", "Codo", "Muneca"):
            O[f"AMR_{j}_{nm}"].keyframe_insert("rotation_euler", frame=f)
    v = tramo(VISION, f)
    fov.scale = (max(v, 0.001),) * 3
    fov.keyframe_insert("scale", frame=f)
    for m in mv:
        s = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED").inputs["Emission Strength"]
        s.default_value = tramo(VACIO, f)
        s.keyframe_insert("default_value", frame=f)
    for o in carga:
        bx, by, bz = base_carga[o.name]
        if o.name == obj["nombre"] and 233 <= f:
            if f <= 360:  # sujeto por los cabezales en su cara frontal
                d = cara + hx
                o.location = (x + math.cos(rumbo) * d, y + math.sin(rumbo) * d, cz)
                o.rotation_euler = (0, 0, rumbo - math.pi)
            else:  # apoyado en el punto de carga de la acumulacion
                o.location = (-8.45, 0.0, zcinta)
                o.rotation_euler = (0, 0, -math.pi)
        else:
            o.location = (bx + dx, by, bz)
            o.rotation_euler = (0, 0, 0)
        o.keyframe_insert("location", frame=f)
        o.keyframe_insert("rotation_euler", frame=f)

bpy.context.scene.frame_set(1)
print("Animacion H3: camion + recogida del AMR")
