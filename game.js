(() => {
'use strict';

const TAU = Math.PI * 2;
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const pick = a => a[Math.floor(Math.random() * a.length)];
const smooth = t => t * t * (3 - 2 * t);
const $ = id => document.getElementById(id);
const reduceMotion = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
const isTouch = 'ontouchstart' in window || (navigator.maxTouchPoints || 0) > 0;
if (isTouch) document.body.classList.add('touch');

const cv = $('c');
const g = cv.getContext('2d');
const stage = $('stage');
let W = 1, H = 1, DPR = 1, HZ = 0;

const SEED = Math.random() * 1000;
const hs = (n, s) => { const x = Math.sin(n * 127.1 + s * 311.7 + SEED) * 43758.5453; return x - Math.floor(x); };
const n1 = (x, s) => {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f), a = hs(i, s), b = hs(i + 1, s);
  return (a + (b - a) * u) * 2 - 1;
};

const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const cb = v => v < 0 ? 0 : v > 255 ? 255 : (v + .5) | 0;
const css = c => 'rgb(' + cb(c[0]) + ',' + cb(c[1]) + ',' + cb(c[2]) + ')';
const cssA = (c, a) => 'rgba(' + cb(c[0]) + ',' + cb(c[1]) + ',' + cb(c[2]) + ',' + a + ')';

const SEG = 200, ROAD = 2000, MAX = SEG * 60, CENT = .3, EDGE = 1.7;
let CAM_H = 1100, CAM_D = 1 / Math.tan(50 * Math.PI / 180), PLAYER_Z = CAM_H * CAM_D, LSUN = -1;
const CAMS = [
  { n: 'Chase', h: 1100, fov: 50, hz: .44, car: 1, sc: 1, cy: .945, hood: 0 },
  { n: 'High', h: 2300, fov: 56, hz: .34, car: 1, sc: .78, cy: .84, hood: 0 },
  { n: 'Hood', h: 560, fov: 54, hz: .5, car: 0, sc: 1, cy: .945, hood: 1 },
  { n: 'Bumper', h: 260, fov: 58, hz: .52, car: 0, sc: 1, cy: .945, hood: 0 },
  { n: 'Drone', h: 3600, fov: 62, hz: .3, car: 1, sc: .52, cy: .76, hood: 0 }
];
const cam = { h: 1100, fov: 50, hz: .44, car: 1, sc: 1, cy: .945, hood: 0 };
let DRAW = 240;

const BIO = [
  { name: 'Green Meadows', grass: [92, 178, 66], leaf: [[46, 150, 58], [82, 178, 58], [30, 124, 62], [122, 194, 72]], pine: [24, 104, 66], trunk: [104, 72, 44], mtn: [96, 130, 152], kinds: ['round', 'round', 'round', 'pine', 'bush', 'bush', 'rock'] },
  { name: 'Autumn Woods', grass: [168, 150, 62], leaf: [[236, 112, 30], [214, 66, 36], [248, 178, 38], [186, 92, 34]], pine: [52, 96, 56], trunk: [96, 62, 38], mtn: [150, 114, 96], kinds: ['round', 'round', 'round', 'pine', 'bush', 'rock'] },
  { name: 'Frozen Pines', grass: [232, 240, 248], leaf: [[60, 110, 92]], pine: [34, 96, 84], trunk: [84, 62, 46], mtn: [196, 212, 232], kinds: ['snowpine', 'snowpine', 'snowpine', 'snowpine', 'rock', 'bush'] },
  { name: 'Red Desert', grass: [216, 182, 118], leaf: [[84, 140, 84]], pine: [84, 140, 84], trunk: [120, 86, 52], mtn: [196, 130, 96], kinds: ['cactus', 'cactus', 'rock', 'deadbush', 'rock'] }
];
const BL = 2600;
const bidOf = k => k <= 0 ? 0 : Math.floor(hs(k, 9) * 4);
function biomeAt(i) {
  const k = Math.floor(i / BL), f = (i - k * BL) / BL;
  return { a: bidOf(k), b: bidOf(k + 1), w: smooth(clamp((f - .75) / .25, 0, 1)) };
}

const hAt = i => n1(i / 190, 4) * 1500 + n1(i / 55, 5) * 320 + n1(i / 760, 6) * 2600;
const curveAt = i => n1(i / 150, 1) * (.25 + .75 * smooth(Math.abs(n1(i / 950, 2)))) * 5.4 + n1(i / 40, 3) * .25;
const forestAt = i => { const v = smooth(clamp(n1(i / 70, 7) * .5 + .55, 0, 1)); return v * v; };

const cache = new Map();
function makeSeg(i) {
  const bm = biomeAt(i);
  const s = { i, curve: curveAt(i), y1: hAt(i), y2: hAt(i + 1), a: bm.a, b: bm.b, w: bm.w, sp: [], p1: { cz: 0, sc: 0, sx: 0, sy: 0, sw: 0 }, p2: { cz: 0, sc: 0, sx: 0, sy: 0, sw: 0 }, clip: 0, fog: 0, vis: false };
  const vil = n1(i / 900, 20) > .4;
  if (i % 4 === 0 && !vil) { s.sp.push({ k: 'post', x: -1.12, s: 1, c: 0 }); s.sp.push({ k: 'post', x: 1.12, s: 1, c: 0 }); }
  if (vil && i % 6 === 0) { s.sp.push({ k: 'lamp', x: -1.22, s: 1, c: 0 }); s.sp.push({ k: 'lamp', x: 1.22, s: 1, c: 0 }); }
  const ob = Math.floor(i / 70), oi = i - ob * 70;
  if (hs(ob, 112) < .65 && oi >= 8 && oi < 44 && oi % 3 === 0) {
    s.sp.push({ k: 'orb', x: .55 * Math.sin(oi * .22 + hs(ob, 113) * 6.28), s: 1, c: 0, got: false });
  }
  const fo = forestAt(i);
  for (let side = -1; side <= 1; side += 2) {
    if (hs(i, 40 + side) < .05 + .5 * fo) {
      const src = hs(i, 70) < bm.w ? BIO[bm.b] : BIO[bm.a];
      const kind = src.kinds[Math.floor(hs(i, 71 + side) * src.kinds.length)];
      s.sp.push({ k: kind, x: side * (1.95 + hs(i, 50 + side) * hs(i, 60 + side) * 8), s: .75 + .7 * hs(i, 72 + side), c: Math.floor(hs(i, 73 + side) * 4), bio: src });
    }
  }
  if (hs(i, 90) < .42) {
    const side = hs(i, 91) < .5 ? -1 : 1, src = hs(i, 96) < bm.w ? bm.b : bm.a;
    const flower = hs(i, 92) < .3 && src < 2;
    s.sp.push({ k: flower ? 'flower' : 'tuft', x: side * (1.25 + hs(i, 93) * 2.4), s: .6 + .8 * hs(i, 94), c: Math.floor(hs(i, 95) * 4), bio: BIO[src] });
  }
  if (hs(i, 80) < (vil ? .05 : .0035)) {
    const side = hs(i, 81) < .5 ? -1 : 1;
    s.sp.push({ k: 'house', x: side * (3 + hs(i, 82) * 3), s: .9 + .4 * hs(i, 83), c: Math.floor(hs(i, 84) * 4), bio: BIO[bm.a] });
  }
  return s;
}
function getSeg(i) {
  let s = cache.get(i);
  if (!s) { s = makeSeg(i); cache.set(i, s); }
  return s;
}

const KEYS = [
  { h: 0, top: [6, 9, 26], hor: [16, 24, 52], L: .22 },
  { h: 4.8, top: [10, 16, 44], hor: [40, 52, 92], L: .26 },
  { h: 5.8, top: [58, 86, 150], hor: [255, 170, 125], L: .55 },
  { h: 7.5, top: [78, 148, 226], hor: [196, 224, 248], L: .92 },
  { h: 12, top: [52, 128, 224], hor: [178, 216, 250], L: 1 },
  { h: 16.5, top: [66, 134, 214], hor: [205, 224, 240], L: .96 },
  { h: 18.2, top: [72, 104, 176], hor: [255, 196, 128], L: .78 },
  { h: 19.3, top: [40, 48, 106], hor: [255, 120, 74], L: .48 },
  { h: 20.5, top: [16, 22, 58], hor: [92, 66, 88], L: .3 },
  { h: 24, top: [6, 9, 26], hor: [16, 24, 52], L: .22 }
];
function sky(h) {
  let i = 0;
  while (i < KEYS.length - 2 && h >= KEYS[i + 1].h) i++;
  const a = KEYS[i], b = KEYS[i + 1], t = smooth(clamp((h - a.h) / (b.h - a.h), 0, 1));
  return { top: mix(a.top, b.top, t), hor: mix(a.hor, b.hor, t), L: lerp(a.L, b.L, t) };
}

const CARS = [
  { n: 'Starter Hatch', p: 0, c: [34, 36, 44], w: 1, h: 1, ch: 26, ci: 10, sp: 1, st: null, top: 1, grip: 1, nit: 1 },
  { n: 'Red Coupe', p: 700, c: [206, 56, 52], w: 1.02, h: .92, ch: 22, ci: 13, sp: 1, st: null, top: 1.08, grip: 1.1, nit: 1.1 },
  { n: 'Rally Wagon', p: 1800, c: [44, 150, 160], w: 1.04, h: 1.05, ch: 30, ci: 6, sp: 0, st: [240, 240, 240], top: 1.15, grip: 1.35, nit: 1.2 },
  { n: 'Sport GT', p: 4000, c: [232, 184, 52], w: 1.1, h: .8, ch: 19, ci: 15, sp: 2, st: null, top: 1.25, grip: 1.3, nit: 1.4 },
  { n: 'Muscle V8', p: 8000, c: [232, 234, 238], w: 1.12, h: .95, ch: 21, ci: 14, sp: 1, st: [30, 32, 40], top: 1.35, grip: 1.15, nit: 1.6 },
  { n: 'Hyper One', p: 16000, c: [236, 108, 36], w: 1.14, h: .72, ch: 17, ci: 17, sp: 2, st: [30, 32, 40], top: 1.5, grip: 1.5, nit: 2 }
];
const TRAFFIC = [
  { w: .98, h: 1, ch: 25, ci: 10, sp: 0, st: null },
  { w: 1, h: 1, ch: 26, ci: 9, sp: 0, st: null },
  { w: .98, h: .95, ch: 23, ci: 12, sp: 0, st: null },
  { w: 1.06, h: 1.7, ch: 18, ci: 3, sp: 0, st: null },
  { w: 1, h: 1.1, ch: 28, ci: 8, sp: 0, st: null }
];
const TRAFFIC_COLORS = [[196, 196, 204], [58, 98, 168], [190, 60, 54], [228, 228, 220], [86, 130, 78], [226, 184, 60], [40, 44, 52], [150, 90, 70]];
const SAVE = { money: 0, level: 1, owned: [0], car: 0, bestKm: 0, bestOrbs: 0 };
try {
  const b = JSON.parse(localStorage.getItem('slow-drifter-save') || '{}');
  const pos = v => Number.isFinite(v) && v > 0 ? v : 0;
  SAVE.money = Math.floor(pos(b.money));
  SAVE.level = Math.max(1, Math.floor(pos(b.level)));
  SAVE.bestKm = pos(b.bestKm);
  SAVE.bestOrbs = Math.floor(pos(b.bestOrbs));
  if (Array.isArray(b.owned)) SAVE.owned = [...new Set([0, ...b.owned.filter(i => Number.isInteger(i) && i > 0 && i < CARS.length)])];
  if (SAVE.owned.includes(b.car)) SAVE.car = b.car;
} catch (_) {}
const WEATHERS = ['clear', 'rain', 'storm', 'snow', 'fog'];
const WLABEL = { clear: 'Clear', rain: 'Rain', storm: 'Thunderstorm', snow: 'Snow', fog: 'Fog' };
const TIMES = ['auto', 'dawn', 'day', 'dusk', 'night'];
const TLABEL = { auto: 'Cycle', dawn: 'Dawn', day: 'Midday', dusk: 'Dusk', night: 'Night' };
const THOUR = { dawn: 6.1, day: 12, dusk: 18.6, night: 23 };

const S = {
  pos: 0, x: .45, speed: 0, tgt: MAX * .3, steer: 0, auto: true,
  hour: 17.4, timeMode: 'auto', weather: 'clear', rk: 0, sk: 0, fk: 0, tk: 0,
  bgOff: 0, cam: 0, hud: true, quality: 'high', hintT: 0, toast: null,
  braking: false, offroad: 0, bio: 0, state: 'menu', t: 0,
  nitro: 1, boost: 0, wasBoost: false, touchBoost: false, orbs: 0, chk: 0, km0: 0, saveT: 8,
  flashL: 0, dbl: false, bolt: null, lightT: 6, rainbow: 0, wasWet: 0, meteor: null, nextMeteor: 8,
  sunX: 0, sunY: 0, sunVis: 0,
  tr: [], spawnT: 0, inv: 0, hitFlash: 0, shake: 0, pops: [], card: null, lvKm0: 0, lvOrbs: 0, lvPass: 0, lvClose: 0, lvCrash: 0
};

const touchSteer = { id: null, v: 0 };
const keys = {};

let AC = null, master, reverb, noiseBuf, muted = false, musicOn = false;
let engA, engB, engG, engF, windG, windF, rainG, grassG;
let chordI = 0, nextChord = 0, nextPluck = 0, nextBird = 0, nextCricket = 0;
const PROG = [[48, 52, 55, 59, 62], [45, 52, 55, 60, 64], [41, 48, 52, 57, 60], [43, 50, 55, 59, 62]];
const SHIFT = [0, 2, -3, 5];
const mf = m => 440 * Math.pow(2, (m - 69) / 12);

function makeIR(sec) {
  const len = Math.floor(AC.sampleRate * sec), buf = AC.createBuffer(2, len, AC.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
  }
  return buf;
}
function loopNoise(filterType, freq, q) {
  const s = AC.createBufferSource();
  s.buffer = noiseBuf;
  s.loop = true;
  const f = AC.createBiquadFilter();
  f.type = filterType;
  f.frequency.value = freq;
  f.Q.value = q || .7;
  const gn = AC.createGain();
  gn.gain.value = 0;
  s.connect(f);
  f.connect(gn);
  gn.connect(master);
  s.start();
  return { f, g: gn };
}
function initAudio() {
  if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    master = AC.createGain();
    master.gain.value = muted ? 0 : .85;
    const comp = AC.createDynamicsCompressor();
    master.connect(comp);
    comp.connect(AC.destination);
    reverb = AC.createConvolver();
    reverb.buffer = makeIR(3.4);
    const rg = AC.createGain();
    rg.gain.value = .8;
    reverb.connect(rg);
    rg.connect(master);
    noiseBuf = AC.createBuffer(1, AC.sampleRate * 2, AC.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    engA = AC.createOscillator(); engA.type = 'sawtooth';
    engB = AC.createOscillator(); engB.type = 'square';
    engF = AC.createBiquadFilter(); engF.type = 'lowpass'; engF.frequency.value = 300;
    engG = AC.createGain(); engG.gain.value = 0;
    engA.connect(engF); engB.connect(engF); engF.connect(engG); engG.connect(master);
    engA.start(); engB.start();
    const w = loopNoise('bandpass', 700, .5); windF = w.f; windG = w.g;
    const r = loopNoise('highpass', 1800, .7); rainG = r.g;
    const gr = loopNoise('lowpass', 800, .7); grassG = gr.g;
    nextChord = AC.currentTime + .2;
    nextPluck = AC.currentTime + 2;
    setInterval(musicTick, 250);
  } catch (e) { AC = null; }
}
function setMuted(m) {
  muted = m;
  if (master) master.gain.value = m ? 0 : .85;
  updateLabels();
}
function padNote(m, when, dur) {
  const f = AC.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 1300;
  f.connect(master);
  const send = AC.createGain();
  send.gain.value = .6;
  f.connect(send);
  send.connect(reverb);
  [['sine', 0, .03], ['triangle', 5, .016]].forEach(v => {
    const o = AC.createOscillator(), a = AC.createGain();
    o.type = v[0];
    o.frequency.value = mf(m);
    o.detune.value = v[1];
    a.gain.setValueAtTime(0, when);
    a.gain.linearRampToValueAtTime(v[2], when + 3.2);
    a.gain.setValueAtTime(v[2], when + dur - 3.4);
    a.gain.linearRampToValueAtTime(0, when + dur);
    o.connect(a);
    a.connect(f);
    o.start(when);
    o.stop(when + dur + .1);
  });
}
function pluck(m, when, vol) {
  const o = AC.createOscillator(), o2 = AC.createOscillator(), a = AC.createGain(), send = AC.createGain();
  o.type = 'triangle'; o2.type = 'sine';
  o.frequency.value = mf(m); o2.frequency.value = mf(m + 12);
  a.gain.setValueAtTime(.0001, when);
  a.gain.exponentialRampToValueAtTime(vol, when + .015);
  a.gain.exponentialRampToValueAtTime(.0001, when + 3);
  send.gain.value = .85;
  o.connect(a); o2.connect(a);
  a.connect(master);
  a.connect(send);
  send.connect(reverb);
  o.start(when); o2.start(when);
  o.stop(when + 3.1); o2.stop(when + 3.1);
}
function blip(f, dur, type, vol, slide, when, wet) {
  if (!AC) return;
  const t = AC.currentTime + (when || 0), o = AC.createOscillator(), a = AC.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, f * slide), t + dur);
  a.gain.setValueAtTime(vol, t);
  a.gain.exponentialRampToValueAtTime(.0001, t + dur);
  o.connect(a);
  a.connect(master);
  if (wet) { const w = AC.createGain(); w.gain.value = wet; a.connect(w); w.connect(reverb); }
  o.start(t);
  o.stop(t + dur + .05);
}
function hiss(dur, vol, freq, type, when, wet) {
  if (!AC) return;
  const t = AC.currentTime + (when || 0), s = AC.createBufferSource(), f = AC.createBiquadFilter(), a = AC.createGain();
  s.buffer = noiseBuf;
  s.loop = true;
  f.type = type;
  f.frequency.value = freq;
  a.gain.setValueAtTime(.0001, t);
  a.gain.exponentialRampToValueAtTime(vol, t + Math.min(.08, dur * .2));
  a.gain.exponentialRampToValueAtTime(.0001, t + dur);
  s.connect(f);
  f.connect(a);
  a.connect(master);
  if (wet) { const w = AC.createGain(); w.gain.value = wet; a.connect(w); w.connect(reverb); }
  s.start(t, Math.random());
  s.stop(t + dur + .05);
}
let orbRun = 0, orbLast = 0;
const sThunder = d => { hiss(3.2, .5, 240, 'lowpass', d, .9); blip(58, 2.2, 'sine', .35, .5, d, .6); };
const sCrack = () => hiss(.35, .3, 3000, 'highpass', 0);
const sOrb = () => {
  const n = AC ? AC.currentTime : 0;
  orbRun = n - orbLast < 1.4 ? Math.min(12, orbRun + 1) : 0;
  orbLast = n;
  const f = 660 * Math.pow(1.0595, orbRun * 2);
  blip(f, .35, 'sine', .14, 1, 0, .5);
  blip(f * 1.5, .3, 'triangle', .06, 1, .06, .5);
};
const sBird = () => {
  const b = rnd(1800, 3200), n = 2 + Math.floor(Math.random() * 3);
  for (let i = 0; i < n; i++) blip(b * (1 + i * .06), .09, 'sine', .018, 1.5, i * .11, .5);
};
const sCricket = () => { for (let i = 0; i < 4; i++) blip(4300, .035, 'sine', .006, 1, i * .06, .2); };
const sCrash = () => { hiss(.6, .5, 900, 'lowpass', 0, .3); blip(95, .5, 'sawtooth', .3, .4, 0, .2); };
const sLevelUp = () => { [523, 659, 784, 1047, 1319].forEach((f, i) => blip(f, .5, 'triangle', .12, 1, i * .09, .6)); };
const sPass = () => hiss(.3, .1, 1400, 'bandpass', 0);
const sBuy = () => { blip(880, .12, 'square', .08, 1.5); blip(1320, .2, 'square', .08, 1.3, .08); };
const sBoostOn = () => { hiss(1.2, .2, 700, 'bandpass', 0, .3); blip(120, .8, 'sawtooth', .06, 3, 0); };

function musicTick() {
  if (!AC || !musicOn || S.state === 'pause') return;
  const now = AC.currentTime, night = S.sky && S.sky.L < .45;
  const sh = SHIFT[S.bio] || 0;
  while (nextChord < now + 1.5) {
    PROG[chordI % 4].forEach(m => padNote(m + sh, nextChord, 11));
    chordI++;
    nextChord += 10;
  }
  while (nextPluck < now + 1.5) {
    const ch = PROG[(chordI + 3) % 4], m = ch[Math.floor(Math.random() * ch.length)] + 12 + (Math.random() < .35 ? 12 : 0) + sh;
    pluck(m, nextPluck, night ? .05 : .07);
    nextPluck += (night ? rnd(2.2, 5) : rnd(1.3, 3.4));
  }
  if (S.state === 'play' && S.sky && S.bio !== 2) {
    if (S.sky.L > .6 && S.weather === 'clear' && now > nextBird) { sBird(); nextBird = now + rnd(2.5, 8); }
    if (S.sky.L < .4 && S.rk < .1 && now > nextCricket) { sCricket(); nextCricket = now + rnd(.9, 2.4); }
  }
}
function audioUpdate(sp, off) {
  if (!AC) return;
  const t = AC.currentTime, base = 40 + sp * 90 + S.boost * 40;
  engA.frequency.setTargetAtTime(base, t, .1);
  engB.frequency.setTargetAtTime(base * .5, t, .1);
  engF.frequency.setTargetAtTime(220 + sp * 520, t, .1);
  engG.gain.setTargetAtTime(S.state === 'pause' ? 0 : .018 + .04 * sp, t, .15);
  windF.frequency.setTargetAtTime(500 + sp * 1100, t, .15);
  windG.gain.setTargetAtTime(Math.pow(sp, 1.4) * .22 * (1 + S.boost * 1.2), t, .2);
  rainG.gain.setTargetAtTime(S.rk * .11, t, .4);
  grassG.gain.setTargetAtTime(off * sp * .3, t, .12);
}

function resize() {
  DPR = Math.min(2, window.devicePixelRatio || 1);
  const r = stage.getBoundingClientRect();
  W = Math.max(1, r.width);
  H = Math.max(1, r.height);
  HZ = H * .44;
  cv.width = Math.round(W * DPR);
  cv.height = Math.round(H * DPR);
  cv.style.width = W + 'px';
  cv.style.height = H + 'px';
}
addEventListener('resize', resize);

const STARS = Array.from({ length: 120 }, () => ({ x: Math.random(), y: Math.random() * .92, s: rnd(.7, 2), p: rnd(0, TAU) }));
const CLOUDS = Array.from({ length: 9 }, () => ({ x: Math.random(), y: rnd(.05, .3), s: rnd(.7, 1.6), v: rnd(.004, .012) }));
const DROPS = Array.from({ length: 480 }, () => ({ x: Math.random(), y: Math.random(), v: rnd(900, 1500), l: rnd(10, 24) }));
const FLAKES = Array.from({ length: 220 }, () => ({ x: Math.random(), y: Math.random(), v: rnd(40, 110), p: rnd(0, TAU), s: rnd(1.2, 3) }));

let LT = [1, 1, 1], FOGC = [190, 220, 245], FOGD = 5, SKY = null;
const shade = c => [c[0] * LT[0], c[1] * LT[1], c[2] * LT[2]];
const fogged = (c, f) => css(mix(shade(c), FOGC, f));

function proj(p, cx, cy) {
  p.sc = CAM_D / p.cz;
  p.fx = W / 2 + p.sc * cx * W / 2;
  p.fy = HZ - p.sc * cy * H / 2;
  p.fw = p.sc * ROAD * W / 2;
  p.sx = Math.round(p.fx);
  p.sy = Math.round(p.fy);
  p.sw = Math.round(p.fw);
}
function quad(x1, y1, x2, y2, x3, y3, x4, y4, col) {
  g.fillStyle = col;
  g.beginPath();
  g.moveTo(x1, y1); g.lineTo(x2, y2); g.lineTo(x3, y3); g.lineTo(x4, y4);
  g.closePath();
  g.fill();
}

function drawSky() {
  const top = SKY.top, hor = SKY.hor;
  const gr = g.createLinearGradient(0, 0, 0, HZ);
  gr.addColorStop(0, css(top));
  gr.addColorStop(1, css(hor));
  g.fillStyle = gr;
  g.fillRect(0, 0, W, HZ + 2);
  const cover = Math.max(S.rk, S.fk, S.sk * .8);
  const night = clamp((.5 - SKY.L) / .3, 0, 1) * (1 - cover);
  if (night > 0) {
    for (const s of STARS) {
      g.globalAlpha = night * (.5 + .5 * Math.sin(S.t * 1.5 + s.p));
      g.fillStyle = '#e8f0ff';
      g.fillRect(s.x * W, s.y * HZ, s.s, s.s);
    }
    g.globalAlpha = 1;
  }
  const h = S.hour;
  const day = h > 5.4 && h < 18.9;
  const frac = day ? (h - 5.4) / 13.5 : ((h - 18.9 + 24) % 24) / 10.5;
  const ang = frac * Math.PI, bx = W * (.1 + .8 * frac), by = HZ - Math.sin(ang) * H * .36 + 6;
  const vis = 1 - .88 * cover;
  S.sunX = bx;
  S.sunY = by;
  S.sunVis = day ? vis : 0;
  if (day) {
    const low = 1 - Math.sin(ang);
    const sc = mix([255, 244, 214], [255, 150, 80], smooth(clamp(low * 1.4 - .2, 0, 1)));
    const gl = g.createRadialGradient(bx, by, 4, bx, by, Math.max(W, H) * .32);
    gl.addColorStop(0, cssA(sc, .55 * vis));
    gl.addColorStop(1, cssA(sc, 0));
    g.fillStyle = gl;
    g.fillRect(0, 0, W, HZ + 2);
    g.globalAlpha = vis;
    g.fillStyle = css(mix(sc, [255, 255, 255], .35));
    g.beginPath(); g.arc(bx, by, Math.max(14, W * .018), 0, TAU); g.fill();
    g.globalAlpha = 1;
  } else {
    const gl = g.createRadialGradient(bx, by, 3, bx, by, Math.max(W, H) * .2);
    gl.addColorStop(0, 'rgba(210,225,255,' + (.35 * vis) + ')');
    gl.addColorStop(1, 'rgba(210,225,255,0)');
    g.fillStyle = gl;
    g.fillRect(0, 0, W, HZ + 2);
    g.globalAlpha = vis;
    g.fillStyle = '#eef3ff';
    g.beginPath(); g.arc(bx, by, Math.max(11, W * .014), 0, TAU); g.fill();
    g.fillStyle = 'rgba(160,176,205,.55)';
    g.beginPath(); g.arc(bx - 3, by + 2, Math.max(3, W * .004), 0, TAU); g.fill();
    g.beginPath(); g.arc(bx + 4, by - 3, Math.max(2, W * .003), 0, TAU); g.fill();
    g.globalAlpha = 1;
  }
  const gray = [150, 158, 170];
  const cc = mix(mix([255, 255, 255], hor, .25), gray, Math.max(S.rk, S.sk * .6, S.fk * .5) * .8);
  const ccs = shade(cc);
  const dark = 1 + S.rk * 1.2 + S.tk * .6;
  for (const c of CLOUDS) {
    const x = ((c.x * W - S.bgOff * .08 + S.t * c.v * W) % (W + 400) + (W + 400)) % (W + 400) - 200;
    const y = c.y * HZ, r = 34 * c.s * (W / 900 + .4);
    g.fillStyle = cssA([ccs[0] / dark, ccs[1] / dark, ccs[2] / dark], .86);
    const puffs = [[0, 0, 1.6, .55], [-1, .12, 1, .42], [1.05, .1, 1.1, .45], [.1, -.22, .9, .5]];
    g.beginPath();
    for (const q of puffs) {
      g.moveTo(x + r * q[0] + r * q[2], y + r * q[1]);
      g.ellipse(x + r * q[0], y + r * q[1], r * q[2], r * q[3], 0, 0, TAU);
    }
    g.fill();
  }
}

function drawMountains(base) {
  const mt = mix(BIO[base.a].mtn, BIO[base.b].mtn, base.w);
  const layers = [{ f: .0016, a: .22, p: .18, m: .6, s: 11 }, { f: .0034, a: .13, p: .42, m: .34, s: 12 }];
  for (const L of layers) {
    g.fillStyle = css(mix(shade(mt), FOGC, L.m));
    g.beginPath();
    g.moveTo(0, HZ + 3);
    for (let x = 0; x <= W + 8; x += 8) {
      const sx = (x + S.bgOff * L.p) * L.f;
      const n = (n1(sx, L.s) * .5 + .5) * .75 + (n1(sx * 3.1, L.s + 3) * .5 + .5) * .25;
      g.lineTo(x, HZ - L.a * H * (.2 + .8 * n));
    }
    g.lineTo(W + 8, HZ + 3);
    g.closePath();
    g.fill();
  }
}

function drawSegment(s) {
  const p1 = s.p1, p2 = s.p2, f = s.fog;
  const base = mix(BIO[s.a].grass, BIO[s.b].grass, s.w);
  const stripe = Math.floor(s.i / 4) % 2;
  const grass = stripe ? base : mix(base, [0, 0, 0], .05);
  g.fillStyle = fogged(grass, f);
  g.fillRect(0, p2.sy, W, p1.sy - p2.sy + 1);
  const x1 = p1.sx, x2 = p2.sx, w1 = p1.sw, w2 = p2.sw, y1 = p1.sy + 1, y2 = p2.sy;
  const near = w1 > 16 && f < .75;
  if (near) {
    const hh = y1 - y2;
    for (let j = 0; j < (S.quality === 'low' ? 3 : 6); j++) {
      const t = hs(s.i, 120 + j), u = (hs(s.i, 140 + j) < .5 ? -1 : 1) * (1.14 + hs(s.i, 160 + j) * 5), v = hs(s.i, 180 + j);
      const cx = lerp(x1, x2, v) + u * lerp(w1, w2, v), cw = lerp(w1, w2, v) * (.18 + t * .4);
      const col = t < .5 ? mix(grass, [0, 0, 0], .09 + t * .1) : mix(grass, [255, 255, 200], .06 + (t - .5) * .12);
      g.fillStyle = fogged(col, f);
      g.fillRect(cx - cw / 2, y1 - hh * v - hh * .3, cw, Math.max(1, hh * .55));
    }
    const dirt = fogged(mix([150, 132, 100], grass, .15), f);
    quad(x1 + w1, y1, x1 + w1 * 1.1, y1, x2 + w2 * 1.1, y2, x2 + w2, y2, dirt);
    quad(x1 - w1 * 1.1, y1, x1 - w1, y1, x2 - w2, y2, x2 - w2 * 1.1, y2, dirt);
  }
  let road = stripe ? [76, 78, 86] : [72, 74, 82];
  if (S.rk > .05) road = mix(road, [46, 50, 60], S.rk * .6);
  const rc = fogged(road, f);
  quad(x1 - w1, y1, x1 + w1, y1, x2 + w2, y2, x2 - w2, y2, rc);
  if (near) {
    const hh = y1 - y2, n = S.quality === 'low' ? 3 : w1 > 90 ? 10 : w1 > 40 ? 6 : 3;
    for (let j = 0; j < n; j++) {
      const u = (hs(s.i, 200 + j) * 2 - 1) * .9, v = hs(s.i, 230 + j), dark = hs(s.i, 260 + j) < .55;
      const cx = lerp(x1, x2, v) + u * lerp(w1, w2, v), cw = Math.max(1, lerp(w1, w2, v) * (.015 + hs(s.i, 290 + j) * .05));
      g.fillStyle = fogged(dark ? mix(road, [0, 0, 0], .22) : mix(road, [255, 255, 255], .12), f);
      g.fillRect(cx, y1 - hh * v, cw, Math.max(1, hh * .09));
    }
    if (hs(s.i, 99) < .1) {
      const u = (hs(s.i, 98) * 2 - 1) * .6;
      g.strokeStyle = fogged(mix(road, [0, 0, 0], .45), f);
      g.lineWidth = Math.max(1, w1 * .004);
      g.beginPath();
      g.moveTo(x1 + u * w1, y1);
      g.lineTo(x1 + (u + .08) * w1, y1 - (y1 - y2) * .4);
      g.lineTo(x2 + (u + .02) * w2, y2);
      g.stroke();
    }
    if (S.rk > .1) {
      g.fillStyle = 'rgba(190,205,225,' + (.07 * S.rk) + ')';
      quad(x1 - w1 * .5, y1, x1 - w1 * .1, y1, x2 - w2 * .1, y2, x2 - w2 * .5, y2, g.fillStyle);
    }
  }
  const lc = fogged([226, 226, 220], f), e1 = w1 * .04, e2 = w2 * .04;
  quad(x1 - w1 * .96, y1, x1 - w1 * .96 + e1, y1, x2 - w2 * .96 + e2, y2, x2 - w2 * .96, y2, lc);
  quad(x1 + w1 * .96 - e1, y1, x1 + w1 * .96, y1, x2 + w2 * .96, y2, x2 + w2 * .96 - e2, y2, lc);
  if (stripe) {
    const l1 = w1 * .022, l2 = w2 * .022;
    quad(x1 - l1, y1, x1 + l1, y1, x2 + l2, y2, x2 - l2, y2, fogged([236, 214, 120], f));
  }
}

function drawSprite(sp, s) {
  const p = s.p1, f = s.fog, U = p.sc * W / 2;
  const sx = p.fx + sp.x * p.fw, by = p.fy, k = sp.k;
  const HK = { round: 2700, pine: 3600, snowpine: 3600, bush: 800, rock: 650, cactus: 2300, deadbush: 700, house: 2600, post: 420, tuft: 260, flower: 300, lamp: 1500, orb: 520 };
  const h = HK[k] * sp.s * U;
  if (h < 1.2 || sx < -h || sx > W + h || sp.got) return;
  const clipped = s.clip < by;
  if (clipped) {
    if (s.clip <= by - h) return;
    g.save();
    g.beginPath();
    g.rect(0, 0, W, s.clip);
    g.clip();
  }
  const F = c => fogged(c, f), bio = sp.bio || BIO[0];
  const sd = s.i * 7.31 + sp.x * 3.17;
  const R = n => hs(sd, n);
  const D = S.quality === 'low' ? (h > 20 ? 1 : 0) : h > 40 ? 2 : h > 12 ? 1 : 0;
  const sway = reduceMotion ? 0 : Math.sin(S.t * 1.3 + s.i * .7) * h * (.01 + .012 * S.rk + .008 * S.tk);
  const dk = (c, t) => mix(c, [0, 0, 0], t), lt = (c, t) => mix(c, [255, 255, 255], t);
  const poly = (pts, col) => {
    g.fillStyle = col;
    g.beginPath();
    for (let i = 0; i < pts.length; i++) { if (i) g.lineTo(pts[i][0], pts[i][1]); else g.moveTo(pts[i][0], pts[i][1]); }
    g.closePath();
    g.fill();
  };
  const puff = (x, y, rx, ry, col) => {
    g.fillStyle = col;
    g.beginPath();
    g.ellipse(x, y, rx, ry, 0, 0, TAU);
    g.fill();
  };
  const line = (x1, y1, x2, y2, col, w) => {
    g.strokeStyle = col;
    g.lineWidth = Math.max(1, w);
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.stroke();
  };

  if (D && k !== 'tuft' && k !== 'flower' && k !== 'post' && k !== 'lamp' && k !== 'orb') {
    const sw = { round: .3, pine: .2, snowpine: .2, bush: .55, rock: .5, cactus: .14, deadbush: .3, house: .55 }[k] || .2;
    g.fillStyle = 'rgba(0,0,0,' + (.22 * clamp(SKY.L + .15, .2, 1) * (1 - f)) + ')';
    g.beginPath();
    g.ellipse(sx - LSUN * h * .07, by, h * sw, h * .035, 0, 0, TAU);
    g.fill();
  }
  if (k === 'round') {
    const w = h * .66, lc = bio.leaf[sp.c % bio.leaf.length], tc = bio.trunk, tw = w * .075, cy = by - h * .66;
    const deep = [22, 38, 70], warm = [255, 240, 140];
    const tg = g.createLinearGradient(sx - tw * 2, 0, sx + tw * 2, 0);
    tg.addColorStop(0, F(LSUN < 0 ? lt(tc, .22) : dk(tc, .45)));
    tg.addColorStop(.5, F(tc));
    tg.addColorStop(1, F(LSUN < 0 ? dk(tc, .45) : lt(tc, .22)));
    poly([[sx - tw * 2.2, by], [sx - tw * .9, by - h * .1], [sx - tw * .7, by - h * .46], [sx + tw * .7, by - h * .46], [sx + tw * .9, by - h * .1], [sx + tw * 2.2, by]], tg);
    if (D) {
      for (let i = 0; i < 5; i++) {
        const x = sx + (R(i) - .5) * tw * 1.5;
        line(x, by - h * .01, x + (R(i + 9) - .5) * tw * .5, by - h * (.14 + R(i + 4) * .28), F(dk(tc, .55)), h * .004);
      }
      puff(sx - LSUN * tw * .9, by - h * .02, tw * 1.1, h * .012, F([74, 112, 52]));
      puff(sx + (R(7) - .5) * tw, by - h * (.12 + R(8) * .2), tw * .3, tw * .45, F(dk(tc, .6)));
      line(sx, by - h * .4, sx - w * .28, by - h * .6, F(dk(tc, .3)), tw * .7);
      line(sx + tw * .3, by - h * .42, sx + w * .26, by - h * .62, F(dk(tc, .3)), tw * .6);
      line(sx, by - h * .44, sx + (R(6) - .5) * w * .2, by - h * .74, F(dk(tc, .3)), tw * .55);
    }
    g.save();
    g.translate(sway, 0);
    const nl = D === 2 ? 11 : D === 1 ? 8 : 5, lobes = [];
    for (let i = 0; i < nl; i++) {
      const a = i / nl * TAU + R(20), rr = w * (.1 + .1 * R(i + 30));
      const px = sx + Math.cos(a) * rr * 1.5, py = cy + Math.sin(a) * rr * .85 - h * .03 * R(i + 35);
      const lx = w * (.17 + .08 * R(i + 40)), ly = h * (.12 + .05 * R(i + 45));
      const b = clamp(.65 - (py - (cy - h * .28)) / (h * .6) * .5 + (px - sx) * LSUN / w * .9, 0, 1);
      lobes.push({ px, py, lx, ly, b });
    }
    puff(sx, cy + h * .12, w * .46, h * .14, F(dk(lc, .62)));
    lobes.sort((a, b) => a.b - b.b);
    for (const o of lobes) puff(o.px, o.py, o.lx, o.ly, F(mix(mix(dk(lc, .55), deep, .2), mix(lt(lc, .3), warm, .18), o.b)));
    const nf = D === 2 ? 170 : D === 1 ? 64 : 0;
    if (nf) {
      const pal = [dk(lc, .5), dk(lc, .2), lt(lc, .2), lt(mix(lc, warm, .3), .35)], buckets = [[], [], [], []];
      for (let i = 0; i < nf; i++) {
        const o = lobes[Math.floor(R(i + 200) * lobes.length)];
        const px = o.px + (R(i + 400) - .5) * o.lx * 1.7, py = o.py + (R(i + 600) - .5) * o.ly * 1.7;
        const bi = Math.min(3, Math.floor(clamp(o.b + (R(i + 800) - .5) * .5, 0, .99) * 4));
        buckets[bi].push(px, py, h * (.012 + .012 * R(i + 1000)), R(i + 1200) * Math.PI);
      }
      for (let b = 0; b < 4; b++) {
        const q = buckets[b];
        g.fillStyle = F(pal[b]);
        g.beginPath();
        for (let i = 0; i < q.length; i += 4) {
          g.moveTo(q[i] + q[i + 2] * 1.6, q[i + 1]);
          g.ellipse(q[i], q[i + 1], q[i + 2] * 1.6, q[i + 2], q[i + 3], 0, TAU);
        }
        g.fill();
      }
    }
    if (D) {
      g.strokeStyle = 'rgba(255,248,190,' + (.32 * (1 - f)) + ')';
      g.lineWidth = Math.max(1, h * .008);
      g.beginPath();
      g.ellipse(sx, cy - h * .02, w * .52, h * .29, 0, LSUN < 0 ? Math.PI * 1.06 : Math.PI * 1.5, LSUN < 0 ? Math.PI * 1.5 : Math.PI * 1.94);
      g.stroke();
    }
    g.restore();
  } else if (k === 'pine' || k === 'snowpine') {
    const w = h * .4, tc = bio.trunk, snow = k === 'snowpine';
    const tg = g.createLinearGradient(sx - w * .1, 0, sx + w * .1, 0);
    tg.addColorStop(0, F(LSUN < 0 ? lt(tc, .2) : dk(tc, .4)));
    tg.addColorStop(1, F(LSUN < 0 ? dk(tc, .4) : lt(tc, .2)));
    poly([[sx - w * .08, by], [sx - w * .04, by - h * .2], [sx + w * .04, by - h * .2], [sx + w * .08, by]], tg);
    g.save();
    g.translate(sway * .6, 0);
    const tiers = D ? 5 : 3, m = D ? 8 : 2;
    for (let i = 0; i < tiers; i++) {
      const ty = by - h * (.1 + i * (.64 / tiers)), tw = w * (.6 - i * (.44 / tiers)), th = h * (.46 / tiers + .12);
      const col = mix(bio.pine, [0, 0, 0], i * .05 + R(i) * .08);
      const tg2 = g.createLinearGradient(0, ty - th, 0, ty + th * .12);
      tg2.addColorStop(0, F(lt(col, .16)));
      tg2.addColorStop(1, F(dk(col, .3)));
      const pts = [[sx, ty - th]];
      for (let j = 0; j <= m; j++) pts.push([sx + tw * (1 - 2 * j / m), ty + (j % 2 ? th * .14 : 0)]);
      poly(pts, tg2);
      poly([[sx, ty - th], [sx + LSUN * tw, ty], [sx, ty + th * .02]], F(lt(col, .12)));
      if (D) {
        poly([[sx, ty - th], [sx - LSUN * tw, ty], [sx - LSUN * tw * .35, ty + th * .08], [sx - LSUN * tw * .1, ty - th * .3]], F(dk(col, .22)));
        const nn = D === 2 ? 22 : 9, cs = [dk(col, .4), lt(col, .24)];
        for (let c = 0; c < 2; c++) {
          g.strokeStyle = F(cs[c]);
          g.lineWidth = Math.max(1, h * .005);
          g.beginPath();
          for (let j = 0; j < nn; j++) {
            const yy = ty - th * (.05 + R(i * 50 + j + 700 + c * 20) * .9);
            const span = tw * (1 - (ty - yy) / th) * (R(i * 50 + j + 500 + c * 20) * 2 - 1);
            g.moveTo(sx + span, yy);
            g.lineTo(sx + span + (R(i * 50 + j + 900 + c * 20) - .5) * h * .04, yy + h * .03);
          }
          g.stroke();
        }
      }
      if (snow) {
        const sp2 = [[sx, ty - th]];
        const sw = tw * .62, sy = ty - th * .38;
        for (let j = 0; j <= m; j++) sp2.push([sx + sw * (1 - 2 * j / m), sy + (j % 2 ? th * .14 : -th * .02)]);
        poly(sp2, F([240, 246, 252]));
        if (D) poly([[sx, ty - th], [sx - LSUN * sw, sy], [sx - LSUN * sw * .3, sy + th * .06], [sx - LSUN * sw * .05, ty - th * .6]], F([208, 222, 238]));
      }
    }
    g.restore();
  } else if (k === 'bush') {
    const lc = bio.leaf[sp.c % bio.leaf.length], w = h * 1.5, snowy = bio === BIO[2];
    const n = D ? 5 : 3;
    for (let i = 0; i < n; i++) {
      const px = sx + (i / (n - 1) - .5) * w * .7, py = by - h * (.28 + R(i) * .12);
      puff(px, py, w * .24, h * (.32 + R(i + 5) * .12), F(dk(lc, .2 + R(i + 10) * .12)));
    }
    for (let i = 0; i < n; i++) {
      const px = sx + (i / (n - 1) - .5) * w * .66 - w * .03, py = by - h * (.38 + R(i + 15) * .14);
      puff(px, py, w * .17, h * .22, F(snowy ? lt(lc, .5) : mix(lc, lt(lc, .25), R(i + 20))));
    }
    if (D && !snowy && bio !== BIO[3]) {
      const bc = bio === BIO[0] ? [236, 86, 110] : [250, 210, 70];
      for (let i = 0; i < 5; i++) puff(sx + (R(i + 30) - .5) * w * .7, by - h * (.3 + R(i + 35) * .4), h * .035, h * .035, F(bc));
    }
  } else if (k === 'rock') {
    const w = h * 1.6, rc = bio === BIO[3] ? [168, 112, 88] : bio === BIO[2] ? [150, 156, 168] : [128, 128, 136];
    const j = i => (R(i) - .5) * .16;
    const pts = [[sx - w * (.5 + j(0)), by], [sx - w * (.38 + j(1)), by - h * (.55 + j(2))], [sx - w * (.1 + j(3)), by - h * (.96 + j(4) * .5)], [sx + w * (.2 + j(5)), by - h * (.86 + j(6))], [sx + w * (.46 + j(7)), by - h * (.4 + j(8))], [sx + w * (.5 + j(9)), by]];
    poly(pts, F(dk(rc, .12)));
    poly([pts[1], pts[2], [sx + w * .02, by - h * .5], [sx - w * .26, by - h * .34]], F(lt(rc, .2)));
    poly([pts[2], pts[3], pts[4], [sx + w * .12, by - h * .42]], F(dk(rc, .28)));
    poly([[sx - w * .26, by - h * .34], [sx + w * .02, by - h * .5], [sx + w * .12, by - h * .42], [sx + w * .3, by], [sx - w * .5, by]], F(rc));
    if (D) {
      line(sx - w * .05, by - h * .62, sx + w * .08, by - h * .2, F(dk(rc, .5)), h * .012);
      line(sx + w * .08, by - h * .2, sx + w * .02, by - h * .04, F(dk(rc, .5)), h * .01);
      if (bio !== BIO[3] && bio !== BIO[2]) {
        puff(sx - w * .2, by - h * .2, w * .13, h * .07, F([86, 128, 62]));
        puff(sx + w * .3, by - h * .1, w * .09, h * .05, F([78, 118, 58]));
      }
      if (bio === BIO[2]) poly([pts[1], pts[2], pts[3], [sx + w * .12, by - h * .78], [sx - w * .22, by - h * .66]], F([238, 244, 250]));
    }
  } else if (k === 'cactus') {
    const w = h * .16, cc = bio.leaf[0], lg = lt(cc, .14), dg = dk(cc, .28);
    const arm = (x, y, len, dir) => {
      puff(x + dir * w * .9, y, w * 1.3, w * .5, F(cc));
      g.fillStyle = F(cc);
      g.fillRect(x + dir * w * 1.6 - w * .38, y - len, w * .76, len);
      puff(x + dir * w * 1.6, y - len, w * .38, w * .38, F(cc));
    };
    g.fillStyle = F(cc);
    g.fillRect(sx - w / 2, by - h, w, h);
    puff(sx, by - h, w / 2, w / 2, F(cc));
    g.fillStyle = F(lg);
    g.fillRect(sx - w / 2, by - h, w * .28, h);
    g.fillStyle = F(dg);
    g.fillRect(sx + w * .2, by - h, w * .3, h);
    arm(sx, by - h * .38, h * .3, -1);
    arm(sx, by - h * .5, h * .26, 1);
    if (D) {
      for (let i = 0; i < 3; i++) line(sx - w * .12 + i * w * .17, by - h * .96, sx - w * .12 + i * w * .17, by - h * .02, F(dk(cc, .42)), h * .004);
      g.fillStyle = F([236, 232, 190]);
      for (let i = 0; i < 14; i++) g.fillRect(sx - w * .45 + R(i) * w * .9, by - h * (.08 + R(i + 20) * .86), Math.max(1, h * .006), Math.max(1, h * .006));
      if (R(3) < .6) puff(sx, by - h * 1.03, w * .24, w * .2, F([236, 96, 130]));
    }
  } else if (k === 'deadbush') {
    const c = [126, 92, 58];
    for (let i = -3; i <= 3; i++) {
      const tx = sx + i * h * .2, ty = by - h * (.55 + R(i + 5) * .45);
      line(sx, by, tx, ty, F(dk(c, R(i + 12) * .3)), h * .035);
      line(tx, ty, tx + i * h * .06, ty - h * .18, F(dk(c, .2)), h * .02);
      if (D) line(lerp(sx, tx, .55), lerp(by, ty, .55), lerp(sx, tx, .55) + h * .15 * (i % 2 ? 1 : -1), lerp(by, ty, .55) - h * .1, F(c), h * .015);
    }
  } else if (k === 'house') {
    const w = h * 1.35, walls = [[226, 210, 180], [196, 150, 120], [170, 180, 190], [220, 190, 120]], wall = walls[sp.c];
    const roof = [[150, 72, 62], [110, 74, 64], [86, 98, 112], [140, 96, 60]][sp.c];
    g.fillStyle = F(wall);
    g.fillRect(sx - w / 2, by - h * .5, w, h * .5);
    g.fillStyle = F(dk(wall, .16));
    g.fillRect(sx + w * .18, by - h * .5, w * .32, h * .5);
    if (D) {
      for (let i = 1; i < 9; i++) line(sx - w / 2, by - h * .5 + i * h * .055, sx + w / 2, by - h * .5 + i * h * .055, F(dk(wall, .2)), h * .004);
    }
    g.fillStyle = F(dk(wall, .4));
    g.fillRect(sx - w * .5, by - h * .02, w, h * .02);
    g.fillStyle = F(dk(roof, .25));
    g.fillRect(sx + w * .32, by - h * 1.02, w * .1, h * .3);
    poly([[sx - w * .62, by - h * .5], [sx + w * .62, by - h * .5], [sx + w * .06, by - h], [sx - w * .06, by - h]], F(roof));
    poly([[sx + w * .06, by - h], [sx + w * .62, by - h * .5], [sx + w * .2, by - h * .5]], F(dk(roof, .22)));
    if (D) {
      for (let i = 1; i < 6; i++) {
        const yy = by - h * (.5 + i * .085), half = w * (.62 - i * .09);
        line(sx - half, yy, sx + half, yy, F(dk(roof, .4)), h * .004);
      }
    }
    const lit = SKY.L < .5, win = lit ? [255, 210, 120] : [70, 92, 124];
    g.fillStyle = F(win);
    g.fillRect(sx - w * .34, by - h * .4, w * .2, h * .17);
    g.fillRect(sx + w * .1, by - h * .4, w * .2, h * .17);
    if (D) {
      const fr = F(dk(wall, .55));
      for (const wx of [sx - w * .34, sx + w * .1]) {
        g.strokeStyle = fr;
        g.lineWidth = Math.max(1, h * .008);
        g.strokeRect(wx, by - h * .4, w * .2, h * .17);
        line(wx + w * .1, by - h * .4, wx + w * .1, by - h * .23, fr, h * .006);
        line(wx, by - h * .315, wx + w * .2, by - h * .315, fr, h * .006);
      }
      g.fillStyle = F(dk(roof, .3));
      g.fillRect(sx - w * .07, by - h * .3, w * .14, h * .3);
      puff(sx + w * .04, by - h * .15, h * .01, h * .01, F([230, 200, 90]));
    }
  } else if (k === 'post') {
    g.fillStyle = css(mix(mix(shade([232, 232, 232]), FOGC, f), [255, 255, 255], .5 * clamp((.6 - SKY.L) / .4, 0, 1)));
    g.fillRect(sx - h * .04, by - h, h * .08, h);
    if (D) {
      g.fillStyle = F([210, 70, 50]);
      g.fillRect(sx - h * .04, by - h * .95, h * .08, h * .12);
    }
  } else if (k === 'lamp') {
    const dir = sp.x < 0 ? 1 : -1, hx = sx + dir * h * .22, hy = by - h * 1.02;
    const lit = clamp((.55 - SKY.L) / .3, 0, 1);
    g.fillStyle = F([52, 56, 64]);
    g.fillRect(sx - h * .018, by - h, h * .036, h);
    line(sx, by - h * .99, hx, hy, F([52, 56, 64]), h * .03);
    puff(hx, hy + h * .015, h * .05, h * .022, lit > .05 ? 'rgb(255,226,150)' : F([196, 196, 186]));
    if (lit > .02) {
      g.globalCompositeOperation = 'lighter';
      const gr = g.createRadialGradient(hx, hy, 1, hx, hy, h * .5);
      gr.addColorStop(0, 'rgba(255,214,130,' + (.5 * lit * (1 - f)) + ')');
      gr.addColorStop(1, 'rgba(255,214,130,0)');
      g.fillStyle = gr;
      g.fillRect(hx - h * .5, hy - h * .5, h, h);
      g.globalCompositeOperation = 'source-over';
    }
  } else if (k === 'orb') {
    const oh = Math.min(h, H * .2), t = S.t * 2 + s.i, oy = by - oh * (.62 + Math.sin(t) * .06), r = oh * .2;
    g.globalCompositeOperation = 'lighter';
    const gr = g.createRadialGradient(sx, oy, 1, sx, oy, oh * .6);
    gr.addColorStop(0, 'rgba(255,214,90,' + (.65 * (1 - f * .6)) + ')');
    gr.addColorStop(1, 'rgba(255,170,40,0)');
    g.fillStyle = gr;
    g.fillRect(sx - oh * .6, oy - oh * .6, oh * 1.2, oh * 1.2);
    g.globalCompositeOperation = 'source-over';
    puff(sx, oy, r, r, F([255, 210, 80]));
    puff(sx - r * .25, oy - r * .3, r * .5, r * .4, F([255, 246, 200]));
    g.strokeStyle = F([255, 236, 150]);
    g.lineWidth = Math.max(1, oh * .02);
    g.beginPath();
    g.ellipse(sx, oy, r * 1.7, r * .5, t * .6, 0, TAU);
    g.stroke();
  } else if (k === 'tuft') {
    const gc = dk(bio.grass, .22 + R(1) * .1);
    const n = D ? 7 : 4;
    for (let i = 0; i < n; i++) {
      const dx = (i / (n - 1) - .5) * h * 1.1, lean = (R(i + 2) - .5) * h * .6;
      line(sx + dx, by, sx + dx + lean, by - h * (.5 + R(i + 9) * .5), F(i % 2 ? gc : lt(gc, .15)), h * .05);
    }
  } else if (k === 'flower') {
    const cols = [[246, 236, 120], [240, 120, 150], [250, 250, 250], [180, 150, 240]], fc = cols[sp.c];
    const n = D ? 5 : 3;
    for (let i = 0; i < n; i++) {
      const dx = (i / (n - 1) - .5) * h * 1.2, ty = by - h * (.5 + R(i + 3) * .5);
      line(sx + dx, by, sx + dx, ty, F([70, 130, 60]), h * .04);
      puff(sx + dx, ty, h * .09, h * .09, F(fc));
      if (D) puff(sx + dx, ty, h * .035, h * .035, F([240, 190, 60]));
    }
  }
  if (clipped) g.restore();
}

function drawWorld() {
  const base = getSeg(Math.floor(S.pos / SEG)), bp = (S.pos % SEG) / SEG;
  const pz = S.pos + PLAYER_Z, ps = getSeg(Math.floor(pz / SEG));
  const py = hAt((S.pos + PLAYER_Z) / SEG), camY = CAM_H + py, camX = S.x * ROAD;
  drawSky();
  drawSkyLife();
  drawMountains(base);
  g.fillStyle = css(mix(shade(mix(BIO[base.a].grass, BIO[base.b].grass, base.w)), FOGC, .93));
  g.fillRect(0, HZ, W, H - HZ);
  let maxy = H, x = 0, dx = -(base.curve * bp);
  for (let n = 0; n < DRAW; n++) {
    const s = getSeg(base.i + n);
    s.fog = 1 - 1 / Math.exp(Math.pow(n / DRAW, 2) * FOGD);
    s.clip = maxy;
    s.p1.cz = s.i * SEG - S.pos;
    s.p2.cz = (s.i + 1) * SEG - S.pos;
    s.vis = s.p1.cz > CAM_D;
    if (s.vis && s.p2.cz > .5) {
      proj(s.p1, x - camX, s.y1 - camY);
      proj(s.p2, x + dx - camX, s.y2 - camY);
      if (s.p2.sy < s.p1.sy && s.p2.sy < maxy) {
        drawSegment(s);
        maxy = s.p1.sy;
      }
    } else s.vis = false;
    x += dx;
    dx += s.curve;
  }
  if (cache.size > 900) for (const k of cache.keys()) if (k < base.i - 40) cache.delete(k);
  const bucket = new Map();
  for (const c of S.tr) {
    const bi = Math.floor(c.z / SEG);
    if (bucket.has(bi)) bucket.get(bi).push(c); else bucket.set(bi, [c]);
  }
  for (let n = DRAW - 1; n >= 0; n--) {
    const s = getSeg(base.i + n);
    if (!s.vis) continue;
    for (const sp of s.sp) drawSprite(sp, s);
    const cs = bucket.get(s.i);
    if (cs) for (const c of cs) drawTrafficCar(c, s);
  }
  return { ps };
}

function drawHood() {
  const a = cam.hood;
  if (a < .02) return;
  const car = CARS[SAVE.car].c, L = Math.max(SKY.L, .5), c = [car[0] * L, car[1] * L, car[2] * L];
  g.globalAlpha = a;
  const hg = g.createLinearGradient(0, H * .78, 0, H);
  hg.addColorStop(0, css(mix(c, shade(SKY.hor), .4)));
  hg.addColorStop(1, css(mix(c, [0, 0, 0], .4)));
  g.fillStyle = hg;
  g.beginPath();
  g.moveTo(W * .08, H); g.lineTo(W * .92, H); g.lineTo(W * .67, H * .8); g.lineTo(W * .33, H * .8);
  g.closePath();
  g.fill();
  g.strokeStyle = 'rgba(255,255,255,.2)';
  g.lineWidth = 2;
  g.beginPath(); g.moveTo(W * .33, H * .8); g.lineTo(W * .67, H * .8); g.stroke();
  g.fillStyle = 'rgba(255,255,255,.09)';
  g.beginPath(); g.moveTo(W * .5, H * .8); g.lineTo(W * .49, H); g.lineTo(W * .52, H); g.lineTo(W * .51, H * .8); g.closePath(); g.fill();
  const dg = g.createLinearGradient(0, H * .93, 0, H);
  dg.addColorStop(0, '#1a1c22');
  dg.addColorStop(1, '#090a0d');
  g.fillStyle = dg;
  g.fillRect(0, H * .93, W, H * .07);
  g.fillStyle = '#0c0e12';
  g.beginPath(); g.moveTo(0, 0); g.lineTo(W * .05, 0); g.lineTo(W * .125, H * .86); g.lineTo(0, H * .94); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(W, 0); g.lineTo(W * .95, 0); g.lineTo(W * .875, H * .86); g.lineTo(W, H * .94); g.closePath(); g.fill();
  const rg = g.createLinearGradient(0, 0, 0, H * .08);
  rg.addColorStop(0, '#0c0e12');
  rg.addColorStop(1, 'rgba(12,14,18,0)');
  g.fillStyle = rg;
  g.fillRect(0, 0, W, H * .08);
  g.fillStyle = '#14161c';
  g.fillRect(W * .455, H * .04, W * .09, H * .045);
  g.fillStyle = css(mix(shade(SKY.hor), [0, 0, 0], .35));
  g.fillRect(W * .46, H * .046, W * .08, H * .032);
  g.globalAlpha = 1;
}

function paintCar(c, sp, u, tf, o) {
  const HW = 52 * sp.w, bh = 24 * sp.h, bt = -14 - bh, cb = bt + 2, ct = cb - sp.ch, ci = sp.ci, body = sp.c;
  const disc = (x, y, r, col) => {
    c.fillStyle = col;
    c.beginPath();
    c.arc(x * u, y * u, r * u, 0, TAU);
    c.fill();
  };
  c.fillStyle = 'rgba(0,0,0,.34)';
  c.beginPath();
  c.ellipse(0, 2 * u, (HW + 6) * u, 7 * u, 0, 0, TAU);
  c.fill();
  for (const wx of [-(HW - 12.5), HW - 12.5]) {
    c.fillStyle = tf([16, 18, 24]);
    c.fillRect((wx - 8.5) * u, -22 * u, 17 * u, 22 * u);
    c.fillStyle = tf([38, 41, 50]);
    c.fillRect((wx - 8.5) * u, -22 * u, 17 * u, 3 * u);
    disc(wx, -9, 4.4, tf([144, 151, 163]));
    disc(wx, -9, 3, tf([200, 206, 216]));
    disc(wx, -9, 1.4, tf([16, 18, 24]));
  }
  c.fillStyle = tf(mix(body, [0, 0, 0], .18));
  c.fillRect(-HW * u, bt * u, HW * 2 * u, bh * u);
  c.fillStyle = 'rgba(255,255,255,.08)';
  c.fillRect(-HW * u, bt * u, HW * 2 * u, 2 * u);
  const bg = c.createLinearGradient(0, ct * u, 0, cb * u);
  bg.addColorStop(0, tf(mix(body, o.sky, .32)));
  bg.addColorStop(1, tf(body));
  c.fillStyle = bg;
  c.beginPath();
  c.moveTo(-(HW - 2) * u, cb * u);
  c.lineTo(-(HW - 2 - ci) * u, ct * u);
  c.lineTo((HW - 2 - ci) * u, ct * u);
  c.lineTo((HW - 2) * u, cb * u);
  c.closePath();
  c.fill();
  c.strokeStyle = 'rgba(255,255,255,.26)';
  c.lineWidth = 1.2 * u;
  c.stroke();
  if (sp.st) {
    c.fillStyle = tf(sp.st);
    for (const sx of [-6, 2]) c.fillRect(sx * u, ct * u, 4 * u, (-14 - ct) * u);
  }
  if (sp.sp) {
    const wy = ct - (sp.sp === 2 ? 8 : 4), wh = sp.sp === 2 ? 5 : 3.6, ww = HW - 12;
    c.fillStyle = tf(mix(body, [0, 0, 0], .35));
    c.fillRect(-ww * u, wy * u, ww * 2 * u, wh * u);
    c.fillRect((-ww + 3) * u, (wy + wh) * u, 3 * u, (ct - wy - wh + 2) * u);
    c.fillRect((ww - 6) * u, (wy + wh) * u, 3 * u, (ct - wy - wh + 2) * u);
  }
  c.fillStyle = tf(o.glass);
  c.beginPath();
  c.moveTo(-(HW - 10) * u, (cb - 4) * u);
  c.lineTo(-(HW - 8 - ci) * u, (ct + 4) * u);
  c.lineTo((HW - 8 - ci) * u, (ct + 4) * u);
  c.lineTo((HW - 10) * u, (cb - 4) * u);
  c.closePath();
  c.fill();
  c.fillStyle = 'rgba(255,255,255,.1)';
  c.beginPath();
  c.moveTo(-(HW - 8 - ci) * u, (ct + 4) * u);
  c.lineTo(-8 * u, (ct + 4) * u);
  c.lineTo(-20 * u, (cb - 4) * u);
  c.lineTo(-(HW - 10) * u, (cb - 4) * u);
  c.closePath();
  c.fill();
  c.fillStyle = tf(mix(body, [0, 0, 0], .3));
  c.fillRect(-u, (ct + 4) * u, 2 * u, (cb - ct - 8) * u);
  c.fillRect(-HW * u, -18 * u, HW * 2 * u, 5 * u);
  c.fillStyle = tf([27, 29, 36]);
  c.fillRect(-(HW + 2) * u, -16 * u, (HW + 2) * 2 * u, 5 * u);
  c.fillStyle = tf([154, 160, 171]);
  c.fillRect(-(HW + 2) * u, -16 * u, (HW + 2) * 2 * u, u);
  if (!o.front) {
    for (const ex of [-16, 16]) {
      disc(ex, -8, 2.7, tf([74, 78, 88]));
      disc(ex, -8, 1.7, tf([10, 11, 14]));
    }
  }
  const py = -14 - bh * .54;
  c.fillStyle = tf(o.front ? [226, 208, 120] : [216, 216, 208]);
  c.fillRect(-9 * u, py * u, 18 * u, 7 * u);
  c.fillStyle = tf([48, 52, 61]);
  c.fillRect(-7 * u, (py + 2) * u, 14 * u, u);
  c.fillRect(-7 * u, (py + 4) * u, 9 * u, u);
  const ly = bt + 4, lc = o.front ? [255, 246, 214] : o.brake ? [255, 70, 70] : [200, 36, 36];
  if (o.front) {
    c.fillStyle = tf([20, 22, 28]);
    c.fillRect(-(HW - 19) * u, ly * u, (HW - 19) * 2 * u, 8 * u);
  }
  c.fillStyle = tf(lc);
  c.fillRect(-(HW - 3) * u, ly * u, 14 * u, 8 * u);
  c.fillRect((HW - 17) * u, ly * u, 14 * u, 8 * u);
  c.fillStyle = tf(mix(lc, [255, 255, 255], .35));
  c.fillRect(-(HW - 3) * u, ly * u, 14 * u, 1.6 * u);
  c.fillRect((HW - 17) * u, ly * u, 14 * u, 1.6 * u);
  if (o.glow > .02) {
    const rc = o.front ? '255,236,190' : '255,60,50';
    c.globalCompositeOperation = 'lighter';
    for (const lx of [-(HW - 10), HW - 10]) {
      const rg = c.createRadialGradient(lx * u, (ly + 4) * u, 1, lx * u, (ly + 4) * u, 26 * u);
      rg.addColorStop(0, 'rgba(' + rc + ',' + o.glow + ')');
      rg.addColorStop(1, 'rgba(' + rc + ',0)');
      c.fillStyle = rg;
      c.fillRect((lx - 30) * u, (ly - 26) * u, 60 * u, 60 * u);
    }
    c.globalCompositeOperation = 'source-over';
  }
}

function glassColor() {
  return mix(mix(SKY.hor, [18, 26, 38], .8), [0, 0, 0], .1);
}

function drawTrafficCar(c, s) {
  const p1 = s.p1, p2 = s.p2, t = clamp((c.z - s.i * SEG) / SEG, 0, 1);
  const sx = lerp(p1.fx, p2.fx, t) + c.x * lerp(p1.fw, p2.fw, t), by = lerp(p1.fy, p2.fy, t);
  const u = lerp(p1.sc, p2.sc, t) * W / 2 * 4.6;
  if (u < .022 || sx < -u * 80 || sx > W + u * 80) return;
  const clipped = s.clip < by;
  if (clipped) {
    if (s.clip <= by - u * 70) return;
    g.save();
    g.beginPath();
    g.rect(0, 0, W, s.clip);
    g.clip();
  }
  const f = s.fog, night = clamp((.55 - SKY.L) / .3, 0, 1);
  g.save();
  g.translate(sx, by);
  paintCar(g, c.sp, u, col => fogged(col, f), { front: c.dir < 0, brake: false, glow: night * .5 * (1 - f), glass: glassColor(), sky: shade(SKY.hor) });
  g.restore();
  if (clipped) g.restore();
}

function drawCar(info, spd) {
  drawHood();
  const A = cam.car;
  if (A < .02) return;
  g.globalAlpha = A * (S.inv > 0 && Math.floor(S.t * 14) % 2 ? .45 : 1);
  const cw = clamp(W * .19, 130, 330) * cam.sc, u = cw / 100, by = H * cam.cy;
  const rough = S.offroad > .1 ? Math.sin(S.pos * .5) * 1.8 * u * S.offroad : 0;
  const bounce = Math.sin(S.pos * .045) * u * spd + rough;
  const tilt = S.steer * .045 + (info.ps.curve * spd) * .008;
  const L = Math.max(SKY.L, .5), night = clamp((.6 - SKY.L) / .4, 0, 1);
  if (night > .02) {
    const ytop = HZ + (by - HZ) * .42;
    const gr = g.createLinearGradient(0, by - 14 * u, 0, ytop);
    gr.addColorStop(0, 'rgba(255,238,190,' + (.42 * night * A) + ')');
    gr.addColorStop(1, 'rgba(255,238,190,0)');
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(W / 2 - cw * .36, by - 14 * u);
    g.lineTo(W / 2 + cw * .36, by - 14 * u);
    g.lineTo(W / 2 + W * .2, ytop);
    g.lineTo(W / 2 - W * .2, ytop);
    g.closePath();
    g.fill();
    g.globalCompositeOperation = 'source-over';
  }
  g.save();
  g.translate(W / 2, by + bounce);
  g.rotate(tilt);
  paintCar(g, CARS[SAVE.car], u, col => css([col[0] * L, col[1] * L, col[2] * L]), { front: false, brake: S.braking, glow: night * .55 + (S.braking ? .5 : 0), glass: glassColor(), sky: shade(SKY.hor) });
  g.restore();
  g.globalAlpha = 1;
}

function drawWeather(dt) {
  if (S.rk > .02) {
    const n = Math.floor(DROPS.length * S.rk * (.65 + .35 * S.tk) * (S.quality === 'low' ? .5 : 1));
    g.strokeStyle = 'rgba(205,218,238,.42)';
    g.lineWidth = 1.2;
    g.beginPath();
    for (let i = 0; i < n; i++) {
      const d = DROPS[i];
      d.y += d.v * dt / H;
      if (d.y > 1) { d.y = -.05; d.x = Math.random(); }
      const x = d.x * W, y = d.y * H;
      g.moveTo(x, y);
      g.lineTo(x - d.l * .18, y + d.l);
    }
    g.stroke();
    g.fillStyle = 'rgba(40,50,68,' + (.14 * S.rk) + ')';
    g.fillRect(0, 0, W, H);
  }
  if (S.sk > .02) {
    const n = Math.floor(FLAKES.length * S.sk * (S.quality === 'low' ? .5 : 1));
    g.fillStyle = 'rgba(255,255,255,.85)';
    for (let i = 0; i < n; i++) {
      const f = FLAKES[i];
      f.y += f.v * dt / H;
      f.p += dt;
      if (f.y > 1) { f.y = -.03; f.x = Math.random(); }
      g.fillRect(f.x * W + Math.sin(f.p * 1.4) * 14, f.y * H, f.s, f.s);
    }
  }
}

function fmtClock(h) {
  const hh = Math.floor(h) % 24, mm = Math.floor((h % 1) * 60);
  return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
}
function textShadow(txt, x, y) {
  g.fillStyle = 'rgba(0,0,0,.45)';
  g.fillText(txt, x + 1, y + 1);
  g.fillStyle = '#f6f2ea';
  g.fillText(txt, x, y);
}
function drawHUD() {
  if (S.state === 'menu') return;
  const pad = 18;
  if (S.hud) {
    g.textBaseline = 'alphabetic';
    g.textAlign = 'left';
    g.font = '500 44px Fraunces, Georgia, serif';
    textShadow(String(Math.round(S.speed * (1 + .55 * S.boost) * CARS[SAVE.car].top / MAX * 220)), pad, H - pad - 22);
    g.font = '700 12px "Chakra Petch", sans-serif';
    textShadow('KM/H' + (S.auto ? '   AUTOPILOT' : ''), pad, H - pad - 4);
    const nb = H - pad - 86;
    g.fillStyle = 'rgba(255,255,255,.2)';
    g.fillRect(pad, nb, 120, 5);
    g.fillStyle = S.boost > .3 ? '#ffb84a' : '#f2d68a';
    g.fillRect(pad, nb, 120 * S.nitro, 5);
    textShadow('NITRO  SHIFT', pad, nb - 6);
    g.textAlign = 'right';
    g.font = '700 14px "Chakra Petch", sans-serif';
    textShadow(fmtClock(S.hour), W - pad, pad + 14);
    textShadow('$' + SAVE.money.toLocaleString(), W - pad, pad + 34);
    textShadow('ORBS ' + S.orbs, W - pad, pad + 54);
    const goal = goalKm(SAVE.level), bw = clamp(W - 260, 80, 320), bx = W / 2 - bw / 2;
    g.textAlign = 'center';
    textShadow('LEVEL ' + SAVE.level + '   ' + levelKm().toFixed(1) + ' / ' + goal.toFixed(1) + ' KM', W / 2, pad + 14);
    g.fillStyle = 'rgba(255,255,255,.2)';
    g.fillRect(bx, pad + 22, bw, 5);
    g.fillStyle = '#f2b45a';
    g.fillRect(bx, pad + 22, bw * clamp(levelKm() / goal, 0, 1), 5);
    S.pops.forEach((q, i) => {
      g.globalAlpha = clamp(1 - q.t / 1.6, 0, 1);
      g.textAlign = 'center';
      g.font = '700 15px "Chakra Petch", sans-serif';
      textShadow(q.s, W / 2, H * .52 - q.t * 40 - i * 22);
    });
    g.globalAlpha = 1;
  }
  if (S.toast) {
    const t = S.toast, k = t.t / t.life, a = k < .12 ? k / .12 : k > .75 ? (1 - k) / .25 : 1;
    g.globalAlpha = clamp(a, 0, 1);
    g.textAlign = 'center';
    g.font = '500 ' + Math.round(clamp(W * .045, 22, 40)) + 'px Fraunces, Georgia, serif';
    textShadow(t.text, W / 2, H * .17);
    g.globalAlpha = 1;
  }
  if (S.hintT > 0 && S.hud) {
    g.globalAlpha = clamp(S.hintT / 2, 0, 1);
    g.textAlign = 'center';
    g.font = '700 13px "Chakra Petch", sans-serif';
    textShadow(isTouch ? 'Hold left or right to steer' : 'A D steer     W S speed     Shift boost     Space autopilot     R weather     T time     C camera     G garage     P menu', W / 2, H * .27);
    g.globalAlpha = 1;
  }
  if (S.card) {
    const k = S.card, n = k.lines.length, cw = Math.min(360, W - 32), ch = 104 + n * 22, cx = W / 2 - cw / 2, cy = H * .14;
    g.globalAlpha = k.t < .3 ? k.t / .3 : k.t > 5 ? clamp(1 - (k.t - 5) / .8, 0, 1) : 1;
    g.fillStyle = 'rgba(14,20,32,.84)';
    g.fillRect(cx, cy, cw, ch);
    g.strokeStyle = 'rgba(243,239,230,.3)';
    g.lineWidth = 1;
    g.strokeRect(cx + .5, cy + .5, cw - 1, ch - 1);
    g.textAlign = 'center';
    g.font = '500 26px Fraunces, Georgia, serif';
    textShadow(k.title, W / 2, cy + 38);
    g.font = '700 13px "Chakra Petch", sans-serif';
    k.lines.forEach((l, i) => {
      g.textAlign = 'left';
      textShadow(l[0], cx + 18, cy + 66 + i * 22);
      g.textAlign = 'right';
      textShadow('+$' + l[1], cx + cw - 18, cy + 66 + i * 22);
    });
    g.fillStyle = '#f2b45a';
    g.font = '700 16px "Chakra Petch", sans-serif';
    g.textAlign = 'right';
    g.fillText('Total  +$' + k.total, cx + cw - 18, cy + 72 + n * 22);
    g.globalAlpha = 1;
  }
  if (S.hitFlash > .02) {
    const rg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .3, W / 2, H / 2, Math.hypot(W, H) * .6);
    rg.addColorStop(0, 'rgba(255,40,60,0)');
    rg.addColorStop(1, 'rgba(255,40,60,' + (S.hitFlash * .45) + ')');
    g.fillStyle = rg;
    g.fillRect(0, 0, W, H);
  }
}

function say(text) { $('live').textContent = text; }
function toast(text) { S.toast = { text, t: 0, life: 4 }; say(text); }

function updateLabels() {
  $('oWeather').textContent = 'Weather: ' + WLABEL[S.weather];
  $('oTime').textContent = 'Time: ' + TLABEL[S.timeMode];
  $('oAuto').textContent = 'Autopilot: ' + (S.auto ? 'On' : 'Off');
  $('oSound').textContent = 'Sound: ' + (muted ? 'Off' : 'On');
  $('oCam').textContent = 'Camera: ' + CAMS[S.cam].n;
  $('oCar').textContent = 'Car: ' + CARS[SAVE.car].n;
  $('oQuality').textContent = 'Quality: ' + (S.quality === 'high' ? 'High' : 'Low');
}
function cycleWeather() { S.weather = WEATHERS[(WEATHERS.indexOf(S.weather) + 1) % WEATHERS.length]; updateLabels(); toast(WLABEL[S.weather]); }
function cycleTime() {
  S.timeMode = TIMES[(TIMES.indexOf(S.timeMode) + 1) % TIMES.length];
  if (S.timeMode !== 'auto') S.hour = THOUR[S.timeMode];
  updateLabels();
  toast(TLABEL[S.timeMode]);
}
function toggleAuto() { S.auto = !S.auto; updateLabels(); }
function cycleCam() {
  S.cam = (S.cam + 1) % CAMS.length;
  updateLabels();
  toast(CAMS[S.cam].n + ' camera');
}
function cycleCar() {
  const o = SAVE.owned;
  SAVE.car = o[(o.indexOf(SAVE.car) + 1) % o.length];
  saveGame();
  updateLabels();
  updateBestText();
  toast(CARS[SAVE.car].n);
}
function toggleQuality() { S.quality = S.quality === 'high' ? 'low' : 'high'; DRAW = S.quality === 'high' ? 240 : 140; updateLabels(); }

function setPaused(p) {
  if (S.state === 'menu') return;
  if (p && S.state === 'play') { S.state = 'pause'; $('pause').hidden = false; $('resumeBtn').focus({ preventScroll: true }); }
  else if (!p && S.state === 'pause') { S.state = 'play'; $('pause').hidden = true; if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); }
}
function start() {
  initAudio();
  musicOn = true;
  setMuted(muted);
  $('menu').hidden = true;
  S.state = 'play';
  S.auto = false;
  S.hintT = 9;
  S.tgt = MAX * .3;
  S.km0 = S.pos / SEG / 1000;
  S.orbs = 0;
  S.nitro = 1;
  S.chk = Math.floor((S.pos + PLAYER_Z) / SEG);
  S.lvKm0 = S.pos / SEG / 1000;
  S.lvOrbs = S.lvPass = S.lvClose = S.lvCrash = 0;
  updateLabels();
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
}

addEventListener('keydown', e => {
  keys[e.code] = true;
  if (garageOpen) {
    if (e.code === 'Escape' || e.code === 'KeyG') closeGarage();
    return;
  }
  if (e.code === 'KeyG') {
    if (S.state === 'play') setPaused(true);
    openGarage();
    return;
  }
  if (e.code === 'Space') { e.preventDefault(); if (S.state === 'play') toggleAuto(); }
  if (e.code.startsWith('Arrow')) e.preventDefault();
  if (e.code === 'Enter' && S.state === 'menu') start();
  if (S.state === 'menu') return;
  if (e.code === 'KeyP' || e.code === 'Escape') setPaused(S.state === 'play');
  if (e.code === 'KeyR') cycleWeather();
  if (e.code === 'KeyT') cycleTime();
  if (e.code === 'KeyC') cycleCam();
  if (e.code === 'KeyV') cycleCar();
  if (e.code === 'KeyM') setMuted(!muted);
  if (e.code === 'KeyH') S.hud = !S.hud;
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; setPaused(true); });

cv.addEventListener('pointerdown', e => {
  if (e.pointerType === 'mouse' || S.state !== 'play') return;
  touchSteer.id = e.pointerId;
  const r = cv.getBoundingClientRect();
  touchSteer.v = clamp((e.clientX - r.left - W / 2) / (W * .25), -1, 1);
  try { cv.setPointerCapture(e.pointerId); } catch (_) {}
});
cv.addEventListener('pointermove', e => {
  if (e.pointerId !== touchSteer.id) return;
  const r = cv.getBoundingClientRect();
  touchSteer.v = clamp((e.clientX - r.left - W / 2) / (W * .25), -1, 1);
});
const endTouch = e => { if (e.pointerId === touchSteer.id) { touchSteer.id = null; touchSteer.v = 0; } };
cv.addEventListener('pointerup', endTouch);
cv.addEventListener('pointercancel', endTouch);
cv.addEventListener('contextmenu', e => e.preventDefault());

$('startBtn').addEventListener('click', start);
$('resumeBtn').addEventListener('click', () => setPaused(false));
$('oWeather').addEventListener('click', cycleWeather);
$('oTime').addEventListener('click', cycleTime);
$('oAuto').addEventListener('click', toggleAuto);
$('oSound').addEventListener('click', () => { initAudio(); setMuted(!muted); });
$('oCam').addEventListener('click', cycleCam);
$('oCar').addEventListener('click', cycleCar);
$('oQuality').addEventListener('click', toggleQuality);
$('faster').addEventListener('click', () => { S.tgt = Math.min(MAX, S.tgt + MAX * .08); });
$('slower').addEventListener('click', () => { S.tgt = Math.max(0, S.tgt - MAX * .08); });
$('menuBtn').addEventListener('click', () => setPaused(true));
const boostBtn = $('boostBtn');
boostBtn.addEventListener('pointerdown', e => { S.touchBoost = true; e.preventDefault(); });
const boostOff = () => { S.touchBoost = false; };
boostBtn.addEventListener('pointerup', boostOff);
boostBtn.addEventListener('pointercancel', boostOff);
boostBtn.addEventListener('pointerleave', boostOff);
addEventListener('pagehide', () => saveBest());
$('garBtn').addEventListener('click', openGarage);
$('oGarage').addEventListener('click', openGarage);
$('garClose').addEventListener('click', closeGarage);

const SPARKS = [];
const AMB = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), v: rnd(.03, .09), p: rnd(0, TAU), s: rnd(.6, 1.4), c: Math.random() }));
const FF = Array.from({ length: 34 }, () => ({ x: Math.random(), y: rnd(.5, .95), p: rnd(0, TAU), s: rnd(.01, .03) }));

function updateBestText() {
  $('menuBest').textContent = 'Level ' + SAVE.level + '   $' + SAVE.money.toLocaleString() + (SAVE.bestKm > 0 ? '   Best run ' + SAVE.bestKm.toFixed(1) + ' km' : '');
}
function saveBest() {
  if (S.state === 'menu') return;
  SAVE.bestKm = Math.max(SAVE.bestKm, S.pos / SEG / 1000 - S.km0);
  SAVE.bestOrbs = Math.max(SAVE.bestOrbs, S.orbs);
  saveGame();
}
function burstSparks() {
  const u = clamp(W * .19, 130, 330) * cam.sc / 100, cx = W / 2, cy = H * cam.cy - 60 * u;
  for (let i = 0; i < 16; i++) {
    const a = rnd(0, TAU), v = rnd(60, 260);
    SPARKS.push({ x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 80, l: 0, m: rnd(.4, .8) });
  }
}
function strike() {
  S.flashL = 1;
  S.dbl = Math.random() < .5;
  const pts = [];
  let x = rnd(.15, .85) * W, y = 0;
  while (y < HZ) { pts.push([x, y]); x += rnd(-30, 30); y += rnd(18, 40); }
  pts.push([x, HZ]);
  S.bolt = pts;
  sCrack();
  sThunder(rnd(.2, 1.6));
}
function updateExtras(dt) {
  const play = S.state === 'play';
  const isB = S.boost > .35;
  if (isB && !S.wasBoost) sBoostOn();
  S.wasBoost = isB;
  const pj = Math.floor((S.pos + PLAYER_Z) / SEG);
  if (pj - S.chk > 60) S.chk = pj - 60;
  if (play) {
    for (let j = S.chk + 1; j <= pj; j++) {
      for (const sp of getSeg(j).sp) {
        if (sp.k === 'orb' && !sp.got && Math.abs(sp.x - S.x) < .26) {
          sp.got = true;
          S.orbs++;
          S.lvOrbs++;
          S.nitro = Math.min(1, S.nitro + .06);
          sOrb();
          burstSparks();
          if (S.orbs % 10 === 0) toast(S.orbs + ' orbs');
        }
      }
    }
  }
  S.chk = pj;
  if (S.weather === 'storm') {
    S.lightT -= dt;
    if (S.lightT <= 0) { strike(); S.lightT = rnd(4, 11); }
  }
  S.flashL = Math.max(0, S.flashL - dt * 2.6);
  if (S.dbl && S.flashL < .45) { S.flashL = .9; S.dbl = false; }
  const wet = S.rk > .5 ? 1 : 0;
  if (S.wasWet && !wet && S.sky && S.sky.L > .6 && S.weather === 'clear') S.rainbow = 1;
  S.wasWet = wet;
  S.rainbow = Math.max(0, S.rainbow - dt / 50);
  if (S.weather === 'rain' || S.weather === 'storm' || S.weather === 'snow') S.rainbow = 0;
  const night = S.sky ? clamp((.45 - S.sky.L) / .25, 0, 1) : 0;
  S.nextMeteor -= dt;
  if (S.nextMeteor <= 0) {
    S.nextMeteor = rnd(5, 13);
    if (night > .6 && S.rk < .2 && S.fk < .3) S.meteor = { x: rnd(.1, .8), y: rnd(.04, .35), life: 0 };
  }
  if (S.meteor) { S.meteor.life += dt; if (S.meteor.life > .9) S.meteor = null; }
  S.saveT -= dt;
  if (S.saveT <= 0) { S.saveT = 8; if (play) saveBest(); }
}

function drawSkyLife() {
  const hq = S.quality === 'high';
  const cover = Math.max(S.rk, S.fk, S.sk * .8);
  const night = clamp((.5 - SKY.L) / .3, 0, 1) * (1 - cover);
  const day = clamp((SKY.L - .55) / .25, 0, 1) * (1 - Math.max(S.rk, S.sk, S.fk));
  if (night > .05 && hq) {
    const k = night * (S.bio === 2 ? 1 : .55), cols = ['90,255,150', '110,80,255', '60,255,190'];
    g.globalCompositeOperation = 'lighter';
    for (let r = 0; r < 3; r++) {
      const base = HZ * (.52 - r * .08), hgt = HZ * (.34 - r * .05), amp = HZ * .06, ys = [], tops = [];
      for (let x = 0, i = 0; x <= W + 16; x += 16, i++) {
        ys.push(base + Math.sin(x * .006 + S.t * .35 + r * 2.1) * amp + Math.sin(x * .017 - S.t * .5 + r) * amp * .4);
        tops.push(hgt * (.7 + .3 * Math.sin(i * .5 + S.t * .4 + r)));
      }
      const gr = g.createLinearGradient(0, base - hgt - amp * 2, 0, base + amp * 2);
      gr.addColorStop(0, 'rgba(' + cols[r] + ',0)');
      gr.addColorStop(.75, 'rgba(' + cols[r] + ',' + (.14 * k) + ')');
      gr.addColorStop(1, 'rgba(' + cols[r] + ',' + (.3 * k) + ')');
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(0, ys[0]);
      for (let i = 0; i < ys.length; i++) g.lineTo(i * 16, ys[i]);
      for (let i = ys.length - 1; i >= 0; i--) g.lineTo(i * 16, ys[i] - tops[i]);
      g.closePath();
      g.fill();
    }
    g.globalCompositeOperation = 'source-over';
  }
  if (night > .3 && S.meteor) {
    const m = S.meteor, k = m.life / .9, x = m.x * W + k * W * .22, y = m.y * HZ + k * HZ * .18;
    const gr = g.createLinearGradient(x, y, x - W * .1, y - HZ * .08);
    gr.addColorStop(0, 'rgba(255,255,255,' + (1 - k) + ')');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.strokeStyle = gr;
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x - W * .1, y - HZ * .08); g.stroke();
  }
  if (S.rainbow > .02) {
    const cx = W - S.sunX, cy = HZ + H * .08, R = W * .4, rc = ['255,70,70', '255,150,50', '255,225,70', '90,220,110', '70,160,255', '120,90,230'];
    g.lineWidth = Math.max(3, W * .006);
    for (let i = 0; i < rc.length; i++) {
      g.strokeStyle = 'rgba(' + rc[i] + ',' + (.26 * S.rainbow) + ')';
      g.beginPath(); g.arc(cx, cy, R - i * g.lineWidth, Math.PI * 1.04, Math.PI * 1.96); g.stroke();
    }
  }
  if (day > .1 && hq) {
    g.globalAlpha = day;
    const hor = SKY.hor, br = Math.max(14, W * .022);
    const bx = ((S.t * 7 + 420) % (W + 500)) - 250, by = HZ * .42 + Math.sin(S.t * .4) * 5;
    g.save();
    g.beginPath();
    g.arc(bx, by, br, 0, TAU);
    g.clip();
    for (let i = 0; i < 5; i++) {
      g.fillStyle = css(mix(shade(i % 2 ? [244, 200, 74] : [232, 86, 74]), hor, .3));
      g.fillRect(bx - br + i * br * .4, by - br, br * .4, br * 2);
    }
    g.restore();
    g.strokeStyle = css(mix(shade([60, 50, 44]), hor, .35));
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(bx - br * .62, by + br * .78); g.lineTo(bx - br * .16, by + br * 1.4);
    g.moveTo(bx + br * .62, by + br * .78); g.lineTo(bx + br * .16, by + br * 1.4);
    g.stroke();
    g.fillStyle = css(mix(shade([110, 76, 48]), hor, .3));
    g.fillRect(bx - br * .18, by + br * 1.38, br * .36, br * .28);
    g.strokeStyle = css(mix(shade([30, 34, 44]), hor, .45));
    g.lineWidth = 1.6;
    for (let i = 0; i < 6; i++) {
      const fx = ((S.t * 26 + i * 38 + 200) % (W + 300)) - 150;
      const fy = HZ * (.26 + .03 * Math.sin(i * 2.1)) + Math.abs(i - 2.5) * 6 + Math.sin(S.t * .5 + i) * 4;
      const fl = Math.sin(S.t * 9 + i * 1.7) * 5, sz = 8 + (i % 3);
      g.beginPath();
      g.moveTo(fx - sz, fy - fl);
      g.quadraticCurveTo(fx - sz * .4, fy - fl * .2 - 3, fx, fy);
      g.quadraticCurveTo(fx + sz * .4, fy - fl * .2 - 3, fx + sz, fy - fl);
      g.stroke();
    }
    g.globalAlpha = 1;
  }
}

function drawExtras(dt) {
  const spd = clamp(S.speed / MAX, 0, 1), hq = S.quality === 'high';
  const night = SKY ? clamp((.5 - SKY.L) / .3, 0, 1) : 0;
  const clear = 1 - Math.max(S.rk, S.sk, S.fk * .6);
  if (hq && clear > .5 && S.bio !== 2 && S.state !== 'menu') {
    const kind = S.bio, n = kind === 3 ? 26 : 38, cols = ['#d6702a', '#c0432a', '#e6a83a'];
    g.globalAlpha = (clear - .5) * 2 * (1 - night * .7);
    for (let i = 0; i < n; i++) {
      const a = AMB[i];
      a.p += dt * (kind === 3 ? 1.2 : 2.2) * a.s;
      a.y += a.v * dt * (kind === 3 ? .1 : 1);
      a.x -= (kind === 3 ? .1 : .015) * dt * a.s;
      if (a.y > 1.05) { a.y = -.05; a.x = Math.random(); }
      if (a.x < -.05) a.x = 1.05;
      const x = a.x * W + Math.sin(a.p) * 22, y = a.y * H;
      g.save();
      g.translate(x, y);
      g.rotate(a.p * .8);
      if (kind === 1) { g.fillStyle = cols[Math.floor(a.c * 3)]; g.fillRect(-4 * a.s, -2 * a.s, 8 * a.s, 4 * a.s); }
      else if (kind === 3) { g.fillStyle = 'rgba(230,200,150,.4)'; g.fillRect(-2, -1, 4 * a.s, 2); }
      else { g.fillStyle = 'rgba(255,200,215,.85)'; g.beginPath(); g.ellipse(0, 0, 3 * a.s, 1.6 * a.s, 0, 0, TAU); g.fill(); }
      g.restore();
    }
    g.globalAlpha = 1;
  }
  if (hq && night > .25 && (S.bio === 0 || S.bio === 1) && clear > .6 && S.state !== 'menu') {
    g.globalCompositeOperation = 'lighter';
    for (const f of FF) {
      f.p += dt * 1.4;
      const x = (f.x * W + Math.sin(f.p * .7 + f.s * 90) * 40 + W) % W, y = f.y * H + Math.cos(f.p * .5) * 18;
      const a = (.4 + .6 * Math.max(0, Math.sin(f.p * 1.3))) * night, r = 2 + f.s * 70;
      g.fillStyle = 'rgba(200,255,120,' + (.1 * a) + ')';
      g.beginPath(); g.arc(x, y, r * 2.2, 0, TAU); g.fill();
      g.fillStyle = 'rgba(235,255,170,' + (.9 * a) + ')';
      g.beginPath(); g.arc(x, y, r * .55, 0, TAU); g.fill();
    }
    g.globalCompositeOperation = 'source-over';
  }
  const sl = Math.max(S.boost * .9, (spd - .75) * 1.2);
  if (sl > .04 && !reduceMotion && S.state !== 'menu') {
    const cx = W / 2, cy = HZ + H * .05, big = Math.max(W, H);
    g.globalCompositeOperation = 'lighter';
    g.strokeStyle = 'rgba(255,255,255,' + (.18 * clamp(sl, 0, 1)) + ')';
    g.lineWidth = 1.5;
    g.beginPath();
    for (let i = 0; i < 34; i++) {
      const a = hs(i, 400) * TAU, ph = (S.t * (1.6 + hs(i, 401)) + hs(i, 402)) % 1;
      const r0 = (.25 + ph * .6) * big * .7, r1 = r0 + (.05 + ph * .25) * big * .6 * sl;
      g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0 * .7);
      g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1 * .7);
    }
    g.stroke();
    g.globalCompositeOperation = 'source-over';
  }
  for (let i = SPARKS.length - 1; i >= 0; i--) {
    const q = SPARKS[i];
    q.l += dt;
    if (q.l > q.m) { SPARKS.splice(i, 1); continue; }
    q.x += q.vx * dt;
    q.y += q.vy * dt;
    q.vy += 300 * dt;
    g.globalAlpha = 1 - q.l / q.m;
    g.fillStyle = '#ffd860';
    g.fillRect(q.x, q.y, 3, 3);
  }
  g.globalAlpha = 1;
  if (hq && S.sunVis > .15 && S.sunY < HZ + 4) {
    const near = clamp(1 - Math.abs(S.sunX - W / 2) / (W * .55), 0, 1), k = S.sunVis * (.35 + .65 * near);
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 10; i++) {
      const a = i * TAU / 10 + S.t * .02, len = H * (.45 + .25 * hs(i, 500));
      g.fillStyle = 'rgba(255,236,190,' + (.045 * k) + ')';
      g.beginPath();
      g.moveTo(S.sunX, S.sunY);
      g.lineTo(S.sunX + Math.cos(a - .05) * len, S.sunY + Math.sin(a - .05) * len);
      g.lineTo(S.sunX + Math.cos(a + .05) * len, S.sunY + Math.sin(a + .05) * len);
      g.closePath();
      g.fill();
    }
    const ghosts = [[.35, .05, '255,180,90'], [.6, .09, '120,200,255'], [1, .04, '255,230,140'], [1.5, .12, '255,140,200']];
    for (const gh of ghosts) {
      const gx = S.sunX + (W / 2 - S.sunX) * gh[0], gy = S.sunY + (H * .5 - S.sunY) * gh[0], r = H * gh[1];
      const gr = g.createRadialGradient(gx, gy, 0, gx, gy, r);
      gr.addColorStop(0, 'rgba(' + gh[2] + ',' + (.1 * k) + ')');
      gr.addColorStop(1, 'rgba(' + gh[2] + ',0)');
      g.fillStyle = gr;
      g.beginPath(); g.arc(gx, gy, r, 0, TAU); g.fill();
    }
    g.globalCompositeOperation = 'source-over';
  }
  if (S.flashL > .02) {
    g.fillStyle = 'rgba(220,230,255,' + (S.flashL * (reduceMotion ? .12 : .55)) + ')';
    g.fillRect(0, 0, W, H);
    if (S.bolt && S.flashL > .45 && !reduceMotion) {
      g.strokeStyle = 'rgba(255,255,255,.95)';
      g.lineWidth = 2.5;
      g.beginPath();
      S.bolt.forEach((p, i) => { if (i) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); });
      g.stroke();
    }
  }
}

const GAR = [];
let garageOpen = false;

function saveGame() {
  try { localStorage.setItem('slow-drifter-save', JSON.stringify(SAVE)); } catch (_) {}
}
function goalKm(level) { return 2 + 1.2 * (level - 1); }
function levelKm() { return S.pos / SEG / 1000 - S.lvKm0; }
function popup(text) {
  S.pops.push({ s: text, t: 0 });
  if (S.pops.length > 4) S.pops.shift();
}

function checkLevel() {
  if (S.state !== 'play' || levelKm() < goalKm(SAVE.level)) return;
  const L = SAVE.level;
  const lines = [['Level reward', 100 + 40 * L], ['Orbs x' + S.lvOrbs, S.lvOrbs * 8], ['Overtakes x' + S.lvPass, S.lvPass * 15], ['Close calls x' + S.lvClose, S.lvClose * 30], ['Clean drive', S.lvCrash ? 0 : 80]].filter(l => l[1] > 0);
  const total = lines.reduce((a, l) => a + l[1], 0);
  SAVE.money += total;
  SAVE.level++;
  saveGame();
  S.card = { t: 0, title: 'Level ' + L + ' complete', lines, total };
  S.lvKm0 = S.pos / SEG / 1000;
  S.lvOrbs = S.lvPass = S.lvClose = S.lvCrash = 0;
  sLevelUp();
  say('Level ' + L + ' complete. You earned ' + total + ' dollars.');
}

function crash(c) {
  if (S.inv > 0) return;
  const side = S.x >= c.x ? 1 : -1;
  S.inv = 1.4;
  S.speed *= .3;
  S.nitro = Math.max(0, S.nitro - .2);
  S.hitFlash = 1;
  S.shake = 1;
  S.lvCrash++;
  S.x = clamp(S.x + side * .3, -EDGE, EDGE);
  c.x = clamp(c.x - side * .25, -1.4, 1.4);
  c.hit = true;
  sCrash();
  popup('Crash');
}

function updateTraffic(dt) {
  const zp = S.pos + PLAYER_Z, play = S.state === 'play', want = S.state === 'menu' ? 4 : Math.min(16, 3 + Math.floor(SAVE.level * 1.3));
  S.inv = Math.max(0, S.inv - dt);
  S.hitFlash = Math.max(0, S.hitFlash - dt * 2);
  S.shake = Math.max(0, S.shake - dt * 2.2);
  for (const q of S.pops) q.t += dt;
  S.pops = S.pops.filter(q => q.t < 1.6);
  if (S.card) {
    S.card.t += dt;
    if (S.card.t > 5.8) S.card = null;
  }
  for (let i = S.tr.length - 1; i >= 0; i--) {
    const c = S.tr[i];
    c.z += c.v * dt;
    if (c.z < zp - 6000 || c.z > zp + 60000) { S.tr.splice(i, 1); continue; }
    if (!play) continue;
    const dz = c.z - zp, dx = Math.abs(c.x - S.x), crossed = c.prev > 0 && dz <= 0;
    if (!c.hit && dx < .34 && (Math.abs(dz) < 300 || crossed || (c.prev < 0 && dz >= 0))) crash(c);
    if (crossed && !c.hit) {
      if (c.dir > 0) { S.lvPass++; popup('Overtake  +$15'); sPass(); }
      if (dx < .7) { S.lvClose++; popup('Close call  +$30'); sPass(); }
    }
    c.prev = dz;
  }
  S.spawnT -= dt;
  if (S.tr.length < want && S.spawnT <= 0) {
    S.spawnT = rnd(.4, 1.2);
    const dir = Math.random() < .55 ? 1 : -1, z = zp + rnd(24000, 46000);
    if (!S.tr.some(c => c.dir === dir && Math.abs(c.z - z) < 5000)) {
      S.tr.push({
        z, dir, x: (dir > 0 ? .5 : -.5) + rnd(-.05, .05),
        v: dir > 0 ? MAX * rnd(.1, .22) * (1 + .03 * SAVE.level) : -MAX * rnd(.1, .22),
        sp: Object.assign({}, pick(TRAFFIC), { c: pick(TRAFFIC_COLORS) }), hit: false, prev: 0
      });
    }
  }
}

function buildGarage() {
  const list = $('carList');
  CARS.forEach((sp, i) => {
    const card = document.createElement('div');
    const view = document.createElement('canvas');
    view.width = 352;
    view.height = 172;
    const vc = view.getContext('2d');
    vc.scale(2, 2);
    vc.translate(88, 80);
    paintCar(vc, sp, .85, css, { front: false, brake: false, glow: 0, glass: [36, 52, 72], sky: [200, 216, 236] });
    const name = document.createElement('div');
    name.className = 'cname';
    name.textContent = sp.n;
    const stats = document.createElement('div');
    stats.className = 'cstats';
    [['Speed', sp.top / 1.5], ['Grip', sp.grip / 1.5], ['Nitro', sp.nit / 2]].forEach(r => {
      const row = document.createElement('div'), label = document.createElement('span'), track = document.createElement('i'), fill = document.createElement('b');
      label.textContent = r[0];
      fill.style.width = Math.round(r[1] * 100) + '%';
      track.appendChild(fill);
      row.appendChild(label);
      row.appendChild(track);
      stats.appendChild(row);
    });
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'opt';
    btn.addEventListener('click', () => pickCar(i));
    card.appendChild(view);
    card.appendChild(name);
    card.appendChild(stats);
    card.appendChild(btn);
    list.appendChild(card);
    GAR.push({ card, btn });
  });
}
function refreshGarage() {
  $('garMoney').textContent = '$' + SAVE.money.toLocaleString() + '   Level ' + SAVE.level;
  GAR.forEach((r, i) => {
    const owned = SAVE.owned.includes(i);
    r.card.className = 'car' + (SAVE.car === i ? ' sel' : '');
    r.btn.textContent = SAVE.car === i ? 'Selected' : owned ? 'Drive this' : 'Buy  $' + CARS[i].p.toLocaleString();
    r.btn.disabled = SAVE.car === i || (!owned && SAVE.money < CARS[i].p);
  });
}
function pickCar(i) {
  if (!SAVE.owned.includes(i)) {
    if (SAVE.money < CARS[i].p) return;
    SAVE.money -= CARS[i].p;
    SAVE.owned.push(i);
    sBuy();
  }
  SAVE.car = i;
  saveGame();
  refreshGarage();
  updateLabels();
  updateBestText();
}
function openGarage() {
  garageOpen = true;
  refreshGarage();
  $('garage').hidden = false;
  $('garClose').focus({ preventScroll: true });
}
function closeGarage() {
  garageOpen = false;
  $('garage').hidden = true;
  updateBestText();
}

function simulate(dt) {
  S.t += dt;
  if (S.timeMode === 'auto') S.hour = (S.hour + dt * 24 / 480) % 24;
  const wt = { rk: S.weather === 'rain' || S.weather === 'storm' ? 1 : 0, sk: S.weather === 'snow' ? 1 : 0, fk: S.weather === 'fog' ? 1 : 0, tk: S.weather === 'storm' ? 1 : 0 };
  for (const k in wt) S[k] += clamp(wt[k] - S[k], -dt * .4, dt * .4);

  const base = getSeg(Math.floor(S.pos / SEG));
  const ps = getSeg(Math.floor((S.pos + PLAYER_Z) / SEG));
  const spd = clamp(S.speed / MAX, 0, 1);
  const wantBoost = !!(keys.ShiftLeft || keys.ShiftRight || S.touchBoost) && S.nitro > .02 && S.state === 'play';
  S.boost += ((wantBoost ? 1 : 0) - S.boost) * Math.min(1, dt * 4);
  S.nitro = clamp(S.nitro + (wantBoost ? -dt / (4 * CARS[SAVE.car].nit) : dt / 7), 0, 1);

  if (S.state === 'menu') {
    S.auto = true;
    S.tgt = MAX * .2;
  }
  let up = keys.KeyW || keys.ArrowUp, down = keys.KeyS || keys.ArrowDown;
  if (S.state === 'play') {
    if (up) S.tgt = Math.min(MAX, S.tgt + MAX * .16 * dt);
    if (down) S.tgt = Math.max(0, S.tgt - MAX * .3 * dt);
  }
  S.braking = !!down && S.state === 'play';

  let steerTarget = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0) + touchSteer.v;
  if (S.auto) steerTarget = clamp((.4 - S.x) * 2.2 + ps.curve * spd * CENT, -1, 1);
  steerTarget = clamp(steerTarget, -1, 1);
  S.steer += (steerTarget - S.steer) * Math.min(1, dt * 7);

  const off = clamp((Math.abs(S.x) - 1) / .25, 0, 1);
  S.offroad += (off - S.offroad) * Math.min(1, dt * 8);
  let cap = S.tgt;
  if (S.auto) {
    const zp = S.pos + PLAYER_Z;
    for (const c of S.tr) if (c.dir > 0 && c.z > zp && c.z - zp < 7000 && Math.abs(c.x - S.x) < .5) cap = Math.min(cap, c.v * .92 / CARS[SAVE.car].top);
  }
  const eff = cap * (1 - .55 * S.offroad);
  S.speed += (eff - S.speed) * Math.min(1, dt * (eff > S.speed ? .55 : 1.4));

  const dxs = dt * 2.2 * Math.max(.35, spd), grip = CARS[SAVE.car].grip;
  S.x += S.steer * dxs * grip;
  S.x -= dxs * spd * (1 + .55 * S.boost) * ps.curve * CENT / grip;
  if (Math.abs(S.x) > EDGE) { S.x = Math.sign(S.x) * EDGE; S.speed *= 1 - dt * .6; }
  S.pos += S.speed * (1 + .55 * S.boost) * CARS[SAVE.car].top * dt;
  S.bgOff += base.curve * spd * dt * 220;

  const bid = base.w < .5 ? base.a : base.b;
  if (bid !== S.bio) {
    S.bio = bid;
    if (S.state !== 'menu') toast(BIO[bid].name);
  }
  if (S.hintT > 0) S.hintT -= dt;
  if (S.toast) { S.toast.t += dt; if (S.toast.t > S.toast.life) S.toast = null; }
  updateTraffic(dt);
  checkLevel();
  updateExtras(dt);
  audioUpdate(spd, S.offroad);
}

function updateCam(dt) {
  const t = CAMS[S.cam], k = Math.min(1, dt * 3.5);
  for (const key of ['h', 'fov', 'hz', 'car', 'sc', 'cy', 'hood']) cam[key] += (t[key] - cam[key]) * k;
  CAM_H = cam.h;
  CAM_D = 1 / Math.tan((cam.fov + 6 * clamp(S.speed / MAX, 0, 1) + 12 * S.boost) * Math.PI / 180);
  PLAYER_Z = CAM_H * CAM_D;
  HZ = H * cam.hz + Math.sin(S.t * 55) * S.offroad * clamp(S.speed / MAX, 0, 1) * 1.4 + Math.sin(S.t * 70) * S.shake * 5;
}

function prepareLight() {
  LSUN = S.hour < 12 ? -1 : 1;
  const sk = sky(S.hour), cover = clamp(Math.max(S.rk * .9, S.sk * .6, S.fk * .5) + S.tk * .1, 0, 1);
  const gray = [138, 146, 158];
  const top = mix(sk.top, mix(gray, [0, 0, 0], 1 - sk.L), cover * .6);
  const hor = mix(sk.hor, mix(gray, [0, 0, 0], 1 - sk.L), cover * .7);
  let L = sk.L * (1 - .24 * S.rk - .1 * S.sk - .1 * S.fk - .2 * S.tk);
  L = clamp(L, .16, 1);
  const n = clamp(1 - L, 0, 1);
  LT = [L * (1 - .16 * n), L * (1 - .06 * n), L * (1 + .14 * n) + .02 * n];
  SKY = { top, hor, L };
  FOGC = hor;
  FOGD = 5 + S.fk * 22 + S.rk * 6 + S.sk * 4;
  S.sky = SKY;
}

let lastT = performance.now();
function frame(now) {
  const dt = Math.min(.05, (now - lastT) / 1000);
  lastT = now;
  g.setTransform(DPR, 0, 0, DPR, 0, 0);
  updateCam(dt);
  if (S.state !== 'pause') simulate(dt);
  prepareLight();
  const info = drawWorld();
  drawCar(info, clamp(S.speed / MAX, 0, 1));
  drawWeather(S.state === 'pause' ? 0 : dt);
  drawExtras(S.state === 'pause' ? 0 : dt);
  drawHUD();
  requestAnimationFrame(frame);
}

S.speed = MAX * .2;
buildGarage();
updateBestText();
updateLabels();
resize();
requestAnimationFrame(frame);
})();
