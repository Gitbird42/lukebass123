/* Takeaway Fighter — food fighters settle what's for dinner.
   Rigged on purpose: Star of India butter chicken is the champ, Chada Thai's prawn can take it,
   and KFC / McDonald's never, ever win. */
(function () {
  'use strict';

  // ---------- the roster ----------
  // rig: champ / strong / contender / rare / never. dmg = damage dealt, armor = damage taken.
  const RIG = {
    champ: { dmg: 1.35, armor: 0.72 },
    strong: { dmg: 1.12, armor: 0.88 },
    contender: { dmg: 1.22, armor: 0.86 },
    rare: { dmg: 0.92, armor: 1.04 },
    never: { dmg: 0.88, armor: 1.1 }
  };
  const FIGHTERS = [
    { id: 'butter', name: 'Butter Chicken', shop: 'Star of India', rig: 'champ', speed: 1.0, special: 'CURRY BLAST', win: 'Extra naan for everyone!', col: '#f2902b', col2: '#fff3d6' },
    { id: 'prawn', name: 'Prawn', shop: 'Chada Thai', rig: 'contender', speed: 1.25, special: 'CHILLI WAVE', win: 'Pad Thai, prawns, extra chilli!', col: '#ff8a72', col2: '#ffd2c4' },
    { id: 'block', name: 'Block of Butter', shop: 'Star of India', rig: 'strong', speed: 0.85, special: 'MELT SLIDE', win: 'Butter makes it better.', col: '#ffe066', col2: '#fff7cc' },
    { id: 'fried', name: 'Fried Chicken', shop: 'KFC', rig: 'never', speed: 1.0, special: 'BUCKET BASH', win: '', col: '#c8751e', col2: '#f2b25a' },
    { id: 'bigmac', name: 'Big Mac', shop: "McDonald's", rig: 'never', speed: 0.9, special: 'SPECIAL SAUCE', win: '', col: '#c9853c', col2: '#5a2d14' },
    { id: 'nugget', name: 'Nugget', shop: "McDonald's", rig: 'never', speed: 1.15, special: 'SAUCE SHOT', win: '', col: '#e2a945', col2: '#f6d27e' },
    { id: 'chook', name: 'Actual Chicken', shop: 'Cook at home', rig: 'rare', speed: 1.2, special: 'EGG BOMB', win: 'Roast chook at home tonight!', col: '#fbfbf6', col2: '#e23a2a' },
    { id: 'broc', name: 'Broccoli', shop: 'Cook at home', rig: 'rare', speed: 1.05, special: 'VITAMIN BEAM', win: 'Cook at home... with veges. Sorry.', col: '#3fa34d', col2: '#2b7a35' }
  ];
  const BYID = Object.fromEntries(FIGHTERS.map(f => [f.id, f]));
  const NEVER_LINES = {
    "McDonald's": ["Ice cream machine's broken!", 'Wrong order at the window!', 'Fries went cold!', 'Stuck in the drive-thru!', 'Forgot the sauce!'],
    KFC: ['Out of Original Recipe!', 'Bucket was half empty!', 'Gravy spilt!', 'Ran out of chips!']
  };

  // ---------- canvas + stage ----------
  const W = 960, H = 540, FLOOR = 452;
  let cv, g, raf = 0;
  let audio = null;

  // ---------- sound: punchy little synth hits ----------
  function sfx(type) {
    try {
      if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
      const a = audio, t = a.currentTime;
      const o = a.createOscillator(), gn = a.createGain(); o.connect(gn); gn.connect(a.destination);
      const map = { hit: [140, 60, .25, 'square', .12], kick: [110, 40, .3, 'sawtooth', .14], block: [420, 380, .12, 'triangle', .06],
        special: [220, 880, .4, 'sawtooth', .09], ko: [200, 40, .9, 'square', .16], whoosh: [600, 200, .12, 'triangle', .04], bell: [880, 880, .5, 'sine', .12], fail: [300, 120, .5, 'square', .08] };
      const [f0, f1, d, ty, v] = map[type] || map.hit;
      o.type = ty; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + d);
      gn.gain.setValueAtTime(v, t); gn.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.start(t); o.stop(t + d);
    } catch (e) { /* no sound, no worries */ }
  }

  // ---------- drawing helpers ----------
  function rr(x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function ell(x, y, rx, ry, fill, stroke) { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = 3; g.stroke(); } }
  const INK = '#1b1410';
  function eyes(x, y, mood, sp) {
    sp = sp || 16;
    [-1, 1].forEach(s => {
      ell(x + s * sp / 2, y, 8, 9, '#fff', INK);
      const px = mood === 'hurt' ? 0 : 3;
      ell(x + s * sp / 2 + px, y + 1, 3.6, 4.2, INK);
    });
    g.strokeStyle = INK; g.lineWidth = 4; g.lineCap = 'round';
    g.beginPath(); // angry fighting brows
    if (mood === 'hurt') { g.moveTo(x - sp / 2 - 7, y - 13); g.lineTo(x - sp / 2 + 6, y - 9); g.moveTo(x + sp / 2 + 7, y - 13); g.lineTo(x + sp / 2 - 6, y - 9); }
    else { g.moveTo(x - sp / 2 - 7, y - 15); g.lineTo(x - sp / 2 + 6, y - 10); g.moveTo(x + sp / 2 - 6, y - 10); g.lineTo(x + sp / 2 + 7, y - 15); }
    g.stroke();
  }
  function mouth(x, y, mood) {
    g.strokeStyle = INK; g.lineWidth = 4; g.lineCap = 'round'; g.beginPath();
    if (mood === 'hurt') { g.arc(x, y + 8, 7, Math.PI * 1.15, Math.PI * 1.85); }
    else if (mood === 'yell') { g.fillStyle = '#6b1a14'; g.ellipse(x, y + 2, 8, 7, 0, 0, Math.PI * 2); g.fill(); g.stroke(); return; }
    else { g.moveTo(x - 8, y); g.quadraticCurveTo(x, y + 6, x + 8, y - 2); }
    g.stroke();
  }
  // limbs: stubby cartoon arms and legs with gloves and sneakers
  function arm(sx, sy, ex, ey, glove) {
    g.strokeStyle = INK; g.lineWidth = 9; g.lineCap = 'round'; g.beginPath(); g.moveTo(sx, sy); g.lineTo(ex, ey); g.stroke();
    g.strokeStyle = '#f4e4c8'; g.lineWidth = 5; g.beginPath(); g.moveTo(sx, sy); g.lineTo(ex, ey); g.stroke();
    ell(ex, ey, 11, 10, glove || '#d8262c', INK);
  }
  function leg(sx, sy, ex, ey, shoe) {
    g.strokeStyle = INK; g.lineWidth = 10; g.lineCap = 'round'; g.beginPath(); g.moveTo(sx, sy); g.lineTo(ex, ey); g.stroke();
    g.strokeStyle = '#f4e4c8'; g.lineWidth = 6; g.beginPath(); g.moveTo(sx, sy); g.lineTo(ex, ey); g.stroke();
    rr(ex - 9, ey - 6, 22, 12, 6); g.fillStyle = shoe || '#f5f5f5'; g.fill(); g.strokeStyle = INK; g.lineWidth = 3; g.stroke();
  }

  // body art per fighter, drawn facing right, centred on (0,0) = middle of the body
  const BODY = {
    butter(m) { // a bowl of butter chicken with a cream swirl and chicken chunks
      g.beginPath(); g.moveTo(-52, -6); g.quadraticCurveTo(-48, 48, 0, 50); g.quadraticCurveTo(48, 48, 52, -6); g.closePath();
      g.fillStyle = '#d9d2c4'; g.fill(); g.strokeStyle = INK; g.lineWidth = 4; g.stroke();          // bowl
      g.fillStyle = '#3b6fb5'; g.fillRect(-46, 18, 92, 7);                                           // bowl band
      ell(0, -8, 54, 18, '#e8761d', INK);                                                             // curry surface
      ell(-22, -12, 10, 7, '#f6c48a', INK); ell(14, -4, 11, 7, '#f6c48a', INK); ell(30, -14, 8, 6, '#f6c48a', INK);
      g.strokeStyle = '#fff6e4'; g.lineWidth = 4; g.beginPath(); g.arc(-2, -10, 12, 0.2, Math.PI * 1.6); g.stroke();
      g.fillStyle = '#3f8f3a'; g.beginPath(); g.ellipse(8, -22, 7, 3, -0.5, 0, Math.PI * 2); g.fill();  // coriander
      eyes(0, 22, m, 22); mouth(0, 34, m);
      g.fillStyle = '#d43b2a'; rr(-40, -34, 80, 8, 4); g.fill();                                      // headband
    },
    prawn(m) { // a curled pink prawn with antennae and a red headband
      g.lineCap = 'round';
      g.strokeStyle = INK; g.lineWidth = 46; g.beginPath(); g.arc(-4, 6, 30, -Math.PI * 0.55, Math.PI * 0.9); g.stroke();
      g.strokeStyle = '#ff8a72'; g.lineWidth = 40; g.beginPath(); g.arc(-4, 6, 30, -Math.PI * 0.55, Math.PI * 0.9); g.stroke();
      g.strokeStyle = '#ffb3a1'; g.lineWidth = 4;
      for (let i = 0; i < 5; i++) { const a = -Math.PI * 0.4 + i * 0.32; g.beginPath(); g.arc(-4, 6, 30, a, a + 0.08); g.stroke(); }
      g.fillStyle = '#ff6a4d'; g.beginPath(); g.moveTo(-36, 34); g.lineTo(-58, 46); g.lineTo(-40, 50); g.lineTo(-30, 40); g.closePath(); g.fill(); g.strokeStyle = INK; g.lineWidth = 3; g.stroke(); // tail fan
      g.strokeStyle = INK; g.lineWidth = 2.5; g.beginPath(); g.moveTo(18, -26); g.quadraticCurveTo(40, -70, 70, -60); g.moveTo(10, -26); g.quadraticCurveTo(26, -76, 52, -78); g.stroke();
      eyes(12, -10, m, 16); mouth(14, 4, m);
      g.fillStyle = '#d43b2a'; rr(-8, -34, 40, 7, 3); g.fill();
    },
    block(m) { // a block of butter, half unwrapped from its foil
      g.fillStyle = '#ffe066'; rr(-44, -46, 88, 96, 8); g.fill(); g.strokeStyle = INK; g.lineWidth = 4; g.stroke();
      g.fillStyle = '#fff4b8'; rr(-40, -42, 80, 16, 6); g.fill();
      g.fillStyle = '#c9ced6'; g.beginPath(); g.moveTo(-46, 10); g.lineTo(46, 4); g.lineTo(46, 52); g.lineTo(-46, 52); g.closePath(); g.fill(); g.strokeStyle = INK; g.lineWidth = 3; g.stroke(); // foil
      g.fillStyle = '#1d4e9e'; g.font = 'bold 13px Arial'; g.textAlign = 'center'; g.fillText('BUTTER', 0, 36);
      eyes(0, -8, m, 22); mouth(0, 4, m);
    },
    fried(m) { // a crumbed drumstick with a bone handle
      g.fillStyle = '#f2ead8'; rr(-10, 34, 20, 26, 6); g.fill(); g.strokeStyle = INK; g.lineWidth = 3; g.stroke();
      ell(-10, 60, 9, 8, '#f2ead8', INK); ell(10, 60, 9, 8, '#f2ead8', INK);
      g.beginPath(); g.ellipse(0, -6, 44, 50, 0, 0, Math.PI * 2); g.fillStyle = '#c8751e'; g.fill(); g.strokeStyle = INK; g.lineWidth = 4; g.stroke();
      g.fillStyle = '#e09a3c'; for (let i = 0; i < 14; i++) { const a = i * 2.4, r = 10 + (i * 7) % 30; ell(Math.cos(a) * r, -6 + Math.sin(a) * r, 5, 4, '#e09a3c'); }
      eyes(0, -12, m, 22); mouth(0, 4, m);
    },
    bigmac(m) { // sesame bun, two patties, cheese, lettuce, special sauce
      g.fillStyle = '#c9853c'; g.beginPath(); g.ellipse(0, -30, 50, 26, 0, Math.PI, 0); g.closePath(); g.fill(); g.strokeStyle = INK; g.lineWidth = 4; g.stroke();
      g.fillStyle = '#fff1cf'; for (let i = 0; i < 7; i++) ell(-30 + i * 10, -40 - (i % 2) * 6, 3, 1.8, '#fff1cf');
      g.fillStyle = '#4fae3a'; g.fillRect(-52, -30, 104, 6);
      g.fillStyle = '#5a2d14'; rr(-50, -24, 100, 14, 6); g.fill(); g.stroke();
      g.fillStyle = '#f7c531'; g.beginPath(); g.moveTo(-50, -10); g.lineTo(50, -10); g.lineTo(42, -2); g.lineTo(-44, -2); g.closePath(); g.fill();
      g.fillStyle = '#d7a35c'; rr(-50, -2, 100, 10, 4); g.fill(); g.stroke();                      // middle bun
      g.fillStyle = '#5a2d14'; rr(-50, 8, 100, 14, 6); g.fill(); g.stroke();
      g.fillStyle = '#f2a36e'; g.fillRect(-48, 22, 96, 4);                                             // special sauce
      g.fillStyle = '#c9853c'; rr(-48, 26, 96, 20, 9); g.fill(); g.stroke();
      eyes(0, -38, m, 22); mouth(0, 38, m);
    },
    nugget(m) { // pale golden lumpy slab with a rough crumb coat and crispy edges (drawn from Luke's reference)
      const shape = () => {
        g.beginPath(); g.moveTo(-44, -26); g.quadraticCurveTo(-36, -46, -12, -44); g.quadraticCurveTo(4, -52, 22, -44);
        g.quadraticCurveTo(48, -40, 48, -14); g.quadraticCurveTo(56, 6, 44, 24); g.quadraticCurveTo(40, 46, 14, 44);
        g.quadraticCurveTo(-6, 52, -26, 44); g.quadraticCurveTo(-52, 40, -48, 14); g.quadraticCurveTo(-58, -6, -44, -26); g.closePath();
      };
      shape(); const grad = g.createRadialGradient(-6, -10, 6, 0, 0, 58);
      grad.addColorStop(0, '#f6d77c'); grad.addColorStop(0.65, '#ecbd52'); grad.addColorStop(1, '#c98b2a'); // crisp, darker edges
      g.fillStyle = grad; g.fill(); g.strokeStyle = INK; g.lineWidth = 4; g.stroke();
      g.save(); shape(); g.clip(); // rough crumb: pale flecks and little golden craters
      for (let i = 0; i < 70; i++) { const x = ((i * 37) % 100) - 50, y = ((i * 53) % 96) - 48; ell(x, y, 1.6 + (i % 3), 1.2 + (i % 2), i % 4 ? 'rgba(255,240,190,.75)' : 'rgba(176,112,24,.55)'); }
      [[-20, -22, 7], [16, -28, 5], [26, 10, 6], [-28, 20, 5]].forEach(([x, y, r]) => ell(x, y, r, r * 0.7, 'rgba(214,150,40,.55)'));
      g.restore();
      eyes(2, -8, m, 20); mouth(2, 8, m);
    },
    chook(m) { // an actual live chicken: white hen, red comb and wattle, yellow beak
      ell(-6, 8, 44, 40, '#fbfbf6', INK);
      g.fillStyle = '#ecece2'; g.beginPath(); g.ellipse(-20, 14, 22, 14, -0.4, 0, Math.PI * 2); g.fill();  // wing
      g.fillStyle = '#fbfbf6'; g.beginPath(); g.moveTo(-44, -6); g.lineTo(-64, -30); g.lineTo(-58, 4); g.closePath(); g.fill(); g.strokeStyle = INK; g.lineWidth = 3; g.stroke(); // tail
      ell(18, -30, 24, 24, '#fbfbf6', INK);                                                           // head
      g.fillStyle = '#e23a2a'; [8, 18, 28].forEach((x, i) => ell(x, -56 - (i === 1 ? 4 : 0), 6, 8, '#e23a2a', INK)); // comb
      g.fillStyle = '#f6b21a'; g.beginPath(); g.moveTo(38, -32); g.lineTo(54, -26); g.lineTo(38, -22); g.closePath(); g.fill(); g.stroke(); // beak
      ell(38, -14, 5, 8, '#e23a2a', INK);                                                             // wattle
      eyes(20, -36, m, 14);
    },
    broc(m) { // a broccoli: green florets on a pale stalk
      g.fillStyle = '#b8d98a'; g.beginPath(); g.moveTo(-18, 0); g.lineTo(18, 0); g.lineTo(14, 50); g.lineTo(-14, 50); g.closePath(); g.fill(); g.strokeStyle = INK; g.lineWidth = 4; g.stroke();
      [[-30, -14, 22], [0, -30, 26], [30, -14, 22], [-14, -40, 18], [16, -42, 18], [0, -8, 22]].forEach(([x, y, r]) => ell(x, y, r, r, '#3fa34d', INK));
      g.fillStyle = '#2b7a35'; for (let i = 0; i < 16; i++) ell(-34 + (i * 13) % 68, -46 + (i * 7) % 40, 3, 3, '#2b7a35');
      eyes(0, 20, m, 18); mouth(0, 32, m);
    }
  };
  const SHOES = { butter: '#f5f5f5', prawn: '#ffcc00', block: '#1d4e9e', fried: '#e4002b', bigmac: '#ffc72c', nugget: '#ffc72c', chook: '#f6b21a', broc: '#6b4a2b' };
  const GLOVES = { butter: '#d8262c', prawn: '#d8262c', block: '#1d4e9e', fried: '#e4002b', bigmac: '#e4002b', nugget: '#e4002b', chook: '#f6b21a', broc: '#2b7a35' };

  // ---------- fighters in play ----------
  function makeFighter(id, side, cpu) {
    const d = BYID[id];
    return { d, id, x: side < 0 ? 270 : 690, y: FLOOR, vx: 0, vy: 0, face: side < 0 ? 1 : -1, hp: 100, shown: 100,
      state: 'idle', t: 0, atkHit: false, block: false, cpu, cool: 0, ai: { think: 0, plan: 'approach' }, flash: 0, wins: 0, saves: 0 };
  }
  const MOVES = {
    punch: { dur: 0.32, active: [0.08, 0.18], reach: 92, dmg: 6, push: 120 },
    kick: { dur: 0.46, active: [0.14, 0.28], reach: 112, dmg: 9, push: 180 },
    special: { dur: 0.6, active: [0.22, 0.26], reach: 0, dmg: 14, push: 260 }
  };

  let M = null; // the current match

  function startMatch(a, b, opts) {
    M = { A: makeFighter(a, -1, opts.cpuA), B: makeFighter(b, 1, opts.cpuB), shots: [], fx: [], texts: [],
      round: 1, rounds: opts.rounds || 1, timer: 60, state: 'intro', st: 0, speed: opts.speed || 1, onEnd: opts.onEnd, shake: 0 };
    say(M.A.d.name.toUpperCase() + '  VS  ' + M.B.d.name.toUpperCase(), 1.6, '#fff');
    sfx('bell');
  }
  function say(txt, dur, col, y) { M.texts.push({ txt, t: dur, dur, col: col || '#fff', y: y || 200 }); }

  function resetRound() {
    [M.A, M.B].forEach((f, i) => { f.x = i ? 690 : 270; f.y = FLOOR; f.vx = f.vy = 0; f.hp = f.shown = 100; f.state = 'idle'; f.t = 0; f.face = i ? -1 : 1; f.cool = 0; });
    M.shots = []; M.timer = 60; M.state = 'intro'; M.st = 0;
    say('ROUND ' + M.round, 1.2, '#ffd23a');
  }

  // ---------- the rig ----------
  function dealDamage(att, def, base, kind) {
    const ra = RIG[att.d.rig], rd = RIG[def.d.rig];
    let dmg = base * ra.dmg * rd.armor * (def.block ? 0.18 : 1);
    if (def.block) { sfx('block'); burst(def.x + def.face * 20, def.y - 70, '#9fe8ff', 6); }
    else { sfx(kind === 'kick' ? 'kick' : 'hit'); burst(def.x - def.face * 10, def.y - 70, '#ffe066', 10); M.shake = 0.18; def.state = 'hit'; def.t = 0; def.flash = 0.12; }
    // McDonald's and KFC never get the win: the knockout blow always goes wrong
    if (att.d.rig === 'never' && def.hp - dmg <= 0) {
      dmg = Math.max(0, def.hp - 4);
      const lines = NEVER_LINES[att.d.shop] || ['Nope!'];
      say(lines[att.saves % lines.length], 1.6, '#ff6a4d', 160); att.saves++;
      att.state = 'hit'; att.t = 0; att.vx = -att.face * 260; def.hp = Math.max(4, def.hp - dmg);
      sfx('fail'); return;
    }
    def.hp = Math.max(0, def.hp - dmg);
    def.vx = att.face * (def.block ? 60 : 1) * (MOVES[kind] ? MOVES[kind].push : 150);
  }

  // ---------- particles ----------
  function burst(x, y, col, n) { for (let i = 0; i < n; i++) M.fx.push({ x, y, vx: (Math.random() - .5) * 520, vy: -Math.random() * 420, t: 0.4 + Math.random() * 0.3, col, r: 3 + Math.random() * 5 }); }

  // ---------- inputs ----------
  const keys = {};
  const pad = { left: false, right: false, up: false, punch: false, kick: false, special: false, block: false };
  function want(name) { return pad[name] || keys[name]; }

  function act(f, move) {
    if (f.state === 'ko' || f.state === 'hit' || MOVES[f.state]) return;
    if (move === 'special') { if (f.cool > 0) return; f.cool = 3.2; }
    f.state = move; f.t = 0; f.atkHit = false; sfx('whoosh');
    if (move === 'special') say(f.d.special + '!', 0.9, f.d.col, 120);
  }

  // ---------- computer opponent ----------
  function think(f, o, dt) {
    f.ai.think -= dt;
    const dist = Math.abs(o.x - f.x);
    if (f.ai.think <= 0) {
      f.ai.think = 0.25 + Math.random() * 0.35;
      const r = Math.random();
      if (dist > 330 && f.cool <= 0 && r < 0.35) f.ai.plan = 'special';
      else if (dist > 130) f.ai.plan = r < 0.85 ? 'approach' : 'jump';
      else if (MOVES[o.state] && r < 0.45) f.ai.plan = 'block';
      else f.ai.plan = r < 0.5 ? 'punch' : r < 0.82 ? 'kick' : r < 0.9 ? 'back' : 'jump';
    }
    f.block = f.ai.plan === 'block';
    const dir = Math.sign(o.x - f.x);
    let move = 0;
    if (f.ai.plan === 'approach') move = dir;
    if (f.ai.plan === 'back') move = -dir;
    if (f.ai.plan === 'jump' && f.y >= FLOOR) { f.vy = -620; f.ai.plan = 'approach'; }
    if (['punch', 'kick', 'special'].includes(f.ai.plan)) { act(f, f.ai.plan); f.ai.plan = 'approach'; f.ai.think = 0.35; }
    return move;
  }

  // ---------- simulation ----------
  function step(dt) {
    if (!M) return;
    M.st += dt;
    if (M.state === 'intro') { if (M.st > 1.4) { M.state = 'fight'; M.st = 0; say('FIGHT!', 0.9, '#ff3b2f'); sfx('bell'); } }
    if (M.state === 'fight') { M.timer -= dt; if (M.timer <= 0) endRound(); }
    const both = [M.A, M.B];
    both.forEach(f => {
      const o = f === M.A ? M.B : M.A;
      f.t += dt; f.cool = Math.max(0, f.cool - dt); f.flash = Math.max(0, f.flash - dt);
      let move = 0;
      if (M.state === 'fight' && f.state !== 'ko') {
        if (f.cpu) move = think(f, o, dt);
        else {
          move = (want('right') ? 1 : 0) - (want('left') ? 1 : 0);
          f.block = !!want('block') && f.y >= FLOOR;
          if (want('up') && f.y >= FLOOR) f.vy = -640;
          ['punch', 'kick', 'special'].forEach(k => { if (want(k)) { act(f, k); pad[k] = false; keys[k] = false; } });
        }
      }
      if (f.block || MOVES[f.state] || f.state === 'hit' || f.state === 'ko') move = 0;
      const sp = 300 * f.d.speed;
      f.vx += (move * sp - f.vx) * Math.min(1, dt * 12);
      f.vy += 1900 * dt;
      f.x += f.vx * dt; f.y = Math.min(FLOOR, f.y + f.vy * dt); if (f.y >= FLOOR) f.vy = 0;
      f.x = Math.max(70, Math.min(W - 70, f.x));
      if (f.state !== 'ko' && !MOVES[f.state]) f.face = Math.sign(o.x - f.x) || f.face;
      // attacks connect during their active window
      const mv = MOVES[f.state];
      if (mv) {
        if (!f.atkHit && f.t >= mv.active[0] && f.t <= mv.active[1]) {
          if (f.state === 'special') { M.shots.push({ x: f.x + f.face * 60, y: f.y - 70, vx: f.face * 620, owner: f, t: 0 }); f.atkHit = true; sfx('special'); }
          else if (Math.abs(o.x - f.x) < mv.reach && Math.abs(o.y - f.y) < 90 && o.state !== 'ko') { dealDamage(f, o, mv.dmg, f.state); f.atkHit = true; }
        }
        if (f.t >= mv.dur) { f.state = 'idle'; f.t = 0; }
      }
      if (f.state === 'hit' && f.t > 0.3) { f.state = 'idle'; f.t = 0; }
      if (f.state === 'idle' && Math.abs(f.vx) > 30) f.state = 'walk';
      if (f.state === 'walk' && Math.abs(f.vx) <= 30) f.state = 'idle';
      f.shown += (f.hp - f.shown) * Math.min(1, dt * 6);
      if (f.hp <= 0 && f.state !== 'ko') { f.state = 'ko'; f.t = 0; f.vy = -500; f.vx = -f.face * 380; sfx('ko'); M.shake = 0.4; }
    });
    // bodies bump: no walking through each other
    { const dx = M.B.x - M.A.x, gap = 78; if (Math.abs(dx) < gap && Math.abs(M.A.y - M.B.y) < 80 && M.A.state !== 'ko' && M.B.state !== 'ko') {
      const push = (gap - Math.abs(dx)) / 2 * (Math.sign(dx) || 1); M.A.x -= push; M.B.x += push;
      M.A.x = Math.max(70, Math.min(W - 70, M.A.x)); M.B.x = Math.max(70, Math.min(W - 70, M.B.x)); } }
    // specials fly across the stage
    M.shots = M.shots.filter(s => {
      s.t += dt; s.x += s.vx * dt;
      const o = s.owner === M.A ? M.B : M.A;
      if (Math.abs(o.x - s.x) < 50 && Math.abs((o.y - 70) - s.y) < 70 && o.state !== 'ko') { dealDamage(s.owner, o, MOVES.special.dmg, 'special'); burst(s.x, s.y, s.owner.d.col, 16); return false; }
      return s.x > -60 && s.x < W + 60;
    });
    M.fx = M.fx.filter(p => { p.t -= dt; p.vy += 1200 * dt; p.x += p.vx * dt; p.y += p.vy * dt; return p.t > 0; });
    M.texts = M.texts.filter(t => (t.t -= dt) > 0);
    M.shake = Math.max(0, M.shake - dt);
    if (M.state === 'fight' && (M.A.hp <= 0 || M.B.hp <= 0)) { M.state = 'ko'; M.st = 0; say('K.O.!', 1.4, '#ff3b2f'); }
    if (M.state === 'ko' && M.st > 1.8) endRound();
    if (M.state === 'done' && M.st > 1.6) { const w = M.winner; const cb = M.onEnd; M = null; cb && cb(w); }
  }
  function endRound() {
    let w = M.A.hp === M.B.hp ? (RIG[M.A.d.rig].dmg >= RIG[M.B.d.rig].dmg ? M.A : M.B) : (M.A.hp > M.B.hp ? M.A : M.B);
    const l = w === M.A ? M.B : M.A;
    if (w.d.rig === 'never' && l.d.rig !== 'never') { w = l; say('JUDGES SAY NO', 1.4, '#ff6a4d', 160); } // on points they still lose
    if (M.state === 'fight') say('TIME!', 1.2, '#ffd23a');
    w.wins++;
    const need = Math.ceil(M.rounds / 2);
    if (w.wins >= need) { M.winner = w.id; M.state = 'done'; M.st = 0; say(w.d.name.toUpperCase() + ' WINS', 1.6, '#ffd23a', 260); sfx('bell'); }
    else { M.round++; resetRound(); }
  }

  // ---------- render ----------
  function drawStage() {
    const sky = g.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#1a1036'); sky.addColorStop(0.55, '#5a2350'); sky.addColorStop(1, '#2a1622');
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    // takeaway shop strip with neon signs
    const shops = [['CURRY', '#ff9a3c'], ['THAI', '#ff5ec4'], ['BURGERS', '#ffd23a'], ['CHICKEN', '#ff4a3a'], ['NOODLES', '#5ee0ff']];
    shops.forEach(([n, c], i) => {
      const x = 20 + i * 190, y = 150;
      g.fillStyle = '#20172c'; g.fillRect(x, y, 170, 260); g.fillStyle = '#120c1a'; g.fillRect(x + 20, y + 120, 130, 140);
      g.fillStyle = 'rgba(255,214,140,.35)'; g.fillRect(x + 26, y + 126, 118, 70);
      g.save(); g.shadowColor = c; g.shadowBlur = 18; g.fillStyle = c; g.font = 'bold 26px "Bungee", Impact, sans-serif'; g.textAlign = 'center'; g.fillText(n, x + 85, y + 60); g.restore();
    });
    g.fillStyle = '#3b2c38'; g.fillRect(0, FLOOR, W, H - FLOOR);
    g.fillStyle = '#4c3a48'; for (let x = 0; x < W; x += 60) g.fillRect(x, FLOOR, 2, H - FLOOR);
    g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(0, FLOOR, W, 4);
  }
  function drawFighter(f) {
    const mv = f.state, t = f.t, face = f.face;
    const bob = mv === 'idle' ? Math.sin(performance.now() / 180) * 3 : mv === 'walk' ? Math.abs(Math.sin(performance.now() / 90)) * -5 : 0;
    g.save();
    g.translate(f.x, f.y);
    ell(0, 2, 56, 10, 'rgba(0,0,0,.35)'); // shadow
    if (f.state === 'ko') g.rotate(-face * Math.min(1.4, t * 4));
    g.translate(0, -84 + bob); g.scale(face, 1);
    if (f.flash > 0) g.filter = 'brightness(2.2)';
    // legs
    const walk = mv === 'walk' ? Math.sin(performance.now() / 70) * 14 : 0;
    const kickOut = mv === 'kick' && t > 0.1 && t < 0.32;
    leg(-16, 40, -20 - walk, 80, SHOES[f.id]);
    if (kickOut) leg(14, 40, 92, 22, SHOES[f.id]); else leg(16, 40, 20 + walk, 80, SHOES[f.id]);
    // body
    const mood = f.state === 'hit' || f.state === 'ko' ? 'hurt' : (MOVES[f.state] ? 'yell' : 'fight');
    BODY[f.id](mood);
    // arms: guard up, jab out on a punch, both forward on a special, crossed when blocking
    const punchOut = mv === 'punch' && t > 0.05 && t < 0.24;
    const spec = mv === 'special' && t > 0.15;
    if (f.block) { arm(-30, 0, 30, -26, GLOVES[f.id]); arm(30, 4, 36, -6, GLOVES[f.id]); }
    else {
      arm(-38, 4, -24, -16, GLOVES[f.id]);
      arm(38, 4, punchOut ? 96 : spec ? 82 : 52, punchOut ? -14 : spec ? -4 : -18, GLOVES[f.id]);
      if (spec) arm(30, 12, 80, 10, GLOVES[f.id]);
    }
    g.restore();
  }
  function drawShot(s) {
    const c = s.owner.d.col;
    g.save(); g.translate(s.x, s.y);
    g.shadowColor = c; g.shadowBlur = 24;
    ell(0, 0, 30, 22, c); ell(-Math.sign(s.vx) * 18, 0, 16, 12, 'rgba(255,255,255,.7)');
    g.restore();
  }
  function drawHUD() {
    const bar = (f, x, flip) => {
      g.fillStyle = '#120c1a'; rr(x, 22, 380, 26, 6); g.fill();
      const w = 372 * Math.max(0, f.shown) / 100;
      g.fillStyle = f.shown > 30 ? '#f6c544' : '#ff4a3a';
      if (flip) g.fillRect(x + 4 + 372 - w, 26, w, 18); else g.fillRect(x + 4, 26, w, 18);
      g.strokeStyle = '#fff'; g.lineWidth = 2; rr(x, 22, 380, 26, 6); g.stroke();
      g.fillStyle = '#fff'; g.font = 'bold 18px "Bungee", Impact, sans-serif'; g.textAlign = flip ? 'right' : 'left';
      g.fillText(f.d.name.toUpperCase(), flip ? x + 380 : x, 72);
      g.font = '600 13px "Rubik", Arial, sans-serif'; g.fillStyle = '#d9c9e8'; g.fillText(f.d.shop, flip ? x + 380 : x, 90);
      for (let i = 0; i < f.wins; i++) ell(flip ? x + 370 - i * 18 : x + 10 + i * 18, 104, 6, 6, '#ffd23a');
    };
    bar(M.A, 24, false); bar(M.B, W - 404, true);
    g.fillStyle = '#fff'; g.font = 'bold 36px "Bungee", Impact, sans-serif'; g.textAlign = 'center'; g.fillText(Math.max(0, Math.ceil(M.timer)), W / 2, 50);
    M.texts.forEach(t => {
      const a = Math.min(1, t.t / 0.25, (t.dur - t.t) / 0.15 + 0.2);
      g.save(); g.globalAlpha = Math.max(0, Math.min(1, a));
      g.font = 'bold 54px "Bungee", Impact, sans-serif'; g.textAlign = 'center'; g.lineWidth = 8; g.strokeStyle = '#120c1a'; g.strokeText(t.txt, W / 2, t.y); g.fillStyle = t.col; g.fillText(t.txt, W / 2, t.y);
      g.restore();
    });
  }
  function render() {
    if (!M) return;
    g.save();
    if (M.shake > 0) g.translate((Math.random() - .5) * 14 * M.shake / 0.4, (Math.random() - .5) * 10 * M.shake / 0.4);
    drawStage();
    M.shots.forEach(drawShot);
    [M.A, M.B].sort((a, b) => (a.state === 'ko') - (b.state === 'ko')).forEach(drawFighter);
    M.fx.forEach(p => ell(p.x, p.y, p.r, p.r, p.col));
    g.restore();
    drawHUD();
  }

  let last = 0;
  function loop(now) {
    const real = Math.min(0.05, (now - last) / 1000 || 0); last = now;
    if (M) { const sp = M.speed; for (let i = 0; i < sp; i++) step(real); render(); }
    raf = requestAnimationFrame(loop);
  }

  // ---------- portraits for the select screen ----------
  function portrait(canvas, id) {
    const c = canvas.getContext('2d'), save = g; g = c;
    c.clearRect(0, 0, canvas.width, canvas.height);
    c.save(); c.translate(canvas.width / 2, canvas.height / 2 + 8); c.scale(canvas.width / 150, canvas.width / 150);
    BODY[id]('fight');
    c.restore(); g = save;
  }

  // ---------- tonight's tournament ----------
  // Who wins a match when we just want the answer (skip): weighted by the rig, never-winners can't
  function quickWinner(a, b) {
    const w = id => ({ champ: 9, contender: 5, strong: 3.2, rare: 0.9, never: 0 })[BYID[id].rig];
    const wa = w(a), wb = w(b);
    if (wa + wb === 0) return Math.random() < .5 ? a : b;
    return Math.random() * (wa + wb) < wa ? a : b;
  }
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  window.TakeawayFighter = {
    FIGHTERS, BYID, portrait, quickWinner, shuffle,
    init(canvas) { cv = canvas; g = cv.getContext('2d'); cancelAnimationFrame(raf); raf = requestAnimationFrame(loop); },
    fight(a, b, opts) { startMatch(a, b, opts); },
    stop() { M = null; },
    get match() { return M; },
    keys, pad, sfx
  };
})();
