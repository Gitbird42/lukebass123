/* Line Painter 3D — Bruce's NY662 road marking ute.
   Needs three.js r128 (global THREE). Exposes window.Ute3D.open(onExit). */
(function () {
  'use strict';
  const THREE = window.THREE;

  // ---------- job + road constants (metres) ----------
  const JOB_LEN = 2000;          // centre line to paint
  const ROAD_LEN = JOB_LEN + 700;
  const ROAD_W = 7.6;            // seal width
  const DASH_START = 30, DASH_ON = 3, DASH_EVERY = 10; // NZ centre line: 3 m paint, 7 m gap
  const GUN_LAT = 1.05;          // gun outrigger, right of ute centre
  const TANK_L = 60;             // litres of paint on board
  const L_PER_M = 0.1 * 0.4;     // 100 mm wide x 400 µm wet = 0.04 L per metre

  const store = {
    get(k, d) { try { const v = localStorage.getItem('bruce-' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('bruce-' + k, JSON.stringify(v)); } catch (e) {} }
  };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  let seed = 662;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

  // ---------- road centreline, sampled every metre ----------
  const RX = new Float32Array(ROAD_LEN + 2), RZ = new Float32Array(ROAD_LEN + 2), RH = new Float32Array(ROAD_LEN + 2);
  (function buildRoad() {
    let x = 0, z = 0;
    for (let i = 0; i <= ROAD_LEN + 1; i++) {
      const s = i;
      const h = 0.30 * Math.sin(s / 270) + 0.16 * Math.sin(s / 101 + 1.3) - 0.16 * Math.sin(1.3);
      RX[i] = x; RZ[i] = z; RH[i] = h;
      x += Math.sin(h); z -= Math.cos(h);
    }
  })();
  function sample(s) {
    s = clamp(s, 0, ROAD_LEN);
    const i = Math.floor(s), f = s - i, j = Math.min(i + 1, ROAD_LEN + 1);
    return { x: lerp(RX[i], RX[j], f), z: lerp(RZ[i], RZ[j], f), h: lerp(RH[i], RH[j], f) };
  }
  function pt(s, lat, y, out) {
    const r = sample(s);
    out = out || new THREE.Vector3();
    return out.set(r.x + lat * Math.cos(r.h), y || 0, r.z + lat * Math.sin(r.h));
  }

  // ---------- canvas textures ----------
  function canvasTex(w, h, draw, repeat) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
    return t;
  }
  function noise(g, w, h, n, base, spread, alpha) {
    for (let i = 0; i < n; i++) {
      const v = base + (Math.random() - .5) * spread;
      g.fillStyle = `rgba(${v},${v},${v},${alpha})`;
      g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
    }
  }
  const T = {};
  function makeTextures() {
    T.road = canvasTex(256, 512, (g, w, h) => {
      g.fillStyle = '#4b4d50'; g.fillRect(0, 0, w, h);
      noise(g, w, h, 26000, 80, 70, .55);
      // worn wheel tracks
      [0.2, 0.36, 0.64, 0.8].forEach(u => { g.fillStyle = 'rgba(20,20,22,.18)'; g.fillRect(u * w - 10, 0, 20, h); });
      // edge lines, 100 mm, 0.3 m in from seal edge
      const px = m => m / ROAD_W * w;
      g.fillStyle = '#ecece4';
      g.fillRect(px(0.3), 0, px(0.1) + 1, h); g.fillRect(w - px(0.4), 0, px(0.1) + 1, h);
      noise(g, w, h, 1500, 40, 30, .5);
    }, true);
    T.road.repeat.set(1, 1);
    T.gravel = canvasTex(128, 128, (g, w, h) => {
      g.fillStyle = '#8a8172'; g.fillRect(0, 0, w, h); noise(g, w, h, 5000, 140, 90, .7);
    }, true);
    T.grass = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#5c7f3a'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 9000; i++) {
        const gr = 100 + Math.random() * 60;
        g.fillStyle = `rgba(${gr * .55 | 0},${gr | 0},${gr * .35 | 0},.5)`;
        g.fillRect(Math.random() * w, Math.random() * h, 1, 2 + Math.random() * 3);
      }
    }, true);
    T.tailgate = canvasTex(512, 300, (g, w, h) => {
      g.fillStyle = '#16181a'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#ffffff'; g.font = 'bold 50px Arial, sans-serif';
      g.fillText('INDEPENDENT', 26, 78);
      g.fillStyle = '#ffffff'; g.fillRect(40, 92, 360, 6);
      g.setLineDash([22, 14]); g.strokeStyle = '#16181a'; g.lineWidth = 4;
      g.beginPath(); g.moveTo(40, 95); g.lineTo(400, 95); g.stroke(); g.setLineDash([]);
      g.beginPath(); g.moveTo(380, 30); g.lineTo(500, 30); g.lineTo(460, 140); g.lineTo(380, 140); g.closePath();
      g.fillStyle = '#d9d9d2'; g.fill();
      g.fillStyle = '#ffffff'; g.font = 'bold 58px Arial, sans-serif'; g.fillText('Roadmarkers', 26, 158);
      g.fillStyle = '#000'; g.fillRect(0, 180, w, h - 180);
      g.fillStyle = '#ffffff'; g.font = 'bold 46px Arial, sans-serif';
      g.fillText('PH 708 · PO BOX 4154', 22, 236);
      g.font = 'bold 42px Arial, sans-serif'; g.fillText('FORDELL     WANGANUI', 30, 284);
      noise(g, w, h, 1800, 200, 50, .25);
    });
    T.plate = canvasTex(256, 80, (g, w, h) => {
      g.fillStyle = '#e8e6dc'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#333'; g.lineWidth = 4; g.strokeRect(4, 4, w - 8, h - 8);
      g.fillStyle = '#222'; g.font = 'bold 60px Arial Narrow, Arial, sans-serif'; g.textAlign = 'center'; g.fillText('NY662', w / 2, 62);
    });
    T.sign = canvasTex(512, 256, (g, w, h) => {
      g.fillStyle = '#f7f7f2'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#111'; g.lineWidth = 12; g.strokeRect(10, 10, w - 20, h - 20);
      g.fillStyle = '#111'; g.font = 'bold 92px Arial, sans-serif'; g.textAlign = 'center';
      g.fillText('ROAD', w / 2, 112); g.fillText('MARKING', w / 2, 214);
    });
    T.stripes = canvasTex(256, 32, (g, w, h) => {
      for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#f2f2ec' : '#141414'; g.fillRect(i * 32, 0, 32, h); }
    });
    T.bonnet = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#2b2e31'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#e9e9e2'; g.beginPath(); g.arc(w * .55, h * .5, 70, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#2b2e31'; g.beginPath(); g.moveTo(w * .55 - 40, h * .5 + 44); g.lineTo(w * .55 + 10, h * .5 - 50); g.lineTo(w * .55 + 34, h * .5 - 50); g.lineTo(w * .55 - 16, h * .5 + 44); g.fill();
    });
    T.brush = canvasTex(128, 128, (g, w, h) => {
      g.fillStyle = '#6d6a64'; g.beginPath(); g.arc(64, 64, 62, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#c9c4b8'; g.lineWidth = 1;
      for (let a = 0; a < Math.PI * 2; a += 0.05) { g.beginPath(); g.moveTo(64 + Math.cos(a) * 14, 64 + Math.sin(a) * 14); g.lineTo(64 + Math.cos(a) * 62, 64 + Math.sin(a) * 62); g.stroke(); }
      g.fillStyle = '#333'; g.beginPath(); g.arc(64, 64, 14, 0, Math.PI * 2); g.fill();
    });
    T.glow = canvasTex(64, 64, (g, w, h) => {
      const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,190,60,1)'); gr.addColorStop(.35, 'rgba(255,140,20,.55)'); gr.addColorStop(1, 'rgba(255,120,0,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    });
    T.roadworks = canvasTex(256, 256, (g, w, h) => {
      g.translate(w / 2, h / 2); g.rotate(Math.PI / 4);
      g.fillStyle = '#f07a1a'; g.fillRect(-84, -84, 168, 168);
      g.strokeStyle = '#111'; g.lineWidth = 8; g.strokeRect(-76, -76, 152, 152);
      g.rotate(-Math.PI / 4); g.fillStyle = '#111'; g.font = 'bold 34px Arial'; g.textAlign = 'center';
      g.fillText('ROAD', 0, -6); g.fillText('MARKING', 0, 30);
    });
  }

  // ---------- materials ----------
  const M = {};
  function makeMaterials() {
    const std = (o) => new THREE.MeshStandardMaterial(o);
    M.white = std({ color: 0xf0efe8, roughness: .45, metalness: .05 });
    M.dirty = std({ color: 0xd8d4c6, roughness: .8 });
    M.black = std({ color: 0x1a1b1d, roughness: .7 });
    M.tyre = std({ color: 0x151515, roughness: .95 });
    M.rim = std({ color: 0xb8b8b2, roughness: .35, metalness: .7 });
    M.chrome = std({ color: 0xcfd2d4, roughness: .2, metalness: .95 });
    M.glass = std({ color: 0x1c2630, roughness: .08, metalness: .6 });
    M.red = std({ color: 0xa31a12, roughness: .4, emissive: 0x300000 });
    M.amber = std({ color: 0xff9a1a, roughness: .3, emissive: 0xff7a00, emissiveIntensity: 1 });
    M.amber2 = M.amber.clone();
    M.hose = std({ color: 0x3a3632, roughness: .9 });
    M.metal = std({ color: 0x7c7d7a, roughness: .5, metalness: .6 });
    M.cone = std({ color: 0xff5a14, roughness: .55 });
    M.coneBand = std({ color: 0xf5f5f0, roughness: .3, emissive: 0x222222 });
    M.tailgate = std({ map: T.tailgate, roughness: .7 });
    M.plate = std({ map: T.plate, roughness: .6 });
    M.sign = std({ map: T.sign, roughness: .6 });
    M.stripes = std({ map: T.stripes, roughness: .6 });
    M.bonnet = std({ map: T.bonnet, roughness: .5 });
    M.brush = std({ map: T.brush, roughness: .9, transparent: true });
    M.paint = std({ color: 0xffffff, roughness: .35, emissive: 0x777777 });
    M.oldPaint = std({ color: 0xffffff, roughness: .9, vertexColors: true });
    M.road = std({ map: T.road, roughness: .95 });
    M.gravel = std({ map: T.gravel, roughness: 1 });
    M.grass = std({ map: T.grass, roughness: 1 });
    M.post = std({ color: 0x8a8170, roughness: .9 });
    M.pole = std({ color: 0x6b5a45, roughness: .9 });
    M.leaf = std({ color: 0x2f4d22, roughness: .9, flatShading: true });
    M.pine = std({ color: 0x24391d, roughness: .9, flatShading: true });
    M.trunk = std({ color: 0x4a3828, roughness: .9 });
    M.hedge = std({ color: 0x35552a, roughness: 1, flatShading: true });
    M.cowB = std({ color: 0x1b1b1b, roughness: .9 });
    M.cowW = std({ color: 0xeeeeea, roughness: .9 });
    M.headlight = std({ color: 0xfff6d8, emissive: 0xfff2c0, emissiveIntensity: .8 });
    M.roadworks = std({ map: T.roadworks, transparent: true, roughness: .6 });
  }

  // ---------- Bruce's ute (local: -z forward, +x right, y up, origin at ground under rear axle centre) ----------
  function box(w, h, d, mat, x, y, z, parent, shadow) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z); if (shadow !== false) { m.castShadow = true; m.receiveShadow = true; }
    parent.add(m); return m;
  }
  function cyl(rt, rb, h, mat, x, y, z, parent, seg) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg || 20), mat);
    m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
  }
  function tube(points, r, mat, parent) {
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(p[0], p[1], p[2])));
    const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, r, 8, false), mat);
    m.castShadow = true; parent.add(m); return m;
  }
  function buildUte() {
    const ute = new THREE.Group();
    const body = new THREE.Group(); ute.add(body); // body bobs on suspension
    const W = 1.62;
    // chassis + cab (single cab 80s Japanese ute)
    box(W, 0.18, 4.5, M.black, 0, 0.42, -1.0, body);                    // chassis rail / sill
    box(W, 0.5, 1.6, M.white, 0, 0.78, -2.75, body);                    // front guards + bonnet block
    const bon = box(W - 0.04, 0.02, 1.55, M.bonnet, 0, 1.04, -2.75, body); bon.castShadow = false;
    box(W, 0.95, 1.25, M.white, 0, 1.0, -1.4, body);                    // cab
    box(W - 0.06, 0.5, 0.02, M.glass, 0, 1.25, -2.035, body).rotation.x = -0.35;  // windscreen
    box(0.02, 0.42, 0.9, M.glass, W / 2 + 0.005, 1.25, -1.45, body);    // side windows
    box(0.02, 0.42, 0.9, M.glass, -W / 2 - 0.005, 1.25, -1.45, body);
    box(W - 0.2, 0.38, 0.02, M.glass, 0, 1.25, -0.77, body);            // rear window
    box(W + 0.005, 0.12, 2.9, M.black, 0, 0.72, -2.05, body);           // black side stripe
    box(0.7, 0.03, 0.05, M.black, 0.45, 1.05, -2.1, body);              // wiper
    // grille + lights + bull bar
    box(W - 0.3, 0.28, 0.04, M.black, 0, 0.78, -3.56, body);
    box(0.28, 0.16, 0.04, M.headlight, -0.6, 0.82, -3.57, body);
    box(0.28, 0.16, 0.04, M.headlight, 0.6, 0.82, -3.57, body);
    box(W + 0.06, 0.16, 0.12, M.chrome, 0, 0.52, -3.62, body);          // bumper
    const plateF = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.12), M.plate); plateF.position.set(0.15, 0.52, -3.69); plateF.rotation.y = Math.PI; body.add(plateF);
    [[-0.7], [-0.25], [0.25], [0.7]].forEach(([x]) => tube([[x, 0.45, -3.6], [x, 0.85, -3.75], [x, 1.0, -3.7]], 0.035, M.chrome, body));
    tube([[-0.75, 1.0, -3.7], [0, 1.02, -3.75], [0.75, 1.0, -3.7]], 0.04, M.chrome, body);
    tube([[-0.8, 0.75, -3.72], [0, 0.78, -3.8], [0.8, 0.75, -3.72]], 0.04, M.chrome, body);
    // flat deck
    box(W + 0.14, 0.08, 2.15, M.dirty, 0, 0.66, 0.35, body);
    const stripeL = box(0.02, 0.24, 2.15, M.stripes, -W / 2 - 0.08, 0.54, 0.35, body); stripeL.castShadow = false;
    const stripeR = box(0.02, 0.24, 2.15, M.stripes, W / 2 + 0.08, 0.54, 0.35, body); stripeR.castShadow = false;
    // headboard rail and deck rails
    tube([[-0.85, 0.7, -0.68], [-0.85, 1.2, -0.68], [0.85, 1.2, -0.68], [0.85, 0.7, -0.68]], 0.03, M.white, body);
    tube([[-0.85, 0.72, 1.3], [-0.85, 0.98, 1.3], [-0.85, 0.98, -0.6]], 0.025, M.white, body);
    // tailgate sign (the real Independent Roadmarkers board)
    box(W + 0.14, 0.62, 0.06, M.black, 0, 0.42, 1.45, body);
    const tg = new THREE.Mesh(new THREE.PlaneGeometry(1.12, 0.6), M.tailgate); tg.position.set(-0.24, 0.42, 1.485); body.add(tg);
    const plateR = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.12), M.plate); plateR.position.set(0.48, 0.62, 1.49); body.add(plateR);
    box(0.18, 0.08, 0.04, M.red, -0.72, 0.18, 1.47, body); box(0.18, 0.08, 0.04, M.red, 0.72, 0.62, 1.47, body);
    box(0.55, 0.05, 0.32, M.dirty, 0.1, 0.12, 1.55, body);               // rear step
    cyl(0.04, 0.04, 0.4, M.metal, -0.6, 0.14, 1.6, body).rotation.x = Math.PI / 2; // tow ball
    // paint tanks, pump, gauges
    const tankA = cyl(0.27, 0.27, 1.25, M.dirty, -0.2, 1.33, -0.25, body, 24);
    cyl(0.2, 0.27, 0.12, M.dirty, -0.2, 2.0, -0.25, body, 24);
    cyl(0.25, 0.25, 1.15, M.dirty, 0.38, 1.28, -0.3, body, 24);
    cyl(0.18, 0.25, 0.1, M.dirty, 0.38, 1.9, -0.3, body, 24);
    box(0.6, 0.36, 0.5, M.metal, -0.45, 0.88, 0.55, body);               // compressor engine
    box(0.45, 0.22, 0.12, M.white, -0.35, 1.15, 0.3, body);              // gauge panel
    for (let i = 0; i < 3; i++) cyl(0.04, 0.04, 0.03, M.black, -0.5 + i * 0.12, 1.2, 0.37, body).rotation.x = Math.PI / 2;
    cyl(0.1, 0.1, 0.2, M.metal, -0.1, 0.84, 0.75, body);                 // air receiver
    // cone stack + boxes on deck
    for (let i = 0; i < 4; i++) cyl(0.05, 0.22, 0.12, M.cone, 0.45, 0.75 + i * 0.05, 0.75, body, 14);
    cyl(0.04, 0.22, 0.6, M.cone, 0.45, 1.05, 0.75, body, 14);
    box(0.3, 0.25, 0.3, M.metal, 0.5, 0.82, 0.25, body);
    // boom arm (gun swing arm) from rear-left post
    cyl(0.05, 0.05, 1.7, M.white, -0.7, 1.55, 1.1, body);
    tube([[-0.7, 2.35, 1.1], [-0.55, 2.55, 0.6], [-0.2, 2.25, -0.1]], 0.06, M.hose, body);
    tube([[-0.2, 2.0, -0.25], [0.3, 1.7, 0.2], [0.8, 0.6, 1.2], [1.05, 0.25, 1.25]], 0.035, M.hose, body); // paint line to gun
    // roof sign frame + beacons
    tube([[-0.75, 1.48, -1.1], [-0.75, 2.0, -1.1]], 0.025, M.white, body);
    tube([[0.75, 1.48, -1.1], [0.75, 2.0, -1.1]], 0.025, M.white, body);
    box(1.4, 0.06, 0.06, M.white, 0, 1.6, -1.1, body);
    const sign = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.6, 0.03), [M.white, M.white, M.white, M.white, M.sign, M.sign]);
    sign.position.set(0, 1.95, -1.1); sign.castShadow = true; body.add(sign);
    const bL = cyl(0.08, 0.09, 0.16, M.amber, -0.72, 2.34, -1.1, body, 16);
    const bR = cyl(0.08, 0.09, 0.16, M.amber2, 0.72, 2.34, -1.1, body, 16);
    const glowMat = new THREE.SpriteMaterial({ map: T.glow, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    const gL = new THREE.Sprite(glowMat); gL.scale.set(0.6, 0.6, 1); bL.add(gL);
    const gR = new THREE.Sprite(glowMat.clone()); gR.scale.set(0.6, 0.6, 1); bR.add(gR);
    // side wire brush (sweeps the line before painting)
    const brush = new THREE.Mesh(new THREE.CircleGeometry(0.28, 28), M.brush);
    brush.position.set(W / 2 + 0.12, 0.28, -0.75); brush.rotation.y = Math.PI / 2; body.add(brush);
    // gun outrigger on the right, behind the rear wheel
    box(0.4, 0.05, 0.05, M.metal, 0.9, 0.3, 1.2, body);
    const gun = cyl(0.05, 0.03, 0.16, M.metal, GUN_LAT, 0.2, 1.2, body, 12);
    const nozzle = cyl(0.015, 0.015, 0.08, M.black, GUN_LAT, 0.08, 1.2, body, 8);
    // wheels
    const wheels = [];
    [[-0.74, -2.6], [0.74, -2.6], [-0.74, 0], [0.74, 0]].forEach(([x, z]) => {
      const wg = new THREE.Group(); wg.position.set(x, 0.33, z);
      const tyre = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.2, 24), M.tyre); tyre.rotation.z = Math.PI / 2; tyre.castShadow = true;
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.21, 6), M.rim); rim.rotation.z = Math.PI / 2;
      wg.add(tyre); wg.add(rim); ute.add(wg); wheels.push(wg);
    });
    box(W + 0.04, 0.3, 0.6, M.white, 0, 0.62, -2.6, body).visible = false; // spare guard volume for shadows
    return { group: ute, body, wheels, brush, beacons: [bL, bR], glows: [gL, gR], nozzle, gun, tankA };
  }

  // ---------- other road users ----------
  const CAR_COLOURS = [0x8e1b1b, 0x22406a, 0xc9c6bd, 0x2f5b35, 0x111214, 0x7d6c4f, 0xd8d2c0];
  function buildCar() {
    const g = new THREE.Group();
    const col = new THREE.MeshStandardMaterial({ color: CAR_COLOURS[Math.floor(rnd() * CAR_COLOURS.length)], roughness: .35, metalness: .4 });
    const isVan = rnd() < .3;
    box(1.72, 0.62, isVan ? 4.8 : 4.3, col, 0, 0.62, 0, g);
    if (isVan) box(1.68, 0.9, 3.4, col, 0, 1.35, 0.5, g); else box(1.5, 0.5, 2.1, col, 0, 1.15, 0.25, g);
    box(1.52, 0.4, 0.04, M.glass, 0, isVan ? 1.45 : 1.15, isVan ? -1.22 : -0.83, g);
    box(0.3, 0.14, 0.04, M.headlight, -0.6, 0.7, -2.16 - (isVan ? .25 : 0), g);
    box(0.3, 0.14, 0.04, M.headlight, 0.6, 0.7, -2.16 - (isVan ? .25 : 0), g);
    [[-0.78, -1.35], [0.78, -1.35], [-0.78, 1.35], [0.78, 1.35]].forEach(([x, z]) => {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.2, 16), M.tyre); t.rotation.z = Math.PI / 2; t.position.set(x, 0.32, z); g.add(t);
    });
    return g;
  }
  function buildCone() {
    const g = new THREE.Group();
    cyl(0.05, 0.19, 0.7, M.cone, 0, 0.37, 0, g, 18);
    cyl(0.1, 0.13, 0.12, M.coneBand, 0, 0.45, 0, g, 18);
    box(0.42, 0.04, 0.42, M.cone, 0, 0.02, 0, g);
    return g;
  }

  // ---------- world ----------
  function ribbon(s0, s1, step, latA, latB, y, vScale, mat) {
    const pos = [], uv = [], idx = [];
    let n = 0;
    for (let s = s0; s <= s1 + 0.001; s += step) {
      const a = pt(s, latA, y), b = pt(s, latB, y);
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
      uv.push(0, s / vScale, 1, s / vScale);
      if (n) { const k = (n - 1) * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
      n++;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx); geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat); m.receiveShadow = true; return m;
  }
  function quadStrip(quads, mat) { // quads: [s0, s1, latA, latB, y, shade]
    const pos = [], col = [], idx = [];
    let v = 0;
    const p = new THREE.Vector3();
    quads.forEach(q => {
      const c = q[5];
      [[q[0], q[2]], [q[0], q[3]], [q[1], q[2]], [q[1], q[3]]].forEach(([s, l]) => { pt(s, l, q[4], p); pos.push(p.x, p.y, p.z); col.push(c, c, c); });
      idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2); v += 4;
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx); geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat); m.receiveShadow = true; return m;
  }
  function instanced(geo, mat, list, shadow) { // list of {p, ry, s:[x,y,z]}
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    const o = new THREE.Object3D();
    list.forEach((it, i) => {
      o.position.copy(it.p); o.rotation.set(0, it.ry || 0, 0);
      const sc = it.s || [1, 1, 1]; o.scale.set(sc[0], sc[1], sc[2]);
      o.updateMatrix(); im.setMatrixAt(i, o.matrix);
    });
    im.castShadow = !!shadow; im.receiveShadow = true;
    return im;
  }
  function buildMountain() {
    const geo = new THREE.ConeGeometry(4200, 2500, 96, 24, true);
    const pos = geo.attributes.position, col = [];
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const t = (v.y + 1250) / 2500; // 0 base, 1 peak
      const a = Math.atan2(v.z, v.x);
      const ridge = 1 + 0.06 * Math.sin(a * 9) + 0.04 * Math.sin(a * 23 + 1) + 0.03 * Math.sin(a * 41);
      v.x *= ridge; v.z *= ridge;
      v.y = (Math.pow(t, 1.6)) * 2500 - 1250; // concave volcano profile
      pos.setXYZ(i, v.x, v.y, v.z);
      const snowLine = 0.6 + 0.07 * Math.sin(a * 13) + 0.05 * Math.sin(a * 5 + 2);
      if (t > snowLine) col.push(.86, .89, .94); else if (t > snowLine - .07) col.push(.5, .55, .62); else col.push(.24 + t * .22, .33 + t * .2, .4 + t * .2);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, fog: false, flatShading: true, color: 0xb4c0cc }));
    return m;
  }
  function buildSky() {
    const geo = new THREE.SphereGeometry(45000, 32, 16);
    const pos = geo.attributes.position, col = [];
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / 45000;
      const t = clamp(y * 3, 0, 1);
      col.push(lerp(.78, .22, t), lerp(.86, .46, t), lerp(.93, .86, t));
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  }

  // ---------- the game ----------
  let G = null; // live game instance

  function createGame(root, onExit) {
    seed = 662;
    makeTextures(); makeMaterials();
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', logarithmicDepthBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    T.road.anisotropy = T.grass.anisotropy = renderer.capabilities.getMaxAnisotropy();
    root.querySelector('.u3-canvas').appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0xc9d8e6, 120, 1300);
    const camera = new THREE.PerspectiveCamera(58, 1, 0.2, 60000);
    scene.add(new THREE.HemisphereLight(0xcfe3ff, 0x5a6b3a, 0.75));
    const sun = new THREE.DirectionalLight(0xfff1d8, 2.2);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 200 });
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
    scene.add(sun); scene.add(sun.target);

    // sky, mountain, ground
    scene.add(buildSky());
    const endP = sample(ROAD_LEN);
    const mtn = buildMountain();
    mtn.position.set(endP.x + 4000, 1250 - 60, endP.z - 26000); scene.add(mtn);
    const mid = sample(ROAD_LEN / 2);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), M.grass);
    ground.rotation.x = -Math.PI / 2; ground.position.set(mid.x, 0, mid.z); ground.receiveShadow = true;
    M.grass.polygonOffset = true; M.grass.polygonOffsetFactor = 2; M.grass.polygonOffsetUnits = 4;
    T.grass.repeat.set(1400, 1400); scene.add(ground);

    // road, shoulders
    scene.add(ribbon(-40, ROAD_LEN, 2, -ROAD_W / 2, ROAD_W / 2, 0.04, 8, M.road));
    T.gravel.repeat.set(1, 1);
    scene.add(ribbon(-40, ROAD_LEN, 2, -ROAD_W / 2 - 1.3, -ROAD_W / 2, 0.018, 3, M.gravel));
    scene.add(ribbon(-40, ROAD_LEN, 2, ROAD_W / 2, ROAD_W / 2 + 1.3, 0.018, 3, M.gravel));

    // faded old centre line dashes (the target)
    const dashes = [], oldQuads = [];
    for (let s = DASH_START; s < JOB_LEN + DASH_START; s += DASH_EVERY) {
      const wear = 0.62 + rnd() * 0.22;
      dashes.push({ s0: s, s1: s + DASH_ON, cover: 0, done: false });
      // break each worn dash into patchy pieces
      for (let k = 0; k < DASH_ON; k += 0.5) if (rnd() > 0.1) oldQuads.push([s + k, s + k + 0.5, -0.05, 0.05, 0.045, wear * (0.8 + rnd() * .4)]);
    }
    scene.add(quadStrip(oldQuads, M.oldPaint));

    // fresh paint buffer
    const MAXQ = 9000;
    const paintPos = new Float32Array(MAXQ * 18);
    const paintGeo = new THREE.BufferGeometry();
    paintGeo.setAttribute('position', new THREE.BufferAttribute(paintPos, 3));
    paintGeo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(MAXQ * 18).map((_, i) => i % 3 === 1 ? 1 : 0), 3));
    paintGeo.setDrawRange(0, 0);
    const paintMesh = new THREE.Mesh(paintGeo, M.paint); paintMesh.frustumCulled = false; paintMesh.receiveShadow = true;
    scene.add(paintMesh);
    let paintQ = 0;
    function addPaint(sA, latA, sB, latB) {
      if (paintQ >= MAXQ) return;
      const w = 0.05, y = 0.055;
      const c = [pt(sA, latA - w, y), pt(sA, latA + w, y), pt(sB, latB - w, y), pt(sB, latB + w, y)];
      const o = paintQ * 18;
      [c[0], c[1], c[2], c[1], c[3], c[2]].forEach((p, i) => { paintPos[o + i * 3] = p.x; paintPos[o + i * 3 + 1] = p.y; paintPos[o + i * 3 + 2] = p.z; });
      paintQ++; paintGeo.attributes.position.needsUpdate = true; paintGeo.setDrawRange(0, paintQ * 6);
    }

    // roadside: fence posts + wires, power poles, hedges, trees, cows, signs
    const posts = [], wireV = [], poles = [], arms = [], trees = [], trunks = [], pines = [], hedges = [], cowsB = [], cowsW = [];
    const P = new THREE.Vector3();
    for (let s = -30; s < ROAD_LEN; s += 4) {
      [-10, 10].forEach(l => posts.push({ p: pt(s, l, 0.55), ry: -sample(s).h }));
      [-10, 10].forEach(l => [0.45, 0.8, 1.05].forEach(h => { const a = pt(s, l, h), b = pt(s + 4, l, h); wireV.push(a.x, a.y, a.z, b.x, b.y, b.z); }));
    }
    for (let s = -20; s < ROAD_LEN; s += 48) {
      poles.push({ p: pt(s, -7.5, 4.6), ry: -sample(s).h });
      arms.push({ p: pt(s, -7.5, 8.6), ry: -sample(s).h });
      if (s + 48 < ROAD_LEN) [-8.6, -6.4].forEach(l => { const a = pt(s, l, 8.65), b = pt(s + 48, l, 8.65); wireV.push(a.x, a.y, a.z, b.x, b.y, b.z); });
    }
    for (let s = 0; s < ROAD_LEN; s += 3.5) {
      const zone = Math.sin(s / 140) + Math.sin(s / 53);
      if (zone > 0.4) hedges.push({ p: pt(s, 13, 1.4), ry: -sample(s).h, s: [2.6 + rnd(), 2.4 + rnd() * 1.4, 4] });
      if (zone < -0.9) hedges.push({ p: pt(s, -14, 1.2), ry: -sample(s).h, s: [2.2, 2 + rnd() * 1.4, 4] });
    }
    for (let i = 0; i < 520; i++) {
      const s = rnd() * ROAD_LEN, side = rnd() < .5 ? -1 : 1, l = side * (18 + Math.pow(rnd(), 1.5) * 380);
      const sc = 0.7 + rnd() * 1.2;
      if (rnd() < .45) pines.push({ p: pt(s, l, 5 * sc), ry: rnd() * 6, s: [sc, sc, sc] });
      else { trees.push({ p: pt(s, l, 4.2 * sc), ry: rnd() * 6, s: [sc * (1 + rnd() * .4), sc, sc] }); trunks.push({ p: pt(s, l, 1.2 * sc), s: [sc, sc, sc] }); }
    }
    // shelter belt rows of pines (Taranaki farm style)
    for (let r = 0; r < 6; r++) {
      const s0 = 150 + r * 400, side = r % 2 ? 1 : -1;
      for (let k = 0; k < 40; k++) pines.push({ p: pt(s0 + k * 0.1, side * (40 + k * 6), 7), ry: k, s: [1.1, 1.3 + rnd() * .3, 1.1] });
    }
    for (let i = 0; i < 70; i++) {
      const s = 60 + rnd() * (ROAD_LEN - 60), l = (rnd() < .5 ? -1 : 1) * (16 + rnd() * 70);
      const ry = rnd() * 6, base = pt(s, l, 0.85);
      (rnd() < .6 ? cowsB : cowsW).push({ p: base, ry });
    }
    scene.add(instanced(new THREE.BoxGeometry(0.1, 1.1, 0.1), M.post, posts));
    scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(wireV, 3)), new THREE.LineBasicMaterial({ color: 0x55534d })));
    scene.add(instanced(new THREE.CylinderGeometry(0.13, 0.17, 9.2, 8), M.pole, poles, true));
    scene.add(instanced(new THREE.BoxGeometry(0.12, 0.12, 2.6).rotateY(Math.PI / 2), M.pole, arms));
    scene.add(instanced(new THREE.BoxGeometry(1, 1, 1), M.hedge, hedges, true));
    scene.add(instanced(new THREE.IcosahedronGeometry(3.4, 1), M.leaf, trees, true));
    scene.add(instanced(new THREE.CylinderGeometry(0.25, 0.35, 2.4, 6), M.trunk, trunks));
    scene.add(instanced(new THREE.ConeGeometry(2.6, 10, 7), M.pine, pines, true));
    const cowGeo = new THREE.BoxGeometry(0.75, 0.75, 1.7);
    scene.add(instanced(cowGeo, M.cowB, cowsB, true));
    scene.add(instanced(cowGeo, M.cowW, cowsW, true));
    const cowHeads = cowsB.concat(cowsW).map(c => ({ p: new THREE.Vector3(c.p.x - Math.sin(c.ry) * 0.95, 1.05, c.p.z - Math.cos(c.ry) * 0.95), ry: c.ry }));
    scene.add(instanced(new THREE.BoxGeometry(0.4, 0.4, 0.5), M.cowB, cowHeads));
    // ROAD MARKING warning signs at the start and halfway
    [12, 1000].forEach(s => {
      const sg = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.3), M.roadworks);
      pt(s, -4.9, 1.9, sg.position); sg.rotation.y = -sample(s).h; scene.add(sg);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.4, 6), M.metal); pt(s, -4.9, 0.7, post.position); scene.add(post);
    });
    // farm house near the start
    const house = new THREE.Group();
    box(9, 3, 7, new THREE.MeshStandardMaterial({ color: 0xe6e0d0, roughness: .8 }), 0, 1.5, 0, house);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(6.6, 2.4, 4), new THREE.MeshStandardMaterial({ color: 0x8b2b22, roughness: .6 }));
    roof.position.y = 4.2; roof.rotation.y = Math.PI / 4; roof.scale.set(1, 1, 0.8); roof.castShadow = true; house.add(roof);
    pt(70, -32, 0, house.position); house.rotation.y = -sample(70).h; scene.add(house);

    // the ute
    const U = buildUte(); scene.add(U.group);

    // spray mist particles
    const NP = 240, pPos = new Float32Array(NP * 3), pVel = new Float32Array(NP * 3), pLife = new Float32Array(NP);
    const mistGeo = new THREE.BufferGeometry(); mistGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    const mist = new THREE.Points(mistGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.035, transparent: true, opacity: 0.8, depthWrite: false }));
    mist.frustumCulled = false; scene.add(mist);
    let pNext = 0;

    // hazards
    const cones = [];
    for (let s = 140; s < JOB_LEN; s += 110 + rnd() * 140) {
      const c = buildCone(); const lat = -1.05 + (rnd() - .5) * 0.9;
      pt(s, lat, 0, c.position); scene.add(c);
      cones.push({ g: c, s, lat, hit: false, vel: new THREE.Vector3(), spin: new THREE.Vector3() });
    }
    const cars = [];

    // ---------- state ----------
    const S = {
      state: 'title', t: 0, s: 0, off: -1.05, offVel: 0, speed: 0, speedTarget: 4.2,
      spraying: false, good: 0, waste: 0, litres: TANK_L, score: 0, combo: 1, bestCombo: 1,
      conesHit: 0, perfect: 0, missed: 0, nextCar: 6, cam: 0, gunLatPrev: 0, gunSPrev: 0, hasPrev: false, shake: 0
    };
    const input = { left: false, right: false, spray: false, up: false, down: false };

    // ---------- audio ----------
    let A = null;
    function initAudio() {
      if (A) return;
      try {
        const ac = new (window.AudioContext || window.webkitAudioContext)();
        const master = ac.createGain(); master.gain.value = store.get('ute3dMute', false) ? 0 : 0.9; master.connect(ac.destination);
        const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380; lp.connect(master);
        const eg = ac.createGain(); eg.gain.value = 0.07; eg.connect(lp);
        const o1 = ac.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 42; o1.connect(eg); o1.start();
        const o2 = ac.createOscillator(); o2.type = 'square'; o2.frequency.value = 84; const g2 = ac.createGain(); g2.gain.value = .35; o2.connect(g2); g2.connect(eg); o2.start();
        const buf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate); const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        const ns = ac.createBufferSource(); ns.buffer = buf; ns.loop = true;
        const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3200; bp.Q.value = .7;
        const sg = ac.createGain(); sg.gain.value = 0; ns.connect(bp); bp.connect(sg); sg.connect(master); ns.start();
        // compressor chug
        const cg = ac.createGain(); cg.gain.value = .03; const co = ac.createOscillator(); co.type = 'triangle'; co.frequency.value = 23; co.connect(cg); cg.connect(lp); co.start();
        A = { ac, master, o1, o2, sg, buf };
      } catch (e) { A = null; }
    }
    function blip(freq, dur, type, vol) {
      if (!A) return;
      const o = A.ac.createOscillator(), g = A.ac.createGain(); o.type = type || 'sine'; o.frequency.value = freq;
      g.gain.setValueAtTime(vol || .12, A.ac.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, A.ac.currentTime + dur);
      o.connect(g); g.connect(A.master); o.start(); o.stop(A.ac.currentTime + dur);
    }
    function thud() {
      if (!A) return;
      const s = A.ac.createBufferSource(); s.buffer = A.buf; const f = A.ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 300;
      const g = A.ac.createGain(); g.gain.setValueAtTime(.6, A.ac.currentTime); g.gain.exponentialRampToValueAtTime(0.001, A.ac.currentTime + .3);
      s.connect(f); f.connect(g); g.connect(A.master); s.start(); s.stop(A.ac.currentTime + .3);
    }
    function horn() { blip(392, .55, 'square', .06); blip(494, .55, 'square', .05); }

    // ---------- HUD ----------
    const $ = sel => root.querySelector(sel);
    const hud = { score: $('.u3-score'), combo: $('.u3-combo'), prog: $('.u3-prog i'), dist: $('.u3-dist'), speed: $('.u3-speed'), paint: $('.u3-paint i'), litres: $('.u3-litres'), acc: $('.u3-acc'), aim: $('.u3-aim i'), pop: $('.u3-pop') };
    let popT = 0;
    function pop(text, cls) { hud.pop.textContent = text; hud.pop.className = 'u3-pop show ' + (cls || ''); popT = 1.1; }
    function showPanel(name) { root.querySelectorAll('.u3-panel').forEach(p => p.hidden = p.dataset.panel !== name); root.querySelector('.u3-hud').hidden = name !== 'play'; }

    function resize() {
      const w = root.clientWidth, h = root.clientHeight;
      renderer.setSize(w, h, false); renderer.domElement.style.width = w + 'px'; renderer.domElement.style.height = h + 'px';
      camera.aspect = w / h; camera.fov = w < h ? 68 : 55; camera.updateProjectionMatrix();
    }
    window.addEventListener('resize', resize); resize();

    function reset() {
      Object.assign(S, { state: 'count', t: 0, s: 0, off: -1.05, offVel: 0, speed: 0, speedTarget: 4.2, spraying: false, good: 0, waste: 0, litres: TANK_L, score: 0, combo: 1, bestCombo: 1, conesHit: 0, perfect: 0, missed: 0, nextCar: 5, hasPrev: false, countdown: 3.2 });
      dashes.forEach(d => { d.cover = 0; d.done = false; });
      paintQ = 0; paintGeo.setDrawRange(0, 0);
      cones.forEach(c => { c.hit = false; pt(c.s, c.lat, 0, c.g.position); c.g.rotation.set(0, 0, 0); });
      cars.forEach(c => scene.remove(c.g)); cars.length = 0;
      showPanel('play'); initAudio(); if (A && A.ac.state === 'suspended') A.ac.resume();
    }

    function finish(crashed) {
      S.state = 'over'; S.spraying = false;
      const passed = dashes.filter(d => d.s1 < S.s + 0.01);
      const cover = passed.length ? passed.reduce((a, d) => a + Math.min(d.cover, DASH_ON), 0) / (passed.length * DASH_ON) : 0;
      const acc = S.good + S.waste > 0 ? S.good / (S.good + S.waste) : 0;
      let stars = 0; if (!crashed) stars = cover > .9 && acc > .85 ? 3 : cover > .75 && acc > .7 ? 2 : cover > .5 ? 1 : 0;
      const final = Math.max(0, Math.round(S.score + (crashed ? 0 : stars * 1000)));
      const best = store.get('ute3dBest', 0); if (final > best) store.set('ute3dBest', final);
      $('.u3-end-title').textContent = crashed ? 'Head-on. Job abandoned.' : 'Job complete';
      $('.u3-end-stars').textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
      $('.u3-end-stats').innerHTML =
        `<div><span>Score</span><b>${final.toLocaleString('en-NZ')}</b></div>` +
        `<div><span>Line covered</span><b>${Math.round(cover * 100)}%</b></div>` +
        `<div><span>Accuracy</span><b>${Math.round(acc * 100)}%</b></div>` +
        `<div><span>Paint used</span><b>${(TANK_L - S.litres).toFixed(1)} L</b></div>` +
        `<div><span>Perfect dashes</span><b>${S.perfect}</b></div>` +
        `<div><span>Cones hit</span><b>${S.conesHit}</b></div>`;
      $('.u3-end-best').textContent = 'Best on this phone: ' + Math.max(best, final).toLocaleString('en-NZ');
      showPanel('end');
      if (crashed) thud(); else { blip(523, .2); setTimeout(() => blip(659, .2), 150); setTimeout(() => blip(784, .35), 300); }
    }

    // ---------- update ----------
    const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
    let camInit = false;
    function update(dt) {
      S.t += dt;
      const playing = S.state === 'play';
      if (S.state === 'count') {
        S.countdown -= dt;
        const n = Math.ceil(S.countdown);
        if (n !== S.lastN) { S.lastN = n; if (n > 0) { pop(String(n)); blip(440, .15); } else { pop('PAINT!', 'good'); blip(880, .3); } }
        if (S.countdown <= 0) { S.state = 'play'; }
      }
      if (playing || S.state === 'count') {
        // speed
        if (input.up) S.speedTarget = Math.min(11.1, S.speedTarget + dt * 3);
        if (input.down) S.speedTarget = Math.max(1.4, S.speedTarget - dt * 3);
      }
      const targetSpeed = playing ? S.speedTarget : 0;
      S.speed = lerp(S.speed, targetSpeed, Math.min(1, dt * 1.2));
      // steering with crosswind + camber drift
      const steer = playing ? (input.right ? 1 : 0) - (input.left ? 1 : 0) : 0;
      S.offVel = lerp(S.offVel, steer * 1.5, Math.min(1, dt * 5));
      const drift = playing ? (0.22 * Math.sin(S.t * 0.6) + 0.14 * Math.sin(S.t * 1.7 + 2) + 0.06 * Math.sin(S.t * 4.1)) * clamp(S.speed / 5, 0, 1.8) : 0;
      S.off = clamp(S.off + (S.offVel + drift) * dt, -4.6, 4.2);
      S.s += S.speed * dt;
      if (Math.abs(S.off) > ROAD_W / 2 - 0.8) S.shake = 0.03; else S.shake *= 0.9;

      // place ute
      const r = sample(S.s);
      const latV = S.offVel + drift;
      const yaw = r.h + Math.atan2(latV, Math.max(S.speed, 0.5)) * 0.8;
      pt(S.s, S.off, 0, U.group.position);
      U.group.rotation.y = -yaw;
      U.body.position.y = Math.sin(S.t * 13) * 0.006 * S.speed / 4 + (Math.random() - .5) * S.shake;
      U.body.rotation.z = -latV * 0.02;
      U.wheels.forEach(w => { w.rotation.x -= S.speed * dt / 0.33; });
      U.brush.rotation.z += dt * 14;
      const blink = S.t * 7;
      U.beacons.forEach((b, i) => { const k = Math.max(0, Math.sin(blink + i * Math.PI)); b.material.emissiveIntensity = 0.2 + k * 2.2; U.glows[i].material.opacity = k; });

      // gun world position (rear right outrigger)
      const gunS = S.s - 1.2 * Math.cos(yaw - r.h) + 0, gunLat = S.off + GUN_LAT * Math.cos(yaw - r.h) - 1.2 * Math.sin(yaw - r.h) * 0;
      const canSpray = playing && input.spray && S.litres > 0;
      if (canSpray && !S.spraying) blip(180, .08, 'triangle', .05);
      S.spraying = canSpray;
      if (A) { A.o1.frequency.value = 38 + S.speed * 6; A.o2.frequency.value = 76 + S.speed * 12; A.sg.gain.value = S.spraying ? .12 : 0; }

      if (S.spraying) {
        const ds = S.hasPrev ? gunS - S.gunSPrev : 0;
        if (S.hasPrev && ds > 0.001) {
          addPaint(S.gunSPrev, S.gunLatPrev, gunS, gunLat);
          S.litres = Math.max(0, S.litres - ds * L_PER_M);
          const rel = gunS - DASH_START;
          const k = Math.floor(rel / DASH_EVERY), inDash = rel >= 0 && (rel % DASH_EVERY) < DASH_ON && k < dashes.length;
          const onLine = Math.abs(gunLat) < 0.075;
          if (inDash && onLine) { S.good += ds; dashes[k].cover += ds; S.score += ds * 10 * S.combo; }
          else { S.waste += ds; S.score -= ds * (inDash ? 6 : 14); }
        }
        S.gunSPrev = gunS; S.gunLatPrev = gunLat; S.hasPrev = true;
        // mist
        const np = U.nozzle.getWorldPosition(tmp);
        for (let e = 0; e < 6; e++) {
          const i = pNext; pNext = (pNext + 1) % NP;
          pPos[i * 3] = np.x; pPos[i * 3 + 1] = np.y - 0.03; pPos[i * 3 + 2] = np.z;
          pVel[i * 3] = (Math.random() - .5) * .5; pVel[i * 3 + 1] = -1.5 - Math.random(); pVel[i * 3 + 2] = (Math.random() - .5) * .5;
          pLife[i] = 0.12 + Math.random() * .1;
        }
      } else S.hasPrev = false;
      for (let i = 0; i < NP; i++) {
        if (pLife[i] > 0) {
          pLife[i] -= dt;
          pPos[i * 3] += pVel[i * 3] * dt; pPos[i * 3 + 1] = Math.max(0.04, pPos[i * 3 + 1] + pVel[i * 3 + 1] * dt); pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
          if (pLife[i] <= 0) pPos[i * 3 + 1] = -10;
        }
      }
      mistGeo.attributes.position.needsUpdate = true;

      // grade dashes once the gun passes them
      if (playing) for (const d of dashes) {
        if (d.done || d.s1 > gunS - 0.2) { if (d.s0 > gunS) break; continue; }
        d.done = true;
        const c = d.cover / DASH_ON;
        if (c > 0.88) { S.perfect++; S.combo = Math.min(8, S.combo + 1); S.bestCombo = Math.max(S.bestCombo, S.combo); S.score += 100 * S.combo * (0.6 + S.speed / 7); pop(S.combo > 2 ? 'PERFECT ×' + S.combo : 'PERFECT', 'good'); blip(660 + S.combo * 60, .12); }
        else if (c > 0.5) { S.score += 40; pop('GOOD'); }
        else { S.missed++; if (S.combo > 1) pop('MISSED', 'bad'); S.combo = 1; }
      }

      // cones: hit by the ute body?
      const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
      for (const c of cones) {
        if (c.hit) {
          c.vel.y -= 9.8 * dt; c.g.position.addScaledVector(c.vel, dt);
          c.g.rotation.x += c.spin.x * dt; c.g.rotation.z += c.spin.z * dt;
          if (c.g.position.y < 0) { c.g.position.y = 0; c.vel.multiplyScalar(0.4); c.vel.y = Math.abs(c.vel.y) * 0.3; c.spin.multiplyScalar(0.5); }
          continue;
        }
        const ds = c.s - S.s, dl = c.lat - S.off;
        if (playing && ds > -1.6 && ds < 3.7 && Math.abs(dl) < 0.95) {
          c.hit = true; S.conesHit++; S.combo = 1; S.score -= 250; S.shake = 0.06; pop('CONE! −250', 'bad'); thud();
          c.vel.set(sinY * S.speed * 1.4 + (Math.random() - .5) * 2, 3 + S.speed * .3, -cosY * S.speed * 1.4 + (Math.random() - .5) * 2);
          c.spin.set((Math.random() - .5) * 12, 0, (Math.random() - .5) * 12);
        }
      }

      // oncoming traffic (NZ: they drive on the left, so they come at you in the right lane)
      if (playing) {
        S.nextCar -= dt;
        if (S.nextCar <= 0 && S.s < JOB_LEN - 150) {
          const g = buildCar(); scene.add(g);
          cars.push({ g, s: S.s + 330, lat: 1.85 + (rnd() - .5) * .3, v: 15 + rnd() * 6, honked: false });
          S.nextCar = 5 + rnd() * 9;
        }
      }
      for (let i = cars.length - 1; i >= 0; i--) {
        const c = cars[i];
        const near = c.s - S.s;
        // drivers ease off and move over a little near the work vehicle
        const want = near < 60 && near > -10 ? 2.25 : 1.85;
        c.lat = lerp(c.lat, want, dt * 1.5);
        const v = near < 50 && near > 0 ? Math.max(9, c.v * 0.7) : c.v;
        c.s -= v * dt;
        const rc = sample(c.s); pt(c.s, c.lat, 0, c.g.position); c.g.rotation.y = -(rc.h + Math.PI);
        c.g.children.forEach(ch => { if (ch.geometry && ch.geometry.type === 'CylinderGeometry') ch.rotation.x += v * dt / .32; });
        if (playing && Math.abs(near + 1.3) < 3.6) {
          const uteRight = S.off + 0.85, carLeft = c.lat - 0.9;
          if (uteRight > carLeft) { finish(true); }
          else if (!c.honked && uteRight > carLeft - 0.5) { c.honked = true; horn(); pop('TOOT TOOT', 'bad'); }
        }
        if (c.s < S.s - 60) { scene.remove(c.g); cars.splice(i, 1); }
      }

      // paint tank empty / job complete
      if (playing && S.litres <= 0 && !S.emptyWarned) { S.emptyWarned = true; pop('TANK EMPTY', 'bad'); }
      if (playing && gunS > JOB_LEN + DASH_START + 5) finish(false);

      // sun follows the ute so shadows stay sharp
      sun.position.set(U.group.position.x + 35, 60, U.group.position.z + 20);
      sun.target.position.copy(U.group.position);

      // cameras
      const fwd = tmp2.set(Math.sin(yaw), 0, -Math.cos(yaw));
      const right = new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw));
      const up = U.group.position;
      let cp, cl, k = 4;
      if (S.state === 'title' || S.state === 'over') { // slow orbit
        const a = S.t * 0.25;
        cp = up.clone().add(new THREE.Vector3(Math.cos(a) * 8, 2.6, Math.sin(a) * 8));
        cl = up.clone().add(new THREE.Vector3(0, 1, 0)); k = 2;
      } else if (S.cam === 0) { // chase
        cp = up.clone().addScaledVector(fwd, -9).addScaledVector(right, 1.2).add(new THREE.Vector3(0, 3.6, 0));
        cl = up.clone().addScaledVector(fwd, 7).addScaledVector(right, 0.6).add(new THREE.Vector3(0, 0.6, 0));
      } else if (S.cam === 1) { // gun cam: low over the outrigger, looking down the line
        cp = up.clone().addScaledVector(fwd, -4.2).addScaledVector(right, GUN_LAT + 1.1).add(new THREE.Vector3(0, 1.5, 0));
        cl = up.clone().addScaledVector(fwd, 4).addScaledVector(right, GUN_LAT).add(new THREE.Vector3(0, 0, 0)); k = 8;
      } else if (S.cam === 2) { // driver's seat (right-hand drive)
        cp = up.clone().addScaledVector(fwd, -1.45).addScaledVector(right, 0.38).add(new THREE.Vector3(0, 1.32, 0));
        cl = up.clone().addScaledVector(fwd, 20).addScaledVector(right, 0.3).add(new THREE.Vector3(0, 0.6, 0)); k = 20;
      } else { // roadside cinematic
        const ahead = Math.floor((S.s + 25) / 60) * 60 + 30;
        cp = pt(ahead, -6.5, 1.6, new THREE.Vector3());
        cl = up.clone().add(new THREE.Vector3(0, 1, 0)); k = 6;
      }
      if (!camInit) { camPos.copy(cp); camLook.copy(cl); camInit = true; }
      camPos.lerp(cp, Math.min(1, dt * k)); camLook.lerp(cl, Math.min(1, dt * k * 1.5));
      camera.position.copy(camPos); camera.position.y += (Math.random() - .5) * S.shake * 0.5;
      camera.lookAt(camLook);

      // HUD
      if (S.state === 'play' || S.state === 'count') {
        hud.score.textContent = Math.max(0, Math.round(S.score)).toLocaleString('en-NZ');
        hud.combo.textContent = S.combo > 1 ? '×' + S.combo : '';
        const done = clamp((gunS - DASH_START) / JOB_LEN, 0, 1);
        hud.prog.style.width = (done * 100) + '%';
        hud.dist.textContent = (done * JOB_LEN / 1000).toFixed(2) + ' / ' + (JOB_LEN / 1000).toFixed(1) + ' km';
        hud.speed.textContent = Math.round(S.speed * 3.6);
        hud.paint.style.width = (S.litres / TANK_L * 100) + '%';
        hud.litres.textContent = S.litres.toFixed(1) + ' L';
        hud.acc.textContent = S.good + S.waste > 0.5 ? Math.round(S.good / (S.good + S.waste) * 100) + '%' : '–';
        // aim meter: gun offset from line, ±0.6 m full scale
        const ahead = sample(gunS);
        hud.aim.style.left = (50 + clamp(gunLat / 0.6, -1, 1) * 50) + '%';
        hud.aim.className = Math.abs(gunLat) < 0.075 ? 'on' : '';
        void ahead;
      }
      if (popT > 0) { popT -= dt; if (popT <= 0) hud.pop.className = 'u3-pop'; }
    }

    // ---------- loop ----------
    let raf = 0, last = performance.now(), running = true;
    function frame(now) {
      if (!running) return;
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      update(dt);
      renderer.render(scene, camera);
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    function onVis() { if (document.hidden) { running = false; cancelAnimationFrame(raf); if (A) A.ac.suspend(); } else if (!running && G) { running = true; last = performance.now(); raf = requestAnimationFrame(frame); if (A) A.ac.resume(); } }
    document.addEventListener('visibilitychange', onVis);

    // ---------- controls ----------
    const keyMap = { ArrowLeft: 'left', a: 'left', A: 'left', '4': 'left', ArrowRight: 'right', d: 'right', D: 'right', '6': 'right', ' ': 'spray', '5': 'spray', ArrowUp: 'up', w: 'up', W: 'up', '8': 'up', ArrowDown: 'down', s: 'down', S: 'down', '2': 'down' };
    function onKey(e) {
      const down = e.type === 'keydown';
      if (down && (e.key === 'Escape')) { e.preventDefault(); return api.close(); }
      if (down && (e.key === 'c' || e.key === 'C' || e.key === '3')) { e.preventDefault(); return cycleCam(); }
      if (down && (e.key === 'Enter' || e.key === '=') && S.state !== 'play' && S.state !== 'count') { e.preventDefault(); return reset(); }
      const k = keyMap[e.key]; if (!k) return;
      e.preventDefault(); e.stopPropagation(); input[k] = down;
    }
    window.addEventListener('keydown', onKey, true); window.addEventListener('keyup', onKey, true);
    function cycleCam() { S.cam = (S.cam + 1) % 4; pop(['CHASE CAM', 'GUN CAM', 'CAB CAM', 'ROADSIDE CAM'][S.cam]); }
    root.querySelectorAll('[data-hold]').forEach(b => {
      const k = b.dataset.hold;
      const on = e => { e.preventDefault(); input[k] = true; b.classList.add('down'); try { b.setPointerCapture(e.pointerId); } catch (_) {} };
      const off = () => { input[k] = false; b.classList.remove('down'); };
      b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('lostpointercapture', off);
    });
    const clicks = {
      start: () => reset(), again: () => reset(), cam: cycleCam, exit: () => api.close(),
      mute: () => { const m = !store.get('ute3dMute', false); store.set('ute3dMute', m); if (A) A.master.gain.value = m ? 0 : .9; root.querySelector('[data-act="mute"]').textContent = m ? 'Sound: off' : 'Sound: on'; }
    };
    function onClick(e) { const b = e.target.closest('[data-act]'); if (b && clicks[b.dataset.act]) { e.preventDefault(); clicks[b.dataset.act](); } }
    root.addEventListener('click', onClick);
    root.querySelector('[data-act="mute"]').textContent = store.get('ute3dMute', false) ? 'Sound: off' : 'Sound: on';
    root.querySelector('.u3-best').textContent = 'Best on this phone: ' + store.get('ute3dBest', 0).toLocaleString('en-NZ');
    showPanel('title');

    const api = {
      close() {
        running = false; cancelAnimationFrame(raf);
        window.removeEventListener('resize', resize); window.removeEventListener('keydown', onKey, true); window.removeEventListener('keyup', onKey, true);
        document.removeEventListener('visibilitychange', onVis); root.removeEventListener('click', onClick);
        if (A) { try { A.ac.close(); } catch (e) {} }
        renderer.dispose(); renderer.domElement.remove();
        scene.traverse(o => { if (o.geometry) o.geometry.dispose(); });
        root.hidden = true; G = null;
        if (onExit) onExit();
      },
      _state: S
    };
    return api;
  }

  window.Ute3D = {
    open(onExit) {
      const root = document.getElementById('ute3d');
      if (!window.THREE) { if (onExit) onExit('Game engine did not load. Check the internet connection and try again.'); return; }
      if (G) return;
      root.hidden = false;
      try { G = createGame(root, onExit); } catch (e) { root.hidden = true; G = null; if (onExit) onExit('Game could not start on this device: ' + e.message); }
      try { if (root.requestFullscreen && matchMedia('(pointer: coarse)').matches) root.requestFullscreen().catch(() => {}); } catch (e) {}
    },
    get game() { return G; }
  };
})();
