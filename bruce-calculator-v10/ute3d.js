/* Line Painter 3D (v10) — Bruce's NY662 road marking ute, rebuilt from the side photo.
   Needs three.js r128 (global THREE). Exposes window.Ute3D.open(onExit). */
(function () {
  'use strict';
  const THREE = window.THREE;

  // ---------- job + road constants (metres) ----------
  let JOB_LEN = 2000;            // length of the current job (set per job)
  const ROAD_LEN = 2700;          // road built once, long enough for every job
  const ROAD_W = 7.6;            // seal width
  const DASH_START = 30, DASH_ON = 3, DASH_EVERY = 10; // NZ centre line: 3 m paint, 7 m gap
  const GUN_LAT = 1.05;          // gun outrigger, right of ute centre
  const TANK_L = 60;             // litres of paint on board
  const L_PER_M = 0.1 * 0.4;     // 100 mm wide x 400 µm wet = 0.04 L per metre
  const ON_LINE = 0.1;           // new 100 mm line still sits on the old 100 mm line
  const STRIP_BACK = 4, STRIP_AHEAD = 16; // timing strip window around the gun (m)

  // ---------- jobs ----------
  // Each quick call carries its own why + source so a wrong answer teaches the rule.
  // "check" marks rules still to be confirmed against the crew's own documents.
  const YEL_LAT = -0.2; // no-passing line: 100 mm wide, ~100 mm from the 100 mm centre line, on your side
  const JOBS = {
    remark: {
      id: 'remark', title: 'Fordell back road', tag: 'Re-mark', seal: 'old', len: 2000,
      brief: 'Re-mark 2 km of worn centre line. The old dashes show you where.',
      calls: [
        { at: 12, q: 'Rural centre line. What pattern are you re-marking?',
          options: ['3 m paint, 7 m gap', '1 m paint, 2 m gap', '10 m paint, 10 m gap'], correct: 0,
          why: 'A standard centre line is a white dashed line: 3 m paint with a 7 m gap, at least 100 mm wide.',
          source: 'NZTA TCD Manual, Part 5: centre lines' },
        { at: 400, q: 'How wide must a centre line be?',
          options: ['At least 75 mm', 'At least 100 mm', 'At least 150 mm'], correct: 1,
          why: 'Centre lines (and no-passing lines) must be at least 100 mm wide.',
          source: 'NZTA TCD Manual, Part 5: standard centre lines' }
      ]
    },
    reseal: {
      id: 'reseal', title: 'Reseal · crest', tag: 'Knowledge job', seal: 'new', len: 700, rural: true,
      zone: [380, 560], awStripes: 5, awLen: 13, awGap: 7,
      brief: 'Fresh chip seal, every line gone. The pattern is set out with spray spots: white for the centre line, yellow for the no-passing zone. Paint spot to spot.',
      calls: [
        { at: 200, q: 'Rural road. The yellow tab ahead is where the no-passing line starts. How many advance-warning stripes go before it?',
          options: ['3', '5', '7'], correct: 1,
          why: 'Rural roads get 5 yellow advance-warning stripes before a no-passing line. Urban roads get 3.',
          source: 'NZTA TCD Manual, Part 5: no-passing advance-warning lines' },
        { at: 212, q: 'How long is each advance-warning stripe, and how big is the gap?',
          options: ['3 m stripe, 7 m gap', '13 m stripe, 7 m gap', '15 m stripe, 15 m gap'], correct: 1,
          why: 'Each stripe is 13 m of yellow with a 7 m gap (never longer than 15 m). So 5 stripes start 100 m before the solid line.',
          source: 'NZTA TCD Manual, Part 5: no-passing advance-warning lines' },
        { at: 224, q: 'Where does your no-passing line go?',
          options: ['Your side, about 100 mm from the centre line', 'The far side of the centre line', 'Along the edge line'], correct: 0,
          why: 'A yellow no-passing line on your side of the centre line means you must not cross it. It is at least 100 mm wide, about 100 mm from the centre line.',
          source: 'NZTA TCD Manual, Part 5: no-passing lines · NZ Road Code' }
      ]
    }
  };

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
    if (s < 0) return { x: RX[0] + Math.sin(RH[0]) * s, z: RZ[0] - Math.cos(RH[0]) * s, h: RH[0] }; // straight run-in behind the start
    s = Math.min(s, ROAD_LEN);
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
    T.reseal = canvasTex(256, 512, (g, w, h) => { // fresh chip seal: dark, glossy, no lines at all
      g.fillStyle = '#232426'; g.fillRect(0, 0, w, h);
      noise(g, w, h, 30000, 58, 60, .6);
      noise(g, w, h, 2500, 130, 60, .35); // loose chip catching the light
    }, true);
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
    M.paint = std({ color: 0xffffff, roughness: .35, emissive: 0x777777, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8 });
    M.paintY = std({ color: 0xf2b705, roughness: .35, emissive: 0x6a4a00, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8 });
    M.tabW = std({ color: 0xffffff, roughness: .4, emissive: 0x555555 });
    M.tabY = std({ color: 0xf2b705, roughness: .4, emissive: 0x6a4a00 });
    M.oldPaint = std({ color: 0xe4e1d6, roughness: 1, vertexColors: true, transparent: true, opacity: 0.72, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 });
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
    // Modelled on the 1980s photo of NY662 (right side, front three-quarter).
    // Profile coords: x = metres forward of rear axle, y = metres above ground. Local z = -x.
    M.glass.side = THREE.DoubleSide;
    const ute = new THREE.Group();
    const body = new THREE.Group(); ute.add(body);
    const W = 1.64, HALF = W / 2;
    const FRONT = 3.58, CAB_BACK = 1.0, WS_BASE = 2.12, ROOF_F = 1.62, ROOF_R = 1.06;

    // --- side livery texture (white body, black guard panel stepping down into a pinstriped door band) ---
    const X0 = 0.9, X1 = 3.75, Y0 = 0.3, Y1 = 1.62;
    const sideTex = canvasTex(1024, 480, (g, w, h) => {
      const px = x => (x - X0) / (X1 - X0) * w, py = y => h - (y - Y0) / (Y1 - Y0) * h;
      g.fillStyle = '#f1f0ea'; g.fillRect(0, 0, w, h);
      // black: bonnet wrap on the front guard, then the step down to the door band
      g.fillStyle = '#1c1e20';
      g.beginPath();
      g.moveTo(px(3.62), py(1.0)); g.lineTo(px(2.45), py(1.03)); g.lineTo(px(2.3), py(0.98));
      g.lineTo(px(2.18), py(0.84)); g.lineTo(px(0.9), py(0.84)); g.lineTo(px(0.9), py(0.68));
      g.lineTo(px(2.3), py(0.68)); g.lineTo(px(2.42), py(0.76)); g.lineTo(px(3.62), py(0.76));
      g.closePath(); g.fill();
      // white pinstripe inside the band
      g.strokeStyle = '#e8e7e0'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(px(0.9), py(0.725)); g.lineTo(px(2.33), py(0.725)); g.lineTo(px(2.45), py(0.81)); g.lineTo(px(3.62), py(0.81)); g.stroke();
      // door shut lines + handle
      g.strokeStyle = 'rgba(60,60,60,.55)'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(px(1.12), py(0.48)); g.lineTo(px(1.12), py(1.44)); g.stroke();
      g.beginPath(); g.moveTo(px(2.16), py(0.48)); g.lineTo(px(2.16), py(1.02)); g.stroke();
      g.fillStyle = '#9a9a96'; g.fillRect(px(1.25), py(0.99), px(1.4) - px(1.25), 6);
      // side window with quarter vent
      const gl = g.createLinearGradient(0, py(1.45), 0, py(1.05));
      gl.addColorStop(0, '#3b4650'); gl.addColorStop(1, '#141a20');
      g.fillStyle = gl;
      g.beginPath(); g.moveTo(px(1.16), py(1.06)); g.lineTo(px(2.08), py(1.06)); g.lineTo(px(1.66), py(1.45)); g.lineTo(px(1.16), py(1.45)); g.closePath(); g.fill();
      g.strokeStyle = '#c8c8c2'; g.lineWidth = 4; g.stroke();
      g.beginPath(); g.moveTo(px(1.86), py(1.06)); g.lineTo(px(1.86), py(1.26)); g.stroke();
      // amber side marker on the guard
      g.fillStyle = '#d08a2a'; g.fillRect(px(3.3), py(0.66), px(3.42) - px(3.3), py(0.62) - py(0.66));
      noise(g, w, h, 2200, 150, 90, .12); // road grime
    });
    sideTex.repeat.set(1 / (X1 - X0), 1 / (Y1 - Y0));
    sideTex.offset.set(-X0 / (X1 - X0), -Y0 / (Y1 - Y0));
    const sideMat = new THREE.MeshStandardMaterial({ map: sideTex, roughness: .45 });

    // --- body shell: side profile extruded across the width ---
    const sh = new THREE.Shape();
    sh.moveTo(CAB_BACK, 0.46);
    sh.lineTo(2.16, 0.46);
    sh.absarc(2.6, 0.36, 0.45, Math.atan2(0.1, -0.44), Math.atan2(0.1, 0.44), true);
    sh.lineTo(3.5, 0.46);
    sh.lineTo(FRONT, 0.56);
    sh.lineTo(FRONT, 0.9);
    sh.lineTo(3.48, 0.99);
    sh.lineTo(WS_BASE, 1.03);
    sh.lineTo(ROOF_F, 1.5);
    sh.lineTo(ROOF_R + 0.05, 1.53);
    sh.lineTo(CAB_BACK, 1.47);
    sh.lineTo(CAB_BACK, 0.46);
    const shellGeo = new THREE.ExtrudeGeometry(sh, { depth: W - 0.06, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 3, curveSegments: 16 });
    shellGeo.translate(0, 0, -(W - 0.06) / 2);
    const shell = new THREE.Mesh(shellGeo, [sideMat, M.white]);
    shell.rotation.y = Math.PI / 2; shell.castShadow = true; shell.receiveShadow = true; body.add(shell);

    // black bonnet with the white road logo
    const bonLen = 3.48 - WS_BASE, bonRise = 0.04;
    const bon = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.02, bonLen), M.bonnet);
    bon.rotation.x = -Math.PI / 2 - Math.atan2(bonRise, bonLen);
    bon.position.set(0, 1.068, -(WS_BASE + bonLen / 2)); body.add(bon);
    // windscreen + rear window glass
    const wsLen = Math.hypot(WS_BASE - ROOF_F, 1.5 - 1.03);
    const ws = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.16, wsLen - 0.06), M.glass);
    ws.position.set(0, (1.03 + 1.5) / 2 + 0.01, -(WS_BASE + ROOF_F) / 2 - 0.012);
    ws.rotation.x = Math.atan2(WS_BASE - ROOF_F, 1.5 - 1.03); body.add(ws);
    const rw = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.4, 0.3), M.glass); rw.position.set(0, 1.3, -CAB_BACK + 0.04); body.add(rw);
    box(0.62, 0.02, 0.03, M.black, 0.32, 1.09, -2.05, body); box(0.62, 0.02, 0.03, M.black, -0.34, 1.09, -2.05, body); // wipers
    // mirror on the driver's door
    box(0.04, 0.03, 0.18, M.black, HALF + 0.08, 1.08, -1.98, body); box(0.05, 0.14, 0.12, M.black, HALF + 0.17, 1.12, -1.98, body);

    // front: grille, rectangular headlights, indicators, black bumper
    box(W - 0.5, 0.26, 0.03, M.black, 0, 0.77, -FRONT - 0.02, body);
    for (let i = -3; i <= 3; i++) box(0.012, 0.22, 0.02, M.metal, i * 0.15, 0.77, -FRONT - 0.035, body, false);
    [-1, 1].forEach(sd => {
      box(0.26, 0.17, 0.03, M.headlight, sd * 0.6, 0.8, -FRONT - 0.025, body, false);
      box(0.18, 0.07, 0.03, M.amber, sd * 0.62, 0.62, -FRONT - 0.03, body, false);
    });
    box(W + 0.04, 0.12, 0.1, M.black, 0, 0.52, -FRONT - 0.04, body);
    const plateF = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.12), M.plate); plateF.position.set(0.2, 0.52, -FRONT - 0.1); plateF.rotation.y = Math.PI; body.add(plateF);

    // bull bar: tall loops either side of the grille, top rail, flat plates
    const BZ = -FRONT - 0.2;
    [-1, 1].forEach(sd => {
      tube([[sd * 0.32, 0.38, BZ], [sd * 0.32, 0.98, BZ - 0.04], [sd * 0.5, 1.08, BZ - 0.02], [sd * 0.74, 0.98, BZ], [sd * 0.78, 0.5, BZ + 0.05], [sd * 0.84, 0.42, -FRONT + 0.15]], 0.04, M.chrome, body);
      const plate = box(0.4, 0.5, 0.012, M.metal, sd * 0.53, 0.72, BZ + 0.02, body); plate.material = M.chrome;
    });
    tube([[-0.82, 0.92, BZ + 0.02], [0, 0.96, BZ - 0.05], [0.82, 0.92, BZ + 0.02]], 0.04, M.chrome, body);
    tube([[-0.86, 0.5, BZ + 0.08], [0, 0.48, BZ], [0.86, 0.5, BZ + 0.08]], 0.045, M.chrome, body);
    tube([[0.15, 0.96, BZ - 0.05], [-0.7, 0.86, BZ - 0.2], [-1.0, 0.7, BZ - 0.1]], 0.012, M.black, body); // tie-down strap

    // flat deck with block-striped edge and white tube rails
    const DECK_Y = 0.86, DZ0 = -CAB_BACK + 0.04, DZ1 = 1.32, DL = DZ1 - DZ0, DMID = (DZ0 + DZ1) / 2;
    box(W + 0.16, 0.06, DL, M.dirty, 0, DECK_Y, DMID, body);
    box(W, 0.36, DL, M.black, 0, 0.62, DMID, body); // under-tray
    T.stripes.wrapS = THREE.RepeatWrapping; T.stripes.repeat.set(DL / 2.4, 1);
    [-1, 1].forEach(sd => { const st = box(0.02, 0.22, DL, M.stripes, sd * (HALF + 0.09), DECK_Y - 0.12, DMID, body); st.castShadow = false; });
    box(W + 0.18, 0.22, 0.02, M.stripes, 0, DECK_Y - 0.12, DZ1 + 0.01, body).castShadow = false;
    tube([[-HALF, DECK_Y, DZ0 + 0.05], [-HALF, DECK_Y + 0.55, DZ0 + 0.05], [HALF, DECK_Y + 0.55, DZ0 + 0.05], [HALF, DECK_Y, DZ0 + 0.05]], 0.03, M.white, body); // headboard
    [-1, 1].forEach(sd => tube([[sd * (HALF + 0.05), DECK_Y + 0.03, DZ0 + 0.1], [sd * (HALF + 0.05), DECK_Y + 0.3, DZ0 + 0.3], [sd * (HALF + 0.05), DECK_Y + 0.3, DZ1 - 0.1]], 0.025, M.white, body));
    // tall white pole at the deck's front right corner
    cyl(0.045, 0.045, 1.55, M.white, HALF - 0.05, DECK_Y + 0.77, DZ0 + 0.12, body, 12);

    // rear: Independent Roadmarkers board, plate box, lights, step, tow ball
    box(1.12, 0.7, 0.05, M.black, -0.26, 0.6, DZ1 + 0.06, body);
    const tg = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.66), M.tailgate); tg.position.set(-0.26, 0.6, DZ1 + 0.09); body.add(tg);
    box(0.5, 0.3, 0.32, M.white, 0.55, 0.7, DZ1 - 0.08, body);
    const plateR = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.12), M.plate); plateR.position.set(0.55, 0.72, DZ1 + 0.085); body.add(plateR);
    box(0.2, 0.09, 0.04, M.red, -0.65, 0.22, DZ1 + 0.06, body); box(0.16, 0.09, 0.04, M.red, 0.72, 0.5, DZ1 + 0.06, body);
    box(0.5, 0.04, 0.3, M.dirty, 0.15, 0.2, DZ1 + 0.18, body);
    cyl(0.04, 0.04, 0.4, M.metal, -0.55, 0.3, DZ1 + 0.25, body).rotation.x = Math.PI / 2;

    // deck gear: twin paint pots, compressor, gauges, cones, boom arm
    const tankA = cyl(0.27, 0.27, 1.2, M.dirty, -0.28, DECK_Y + 0.64, 0.25, body, 24);
    cyl(0.2, 0.27, 0.12, M.dirty, -0.28, DECK_Y + 1.3, 0.25, body, 24);
    cyl(0.04, 0.04, 0.2, M.metal, -0.28, DECK_Y + 1.45, 0.25, body, 10);
    cyl(0.24, 0.24, 1.1, M.dirty, 0.3, DECK_Y + 0.58, 0.2, body, 24);
    cyl(0.18, 0.24, 0.1, M.dirty, 0.3, DECK_Y + 1.18, 0.2, body, 24);
    box(0.55, 0.36, 0.45, M.metal, -0.45, DECK_Y + 0.2, 0.95, body);
    box(0.42, 0.2, 0.1, M.white, -0.35, DECK_Y + 0.5, 0.72, body);
    for (let i = 0; i < 3; i++) cyl(0.04, 0.04, 0.03, M.black, -0.48 + i * 0.12, DECK_Y + 0.52, 0.78, body).rotation.x = Math.PI / 2;
    for (let i = 0; i < 4; i++) cyl(0.05, 0.22, 0.12, M.cone, 0.45, DECK_Y + 0.08 + i * 0.05, 0.95, body, 14);
    cyl(0.04, 0.22, 0.6, M.cone, 0.45, DECK_Y + 0.4, 0.95, body, 14);
    box(0.24, 0.3, 0.2, M.black, -0.6, DECK_Y + 0.18, -0.55, body); // bead box
    cyl(0.05, 0.05, 1.8, M.white, -0.7, DECK_Y + 0.9, 1.2, body);
    tube([[-0.7, DECK_Y + 1.75, 1.2], [-0.55, DECK_Y + 1.95, 0.75], [-0.3, DECK_Y + 1.55, 0.3]], 0.06, M.hose, body);
    tube([[-0.28, DECK_Y + 1.3, 0.25], [0.3, DECK_Y + 0.9, 0.6], [0.85, 0.5, 1.15], [GUN_LAT, 0.25, 1.2]], 0.035, M.hose, body);

    // roof sign: big ROAD MARKING board on a frame from the headboard, beacons either side
    const SY = 2.05, SZ = -CAB_BACK - 0.05;
    [-0.42, 0.42].forEach(x => cyl(0.025, 0.025, SY - DECK_Y - 0.1, M.white, x, (SY + DECK_Y) / 2 - 0.15, DZ0 + 0.05, body, 8));
    box(1.5, 0.05, 0.05, M.white, 0, 1.62, DZ0 + 0.05, body);
    const sign = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.72, 0.03), [M.white, M.white, M.white, M.white, M.sign, M.sign]);
    sign.position.set(0, SY, SZ + 0.1); sign.castShadow = true; body.add(sign);
    const bL = cyl(0.08, 0.09, 0.17, M.amber, -0.68, 1.76, DZ0 + 0.05, body, 16);
    const bR = cyl(0.08, 0.09, 0.17, M.amber2, 0.68, 1.76, DZ0 + 0.05, body, 16);
    cyl(0.005, 0.005, 1.3, M.black, 0.6, 2.15, DZ0 + 0.1, body, 4); // whip aerial
    const glowMat = new THREE.SpriteMaterial({ map: T.glow, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    const gL = new THREE.Sprite(glowMat); gL.scale.set(0.6, 0.6, 1); bL.add(gL);
    const gR = new THREE.Sprite(glowMat.clone()); gR.scale.set(0.6, 0.6, 1); bR.add(gR);

    // driver's side kit: tall black box behind the front wheel, wire brush ahead of the rear wheel
    box(0.12, 0.62, 0.3, M.black, HALF + 0.1, 0.62, -2.02, body);
    box(0.3, 0.03, 0.03, M.metal, HALF + 0.1, 0.95, -2.02, body);
    const brush = new THREE.Mesh(new THREE.CircleGeometry(0.27, 28), M.brush);
    brush.position.set(HALF + 0.14, 0.29, -0.62); brush.rotation.y = Math.PI / 2; body.add(brush);
    box(0.06, 0.06, 0.4, M.metal, HALF + 0.08, 0.42, -0.62, body);
    box(0.02, 0.32, 0.26, M.black, HALF + 0.02, 0.32, -2.12, body); // mud flap
    // gun outrigger at the rear right
    box(0.4, 0.05, 0.05, M.metal, 0.9, 0.3, 1.2, body);
    cyl(0.05, 0.03, 0.16, M.metal, GUN_LAT, 0.2, 1.2, body, 12);
    const nozzle = cyl(0.015, 0.015, 0.08, M.black, GUN_LAT, 0.08, 1.2, body, 8);

    // Bruce at the wheel (right-hand drive), arm out the window
    const skin = new THREE.MeshStandardMaterial({ color: 0xc89878, roughness: .7 });
    const hair = new THREE.MeshStandardMaterial({ color: 0x2a1e16, roughness: .9 });
    const tee = new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: .9 });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), skin); head.position.set(0.4, 1.33, -1.45); body.add(head);
    const curls = new THREE.Mesh(new THREE.SphereGeometry(0.125, 16, 10, 0, Math.PI * 2, 0, Math.PI / 1.9), hair); curls.position.set(0.4, 1.35, -1.43); body.add(curls);
    box(0.2, 0.04, 0.04, M.black, 0.4, 1.34, -1.555, body, false); // sunnies
    box(0.04, 0.025, 0.06, hair, 0.4, 1.27, -1.555, body, false);  // mo
    box(0.42, 0.4, 0.26, tee, 0.38, 1.05, -1.4, body);
    box(0.12, 0.1, 0.42, tee, HALF - 0.02, 1.08, -1.55, body);
    box(0.1, 0.08, 0.2, skin, HALF + 0.04, 1.08, -1.82, body);

    // steel wheels with six holes
    const rimTex = canvasTex(128, 128, (g, w, h) => {
      g.fillStyle = '#c4c4bd'; g.beginPath(); g.arc(64, 64, 63, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#8f8f88'; g.lineWidth = 3; g.beginPath(); g.arc(64, 64, 56, 0, Math.PI * 2); g.stroke();
      g.fillStyle = '#2a2a2a';
      for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; g.beginPath(); g.ellipse(64 + Math.cos(a) * 34, 64 + Math.sin(a) * 34, 9, 6, a, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = '#9d9d96'; g.beginPath(); g.arc(64, 64, 15, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#555'; for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + .5; g.beginPath(); g.arc(64 + Math.cos(a) * 21, 64 + Math.sin(a) * 21, 2.5, 0, Math.PI * 2); g.fill(); }
    });
    const rimMat = new THREE.MeshStandardMaterial({ map: rimTex, roughness: .4, metalness: .5 });
    const wheels = [];
    [[-0.7, -2.6], [0.7, -2.6], [-0.7, 0], [0.7, 0]].forEach(([x, z]) => {
      const wg = new THREE.Group(); wg.position.set(x, 0.33, z);
      const tyre = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.2, 28), M.tyre); tyre.rotation.z = Math.PI / 2; tyre.castShadow = true;
      const face = new THREE.Mesh(new THREE.CircleGeometry(0.21, 24), rimMat);
      face.position.x = x > 0 ? 0.101 : -0.101; face.rotation.y = x > 0 ? Math.PI / 2 : -Math.PI / 2;
      wg.add(tyre); wg.add(face); ute.add(wg); wheels.push(wg);
    });
    return { group: ute, body, wheels, brush, beacons: [bL, bR], glows: [gL, gR], nozzle, tankA };
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
  // ---------- the streaker and the security guard ----------
  function buildPerson(kind) {
    const g = new THREE.Group();
    const skin = new THREE.MeshStandardMaterial({ color: kind === 'streaker' ? 0xe7b394 : 0xb98463, roughness: .7 });
    const shirt = kind === 'guard' ? new THREE.MeshStandardMaterial({ map: canvasTex(128, 128, (c, w, h) => {
      c.fillStyle = '#1d2433'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#f3d23a'; c.font = 'bold 22px Arial'; c.textAlign = 'center'; c.fillText('SECURITY', w / 2, 70);
    }), roughness: .8 }) : skin;
    const pants = kind === 'guard' ? new THREE.MeshStandardMaterial({ color: 0x1b1f27, roughness: .8 }) : skin;
    const torso = box(0.38, 0.55, 0.22, shirt, 0, 1.22, 0, g);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 10), skin); head.position.y = 1.64; head.castShadow = true; g.add(head);
    if (kind === 'guard') {
      box(0.27, 0.06, 0.27, pants, 0, 1.75, 0, g); box(0.2, 0.02, 0.12, pants, 0, 1.73, -0.17, g);  // cap + peak
      box(0.18, 0.05, 0.02, new THREE.MeshStandardMaterial({ color: 0xc9a227, metalness: .7, roughness: .3 }), -0.08, 1.38, -0.115, g); // badge
    } else {
      const hair = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x8a5a2b, roughness: .9 }));
      hair.position.y = 1.66; g.add(hair);
    }
    const limb = (w, h, mat, x, y) => { const pv = new THREE.Group(); pv.position.set(x, y, 0); const m = box(w, h, w, mat, 0, -h / 2, 0, pv); m.castShadow = true; g.add(pv); return pv; };
    const legL = limb(0.15, 0.9, pants, -0.1, 0.95), legR = limb(0.15, 0.9, pants, 0.1, 0.95);
    const armL = limb(0.1, 0.62, kind === 'guard' ? shirt : skin, -0.25, 1.46), armR = limb(0.1, 0.62, kind === 'guard' ? shirt : skin, 0.25, 1.46);
    if (kind === 'streaker') { // keeps it family friendly: a censor bar that always faces the camera
      const bar = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTex(128, 40, (c, w, h) => {
        c.fillStyle = '#000'; c.fillRect(0, 0, w, h); c.fillStyle = '#fff'; c.font = 'bold 22px Arial'; c.textAlign = 'center'; c.fillText('CENSORED', w / 2, 28);
      }), depthTest: true }));
      bar.scale.set(0.5, 0.16, 1); bar.position.set(0, 0.95, 0); g.add(bar);
    }
    return { g, legL, legR, armL, armR, kind };
  }
  function animatePerson(p, t, speed) {
    const sw = Math.sin(t * speed * 2.1) * 0.9;
    p.legL.rotation.x = sw; p.legR.rotation.x = -sw;
    if (p.kind === 'streaker') { p.armL.rotation.z = -2.4 + Math.sin(t * 9) * 0.5; p.armR.rotation.z = 2.4 - Math.sin(t * 9 + 1) * 0.5; } // arms waving overhead
    else { p.armL.rotation.x = -sw; p.armR.rotation.x = -2.6; } // guard points, whistle hand up
    p.g.position.y = Math.abs(Math.sin(t * speed * 2.1)) * 0.06;
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
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    T.road.anisotropy = T.reseal.anisotropy = T.grass.anisotropy = renderer.capabilities.getMaxAnisotropy();
    root.querySelector('.u3-canvas').appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0xc9d8e6, 120, 1300);
    const camera = new THREE.PerspectiveCamera(58, 1, 0.3, 60000);
    scene.add(new THREE.HemisphereLight(0xcfe3ff, 0x5a6b3a, 0.75));
    const sun = new THREE.DirectionalLight(0xfff1d8, 2.2);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 200 });
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
    scene.add(sun); scene.add(sun.target);

    // sky, mountain, ground
    const sky = buildSky(); sky.renderOrder = -2; scene.add(sky);
    const endP = sample(ROAD_LEN);
    const mtn = buildMountain();
    mtn.position.set(endP.x + 4000, 1250 - 60, endP.z - 26000); scene.add(mtn);
    const mid = sample(ROAD_LEN / 2);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), M.grass);
    ground.rotation.x = -Math.PI / 2; ground.position.set(mid.x, 0, mid.z); ground.receiveShadow = true;
    // grass is a backdrop: drawn first, writes no depth, so it can never cover the seal
    M.grass.depthWrite = false; ground.renderOrder = -1;
    T.grass.repeat.set(1400, 1400); scene.add(ground);

    // road, shoulders
    scene.add(ribbon(-200, ROAD_LEN, 2, -ROAD_W / 2, ROAD_W / 2, 0.04, 8, M.road));
    T.gravel.repeat.set(1, 1);
    scene.add(ribbon(-200, ROAD_LEN, 2, -ROAD_W / 2 - 1.3, -ROAD_W / 2, 0.018, 3, M.gravel));
    scene.add(ribbon(-200, ROAD_LEN, 2, ROAD_W / 2, ROAD_W / 2 + 1.3, 0.018, 3, M.gravel));

    // per-job markings: white dash targets, yellow targets, and what's on the road to go by
    const dashes = [], yel = [], tabs = [];
    const jobGroup = new THREE.Group(); scene.add(jobGroup);
    let job = JOBS.remark;
    function setupJob(j) {
      job = j; JOB_LEN = j.len; seed = 662;
      jobGroup.children.slice().forEach(o => { jobGroup.remove(o); if (o.geometry) o.geometry.dispose(); });
      dashes.length = 0; yel.length = 0; tabs.length = 0;
      for (let s = DASH_START; s < JOB_LEN + DASH_START; s += DASH_EVERY) dashes.push({ s0: s, s1: s + DASH_ON, cover: 0, over: 0, offLine: 0, done: false });
      M.road.map = j.seal === 'new' ? T.reseal : T.road; M.road.needsUpdate = true;
      if (j.seal === 'old') { // faded old centre line dashes (the target)
        const oldQuads = [];
        dashes.forEach(d => {
          const wear = 0.66 + rnd() * 0.2; // years of traffic: dull, grey and patchy
          for (let k = 0; k < DASH_ON; k += 0.25) {
            if (rnd() < 0.18) continue; // worn-through patches
            const jj = (rnd() - .5) * 0.016, nw = 0.04 + rnd() * 0.012; // ragged edges
            oldQuads.push([d.s0 + k, d.s0 + k + 0.22 + rnd() * 0.06, jj - nw, jj + nw, 0.045, wear * (0.7 + rnd() * .5)]);
          }
        });
        jobGroup.add(quadStrip(oldQuads, M.oldPaint));
      } else { // reseal: the pattern has been set out with spray spots before the paint truck arrives
        // what the spec wants in yellow: N advance-warning stripes, then the solid no-passing line
        const lead = j.awStripes * (j.awLen + j.awGap);
        for (let k = 0; k < j.awStripes; k++) { const a = j.zone[0] - lead + k * (j.awLen + j.awGap); yel.push({ s0: a, s1: a + j.awLen, kind: 'aw', n: k + 1, cover: 0, over: 0, off: 0, done: false }); }
        yel.push({ s0: j.zone[0], s1: j.zone[1], kind: 'solid', cover: 0, over: 0, off: 0, done: false });
        // set-out spots: start and end of every white dash and every yellow piece
        dashes.forEach(d => tabs.push({ s: d.s0, c: 'w' }, { s: d.s1, c: 'w' }));
        yel.forEach(e => tabs.push({ s: e.s0, c: 'y' }, { s: e.s1, c: 'y' }));
        const spotGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.01, 12);
        tabs.forEach(t => {
          const m = new THREE.Mesh(spotGeo, t.c === 'y' ? M.tabY : M.tabW);
          pt(t.s, t.c === 'y' ? YEL_LAT : 0, 0.05, m.position); jobGroup.add(m);
        });
      }
      j.calls.forEach(c => { c.done = false; });
      const lbl = root.querySelector('.u3-job small'); if (lbl) lbl.textContent = j.title;
      root.querySelectorAll('[data-hold="yellow"]').forEach(b => { b.hidden = j.seal !== 'new'; });
    }
    setupJob(JOBS.remark);

    // fresh paint buffers, one per colour
    function paintBuffer(mat) {
      const MAXQ = 9000, pos = new Float32Array(MAXQ * 18), geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(MAXQ * 18).map((_, i) => i % 3 === 1 ? 1 : 0), 3));
      geo.setDrawRange(0, 0);
      const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.receiveShadow = true; scene.add(mesh);
      let q = 0;
      return {
        add(sA, latA, sB, latB) {
          if (q >= MAXQ) return;
          const w = 0.05, y = 0.056;
          const c = [pt(sA, latA - w, y), pt(sA, latA + w, y), pt(sB, latB - w, y), pt(sB, latB + w, y)];
          const o = q * 18;
          [c[0], c[1], c[2], c[1], c[3], c[2]].forEach((p, i) => { pos[o + i * 3] = p.x; pos[o + i * 3 + 1] = p.y; pos[o + i * 3 + 2] = p.z; });
          q++; geo.attributes.position.needsUpdate = true; geo.setDrawRange(0, q * 6);
        },
        clear() { q = 0; geo.setDrawRange(0, 0); }
      };
    }
    const whitePaint = paintBuffer(M.paint), yellowPaint = paintBuffer(M.paintY);
    const addPaint = whitePaint.add;

    // roadside: fence posts + wires, power poles, hedges, trees, cows, signs
    const posts = [], wireV = [], poles = [], arms = [], trees = [], trunks = [], pines = [], hedges = [], cowsB = [], cowsW = [];
    const P = new THREE.Vector3();
    for (let s = -200; s < ROAD_LEN; s += 4) {
      [-10, 10].forEach(l => posts.push({ p: pt(s, l, 0.55), ry: -sample(s).h }));
      [-10, 10].forEach(l => [0.45, 0.8, 1.05].forEach(h => { const a = pt(s, l, h), b = pt(s + 4, l, h); wireV.push(a.x, a.y, a.z, b.x, b.y, b.z); }));
    }
    for (let s = -212; s < ROAD_LEN; s += 48) {
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

    // hazards: oncoming traffic only. The road is clear of cones (the ones on the deck stay).
    const cones = [];
    const cars = [];
    let runners = null; // streaker + guard crossing the road

    // ---------- state ----------
    const S = {
      state: 'title', t: 0, s: 0, off: -1.05, offVel: 0, speed: 0, speedTarget: 4.2,
      spraying: false, good: 0, waste: 0, litres: TANK_L, score: 0, combo: 1, bestCombo: 1,
      conesHit: 0, perfect: 0, missed: 0, nextCar: 6, cam: 0, painted: [], latch: store.get('ute3dLatchV8', false), latchStart: null, latchEnd: null, sprayWas: false, auto: store.get('ute3dAutoV6', false), steerHeld: 0, steerDir: 0, gunLatPrev: 0, gunSPrev: 0, hasPrev: false, shake: 0
    };
    const input = { left: false, right: false, spray: false, yellow: false, up: false, down: false };

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
    function whistle() { // guard's whistle trill
      if (!A) return;
      const o = A.ac.createOscillator(), g = A.ac.createGain(), lfo = A.ac.createOscillator(), lg = A.ac.createGain();
      o.type = 'sine'; o.frequency.value = 2900; lfo.frequency.value = 28; lg.gain.value = 180;
      lfo.connect(lg); lg.connect(o.frequency);
      const t0 = A.ac.currentTime; g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(.07, t0 + .03); g.gain.exponentialRampToValueAtTime(0.0001, t0 + .45);
      o.connect(g); g.connect(A.master); o.start(); lfo.start(); o.stop(t0 + .5); lfo.stop(t0 + .5);
    }
    function horn() { blip(392, .55, 'square', .06); blip(494, .55, 'square', .05); }

    // ---------- HUD ----------
    const $ = sel => root.querySelector(sel);
    const hud = { score: $('.u3-score'), combo: $('.u3-combo'), prog: $('.u3-prog i'), dist: $('.u3-dist'), speed: $('.u3-speed'), paint: $('.u3-paint i'), litres: $('.u3-litres'), acc: $('.u3-acc'), aim: $('.u3-aim i'), pop: $('.u3-pop'), strip: $('.u3-strip') };
    let popT = 0;
    // timing strip: the next stretch of road laid flat, old dashes grey, fresh paint white, gun in orange
    const sctx = hud.strip ? hud.strip.getContext('2d') : null;
    function drawStrip(gunS, gunLat) {
      if (!sctx) return;
      const w = hud.strip.width, h = hud.strip.height, span = STRIP_BACK + STRIP_AHEAD, x = sv => (sv - gunS + STRIP_BACK) / span * w;
      sctx.clearRect(0, 0, w, h);
      sctx.fillStyle = 'rgba(12,14,16,.62)'; sctx.fillRect(0, 0, w, h);
      const y = h / 2 - 4;
      if (job.seal === 'old') for (const d of dashes) { // re-mark: the old dashes show through
        if (d.s1 < gunS - STRIP_BACK) continue; if (d.s0 > gunS + STRIP_AHEAD) break;
        sctx.fillStyle = 'rgba(220,220,210,.45)'; sctx.fillRect(x(d.s0), y, x(d.s1) - x(d.s0), 8);
      }
      for (const t of tabs) { // reseal: only the pre-mark tabs
        if (t.s < gunS - STRIP_BACK || t.s > gunS + STRIP_AHEAD) continue;
        sctx.fillStyle = t.c === 'y' ? '#f2b705' : '#ffffff';
        sctx.beginPath(); sctx.arc(x(t.s), t.c === 'y' ? y + 11 : y - 3, 3, 0, Math.PI * 2); sctx.fill();
      }
      sctx.fillStyle = '#ffffff';
      for (const [a, b] of S.painted) if (b > gunS - STRIP_BACK) sctx.fillRect(x(a), y + 1, Math.max(1, x(b) - x(a)), 4);
      sctx.fillStyle = '#f2b705';
      for (const [a, b] of (S.paintedY || [])) if (b > gunS - STRIP_BACK) sctx.fillRect(x(a), y + 5, Math.max(1, x(b) - x(a)), 4);
      const gx = x(gunS);
      sctx.fillStyle = Math.abs(gunLat) < ON_LINE ? '#7dff9b' : '#ff7a52'; sctx.fillRect(gx - 2, 2, 4, h - 4);
      sctx.fillStyle = 'rgba(255,255,255,.75)'; sctx.font = '600 11px Barlow Condensed, Arial Narrow, sans-serif'; sctx.fillText('GUN', gx + 5, 11);
    }
    function pop(text, cls) { hud.pop.textContent = text; hud.pop.className = 'u3-pop show ' + (cls || ''); popT = 1.1; }
    let activeCall = null, callTimer = 0;
    function openCall(c) {
      activeCall = { c, answered: false }; S.state = 'call'; S.calls++;
      input.left = input.right = input.spray = input.yellow = input.up = input.down = false;
      $('.u3-call-q').textContent = c.q;
      const box = $('.u3-call-opts'); box.innerHTML = ''; box.hidden = false;
      c.options.forEach((o, i) => {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'u3-opt'; b.dataset.act = 'opt'; b.dataset.opt = i;
        const k = document.createElement('kbd'); k.textContent = i + 1; b.appendChild(k); b.appendChild(document.createTextNode(' ' + o)); box.appendChild(b);
      });
      $('.u3-call-bruce').hidden = true; $('.u3-call-time').hidden = false;
      callTimer = 12; showPanel('call'); blip(990, .1); setTimeout(() => blip(1320, .12), 110);
    }
    function answerCall(i) {
      if (!activeCall || activeCall.answered) return;
      activeCall.answered = true; const c = activeCall.c;
      root.querySelectorAll('.u3-opt').forEach((b, k) => { b.disabled = true; if (k === c.correct) b.classList.add('right'); else if (k === i) b.classList.add('wrong'); });
      if (i === c.correct) {
        S.callsRight++; const bonus = 300 * S.callStreak; S.score += bonus; S.callStreak = Math.min(5, S.callStreak + 1);
        blip(880, .12); setTimeout(() => blip(1175, .2), 120);
        setTimeout(() => { closeCall(); pop('RIGHT CALL +' + bonus, 'good'); }, 650);
      } else {
        S.callStreak = 1; thud();
        $('.u3-call-time').hidden = true;
        $('.u3-call-why').textContent = (i < 0 ? 'Out of time. ' : '') + c.why;
        $('.u3-call-src').textContent = 'Source: ' + c.source;
        $('.u3-call-bruce').hidden = false;
      }
    }
    function closeCall() { activeCall = null; S.state = 'play'; showPanel('play'); }
    function showPanel(name) { root.querySelectorAll('.u3-panel').forEach(p => p.hidden = p.dataset.panel !== name); root.querySelector('.u3-hud').hidden = name !== 'play'; }

    function resize() {
      const w = root.clientWidth, h = root.clientHeight;
      renderer.setSize(w, h, false); renderer.domElement.style.width = w + 'px'; renderer.domElement.style.height = h + 'px';
      camera.aspect = w / h; camera.fov = w < h ? 68 : 55; camera.updateProjectionMatrix();
    }
    window.addEventListener('resize', resize); resize();

    function reset(j) {
      setupJob(j || job);
      Object.assign(S, { calls: 0, callsRight: 0, callStreak: 1, paintedY: [], strayY: 0, strayWarned: 0, latchYStart: null, latchYEnd: null, yWas: false, yOk: 0, ySpraying: false, yPrev: null, yLatPrev: 0, state: 'count', t: 0, s: 0, off: -1.05, offVel: 0, speed: 0, speedTarget: 4.2, spraying: false, good: 0, waste: 0, litres: TANK_L, score: 0, combo: 1, bestCombo: 1, conesHit: 0, perfect: 0, missed: 0, nextCar: 5, hasPrev: false, countdown: 3.2, emptyWarned: false, painted: [], latchStart: null, latchEnd: null, sprayWas: false });
      dashes.forEach(d => { d.cover = 0; d.over = 0; d.offLine = 0; d.late = 0; d.early = 0; d.done = false; });
      whitePaint.clear(); yellowPaint.clear();
      cones.forEach(c => { c.hit = false; pt(c.s, c.lat, 0, c.g.position); c.g.rotation.set(0, 0, 0); });
      cars.forEach(c => scene.remove(c.g)); cars.length = 0;
      if (runners) { scene.remove(runners.streaker.g); scene.remove(runners.guard.g); runners = null; }
      S.nextStreak = 25 + rnd() * 25;
      showPanel('play'); initAudio(); if (A && A.ac.state === 'suspended') A.ac.resume();
    }

    function finish(crashed) {
      S.state = 'over'; S.spraying = false;
      const passed = dashes.filter(d => d.s1 < S.s + 0.01);
      const cover = passed.length ? passed.reduce((a, d) => a + Math.min(d.cover, DASH_ON), 0) / (passed.length * DASH_ON) : 0;
      const acc = S.good + S.waste > 0 ? S.good / (S.good + S.waste) : 0;
      let stars = 0; if (!crashed) stars = cover > .9 && acc > .85 ? 3 : cover > .75 && acc > .7 ? 2 : cover > .5 ? 1 : 0;
      // top marks only if you knew the rules: every call right, and on a reseal every yellow piece right
      const knewIt = S.callsRight === S.calls && (job.seal !== 'new' || S.yOk === yel.length);
      if (!knewIt) stars = Math.min(stars, 2);
      const final = Math.max(0, Math.round(S.score + (crashed ? 0 : stars * 1000)));
      const bestKey = 'ute3dBest-' + job.id, best = store.get(bestKey, 0); if (final > best) store.set(bestKey, final);
      $('.u3-end-title').textContent = crashed ? 'Head-on. Job abandoned.' : 'Job complete';
      $('.u3-end-stars').textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
      $('.u3-end-stats').innerHTML =
        `<div><span>Score</span><b>${final.toLocaleString('en-NZ')}</b></div>` +
        `<div><span>Line covered</span><b>${Math.round(cover * 100)}%</b></div>` +
        `<div><span>Accuracy</span><b>${Math.round(acc * 100)}%</b></div>` +
        `<div><span>Right calls</span><b>${S.callsRight}/${S.calls}</b></div>` +
        `<div><span>Perfect dashes</span><b>${S.perfect}</b></div>` +
        (job.seal === 'new' ? `<div><span>Yellow right</span><b>${S.yOk}/${yel.length}</b></div>` : `<div><span>Missed dashes</span><b>${S.missed}</b></div>`);
      $('.u3-end-tip').textContent = knewIt ? 'Knew every rule. That is how you get top marks.' : 'Top marks need every rule right. Check the Bruce says cards and go again.';
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
      // steering: the ute moves sideways only while Bruce steers (creep for fine trim, up to 0.5 m/s);
      // letting go stops it at once.
      const steer = playing ? (input.right ? 1 : 0) - (input.left ? 1 : 0) : 0;
      S.steerHeld = steer ? (S.steerDir === steer ? S.steerHeld + dt : 0) : 0; S.steerDir = steer;
      const want = steer * Math.min(0.5, 0.1 + S.steerHeld * 0.8);
      S.offVel = steer ? lerp(S.offVel, want, Math.min(1, dt * 10)) : 0;
      // on a bend the ute eases wide, gently, so it needs a light touch to stay on the line; dead straight, it never moves
      const kappa = (sample(S.s + 1).h - sample(S.s - 1).h) / 2;
      const drift = playing ? -kappa * S.speed * 2.2 : 0;
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
      // gun fires while SPRAY is held, or on the skip-line timer (3 m on, 7 m off) when AUTO is on
      const inDashAt = x => { const rel = x - DASH_START; return rel >= 0 && rel < dashes.length * DASH_EVERY && (rel % DASH_EVERY) < DASH_ON; };
      // latch mode: one tap of SPRAY lays exactly one 3 m dash from wherever the gun is, then shuts off
      const pressEdge = input.sprayTap || (input.spray && !S.sprayWas); S.sprayWas = input.spray; input.sprayTap = false;
      if (S.latch && playing && pressEdge && !(S.latchEnd > gunS)) { S.latchStart = gunS; S.latchEnd = gunS + DASH_ON; }
      const holdSpray = input.spray && !S.latch;
      const inLatch = x => S.latch && S.latchEnd != null && x >= S.latchStart && x < S.latchEnd;
      const firing = playing && S.litres > 0 && (holdSpray || inLatch(gunS) || (S.auto && inDashAt(gunS)));
      if (firing && !S.spraying) blip(180, .08, 'triangle', .05);
      S.spraying = firing;
      if (A) { A.o1.frequency.value = 38 + S.speed * 6; A.o2.frequency.value = 76 + S.speed * 12; A.sg.gain.value = S.spraying ? .12 : 0; }

      if (playing && S.hasPrev && gunS - S.gunSPrev > 0.0005 && S.litres > 0) {
        // walk this frame's travel piece by piece, splitting at every dash start/end so ends come out square
        let a = S.gunSPrev;
        const b = gunS, la = S.gunLatPrev, lb = gunLat;
        while (a < b - 1e-6) {
          const rel = a - DASH_START;
          let next = b;
          if (rel >= 0) { const m = rel % DASH_EVERY, base = a - m; next = Math.min(b, m < DASH_ON ? base + DASH_ON : base + DASH_EVERY); }
          else next = Math.min(b, DASH_START);
          if (S.latchEnd != null) { if (S.latchStart > a && S.latchStart < next) next = S.latchStart; if (S.latchEnd > a && S.latchEnd < next) next = S.latchEnd; }
          if (next - a < 1e-6) next = Math.min(b, a + 0.01);
          const mid = (a + next) / 2, inDash = inDashAt(mid);
          if (holdSpray || inLatch(mid) || (S.auto && inDash)) {
            const t0 = (a - S.gunSPrev) / (b - S.gunSPrev), t1 = (next - S.gunSPrev) / (b - S.gunSPrev);
            const l0 = lerp(la, lb, t0), l1 = lerp(la, lb, t1), ds = next - a;
            addPaint(a, l0, next, l1);
            S.painted.push([a, next]); if (S.painted.length > 400) S.painted.splice(0, 100);
            S.litres = Math.max(0, S.litres - ds * L_PER_M);
            const onLine = Math.abs((l0 + l1) / 2) < ON_LINE;
            const k = Math.floor((mid - DASH_START) / DASH_EVERY);
            if (inDash && onLine) { S.good += ds; dashes[k].cover += ds; S.score += ds * 10 * S.combo; }
            else {
              S.waste += ds; S.score -= ds * (inDash ? 6 : 14);
              if (inDash) { if (dashes[k]) dashes[k].offLine += ds; }
              else {
                // paint in a gap counts against the nearest dash: the first 3.5 m after a dash is overrun, the rest is run-in to the next
                const rel = mid - DASH_START, m = ((rel % DASH_EVERY) + DASH_EVERY) % DASH_EVERY;
                const kk = rel < 0 ? 0 : (m < DASH_ON + 3.5 ? Math.floor(rel / DASH_EVERY) : Math.floor(rel / DASH_EVERY) + 1);
                if (dashes[kk]) { dashes[kk].over += ds; if (kk === Math.floor(rel / DASH_EVERY) && rel >= 0) dashes[kk].late = (dashes[kk].late || 0) + ds; else dashes[kk].early = (dashes[kk].early || 0) + ds; }
              }
            }
          }
          a = next;
        }
      }
      S.gunSPrev = gunS; S.gunLatPrev = gunLat; S.hasPrev = playing;
      if (S.spraying) {
        // mist
        const np = U.nozzle.getWorldPosition(tmp);
        for (let e = 0; e < 6; e++) {
          const i = pNext; pNext = (pNext + 1) % NP;
          pPos[i * 3] = np.x; pPos[i * 3 + 1] = np.y - 0.03; pPos[i * 3 + 2] = np.z;
          pVel[i * 3] = (Math.random() - .5) * .5; pVel[i * 3 + 1] = -1.5 - Math.random(); pVel[i * 3 + 2] = (Math.random() - .5) * .5;
          pLife[i] = 0.12 + Math.random() * .1;
        }
      }
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
        // wait until the gun is 3.5 m past the dash so any overrun into the gap is counted
        if (d.done || d.s1 > gunS - 3.5) { if (d.s0 > gunS) break; continue; }
        d.done = true;
        const c = d.cover / DASH_ON;
        // a clean re-mark: nearly all of the old dash covered, overrun within a fair allowance for thumb timing at this speed
        const allow = 0.3 + S.speed * 0.05; // 0.5 m at 15 km/h, 0.85 m at 40 km/h
        if (d.over > allow + 0.6) { S.combo = 1; S.score -= 60; pop('OVERSPRAY', 'bad'); blip(160, .2, 'square', .05); }
        else if (c < 0.5 && d.offLine > 1) { S.combo = 1; pop('OFF LINE', 'bad'); }
        else if (c >= 0.85 && d.over <= allow) { S.perfect++; S.combo = Math.min(8, S.combo + 1); S.bestCombo = Math.max(S.bestCombo, S.combo); S.score += 100 * S.combo * (0.6 + S.speed / 7); pop(S.combo > 2 ? 'PERFECT ×' + S.combo : 'PERFECT', 'good'); blip(660 + S.combo * 60, .12); }
        else if (c > 0.5) {
          S.score += 40;
          const late = d.late || 0, early = d.early || 0;
          // short because the dash was started late or early, or simply long
          pop(c < 0.85 ? (late > 0.2 && late >= early ? 'GOOD · TAP EARLIER' : early > 0.2 ? 'GOOD · TAP LATER' : 'GOOD · A BIT SHORT')
            : 'GOOD · A BIT LONG');
        }
        else { S.missed++; if (S.combo > 1) pop('MISSED', 'bad'); S.combo = 1; }
      }

      // yellow gun (reseal jobs): mounted 200 mm inboard of the white gun, so with the white on the centre line
      // the yellow lands on the no-passing line. Latch on the yellow lays one 13 m advance-warning stripe.
      if (job.seal === 'new') {
        const yLat = gunLat + YEL_LAT;
        const yEdge = input.yellowTap || (input.yellow && !S.yWas); S.yWas = input.yellow; input.yellowTap = false;
        if (S.latch && playing && yEdge && !(S.latchYEnd > gunS)) { S.latchYStart = gunS; S.latchYEnd = gunS + job.awLen; }
        const yHold = input.yellow && !S.latch;
        const inLY = x => S.latch && S.latchYEnd != null && x >= S.latchYStart && x < S.latchYEnd;
        S.ySpraying = playing && S.litres > 0 && (yHold || inLY(gunS));
        if (playing && S.yPrev != null && gunS - S.yPrev > 0.0005 && S.litres > 0) {
          const bounds = [];
          yel.forEach(e => bounds.push(e.s0, e.s1)); if (S.latchYEnd != null) bounds.push(S.latchYStart, S.latchYEnd);
          let a = S.yPrev; const b = gunS, la = S.yLatPrev, lb = yLat;
          while (a < b - 1e-6) {
            let next = b; for (const v of bounds) if (v > a + 1e-6 && v < next) next = v;
            const mid = (a + next) / 2;
            if (yHold || inLY(mid)) {
              const t0 = (a - S.yPrev) / (b - S.yPrev), t1 = (next - S.yPrev) / (b - S.yPrev), l0 = lerp(la, lb, t0), l1 = lerp(la, lb, t1), ds = next - a;
              yellowPaint.add(a, l0, next, l1); S.paintedY.push([a, next]); if (S.paintedY.length > 400) S.paintedY.splice(0, 100);
              S.litres = Math.max(0, S.litres - ds * L_PER_M);
              const rel = (l0 + l1) / 2 - YEL_LAT; // how far off the no-passing line position
              const e = yel.find(e => mid >= e.s0 && mid < e.s1);
              if (e && Math.abs(rel) < ON_LINE) { e.cover += ds; S.good += ds; S.score += ds * 8 * S.combo; }
              else {
                S.waste += ds; S.score -= ds * 14;
                if (e) e.off += ds;
                else { const n = yel.find(e => mid >= e.s0 - 3.5 && mid < e.s1 + 3.5); if (n) n.over += ds; else S.strayY += ds; }
              }
            }
            a = next;
          }
        }
        S.yPrev = playing ? gunS : null; S.yLatPrev = yLat;
        if (playing) for (const e of yel) { // grade yellow 3.5 m after the gun passes
          if (e.done || e.s1 > gunS - 3.5) continue;
          e.done = true;
          const c = e.cover / (e.s1 - e.s0), allow = 0.3 + S.speed * 0.05;
          if (e.kind === 'aw') {
            if (c >= 0.85 && e.over <= allow) { S.yOk++; S.combo = Math.min(8, S.combo + 1); S.score += 150 * S.combo; pop('STRIPE ' + e.n + '/' + job.awStripes + ' ✓', 'good'); blip(700 + e.n * 60, .12); }
            else if (c < 0.3) { S.combo = 1; pop('MISSED STRIPE ' + e.n, 'bad'); }
            else pop(e.over > allow ? 'STRIPE ' + e.n + ' · TOO LONG' : 'STRIPE ' + e.n + ' · SHORT');
          } else if (c >= 0.92 && e.off < 2) { S.yOk++; S.score += 800; pop('NO-PASSING LINE ✓ +800', 'good'); blip(523, .2); setTimeout(() => blip(784, .3), 150); }
          else { S.combo = 1; pop(c < 0.5 ? 'NO-PASSING LINE MISSING' : 'GAPS IN THE NO-PASSING LINE', 'bad'); }
        }
        if (S.strayY - S.strayWarned > 2) { S.strayWarned = S.strayY; S.combo = 1; S.score -= 200; pop('YELLOW WHERE IT SHOULDN\'T BE', 'bad'); }
        if (A && S.ySpraying) A.sg.gain.value = .12;
      }

      // quick calls: the game stops and asks; only the right call keeps the top score in reach
      if (playing) for (const c of job.calls) if (!c.done && S.s >= c.at) { c.done = true; openCall(c); break; }

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

      // every so often a streaker sprints across ahead, security guard in pursuit
      if (playing && !runners) {
        S.nextStreak = (S.nextStreak == null ? 30 : S.nextStreak) - dt;
        if (S.nextStreak <= 0 && S.s < JOB_LEN - 120) {
          const dir = rnd() < .5 ? 1 : -1, ahead = Math.max(32, S.speed * 5);
          const st = buildPerson('streaker'), gd = buildPerson('guard');
          scene.add(st.g); scene.add(gd.g);
          runners = { streaker: st, guard: gd, s: S.s + ahead, lat: -14 * dir, dir, t: 0, waste0: S.waste, good0: S.good };
          pop('STREAKER!', 'bad'); whistle();
        }
      }
      if (runners) {
        const R = runners; R.t += dt; R.lat += R.dir * 6.2 * dt;
        const h = sample(R.s).h;
        [[R.streaker, R.lat, 0], [R.guard, R.lat - R.dir * 3.2, 0.6]].forEach(([pp, l, ph]) => {
          pt(R.s + ph, l, 0, pp.g.position); pp.g.rotation.y = -h + (R.dir > 0 ? -Math.PI / 2 : Math.PI / 2);
          animatePerson(pp, R.t + ph, 6.2);
        });
        if (Math.floor(R.t * 1.4) !== Math.floor((R.t - dt) * 1.4)) whistle();
        if (R.lat * R.dir > 16) {
          scene.remove(R.streaker.g); scene.remove(R.guard.g);
          if (S.good - R.good0 > 0.5 && S.waste - R.waste0 < 0.3) { S.score += 150; pop('EYES ON THE LINE +150', 'good'); blip(880, .15); }
          runners = null; S.nextStreak = 60 + rnd() * 60;
        }
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
        hud.aim.className = Math.abs(gunLat) < ON_LINE ? 'on' : '';
        drawStrip(gunS, gunLat);
        void ahead;
      }
      if (popT > 0) { popT -= dt; if (popT <= 0) hud.pop.className = 'u3-pop'; }
    }

    // ---------- loop ----------
    let raf = 0, last = performance.now(), running = true;
    function frame(now) {
      if (!running) return;
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (S.state === 'call') {
        if (activeCall && !activeCall.answered) {
          callTimer -= dt; const bar = root.querySelector('.u3-call-time i'); if (bar) bar.style.width = Math.max(0, callTimer / 12 * 100) + '%';
          if (callTimer <= 0) answerCall(-1);
        }
        update(0);
      } else update(dt);
      renderer.render(scene, camera);
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    function onVis() { if (document.hidden) { running = false; cancelAnimationFrame(raf); if (A) A.ac.suspend(); } else if (!running && G) { running = true; last = performance.now(); raf = requestAnimationFrame(frame); if (A) A.ac.resume(); } }
    document.addEventListener('visibilitychange', onVis);

    // ---------- controls ----------
    const keyMap = { y: 'yellow', Y: 'yellow', '1': 'yellow', ArrowLeft: 'left', a: 'left', A: 'left', '4': 'left', ArrowRight: 'right', d: 'right', D: 'right', '6': 'right', ' ': 'spray', '5': 'spray', ArrowUp: 'up', w: 'up', W: 'up', '8': 'up', ArrowDown: 'down', s: 'down', S: 'down', '2': 'down' };
    function onKey(e) {
      const down = e.type === 'keydown';
      if (S.state === 'call') { // answer with 1-4, Enter carries on after Bruce's card
        if (!down) return;
        e.preventDefault(); e.stopPropagation();
        const n = parseInt(e.key, 10);
        if (activeCall && !activeCall.answered && n >= 1 && n <= activeCall.c.options.length) answerCall(n - 1);
        else if (activeCall && activeCall.answered && (e.key === 'Enter' || e.key === ' ')) closeCall();
        return;
      }
      if (down && (e.key === 'Escape')) { e.preventDefault(); return api.close(); }
      if (down && (e.key === 'c' || e.key === 'C' || e.key === '3')) { e.preventDefault(); return cycleCam(); }
      if (down && (e.key === 't' || e.key === 'T' || e.key === '9')) { e.preventDefault(); return toggleAuto(); }
      if (down && (e.key === 'l' || e.key === 'L' || e.key === '7')) { e.preventDefault(); return toggleLatch(); }
      if (down && (e.key === 'Enter' || e.key === '=') && S.state !== 'play' && S.state !== 'count') { e.preventDefault(); return reset(); }
      const k = keyMap[e.key]; if (!k) return;
      e.preventDefault(); e.stopPropagation(); input[k] = down;
      if (k === 'spray' && down && !e.repeat) input.sprayTap = true; // remembered even if released before the next frame
      if (k === 'yellow' && down && !e.repeat) input.yellowTap = true;
    }
    window.addEventListener('keydown', onKey, true); window.addEventListener('keyup', onKey, true);
    function toggleAuto() {
      S.auto = !S.auto; store.set('ute3dAutoV6', S.auto); syncAuto();
      pop(S.auto ? 'AUTO GUN ON' : 'MANUAL GUN');
    }
    function toggleLatch() {
      S.latch = !S.latch; S.latchEnd = null; store.set('ute3dLatchV8', S.latch); syncAuto();
      pop(S.latch ? 'LATCH ON · TAP = 3 M' : 'LATCH OFF · HOLD TO PAINT');
    }
    function syncAuto() {
      root.querySelectorAll('[data-act="latch"]').forEach(b => { b.textContent = S.latch ? 'Latch: on' : 'Latch: off'; b.setAttribute('aria-pressed', String(S.latch)); });
      root.querySelectorAll('[data-act="auto"]').forEach(b => { b.textContent = S.auto ? 'Auto gun: on' : 'Auto gun: off'; b.setAttribute('aria-pressed', String(S.auto)); });
    }
    function cycleCam() { S.cam = (S.cam + 1) % 4; pop(['CHASE CAM', 'GUN CAM', 'CAB CAM', 'ROADSIDE CAM'][S.cam]); }
    root.querySelectorAll('[data-hold]').forEach(b => {
      const k = b.dataset.hold;
      const on = e => { e.preventDefault(); input[k] = true; if (k === 'spray') input.sprayTap = true; if (k === 'yellow') input.yellowTap = true; b.classList.add('down'); try { b.setPointerCapture(e.pointerId); } catch (_) {} };
      const off = () => { input[k] = false; b.classList.remove('down'); };
      b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('lostpointercapture', off);
    });
    const clicks = {
      pick: () => { S.state = 'title'; root.querySelectorAll('[data-best]').forEach(el => { el.textContent = 'Best ' + store.get('ute3dBest-' + el.dataset.best, 0).toLocaleString('en-NZ'); }); showPanel('title'); },
      start: () => reset(JOBS.remark), again: () => reset(job), job: b => reset(JOBS[b.dataset.job] || JOBS.remark), opt: b => answerCall(+b.dataset.opt), gotit: () => closeCall(), cam: cycleCam, auto: toggleAuto, latch: toggleLatch, exit: () => api.close(),
      mute: () => { const m = !store.get('ute3dMute', false); store.set('ute3dMute', m); if (A) A.master.gain.value = m ? 0 : .9; root.querySelector('[data-act="mute"]').textContent = m ? 'Sound: off' : 'Sound: on'; }
    };
    function onClick(e) { const b = e.target.closest('[data-act]'); if (b && clicks[b.dataset.act]) { e.preventDefault(); clicks[b.dataset.act](b); } }
    root.addEventListener('click', onClick);
    root.querySelector('[data-act="mute"]').textContent = store.get('ute3dMute', false) ? 'Sound: off' : 'Sound: on';
    root.querySelectorAll('[data-best]').forEach(el => { el.textContent = 'Best ' + store.get('ute3dBest-' + el.dataset.best, 0).toLocaleString('en-NZ'); });
    showPanel('title'); syncAuto();

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
      _state: S, _scene: scene, _ute: U, _camera: camera
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
