"""Etiquetas MOCK estilo Correo Argentino para la presentación de la facultad.

No usa datos reales: remitente, destinatario y número de envío son inventados.
Como en el TPI, la isla solo LEE EL CÓDIGO DE BARRAS: el resultado es OK (código
válido, se registra) o No Read (la adquisición termina bien pero no hay código válido).
Genera, para cada caso (ok / tapada / rayada):
  assets/etq_<caso>.jpg            textura de la etiqueta pegada en el bulto 3D
  assets/caso_<caso>_alineada.jpg  la etiqueta enderezada (lo que compara el sistema)
  assets/caso_<caso>_foto.jpg      la "foto" de la cámara (perspectiva, luz, cartón)
  assets/casos.json                el resultado de la lectura, mismo formato que la estación real

El código de barras es un Code 128 real (zxing-cpp): el script verifica que en «ok» se lea
y que en «tapada» (un pliegue de cinta de embalar lo cruza) y «rayada» (rayones y una mancha)
de verdad NO se lea.

Uso (desde la carpeta del proyecto, con las librerías del .venv):
  PYTHONPATH=.venv/Lib/site-packages python presentacion_facultad/herramientas/generar_etiquetas.py
"""
import json
import math
import random
from pathlib import Path

import cv2
import numpy as np
import zxingcpp
from PIL import Image, ImageDraw, ImageFilter, ImageFont

AQUI = Path(__file__).resolve().parent
ASSETS = AQUI.parent / 'assets'
W_MM, H_MM = 150.0, 110.49          # mismo tamaño que la etiqueta de la estación real (lo usan pantallas.js y monitores.js)
PX = 8                              # px por mm
W, H = round(W_MM * PX), round(H_MM * PX)
FUENTES = Path('C:/Windows/Fonts')


def fuente(nombre, mm):
    return ImageFont.truetype(str(FUENTES / nombre), max(8, round(mm * PX)))


F_NEG = lambda mm: fuente('arialbd.ttf', mm)
F_NOR = lambda mm: fuente('arial.ttf', mm)
F_ANG = lambda mm: fuente('ARIALNB.TTF', mm)
F_MONO = lambda mm: fuente('consolab.ttf', mm)

AMARILLO = (255, 204, 0)
AZUL = (0, 61, 122)
NEGRO = (17, 17, 17)

ENVIO = 'TN000123456AR'
DATOS = {                                   # lo que dice el "ERP" (mock) para este envío
    'servicio': 'PAQ.AR CLÁSICO',
    'remitente': 'PROVEEDOR DEMO LTD. (ficticio)',
    'rem_dir': 'Bodega 12 · Zona Franca Demo',
    'origen': 'ORIGEN: CN · SHENZHEN',
    'destinatario': 'CLIENTE DEMO (ficticio)',
    'des_dir': 'Av. Ficticia 1234',
    'localidad': 'SAN FRANCISCO · CÓRDOBA',
    'cp': 'X2400',
    'peso': '2,35 kg',
    'bulto': '1 / 1',
    'fecha': '29/10/2026',
    'aduana': 'DEMO-000123',
    'ruteo': 'CBA',
    'sector': 'SFR-07',
}


def mm(v):
    return round(v * PX)


class Lienzo:
    """Dibuja en mm y anota la caja de cada campo (para casos.json)."""

    def __init__(self):
        self.im = Image.new('RGB', (W, H), (250, 250, 247))
        self.d = ImageDraw.Draw(self.im)
        self.campos = []

    def rect(self, x, y, w, h, relleno=None, borde=NEGRO, ancho=0.35):
        self.d.rectangle([mm(x), mm(y), mm(x + w), mm(y + h)], fill=relleno,
                         outline=borde if ancho else None, width=max(1, mm(ancho)) if ancho else 0)

    def texto(self, x, y, s, f, color=NEGRO, campo=None, esperado=None):
        self.d.text((mm(x), mm(y)), s, font=f, fill=color)
        if campo:
            l, t, r, b = self.d.textbbox((mm(x), mm(y)), s, font=f)
            self.campos.append({'campo': campo, 'esperado': esperado if esperado is not None else s, 'visto': s,
                                'caja': [round(l / PX, 2), round(t / PX, 2), round((r - l) / PX, 2), round((b - t) / PX, 2)]})


def code128(lz, texto, x, y, w, h):
    b = zxingcpp.create_barcode(texto, zxingcpp.BarcodeFormat.Code128)
    fila = np.array(b.to_image(scale=1))[0] < 128              # módulos negros de la primera fila
    idx = np.where(fila)[0]
    fila = fila[idx[0]:idx[-1] + 1]
    modulo = w / len(fila)
    for i, negro in enumerate(fila):
        if negro:
            x0 = x + i * modulo
            lz.d.rectangle([mm(x0), mm(y), max(mm(x0), mm(x0 + modulo) - 1), mm(y + h)], fill=NEGRO)


def dibujar(caso):
    v = dict(DATOS)
    lz = Lienzo()
    t = lz.texto
    # marco y marcas de esquina
    lz.rect(1.2, 1.2, W_MM - 2.4, H_MM - 2.4, ancho=0.45)
    def caja_px(x0, y0, x1, y1):
        return [mm(min(x0, x1)), mm(min(y0, y1)), mm(max(x0, x1)), mm(max(y0, y1))]
    for cx, cy, sx, sy in [(2.6, 2.6, 1, 1), (W_MM - 2.6, 2.6, -1, 1), (2.6, H_MM - 2.6, 1, -1), (W_MM - 2.6, H_MM - 2.6, -1, -1)]:
        lz.d.rectangle(caja_px(cx, cy, cx + sx * 5, cy + sy * 0.8), fill=NEGRO)
        lz.d.rectangle(caja_px(cx, cy, cx + sx * 0.8, cy + sy * 5), fill=NEGRO)

    # encabezado: marca mock (sin logo real) + servicio
    lz.rect(4, 4, 56, 15.5, relleno=AMARILLO, ancho=0)
    t(6, 5.2, 'CORREO', F_NEG(5.4), AZUL)
    t(6, 11.3, 'ARGENTINO', F_NEG(5.4), AZUL, campo='Marca del operador (mock)', esperado='CORREO ARGENTINO')
    lz.campos[-1].update(visto='CORREO ARGENTINO', caja=[6.0, 5.2, 34.0, 12.4])
    t(42.5, 6.0, 'MOCK', F_NEG(3.0), AZUL)
    t(42.5, 10.0, 'SIN VALOR', F_NOR(2.1), AZUL)
    t(42.5, 12.8, 'POSTAL', F_NOR(2.1), AZUL)
    t(63, 4.6, v['servicio'], F_NEG(5.0), campo='Servicio', esperado=DATOS['servicio'])
    t(63, 11.2, 'IMPORTACIÓN · CROSS-BORDER', F_ANG(3.1), campo='Tipo de envío')
    t(63, 15.4, 'Entrega en domicilio', F_NOR(2.4))

    # número de envío + código
    lz.d.line([mm(4), mm(21), mm(139.5), mm(21)], fill=NEGRO, width=mm(0.35))
    t(6, 22.2, 'Nº DE ENVÍO', F_NEG(2.4), campo='Rótulo «Nº de envío»')
    code128(lz, ENVIO, 6, 25.6, 86, 15.5)
    t(18, 41.8, 'TN 0001 2345 6 AR', F_MONO(3.6), campo='Número de envío (legible)')
    # ruteo (bloque invertido)
    lz.rect(98, 23, 41.5, 23.5, relleno=NEGRO, ancho=0)
    t(102.5, 23.6, v['ruteo'], F_NEG(12.5), (255, 255, 255), campo='Código de ruteo', esperado=DATOS['ruteo'])
    t(104.5, 39.6, v['sector'], F_NEG(5.0), (255, 255, 255), campo='Sector de clasificación', esperado=DATOS['sector'])

    # remitente / destinatario
    lz.d.line([mm(4), mm(48.5), mm(139.5), mm(48.5)], fill=NEGRO, width=mm(0.35))
    t(6, 50, 'REMITENTE', F_NEG(2.4), campo='Rótulo «Remitente»')
    t(6, 53.6, v['remitente'], F_ANG(3.1), campo='Remitente', esperado=DATOS['remitente'])
    t(6, 57.6, v['rem_dir'], F_NOR(2.8), campo='Dirección del remitente', esperado=DATOS['rem_dir'])
    t(6, 61.4, v['origen'], F_NEG(2.8), campo='Origen', esperado=DATOS['origen'])
    lz.d.line([mm(70), mm(48.5), mm(70), mm(80.5)], fill=NEGRO, width=mm(0.35))
    t(73, 50, 'DESTINATARIO', F_NEG(2.4), campo='Rótulo «Destinatario»')
    t(73, 53.6, v['destinatario'], F_NEG(3.6), campo='Destinatario', esperado=DATOS['destinatario'])
    t(73, 58.4, v['des_dir'], F_NOR(3.1), campo='Dirección', esperado=DATOS['des_dir'])
    t(73, 62.6, v['localidad'], F_ANG(3.1), campo='Localidad', esperado=DATOS['localidad'])
    t(73, 67.4, 'CP', F_NEG(3.0))
    t(81, 66.4, v['cp'], F_NEG(9.0), campo='Código postal', esperado=DATOS['cp'])

    # fila de datos
    lz.d.line([mm(4), mm(80.5), mm(139.5), mm(80.5)], fill=NEGRO, width=mm(0.35))
    cols = [('PESO', 'peso', 'Peso declarado'), ('BULTO', 'bulto', 'Bulto'), ('FECHA', 'fecha', 'Fecha de admisión'), ('DECL. ADUANA', 'aduana', 'Declaración de aduana')]
    x = 4
    for i, (rot, k, nombre) in enumerate(cols):
        ancho = [28, 24, 36, 47.5][i]
        if i:
            lz.d.line([mm(x), mm(80.5), mm(x), mm(97)], fill=NEGRO, width=mm(0.35))
        t(x + 2, 82, rot, F_NEG(2.3), campo=f'Rótulo «{rot.title()}»')
        t(x + 2, 86.4, v[k], F_NEG(5.2), campo=nombre, esperado=DATOS[k])
        x += ancho
    lz.d.line([mm(4), mm(97), mm(139.5), mm(97)], fill=NEGRO, width=mm(0.35))
    t(6, 99.6, 'Etiqueta de muestra para la simulación TracePack · no es un envío real', F_NOR(2.3),
      campo='Leyenda de muestra')
    t(6, 103.4, 'TPI 2026 · UTN FRSFco · Grupo 1', F_NOR(2.3))

    if caso == 'tapada':                                      # un pliegue de cinta de embalar cruza el código
        capa = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(capa)
        d.polygon([(mm(30), mm(19)), (mm(52), mm(19)), (mm(62), mm(50)), (mm(40), mm(50))], fill=(214, 168, 96, 235))
        d.line([(mm(41), mm(19)), (mm(51), mm(50))], fill=(160, 120, 60, 255), width=mm(0.5))      # el doblez
        lz.im.paste(capa, (0, 0), capa)
    elif caso == 'rayada':                                    # rayones y una mancha de grasa sobre las barras
        rnd = random.Random(5)
        for _ in range(9):
            y0 = rnd.uniform(25, 41); ang = rnd.uniform(-0.25, 0.25)
            lz.d.line([(mm(6), mm(y0)), (mm(92), mm(y0 + 86 * ang))], fill=(250, 250, 247), width=mm(rnd.uniform(0.5, 1.1)))
        lz.d.ellipse([mm(44), mm(27), mm(66), mm(41)], fill=(40, 40, 40))
    return lz
CAJA_CODIGO = [6.0, 25.6, 86.0, 15.5]                         # dónde está el código en la etiqueta (mm)


def carton(semilla=99):
    """Una cara del bulto sin etiqueta (lo que ven las otras dos cámaras)."""
    rnd = random.Random(semilla)
    fondo = np.zeros((H, W, 3), np.uint8)
    fondo[:] = (74, 121, 169)
    fondo = np.clip(fondo + np.random.default_rng(semilla).normal(0, 9, (H, W, 1)), 0, 255).astype(np.uint8)
    for _ in range(40):
        y = rnd.randrange(H)
        cv2.line(fondo, (0, y), (W, y + rnd.randrange(-6, 6)), (64, 108, 152), 1)
    cv2.rectangle(fondo, (int(W * 0.42), 0), (int(W * 0.58), H), (40, 190, 235), -1)       # cinta de embalar amarilla (BGR)
    yy, xx = np.mgrid[0:H, 0:W]
    r = np.sqrt(((xx - W * 0.5) / W) ** 2 + ((yy - H * 0.46) / H) ** 2)
    salida = np.clip(fondo.astype(np.float32) * np.clip(1.08 - 0.55 * r ** 1.6, 0.6, 1.1)[..., None], 0, 255).astype(np.uint8)
    return Image.fromarray(cv2.cvtColor(salida, cv2.COLOR_BGR2RGB))


def foto(im, semilla):
    """La etiqueta pegada en el cartón, vista por la cámara: perspectiva leve, luz del anillo, grano."""
    rnd = random.Random(semilla)
    a = cv2.cvtColor(np.array(im), cv2.COLOR_RGB2BGR)
    fondo = np.zeros((H, W, 3), np.uint8)
    fondo[:] = (74, 121, 169)                                 # cartón (BGR)
    ruido = np.random.default_rng(semilla).normal(0, 9, (H, W, 1))
    fondo = np.clip(fondo + ruido, 0, 255).astype(np.uint8)
    for _ in range(40):                                       # fibras del cartón
        y = rnd.randrange(H)
        cv2.line(fondo, (0, y), (W, y + rnd.randrange(-6, 6)), (64, 108, 152), 1)
    m = 0.11
    src = np.float32([[0, 0], [W, 0], [W, H], [0, H]])
    dst = np.float32([[W * m + rnd.uniform(-12, 12), H * m + rnd.uniform(-10, 10)],
                      [W * (1 - m) + rnd.uniform(-14, 6), H * (m + 0.02)],
                      [W * (1 - m + 0.02), H * (1 - m) + rnd.uniform(-8, 8)],
                      [W * (m - 0.01), H * (1 - m + 0.01)]])
    M = cv2.getPerspectiveTransform(src, dst)
    et = cv2.warpPerspective(a, M, (W, H))
    masc = cv2.warpPerspective(np.full((H, W), 255, np.uint8), M, (W, H))
    sombra = cv2.GaussianBlur(cv2.warpPerspective(np.full((H, W), 255, np.uint8), M, (W, H), borderValue=0), (41, 41), 0)
    sombra = np.roll(np.roll(sombra, 8, 0), 6, 1).astype(np.float32) / 255 * 0.35
    fondo = (fondo * (1 - sombra[..., None])).astype(np.uint8)
    salida = np.where(masc[..., None] > 0, et, fondo)
    yy, xx = np.mgrid[0:H, 0:W]                                # luz del anillo: centro más claro, bordes más oscuros
    r = np.sqrt(((xx - W * 0.5) / W) ** 2 + ((yy - H * 0.46) / H) ** 2)
    luz = np.clip(1.08 - 0.55 * r ** 1.6, 0.6, 1.1)
    salida = np.clip(salida.astype(np.float32) * luz[..., None], 0, 255).astype(np.uint8)
    salida = cv2.GaussianBlur(salida, (3, 3), 0.6)
    return Image.fromarray(cv2.cvtColor(salida, cv2.COLOR_BGR2RGB))


def leer_codigo(im):
    r = zxingcpp.read_barcodes(np.array(im.convert('L')))
    return r[0].text if r else None


MOTIVOS = {
    'ok': 'Código Code 128 leído y válido.',
    'tapada': 'No Read: un pliegue de cinta de embalar tapa parte del código; ninguna cámara obtiene un código válido.',
    'rayada': 'No Read: el código está rayado y manchado; ninguna cámara obtiene un código válido.',
}


def resultado(caso, codigo):
    ok = caso == 'ok'
    return {
        'veredicto': 'OK' if ok else 'NO_READ', 'motivo': MOTIVOS[caso],
        'confianza': {'ok': 0.99, 'tapada': 0.97, 'rayada': 0.98}[caso],         # certeza de la adquisición (con o sin código)
        'segundos': {'ok': 0.42, 'tapada': 0.61, 'rayada': 0.58}[caso],
        'codigo': {'simbologia': 'Code 128', 'leido': codigo, 'caja': CAJA_CODIGO},
        'datos': {'caja': codigo or 'sin código', 'producto': DATOS['servicio'] if ok else 'Bulto sin identificar'},
        'px_mm': PX,
    }


def main():
    ASSETS.mkdir(exist_ok=True)
    todo = {}
    for i, caso in enumerate(['ok', 'tapada', 'rayada']):
        lz = dibujar(caso)
        im = lz.im.filter(ImageFilter.GaussianBlur(0.35))     # tinta térmica: borde apenas suave
        codigo = leer_codigo(im)
        if caso == 'ok':
            assert codigo == ENVIO, f'{caso}: el código no se lee ({codigo!r})'
        else:
            assert codigo is None, f'{caso}: el código todavía se lee ({codigo!r}): el daño no alcanza'
        im.save(ASSETS / f'caso_{caso}_alineada.jpg', quality=90)
        foto(im, 100 + i).save(ASSETS / f'caso_{caso}_foto.jpg', quality=88)
        im.resize((680, round(680 * H / W)), Image.LANCZOS).save(ASSETS / f'etq_{caso}.jpg', quality=90)
        todo[caso] = resultado(caso, codigo)
        print(caso, todo[caso]['veredicto'], '· código', codigo)
    carton().save(ASSETS / 'carton.jpg', quality=85)
    for viejo in list(ASSETS.glob('caso_*_marcada.jpg')) + [ASSETS / f'{p}_{k}{e}' for p in ('caso', 'etq') for k in ('dato', 'linea') for e in ('', '_foto.jpg', '_alineada.jpg', '.jpg')]:
        if not viejo.exists():
            continue
        viejo.unlink()
    (ASSETS / 'casos.json').write_text(json.dumps(todo, ensure_ascii=False, indent=1), encoding='utf-8')


if __name__ == '__main__':
    main()
