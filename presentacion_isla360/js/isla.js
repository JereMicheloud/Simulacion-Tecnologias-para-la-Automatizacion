// ISLA DE INSPECCIÓN 360° · celda de perfiles de aluminio con policarbonato ahumado,
// plato de vidrio sobre un rodamiento de giro (el motor va al costado y empuja con una
// correa: el centro queda LIBRE para que la cámara de abajo vea a través del vidrio)
// y 3 cámaras industriales, cada una con su luz:
//   C1 superior  · anillo de LED alrededor del lente, mira hacia abajo
//   C2 inferior  · anillo difuso bajo el vidrio, mira hacia arriba
//   C3 lateral   · dos barras de LED a los lados, mira la cara del costado
// Al disparar, cada cámara destella y se ve su cono de luz. Baliza de torre arriba,
// franja de seguridad amarilla en el piso y PC industrial colgada del costado.
//
// Uso:
//   const piezas = crearIsla(scene, G, THREE, { islaX, islaZ, platoY, T_GIRO, banda, llamada });
//   // en el bucle: S.girando, S.disparo = { i, t } (lo pone main.js en cada foto), S.alarma, S.ver
//   animarIsla(S, G, dt);

import * as THREE from 'three';

const CELESTE = 0x29a8e0, CELESTE_CLARO = 0x8fd8ff, AMARILLO = 0xffc61a;
export const COLOR_CAM = [0x4fc3ff, 0x3ccf6e, 0xffc61a];        // C1 / C2 / C3 (mismo color en pantallas y HMI)

export function crearIsla(scene, G, _THREE, CFG = {}) {
  const IX = CFG.islaX ?? 0, IZ = CFG.islaZ ?? 0;
  const PY = CFG.platoY ?? 0.8;                                 // cara de arriba del vidrio = altura de la cinta
  const T_GIRO = CFG.T_GIRO ?? 3.2;
  const A = 0.75, ALTO = 2.25;                                  // media celda (m) y alto del pórtico
  const R = 0.36;                                               // radio del plato

  // ---- materiales
  const std = (c, r = 0.45, m = 0.6, extra = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m, ...extra });
  const alu = std(0xd2d8de, 0.45, 0.7), aluOsc = std(0x9aa3ab, 0.45, 0.7);
  const inox = std(0xc3c9cf, 0.4, 0.75), negro = std(0x1c2126, 0.55, 0.35), grafito = std(0x2c333a, 0.4, 0.55);
  const celeste = std(CELESTE, 0.35, 0.3), amarillo = std(AMARILLO, 0.45, 0.2);
  const poli = new THREE.MeshPhysicalMaterial({ color: 0xcfeaff, roughness: 0.06, metalness: 0, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false, clearcoat: 1, clearcoatRoughness: 0.05 });
  const vidrio = new THREE.MeshPhysicalMaterial({ color: 0xe8f7ff, roughness: 0.04, metalness: 0, transmission: 0.92, thickness: 0.025, ior: 1.5, transparent: true, opacity: 0.6, depthWrite: false });
  const emi = (c, i = 1) => new THREE.MeshStandardMaterial({ color: 0x111111, emissive: c, emissiveIntensity: i, roughness: 0.4 });

  const g = new THREE.Group(); g.position.set(IX, 0, IZ); g.userData.id = 'isla'; scene.add(g); G.isla = g;
  const fx = { cams: [], leds: [], anilloLed: null, baliza: null, plato: null, girado: 0, interior: null };
  G.islaFx = fx;
  let ID = 'isla';
  const add = (geo, m, x, y, z, rx = 0, ry = 0, rz = 0, padre = g, sombra = true) => {
    const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz);
    o.castShadow = sombra; o.receiveShadow = true; o.userData.id = ID; padre.add(o); return o;
  };
  const caja = (w, h, d, m, x, y, z, padre = g) => add(new THREE.BoxGeometry(w, h, d), m, x, y, z, 0, 0, 0, padre);

  // ---- perfil de aluminio 45×45 con sus ranuras (las ranuras son tiras oscuras en cada cara)
  const ranura = std(0x5d666f, 0.5, 0.6);
  const perfil = (largo, eje, x, y, z) => {
    const s = 0.045, dims = eje === 'y' ? [s, largo, s] : eje === 'x' ? [largo, s, s] : [s, s, largo];
    caja(...dims, alu, x, y, z);
    const r = 0.012;
    for (const lado of [-1, 1]) {
      if (eje !== 'x') caja(eje === 'y' ? 0.002 : r, eje === 'y' ? largo : r, eje === 'y' ? r : largo, ranura, x + lado * (s / 2 + 0.001), y, z).castShadow = false;
      if (eje !== 'z') caja(eje === 'y' ? r : largo, eje === 'y' ? largo : r, eje === 'y' ? 0.002 : r, ranura, x, y, z + lado * (s / 2 + 0.001)).castShadow = false;
    }
  };

  // ================================================================ BASE: gabinete de inox con la cámara de abajo adentro
  ID = 'isla';
  const BASE_H = PY - 0.06;                                      // el gabinete llega hasta el rodamiento
  caja(2 * A, 0.06, 2 * A, grafito, 0, 0.03, 0);                 // zócalo
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {           // patas niveladoras
    add(new THREE.CylinderGeometry(0.035, 0.045, 0.03, 16), negro, sx * (A - 0.08), 0.015, sz * (A - 0.08));
  }
  // laterales del gabinete: inox atrás y a los costados; el FRENTE (z-) es policarbonato para ver la cámara C2
  const pared = (w, h, x, y, z, ry, m) => { const o = add(new THREE.PlaneGeometry(w, h), m, x, y, z, 0, ry, 0); o.castShadow = m !== poli; return o; };
  pared(2 * A - 0.05, BASE_H - 0.06, 0, (BASE_H + 0.06) / 2, A - 0.02, Math.PI, inox);
  pared(2 * A - 0.05, BASE_H - 0.06, -A + 0.02, (BASE_H + 0.06) / 2, 0, Math.PI / 2, inox);
  pared(2 * A - 0.05, BASE_H - 0.06, A - 0.02, (BASE_H + 0.06) / 2, 0, -Math.PI / 2, inox);
  pared(2 * A - 0.05, BASE_H - 0.06, 0, (BASE_H + 0.06) / 2, -A + 0.02, 0, poli);
  // tapa del gabinete con el agujero del plato
  const tapa = new THREE.Shape(); tapa.moveTo(-A, -A); tapa.lineTo(A, -A); tapa.lineTo(A, A); tapa.lineTo(-A, A); tapa.lineTo(-A, -A);
  const hueco = new THREE.Path(); hueco.absarc(0, 0, R + 0.04, 0, Math.PI * 2, true); tapa.holes.push(hueco);
  add(new THREE.ExtrudeGeometry(tapa, { depth: 0.02, bevelEnabled: false, curveSegments: 48 }), inox, 0, BASE_H, 0, Math.PI / 2);
  // rejillas de ventilación y puerta con manija en el costado de atrás
  for (let i = 0; i < 6; i++) caja(0.22, 0.012, 0.004, negro, A - 0.03 - 0.0, 0.18 + i * 0.03, 0.35).rotation.y = Math.PI / 2;
  caja(0.012, 0.16, 0.03, negro, -0.3, 0.42, A + 0.0);
  // franja celeste de marca alrededor de la base
  for (const [w, x, z, ry] of [[2 * A, 0, -A - 0.001, 0], [2 * A, 0, A + 0.001, 0], [2 * A, -A - 0.001, 0, Math.PI / 2], [2 * A, A + 0.001, 0, Math.PI / 2]])
    add(new THREE.PlaneGeometry(w, 0.05), celeste, x, BASE_H - 0.06, z, 0, ry, 0, g, false).material.side = THREE.DoubleSide;

  // ================================================================ PLATO de vidrio + rodamiento de giro + motor con correa
  ID = 'plato';
  const plato = new THREE.Group(); plato.position.set(0, 0, 0); g.add(plato); G.plato = plato; fx.plato = plato;
  const vid = add(new THREE.CylinderGeometry(R, R, 0.022, 72), vidrio, 0, PY - 0.011, 0, 0, 0, 0, plato, false);
  vid.renderOrder = 2;
  add(new THREE.TorusGeometry(R, 0.012, 10, 72), inox, 0, PY - 0.012, 0, Math.PI / 2, 0, 0, plato);          // aro del vidrio
  // regla de 360°: una marca cada 10°, la de 0° amarilla y larga
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2, largo = i % 9 === 0 ? 0.045 : 0.022;
    const m = add(new THREE.BoxGeometry(largo, 0.0015, 0.004), i === 0 ? emi(AMARILLO, 1.4) : emi(CELESTE_CLARO, 0.9), Math.cos(a) * (R - 0.01 - largo / 2), PY + 0.0008, Math.sin(a) * (R - 0.01 - largo / 2), 0, -a, 0, plato, false);
    m.renderOrder = 3;
  }
  // corona dentada que gira con el plato
  add(new THREE.TorusGeometry(R + 0.015, 0.018, 8, 72), grafito, 0, PY - 0.045, 0, Math.PI / 2, 0, 0, plato);
  // rodamiento fijo (anillo de afuera) + encoder
  add(new THREE.TorusGeometry(R + 0.045, 0.022, 10, 72), aluOsc, 0, PY - 0.045, 0, Math.PI / 2);
  fx.encoder = add(new THREE.TorusGeometry(R + 0.07, 0.006, 6, 72), emi(CELESTE, 1.2), 0, PY - 0.03, 0, Math.PI / 2, 0, 0, g, false);
  // motorreductor al costado y correa
  const MX = 0.0, MZ = R + 0.2;
  add(new THREE.CylinderGeometry(0.06, 0.06, 0.2, 24), grafito, MX, PY - 0.17, MZ);
  add(new THREE.BoxGeometry(0.13, 0.1, 0.13), celeste, MX, PY - 0.3, MZ);
  fx.polea = add(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 20), inox, MX, PY - 0.05, MZ);
  add(new THREE.TorusGeometry(0.2, 0.006, 6, 40), negro, MX, PY - 0.05, (R + 0.2) / 2, Math.PI / 2, 0, 0, g, false).scale.set(1, (R + 0.25) / 0.4, 1);

  // ================================================================ CINTAS de entrada y salida (hasta las cintas del modelo)
  ID = 'isla';
  const BANDA_W = 0.62;
  const cinta = (x0, x1) => {
    const largo = x1 - x0, cx = (x0 + x1) / 2;
    let m = grafito;
    if (CFG.banda) { const t = CFG.banda(); t.repeat.set(largo / 0.4, BANDA_W / 0.4); m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.75 }); G.bandas?.push(['Isla', t]); }
    caja(largo, 0.04, BANDA_W, m, cx, PY - 0.02, 0);
    for (const s of [-1, 1]) caja(largo, 0.07, 0.03, alu, cx, PY - 0.015, s * (BANDA_W / 2 + 0.015));
    for (const xr of [x0 + 0.02, x1 - 0.02]) add(new THREE.CylinderGeometry(0.022, 0.022, BANDA_W, 16), inox, xr, PY - 0.02, 0, Math.PI / 2);
  };
  cinta(-1.0 - IX, -R - 0.03);                                   // de la cinta del modelo al plato
  cinta(R + 0.03, 1.0 - IX);                                     // del plato a la cinta de salida
  // guías amarillas que centran la caja antes del plato
  for (const s of [-1, 1]) {
    const gu = caja(0.42, 0.05, 0.012, amarillo, -R - 0.24, PY + 0.05, s * 0.21); gu.rotation.y = s * 0.12;
  }

  // ================================================================ PÓRTICO de perfiles + policarbonato
  ID = 'cabina';
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) perfil(ALTO, 'y', sx * A, ALTO / 2, sz * A);
  for (const y of [BASE_H + 0.02, ALTO - 0.02]) {
    for (const s of [-1, 1]) { perfil(2 * A, 'x', 0, y, s * A); perfil(2 * A, 'z', s * A, y, 0); }
  }
  perfil(2 * A, 'z', 0, ALTO - 0.02, 0);                         // travesaño central: de acá cuelga C1
  // paneles: atrás y frente enteros; los costados de entrada y salida con la boca del túnel
  const TUN_Y0 = PY - 0.02, TUN_Y1 = PY + 0.36, TUN_Z = 0.3;
  const panel = (w, h, x, y, z, ry) => { const o = pared(w, h, x, y, z, ry, poli); o.renderOrder = 4; o.userData.id = 'cabina'; return o; };
  const HP = ALTO - BASE_H - 0.06, YP = BASE_H + 0.03 + HP / 2;
  panel(2 * A - 0.05, HP, 0, YP, A, Math.PI);
  panel(2 * A - 0.05, HP, 0, YP, -A, 0);
  for (const sx of [-1, 1]) {
    panel(2 * A - 0.05, ALTO - TUN_Y1 - 0.04, sx * A, (TUN_Y1 + ALTO - 0.04) / 2, 0, Math.PI / 2);   // arriba de la boca
    for (const sz of [-1, 1]) panel(A - TUN_Z - 0.02, TUN_Y1 - TUN_Y0, sx * A, (TUN_Y0 + TUN_Y1) / 2, sz * (TUN_Z + (A - TUN_Z) / 2), Math.PI / 2);
    // marco amarillo y negro de la boca + cortina de tiras (luz constante adentro)
    const marco = new THREE.CanvasTexture(rayado()); marco.colorSpace = THREE.SRGBColorSpace; marco.wrapS = THREE.RepeatWrapping; marco.repeat.set(4, 1);
    const mRay = new THREE.MeshStandardMaterial({ map: marco, roughness: 0.6 });
    caja(0.03, 0.04, 2 * TUN_Z + 0.06, mRay, sx * A, TUN_Y1 + 0.02, 0);
    for (const sz of [-1, 1]) caja(0.03, TUN_Y1 - TUN_Y0, 0.03, mRay, sx * A, (TUN_Y0 + TUN_Y1) / 2, sz * (TUN_Z + 0.015));
    for (let i = 0; i < 9; i++) {
      const tira = add(new THREE.PlaneGeometry(0.062, TUN_Y1 - TUN_Y0 - 0.03), new THREE.MeshStandardMaterial({ color: 0x2b3640, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false }), sx * (A + 0.02), (TUN_Y0 + TUN_Y1) / 2 + 0.015, -TUN_Z + 0.035 + i * 0.066, 0, Math.PI / 2, 0, g, false);
      tira.userData.cortina = sx; tira.userData.z0 = tira.position.z; (fx.cortinas ||= []).push(tira);
    }
  }
  // techo de policarbonato ahumado (tapa la luz del galpón y deja ver C1) con la tira de LED de estado en el borde
  const techo = caja(2 * A + 0.05, 0.012, 2 * A + 0.05, new THREE.MeshPhysicalMaterial({ color: 0x2a3a48, roughness: 0.1, transparent: true, opacity: 0.38, depthWrite: false, clearcoat: 1 }), 0, ALTO + 0.006, 0);
  techo.castShadow = false; techo.renderOrder = 4;
  const N_LED = 64; fx.anilloLed = new THREE.InstancedMesh(new THREE.BoxGeometry(0.035, 0.012, 0.012), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), N_LED);
  for (let i = 0; i < N_LED; i++) {
    const u = i / N_LED * 4, lado = Math.floor(u), f = u - lado, m4 = new THREE.Matrix4();
    const p = [[-A + 2 * A * f, -A - 0.03, 0], [A + 0.03, -A + 2 * A * f, Math.PI / 2], [A - 2 * A * f, A + 0.03, 0], [-A - 0.03, A - 2 * A * f, Math.PI / 2]][lado];
    m4.makeRotationY(p[2]).setPosition(p[0], ALTO - 0.04, p[1]);
    fx.anilloLed.setMatrixAt(i, m4); fx.anilloLed.setColorAt(i, new THREE.Color(CELESTE));
  }
  fx.anilloLed.userData.id = 'cabina'; g.add(fx.anilloLed);
  // cartel del pórtico
  const cartel = new THREE.CanvasTexture(cartelIsla()); cartel.colorSpace = THREE.SRGBColorSpace; cartel.anisotropy = 8;
  const mCartel = new THREE.MeshStandardMaterial({ map: cartel, emissive: 0xffffff, emissiveMap: cartel, emissiveIntensity: 0.35, roughness: 0.5 });
  add(new THREE.PlaneGeometry(1.1, 0.22), mCartel, 0, ALTO - 0.17, -A - 0.03, 0, Math.PI, 0, g, false).rotation.y = Math.PI;
  add(new THREE.PlaneGeometry(1.1, 0.22), mCartel, 0, ALTO - 0.17, A + 0.03, 0, 0, 0, g, false).rotation.y = 0;
  // luz de servicio adentro (tenue, para que se lea el interior)
  fx.interior = new THREE.PointLight(0xdff3ff, 0.9, 2.6, 2); fx.interior.position.set(0, ALTO - 0.4, 0); g.add(fx.interior);
  // puerta con manija y enclavamiento (interlock) amarillo
  ID = 'cabina';
  caja(0.02, 0.32, 0.03, inox, A * 0.6, 1.4, -A - 0.03);
  caja(0.06, 0.08, 0.05, amarillo, -A + 0.08, 1.55, -A - 0.04);

  // ================================================================ CÁMARAS
  const LEDS_OFF = new THREE.Color(0x6b7a86);
  const camara = (id, i, pos, mira, montaje) => {
    ID = id;
    const cg = new THREE.Group(); cg.position.copy(pos); g.add(cg);
    cg.lookAt(new THREE.Vector3().copy(mira).add(g.position));    // lookAt del grupo con coordenadas del mundo
    // cuerpo: aluminio anodizado gris oscuro con franja de su color y aletas de disipación
    const cuerpo = new THREE.Group(); cg.add(cuerpo);
    caja(0.075, 0.075, 0.12, grafito, 0, 0, -0.07, cuerpo);
    caja(0.077, 0.012, 0.122, std(COLOR_CAM[i], 0.35, 0.4), 0, 0.03, -0.07, cuerpo);
    for (let k = 0; k < 5; k++) caja(0.085, 0.004, 0.05, aluOsc, 0, -0.03 + k * 0.012, -0.11, cuerpo);
    add(new THREE.CylinderGeometry(0.012, 0.012, 0.03, 12), inox, 0.02, 0, -0.14, Math.PI / 2, 0, 0, cuerpo);   // conector GigE
    add(new THREE.CylinderGeometry(0.009, 0.009, 0.03, 12), inox, -0.02, 0, -0.14, Math.PI / 2, 0, 0, cuerpo);  // conector de disparo
    // lente
    add(new THREE.CylinderGeometry(0.03, 0.03, 0.06, 28), negro, 0, 0, 0.02, Math.PI / 2, 0, 0, cuerpo);
    add(new THREE.CylinderGeometry(0.033, 0.033, 0.012, 28), aluOsc, 0, 0, 0.035, Math.PI / 2, 0, 0, cuerpo);
    add(new THREE.CircleGeometry(0.024, 28), new THREE.MeshPhysicalMaterial({ color: 0x0a1a2a, roughness: 0.05, metalness: 0.2, clearcoat: 1, emissive: COLOR_CAM[i], emissiveIntensity: 0.15 }), 0, 0, 0.0505, 0, 0, 0, cuerpo, false);
    // led de estado de la cámara
    const led = add(new THREE.SphereGeometry(0.006, 10, 10), emi(0x3ccf6e, 1.4), 0.03, 0.03, -0.01, 0, 0, 0, cuerpo, false);
    if (montaje) montaje(cg);
    const cam = { id, i, g: cg, led, flash: 0, luz: [], ledsLuz: [], cono: null, foco: null };
    fx.cams.push(cam); return cam;
  };
  // anillo de LED alrededor del lente (o una barra): instancias que se prenden juntas
  const ledsEn = (cam, puntos, padre) => {
    ID = 'luces';
    const inst = new THREE.InstancedMesh(new THREE.SphereGeometry(0.006, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), puntos.length);
    puntos.forEach((p, k) => { inst.setMatrixAt(k, new THREE.Matrix4().setPosition(...p)); inst.setColorAt(k, LEDS_OFF); });
    inst.userData.id = 'luces'; padre.add(inst); cam.ledsLuz.push(inst); return inst;
  };
  const cono = (cam, largo, ancho, alto) => {                    // cono de luz/visión, apunta a +z local del grupo
    const geo = new THREE.ConeGeometry(1, 1, 4, 1, true); geo.rotateY(Math.PI / 4); geo.translate(0, -0.5, 0); geo.rotateX(-Math.PI / 2);
    const m = new THREE.MeshBasicMaterial({ color: COLOR_CAM[cam.i], transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const o = new THREE.Mesh(geo, m); o.scale.set(ancho * 0.72, alto * 0.72, largo); o.position.z = 0.05; o.raycast = () => {};
    cam.g.add(o); cam.cono = o;
    // contorno del campo de visión, siempre visible y tenue
    const lin = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: COLOR_CAM[cam.i], transparent: true, opacity: 0.35 }));
    lin.scale.copy(o.scale); lin.position.copy(o.position); lin.raycast = () => {}; cam.g.add(lin); cam.borde = lin;
  };
  const foco = (cam, intensidad = 0, angulo = 0.6) => {
    const f = new THREE.SpotLight(0xf4fbff, intensidad, 2.4, angulo, 0.5, 1.2);
    f.position.set(0, 0, 0.06); cam.g.add(f); const t = new THREE.Object3D(); t.position.set(0, 0, 1); cam.g.add(t); f.target = t; cam.foco = f;
  };
  const centro = new THREE.Vector3(0, PY + 0.09, 0);             // centro de la caja sobre el plato

  // C1 superior: cuelga del travesaño, mira hacia abajo, con su anillo
  const c1 = camara('camaraSup', 0, new THREE.Vector3(0, ALTO - 0.38, 0), centro, (cg) => {
    ID = 'soporte';
    caja(0.03, 0.03, 0.3, alu, 0, 0, -0.25, cg);
  });
  { ID = 'luces'; const aro = add(new THREE.TorusGeometry(0.085, 0.014, 12, 40), std(0xe8edf1, 0.3, 0.6), 0, 0, 0.05, 0, 0, 0, c1.g); aro.userData.id = 'luces';
    const pts = []; for (let k = 0; k < 20; k++) { const a = k / 20 * Math.PI * 2; pts.push([Math.cos(a) * 0.085, Math.sin(a) * 0.085, 0.066]); }
    ledsEn(c1, pts, c1.g); }
  cono(c1, ALTO - 0.38 - PY - 0.1, 0.62, 0.62); foco(c1, 0, 0.62);

  // C2 inferior: adentro del gabinete, mira hacia arriba a través del vidrio, con anillo difuso
  const c2 = camara('camaraInf', 1, new THREE.Vector3(0, 0.2, 0), new THREE.Vector3(0, PY + 0.4, 0), (cg) => {
    ID = 'soporte';
    caja(0.16, 0.16, 0.012, aluOsc, 0, 0, -0.14, cg);
  });
  { ID = 'luces';
    const difusor = add(new THREE.RingGeometry(0.14, 0.24, 48), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xeaf6ff, emissiveIntensity: 0.25, roughness: 0.6, side: THREE.DoubleSide }), 0, PY - 0.2, 0, -Math.PI / 2, 0, 0, g, false);
    difusor.userData.id = 'luces'; c2.difusor = difusor;
    for (const s of [-1, 1]) caja(0.02, PY - 0.24, 0.02, alu, s * 0.2, (PY - 0.2) / 2, 0);
    const pts = []; for (let k = 0; k < 28; k++) { const a = k / 28 * Math.PI * 2; pts.push([Math.cos(a) * 0.19, PY - 0.195, Math.sin(a) * 0.19]); }
    ledsEn(c2, pts, g); }
  cono(c2, PY - 0.25, 0.5, 0.5); foco(c2, 0, 0.7);

  // C3 lateral: del lado de atrás (z-), a la altura de la caja, con dos barras de LED a los costados
  const LZ3 = -A + 0.14;
  const c3 = camara('camaraLat', 2, new THREE.Vector3(0, PY + 0.1, LZ3), new THREE.Vector3(0, PY + 0.09, 0), (cg) => {
    ID = 'soporte';
    caja(0.02, 0.02, 0.1, alu, 0, -0.05, -0.12, cg);
  });
  { ID = 'soporte'; caja(0.04, PY + 0.1 - BASE_H, 0.04, alu, 0, (PY + 0.1 + BASE_H) / 2 - 0.03, LZ3 - 0.12); }
  for (const s of [-1, 1]) {
    ID = 'luces';
    const barra = caja(0.035, 0.3, 0.03, std(0xe8edf1, 0.3, 0.6), s * 0.17, PY + 0.12, LZ3 + 0.03); barra.rotation.y = -s * 0.35;
    const pts = []; for (let k = 0; k < 12; k++) pts.push([0, -0.13 + k * 0.024, 0.017]);
    const inst = ledsEn(c3, pts, barra); inst.userData.id = 'luces';
  }
  cono(c3, -LZ3 - 0.12, 0.6, 0.42); foco(c3, 0, 0.55);

  // ================================================================ baliza de torre (arriba, esquina de salida)
  ID = 'cabina';
  const TB = new THREE.Vector3(A - 0.08, ALTO + 0.03, -A + 0.08);
  add(new THREE.CylinderGeometry(0.03, 0.035, 0.03, 16), negro, TB.x, TB.y + 0.015, TB.z);
  const tramos = [[0x3ccf6e, 'verde'], [AMARILLO, 'ambar'], [0xff3b3b, 'roja'], [CELESTE, 'celeste']];
  fx.baliza = {};
  tramos.forEach(([c, n], k) => {
    const m = new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.12, roughness: 0.3, transparent: true, opacity: 0.92 });
    add(new THREE.CylinderGeometry(0.03, 0.03, 0.055, 18), m, TB.x, TB.y + 0.06 + k * 0.058, TB.z);
    fx.baliza[n] = m;
  });
  add(new THREE.CylinderGeometry(0.02, 0.03, 0.02, 16), negro, TB.x, TB.y + 0.06 + 4 * 0.058, TB.z);

  // ================================================================ PC industrial colgada del costado de atrás + bandeja de cables
  ID = 'pc';
  const PCX = -A - 0.12, PCY = 1.3, PCZ = -A + 0.35;
  caja(0.1, 0.32, 0.26, grafito, PCX, PCY, PCZ);
  for (let k = 0; k < 7; k++) caja(0.012, 0.3, 0.26, aluOsc, PCX - 0.055, PCY, PCZ).position.x -= k * 0.0001;
  caja(0.004, 0.02, 0.2, emi(CELESTE, 1.6), PCX - 0.052, PCY + 0.13, PCZ);
  fx.pcLed = add(new THREE.SphereGeometry(0.008, 8, 8), emi(0x3ccf6e, 2), PCX - 0.055, PCY - 0.12, PCZ + 0.1, 0, 0, 0, g, false);
  // cables de las 3 cámaras hasta la PC (por adentro de la canaleta del pórtico)
  const cable = (pts, col = 0x1f262d) => {
    ID = 'pc';
    const tubo = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), 48, 0.0065, 6), new THREE.MeshStandardMaterial({ color: col, roughness: 0.6 }));
    tubo.userData.id = 'pc'; g.add(tubo);
  };
  cable([[0.02, ALTO - 0.28, -0.05], [0, ALTO - 0.06, -0.3], [-A + 0.05, ALTO - 0.06, -A + 0.1], [-A + 0.02, 1.6, -A + 0.1], [PCX + 0.05, PCY + 0.1, PCZ]]);
  cable([[0.02, 0.07, 0.04], [-0.3, 0.07, -0.3], [-A + 0.05, 0.1, -A + 0.15], [-A + 0.03, 0.9, -A + 0.2], [PCX + 0.05, PCY - 0.1, PCZ]]);
  cable([[0, PY + 0.04, LZ3 - 0.1], [-0.3, BASE_H + 0.05, -A + 0.1], [-A + 0.02, BASE_H + 0.3, -A + 0.15], [PCX + 0.05, PCY, PCZ + 0.05]], 0x2a4d63);

  // ================================================================ piso: franja de seguridad amarilla y negra + rótulo
  ID = 'isla';
  const ray = new THREE.CanvasTexture(rayado()); ray.colorSpace = THREE.SRGBColorSpace; ray.wrapS = THREE.RepeatWrapping;
  const M = A + 0.35;
  for (const [w, x, z, ry] of [[2 * M, 0, -M, 0], [2 * M, 0, M, 0], [2 * M, -M, 0, Math.PI / 2], [2 * M, M, 0, Math.PI / 2]]) {
    const t = ray.clone(); t.repeat.set(w / 0.5, 1); t.needsUpdate = true;
    const fr = add(new THREE.PlaneGeometry(w, 0.08), new THREE.MeshStandardMaterial({ map: t, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2 }), x, 0.004, z, -Math.PI / 2, 0, ry, g, false);
    fr.rotation.set(-Math.PI / 2, 0, ry);
  }

  // ================================================================ rótulos 3D
  if (CFG.llamada) {
    const P = (x, y, z) => new THREE.Vector3(IX + x, y, IZ + z);
    CFG.llamada('camaraSup', 'C1 · cámara superior + anillo', P(0.25, ALTO - 0.3, -0.25));
    CFG.llamada('camaraInf', 'C2 · cámara inferior bajo el vidrio', P(0.2, 0.35, -A));
    CFG.llamada('camaraLat', 'C3 · cámara lateral + 2 barras', P(0.3, PY + 0.32, LZ3));
    CFG.llamada('plato', 'Plato de vidrio · gira 360°', P(-0.25, PY + 0.06, -0.35));
    CFG.llamada('luces', 'Una luz por cámara', P(-0.25, PY - 0.15, -0.4));
  }

  // la zona de presencia (S_ZONA) la marca el encoder del plato
  G.leds ||= {};
  G.T_GIRO = T_GIRO;
  return { grupo: g, plato, T_GIRO };
}

function rayado() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 16;
  const x = c.getContext('2d'); x.fillStyle = '#ffc61a'; x.fillRect(0, 0, 128, 16);
  x.fillStyle = '#16191c';
  for (let i = -2; i < 10; i++) { x.beginPath(); x.moveTo(i * 16, 16); x.lineTo(i * 16 + 8, 16); x.lineTo(i * 16 + 16, 0); x.lineTo(i * 16 + 8, 0); x.fill(); }
  return c;
}
function cartelIsla() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 205;
  const x = c.getContext('2d');
  x.fillStyle = '#0f1a24'; x.fillRect(0, 0, 1024, 205);
  x.fillStyle = '#29a8e0'; x.fillRect(0, 0, 1024, 14); x.fillStyle = '#ffc61a'; x.fillRect(0, 191, 1024, 14);
  x.fillStyle = '#ffffff'; x.font = '800 92px "Segoe UI", sans-serif'; x.textAlign = 'left'; x.fillText('ISLA 360°', 36, 132, 430);
  x.fillStyle = '#8fd8ff'; x.font = '600 40px "Segoe UI", sans-serif'; x.fillText('3 cámaras · 3 luces · 1 vuelta', 500, 92);
  x.fillStyle = '#c9d6e0'; x.font = '500 34px "Segoe UI", sans-serif'; x.fillText('TracePack · inspección de etiquetas', 500, 146);
  return c;
}

// ---------------------------------------------------------------------------- animación
// S.disparo = { i, t } en cada foto (C1/C2/C3); S.girando; S.alarma; S.ver = { ok, t } con el último veredicto.
const _c = new THREE.Color();
export function animarIsla(S, G, dt) {
  const fx = G.islaFx; if (!fx) return;
  const t = S.t || 0;
  // plato: una vuelta cada T_GIRO mientras gira; si no, termina suave en la marca de 0°
  if (S.girando) fx.girado += (2 * Math.PI / (G.T_GIRO || 3.2)) * dt;
  fx.plato.rotation.y = -fx.girado;
  if (fx.polea) fx.polea.rotation.y = -fx.girado * 8;
  // disparos: cada cámara destella cuando le toca
  const d = S.disparo;
  fx.cams.forEach((c) => {
    if (d && d.i === c.i && d.t !== c.ultimo) { c.ultimo = d.t; c.flash = 1; }
    c.flash = Math.max(0, c.flash - dt * 2.6);
    const f = c.flash, on = f > 0.02;
    if (c.cono) c.cono.material.opacity = 0.26 * f;
    if (c.borde) c.borde.material.opacity = 0.18 + (S.girando ? 0.25 : 0) + 0.5 * f;
    if (c.foco) c.foco.intensity = 30 * f;
    for (const inst of c.ledsLuz) {
      const col = _c.setRGB(on ? 1 : 0.42, on ? 1 : 0.48, on ? 1 : 0.53).multiplyScalar(1 + 3 * f);
      for (let k = 0; k < inst.count; k++) inst.setColorAt(k, col);
      inst.instanceColor.needsUpdate = true;
    }
    if (c.difusor) c.difusor.material.emissiveIntensity = 0.25 + 3.5 * f;
    c.led.material.emissive.setHex(on ? 0xffffff : (S.girando ? 0x4fc3ff : 0x3ccf6e));
  });
  // tira de LED del techo: corre en celeste mientras gira, verde/rojo un rato tras el veredicto, roja con alarma
  if (fx.anilloLed) {
    const n = fx.anilloLed.count, ver = S.ver && t - S.ver.t < 1.6 ? S.ver : null;
    for (let k = 0; k < n; k++) {
      let r = 0.16, g = 0.66, b = 0.88, k2 = 0.35;
      if (S.alarma) { r = 1; g = 0.2; b = 0.2; k2 = 0.4 + 0.6 * (Math.sin(t * 8) > 0 ? 1 : 0); }
      else if (ver) { [r, g, b] = ver.ok ? [0.24, 0.85, 0.45] : [1, 0.25, 0.25]; k2 = 1.6; }
      else if (S.girando) { const fase = ((k / n) - (fx.girado / (Math.PI * 2))) % 1; k2 = 0.25 + 2.2 * Math.pow(Math.max(0, Math.cos(((fase + 1) % 1) * Math.PI * 2 * 2)), 8); }
      fx.anilloLed.setColorAt(k, _c.setRGB(r * k2, g * k2, b * k2));
    }
    fx.anilloLed.instanceColor.needsUpdate = true;
  }
  // baliza de torre
  if (fx.baliza) {
    const B = fx.baliza, ver = S.ver && t - S.ver.t < 2.2 ? S.ver : null;
    B.verde.emissiveIntensity = !S.alarma && (!ver || ver.ok) && !S.girando ? 2.2 : 0.1;
    B.ambar.emissiveIntensity = S.girando ? (Math.sin(t * 10) > 0 ? 2.4 : 0.3) : 0.1;
    B.roja.emissiveIntensity = S.alarma ? (Math.sin(t * 7) > 0 ? 2.8 : 0.3) : (ver && !ver.ok ? 2.4 : 0.1);
    B.celeste.emissiveIntensity = fx.cams.some((c) => c.flash > 0.05) ? 2.6 : 0.1;
  }
  if (fx.encoder) fx.encoder.material.emissiveIntensity = S.girando ? 1.2 + 0.8 * Math.sin(t * 20) : 0.5;
  if (fx.pcLed) fx.pcLed.material.emissiveIntensity = Math.sin(t * 13) > 0.3 ? 2.5 : 0.6;
  // cortina de tiras: se abre cuando pasa una caja por la boca
  if (fx.cortinas && S.cajas) {
    for (const tira of fx.cortinas) {
      const xb = G.isla.position.x + tira.position.x;
      const pasa = S.cajas.some((b) => Math.abs(b.x - xb) < 0.32 && Math.abs(b.z) < 0.3 && b.y > 0.6 && b.y < 1.2);
      const obj = pasa ? 1.2 : 0; tira.userData.k = (tira.userData.k || 0) + (obj - (tira.userData.k || 0)) * Math.min(1, dt * 8);
      tira.rotation.z = tira.userData.cortina * tira.userData.k * 0.9;
    }
  }
  // compat: sensores del modelo (rojo libre / blanco cortado)
  for (const [m, cortado] of [[G.leds?.foto, S.S_ING ?? false]]) {
    if (!m) continue; m.emissive.setHex(cortado ? 0xffffff : 0x29a8e0); m.emissiveIntensity = cortado ? 2 : 0.8;
  }
}
