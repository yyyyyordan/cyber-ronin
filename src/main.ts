import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

// ---------- Renderer ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.appendChild(renderer.domElement);

// ---------- Scene & Camera ----------
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(78, window.innerWidth / window.innerHeight, 0.05, 200);
camera.position.set(0, 1.7, 8);
scene.add(camera);

// ---------- Lights (instances are reused across arenas; tuned per level) ----------
const sun = new THREE.DirectionalLight(0xffffff, 1);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -40;
sun.shadow.camera.right = 40;
sun.shadow.camera.top = 40;
sun.shadow.camera.bottom = -40;
sun.shadow.camera.near = 0.5;
sun.shadow.camera.far = 120;
sun.shadow.bias = -0.0003;
sun.shadow.normalBias = 0.02;
sun.position.set(18, 36, 12);
scene.add(sun);
const rim = new THREE.DirectionalLight(0xffffff, 0);
rim.position.set(-8, 6, -14);
scene.add(rim);
const hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, 0);
scene.add(hemi);

// ============================================================
// ---------- Cosmic ambient music (Web Audio, no asset) ----------
// ============================================================
class CosmicAudio {
  ctx: AudioContext;
  master: GainNode;
  filter: BiquadFilterNode;
  delay: DelayNode;
  delayFb: GainNode;
  started = false;
  muted = false;
  baseVolume = 0.18;

  constructor() {
    const Ctx = (window.AudioContext || (window as any).webkitAudioContext);
    this.ctx = new Ctx();

    this.master = this.ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(this.ctx.destination);

    // A simple feedback-delay for "wet" cosmic tail.
    this.delay = this.ctx.createDelay(2.0);
    this.delay.delayTime.value = 0.55;
    this.delayFb = this.ctx.createGain();
    this.delayFb.gain.value = 0.45;
    this.delay.connect(this.delayFb);
    this.delayFb.connect(this.delay);

    this.filter = this.ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 1500;
    this.filter.Q.value = 0.7;
    this.filter.connect(this.master);
    this.delay.connect(this.master);
  }

  init() {
    if (this.started) return;
    this.started = true;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.makePads();
    this.makeFilterLFO();
    this.scheduleBells();
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(0, t);
    this.master.gain.linearRampToValueAtTime(this.muted ? 0 : this.baseVolume, t + 4);
  }

  toggleMute() {
    this.muted = !this.muted;
    const target = this.muted ? 0 : this.baseVolume;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(this.master.gain.value, t);
    this.master.gain.linearRampToValueAtTime(target, t + 0.4);
    return this.muted;
  }

  private makePads() {
    // Dm9-ish chord — D, F, A, C, E.
    const freqs = [146.83, 174.61, 220.00, 261.63, 329.63];
    for (const f of freqs) {
      const padGain = this.ctx.createGain();
      padGain.gain.value = 0.07;
      const o1 = this.ctx.createOscillator();
      o1.type = 'sawtooth'; o1.frequency.value = f; o1.detune.value = -5;
      const o2 = this.ctx.createOscillator();
      o2.type = 'sawtooth'; o2.frequency.value = f; o2.detune.value = +5;
      const sub = this.ctx.createOscillator();
      sub.type = 'sine'; sub.frequency.value = f / 2;
      o1.connect(padGain); o2.connect(padGain); sub.connect(padGain);
      padGain.connect(this.filter);
      // Per-voice slow tremolo for shimmer.
      const lfo = this.ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.04 + Math.random() * 0.10;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 0.035;
      lfo.connect(lfoGain);
      lfoGain.connect(padGain.gain);
      o1.start(); o2.start(); sub.start(); lfo.start();
    }
  }

  private makeFilterLFO() {
    const lfo = this.ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.03;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 800;
    lfo.connect(lfoGain);
    lfoGain.connect(this.filter.frequency);
    lfo.start();
  }

  private scheduleBells() {
    const bellNotes = [523.25, 587.33, 698.46, 783.99, 1046.50, 1174.66];
    const next = () => {
      const delay = 5 + Math.random() * 11;
      setTimeout(() => {
        if (!this.muted) this.playBell(bellNotes[Math.floor(Math.random() * bellNotes.length)]);
        next();
      }, delay * 1000);
    };
    next();
  }

  private playBell(freq: number) {
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.075, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + 5);
    o.connect(g);
    g.connect(this.filter);
    g.connect(this.delay);   // also feed the delay tail
    o.start(t);
    o.stop(t + 5.5);
  }
}

const music = new CosmicAudio();

// ---------- Helpers ----------
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
function nowSec() { return performance.now() / 1000; }

// ---------- Sword builder ----------
function buildSword(opts: {
  gripColor?: number; bladeColor?: number; bladeLen?: number; bladeW?: number;
  edgeGlow?: number; curved?: boolean;
} = {}) {
  const group = new THREE.Group();
  const bladeLen = opts.bladeLen ?? 0.85;
  const bladeW = opts.bladeW ?? 0.045;
  const bladeMat = new THREE.MeshStandardMaterial({
    color: opts.bladeColor ?? 0xf5f7fa, roughness: 0.18, metalness: 0.92,
  });
  const blade = new THREE.Mesh(new THREE.BoxGeometry(bladeW, bladeLen, 0.008), bladeMat);
  blade.position.y = bladeLen / 2 + 0.08;
  blade.castShadow = true;
  const tip = new THREE.Mesh(
    new THREE.ConeGeometry(bladeW * 0.55, bladeLen * 0.16, 4), bladeMat
  );
  tip.position.y = bladeLen + 0.14;
  tip.rotation.y = Math.PI / 4;
  if (opts.edgeGlow !== undefined) {
    const glowMat = new THREE.MeshStandardMaterial({
      color: 0x180000, emissive: opts.edgeGlow, emissiveIntensity: 1.6,
    });
    const edge = new THREE.Mesh(
      new THREE.BoxGeometry(bladeW * 0.25, bladeLen * 0.95, 0.012), glowMat
    );
    edge.position.set(bladeW * 0.4, bladeLen / 2 + 0.08, 0);
    blade.add(edge);
  }
  if (opts.curved) {
    const curve = new THREE.Mesh(
      new THREE.BoxGeometry(bladeW * 1.1, bladeLen * 0.32, 0.008), bladeMat
    );
    curve.position.set(bladeW * 0.55, bladeLen + 0.05, 0);
    curve.rotation.z = -0.55;
    blade.add(curve);
  }
  const guard = new THREE.Mesh(
    new THREE.BoxGeometry(bladeW * 5, 0.045, 0.05),
    new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.4, metalness: 0.85 })
  );
  guard.position.y = 0.06;
  const grip = new THREE.Mesh(
    new THREE.CylinderGeometry(0.024, 0.024, 0.16, 12),
    new THREE.MeshStandardMaterial({ color: opts.gripColor ?? 0x3d2418, roughness: 0.85 })
  );
  grip.position.y = -0.04;
  const pommel = new THREE.Mesh(
    new THREE.SphereGeometry(0.03, 12, 12),
    new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.4, metalness: 0.85 })
  );
  pommel.position.y = -0.13;
  group.add(blade, tip, guard, grip, pommel);
  return { group, blade, bladeMat, bladeLen };
}

// ---------- Player sword (red-glowing blade) ----------
const playerSword = buildSword({ gripColor: 0x3d2418, bladeColor: 0x180004 });
{
  const m = playerSword.bladeMat;
  m.emissive = new THREE.Color(0xff2030);
  m.emissiveIntensity = 2.0;
  m.metalness = 0.35;
  m.roughness = 0.5;
  m.needsUpdate = true;
}
const sword = playerSword.group;
const HELD_POS = new THREE.Vector3(0.32, -0.32, -0.55);
const HELD_ROT = new THREE.Euler(-0.35, 0.18, -0.18);
sword.position.copy(HELD_POS);
sword.rotation.copy(HELD_ROT);
camera.add(sword);

// ============================================================
// ---------- Cyber-Ronin Humanoid ----------
// ============================================================
type Humanoid = {
  root: THREE.Group;
  pelvis: THREE.Group; spine: THREE.Group; neck: THREE.Group;
  rShoulder: THREE.Group; rElbow: THREE.Group; rHand: THREE.Group;
  lShoulder: THREE.Group; lElbow: THREE.Group;
  rHip: THREE.Group; rKnee: THREE.Group;
  lHip: THREE.Group; lKnee: THREE.Group;
  meshes: THREE.Mesh[];
  emissiveAccents: THREE.Mesh[];
  faceMesh: THREE.Mesh;
};

function buildCyberRonin(): Humanoid {
  const armorMat = new THREE.MeshStandardMaterial({
    color: 0x16161c, roughness: 0.45, metalness: 0.55,
  });
  const helmetMat = new THREE.MeshStandardMaterial({
    color: 0x0c0c10, roughness: 0.35, metalness: 0.7,
  });
  const seamMat = new THREE.MeshStandardMaterial({
    color: 0x100002, roughness: 0.6,
    emissive: 0xff1830, emissiveIntensity: 2.4,
  });
  const eyeMat = new THREE.MeshStandardMaterial({
    color: 0x140000, roughness: 0.3,
    emissive: 0xff2a3a, emissiveIntensity: 3.2,
  });

  const meshes: THREE.Mesh[] = [];
  const emissiveAccents: THREE.Mesh[] = [];
  function addMesh(parent: THREE.Group, geom: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) {
    const m = new THREE.Mesh(geom, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    meshes.push(m);
    return m;
  }
  function addAccent(parent: THREE.Group, geom: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    const m = new THREE.Mesh(geom, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    parent.add(m);
    emissiveAccents.push(m);
    return m;
  }

  const root = new THREE.Group();
  const pelvis = new THREE.Group();
  pelvis.position.y = 1.05;
  root.add(pelvis);
  addMesh(pelvis, new THREE.BoxGeometry(0.55, 0.22, 0.36), armorMat.clone());
  addAccent(pelvis, new THREE.BoxGeometry(0.58, 0.045, 0.38), seamMat.clone(), 0, -0.06, 0);

  const spine = new THREE.Group();
  spine.position.y = 0.13;
  pelvis.add(spine);
  addMesh(spine, new THREE.BoxGeometry(0.72, 0.62, 0.42), armorMat.clone(), 0, 0.34, 0);
  addAccent(spine, new THREE.BoxGeometry(0.06, 0.55, 0.05), seamMat.clone(), 0, 0.34, 0.22);
  addAccent(spine, new THREE.BoxGeometry(0.04, 0.32, 0.04), seamMat.clone(), -0.18, 0.42, 0.215, 0, 0, 0.5);
  addAccent(spine, new THREE.BoxGeometry(0.04, 0.32, 0.04), seamMat.clone(), 0.18, 0.42, 0.215, 0, 0, -0.5);

  const neck = new THREE.Group();
  neck.position.y = 0.68;
  spine.add(neck);
  addMesh(neck, new THREE.CylinderGeometry(0.09, 0.10, 0.14, 12), armorMat.clone(), 0, 0.07, 0);
  const faceMesh = addMesh(neck, new THREE.SphereGeometry(0.20, 24, 24), helmetMat.clone(), 0, 0.27, 0);

  const eyeBar = new THREE.BoxGeometry(0.07, 0.025, 0.01);
  const lEye = new THREE.Mesh(eyeBar, eyeMat.clone());
  lEye.position.set(0.06, 0.30, 0.185);
  lEye.rotation.z = -0.18;
  neck.add(lEye); emissiveAccents.push(lEye);
  const rEye = new THREE.Mesh(eyeBar, eyeMat.clone());
  rEye.position.set(-0.06, 0.30, 0.185);
  rEye.rotation.z = 0.18;
  neck.add(rEye); emissiveAccents.push(rEye);

  const hornMat = new THREE.MeshStandardMaterial({
    color: 0x080808, roughness: 0.5, metalness: 0.6,
  });
  const hornGeom = new THREE.ConeGeometry(0.045, 0.34, 8);
  const lHorn = new THREE.Mesh(hornGeom, hornMat);
  lHorn.position.set(0.10, 0.40, -0.02);
  lHorn.rotation.set(-0.25, 0, 0.55);
  lHorn.castShadow = true;
  neck.add(lHorn); meshes.push(lHorn);
  const rHorn = new THREE.Mesh(hornGeom, hornMat);
  rHorn.position.set(-0.10, 0.40, -0.02);
  rHorn.rotation.set(-0.25, 0, -0.55);
  rHorn.castShadow = true;
  neck.add(rHorn); meshes.push(rHorn);

  const rShoulder = new THREE.Group();
  rShoulder.position.set(-0.40, 0.55, 0);
  spine.add(rShoulder);
  addMesh(rShoulder, new THREE.BoxGeometry(0.30, 0.20, 0.32), armorMat.clone(), -0.05, 0.04, 0);
  addMesh(rShoulder, new THREE.CapsuleGeometry(0.10, 0.24, 6, 12), armorMat.clone(), 0, -0.18, 0);
  addAccent(rShoulder, new THREE.BoxGeometry(0.32, 0.04, 0.34), seamMat.clone(), -0.05, -0.05, 0);

  const rElbow = new THREE.Group();
  rElbow.position.y = -0.34;
  rShoulder.add(rElbow);
  addMesh(rElbow, new THREE.CapsuleGeometry(0.085, 0.24, 6, 12), armorMat.clone(), 0, -0.16, 0);

  const rHand = new THREE.Group();
  rHand.position.y = -0.32;
  rElbow.add(rHand);
  addMesh(rHand, new THREE.SphereGeometry(0.09, 12, 12), armorMat.clone());

  const lShoulder = new THREE.Group();
  lShoulder.position.set(0.40, 0.55, 0);
  spine.add(lShoulder);
  addMesh(lShoulder, new THREE.BoxGeometry(0.30, 0.20, 0.32), armorMat.clone(), 0.05, 0.04, 0);
  addMesh(lShoulder, new THREE.CapsuleGeometry(0.10, 0.24, 6, 12), armorMat.clone(), 0, -0.18, 0);
  addAccent(lShoulder, new THREE.BoxGeometry(0.32, 0.04, 0.34), seamMat.clone(), 0.05, -0.05, 0);

  const lElbow = new THREE.Group();
  lElbow.position.y = -0.34;
  lShoulder.add(lElbow);
  addMesh(lElbow, new THREE.CapsuleGeometry(0.085, 0.24, 6, 12), armorMat.clone(), 0, -0.16, 0);

  const lHand = new THREE.Group();
  lHand.position.y = -0.32;
  lElbow.add(lHand);
  addMesh(lHand, new THREE.SphereGeometry(0.09, 12, 12), armorMat.clone());

  const rHip = new THREE.Group();
  rHip.position.set(-0.16, -0.07, 0);
  pelvis.add(rHip);
  addMesh(rHip, new THREE.CapsuleGeometry(0.12, 0.32, 6, 12), armorMat.clone(), 0, -0.22, 0);
  addAccent(rHip, new THREE.BoxGeometry(0.04, 0.30, 0.05), seamMat.clone(), -0.10, -0.22, 0);

  const rKnee = new THREE.Group();
  rKnee.position.y = -0.45;
  rHip.add(rKnee);
  addMesh(rKnee, new THREE.CapsuleGeometry(0.10, 0.32, 6, 12), armorMat.clone(), 0, -0.22, 0);

  const rFoot = new THREE.Group();
  rFoot.position.y = -0.45;
  rKnee.add(rFoot);
  addMesh(rFoot, new THREE.BoxGeometry(0.20, 0.09, 0.32), armorMat.clone(), 0, 0, 0.07);

  const lHip = new THREE.Group();
  lHip.position.set(0.16, -0.07, 0);
  pelvis.add(lHip);
  addMesh(lHip, new THREE.CapsuleGeometry(0.12, 0.32, 6, 12), armorMat.clone(), 0, -0.22, 0);
  addAccent(lHip, new THREE.BoxGeometry(0.04, 0.30, 0.05), seamMat.clone(), 0.10, -0.22, 0);

  const lKnee = new THREE.Group();
  lKnee.position.y = -0.45;
  lHip.add(lKnee);
  addMesh(lKnee, new THREE.CapsuleGeometry(0.10, 0.32, 6, 12), armorMat.clone(), 0, -0.22, 0);

  const lFoot = new THREE.Group();
  lFoot.position.y = -0.45;
  lKnee.add(lFoot);
  addMesh(lFoot, new THREE.BoxGeometry(0.20, 0.09, 0.32), armorMat.clone(), 0, 0, 0.07);

  return {
    root, pelvis, spine, neck,
    rShoulder, rElbow, rHand, lShoulder, lElbow,
    rHip, rKnee, lHip, lKnee,
    meshes, emissiveAccents, faceMesh,
  };
}

// ============================================================
// ---------- PolyHaven PBR texture helpers (used by the beast) ----------
// ============================================================
const _texLoader = new THREE.TextureLoader();
const _texCache = new Map<string, THREE.Texture>();
function phTex(asset: string, map: 'diff' | 'nor_gl' | 'rough', repeat = 1, anis = 4): THREE.Texture {
  const key = `${asset}|${map}|${repeat}`;
  const cached = _texCache.get(key);
  if (cached) return cached;
  const t = _texLoader.load(`textures/${asset}_${map}_1k.jpg`);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  if (map === 'diff') t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = anis;
  _texCache.set(key, t);
  return t;
}
function phMat(asset: string, opts: {
  color?: number; repeat?: number;
  roughness?: number; metalness?: number;
  emissive?: number; emissiveIntensity?: number;
} = {}): THREE.MeshStandardMaterial {
  const r = opts.repeat ?? 1;
  return new THREE.MeshStandardMaterial({
    color: opts.color ?? 0xffffff,
    map: phTex(asset, 'diff', r),
    normalMap: phTex(asset, 'nor_gl', r),
    roughnessMap: phTex(asset, 'rough', r),
    roughness: opts.roughness ?? 1.0,
    metalness: opts.metalness ?? 0.0,
    emissive: new THREE.Color(opts.emissive ?? 0x000000),
    emissiveIntensity: opts.emissiveIntensity ?? 0,
  });
}

// ============================================================
// ---------- Wild Beast (Wilderness boss) ----------
// ============================================================
function buildWildBeast(): Humanoid {
  // PBR-textured materials from PolyHaven (fur, weathered rock, blood-red leather).
  const fur = phMat('curly_teddy_natural', { color: 0x6a5238, repeat: 2 });
  const furDark = phMat('curly_teddy_natural', { color: 0x3a2a18, repeat: 2 });
  const skullMat = phMat('worn_rock_natural_01', { color: 0xd8c0a0, repeat: 1 });
  const fangMat = new THREE.MeshStandardMaterial({
    color: 0xf0e8d0, roughness: 0.4,    // too small for textures; kept smooth.
  });
  const clawMat = new THREE.MeshStandardMaterial({
    color: 0x141414, roughness: 0.4, metalness: 0.3,
  });
  const eyeMat = new THREE.MeshStandardMaterial({
    color: 0x180000, emissive: 0xff2010, emissiveIntensity: 3.8,
  });
  const trophyMat = phMat('leather_red_02', {
    color: 0x6a1414, repeat: 1,
    emissive: 0x500404, emissiveIntensity: 0.4,
  });

  const meshes: THREE.Mesh[] = [];
  const emissiveAccents: THREE.Mesh[] = [];
  function addM(parent: THREE.Group, geom: THREE.BufferGeometry, mt: THREE.Material, x = 0, y = 0, z = 0) {
    const m = new THREE.Mesh(geom, mt);
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    meshes.push(m);
    return m;
  }
  function addA(parent: THREE.Group, geom: THREE.BufferGeometry, mt: THREE.Material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    const m = new THREE.Mesh(geom, mt);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    parent.add(m);
    emissiveAccents.push(m);
    return m;
  }

  const root = new THREE.Group();

  // Pelvis (wide hips, hunched).
  const pelvis = new THREE.Group();
  pelvis.position.y = 0.95;
  root.add(pelvis);
  addM(pelvis, new THREE.BoxGeometry(0.65, 0.28, 0.42), fur.clone());
  // Trophy belt — bone necklace at hips.
  addM(pelvis, new THREE.BoxGeometry(0.70, 0.05, 0.46), skullMat.clone(), 0, -0.05, 0);
  // Tail (cone extending down-back from rear of pelvis).
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.85, 6), furDark.clone());
  tail.position.set(0, -0.05, -0.30);
  tail.rotation.x = Math.PI * 0.6;
  tail.castShadow = true;
  pelvis.add(tail);
  meshes.push(tail);

  // Spine.
  const spine = new THREE.Group();
  spine.position.y = 0.13;
  pelvis.add(spine);
  // Chest (broad, shaggy).
  addM(spine, new THREE.BoxGeometry(0.85, 0.65, 0.50), fur.clone(), 0, 0.35, 0);
  // Hanging skull trophy on the chest.
  const trophy = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 12), skullMat.clone());
  trophy.position.set(0, 0.18, 0.27);
  trophy.castShadow = true;
  spine.add(trophy);
  meshes.push(trophy);
  // Blood-stained sash diagonal (the per-level emissive accent).
  addA(spine, new THREE.BoxGeometry(0.75, 0.10, 0.06), trophyMat.clone(), 0, 0.40, 0.27, 0, 0, 0.18);

  // Neck + head.
  const neck = new THREE.Group();
  neck.position.y = 0.62;
  spine.add(neck);
  addM(neck, new THREE.CylinderGeometry(0.10, 0.13, 0.16, 12), fur.clone(), 0, 0.08, 0);
  // Wolf-like skull head: longer in Z (snout direction).
  const faceMesh = addM(neck, new THREE.BoxGeometry(0.32, 0.30, 0.42), skullMat.clone(), 0, 0.30, 0.05);
  // Snout extending forward.
  addM(neck, new THREE.BoxGeometry(0.22, 0.20, 0.28), skullMat.clone(), 0, 0.24, 0.32);
  // Glowing eyes (emissive accents — re-skin per level).
  const lEye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 12), eyeMat.clone());
  lEye.position.set(0.085, 0.34, 0.30);
  neck.add(lEye); emissiveAccents.push(lEye);
  const rEye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 12), eyeMat.clone());
  rEye.position.set(-0.085, 0.34, 0.30);
  neck.add(rEye); emissiveAccents.push(rEye);
  // Fangs (visible at the snout edge).
  for (const x of [-0.06, -0.02, 0.02, 0.06]) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.10, 4), fangMat.clone());
    f.position.set(x, 0.18, 0.46);
    f.rotation.x = Math.PI; // point downward
    neck.add(f);
    meshes.push(f);
  }
  // Horns (curled back from skull) — dark weathered bone.
  const hornMat = phMat('worn_rock_natural_01', { color: 0x382818, repeat: 0.5 });
  const lHorn = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.40, 6), hornMat);
  lHorn.position.set(0.13, 0.45, -0.05);
  lHorn.rotation.set(0.4, 0, 0.5);
  lHorn.castShadow = true;
  neck.add(lHorn); meshes.push(lHorn);
  const rHorn = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.40, 6), hornMat);
  rHorn.position.set(-0.13, 0.45, -0.05);
  rHorn.rotation.set(0.4, 0, -0.5);
  rHorn.castShadow = true;
  neck.add(rHorn); meshes.push(rHorn);
  // Pointed wolf-ears.
  const lEar = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 4), furDark.clone());
  lEar.position.set(0.09, 0.50, 0.10);
  lEar.castShadow = true;
  neck.add(lEar); meshes.push(lEar);
  const rEar = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 4), furDark.clone());
  rEar.position.set(-0.09, 0.50, 0.10);
  rEar.castShadow = true;
  neck.add(rEar); meshes.push(rEar);

  // Right arm (thick, fur-covered, clawed).
  const rShoulder = new THREE.Group();
  rShoulder.position.set(-0.40, 0.55, 0);
  spine.add(rShoulder);
  addM(rShoulder, new THREE.SphereGeometry(0.21, 12, 12), furDark.clone(), -0.05, 0.04, 0); // shoulder hump
  addM(rShoulder, new THREE.CapsuleGeometry(0.115, 0.24, 6, 12), fur.clone(), 0, -0.18, 0);

  const rElbow = new THREE.Group();
  rElbow.position.y = -0.34;
  rShoulder.add(rElbow);
  addM(rElbow, new THREE.CapsuleGeometry(0.10, 0.24, 6, 12), fur.clone(), 0, -0.16, 0);

  const rHand = new THREE.Group();
  rHand.position.y = -0.32;
  rElbow.add(rHand);
  addM(rHand, new THREE.SphereGeometry(0.11, 12, 12), furDark.clone());
  // 3 claws extending forward from the hand.
  for (let i = 0; i < 3; i++) {
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.16, 4), clawMat);
    c.position.set(-0.05 + i * 0.05, -0.05, 0.10);
    c.rotation.x = Math.PI / 2;
    c.castShadow = true;
    rHand.add(c);
    meshes.push(c);
  }

  // Left arm — mirrored.
  const lShoulder = new THREE.Group();
  lShoulder.position.set(0.40, 0.55, 0);
  spine.add(lShoulder);
  addM(lShoulder, new THREE.SphereGeometry(0.21, 12, 12), furDark.clone(), 0.05, 0.04, 0);
  addM(lShoulder, new THREE.CapsuleGeometry(0.115, 0.24, 6, 12), fur.clone(), 0, -0.18, 0);

  const lElbow = new THREE.Group();
  lElbow.position.y = -0.34;
  lShoulder.add(lElbow);
  addM(lElbow, new THREE.CapsuleGeometry(0.10, 0.24, 6, 12), fur.clone(), 0, -0.16, 0);

  const lHand = new THREE.Group();
  lHand.position.y = -0.32;
  lElbow.add(lHand);
  addM(lHand, new THREE.SphereGeometry(0.11, 12, 12), furDark.clone());
  for (let i = 0; i < 3; i++) {
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.16, 4), clawMat);
    c.position.set(-0.05 + i * 0.05, -0.05, 0.10);
    c.rotation.x = Math.PI / 2;
    c.castShadow = true;
    lHand.add(c);
    meshes.push(c);
  }

  // Right leg (digitigrade-ish, thick).
  const rHip = new THREE.Group();
  rHip.position.set(-0.18, -0.07, 0);
  pelvis.add(rHip);
  addM(rHip, new THREE.CapsuleGeometry(0.13, 0.30, 6, 12), fur.clone(), 0, -0.22, 0);

  const rKnee = new THREE.Group();
  rKnee.position.y = -0.45;
  rHip.add(rKnee);
  addM(rKnee, new THREE.CapsuleGeometry(0.11, 0.30, 6, 12), fur.clone(), 0, -0.22, 0);

  const rFoot = new THREE.Group();
  rFoot.position.y = -0.45;
  rKnee.add(rFoot);
  addM(rFoot, new THREE.BoxGeometry(0.18, 0.10, 0.32), furDark.clone(), 0, 0, 0.07);

  // Left leg — mirrored.
  const lHip = new THREE.Group();
  lHip.position.set(0.18, -0.07, 0);
  pelvis.add(lHip);
  addM(lHip, new THREE.CapsuleGeometry(0.13, 0.30, 6, 12), fur.clone(), 0, -0.22, 0);

  const lKnee = new THREE.Group();
  lKnee.position.y = -0.45;
  lHip.add(lKnee);
  addM(lKnee, new THREE.CapsuleGeometry(0.11, 0.30, 6, 12), fur.clone(), 0, -0.22, 0);

  const lFoot = new THREE.Group();
  lFoot.position.y = -0.45;
  lKnee.add(lFoot);
  addM(lFoot, new THREE.BoxGeometry(0.18, 0.10, 0.32), furDark.clone(), 0, 0, 0.07);

  return {
    root, pelvis, spine, neck,
    rShoulder, rElbow, rHand, lShoulder, lElbow,
    rHip, rKnee, lHip, lKnee,
    meshes, emissiveAccents, faceMesh,
  };
}

// ---------- Bloody Leg weapon (Wilderness boss carries this instead of a sword) ----------
function buildBloodyLeg() {
  const group = new THREE.Group();
  // PBR-textured: blood-red leather for flesh, weathered rock for bone.
  const fleshMat = phMat('leather_red_02', {
    color: 0x9a3828, repeat: 1.5,
    emissive: 0x301010, emissiveIntensity: 0.25,
  });
  const bloodMat = phMat('leather_red_02', {
    color: 0x7a0606, repeat: 0.6,
    emissive: 0xff1010, emissiveIntensity: 0.55,
  });
  const boneMat = phMat('worn_rock_natural_01', { color: 0xe8e0d0, repeat: 0.5 });
  // Foot uses worn brown leather (skin-of-the-foot).
  const footMat = phMat('brown_leather', { color: 0x6a3828, repeat: 1.0 });

  // Held at the foot (down-end). Leg extends UPWARD like a club.
  // Foot — uses brown-leather (skin) instead of red flesh.
  const foot = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.12, 0.34), footMat);
  foot.position.set(0, 0.06, 0.06);
  foot.castShadow = true;
  // Ankle
  const ankle = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 10), fleshMat);
  ankle.position.y = 0.14;
  // Calf
  const calf = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.11, 0.40, 12), fleshMat);
  calf.position.y = 0.36;
  calf.castShadow = true;
  // Knee
  const knee = new THREE.Mesh(new THREE.SphereGeometry(0.135, 12, 12), fleshMat);
  knee.position.y = 0.60;
  // Thigh — wider, the "blade" of the weapon
  const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.13, 0.50, 12), fleshMat);
  thigh.position.y = 0.86;
  thigh.castShadow = true;
  // Severed end (bloody flesh stump)
  const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.18, 0.06, 12), bloodMat);
  stump.position.y = 1.13;
  // Visible bone protruding from cut
  const bone = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.12, 8), boneMat);
  bone.position.y = 1.20;
  // Blood drips trailing down
  const drip1 = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), bloodMat);
  drip1.position.set(0.10, 0.95, 0.05);
  drip1.scale.y = 1.6;
  const drip2 = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 6), bloodMat);
  drip2.position.set(-0.08, 0.75, 0.0);
  drip2.scale.y = 1.4;
  const drip3 = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 6), bloodMat);
  drip3.position.set(0.05, 0.55, -0.03);
  drip3.scale.y = 1.5;

  group.add(foot, ankle, calf, knee, thigh, stump, bone, drip1, drip2, drip3);

  // Conform to the same shape that buildSword returns so the boss combat code works as-is.
  return {
    group,
    blade: thigh as THREE.Mesh,        // raycast / parry sparks emit from the thigh (top of weapon)
    bladeMat: fleshMat,                // emissive on this material drives the windup glow
    bladeLen: 1.2,
  };
}

// ---------- Pose system ----------
type Triple = readonly [number, number, number];
type Pose = {
  spine: Triple; neck: Triple;
  rShoulder: Triple; rElbow: Triple; rHand: Triple;
  lShoulder: Triple; lElbow: Triple;
  rHip: Triple; rKnee: Triple;
  lHip: Triple; lKnee: Triple;
};
function pose(p: Partial<Pose>): Pose {
  const z: Triple = [0, 0, 0];
  return {
    spine: p.spine ?? z, neck: p.neck ?? z,
    rShoulder: p.rShoulder ?? z, rElbow: p.rElbow ?? z, rHand: p.rHand ?? z,
    lShoulder: p.lShoulder ?? z, lElbow: p.lElbow ?? z,
    rHip: p.rHip ?? z, rKnee: p.rKnee ?? z,
    lHip: p.lHip ?? z, lKnee: p.lKnee ?? z,
  };
}
const lerpTriple = (a: Triple, b: Triple, t: number): Triple =>
  [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
function applyPose(h: Humanoid, p: Pose) {
  h.spine.rotation.set(p.spine[0], p.spine[1], p.spine[2]);
  h.neck.rotation.set(p.neck[0], p.neck[1], p.neck[2]);
  h.rShoulder.rotation.set(p.rShoulder[0], p.rShoulder[1], p.rShoulder[2]);
  h.rElbow.rotation.set(p.rElbow[0], p.rElbow[1], p.rElbow[2]);
  h.rHand.rotation.set(p.rHand[0], p.rHand[1], p.rHand[2]);
  h.lShoulder.rotation.set(p.lShoulder[0], p.lShoulder[1], p.lShoulder[2]);
  h.lElbow.rotation.set(p.lElbow[0], p.lElbow[1], p.lElbow[2]);
  h.rHip.rotation.set(p.rHip[0], p.rHip[1], p.rHip[2]);
  h.rKnee.rotation.set(p.rKnee[0], p.rKnee[1], p.rKnee[2]);
  h.lHip.rotation.set(p.lHip[0], p.lHip[1], p.lHip[2]);
  h.lKnee.rotation.set(p.lKnee[0], p.lKnee[1], p.lKnee[2]);
}
function applyPoseLerp(h: Humanoid, a: Pose, b: Pose, t: number) {
  applyPose(h, {
    spine: lerpTriple(a.spine, b.spine, t),
    neck: lerpTriple(a.neck, b.neck, t),
    rShoulder: lerpTriple(a.rShoulder, b.rShoulder, t),
    rElbow: lerpTriple(a.rElbow, b.rElbow, t),
    rHand: lerpTriple(a.rHand, b.rHand, t),
    lShoulder: lerpTriple(a.lShoulder, b.lShoulder, t),
    lElbow: lerpTriple(a.lElbow, b.lElbow, t),
    rHip: lerpTriple(a.rHip, b.rHip, t),
    rKnee: lerpTriple(a.rKnee, b.rKnee, t),
    lHip: lerpTriple(a.lHip, b.lHip, t),
    lKnee: lerpTriple(a.lKnee, b.lKnee, t),
  });
}
function snapshotPose(h: Humanoid): Pose {
  const r = (g: THREE.Group): Triple => [g.rotation.x, g.rotation.y, g.rotation.z];
  return {
    spine: r(h.spine), neck: r(h.neck),
    rShoulder: r(h.rShoulder), rElbow: r(h.rElbow), rHand: r(h.rHand),
    lShoulder: r(h.lShoulder), lElbow: r(h.lElbow),
    rHip: r(h.rHip), rKnee: r(h.rKnee),
    lHip: r(h.lHip), lKnee: r(h.lKnee),
  };
}

const POSE_IDLE: Pose = pose({
  rShoulder: [-0.55, 0, -0.18], rElbow: [-1.1, 0, 0], rHand: [0.3, 0, 0.2],
  lShoulder: [0, 0, 0.2], lElbow: [-0.5, 0, 0],
  rHip: [0, 0, -0.04], lHip: [0, 0, 0.04],
  rKnee: [0.15, 0, 0], lKnee: [0.15, 0, 0],
});
const POSE_WINDUP: Pose = pose({
  spine: [0, -0.4, 0], neck: [0, -0.2, 0],
  rShoulder: [2.6, 0, -0.4], rElbow: [-0.7, 0, 0], rHand: [0.5, 0, 0.1],
  lShoulder: [-0.4, 0, 0.5], lElbow: [-1.1, 0, 0],
  rHip: [-0.15, 0, -0.04], lHip: [-0.15, 0, 0.04],
  rKnee: [0.35, 0, 0], lKnee: [0.35, 0, 0],
});
const POSE_STRIKE: Pose = pose({
  spine: [0, 0.4, 0], neck: [0, 0.15, 0],
  rShoulder: [-0.3, 0.7, 1.4], rElbow: [-0.2, 0, 0], rHand: [0.1, 0, -0.2],
  lShoulder: [0.3, 0, 0.4], lElbow: [-0.7, 0, 0],
  rHip: [-0.2, 0, -0.04], lHip: [-0.2, 0, 0.04],
  rKnee: [0.4, 0, 0], lKnee: [0.4, 0, 0],
});
const POSE_STAGGER: Pose = pose({
  spine: [0.3, 0, 0.1], neck: [0.4, 0, 0],
  rShoulder: [0.3, 0, -0.15], rElbow: [-0.7, 0, 0],
  lShoulder: [0.3, 0, 0.15], lElbow: [-0.7, 0, 0],
  rHip: [0.1, 0, -0.04], lHip: [0.1, 0, 0.04],
  rKnee: [0.5, 0, 0], lKnee: [0.5, 0, 0],
});
// Beast idle — arm extended FORWARD with the bloody leg held out horizontally
// pointing at the player (wrist tilted down so the thigh leads).
const POSE_BEAST_IDLE: Pose = pose({
  spine: [0, 0, 0],
  neck: [0, 0, 0],
  rShoulder: [-1.30, 0.10, -0.20],
  rElbow: [-0.20, 0, 0],
  rHand: [1.40, 0, 0],
  lShoulder: [0.10, 0, 0.25],
  lElbow: [-0.50, 0, 0],
  rHip: [0, 0, -0.04],
  lHip: [0, 0, 0.04],
  rKnee: [0.20, 0, 0],
  lKnee: [0.20, 0, 0],
});

// Beast attack — OVERHEAD BASH. Wind-up raises the leg-club UP and BACK
// over the shoulder, then strike SLAMS it DOWN and FORWARD at the player.
const POSE_BEAST_WINDUP: Pose = pose({
  spine: [-0.10, -0.35, 0],           // twist body back, slight lean back
  neck: [-0.20, -0.20, 0],
  rShoulder: [2.40, 0.20, -0.40],     // arm raised UP and BACK over the shoulder
  rElbow: [-0.50, 0, 0],              // slight bend so leg cocks past the shoulder
  rHand: [0.20, 0, 0],                // wrist neutral; leg points straight up
  lShoulder: [-0.40, 0, 0.50],        // left arm comes forward as counterweight
  lElbow: [-1.10, 0, 0],
  rHip: [-0.15, 0, -0.04],
  lHip: [-0.15, 0, 0.04],
  rKnee: [0.40, 0, 0],
  lKnee: [0.40, 0, 0],
});
const POSE_BEAST_STRIKE: Pose = pose({
  spine: [0.20, 0.40, 0],             // untwist hard, lean FORWARD into the strike
  neck: [0.25, 0.15, 0],
  rShoulder: [-0.50, 0.50, 0.50],     // arm sweeps DOWN-FORWARD-ACROSS at the player
  rElbow: [-0.20, 0, 0],              // forearm extended at the impact
  rHand: [1.40, 0, -0.10],            // wrist whips down so the leg slams forward-down
  lShoulder: [0.40, 0, 0.40],         // left arm swings back as counterweight
  lElbow: [-0.50, 0, 0],
  rHip: [-0.20, 0, -0.04],
  lHip: [-0.20, 0, 0.04],
  rKnee: [0.40, 0, 0],
  lKnee: [0.40, 0, 0],
});

const POSE_DEATH: Pose = pose({
  spine: [0.4, 0, 0.1], neck: [0.5, 0, 0],
  rShoulder: [0.5, 0, -0.1], rElbow: [-0.4, 0, 0],
  lShoulder: [0.5, 0, 0.1], lElbow: [-0.4, 0, 0],
  rHip: [0.5, 0, 0], lHip: [0.5, 0, 0],
  rKnee: [1.7, 0, 0], lKnee: [1.7, 0, 0],
});

// ---------- Boss instance ----------
type BossState = 'idle' | 'windup' | 'strike' | 'recover' | 'staggered' | 'dead';

let bossH: Humanoid = buildCyberRonin();
bossH.root.position.set(0, 0, 0);
scene.add(bossH.root);
applyPose(bossH, POSE_IDLE);

type BossWeapon = { group: THREE.Group; blade: THREE.Mesh; bladeMat: THREE.MeshStandardMaterial; bladeLen: number };
let bossWeapon: BossWeapon = buildSword({
  gripColor: 0x18120e, bladeColor: 0x002010,
  bladeLen: 1.10, bladeW: 0.075,
  edgeGlow: 0x00ff60, curved: true,
}) as BossWeapon;
{
  const m = bossWeapon.bladeMat;
  m.emissive = new THREE.Color(0x00b048);
  m.emissiveIntensity = 1.5;
  m.metalness = 0.4;
  m.roughness = 0.5;
  m.needsUpdate = true;
}
bossWeapon.group.position.set(0, -0.05, 0);
bossH.rHand.add(bossWeapon.group);

const boss = {
  humanoid: bossH,
  parts: bossH.meshes,
  swordBlade: bossWeapon.blade,
  swordBladeMat: bossWeapon.bladeMat,
  hp: 100, maxHp: 100,
  posture: 0, maxPosture: 100,
  state: 'idle' as BossState,
  stateTime: 0,
  nextAttackAt: 1.5,
  attackResolved: false,
  longRecover: false,
  hitFlash: 0,
  staggerCritReady: false,
};

// Track which stage the current boss model belongs to, so we only rebuild on stage change.
let currentBossStageIdx = 0;
function disposeGroup(g: THREE.Object3D) {
  g.traverse((c) => {
    if (c instanceof THREE.Mesh) {
      c.geometry.dispose();
      const m: any = c.material;
      if (m) {
        if (Array.isArray(m)) m.forEach((mm: any) => mm.dispose());
        else m.dispose();
      }
    }
  });
}
function rebuildBoss(stageIdx: number) {
  // Remove current model + weapon from scene + dispose.
  scene.remove(bossH.root);
  disposeGroup(bossH.root);

  if (stageIdx === 1) {
    // Wilderness — wild beast wielding a bloody leg.
    bossH = buildWildBeast();
    bossWeapon = buildBloodyLeg();
    bossWeapon.group.position.set(0, 0, 0);
    bossWeapon.group.rotation.set(-0.15, 0, 0);   // angle the leg slightly forward in hand
    bossH.rHand.add(bossWeapon.group);
  } else {
    // Cosmos (and default) — cyber-ronin with the green sword.
    bossH = buildCyberRonin();
    bossWeapon = buildSword({
      gripColor: 0x18120e, bladeColor: 0x002010,
      bladeLen: 1.10, bladeW: 0.075,
      edgeGlow: 0x00ff60, curved: true,
    }) as BossWeapon;
    const m = bossWeapon.bladeMat;
    m.emissive = new THREE.Color(0x00b048);
    m.emissiveIntensity = 1.5;
    m.metalness = 0.4;
    m.roughness = 0.5;
    m.needsUpdate = true;
    bossWeapon.group.position.set(0, -0.05, 0);
    bossH.rHand.add(bossWeapon.group);
  }
  bossH.root.position.set(0, 0, 0);
  scene.add(bossH.root);
  applyPose(bossH, stageIdx === 1 ? POSE_BEAST_IDLE : POSE_IDLE);

  // Rebind the runtime boss references.
  boss.humanoid = bossH;
  boss.parts = bossH.meshes;
  boss.swordBlade = bossWeapon.blade;
  boss.swordBladeMat = bossWeapon.bladeMat;
  currentBossStageIdx = stageIdx;
}
let poseFrom: Pose = POSE_IDLE;
function transitionBoss(next: BossState) {
  poseFrom = snapshotPose(bossH);
  boss.state = next;
  boss.stateTime = 0;
}

// Boss locomotion (walk gait + approach toward player).
let bossWalkPhase = 0;
const BOSS_WALK_SPEED = 1.6;        // m/s
const BOSS_PREFERRED_DIST = 3.2;    // boss wants to be this close before attacking
const BOSS_ATTACK_RANGE = 3.5;      // attack-trigger distance
function updateBossLocomotion(dt: number): boolean {
  const dx = camera.position.x - bossH.root.position.x;
  const dz = camera.position.z - bossH.root.position.z;
  const dist = Math.hypot(dx, dz);
  if (dist <= BOSS_PREFERRED_DIST + 0.25) {
    // In range — slow walk phase to a stop.
    bossWalkPhase = lerp(bossWalkPhase, 0, Math.min(1, 8 * dt));
    return false;
  }
  const ux = dx / dist;
  const uz = dz / dist;
  bossH.root.position.x += ux * BOSS_WALK_SPEED * dt;
  bossH.root.position.z += uz * BOSS_WALK_SPEED * dt;
  // Clamp boss to arena radius too.
  const bx = bossH.root.position.x, bz = bossH.root.position.z;
  const bd = Math.hypot(bx, bz);
  if (bd > ARENA_R - 0.5) {
    const f = (ARENA_R - 0.5) / bd;
    bossH.root.position.x = bx * f;
    bossH.root.position.z = bz * f;
  }
  bossWalkPhase += dt * 5.5;
  return true;
}
function applyWalkOverlay(h: Humanoid, phase: number, amount: number) {
  const sinP = Math.sin(phase);
  // Leg swing (alternating).
  h.rHip.rotation.x += sinP * 0.55 * amount;
  h.lHip.rotation.x += -sinP * 0.55 * amount;
  // Knee bends as leg lifts forward.
  h.rKnee.rotation.x += Math.max(0, sinP) * 0.65 * amount;
  h.lKnee.rotation.x += Math.max(0, -sinP) * 0.65 * amount;
  // Left arm counter-swings (right arm holds sword).
  h.lShoulder.rotation.x += sinP * 0.30 * amount;
  // Subtle torso shift.
  h.spine.rotation.z += sinP * 0.025 * amount;
  // Body bob.
  h.root.position.y = Math.abs(sinP) * 0.04 * amount;
}

// ---------- Player state ----------
const player = { hp: 100, maxHp: 100 };
type GameState = 'playing' | 'won-level' | 'won-game' | 'lost';
let gameState: GameState = 'playing';

// ---------- Sword Trail ----------
const TRAIL_MAX = 14;
let trailPoints: Array<{ tip: THREE.Vector3; base: THREE.Vector3 }> = [];
const trailGeom = new THREE.BufferGeometry();
trailGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_MAX * 6 * 3), 3));
const trailMat = new THREE.MeshBasicMaterial({
  color: 0xff3a55, transparent: true, opacity: 0.85,
  side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
});
const trailMesh = new THREE.Mesh(trailGeom, trailMat);
trailMesh.frustumCulled = false;
trailMesh.visible = false;
scene.add(trailMesh);

// ---------- Sparks ----------
type Spark = { mesh: THREE.Mesh; vel: THREE.Vector3; life: number; maxLife: number };
const sparkPool: Spark[] = [];
const sparkGeom = new THREE.SphereGeometry(0.04, 6, 6);
function spawnSparks(pos: THREE.Vector3, count: number, color: number, speed = 4) {
  for (let i = 0; i < count; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 1,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const mesh = new THREE.Mesh(sparkGeom, mat);
    mesh.position.copy(pos);
    const theta = Math.random() * Math.PI * 2;
    const phi = (Math.random() - 0.5) * Math.PI;
    const v = speed * (0.6 + Math.random() * 0.6);
    mesh.scale.setScalar(0.6 + Math.random() * 0.8);
    scene.add(mesh);
    sparkPool.push({
      mesh,
      vel: new THREE.Vector3(
        Math.cos(theta) * Math.cos(phi) * v,
        Math.sin(phi) * v + 1.5,
        Math.sin(theta) * Math.cos(phi) * v
      ),
      life: 0, maxLife: 0.45 + Math.random() * 0.25,
    });
  }
}
function updateSparks(dt: number) {
  for (let i = sparkPool.length - 1; i >= 0; i--) {
    const s = sparkPool[i];
    s.life += dt;
    if (s.life >= s.maxLife) {
      scene.remove(s.mesh);
      (s.mesh.material as THREE.Material).dispose();
      sparkPool.splice(i, 1);
      continue;
    }
    s.vel.y -= 9 * dt;
    s.mesh.position.x += s.vel.x * dt;
    s.mesh.position.y += s.vel.y * dt;
    s.mesh.position.z += s.vel.z * dt;
    (s.mesh.material as THREE.MeshBasicMaterial).opacity = 1 - s.life / s.maxLife;
  }
}

// ---------- Atmosphere particles (snow / petals / embers / rain / bubbles / glowMotes / ash / puffs) ----------
type AtmoParticle = {
  mesh: THREE.Mesh; vel: THREE.Vector3;
  life: number; maxLife: number;
  rotVel?: THREE.Vector3;
  fadeOut?: boolean;
};
const atmoParticles: AtmoParticle[] = [];
function pushAtmo(mesh: THREE.Mesh, vel: THREE.Vector3, maxLife: number, rotVel?: THREE.Vector3, fadeOut = true) {
  scene.add(mesh);
  atmoParticles.push({ mesh, vel, life: 0, maxLife, rotVel, fadeOut });
}
function updateAtmoParticles(dt: number) {
  for (let i = atmoParticles.length - 1; i >= 0; i--) {
    const p = atmoParticles[i];
    p.life += dt;
    if (p.life >= p.maxLife) {
      scene.remove(p.mesh);
      p.mesh.geometry.dispose();
      (p.mesh.material as THREE.Material).dispose();
      atmoParticles.splice(i, 1);
      continue;
    }
    p.mesh.position.x += p.vel.x * dt;
    p.mesh.position.y += p.vel.y * dt;
    p.mesh.position.z += p.vel.z * dt;
    if (p.rotVel) {
      p.mesh.rotation.x += p.rotVel.x * dt;
      p.mesh.rotation.y += p.rotVel.y * dt;
      p.mesh.rotation.z += p.rotVel.z * dt;
    }
    if (p.fadeOut) {
      const m = p.mesh.material as any;
      if (m.opacity !== undefined) m.opacity = 1 - p.life / p.maxLife;
    }
  }
}
function clearAtmoParticles() {
  for (const p of atmoParticles) {
    scene.remove(p.mesh);
    p.mesh.geometry.dispose();
    (p.mesh.material as THREE.Material).dispose();
  }
  atmoParticles.length = 0;
}

const PLAYER_AREA = 35;
function spawnSnow() {
  const geom = new THREE.SphereGeometry(0.04 + Math.random() * 0.02, 5, 5);
  const mat = new THREE.MeshBasicMaterial({
    color: 0xeaf2fa, transparent: true, opacity: 0.9, fog: false,
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.position.set(
    (Math.random() - 0.5) * PLAYER_AREA * 2,
    20 + Math.random() * 12,
    (Math.random() - 0.5) * PLAYER_AREA * 2
  );
  pushAtmo(mesh, new THREE.Vector3(
    (Math.random() - 0.5) * 0.6, -2.2 - Math.random() * 0.8, (Math.random() - 0.5) * 0.6
  ), 8 + Math.random() * 3);
}
function spawnPetal() {
  const geom = new THREE.PlaneGeometry(0.10, 0.06);
  const mat = new THREE.MeshBasicMaterial({
    color: Math.random() < 0.5 ? 0xff90b8 : 0xffc8d8,
    transparent: true, opacity: 0.95, side: THREE.DoubleSide, fog: false,
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.position.set(
    (Math.random() - 0.5) * PLAYER_AREA * 2,
    18 + Math.random() * 12,
    (Math.random() - 0.5) * PLAYER_AREA * 2
  );
  pushAtmo(mesh, new THREE.Vector3(
    (Math.random() - 0.5) * 1.4, -1.4 - Math.random() * 0.6, (Math.random() - 0.5) * 1.4
  ), 9 + Math.random() * 3, new THREE.Vector3(
    (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4
  ));
}
function spawnEmber() {
  const geom = new THREE.SphereGeometry(0.05 + Math.random() * 0.04, 5, 5);
  const c = Math.random() < 0.5 ? 0xff8030 : 0xffc060;
  const mat = new THREE.MeshBasicMaterial({
    color: c, transparent: true, opacity: 1,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.position.set(
    (Math.random() - 0.5) * PLAYER_AREA,
    0.2 + Math.random() * 1.5,
    (Math.random() - 0.5) * PLAYER_AREA
  );
  pushAtmo(mesh, new THREE.Vector3(
    (Math.random() - 0.5) * 1.0, 1.8 + Math.random() * 1.5, (Math.random() - 0.5) * 1.0
  ), 3 + Math.random() * 2);
}
function spawnRain() {
  const geom = new THREE.BoxGeometry(0.012, 0.4, 0.012);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x90b0d0, transparent: true, opacity: 0.6, fog: false,
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.position.set(
    (Math.random() - 0.5) * PLAYER_AREA * 2,
    18 + Math.random() * 8,
    (Math.random() - 0.5) * PLAYER_AREA * 2
  );
  pushAtmo(mesh, new THREE.Vector3(0, -28, 0), 1 + Math.random() * 0.4);
}
function spawnBubble() {
  const r = 0.05 + Math.random() * 0.08;
  const geom = new THREE.SphereGeometry(r, 8, 8);
  const mat = new THREE.MeshBasicMaterial({
    color: 0xb0e8ff, transparent: true, opacity: 0.45,
    depthWrite: false, fog: false,
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.position.set(
    (Math.random() - 0.5) * PLAYER_AREA,
    0.1 + Math.random() * 1.5,
    (Math.random() - 0.5) * PLAYER_AREA
  );
  pushAtmo(mesh, new THREE.Vector3(
    (Math.random() - 0.5) * 0.4, 0.9 + Math.random() * 0.6, (Math.random() - 0.5) * 0.4
  ), 6 + Math.random() * 4);
}
function spawnGlowMote() {
  const geom = new THREE.SphereGeometry(0.06, 8, 8);
  const c = Math.random() < 0.5 ? 0xc060ff : 0x60d8ff;
  const mat = new THREE.MeshBasicMaterial({
    color: c, transparent: true, opacity: 1,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.position.set(
    (Math.random() - 0.5) * PLAYER_AREA,
    1 + Math.random() * 6,
    (Math.random() - 0.5) * PLAYER_AREA
  );
  pushAtmo(mesh, new THREE.Vector3(
    (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.3
  ), 8 + Math.random() * 4);
}
function spawnAsh() {
  const geom = new THREE.PlaneGeometry(0.08, 0.05);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x807878, transparent: true, opacity: 0.7, side: THREE.DoubleSide, fog: false,
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.position.set(
    (Math.random() - 0.5) * PLAYER_AREA * 2,
    18 + Math.random() * 10,
    (Math.random() - 0.5) * PLAYER_AREA * 2
  );
  pushAtmo(mesh, new THREE.Vector3(
    (Math.random() - 0.5) * 0.7, -1.0 - Math.random() * 0.4, (Math.random() - 0.5) * 0.7
  ), 9 + Math.random() * 3, new THREE.Vector3(
    (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2
  ));
}
function spawnLeaf() {
  const geom = new THREE.PlaneGeometry(0.12, 0.07);
  const greens = [0x60a040, 0x88b850, 0xa8a040, 0x70903a];
  const mat = new THREE.MeshBasicMaterial({
    color: greens[Math.floor(Math.random() * greens.length)],
    transparent: true, opacity: 0.95, side: THREE.DoubleSide, fog: false,
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.position.set(
    (Math.random() - 0.5) * PLAYER_AREA * 2,
    18 + Math.random() * 12,
    (Math.random() - 0.5) * PLAYER_AREA * 2
  );
  pushAtmo(mesh, new THREE.Vector3(
    (Math.random() - 0.5) * 1.6, -1.5 - Math.random() * 0.6, (Math.random() - 0.5) * 1.6
  ), 9 + Math.random() * 3, new THREE.Vector3(
    (Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5
  ));
}
function spawnFirefly() {
  const geom = new THREE.SphereGeometry(0.06, 8, 8);
  const mat = new THREE.MeshBasicMaterial({
    color: 0xfff080, transparent: true, opacity: 1,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.position.set(
    (Math.random() - 0.5) * PLAYER_AREA,
    0.6 + Math.random() * 4,
    (Math.random() - 0.5) * PLAYER_AREA
  );
  pushAtmo(mesh, new THREE.Vector3(
    (Math.random() - 0.5) * 0.4, (Math.random() - 0.3) * 0.6, (Math.random() - 0.5) * 0.4
  ), 7 + Math.random() * 5);
}

// ---------- Cyber atmosphere: stars + ships + rockets + meteors + puffs ----------
const cyberObjects: { mesh: THREE.Object3D; vel: THREE.Vector3; life: number; maxLife: number; trailEmit?: number; kind: 'ship' | 'rocket' | 'meteor' }[] = [];
let starsObj: THREE.Object3D | null = null;
function ensureStars() {
  if (starsObj) return;
  const COUNT = 600;
  const geom = new THREE.BufferGeometry();
  const pos = new Float32Array(COUNT * 3);
  const col = new Float32Array(COUNT * 3);
  for (let i = 0; i < COUNT; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(0.15 + Math.random() * 0.75);
    const r = 130;
    pos[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
    pos[i * 3 + 1] = r * Math.cos(phi);
    pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    const c = 0.6 + Math.random() * 0.4;
    col[i * 3]     = c;
    col[i * 3 + 1] = c;
    col[i * 3 + 2] = Math.min(1, c + Math.random() * 0.2);
  }
  geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geom.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({
    size: 0.7, vertexColors: true, transparent: true, opacity: 1,
    sizeAttenuation: true, blending: THREE.AdditiveBlending,
    depthWrite: false, fog: false,
  });
  starsObj = new THREE.Points(geom, mat);
  scene.add(starsObj);
}
function removeStars() {
  if (!starsObj) return;
  scene.remove(starsObj);
  (starsObj as THREE.Points).geometry.dispose();
  ((starsObj as THREE.Points).material as THREE.Material).dispose();
  starsObj = null;
}

const puffGeom = new THREE.SphereGeometry(0.3, 6, 6);
function spawnPuff(pos: THREE.Vector3, color: number, scale: number, maxLife: number) {
  const mat = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  });
  const mesh = new THREE.Mesh(puffGeom, mat);
  mesh.position.copy(pos);
  mesh.scale.setScalar(scale);
  pushAtmo(mesh, new THREE.Vector3(0, 0.2, 0), maxLife);
}

function spawnShip() {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x1c1c24, roughness: 0.4, metalness: 0.6, fog: false,
  });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.4, 0.8), bodyMat);
  g.add(body);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.8, 4), bodyMat);
  nose.position.set(1.7, 0, 0);
  nose.rotation.z = -Math.PI / 2;
  g.add(nose);
  const lightGeom = new THREE.SphereGeometry(0.12, 8, 8);
  const colors = [0x60c0ff, 0xff3040, 0xffd040];
  for (let i = -1; i <= 1; i++) {
    const c = colors[(i + 1) % colors.length];
    const lm = new THREE.MeshBasicMaterial({ color: c, fog: false });
    const light = new THREE.Mesh(lightGeom, lm);
    light.position.set(i * 0.9, -0.18, 0);
    g.add(light);
  }
  const fromLeft = Math.random() < 0.5;
  g.position.set(
    fromLeft ? -110 : 110,
    25 + Math.random() * 22,
    -35 - Math.random() * 45
  );
  g.rotation.y = fromLeft ? Math.PI / 2 : -Math.PI / 2;
  const speed = 7 + Math.random() * 5;
  scene.add(g);
  cyberObjects.push({
    mesh: g, vel: new THREE.Vector3(fromLeft ? speed : -speed, 0, 0),
    life: 0, maxLife: 999, kind: 'ship',
  });
}
function spawnRocket() {
  const x = (Math.random() - 0.5) * 80;
  const z = -55 - Math.random() * 30;
  const headMat = new THREE.MeshStandardMaterial({
    color: 0x100600, emissive: 0xff7020, emissiveIntensity: 4, fog: false,
  });
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 10), headMat);
  head.position.set(x, 0, z);
  scene.add(head);
  cyberObjects.push({
    mesh: head, vel: new THREE.Vector3(
      (Math.random() - 0.5) * 4, 26 + Math.random() * 14, -2 - Math.random() * 6
    ),
    life: 0, maxLife: 4.5, trailEmit: 0, kind: 'rocket',
  });
}
function spawnMeteor() {
  const fromLeft = Math.random() < 0.5;
  const startX = fromLeft ? -80 : 80;
  const startY = 55 + Math.random() * 20;
  const startZ = -45 - Math.random() * 30;
  const travelTime = 1.6 + Math.random() * 0.8;
  const endX = fromLeft ? 60 + Math.random() * 40 : -60 - Math.random() * 40;
  const endY = 8 + Math.random() * 8;
  const endZ = startZ - 20 + Math.random() * 10;
  const headMat = new THREE.MeshStandardMaterial({
    color: 0x100400, emissive: 0xffb840, emissiveIntensity: 5, fog: false,
  });
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 10), headMat);
  head.position.set(startX, startY, startZ);
  scene.add(head);
  cyberObjects.push({
    mesh: head, vel: new THREE.Vector3(
      (endX - startX) / travelTime, (endY - startY) / travelTime, (endZ - startZ) / travelTime
    ),
    life: 0, maxLife: travelTime, trailEmit: 0, kind: 'meteor',
  });
}
function clearCyberObjects() {
  for (const o of cyberObjects) {
    scene.remove(o.mesh);
    o.mesh.traverse(c => {
      if (c instanceof THREE.Mesh) {
        c.geometry.dispose();
        const m: any = c.material;
        if (m) {
          if (Array.isArray(m)) m.forEach((mm: any) => mm.dispose());
          else m.dispose();
        }
      }
    });
  }
  cyberObjects.length = 0;
}

// ---------- Celestial bodies (planets + moons orbiting the sky) ----------
type Celestial = {
  mesh: THREE.Mesh;
  orbitRadius: number;
  orbitSpeedX: number;     // speed around vertical axis
  orbitSpeedZ: number;     // depth oscillation speed (creates 3D arc)
  orbitPhase: number;
  orbitTilt: number;       // vertical wobble amplitude
  centerY: number;
  centerZ: number;
  selfRotSpeed: number;
  ring?: THREE.Mesh;
};
const celestials: Celestial[] = [];
function spawnPlanet(opts: {
  size: number; color: number; emissive?: number;
  ring?: { color: number; inner: number; outer: number };
  orbitRadius: number; orbitSpeed: number;
  orbitPhase?: number; orbitTilt?: number;
  centerY: number; centerZ?: number;
}) {
  const mat = new THREE.MeshStandardMaterial({
    color: opts.color, roughness: 0.85,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissive ? 0.4 : 0,
    fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(opts.size, 32, 32), mat);
  mesh.frustumCulled = false;
  scene.add(mesh);
  let ring: THREE.Mesh | undefined;
  if (opts.ring) {
    const ringMat = new THREE.MeshBasicMaterial({
      color: opts.ring.color, side: THREE.DoubleSide,
      transparent: true, opacity: 0.7, fog: false,
    });
    ring = new THREE.Mesh(
      new THREE.RingGeometry(opts.ring.inner, opts.ring.outer, 64), ringMat
    );
    ring.rotation.x = -Math.PI / 2.4;
    ring.rotation.z = 0.2;
    mesh.add(ring);
  }
  celestials.push({
    mesh,
    orbitRadius: opts.orbitRadius,
    orbitSpeedX: opts.orbitSpeed,
    orbitSpeedZ: opts.orbitSpeed * 0.7,
    orbitPhase: opts.orbitPhase ?? Math.random() * Math.PI * 2,
    orbitTilt: opts.orbitTilt ?? 4,
    centerY: opts.centerY,
    centerZ: opts.centerZ ?? -30,
    selfRotSpeed: 0.05 + Math.random() * 0.15,
    ring,
  });
}
function updateCelestials(dt: number, t: number) {
  for (const c of celestials) {
    const angle = c.orbitPhase + t * c.orbitSpeedX;
    c.mesh.position.x = Math.cos(angle) * c.orbitRadius;
    c.mesh.position.y = c.centerY + Math.sin(angle * 1.3) * c.orbitTilt;
    c.mesh.position.z = c.centerZ + Math.sin(angle * c.orbitSpeedZ / c.orbitSpeedX) * c.orbitRadius * 0.35;
    c.mesh.rotation.y += c.selfRotSpeed * dt;
  }
}
function clearCelestials() {
  for (const c of celestials) {
    scene.remove(c.mesh);
    c.mesh.geometry.dispose();
    (c.mesh.material as THREE.Material).dispose();
    if (c.ring) {
      c.ring.geometry.dispose();
      (c.ring.material as THREE.Material).dispose();
    }
  }
  celestials.length = 0;
}

// ---------- Atmosphere spawn timing per current level ----------
type AtmoType = 'cyber' | 'snow' | 'petals' | 'embers' | 'rain' | 'bubbles' | 'glowMotes' | 'ash' | 'celestials' | 'leaves' | 'fireflies';
let nextShipAt = 3, nextRocketAt = 6, nextMeteorAt = 4;
let snowAcc = 0, petalAcc = 0, emberAcc = 0, rainAcc = 0, bubbleAcc = 0, glowAcc = 0, ashAcc = 0;
let leafAcc = 0, fireflyAcc = 0;
function updateAtmosphereForLevel(dt: number, t: number, atmos: AtmoType[]) {
  // Cyber objects (ships/rockets/meteors)
  if (atmos.includes('cyber')) {
    if (t > nextShipAt) { spawnShip(); nextShipAt = t + 6 + Math.random() * 10; }
    if (t > nextRocketAt) { spawnRocket(); nextRocketAt = t + 9 + Math.random() * 10; }
    if (t > nextMeteorAt) { spawnMeteor(); nextMeteorAt = t + 4 + Math.random() * 6; }
  }
  // Update + cull cyber objects
  for (let i = cyberObjects.length - 1; i >= 0; i--) {
    const o = cyberObjects[i];
    o.life += dt;
    o.mesh.position.x += o.vel.x * dt;
    o.mesh.position.y += o.vel.y * dt;
    o.mesh.position.z += o.vel.z * dt;
    if (o.kind === 'rocket') {
      o.trailEmit = (o.trailEmit ?? 0) + dt;
      if (o.trailEmit > 0.04) { o.trailEmit = 0; spawnPuff(o.mesh.position, 0xff7020, 0.6, 1.2); }
      if (o.life > o.maxLife) {
        for (let k = 0; k < 6; k++) spawnPuff(o.mesh.position, 0xff9040, 1.3, 1.5);
        scene.remove(o.mesh); ((o.mesh as THREE.Mesh).material as THREE.Material).dispose();
        cyberObjects.splice(i, 1); continue;
      }
    } else if (o.kind === 'meteor') {
      o.trailEmit = (o.trailEmit ?? 0) + dt;
      if (o.trailEmit > 0.025) { o.trailEmit = 0; spawnPuff(o.mesh.position, 0xffb840, 0.4, 1.0); }
      if (o.life > o.maxLife) {
        scene.remove(o.mesh); ((o.mesh as THREE.Mesh).material as THREE.Material).dispose();
        cyberObjects.splice(i, 1); continue;
      }
    } else if (o.kind === 'ship') {
      if (Math.abs(o.mesh.position.x) > 130) {
        scene.remove(o.mesh);
        o.mesh.traverse(c => {
          if (c instanceof THREE.Mesh) { c.geometry.dispose(); (c.material as THREE.Material).dispose(); }
        });
        cyberObjects.splice(i, 1); continue;
      }
    }
  }

  // Particle types — spawn at fixed rates while active.
  const tick = (acc: number, rate: number, spawn: () => void): number => {
    acc += dt;
    while (acc >= 1 / rate) { spawn(); acc -= 1 / rate; }
    return acc;
  };
  if (atmos.includes('snow')) snowAcc = tick(snowAcc, 35, spawnSnow);
  if (atmos.includes('petals')) petalAcc = tick(petalAcc, 18, spawnPetal);
  if (atmos.includes('embers')) emberAcc = tick(emberAcc, 30, spawnEmber);
  if (atmos.includes('rain')) rainAcc = tick(rainAcc, 90, spawnRain);
  if (atmos.includes('bubbles')) bubbleAcc = tick(bubbleAcc, 9, spawnBubble);
  if (atmos.includes('glowMotes')) glowAcc = tick(glowAcc, 6, spawnGlowMote);
  if (atmos.includes('ash')) ashAcc = tick(ashAcc, 22, spawnAsh);
  if (atmos.includes('leaves')) leafAcc = tick(leafAcc, 14, spawnLeaf);
  if (atmos.includes('fireflies')) fireflyAcc = tick(fireflyAcc, 8, spawnFirefly);
}

// ---------- Controls & Input ----------
const controls = new PointerLockControls(camera, renderer.domElement);
const promptEl = document.getElementById('prompt')!;
promptEl.addEventListener('click', () => {
  music.init();
  if (touchMode) {
    promptEl.classList.add('hidden');
    if (gameState !== 'playing') {
      gameState = 'playing';
      resultEl.classList.add('hidden');
    }
  } else {
    controls.lock();
  }
});
controls.addEventListener('lock', () => promptEl.classList.add('hidden'));
controls.addEventListener('unlock', () => promptEl.classList.remove('hidden'));
addEventListener('contextmenu', (e) => e.preventDefault());

const keys: Record<string, boolean> = {};
addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (gameState === 'lost' && e.code === 'KeyR') retryLevel();
  else if (gameState === 'won-level' && e.code === 'Space') advanceLevel();
  else if (gameState === 'won-game' && e.code === 'KeyR') startNewRun();
  if (e.code === 'KeyM') {
    const muted = music.toggleMute();
    syncSoundUI(muted);
  }
});
addEventListener('keyup', (e) => { keys[e.code] = false; });

let swingTime = -1;
const SWING_DUR = 0.38;
let swingDidHit = false;
let blocking = false;
let parryReadyUntil = 0;
let hitstopUntil = 0;
let damageVignetteUntil = 0;

addEventListener('mousedown', (e) => {
  if (!controls.isLocked || gameState !== 'playing') return;
  if (e.button === 0) {
    if (swingTime < 0) { swingTime = 0; swingDidHit = false; }
  } else if (e.button === 2) {
    blocking = true;
    parryReadyUntil = nowSec() + LEVELS[currentLevel].bossParryWindow;
  }
});
addEventListener('mouseup', (e) => {
  if (e.button === 2) blocking = false;
});

// ---------- Post-processing ----------
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight), 0.4, 0.5, 0.88
);
composer.addPass(bloom);
composer.addPass(new OutputPass());

addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

// ============================================================
// ---------- Levels ----------
// ============================================================
type LevelConfig = {
  name: string;
  // Sky
  skyColor: number;
  fogColor: number; fogNear: number; fogFar: number;
  // Ground
  groundColor: number;
  groundGrid: { line: number; emissive: number; lineW: number } | null;
  noGround?: boolean;          // true = void / no ground plane
  // Pillars
  pillarColor: number;
  pillarSeam: { color: number; emissive: number; intensity: number } | null;
  pillarShape: 'box' | 'cone' | 'crystal';
  // Platform
  platformColor: number;
  platformRing: number | null;
  // Lights
  sunColor: number; sunIntensity: number;
  rim: { color: number; intensity: number } | null;
  hemi: { sky: number; ground: number; intensity: number };
  // Atmosphere
  atmosphere: AtmoType[];
  showStars: boolean;
  showSkyline: boolean;
  // Boss
  bossSashColor: number;
  bossHp: number;
  bossDmg: number;
  bossWindup: number;
  bossAttackEvery: [number, number];
  bossParryWindow: number;
  // Optional themed creatures placed around the arena perimeter (scenery, outside the wall).
  creatures?: { kind: CreatureKind; count: number }[];
  trees?: { kind: TreeKind; count: number };
};

type StageConfig = { name: string; levels: LevelConfig[] };

const STAGES: StageConfig[] = [{
  name: 'Epic Cosmos',
  levels: [
  // 1. Training Dojo — peaceful daylight
  {
    name: 'Training Dojo',
    skyColor: 0xb5cad0, fogColor: 0xb5cad0, fogNear: 35, fogFar: 110,
    groundColor: 0xe6dcc6, groundGrid: null,
    pillarColor: 0xf2ebd9, pillarSeam: null, pillarShape: 'box',
    platformColor: 0xf2ebd9, platformRing: null,
    sunColor: 0xfff1d6, sunIntensity: 3.0,
    rim: { color: 0x88c0e0, intensity: 0.6 },
    hemi: { sky: 0xb5d0d8, ground: 0x7a6a52, intensity: 0.55 },
    atmosphere: ['celestials'], showStars: false, showSkyline: false,
    bossSashColor: 0xa82038,
    bossHp: 75, bossDmg: 22, bossWindup: 0.85, bossAttackEvery: [2.0, 2.7], bossParryWindow: 0.30,
  },
  // 2. Cherry Grove
  {
    name: 'Cherry Grove',
    skyColor: 0xf0c0d0, fogColor: 0xf0c0d0, fogNear: 28, fogFar: 95,
    groundColor: 0x6a8a4a, groundGrid: null,
    pillarColor: 0xc8a890, pillarSeam: null, pillarShape: 'box',
    platformColor: 0xc8a890, platformRing: null,
    sunColor: 0xffd6c0, sunIntensity: 2.6,
    rim: { color: 0xff8090, intensity: 0.6 },
    hemi: { sky: 0xf5d0e0, ground: 0x4a6238, intensity: 0.65 },
    atmosphere: ['petals', 'celestials'], showStars: false, showSkyline: false,
    bossSashColor: 0xc8205c,
    bossHp: 85, bossDmg: 24, bossWindup: 0.80, bossAttackEvery: [1.9, 2.5], bossParryWindow: 0.28,
  },
  // 3. Frozen Temple
  {
    name: 'Frozen Temple',
    skyColor: 0x9ab8d8, fogColor: 0xc0d8e8, fogNear: 22, fogFar: 85,
    groundColor: 0xc8d8e8, groundGrid: null,
    pillarColor: 0xd8e8f0, pillarSeam: { color: 0x081830, emissive: 0x60c0ff, intensity: 1.6 }, pillarShape: 'cone',
    platformColor: 0xb8c8d8, platformRing: 0x60c0ff,
    sunColor: 0xc0d0ff, sunIntensity: 2.4,
    rim: { color: 0x60a0ff, intensity: 0.7 },
    hemi: { sky: 0xc0d8e8, ground: 0x506678, intensity: 0.6 },
    atmosphere: ['snow', 'celestials'], showStars: false, showSkyline: false,
    bossSashColor: 0x4080c0,
    bossHp: 95, bossDmg: 26, bossWindup: 0.75, bossAttackEvery: [1.8, 2.3], bossParryWindow: 0.26,
  },
  // 4. Volcano Rim
  {
    name: 'Volcano Rim',
    skyColor: 0x2a0808, fogColor: 0x3a1010, fogNear: 20, fogFar: 75,
    groundColor: 0x281008, groundGrid: { line: 0xff4010, emissive: 0xff4010, lineW: 4 },
    pillarColor: 0x181010, pillarSeam: { color: 0x100404, emissive: 0xff5020, intensity: 2.0 }, pillarShape: 'box',
    platformColor: 0x281008, platformRing: 0xff5020,
    sunColor: 0xffa860, sunIntensity: 1.8,
    rim: { color: 0xff3010, intensity: 1.0 },
    hemi: { sky: 0x402010, ground: 0x602010, intensity: 0.5 },
    atmosphere: ['embers'], showStars: false, showSkyline: false,
    bossSashColor: 0xff5020,
    bossHp: 105, bossDmg: 28, bossWindup: 0.70, bossAttackEvery: [1.7, 2.2], bossParryWindow: 0.24,
  },
  // 5. Storm Peak
  {
    name: 'Storm Peak',
    skyColor: 0x383848, fogColor: 0x484858, fogNear: 16, fogFar: 65,
    groundColor: 0x2a2a32, groundGrid: null,
    pillarColor: 0x383848, pillarSeam: { color: 0x100818, emissive: 0x6080d0, intensity: 1.4 }, pillarShape: 'box',
    platformColor: 0x2a2a32, platformRing: 0x6080d0,
    sunColor: 0x8090a0, sunIntensity: 1.2,
    rim: { color: 0x6080d0, intensity: 0.9 },
    hemi: { sky: 0x4a5060, ground: 0x202028, intensity: 0.6 },
    atmosphere: ['rain'], showStars: false, showSkyline: false,
    bossSashColor: 0x6080d0,
    bossHp: 120, bossDmg: 30, bossWindup: 0.65, bossAttackEvery: [1.6, 2.0], bossParryWindow: 0.22,
  },
  // 6. Sunken Shrine
  {
    name: 'Sunken Shrine',
    skyColor: 0x102838, fogColor: 0x183848, fogNear: 12, fogFar: 50,
    groundColor: 0x1a3848, groundGrid: null,
    pillarColor: 0x204858, pillarSeam: { color: 0x002030, emissive: 0x40d0c0, intensity: 1.8 }, pillarShape: 'box',
    platformColor: 0x1a3848, platformRing: 0x40d0c0,
    sunColor: 0x80c0d0, sunIntensity: 2.0,
    rim: { color: 0x40d0c0, intensity: 0.8 },
    hemi: { sky: 0x2a5868, ground: 0x10303a, intensity: 0.7 },
    atmosphere: ['bubbles'], showStars: false, showSkyline: false,
    bossSashColor: 0x40d0a0,
    bossHp: 135, bossDmg: 33, bossWindup: 0.60, bossAttackEvery: [1.5, 1.9], bossParryWindow: 0.21,
  },
  // 7. Cyber Arena
  {
    name: 'Cyber Arena',
    skyColor: 0x0a0d18, fogColor: 0x141826, fogNear: 18, fogFar: 80,
    groundColor: 0x16181f, groundGrid: { line: 0xff2030, emissive: 0xff1525, lineW: 3 },
    pillarColor: 0x1a1d28, pillarSeam: { color: 0x140004, emissive: 0xff1830, intensity: 2.4 }, pillarShape: 'box',
    platformColor: 0x1a1d28, platformRing: 0xff2030,
    sunColor: 0xb0c8e0, sunIntensity: 1.4,
    rim: { color: 0xff2840, intensity: 1.1 },
    hemi: { sky: 0x4a5060, ground: 0x2a0810, intensity: 0.5 },
    atmosphere: ['cyber'], showStars: true, showSkyline: true,
    bossSashColor: 0xff2030,
    bossHp: 150, bossDmg: 36, bossWindup: 0.55, bossAttackEvery: [1.4, 1.8], bossParryWindow: 0.20,
  },
  // 8. Crystal Cave
  {
    name: 'Crystal Cave',
    skyColor: 0x080418, fogColor: 0x100828, fogNear: 14, fogFar: 60,
    groundColor: 0x180828, groundGrid: null,
    pillarColor: 0x281850, pillarSeam: { color: 0x180838, emissive: 0xc040ff, intensity: 2.2 }, pillarShape: 'crystal',
    platformColor: 0x180828, platformRing: 0xc040ff,
    sunColor: 0x8060c0, sunIntensity: 1.5,
    rim: { color: 0xc040ff, intensity: 0.8 },
    hemi: { sky: 0x301848, ground: 0x100418, intensity: 0.5 },
    atmosphere: ['glowMotes'], showStars: false, showSkyline: false,
    bossSashColor: 0xc040ff,
    bossHp: 165, bossDmg: 40, bossWindup: 0.50, bossAttackEvery: [1.3, 1.7], bossParryWindow: 0.18,
  },
  // 9. Hellgate
  {
    name: 'Hellgate',
    skyColor: 0x180404, fogColor: 0x300808, fogNear: 12, fogFar: 50,
    groundColor: 0x100404, groundGrid: { line: 0xff2010, emissive: 0xff3010, lineW: 5 },
    pillarColor: 0x100404, pillarSeam: { color: 0x080000, emissive: 0xff2010, intensity: 2.4 }, pillarShape: 'box',
    platformColor: 0x100404, platformRing: 0xff3010,
    sunColor: 0xff5020, sunIntensity: 1.2,
    rim: { color: 0xff1010, intensity: 1.4 },
    hemi: { sky: 0x301010, ground: 0x501010, intensity: 0.6 },
    atmosphere: ['embers', 'ash'], showStars: false, showSkyline: false,
    bossSashColor: 0xff3010,
    bossHp: 190, bossDmg: 44, bossWindup: 0.45, bossAttackEvery: [1.2, 1.6], bossParryWindow: 0.17,
  },
  // 10. The Void
  {
    name: 'The Void',
    skyColor: 0x000003, fogColor: 0x000008, fogNear: 30, fogFar: 100,
    groundColor: 0x000004, groundGrid: null, noGround: true,
    pillarColor: 0x080812, pillarSeam: { color: 0x080010, emissive: 0xffffff, intensity: 2.4 }, pillarShape: 'crystal',
    platformColor: 0x080812, platformRing: 0xffffff,
    sunColor: 0xa0a0c0, sunIntensity: 0.6,
    rim: { color: 0xffffff, intensity: 0.6 },
    hemi: { sky: 0x100020, ground: 0x000004, intensity: 0.3 },
    atmosphere: ['cyber'], showStars: true, showSkyline: false,
    bossSashColor: 0xffffff,
    bossHp: 220, bossDmg: 50, bossWindup: 0.40, bossAttackEvery: [1.1, 1.5], bossParryWindow: 0.15,
  },
  ],
}, {
  name: 'Legendary Wilderness',
  levels: [
    // 1. Bamboo Grove — peaceful, leaves drifting
    {
      name: 'Bamboo Grove',
      skyColor: 0xc8e0c0, fogColor: 0xc8e0c0, fogNear: 30, fogFar: 100,
      groundColor: 0x4a6a3a, groundGrid: null,
      pillarColor: 0x88c060, pillarSeam: null, pillarShape: 'cone',
      platformColor: 0x6a4a30, platformRing: null,
      sunColor: 0xfff5d0, sunIntensity: 2.6,
      rim: { color: 0x88c060, intensity: 0.6 },
      hemi: { sky: 0xc8e0c0, ground: 0x3a5028, intensity: 0.65 },
      atmosphere: ['leaves'], showStars: false, showSkyline: false,
      bossSashColor: 0x60c040,
      bossHp: 230, bossDmg: 48, bossWindup: 0.42, bossAttackEvery: [1.1, 1.5], bossParryWindow: 0.15,
      creatures: [{ kind: 'panda', count: 4 }],
      trees: { kind: 'pine', count: 14 },
    },
    // 2. Savanna Plains — golden, dusty embers
    {
      name: 'Savanna Plains',
      skyColor: 0xf0c878, fogColor: 0xd8b888, fogNear: 28, fogFar: 95,
      groundColor: 0xc8a050, groundGrid: null,
      pillarColor: 0x8a6038, pillarSeam: null, pillarShape: 'box',
      platformColor: 0xa8854a, platformRing: null,
      sunColor: 0xffe0a0, sunIntensity: 3.0,
      rim: { color: 0xff8040, intensity: 0.7 },
      hemi: { sky: 0xf0c878, ground: 0x6a4828, intensity: 0.7 },
      atmosphere: ['embers'], showStars: false, showSkyline: false,
      bossSashColor: 0xf0a040,
      bossHp: 250, bossDmg: 50, bossWindup: 0.40, bossAttackEvery: [1.1, 1.5], bossParryWindow: 0.145,
      creatures: [{ kind: 'lion', count: 3 }],
      trees: { kind: 'broadleaf', count: 6 },
    },
    // 3. Misty Rainforest — dense fog, fireflies
    {
      name: 'Misty Rainforest',
      skyColor: 0x4a6a5a, fogColor: 0x607060, fogNear: 14, fogFar: 55,
      groundColor: 0x2a3a28, groundGrid: null,
      pillarColor: 0x3a4a30, pillarSeam: { color: 0x102014, emissive: 0x60a040, intensity: 1.6 }, pillarShape: 'box',
      platformColor: 0x2a2018, platformRing: 0x60a040,
      sunColor: 0xc0d0a0, sunIntensity: 1.8,
      rim: { color: 0x60a040, intensity: 0.8 },
      hemi: { sky: 0x4a6a5a, ground: 0x1a2818, intensity: 0.6 },
      atmosphere: ['fireflies', 'leaves'], showStars: false, showSkyline: false,
      bossSashColor: 0x60c060,
      bossHp: 270, bossDmg: 52, bossWindup: 0.38, bossAttackEvery: [1.0, 1.4], bossParryWindow: 0.14,
      creatures: [{ kind: 'monkey', count: 5 }],
      trees: { kind: 'broadleaf', count: 16 },
    },
    // 4. Tigers Den — orange jungle, embers
    {
      name: "Tiger's Den",
      skyColor: 0x8a5028, fogColor: 0x8a5028, fogNear: 18, fogFar: 70,
      groundColor: 0x6a3818, groundGrid: { line: 0x3a1808, emissive: 0x602008, lineW: 6 },
      pillarColor: 0x8a4818, pillarSeam: { color: 0x301008, emissive: 0xff5020, intensity: 1.6 }, pillarShape: 'box',
      platformColor: 0x4a2818, platformRing: 0xff5020,
      sunColor: 0xffa860, sunIntensity: 2.0,
      rim: { color: 0xff5020, intensity: 0.9 },
      hemi: { sky: 0x6a3010, ground: 0x301008, intensity: 0.55 },
      atmosphere: ['embers'], showStars: false, showSkyline: false,
      bossSashColor: 0xff7030,
      bossHp: 290, bossDmg: 55, bossWindup: 0.36, bossAttackEvery: [1.0, 1.4], bossParryWindow: 0.135,
      creatures: [{ kind: 'tiger', count: 4 }],
      trees: { kind: 'broadleaf', count: 14 },
    },
    // 5. Elephant Graveyard — bone pillars, ash + spirit motes
    {
      name: 'Elephant Graveyard',
      skyColor: 0x6a4060, fogColor: 0x806068, fogNear: 18, fogFar: 70,
      groundColor: 0xa89890, groundGrid: null,
      pillarColor: 0xe8d8c0, pillarSeam: null, pillarShape: 'cone',
      platformColor: 0x8a7060, platformRing: null,
      sunColor: 0xc8a0c0, sunIntensity: 1.6,
      rim: { color: 0xc880c8, intensity: 0.7 },
      hemi: { sky: 0x6a4060, ground: 0x4a3848, intensity: 0.5 },
      atmosphere: ['ash', 'glowMotes'], showStars: false, showSkyline: false,
      bossSashColor: 0xe0c8d8,
      bossHp: 310, bossDmg: 58, bossWindup: 0.34, bossAttackEvery: [0.95, 1.35], bossParryWindow: 0.13,
      creatures: [{ kind: 'elephant', count: 3 }],
      trees: { kind: 'dead', count: 12 },
    },
    // 6. Crocodile Swamp — murky green, bubbles
    {
      name: 'Crocodile Swamp',
      skyColor: 0x4a5828, fogColor: 0x3a4828, fogNear: 12, fogFar: 50,
      groundColor: 0x2a3818, groundGrid: null,
      pillarColor: 0x4a5838, pillarSeam: { color: 0x102810, emissive: 0x80a040, intensity: 1.4 }, pillarShape: 'box',
      platformColor: 0x2a3018, platformRing: 0x80a040,
      sunColor: 0xa0b078, sunIntensity: 1.6,
      rim: { color: 0x80a040, intensity: 0.7 },
      hemi: { sky: 0x4a5828, ground: 0x2a3818, intensity: 0.6 },
      atmosphere: ['bubbles', 'fireflies'], showStars: false, showSkyline: false,
      bossSashColor: 0x80c040,
      bossHp: 335, bossDmg: 60, bossWindup: 0.32, bossAttackEvery: [0.9, 1.3], bossParryWindow: 0.125,
      creatures: [{ kind: 'crocodile', count: 5 }],
      trees: { kind: 'palm', count: 12 },
    },
    // 7. Serpent Temple — ancient stone, snake-eye glow
    {
      name: 'Serpent Temple',
      skyColor: 0x183a4a, fogColor: 0x204858, fogNear: 16, fogFar: 65,
      groundColor: 0x484038, groundGrid: null,
      pillarColor: 0x383028, pillarSeam: { color: 0x182810, emissive: 0x40ff80, intensity: 2.2 }, pillarShape: 'box',
      platformColor: 0x383028, platformRing: 0x40ff80,
      sunColor: 0x80c0a0, sunIntensity: 1.5,
      rim: { color: 0x40ff80, intensity: 0.9 },
      hemi: { sky: 0x183a4a, ground: 0x202018, intensity: 0.55 },
      atmosphere: ['glowMotes', 'fireflies'], showStars: false, showSkyline: false,
      bossSashColor: 0x40ff60,
      bossHp: 360, bossDmg: 62, bossWindup: 0.30, bossAttackEvery: [0.9, 1.3], bossParryWindow: 0.12,
      creatures: [{ kind: 'serpent', count: 4 }],
      trees: { kind: 'broadleaf', count: 12 },
    },
    // 8. Wolf Forest — moonlit pines, snow + mist
    {
      name: 'Wolf Forest',
      skyColor: 0x1a2848, fogColor: 0x2a3858, fogNear: 14, fogFar: 60,
      groundColor: 0x1a2818, groundGrid: null,
      pillarColor: 0x202830, pillarSeam: { color: 0x081020, emissive: 0x80c0ff, intensity: 1.8 }, pillarShape: 'cone',
      platformColor: 0x202838, platformRing: 0x80c0ff,
      sunColor: 0xc0d0ff, sunIntensity: 1.2,
      rim: { color: 0x80c0ff, intensity: 1.0 },
      hemi: { sky: 0x1a2848, ground: 0x101820, intensity: 0.5 },
      atmosphere: ['snow'], showStars: true, showSkyline: false,
      bossSashColor: 0x80c0ff,
      bossHp: 385, bossDmg: 65, bossWindup: 0.28, bossAttackEvery: [0.85, 1.25], bossParryWindow: 0.115,
      creatures: [{ kind: 'wolf', count: 5 }],
      trees: { kind: 'pine', count: 16 },
    },
    // 9. Phoenix Volcano — fierce fire, embers + ash
    {
      name: 'Phoenix Volcano',
      skyColor: 0x4a1808, fogColor: 0x6a2010, fogNear: 12, fogFar: 50,
      groundColor: 0x281008, groundGrid: { line: 0xff5020, emissive: 0xff5020, lineW: 5 },
      pillarColor: 0x180808, pillarSeam: { color: 0x180400, emissive: 0xff8030, intensity: 2.6 }, pillarShape: 'box',
      platformColor: 0x381810, platformRing: 0xff8030,
      sunColor: 0xff6030, sunIntensity: 1.4,
      rim: { color: 0xff4020, intensity: 1.4 },
      hemi: { sky: 0x4a1808, ground: 0x6a2010, intensity: 0.6 },
      atmosphere: ['embers', 'ash'], showStars: false, showSkyline: false,
      bossSashColor: 0xff8030,
      bossHp: 415, bossDmg: 68, bossWindup: 0.26, bossAttackEvery: [0.85, 1.25], bossParryWindow: 0.11,
      creatures: [{ kind: 'phoenix', count: 2 }],
      trees: { kind: 'dead', count: 10 },
    },
    // 10. Dragon Peak — final, mountain summit, lightning
    {
      name: 'Dragon Peak',
      skyColor: 0x383040, fogColor: 0x484058, fogNear: 14, fogFar: 55,
      groundColor: 0x2a2028, groundGrid: { line: 0xc0d0ff, emissive: 0x6080ff, lineW: 4 },
      pillarColor: 0x382838, pillarSeam: { color: 0x180828, emissive: 0xc0a0ff, intensity: 2.8 }, pillarShape: 'crystal',
      platformColor: 0x282028, platformRing: 0xc0a0ff,
      sunColor: 0xc0c0ff, sunIntensity: 1.4,
      rim: { color: 0x8060ff, intensity: 1.3 },
      hemi: { sky: 0x383040, ground: 0x201828, intensity: 0.55 },
      atmosphere: ['snow', 'glowMotes'], showStars: true, showSkyline: false,
      bossSashColor: 0xc0a0ff,
      bossHp: 450, bossDmg: 72, bossWindup: 0.24, bossAttackEvery: [0.8, 1.2], bossParryWindow: 0.10,
      creatures: [{ kind: 'dragon', count: 1 }],
      trees: { kind: 'pine', count: 8 },
    },
  ],
}];

// Flat list of all levels across all stages. Existing currentLevel is the global index here.
const LEVELS: LevelConfig[] = STAGES.flatMap((s) => s.levels);

// Helper: which stage does a global level index belong to?
function stageOfLevel(idx: number): { stage: StageConfig; localIdx: number; stageIdx: number } {
  let consumed = 0;
  for (let s = 0; s < STAGES.length; s++) {
    const stage = STAGES[s];
    if (idx < consumed + stage.levels.length) {
      return { stage, localIdx: idx - consumed, stageIdx: s };
    }
    consumed += stage.levels.length;
  }
  // Fallback: last stage, last level.
  const lastStage = STAGES[STAGES.length - 1];
  return { stage: lastStage, localIdx: lastStage.levels.length - 1, stageIdx: STAGES.length - 1 };
}

// Persisted current level (1-indexed visually, 0-indexed here).
let currentLevel = (() => {
  try {
    const v = localStorage.getItem('sword:currentLevel');
    if (v) {
      const n = parseInt(v, 10);
      if (!isNaN(n) && n >= 0 && n < LEVELS.length) return n;
    }
  } catch {}
  return 0;
})();
function saveLevel() {
  try { localStorage.setItem('sword:currentLevel', String(currentLevel)); } catch {}
}

// Arena meshes (cleared between levels).
let arenaMeshes: THREE.Object3D[] = [];

// ============================================================
// ---------- Procedural creatures (wilderness scenery) ----------
// ============================================================
type CreatureKind =
  | 'tiger' | 'elephant' | 'crocodile' | 'serpent' | 'wolf'
  | 'phoenix' | 'dragon' | 'panda' | 'lion' | 'monkey';

function mat(color: number, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...opts });
}
function box(parent: THREE.Group, w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) {
  const me = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  me.position.set(x, y, z);
  me.castShadow = true;
  parent.add(me);
  return me;
}
function cyl(parent: THREE.Group, rt: number, rb: number, h: number, m: THREE.Material, x = 0, y = 0, z = 0) {
  const me = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 10), m);
  me.position.set(x, y, z);
  me.castShadow = true;
  parent.add(me);
  return me;
}
function sph(parent: THREE.Group, r: number, m: THREE.Material, x = 0, y = 0, z = 0) {
  const me = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 12), m);
  me.position.set(x, y, z);
  me.castShadow = true;
  parent.add(me);
  return me;
}
function cone(parent: THREE.Group, r: number, h: number, m: THREE.Material, x = 0, y = 0, z = 0, segs = 8) {
  const me = new THREE.Mesh(new THREE.ConeGeometry(r, h, segs), m);
  me.position.set(x, y, z);
  me.castShadow = true;
  parent.add(me);
  return me;
}

function buildCreature(kind: CreatureKind): THREE.Group {
  const g = new THREE.Group();
  switch (kind) {
    case 'tiger': {
      const body = mat(0xc87028);
      const dark = mat(0x180a04);
      const white = mat(0xefe5d0);
      box(g, 1.6, 0.55, 0.65, body, 0, 0.65, 0);          // body
      // dark stripes (vertical)
      for (let i = 0; i < 6; i++) {
        box(g, 0.06, 0.56, 0.66, dark, -0.7 + i * 0.28, 0.65, 0);
      }
      const head = box(g, 0.55, 0.5, 0.55, body, 0.95, 0.78, 0);
      cone(g, 0.10, 0.18, body, 0.95, 1.08, -0.18, 4);    // ears
      cone(g, 0.10, 0.18, body, 0.95, 1.08, 0.18, 4);
      sph(g, 0.04, dark, 1.20, 0.85, -0.13);              // eyes
      sph(g, 0.04, dark, 1.20, 0.85, 0.13);
      sph(g, 0.06, white, 1.25, 0.70, 0);                 // muzzle
      void head;
      // legs
      for (const [x, z] of [[-0.55, -0.22], [-0.55, 0.22], [0.55, -0.22], [0.55, 0.22]]) {
        box(g, 0.16, 0.45, 0.16, body, x, 0.22, z);
      }
      // tail (curved up)
      const t1 = cyl(g, 0.07, 0.07, 0.5, body, -0.95, 0.75, 0);
      t1.rotation.z = Math.PI / 3;
      break;
    }
    case 'elephant': {
      // Skeletal — bone white, big tusks
      const bone = mat(0xe8dcc8);
      // Skull-like body
      box(g, 1.8, 0.9, 0.9, bone, 0, 0.95, 0);
      box(g, 0.7, 0.8, 0.8, bone, 1.05, 0.95, 0);          // head
      // Tusks
      const tuskL = cone(g, 0.06, 0.7, bone, 1.45, 0.85, -0.25, 8);
      tuskL.rotation.z = -Math.PI / 2.2;
      const tuskR = cone(g, 0.06, 0.7, bone, 1.45, 0.85, 0.25, 8);
      tuskR.rotation.z = -Math.PI / 2.2;
      // Trunk
      const trunk = cyl(g, 0.10, 0.18, 0.6, bone, 1.5, 0.65, 0);
      trunk.rotation.z = Math.PI / 2;
      // Big legs (4)
      for (const [x, z] of [[-0.7, -0.35], [-0.7, 0.35], [0.5, -0.35], [0.5, 0.35]]) {
        cyl(g, 0.18, 0.18, 0.95, bone, x, 0.475, z);
      }
      // Ears
      box(g, 0.05, 0.5, 0.5, bone, 0.95, 1.1, -0.55);
      box(g, 0.05, 0.5, 0.5, bone, 0.95, 1.1, 0.55);
      break;
    }
    case 'crocodile': {
      // Brighter green so it reads against dark swamp ground.
      const green = mat(0x6a9038);
      const dark = mat(0x1a2810);
      const white = mat(0xeae0c8);
      const eyeGlow = mat(0xffe060, { emissive: 0xffaa20, emissiveIntensity: 1.4 });
      // Long low body — bigger so it reads at distance.
      box(g, 2.6, 0.45, 0.7, green, 0, 0.30, 0);
      // Snout
      box(g, 0.85, 0.32, 0.5, green, 1.65, 0.30, 0);
      // Bumpy back ridges (taller, more visible)
      for (let i = 0; i < 6; i++) {
        const r = box(g, 0.22, 0.18, 0.22, dark, -0.6 + i * 0.3, 0.55, 0);
        r.rotation.y = Math.PI / 4;
      }
      // Teeth (visible white row along snout)
      for (let i = 0; i < 5; i++) {
        box(g, 0.06, 0.10, 0.05, white, 1.30 + i * 0.18, 0.10, -0.20);
        box(g, 0.06, 0.10, 0.05, white, 1.30 + i * 0.18, 0.10, 0.20);
      }
      // Eyes — glowing yellow so the croc reads in murky swamp light.
      sph(g, 0.09, eyeGlow, 1.20, 0.55, -0.22);
      sph(g, 0.09, eyeGlow, 1.20, 0.55, 0.22);
      // Stubby legs (4)
      for (const [x, z] of [[-0.7, -0.40], [-0.7, 0.40], [0.5, -0.40], [0.5, 0.40]]) {
        box(g, 0.16, 0.22, 0.16, green, x, 0.11, z);
      }
      // Tail (tapered, swept)
      const tail = cone(g, 0.22, 1.5, green, -1.7, 0.30, 0, 6);
      tail.rotation.z = Math.PI / 2;
      break;
    }
    case 'serpent': {
      const green = mat(0x40a050);
      const dark = mat(0x102810);
      // Coiled body — chain of decreasing-size spheres
      const segs = 10;
      let radius = 0.85;
      for (let i = 0; i < segs; i++) {
        const t = i / segs;
        const r = 0.30 - t * 0.15;
        const a = t * Math.PI * 1.6;
        const x = Math.cos(a) * radius;
        const z = Math.sin(a) * radius;
        sph(g, r, green, x, 0.3 + t * 0.2, z);
        radius *= 0.92;
      }
      // Head (raised, larger)
      const head = sph(g, 0.32, green, 0.2, 1.4, 0.25);
      sph(g, 0.05, dark, 0.45, 1.5, 0.10);   // eyes
      sph(g, 0.05, dark, 0.45, 1.5, 0.40);
      // Forked tongue
      const tongue = box(g, 0.18, 0.02, 0.04, mat(0xc02040), 0.55, 1.4, 0.25);
      void head; void tongue;
      break;
    }
    case 'wolf': {
      const grey = mat(0x6a6e74);
      const dark = mat(0x202428);
      const white = mat(0xc0c4c8);
      // Body
      box(g, 1.3, 0.5, 0.5, grey, 0, 0.7, 0);
      // Head (more pointed than tiger)
      box(g, 0.45, 0.42, 0.42, grey, 0.78, 0.85, 0);
      // Snout
      box(g, 0.30, 0.20, 0.28, grey, 1.05, 0.78, 0);
      // Ears (pointy)
      cone(g, 0.08, 0.20, grey, 0.78, 1.15, -0.16, 4);
      cone(g, 0.08, 0.20, grey, 0.78, 1.15, 0.16, 4);
      // Eyes (yellow, glowing slightly)
      sph(g, 0.04, mat(0xffd060, { emissive: 0xff9020, emissiveIntensity: 0.8 }), 1.05, 0.92, -0.13);
      sph(g, 0.04, mat(0xffd060, { emissive: 0xff9020, emissiveIntensity: 0.8 }), 1.05, 0.92, 0.13);
      // Belly (lighter)
      box(g, 1.1, 0.25, 0.5, white, 0, 0.5, 0);
      // Long legs
      for (const [x, z] of [[-0.45, -0.18], [-0.45, 0.18], [0.45, -0.18], [0.45, 0.18]]) {
        box(g, 0.13, 0.5, 0.13, dark, x, 0.25, z);
      }
      // Bushy tail
      const tail = cyl(g, 0.10, 0.05, 0.55, grey, -0.75, 0.85, 0);
      tail.rotation.z = -Math.PI / 5;
      break;
    }
    case 'phoenix': {
      // Large fiery bird, perched
      const flame = mat(0xff4020, { emissive: 0xff5020, emissiveIntensity: 1.0 });
      const gold = mat(0xffa830, { emissive: 0xff8020, emissiveIntensity: 0.6 });
      const dark = mat(0x180404);
      // Body
      sph(g, 0.45, flame, 0, 1.4, 0);
      // Head
      sph(g, 0.22, gold, 0, 1.85, 0.1);
      // Beak
      cone(g, 0.06, 0.18, mat(0xffd060), 0, 1.85, 0.30, 4);
      // Eyes
      sph(g, 0.04, dark, -0.10, 1.92, 0.20);
      sph(g, 0.04, dark, 0.10, 1.92, 0.20);
      // Wings (large, spread)
      const wL = box(g, 0.05, 1.2, 0.7, flame, -0.45, 1.45, -0.05);
      wL.rotation.z = -0.4;
      const wR = box(g, 0.05, 1.2, 0.7, flame, 0.45, 1.45, -0.05);
      wR.rotation.z = 0.4;
      // Tail feathers (fanning out behind, golden)
      for (let i = -2; i <= 2; i++) {
        const f = box(g, 0.05, 0.85, 0.10, gold, 0, 1.4, -0.5);
        f.rotation.x = -0.3;
        f.rotation.z = i * 0.18;
      }
      // Legs
      cyl(g, 0.04, 0.04, 0.6, dark, -0.10, 0.7, 0);
      cyl(g, 0.04, 0.04, 0.6, dark, 0.10, 0.7, 0);
      // Crown plume on head (golden)
      cone(g, 0.05, 0.25, gold, 0, 2.18, -0.05, 4);
      break;
    }
    case 'dragon': {
      // Large purple-black dragon — wings spread, head raised
      const scale = mat(0x2a1838, { metalness: 0.4 });
      const glow = mat(0x180838, { emissive: 0xc0a0ff, emissiveIntensity: 1.6 });
      const dark = mat(0x080004);
      // Body (long box)
      box(g, 2.4, 0.8, 1.0, scale, 0, 1.4, 0);
      // Neck (raised, segments)
      box(g, 0.45, 0.5, 0.5, scale, 1.4, 1.7, 0);
      box(g, 0.4, 0.45, 0.45, scale, 1.85, 2.05, 0);
      // Head
      box(g, 0.6, 0.5, 0.6, scale, 2.25, 2.4, 0);
      // Snout
      box(g, 0.4, 0.3, 0.4, scale, 2.65, 2.30, 0);
      // Glowing eyes
      sph(g, 0.07, glow, 2.45, 2.5, -0.22);
      sph(g, 0.07, glow, 2.45, 2.5, 0.22);
      // Horns (curved up)
      const hL = cone(g, 0.10, 0.55, dark, 2.20, 2.78, -0.22, 6);
      hL.rotation.x = -0.4;
      const hR = cone(g, 0.10, 0.55, dark, 2.20, 2.78, 0.22, 6);
      hR.rotation.x = -0.4;
      // Wings (very large, spread)
      const wL = box(g, 0.06, 2.2, 1.4, scale, -0.4, 2.0, -0.3);
      wL.rotation.z = -0.3;
      wL.rotation.y = 0.2;
      const wR = box(g, 0.06, 2.2, 1.4, scale, 0.4, 2.0, -0.3);
      wR.rotation.z = 0.3;
      wR.rotation.y = -0.2;
      // Wing membranes (glowing edges)
      const mL = box(g, 0.03, 2.0, 0.05, glow, -0.4, 2.0, 0.4);
      mL.rotation.z = -0.3;
      const mR = box(g, 0.03, 2.0, 0.05, glow, 0.4, 2.0, 0.4);
      mR.rotation.z = 0.3;
      // Legs (4 chunky)
      for (const [x, z] of [[-0.8, -0.4], [-0.8, 0.4], [0.7, -0.4], [0.7, 0.4]]) {
        cyl(g, 0.18, 0.22, 1.2, scale, x, 0.6, z);
      }
      // Tail (long, tapered)
      for (let i = 0; i < 5; i++) {
        const r = 0.35 - i * 0.05;
        cyl(g, r, r * 0.85, 0.5, scale, -1.2 - i * 0.45, 1.4 - i * 0.15, 0);
      }
      // Spinal ridge (glowing crystals along the back)
      for (let i = 0; i < 6; i++) {
        cone(g, 0.10, 0.30, glow, -0.9 + i * 0.4, 1.95, 0, 4);
      }
      break;
    }
    case 'panda': {
      const white = mat(0xf0eee8);
      const black = mat(0x141414);
      // Body
      sph(g, 0.55, white, 0, 0.6, 0);
      // Head
      sph(g, 0.42, white, 0, 1.25, 0.05);
      // Eye patches
      sph(g, 0.13, black, -0.18, 1.32, 0.32);
      sph(g, 0.13, black, 0.18, 1.32, 0.32);
      // Eyes
      sph(g, 0.04, white, -0.18, 1.34, 0.42);
      sph(g, 0.04, white, 0.18, 1.34, 0.42);
      // Nose
      sph(g, 0.06, black, 0, 1.18, 0.45);
      // Ears (round + black)
      sph(g, 0.13, black, -0.30, 1.55, 0);
      sph(g, 0.13, black, 0.30, 1.55, 0);
      // Limbs (black)
      for (const [x, z] of [[-0.35, -0.25], [-0.35, 0.25], [0.35, -0.25], [0.35, 0.25]]) {
        sph(g, 0.18, black, x, 0.25, z);
      }
      // Shoulder bands (black)
      box(g, 0.95, 0.18, 0.50, black, 0, 0.85, 0);
      break;
    }
    case 'lion': {
      const sand = mat(0xc89858);
      const mane = mat(0x6a3818);
      const dark = mat(0x180a04);
      // Body
      box(g, 1.5, 0.55, 0.6, sand, 0, 0.65, 0);
      // Head
      sph(g, 0.34, sand, 0.85, 0.85, 0);
      // Big shaggy mane (multiple overlapping spheres)
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        sph(g, 0.32, mane, 0.85 + Math.cos(a) * 0.18, 0.85 + Math.sin(a) * 0.18, 0);
        sph(g, 0.32, mane, 0.85 + Math.cos(a) * 0.18, 0.85, Math.sin(a) * 0.22);
      }
      // Re-add face after mane
      sph(g, 0.30, sand, 1.05, 0.85, 0);
      // Eyes
      sph(g, 0.04, dark, 1.18, 0.92, -0.13);
      sph(g, 0.04, dark, 1.18, 0.92, 0.13);
      // Nose
      sph(g, 0.06, dark, 1.30, 0.80, 0);
      // Legs
      for (const [x, z] of [[-0.50, -0.22], [-0.50, 0.22], [0.50, -0.22], [0.50, 0.22]]) {
        box(g, 0.16, 0.45, 0.16, sand, x, 0.22, z);
      }
      // Tail with a tuft at the end
      const tail = cyl(g, 0.06, 0.06, 0.6, sand, -0.85, 0.7, 0);
      tail.rotation.z = Math.PI / 2.5;
      sph(g, 0.10, mane, -1.15, 0.45, 0);
      break;
    }
    case 'monkey': {
      const brown = mat(0x6a4830);
      const skin = mat(0xc8a080);
      const dark = mat(0x180a04);
      // Body
      sph(g, 0.30, brown, 0, 0.85, 0);
      // Head
      sph(g, 0.25, brown, 0, 1.30, 0.05);
      // Face
      sph(g, 0.18, skin, 0, 1.30, 0.18);
      // Eyes
      sph(g, 0.04, dark, -0.08, 1.35, 0.30);
      sph(g, 0.04, dark, 0.08, 1.35, 0.30);
      // Nose
      sph(g, 0.04, dark, 0, 1.27, 0.34);
      // Ears
      sph(g, 0.07, brown, -0.25, 1.32, 0);
      sph(g, 0.07, brown, 0.25, 1.32, 0);
      // Limbs (long arms hanging)
      const aL = cyl(g, 0.07, 0.07, 0.55, brown, -0.35, 0.85, 0);
      aL.rotation.z = 0.3;
      const aR = cyl(g, 0.07, 0.07, 0.55, brown, 0.35, 0.85, 0);
      aR.rotation.z = -0.3;
      // Hands
      sph(g, 0.10, skin, -0.55, 0.55, 0);
      sph(g, 0.10, skin, 0.55, 0.55, 0);
      // Legs
      cyl(g, 0.07, 0.07, 0.45, brown, -0.15, 0.4, 0);
      cyl(g, 0.07, 0.07, 0.45, brown, 0.15, 0.4, 0);
      // Curled tail (3 segments)
      const t1 = cyl(g, 0.05, 0.05, 0.4, brown, -0.20, 0.85, -0.2);
      t1.rotation.x = 0.5;
      const t2 = cyl(g, 0.045, 0.045, 0.35, brown, -0.20, 1.05, -0.5);
      t2.rotation.x = 1.2;
      const t3 = cyl(g, 0.04, 0.04, 0.30, brown, -0.20, 1.30, -0.55);
      t3.rotation.x = 2.0;
      void t1; void t2; void t3;
      break;
    }
  }
  return g;
}

function placeCreatures(kinds: { kind: CreatureKind; count: number }[]) {
  const placed: THREE.Group[] = [];
  let total = 0;
  for (const k of kinds) total += k.count;
  let idx = 0;
  for (const { kind, count } of kinds) {
    for (let i = 0; i < count; i++) {
      const angle = (idx / total) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      idx++;
      // Closer to the wall so they're clearly visible from inside the arena.
      const r = 12.5 + Math.random() * 4;
      const x = Math.cos(angle) * r;
      const z = Math.sin(angle) * r;
      const c = buildCreature(kind);
      c.position.set(x, 0, z);
      c.rotation.y = Math.atan2(-x, -z) + (Math.random() - 0.5) * 0.6;
      // Bigger so they read at distance.
      const s = 1.1 + Math.random() * 0.5;
      c.scale.setScalar(s);
      scene.add(c);
      placed.push(c);
    }
  }
  return placed;
}

// ---------- Procedural trees ----------
type TreeKind = 'broadleaf' | 'pine' | 'dead' | 'palm';

function buildTree(kind: TreeKind, height: number): THREE.Group {
  const g = new THREE.Group();
  const trunkColor = kind === 'dead' ? 0x6a4a30 : 0x3a2410;
  const trunkMat = mat(trunkColor);

  if (kind === 'broadleaf') {
    const trunkH = height * 0.5;
    const trunkR = 0.16 + (height - 4) * 0.04;
    cyl(g, trunkR * 0.85, trunkR, trunkH, trunkMat, 0, trunkH / 2, 0);
    const canopyTones = [0x3a8028, 0x4a8e34, 0x2a702c, 0x55a042];
    const canopy = mat(canopyTones[Math.floor(Math.random() * canopyTones.length)]);
    const canopyR = height * 0.34;
    const canopyY = trunkH + canopyR * 0.6;
    sph(g, canopyR, canopy, 0, canopyY, 0);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const r = canopyR * 0.6;
      sph(g, canopyR * 0.65, canopy,
        Math.cos(a) * r,
        canopyY + (Math.random() - 0.5) * canopyR * 0.4,
        Math.sin(a) * r);
    }
  } else if (kind === 'pine') {
    const trunkH = height * 0.25;
    cyl(g, 0.14, 0.20, trunkH, trunkMat, 0, trunkH / 2, 0);
    const conifer = mat(0x2a4828);
    let y = trunkH;
    let r = height * 0.36;
    const layerH = height * 0.20;
    for (let i = 0; i < 5; i++) {
      cone(g, r, layerH, conifer, 0, y + layerH / 2, 0, 10);
      y += layerH * 0.55;
      r *= 0.78;
    }
  } else if (kind === 'palm') {
    const trunkH = height * 0.85;
    const trunkR = 0.13 + (height - 4) * 0.03;
    cyl(g, trunkR * 0.6, trunkR, trunkH, trunkMat, 0, trunkH / 2, 0);
    const frond = mat(0x52a040);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const f = box(g, 0.05, height * 0.45, 0.55, frond,
        Math.cos(a) * 0.3, trunkH + height * 0.05, Math.sin(a) * 0.3);
      f.rotation.x = -0.6;
      f.rotation.z = Math.cos(a) * 0.4;
      f.rotation.y = a;
    }
  } else {
    // dead
    const trunkH = height * 0.7;
    const trunkR = 0.14 + (height - 4) * 0.04;
    cyl(g, trunkR * 0.7, trunkR, trunkH, trunkMat, 0, trunkH / 2, 0);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.random() * 0.4;
      const branch = box(g, 0.10, 0.7 + Math.random() * 0.5, 0.10, trunkMat,
        Math.cos(a) * 0.25, trunkH * 0.85, Math.sin(a) * 0.25);
      branch.rotation.z = Math.cos(a) * 0.7;
      branch.rotation.x = Math.sin(a) * 0.7;
      const sub = box(g, 0.07, 0.5, 0.07, trunkMat,
        Math.cos(a) * 0.5, trunkH * 0.95, Math.sin(a) * 0.5);
      sub.rotation.z = Math.cos(a + 1.2) * 0.8;
      sub.rotation.x = Math.sin(a + 1.2) * 0.8;
    }
  }
  return g;
}

function placeTrees(kind: TreeKind, count: number): THREE.Group[] {
  const placed: THREE.Group[] = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.6;
    const r = 13 + Math.random() * 10;
    const h = 4.5 + Math.random() * 3;
    const t = buildTree(kind, h);
    t.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    t.rotation.y = Math.random() * Math.PI * 2;
    scene.add(t);
    placed.push(t);
  }
  return placed;
}

// Procedural grid texture (for arenas that use a grid).
function makeGridTexture(line: number, lineW: number, bg: number, size = 1024, cell = 64) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#' + bg.toString(16).padStart(6, '0');
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = '#' + line.toString(16).padStart(6, '0');
  ctx.lineWidth = lineW;
  for (let i = 0; i <= size; i += cell) {
    ctx.beginPath();
    ctx.moveTo(i, 0); ctx.lineTo(i, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i); ctx.lineTo(size, i);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

function disposeArena() {
  for (const obj of arenaMeshes) {
    scene.remove(obj);
    obj.traverse(c => {
      if (c instanceof THREE.Mesh) {
        c.geometry.dispose();
        const m: any = c.material;
        if (m) {
          if (Array.isArray(m)) m.forEach((mm: any) => { mm.map?.dispose(); mm.emissiveMap?.dispose(); mm.dispose(); });
          else { m.map?.dispose(); m.emissiveMap?.dispose(); m.dispose(); }
        }
      }
    });
  }
  arenaMeshes = [];
}

// Playable arena is a circle of this radius — both player and boss are clamped inside.
const ARENA_R = 11;
const WALL_R = 11.5;
const PILLAR_SPECS: Array<[number, number, number]> = [
  // All pillars sit OUTSIDE the wall as background scenery.
  [-15, -10, 7], [15, -10, 5.5],
  [-19, 12, 8.5], [19, 12, 6.5],
  [-6, -26, 10], [6, -26, 9],
  [-26, -4, 6], [26, -4, 7.5],
];

function buildArena(cfg: LevelConfig) {
  disposeArena();
  clearAtmoParticles();
  clearCyberObjects();
  removeStars();
  clearCelestials();

  // Reset atmosphere timers so transitions don't flood.
  nextShipAt = 3; nextRocketAt = 6; nextMeteorAt = 4;
  snowAcc = petalAcc = emberAcc = rainAcc = bubbleAcc = glowAcc = ashAcc = 0;
  leafAcc = fireflyAcc = 0;

  // Sky / fog.
  scene.background = new THREE.Color(cfg.skyColor);
  scene.fog = new THREE.Fog(cfg.fogColor, cfg.fogNear, cfg.fogFar);

  // Lights.
  sun.color.setHex(cfg.sunColor);
  sun.intensity = cfg.sunIntensity;
  if (cfg.rim) {
    rim.color.setHex(cfg.rim.color);
    rim.intensity = cfg.rim.intensity;
  } else {
    rim.intensity = 0;
  }
  hemi.color.setHex(cfg.hemi.sky);
  hemi.groundColor.setHex(cfg.hemi.ground);
  hemi.intensity = cfg.hemi.intensity;

  // Ground.
  if (!cfg.noGround) {
    const groundMatOpts: THREE.MeshStandardMaterialParameters = {
      color: cfg.groundColor,
      roughness: cfg.groundGrid ? 0.4 : 0.9,
      metalness: cfg.groundGrid ? 0.3 : 0,
    };
    if (cfg.groundGrid) {
      const gridTex = makeGridTexture(cfg.groundGrid.line, cfg.groundGrid.lineW, cfg.groundColor);
      gridTex.repeat.set(40, 40);
      groundMatOpts.map = gridTex;
      groundMatOpts.emissive = new THREE.Color(cfg.groundGrid.emissive);
      groundMatOpts.emissiveMap = gridTex;
      groundMatOpts.emissiveIntensity = 1.0;
    }
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(220, 220),
      new THREE.MeshStandardMaterial(groundMatOpts)
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    arenaMeshes.push(ground);
  }

  // Pillars.
  const pillarMat = new THREE.MeshStandardMaterial({
    color: cfg.pillarColor, roughness: 0.4, metalness: 0.55,
  });
  const seamMat = cfg.pillarSeam ? new THREE.MeshStandardMaterial({
    color: cfg.pillarSeam.color, roughness: 0.5,
    emissive: cfg.pillarSeam.emissive, emissiveIntensity: cfg.pillarSeam.intensity,
  }) : null;
  for (const [x, z, h] of PILLAR_SPECS) {
    let pillar: THREE.Mesh;
    if (cfg.pillarShape === 'cone') {
      pillar = new THREE.Mesh(new THREE.ConeGeometry(0.9, h, 6), pillarMat);
    } else if (cfg.pillarShape === 'crystal') {
      pillar = new THREE.Mesh(new THREE.OctahedronGeometry(h * 0.4, 0), pillarMat);
      pillar.scale.set(1, 1.6, 1);
    } else {
      pillar = new THREE.Mesh(new THREE.BoxGeometry(1.6, h, 1.6), pillarMat);
    }
    pillar.position.set(x, h / 2, z);
    pillar.castShadow = true;
    pillar.receiveShadow = true;
    scene.add(pillar);
    arenaMeshes.push(pillar);
    // Seam glow strips on box pillars.
    if (seamMat && cfg.pillarShape === 'box') {
      const seamH = h * 0.85;
      for (const [sx, sz] of [[0.81, 0.81], [-0.81, 0.81], [0.81, -0.81], [-0.81, -0.81]]) {
        const seam = new THREE.Mesh(
          new THREE.BoxGeometry(0.06, seamH, 0.06), seamMat
        );
        seam.position.set(x + sx, h / 2, z + sz);
        scene.add(seam);
        arenaMeshes.push(seam);
      }
    }
  }

  // Platform (now wider — radius 11).
  const platform = new THREE.Mesh(
    new THREE.CylinderGeometry(ARENA_R, ARENA_R + 0.4, 0.3, 64),
    new THREE.MeshStandardMaterial({
      color: cfg.platformColor, roughness: 0.4, metalness: 0.5,
    })
  );
  platform.position.y = 0.15;
  platform.receiveShadow = true;
  platform.castShadow = true;
  scene.add(platform);
  arenaMeshes.push(platform);
  // Platform glow ring at the new outer edge.
  if (cfg.platformRing !== null) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(ARENA_R + 0.05, 0.06, 12, 128),
      new THREE.MeshStandardMaterial({
        color: 0x100002, roughness: 0.5,
        emissive: cfg.platformRing, emissiveIntensity: 3.0,
      })
    );
    ring.position.y = 0.32;
    ring.rotation.x = Math.PI / 2;
    scene.add(ring);
    arenaMeshes.push(ring);
  }

  // Boundary wall — knee-high cylinder around the play area, low so creatures
  // (crocodiles, serpents) behind the wall stay visible.
  const wallH = 0.5;
  const wall = new THREE.Mesh(
    new THREE.CylinderGeometry(WALL_R, WALL_R, wallH, 64, 1, true),
    new THREE.MeshStandardMaterial({
      color: cfg.pillarColor, roughness: 0.45, metalness: 0.5,
      side: THREE.DoubleSide,
    })
  );
  wall.position.y = wallH / 2;
  wall.receiveShadow = true;
  wall.castShadow = true;
  scene.add(wall);
  arenaMeshes.push(wall);
  // Glowing top edge in seam-themed arenas.
  if (cfg.pillarSeam) {
    const topRing = new THREE.Mesh(
      new THREE.TorusGeometry(WALL_R, 0.05, 8, 128),
      new THREE.MeshStandardMaterial({
        color: cfg.pillarSeam.color,
        emissive: cfg.pillarSeam.emissive,
        emissiveIntensity: cfg.pillarSeam.intensity,
        roughness: 0.5,
      })
    );
    topRing.rotation.x = Math.PI / 2;
    topRing.position.y = wallH;
    scene.add(topRing);
    arenaMeshes.push(topRing);
  }

  // Skyline.
  if (cfg.showSkyline) {
    const skylineMat = new THREE.MeshStandardMaterial({ color: 0x080a12, roughness: 0.9 });
    const skylineLightR = new THREE.MeshStandardMaterial({
      color: 0x180000, roughness: 0.5, emissive: 0xff2030, emissiveIntensity: 2.2,
    });
    const skylineLightC = new THREE.MeshStandardMaterial({
      color: 0x001018, roughness: 0.5, emissive: 0x40c0ff, emissiveIntensity: 1.8,
    });
    const positions: Array<[number, number, number, number]> = [
      [-30, -55, 22, 3.5], [-22, -60, 28, 3], [-12, -58, 18, 4],
      [0, -62, 32, 3.5], [10, -58, 24, 3], [20, -60, 26, 3.5], [32, -56, 20, 4],
      [-40, -50, 16, 3], [40, -50, 18, 3.5],
    ];
    for (let i = 0; i < positions.length; i++) {
      const [x, z, h, w] = positions[i];
      const tower = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), skylineMat);
      tower.position.set(x, h / 2, z);
      scene.add(tower);
      arenaMeshes.push(tower);
      const blink = (i % 3 === 0) ? skylineLightC : skylineLightR;
      const top = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), blink);
      top.position.set(x, h + 0.4, z);
      scene.add(top);
      arenaMeshes.push(top);
    }
  }

  // Stars.
  if (cfg.showStars) ensureStars();

  // Trees ringing the arena (forest scenery).
  if (cfg.trees) {
    const placed = placeTrees(cfg.trees.kind, cfg.trees.count);
    for (const t of placed) arenaMeshes.push(t);
  }

  // Themed creatures placed around the arena perimeter (decorative, outside wall).
  if (cfg.creatures && cfg.creatures.length > 0) {
    const placed = placeCreatures(cfg.creatures);
    for (const c of placed) arenaMeshes.push(c);
  }

  // Planets + moons (visible in the sky for selected arenas).
  if (cfg.atmosphere.includes('celestials')) {
    // Mars-like rusty planet, large, slow.
    spawnPlanet({
      size: 6.5, color: 0xc8704a, emissive: 0x301008,
      orbitRadius: 70, orbitSpeed: 0.025,
      centerY: 28, centerZ: -35, orbitTilt: 3, orbitPhase: 0.3,
    });
    // Ringed gas giant, far away.
    spawnPlanet({
      size: 5.0, color: 0xe8d090, emissive: 0x402810,
      ring: { color: 0xd0a060, inner: 6.5, outer: 9.5 },
      orbitRadius: 90, orbitSpeed: 0.018,
      centerY: 42, centerZ: -50, orbitTilt: 4, orbitPhase: 2.1,
    });
    // Cratered moon, small, fast.
    spawnPlanet({
      size: 2.2, color: 0xb8b8c0,
      orbitRadius: 50, orbitSpeed: 0.06,
      centerY: 32, centerZ: -25, orbitTilt: 5, orbitPhase: 4.0,
    });
    // Icy blue moon.
    spawnPlanet({
      size: 1.6, color: 0xc0e0f0, emissive: 0x102030,
      orbitRadius: 38, orbitSpeed: 0.085,
      centerY: 25, centerZ: -20, orbitTilt: 3, orbitPhase: 1.2,
    });
  }

  // Re-skin boss body seams to match level palette.
  // (Sword stays cosmos-green across all arenas.)
  for (const m of bossH.emissiveAccents) {
    const mat = m.material as THREE.MeshStandardMaterial;
    if (mat.emissive) mat.emissive.setHex(cfg.bossSashColor);
  }
}

// ---------- HUD ----------
const hud = document.createElement('div');
hud.id = 'hud';
hud.innerHTML = `
  <button id="menu-btn" type="button" title="Menu">&#8801;</button>
  <div id="boss-hud">
    <div class="label"><span id="lvl-tag"></span> <span id="lvl-name"></span></div>
    <div class="bar boss-hp"><div class="fill"></div></div>
    <div class="bar boss-posture"><div class="fill"></div></div>
  </div>
  <div id="player-hud">
    <div class="bar player-hp"><div class="fill"></div></div>
  </div>
  <button id="sound-btn" type="button" title="Toggle music (M)">&#9835; ON</button>
  <div id="result" class="hidden">
    <div class="result-title"></div>
    <div class="result-sub"></div>
  </div>
  <div id="vignette"></div>
`;
document.body.appendChild(hud);
const bossHpFill = hud.querySelector('.boss-hp .fill') as HTMLElement;
const bossPostureFill = hud.querySelector('.boss-posture .fill') as HTMLElement;
const playerHpFill = hud.querySelector('.player-hp .fill') as HTMLElement;
const resultEl = hud.querySelector('#result') as HTMLElement;
const resultTitle = hud.querySelector('.result-title') as HTMLElement;
const resultSub = hud.querySelector('.result-sub') as HTMLElement;
const vignetteEl = hud.querySelector('#vignette') as HTMLElement;
const lvlTag = hud.querySelector('#lvl-tag') as HTMLElement;
const lvlName = hud.querySelector('#lvl-name') as HTMLElement;
const soundBtn = hud.querySelector('#sound-btn') as HTMLButtonElement;

function syncSoundUI(muted: boolean) {
  soundBtn.textContent = muted ? '♫ OFF' : '♫ ON';
  soundBtn.classList.toggle('muted', muted);
  const ind = document.getElementById('mute-indicator');
  if (ind) ind.textContent = muted ? 'MUSIC: OFF' : 'MUSIC: ON';
}

soundBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  // Need a user gesture to start AudioContext on first click.
  music.init();
  const muted = music.toggleMute();
  syncSoundUI(muted);
});

// Menu button — opens the level-select prompt.
const menuBtn = hud.querySelector('#menu-btn') as HTMLButtonElement;
menuBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  if (controls.isLocked) controls.unlock();
  promptEl.classList.remove('hidden');
});

function updateHUD() {
  bossHpFill.style.width = `${(boss.hp / boss.maxHp) * 100}%`;
  bossPostureFill.style.width = `${(boss.posture / boss.maxPosture) * 100}%`;
  playerHpFill.style.width = `${(player.hp / player.maxHp) * 100}%`;
  vignetteEl.style.opacity = String(Math.max(0, damageVignetteUntil - nowSec()) / 0.5);
}

function setHUDForLevel() {
  const { stage, localIdx } = stageOfLevel(currentLevel);
  lvlTag.textContent = `${stage.name.toUpperCase()} · LV ${localIdx + 1}/${stage.levels.length}`;
  lvlName.textContent = `· ${LEVELS[currentLevel].name}`;
}

// ---------- Game flow ----------
function applyLevel(idx: number) {
  currentLevel = idx;
  saveLevel();
  setHUDForLevel();
  // Swap boss model when crossing stage boundaries.
  const newStageIdx = stageOfLevel(idx).stageIdx;
  if (newStageIdx !== currentBossStageIdx) {
    rebuildBoss(newStageIdx);
  }
  buildArena(LEVELS[idx]);
  resetBossForLevel();
}

function resetBossForLevel() {
  const cfg = LEVELS[currentLevel];
  boss.maxHp = cfg.bossHp;
  boss.hp = cfg.bossHp;
  boss.posture = 0;
  boss.nextAttackAt = cfg.bossAttackEvery[0] + Math.random() * (cfg.bossAttackEvery[1] - cfg.bossAttackEvery[0]);
  boss.attackResolved = false;
  boss.longRecover = false;
  boss.staggerCritReady = false;
  boss.hitFlash = 0;
  bossH.root.position.set(0, 0, 0);
  bossH.root.rotation.set(0, 0, 0);
  bossWalkPhase = 0;
  const idleForStage = currentBossStageIdx === 1 ? POSE_BEAST_IDLE : POSE_IDLE;
  poseFrom = idleForStage;
  applyPose(bossH, idleForStage);
  boss.swordBladeMat.emissive.setRGB(0, 0, 0);
  for (const p of boss.parts) {
    (p.material as THREE.MeshStandardMaterial).emissive.setRGB(0, 0, 0);
  }
  boss.state = 'idle';
  boss.stateTime = 0;
}

function resetPlayerCombatState() {
  player.hp = player.maxHp;
  swingTime = -1;
  blocking = false;
  parryReadyUntil = 0;
  hitstopUntil = 0;
  damageVignetteUntil = 0;
}

function retryLevel() {
  resetPlayerCombatState();
  resetBossForLevel();
  gameState = 'playing';
  resultEl.classList.add('hidden');
}

function advanceLevel() {
  if (currentLevel < LEVELS.length - 1) {
    applyLevel(currentLevel + 1);
    resetPlayerCombatState();
    gameState = 'playing';
    resultEl.classList.add('hidden');
  }
}

function startNewRun() {
  applyLevel(0);
  resetPlayerCombatState();
  gameState = 'playing';
  resultEl.classList.add('hidden');
}

function endLevelWon() {
  if (currentLevel >= LEVELS.length - 1) {
    gameState = 'won-game';
    resultTitle.textContent = 'GAME COMPLETE';
    resultTitle.style.color = '#ffe9a8';
    resultSub.textContent = 'PRESS R TO START A NEW RUN';
  } else {
    gameState = 'won-level';
    resultTitle.textContent = `LEVEL ${currentLevel + 1} COMPLETE`;
    resultTitle.style.color = '#f4f1ea';
    resultSub.textContent = `PRESS SPACE — NEXT: ${LEVELS[currentLevel + 1].name.toUpperCase()}`;
  }
  resultEl.classList.remove('hidden');
}
function endLevelLost() {
  gameState = 'lost';
  resultTitle.textContent = 'DEFEATED';
  resultTitle.style.color = '#e8556a';
  resultSub.textContent = 'PRESS R TO RETRY';
  resultEl.classList.remove('hidden');
}

// ---------- Movement ----------
const velocity = new THREE.Vector3();
const moveDir = new THREE.Vector3();
let bobPhase = 0;
function updateMovement(dt: number) {
  if (gameState !== 'playing') return;
  // Allow movement on touch even without pointer-lock; on desktop require lock.
  if (!touchMode && !controls.isLocked) return;
  const accel = 60, damping = 10, maxSpeed = 5.2;
  moveDir.set(0, 0, 0);
  if (touchMode && joyState.active) {
    moveDir.x = joyState.dx / JOY_MAX;
    moveDir.z = joyState.dy / JOY_MAX;
    if (moveDir.length() > 1) moveDir.normalize();
  } else {
    if (keys['KeyW']) moveDir.z -= 1;
    if (keys['KeyS']) moveDir.z += 1;
    if (keys['KeyA']) moveDir.x -= 1;
    if (keys['KeyD']) moveDir.x += 1;
    moveDir.normalize();
  }
  velocity.x += (moveDir.x * accel - velocity.x * damping) * dt;
  velocity.z += (moveDir.z * accel - velocity.z * damping) * dt;
  const speed = Math.hypot(velocity.x, velocity.z);
  if (speed > maxSpeed) {
    velocity.x *= maxSpeed / speed;
    velocity.z *= maxSpeed / speed;
  }
  controls.moveRight(velocity.x * dt);
  controls.moveForward(-velocity.z * dt);
  // Clamp player to arena radius — kill outward velocity when bumping the wall.
  const px = camera.position.x, pz = camera.position.z;
  const pd = Math.hypot(px, pz);
  if (pd > ARENA_R) {
    const f = ARENA_R / pd;
    camera.position.x = px * f;
    camera.position.z = pz * f;
    const ux = px / pd, uz = pz / pd;
    const radial = velocity.x * ux + velocity.z * uz;
    if (radial > 0) {
      velocity.x -= radial * ux;
      velocity.z -= radial * uz;
    }
  }
  bobPhase += speed * dt * 1.6;
}

// ---------- Player Sword ----------
function updatePlayerSword(t: number, dt: number) {
  const movingAmt = Math.min(1, Math.hypot(velocity.x, velocity.z) / 5);
  const swayX = Math.sin(t * 1.3) * 0.006;
  const swayY = Math.cos(t * 1.6) * 0.005;
  const bobX = Math.sin(bobPhase) * 0.022 * movingAmt;
  const bobY = Math.abs(Math.cos(bobPhase)) * 0.024 * movingAmt;
  const blockAmt = blocking ? 1 : 0;
  const block = {
    px: -0.18 * blockAmt, py: 0.1 * blockAmt, pz: 0.05 * blockAmt,
    rx: 0.2 * blockAmt, ry: -0.4 * blockAmt, rz: 1.0 * blockAmt,
  };
  if (swingTime < 0) {
    sword.position.set(
      HELD_POS.x + swayX + bobX + block.px,
      HELD_POS.y + swayY + bobY + block.py,
      HELD_POS.z + block.pz
    );
    sword.rotation.set(
      HELD_ROT.x + block.rx,
      HELD_ROT.y + swayX * 1.5 + block.ry,
      HELD_ROT.z + block.rz
    );
    return;
  }
  swingTime += dt;
  const p = Math.min(1, swingTime / SWING_DUR);
  const wind = { px: 0.45, py: -0.15, pz: -0.55, rx: -1.0, ry: 0.55, rz: -0.6 };
  const end = { px: -0.25, py: -0.35, pz: -0.6, rx: 0.6, ry: -0.4, rz: -2.1 };
  if (p < 0.15) {
    const w = easeInOutCubic(p / 0.15);
    sword.position.set(lerp(HELD_POS.x, wind.px, w), lerp(HELD_POS.y, wind.py, w), lerp(HELD_POS.z, wind.pz, w));
    sword.rotation.set(lerp(HELD_ROT.x, wind.rx, w), lerp(HELD_ROT.y, wind.ry, w), lerp(HELD_ROT.z, wind.rz, w));
  } else {
    const k = (p - 0.15) / 0.85;
    const ek = easeOutCubic(k);
    sword.position.set(lerp(wind.px, end.px, ek), lerp(wind.py, end.py, ek), lerp(wind.pz, end.pz, ek));
    sword.rotation.set(lerp(wind.rx, end.rx, ek), lerp(wind.ry, end.ry, ek), lerp(wind.rz, end.rz, ek));
  }
  if (p > 0.22 && p < 0.7 && !swingDidHit) checkPlayerHit();
  if (p >= 1) swingTime = -1;
}

const tipLocal = new THREE.Vector3(0, 0.99, 0);
const baseLocal = new THREE.Vector3(0, 0.06, 0);
function updateTrail() {
  const swinging = swingTime >= 0 && swingTime > SWING_DUR * 0.18;
  if (swinging) {
    sword.updateMatrixWorld(true);
    trailPoints.push({
      tip: tipLocal.clone().applyMatrix4(sword.matrixWorld),
      base: baseLocal.clone().applyMatrix4(sword.matrixWorld),
    });
    if (trailPoints.length > TRAIL_MAX) trailPoints.shift();
  } else if (trailPoints.length > 0) {
    trailPoints.shift();
  }
  if (trailPoints.length < 2) {
    trailMesh.visible = false;
    return;
  }
  trailMesh.visible = true;
  const posAttr = trailGeom.getAttribute('position') as THREE.BufferAttribute;
  const arr = posAttr.array as Float32Array;
  let idx = 0;
  for (let i = 0; i < trailPoints.length - 1; i++) {
    const a = trailPoints[i], b = trailPoints[i + 1];
    arr[idx++] = a.tip.x; arr[idx++] = a.tip.y; arr[idx++] = a.tip.z;
    arr[idx++] = a.base.x; arr[idx++] = a.base.y; arr[idx++] = a.base.z;
    arr[idx++] = b.tip.x; arr[idx++] = b.tip.y; arr[idx++] = b.tip.z;
    arr[idx++] = a.base.x; arr[idx++] = a.base.y; arr[idx++] = a.base.z;
    arr[idx++] = b.base.x; arr[idx++] = b.base.y; arr[idx++] = b.base.z;
    arr[idx++] = b.tip.x; arr[idx++] = b.tip.y; arr[idx++] = b.tip.z;
  }
  while (idx < arr.length) arr[idx++] = 0;
  posAttr.needsUpdate = true;
  trailGeom.setDrawRange(0, (trailPoints.length - 1) * 6);
  trailMat.opacity = 0.85 * (trailPoints.length / TRAIL_MAX);
}

// ---------- Player → Boss hit ----------
const ray = new THREE.Raycaster();
ray.far = 2.6;
const screenCenter = new THREE.Vector2(0, 0);
function checkPlayerHit() {
  if (boss.state === 'dead') return;
  ray.setFromCamera(screenCenter, camera);
  const hits = ray.intersectObjects(boss.parts, false);
  if (hits.length === 0) return;
  swingDidHit = true;
  let dmg = 15, postureBuild = 10, crit = false;
  if (boss.staggerCritReady) {
    dmg = 50; postureBuild = 0; crit = true;
    boss.staggerCritReady = false;
  }
  boss.hp = Math.max(0, boss.hp - dmg);
  boss.posture = Math.min(boss.maxPosture, boss.posture + postureBuild);
  boss.hitFlash = 1;
  spawnSparks(hits[0].point, crit ? 24 : 14, crit ? 0xff5060 : 0xff2030, crit ? 7 : 5);
  if (crit) hitstopUntil = nowSec() + 0.12;
  if (boss.hp <= 0) {
    transitionBoss('dead');
    endLevelWon();
  } else if (boss.posture >= boss.maxPosture && boss.state !== 'staggered') {
    enterStagger();
  }
}
function enterStagger() {
  boss.staggerCritReady = true;
  boss.attackResolved = false;
  const headPos = new THREE.Vector3();
  bossH.faceMesh.getWorldPosition(headPos);
  spawnSparks(headPos, 14, 0xffd680, 5);
  transitionBoss('staggered');
}

// ---------- Boss AI ----------
function updateBoss(dt: number) {
  if (gameState !== 'playing' && boss.state !== 'dead') return;
  const cfg = LEVELS[currentLevel];
  boss.stateTime += dt;
  if (boss.state !== 'staggered' && boss.state !== 'dead') {
    const dx = camera.position.x - bossH.root.position.x;
    const dz = camera.position.z - bossH.root.position.z;
    const targetYaw = Math.atan2(dx, dz);
    const cur = bossH.root.rotation.y;
    let diff = targetYaw - cur;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const yawSpeed = boss.state === 'idle' ? 4 : 1.5;
    bossH.root.rotation.y += diff * Math.min(1, yawSpeed * dt);
  }
  if (boss.state === 'idle' && !boss.staggerCritReady) {
    boss.posture = Math.max(0, boss.posture - 8 * dt);
  }
  if (boss.hitFlash > 0) {
    boss.hitFlash = Math.max(0, boss.hitFlash - dt * 4);
    for (const p of boss.parts) {
      const m = p.material as THREE.MeshStandardMaterial;
      m.emissive.setRGB(boss.hitFlash * 0.7, boss.hitFlash * 0.08, boss.hitFlash * 0.12);
    }
  }
  switch (boss.state) {
    case 'idle': {
      const t = Math.min(1, boss.stateTime / 0.4);
      const targetIdle = currentBossStageIdx === 1 ? POSE_BEAST_IDLE : POSE_IDLE;
      applyPoseLerp(bossH, poseFrom, targetIdle, easeOutCubic(t));
      // Walk toward player if too far. Apply gait overlay on top of IDLE pose.
      const moving = updateBossLocomotion(dt);
      if (moving) applyWalkOverlay(bossH, bossWalkPhase, 1.0);
      else bossH.root.position.y = lerp(bossH.root.position.y, 0, Math.min(1, 8 * dt));
      const distToPlayer = Math.hypot(
        camera.position.x - bossH.root.position.x,
        camera.position.z - bossH.root.position.z
      );
      // Only attack when in range AND attack timer is ready.
      if (distToPlayer < BOSS_ATTACK_RANGE && boss.stateTime >= boss.nextAttackAt) {
        boss.attackResolved = false;
        boss.longRecover = false;
        transitionBoss('windup');
      }
      // Idle: lerp weapon emissive toward stage baseline (cosmos green / wilderness blood red).
      const idleEmissive = currentBossStageIdx === 1
        ? new THREE.Color(0.30, 0.04, 0.04)
        : new THREE.Color(0.0, 0.55, 0.22);
      boss.swordBladeMat.emissive.lerp(idleEmissive, Math.min(1, 6 * dt));
      break;
    }
    case 'windup': {
      const WINDUP_DUR = cfg.bossWindup;
      const t = Math.min(1, boss.stateTime / WINDUP_DUR);
      const w = easeOutCubic(t);
      const targetWindup = currentBossStageIdx === 1 ? POSE_BEAST_WINDUP : POSE_WINDUP;
      applyPoseLerp(bossH, poseFrom, targetWindup, w);
      // Windup: ramp baseline up to a brighter flare (per-stage color).
      if (currentBossStageIdx === 1) {
        boss.swordBladeMat.emissive.setRGB(0.30 + w * 1.20, 0.04 + w * 0.05, 0.04 + w * 0.05);
      } else {
        boss.swordBladeMat.emissive.setRGB(0.0, 0.55 + w * 1.0, 0.22 + w * 0.5);
      }
      if (t >= 1) transitionBoss('strike');
      break;
    }
    case 'strike': {
      const STRIKE_DUR = 0.18;
      const t = Math.min(1, boss.stateTime / STRIKE_DUR);
      const e = easeOutCubic(t);
      const targetStrike = currentBossStageIdx === 1 ? POSE_BEAST_STRIKE : POSE_STRIKE;
      applyPoseLerp(bossH, poseFrom, targetStrike, e);
      if (!boss.attackResolved && t > 0.4) {
        resolveBossStrike();
        boss.attackResolved = true;
      }
      // Strike: flash bright then decay back to the baseline glow (per-stage color).
      const glow = 1 - t;
      if (currentBossStageIdx === 1) {
        boss.swordBladeMat.emissive.setRGB(0.30 + glow * 1.20, 0.04 + glow * 0.05, 0.04 + glow * 0.05);
      } else {
        boss.swordBladeMat.emissive.setRGB(0.0, 0.55 + glow * 1.0, 0.22 + glow * 0.5);
      }
      if (t >= 1) transitionBoss('recover');
      break;
    }
    case 'recover': {
      const RECOVER_DUR = boss.longRecover ? 1.0 : 0.55;
      const t = Math.min(1, boss.stateTime / RECOVER_DUR);
      const e = easeOutCubic(t);
      const targetIdle = currentBossStageIdx === 1 ? POSE_BEAST_IDLE : POSE_IDLE;
      applyPoseLerp(bossH, poseFrom, targetIdle, e);
      const recoverEmissive = currentBossStageIdx === 1
        ? new THREE.Color(0.30, 0.04, 0.04)
        : new THREE.Color(0.0, 0.55, 0.22);
      boss.swordBladeMat.emissive.lerp(recoverEmissive, Math.min(1, 6 * dt));
      if (t >= 1) {
        const r = cfg.bossAttackEvery;
        boss.nextAttackAt = r[0] + Math.random() * (r[1] - r[0]);
        transitionBoss('idle');
      }
      break;
    }
    case 'staggered': {
      const STAGGER_DUR = 2.5;
      const t = Math.min(1, boss.stateTime / 0.4);
      applyPoseLerp(bossH, poseFrom, POSE_STAGGER, easeOutCubic(t));
      const pulse = (Math.sin(boss.stateTime * 8) + 1) * 0.5;
      for (const p of boss.parts) {
        const m = p.material as THREE.MeshStandardMaterial;
        m.emissive.setRGB(0.3 + pulse * 0.3, 0.25 + pulse * 0.25, 0.05);
      }
      bossH.root.rotation.x = Math.sin(boss.stateTime * 4) * 0.06;
      if (boss.stateTime >= STAGGER_DUR || !boss.staggerCritReady) {
        boss.posture = 0;
        boss.staggerCritReady = false;
        bossH.root.rotation.x = 0;
        for (const p of boss.parts) {
          (p.material as THREE.MeshStandardMaterial).emissive.setRGB(0, 0, 0);
        }
        transitionBoss('idle');
      }
      break;
    }
    case 'dead': {
      const fall = Math.min(1, boss.stateTime / 0.9);
      const e = easeOutCubic(fall);
      applyPoseLerp(bossH, poseFrom, POSE_DEATH, e);
      bossH.root.rotation.x = -e * (Math.PI / 2 - 0.3);
      bossH.root.position.y = -e * 0.05;
      boss.swordBladeMat.emissive.lerp(new THREE.Color(0, 0, 0), Math.min(1, 4 * dt));
      break;
    }
  }
}

function resolveBossStrike() {
  const cfg = LEVELS[currentLevel];
  const dx = camera.position.x - bossH.root.position.x;
  const dz = camera.position.z - bossH.root.position.z;
  const dist = Math.hypot(dx, dz);
  if (dist > 2.7) return;
  const isParry = nowSec() < parryReadyUntil;
  if (isParry) {
    const tipPos = new THREE.Vector3();
    boss.swordBlade.getWorldPosition(tipPos);
    spawnSparks(tipPos, 18, 0xffe9a8, 6);
    boss.posture = Math.min(boss.maxPosture, boss.posture + 35);
    boss.longRecover = true;
    hitstopUntil = nowSec() + 0.09;
    parryReadyUntil = 0;
    if (boss.posture >= boss.maxPosture) enterStagger();
    return;
  }
  let dmg = cfg.bossDmg;
  if (blocking) dmg *= 0.3;
  player.hp = Math.max(0, player.hp - dmg);
  damageVignetteUntil = nowSec() + 0.5;
  if (blocking) {
    sword.updateMatrixWorld(true);
    const tipPos = new THREE.Vector3(0, 0.99, 0).applyMatrix4(sword.matrixWorld);
    spawnSparks(tipPos, 8, 0xc8a060, 3);
  }
  if (player.hp <= 0) endLevelLost();
}

(window as any).__sword = {
  camera, boss, bossH, scene, THREE, retryLevel, advanceLevel, startNewRun,
  setLevel: (n: number) => applyLevel(Math.max(0, Math.min(LEVELS.length - 1, n))),
  LEVELS,
};

// ---------- Main menu (level select inside the prompt overlay) ----------
function buildMainMenu() {
  promptEl.innerHTML = `
    <div id="menu">
      <div id="menu-title">CYBER-RONIN</div>
      <div id="menu-sub">Choose your arena</div>
      <div id="stage-list"></div>
      <div id="menu-footer">
        <span class="keys">WASD</span> move &nbsp;·&nbsp; <span class="keys">LMB</span> swing &nbsp;·&nbsp; <span class="keys">RMB</span> block / tap to parry &nbsp;·&nbsp; <span class="keys">ESC</span> release &nbsp;·&nbsp; <span class="keys">M</span> mute<br/>
        Or click anywhere outside a level to resume current
        <div id="mute-indicator" style="margin-top:6px;opacity:0.5">MUSIC: ON</div>
      </div>
    </div>
  `;
  const stageList = promptEl.querySelector('#stage-list')!;
  let globalIdx = 0;
  STAGES.forEach((stage) => {
    const section = document.createElement('div');
    section.className = 'stage-section';
    section.innerHTML = `
      <div class="stage-name">${stage.name}</div>
      <div class="stage-grid"></div>
    `;
    const grid = section.querySelector('.stage-grid')!;
    stage.levels.forEach((cfg) => {
      const i = globalIdx++;
      const btn = document.createElement('button');
      btn.className = 'level-btn' + (i === currentLevel ? ' current' : '');
      btn.innerHTML = `<span class="lvl-num">${i + 1}</span><span class="lvl-name">${cfg.name}</span>`;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        promptEl.querySelectorAll('.level-btn').forEach((b) => b.classList.remove('current'));
        btn.classList.add('current');
        // Start cosmic ambient on first user gesture (browser autoplay rule).
        music.init();
        applyLevel(i);
        resetPlayerCombatState();
        gameState = 'playing';
        resultEl.classList.add('hidden');
        if (touchMode) {
          promptEl.classList.add('hidden');
        } else {
          controls.lock();
        }
      });
      grid.appendChild(btn);
    });
    stageList.appendChild(section);
  });
}

function refreshMenuHighlight() {
  const buttons = promptEl.querySelectorAll('.level-btn');
  if (!buttons.length) return;
  buttons.forEach((b, i) => {
    b.classList.toggle('current', i === currentLevel);
  });
}
// Keep menu highlight in sync when level changes via R / SPACE.
const _origApplyLevel = applyLevel;
const wrappedApplyLevel = (idx: number) => {
  _origApplyLevel(idx);
  refreshMenuHighlight();
};
// Expose the wrapped version for the debug bag too.
(window as any).__sword.setLevel = (n: number) =>
  wrappedApplyLevel(Math.max(0, Math.min(LEVELS.length - 1, n)));

// ============================================================
// ---------- Touch controls (iPad / mobile) — Pointer Events
// ============================================================
const touchMode = ('ontouchstart' in window) || (navigator.maxTouchPoints ?? 0) > 0;
const joyState = { dx: 0, dy: 0, active: false, id: -1 };
const JOY_MAX = 55;

// Always wire look-by-drag on the canvas for non-mouse pointers (touch + pen).
// This works regardless of touchMode detection — fixes iPad "Desktop Site" quirks.
{
  const canvas = renderer.domElement;
  // Make sure the canvas has rotation order set up for free-look.
  camera.rotation.order = 'YXZ';

  type LookPtr = { lastX: number; lastY: number; startX: number; startY: number; startTime: number };
  const looks = new Map<number, LookPtr>();

  canvas.addEventListener('pointerdown', (e: PointerEvent) => {
    if (e.pointerType === 'mouse') return;     // desktop uses pointer-lock for look
    if (gameState !== 'playing') return;
    canvas.setPointerCapture(e.pointerId);
    looks.set(e.pointerId, {
      lastX: e.clientX, lastY: e.clientY,
      startX: e.clientX, startY: e.clientY,
      startTime: nowSec(),
    });
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', (e: PointerEvent) => {
    const l = looks.get(e.pointerId);
    if (!l) return;
    const dx = e.clientX - l.lastX;
    const dy = e.clientY - l.lastY;
    l.lastX = e.clientX;
    l.lastY = e.clientY;
    const sens = 0.005;
    camera.rotation.y -= dx * sens;
    camera.rotation.x -= dy * sens;
    camera.rotation.x = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, camera.rotation.x));
    e.preventDefault();
  });
  const endLook = (e: PointerEvent) => {
    const l = looks.get(e.pointerId);
    if (!l) return;
    const dt = nowSec() - l.startTime;
    const moveDist = Math.hypot(l.lastX - l.startX, l.lastY - l.startY);
    if (dt < 0.25 && moveDist < 14 && gameState === 'playing') {
      if (swingTime < 0) {
        swingTime = 0;
        swingDidHit = false;
      }
    }
    looks.delete(e.pointerId);
  };
  canvas.addEventListener('pointerup', endLook);
  canvas.addEventListener('pointercancel', endLook);
}

if (touchMode) {
  // Build touch UI.
  const tc = document.createElement('div');
  tc.id = 'touch-controls';
  tc.classList.add('active');
  tc.innerHTML = `
    <div id="joystick-base"><div id="joystick-knob"></div></div>
    <button id="block-btn" type="button">BLOCK</button>
  `;
  document.body.appendChild(tc);
  const joyBase = document.getElementById('joystick-base')!;
  const joyKnob = document.getElementById('joystick-knob')!;
  const blockBtn = document.getElementById('block-btn')!;

  const joyCenter = () => {
    const r = joyBase.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };

  joyBase.addEventListener('pointerdown', (e: PointerEvent) => {
    e.stopPropagation();
    if (joyState.id !== -1) return;
    joyBase.setPointerCapture(e.pointerId);
    joyState.id = e.pointerId;
    joyState.active = true;
    const c = joyCenter();
    let dx = e.clientX - c.x, dy = e.clientY - c.y;
    const d = Math.hypot(dx, dy);
    if (d > JOY_MAX) { dx *= JOY_MAX / d; dy *= JOY_MAX / d; }
    joyState.dx = dx; joyState.dy = dy;
    joyKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    e.preventDefault();
  });
  joyBase.addEventListener('pointermove', (e: PointerEvent) => {
    if (e.pointerId !== joyState.id) return;
    const c = joyCenter();
    let dx = e.clientX - c.x, dy = e.clientY - c.y;
    const d = Math.hypot(dx, dy);
    if (d > JOY_MAX) { dx *= JOY_MAX / d; dy *= JOY_MAX / d; }
    joyState.dx = dx; joyState.dy = dy;
    joyKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    e.preventDefault();
  });
  const joyEnd = (e: PointerEvent) => {
    if (e.pointerId !== joyState.id) return;
    joyState.id = -1;
    joyState.active = false;
    joyState.dx = 0; joyState.dy = 0;
    joyKnob.style.transform = 'translate(-50%, -50%)';
  };
  joyBase.addEventListener('pointerup', joyEnd);
  joyBase.addEventListener('pointercancel', joyEnd);

  // BLOCK / parry button.
  let blockPtrId = -1;
  blockBtn.addEventListener('pointerdown', (e: PointerEvent) => {
    e.stopPropagation();
    if (gameState !== 'playing') return;
    blockBtn.setPointerCapture(e.pointerId);
    blockPtrId = e.pointerId;
    blocking = true;
    parryReadyUntil = nowSec() + LEVELS[currentLevel].bossParryWindow;
    blockBtn.classList.add('active');
    e.preventDefault();
  });
  const blockEnd = (e: PointerEvent) => {
    if (e.pointerId !== blockPtrId) return;
    blockPtrId = -1;
    blocking = false;
    blockBtn.classList.remove('active');
  };
  blockBtn.addEventListener('pointerup', blockEnd);
  blockBtn.addEventListener('pointercancel', blockEnd);
}

// ---------- Init ----------
applyLevel(currentLevel);
buildMainMenu();

// ---------- Loop ----------
const timer = new THREE.Timer();
function tick() {
  timer.update();
  let dt = Math.min(0.05, timer.getDelta());
  const t = timer.getElapsed();
  if (nowSec() < hitstopUntil) dt *= 0.05;

  updateMovement(dt);
  updatePlayerSword(t, dt);
  updateTrail();
  updateBoss(dt);
  updateSparks(dt);
  updateAtmosphereForLevel(dt, t, LEVELS[currentLevel].atmosphere);
  updateAtmoParticles(dt);
  updateCelestials(dt, t);
  updateHUD();

  composer.render();
  requestAnimationFrame(tick);
}
tick();
