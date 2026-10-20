// 3D 微缩小城：六边形地块、房子树木、事件光圈、环境云、干员小人。
// 只管画和镜头，不管规则；规则状态由外面喂进来。
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export const R = 1;                       // 六边形外接圆半径
export const MAP_R = 6;                   // 每边 7 格 → 中心到边 6 格，共 127 格
const SQ3 = Math.sqrt(3);
const SEA_Y = -0.95, SEA_SPAN = 48;      // 海面高度；岛附近浅水画在中间 48×48 的范围里
// 物件影子：和太阳（左前上方）同向，落在右后方
const SHADOW_YAW = -1.25, SHADOW_DX = -Math.sin(SHADOW_YAW), SHADOW_DZ = -Math.cos(SHADOW_YAW), SHADOW_LEN = 0.75;

// 平顶六边形（整张地图竖着是尖的，适合竖屏）
export function hexToWorld(q, r) {
  return new THREE.Vector3(R * 1.5 * q, 0, R * SQ3 * (r + q / 2));
}
export function worldToHex(x, z) {
  const q = (2 / 3 * x) / R;
  const r = (-1 / 3 * x + SQ3 / 3 * z) / R;
  let rx = Math.round(q), rz = Math.round(r), ry = Math.round(-q - r);
  const dx = Math.abs(rx - q), dz = Math.abs(rz - r), dy = Math.abs(ry + q + r);
  if (dx > dy && dx > dz) rx = -ry - rz; else if (dz > dy) rz = -rx - ry;
  return { q: rx, r: rz };
}
export function hexDist(a, b) {
  return Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r), Math.abs(a.q + a.r - b.q - b.r));
}
export const CELLS = [];
for (let q = -MAP_R; q <= MAP_R; q++) for (let r = -MAP_R; r <= MAP_R; r++) {
  if (Math.abs(q + r) <= MAP_R) CELLS.push({ q: q, r: r, key: q + ',' + r });
}

function rng(seed) {
  let s = seed >>> 0;
  return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function hexShape(rad) {
  const s = new THREE.Shape();
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 3 * i;
    const x = rad * Math.cos(a), y = rad * Math.sin(a);
    if (i === 0) s.moveTo(x, y); else s.lineTo(x, y);
  }
  s.closePath();
  return s;
}
// 圆角六边形：顶面边缘有明显的倒角，像软胶
function hexSlab(rad, depth, bevel, segs) {
  const g = new THREE.ExtrudeGeometry(hexShape(rad - bevel), {
    depth: depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: segs || 4, curveSegments: 1,
  });
  g.rotateX(-Math.PI / 2);
  g.computeVertexNormals();
  return g;
}
// 按高度刷顶点色：越往下越暗，地块侧面就有了明暗过渡
function shadeByHeight(geo, y0, y1, dark) {
  const pos = geo.attributes.position, n = pos.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const t = Math.min(1, Math.max(0, (pos.getY(i) - y0) / (y1 - y0)));
    const v = dark + (1 - dark) * t;
    col[i * 3] = v; col[i * 3 + 1] = v; col[i * 3 + 2] = v;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

// 房子、公寓、树都是画好的图（Codex 出图，assets/sprites）；_w 是没点亮时的石膏白版本
const SPRITES = ['house0', 'house1', 'house2', 'house3', 'house4', 'house5', 'apt0', 'apt1', 'apt2', 'tree0', 'tree1', 'tree2'];

export const PALETTE = {
  // 没覆盖的街区 = 米白地块 + 白色石膏模型房子；覆盖到 = 草绿地块 + 彩色屋顶
  pave: ['#e4d3c3', '#e0cfbe', '#e7d8c9'],   // 褪色街区：暖米色，不刺眼
  ruin: '#9d9084',                              // 塌掉的格子
  lawn: ['#93d662', '#8acf58', '#9cdc6b'],
  sand: '#ecc897',
  grayWall: ['#fbf8f2', '#f7f3ec', '#fdfaf5'],
  grayRoof: ['#ece3d4', '#e8dece', '#f0e8db'],
  wall: ['#fffaf2', '#fdf4e8', '#fbf6ee'],
  roof: ['#f47b5c', '#4fb3ea', '#f6c445', '#ef6a55', '#5cc0a0'],
  sea: ['#86e8dc', '#52d6e2', '#2cc2ea', '#1eaae4', '#1b97da'],
  shallow: ['#5fd4d1', '#7ddfe0'],
  anti: '#ff6457',
  rescue: '#3e98f6',
};

export class World {
  constructor(canvas) {
    const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, stencil: true, powerPreference: 'high-performance' });
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(this.dpr);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer = renderer;

    const scene = new THREE.Scene();
    this.scene = scene;
    this.camera = new THREE.PerspectiveCamera(24, 1, 1, 300);

    // 柔和的“影棚”环境光：软胶材质的高光和暗部都靠它
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.38;
    scene.background = new THREE.Color(PALETTE.sea[2]);

    scene.add(new THREE.HemisphereLight(0xe2f4ff, 0xf2dcb8, 0.42));
    const sun = new THREE.DirectionalLight(0xfff4e6, 3.0);
    sun.position.set(-10, 20, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -14; sc.right = 14; sc.top = 14; sc.bottom = -14; sc.near = 1; sc.far = 60;
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.03;
    sun.shadow.radius = 5;
    scene.add(sun);

    this.root = new THREE.Group();
    scene.add(this.root);
    // 气泡/徽章单独一层，最后画、永远在最上面
    this.overlay = new THREE.Scene();
    this.loader = new GLTFLoader();
    this.models = {};
    this.mixers = [];
    this.clock = 0;
    this.pulses = [];
    this.bobbers = [];
    this.props = [];       // 地图上的房子/公寓/树（画好的图）
    this.propsByCell = {}; // 按格子分组：干员走进来时这一格的都要让路
    this.cellScale = {};   // 每格房子树木当前的缩放：1 = 正常，0 = 缩进地里
    this.rise = {};        // 每格地块露出水面的程度：开局界面只露中间一圈小岛，进游戏外圈再升起来
    this.ruinT = {};       // 塌掉的格子：t 1 = 完全塌下去，0 = 修好；rubble = 上面的碎石
    this.puffs = [];       // 塌的那一下扬起的灰
    this.fitR = MAP_R;     // 镜头要框住的岛半径
    this.view = { x: 0, y: 0, w: 1, h: 1 };
    this.cam = { tx: 0, tz: 0, zoom: 1, fitD: 40 };
    this.pitch = 55;
  }

  load(list) {
    const self = this, tl = new THREE.TextureLoader();
    this.sprites = {};
    const models = list.map(function (item) {
      return new Promise(function (res, rej) {
        self.loader.load(item[1], function (g) { self.models[item[0]] = g; res(); }, undefined, rej);
      });
    });
    this.shadowMats = {};
    const pics = [];
    SPRITES.forEach(function (n) { pics.push(n, n + '_w', n + '_s'); });
    return Promise.all(models.concat(pics.map(function (n) {
      return new Promise(function (res, rej) {
        tl.load('assets/sprites/' + n + '.png', function (t) {
          t.colorSpace = THREE.SRGBColorSpace;
          if (/_s$/.test(n)) {
            // 影子：模糊过的剪影平铺在地上，染成深蓝灰
            self.shadowMats[n.slice(0, -2)] = new THREE.MeshBasicMaterial({ map: t, color: 0x18344a, transparent: true, opacity: 0.4, depthWrite: false });
          } else {
            // 不走半透明排序：按像素写深度（alphaToCoverage），互相遮挡才对，边缘靠多重采样抗锯齿
            self.sprites[n] = new THREE.SpriteMaterial({ map: t, alphaToCoverage: true, toneMapped: false });
          }
          res();
        }, undefined, rej);
      });
    })));
  }

  inst(name, scale) {
    const src = this.models[name];
    const o = src.animations && src.animations.length ? cloneSkinned(src.scene) : src.scene.clone(true);
    o.traverse(function (m) {
      if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; }
    });
    if (scale) o.scale.setScalar(scale);
    return o;
  }

  buildCity(opts) {
    const self = this;
    const rand = rng(opts.seed || 7);

    // 地块：下面一截沙土（越往下越暗），上面一层圆角顶面
    const bodyGeo = shadeByHeight(hexSlab(R * 0.975, 1.0, 0.05, 2), -1.2, -0.1, 0.62);
    const body = new THREE.InstancedMesh(bodyGeo,
      new THREE.MeshStandardMaterial({ color: PALETTE.sand, roughness: 0.92, vertexColors: true }), CELLS.length);
    const capGeo = hexSlab(R * 0.955, 0.09, 0.09, 5);
    const cap = new THREE.InstancedMesh(capGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.78 }), CELLS.length);
    body.receiveShadow = true; cap.receiveShadow = true;
    const m4 = new THREE.Matrix4();
    this.tileTone = {};
    this.cellIndex = {};
    CELLS.forEach(function (c, i) {
      const p = hexToWorld(c.q, c.r);
      self.cellIndex[c.key] = i;
      m4.makeTranslation(p.x, -1.22, p.z);
      body.setMatrixAt(i, m4);
      m4.makeTranslation(p.x, -0.19, p.z);
      cap.setMatrixAt(i, m4);
      cap.setColorAt(i, new THREE.Color(PALETTE.pave[0]));
      self.tileTone[c.key] = Math.floor(rand() * 3);
    });
    this.root.add(body, cap);
    this.cap = cap; this.body = body;

    // 房子、公寓、树：按“街区”成团摆
    const reserved = opts.reserved || {};
    const score = function (c, list, reach) {
      let best = 0;
      list.forEach(function (t) { best = Math.max(best, 1 - hexDist(c, t) / reach); });
      return best;
    };
    CELLS.forEach(function (c) {
      if (reserved[c.key]) return;
      const p = hexToWorld(c.q, c.r);
      const park = score(c, opts.parks || [], 2.4), core = score(c, opts.downtown || [], 2.4);
      const roll = rand(), jx = (rand() - 0.5) * 0.12, jz = (rand() - 0.5) * 0.1;
      const tree = function (n) {
        for (let k = 0; k < n; k++) {
          const dx = n === 1 ? jx : (k ? 0.36 : -0.36), dz = n === 1 ? jz : (k ? -0.22 : 0.16);
          const big = rand() < 0.6;
          self.addProp(c, big ? 'tree0' : 'tree1', p.x + dx, p.z + dz, (n === 1 ? 1.05 : 0.86) * (big ? 1 : 0.85) + rand() * 0.06, 0.06);
        }
      };
      if (park > 0.3 && roll < 0.15 + park * 0.45) tree(1);
      else if (core > 0.45 && roll < 0.1 + core * 0.45) self.addProp(c, 'apt' + Math.floor(rand() * rand() * 3), p.x + jx * 0.5, p.z, 1.3, 0.26);
      else if (roll < 0.55) self.addProp(c, 'house' + Math.floor(rand() * 6), p.x + jx, p.z + jz, 1.5 + rand() * 0.06, 0.24);
      else if (roll < 0.61) tree(1);
      else if (roll < 0.63) self.addProp(c, 'tree2', p.x + jx * 2, p.z + jz * 2, 0.72, 0.1);
    });
    this.buildSea();
  }

  // 一张画好的图立在格子上：图的底边对着物件最靠前的墙角，往镜头方向挪 fwd，整张图都在地面以上；
  // 脚下按同一张图的剪影往右后方投一道影子（和太阳光同向）
  addProp(c, name, x, z, w, fwd) {
    const sp = new THREE.Sprite(this.sprites[name]);
    sp.center.set(0.5, 0);
    sp.position.set(x, -0.012, z + fwd * w);
    this.root.add(sp);
    if (!this.shadowGeo) {
      const g = new THREE.PlaneGeometry(1, 1);
      g.translate(0, 0.5, 0); g.rotateX(-Math.PI / 2);   // 图的底边在原点，往 -z 方向铺开
      this.shadowGeo = g;
    }
    const sm = this.shadowMats[name], simg = sm.map.image;
    const sh = new THREE.Mesh(this.shadowGeo, sm);
    sh.rotation.y = SHADOW_YAW;
    this.root.add(sh);
    const p = { cell: c, name: name, sp: sp, sh: sh, w: w, h: 0, v: 1, x: x, z: z, bx: x, bz: z + fwd * w,
      // 影子图四周各留了 24px 空白（剪影宽 96px）
      sw: w * simg.width / 96, pad: 24 / simg.height, slen: simg.height / (simg.height - 48) };
    this.props.push(p);
    (this.propsByCell[c.key] = this.propsByCell[c.key] || []).push(p);
    this.fitProp(p);
    return p;
  }
  // 按当前用的图（彩色/白色比例不一样）和缩放（让路、升起）摆好图和影子
  fitProp(p) {
    const img = p.sp.material.map.image, v = Math.max(0.001, p.v);
    p.h = p.w * img.height / img.width;
    p.sp.scale.set(p.w * v, p.h * v, 1);
    p.sp.visible = p.v > 0.01;
    const L = p.h * SHADOW_LEN * p.slen * v, back = L * p.pad;
    p.sh.scale.set(p.sw * v, 1, L);
    p.sh.position.set(p.x - SHADOW_DX * back, 0.002, p.z - SHADOW_DZ * back);   // 从占地中心投出去
    p.sh.visible = p.sp.visible;
  }

  // 海面：Codex 照参考图出的卡通海贴图（处理成了能无缝平铺），两层大小不同、往不同方向慢慢漂，光纹和闪光就会动；
  // 上面盖一层半透明浅滩（画布画，跟着露出水面的格子走），岸边一圈白浪花 + 两道往岸上推的浪线
  buildSea() {
    const big = 200, self = this, tl = new THREE.TextureLoader();
    // [每单位重复几次, x 漂速, y 漂速, 不透明度]
    this.seaLayers = [[0.11, 0.012, -0.006, 1], [0.075, -0.009, -0.011, 0.45]].map(function (L, li) {
      const t = tl.load('assets/sea/sea_cartoon.jpg');
      t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(big * L[0], big * L[0]);
      t.anisotropy = 4;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(big, big),
        new THREE.MeshBasicMaterial({ map: t, toneMapped: false, transparent: li > 0, opacity: L[3], depthWrite: li === 0 }));
      m.rotation.x = -Math.PI / 2;
      m.position.y = SEA_Y - 0.004 + li * 0.002;
      self.root.add(m);
      return { tex: t, v: [L[1], L[2]] };
    });

    const cv = document.createElement('canvas');
    cv.width = cv.height = 1024;
    this.seaCtx = cv.getContext('2d');
    const map = new THREE.CanvasTexture(cv);
    map.colorSpace = THREE.SRGBColorSpace;
    this.seaMap = map;
    const shallow = new THREE.Mesh(new THREE.PlaneGeometry(SEA_SPAN, SEA_SPAN),
      new THREE.MeshBasicMaterial({ map: map, transparent: true, depthWrite: false, toneMapped: false }));
    shallow.rotation.x = -Math.PI / 2;
    shallow.position.y = SEA_Y + 0.004;
    shallow.renderOrder = 1;
    this.root.add(shallow);

    const m4 = new THREE.Matrix4();
    const hex = new THREE.ShapeGeometry(hexShape(1.16)); hex.rotateX(-Math.PI / 2);
    const foam = new THREE.InstancedMesh(hex, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), CELLS.length);
    CELLS.forEach(function (c, i) { const p = hexToWorld(c.q, c.r); m4.makeTranslation(p.x, SEA_Y + 0.012, p.z); foam.setMatrixAt(i, m4); });
    this.root.add(foam);
    this.foam = foam;
    // 浪线：每格一片圆（先只写模板、不画颜色）挖掉里面，再画大一圈的白圆，留下一道细线；圆一起往岸边收、边收边淡
    const circle = new THREE.CircleGeometry(1, 36); circle.rotateX(-Math.PI / 2);
    this.waves = [0, 0.5].map(function (ph, li) {
      const ref = li + 1;
      const inner = new THREE.InstancedMesh(circle, new THREE.MeshBasicMaterial({
        colorWrite: false, depthWrite: false, transparent: true,
        stencilWrite: true, stencilRef: ref, stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp,
      }), CELLS.length);
      const line = new THREE.InstancedMesh(circle, new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, toneMapped: false,
        stencilWrite: true, stencilRef: ref, stencilFunc: THREE.NotEqualStencilFunc, stencilZPass: THREE.ReplaceStencilOp,
      }), CELLS.length);
      inner.renderOrder = 2 + li * 2; line.renderOrder = 3 + li * 2;
      self.root.add(inner, line);
      return { inner: inner, line: line, ph: ph, y: SEA_Y + 0.008 + li * 0.001 };
    });
    this.drawSea();
  }
  stepWaves(dt) {
    const self = this, m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), sc = new THREE.Vector3();
    this.seaLayers.forEach(function (L) { L.tex.offset.x += dt * L.v[0]; L.tex.offset.y += dt * L.v[1]; });
    this.waves.forEach(function (w) {
      const s = (self.clock / 4.2 + w.ph) % 1;
      const r = 1.85 - 0.62 * s, lw = 0.035 + 0.05 * s;
      w.line.material.opacity = Math.pow(Math.sin(Math.PI * s), 1.2) * 0.6;
      CELLS.forEach(function (c, i) {
        const rr = self.rise[c.key], f = Math.max(0.001, Math.min(1, ((rr ? rr.t : 1) - 0.3) / 0.4));
        const p = hexToWorld(c.q, c.r);
        m4.compose(pos.set(p.x, w.y, p.z), q, sc.set((r - lw) * f, 1, (r - lw) * f)); w.inner.setMatrixAt(i, m4);
        m4.compose(pos.set(p.x, w.y, p.z), q, sc.set(r * f, 1, r * f)); w.line.setMatrixAt(i, m4);
      });
      w.inner.instanceMatrix.needsUpdate = true; w.line.instanceMatrix.needsUpdate = true;
    });
  }
  // 浅滩：每块露出水面的地块周围晕开一圈半透明浅青，连成岛边的浅滩（下面的海浪还看得见）
  drawSea() {
    const g = this.seaCtx, S = g.canvas.width, k = S / SEA_SPAN, self = this;
    g.clearRect(0, 0, S, S);
    [[3.1, PALETTE.sea[0], 0.55], [1.95, PALETTE.shallow[1], 0.8]].forEach(function (L) {
      CELLS.forEach(function (c) {
        const r = self.rise[c.key], w = r ? r.t : 1;
        if (w < 0.02) return;
        const p = hexToWorld(c.q, c.r), x = (p.x + SEA_SPAN / 2) * k, y = (p.z + SEA_SPAN / 2) * k, rad = L[0] * k;
        const gr = g.createRadialGradient(x, y, 0, x, y, rad);
        gr.addColorStop(0, rgba(L[1], L[2])); gr.addColorStop(0.5, rgba(L[1], L[2])); gr.addColorStop(1, rgba(L[1], 0));
        g.globalAlpha = w; g.fillStyle = gr;
        g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
      });
    });
    g.globalAlpha = 1;
    this.seaMap.needsUpdate = true;
  }

  // 岛露出水面的半径：开局界面是小岛，进游戏后外圈一圈圈从海里升起来
  setIsland(rad, animate) {
    const self = this, from = this.islandR == null ? MAP_R : this.islandR;
    CELLS.forEach(function (c) {
      const d = hexDist(c, { q: 0, r: 0 }), want = d <= rad ? 1 : 0;
      let r = self.rise[c.key];
      if (!r) { if (want === 1) return; r = self.rise[c.key] = { t: 1, want: 1, delay: 0 }; }
      r.want = want;
      if (!animate) r.t = want;
      r.delay = animate && want ? Math.max(0, d - from - 1) * 0.14 + Math.random() * 0.06 : 0;
      r.force = true;
    });
    this.islandR = rad;
    this.fitR = rad;
    this._hull = null;
  }

  // 按覆盖情况上色：覆盖到的地方恢复颜色，其余是灰的；tint = 事件/环境给地块的染色
  paint(state) {
    const self = this;
    const lawn = state.lawn || {}, tint = state.tint || {}, ruins = state.ruins || {};
    CELLS.forEach(function (c, i) {
      const tone = self.tileTone[c.key];
      let col = new THREE.Color(ruins[c.key] ? PALETTE.ruin : lawn[c.key] ? PALETTE.lawn[tone] : PALETTE.pave[tone]);
      if (tint[c.key]) col = col.lerp(new THREE.Color(tint[c.key][0]), tint[c.key][1]);
      self.cap.setColorAt(i, col);
    });
    this.cap.instanceColor.needsUpdate = true;
    const sprites = this.sprites;
    this.props.forEach(function (p) {
      const mat = sprites[lawn[p.cell.key] ? p.name : p.name + '_w'];
      if (p.sp.material !== mat) { p.sp.material = mat; self.fitProp(p); }
    });
  }

  makeCloud(x, y, z, s, mat) {
    const g = new THREE.Group();
    const geo = new THREE.SphereGeometry(1, 24, 16);
    [[0, 0, 0, 1], [1.15, -0.2, 0.25, 0.78], [-1.15, -0.25, 0.1, 0.72], [0.45, 0.5, -0.3, 0.72], [-0.5, 0.35, 0.45, 0.62], [1.9, -0.45, -0.1, 0.5], [-1.9, -0.5, 0.3, 0.48]].forEach(function (b) {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(b[0], b[1], b[2]); m.scale.setScalar(b[3]);
      g.add(m);
    });
    g.position.set(x, y, z); g.scale.setScalar(s);
    g.scale.y *= 0.72;
    this.bobbers.push({ o: g, base: y, amp: 0.15, speed: 0.4 + Math.random() * 0.2, ph: Math.random() * 6 });
    return g;
  }

  // 事件：区域上一层会呼吸的光 + 头顶气泡。返回句柄，事件结束时 remove
  addEvent(ev) {
    const col = new THREE.Color(ev.type === 'anti' ? PALETTE.anti : PALETTE.rescue);
    const group = new THREE.Group();
    const glowGeo = new THREE.ShapeGeometry(hexShape(R * 0.93));
    glowGeo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.35, depthWrite: false });
    CELLS.forEach(function (c) {
      if (hexDist(c, ev) > ev.radius) return;
      const p = hexToWorld(c.q, c.r);
      const m = new THREE.Mesh(glowGeo, mat);
      m.position.set(p.x, 0.004, p.z);
      m.renderOrder = 2;
      group.add(m);
    });
    const p = hexToWorld(ev.q, ev.r);
    const bubble = this.bubble(ev.type);
    bubble.position.set(p.x, 1.8, p.z);
    bubble.userData.eventId = ev.id;
    this.overlay.add(bubble);
    this.root.add(group);
    const pulse = { mat: mat, base: 0.3, amp: 0.13, speed: 2.2 };
    const bob = { o: bubble, base: 1.8, amp: 0.08, speed: 2, ph: Math.random() * 6 };
    this.pulses.push(pulse); this.bobbers.push(bob);
    const self = this;
    return {
      group: group, bubble: bubble,
      remove: function () {
        self.root.remove(group);
        self.overlay.remove(bubble);
        self.pulses.splice(self.pulses.indexOf(pulse), 1);
        self.bobbers.splice(self.bobbers.indexOf(bob), 1);
      },
    };
  }

  bubble(kind) {
    const cv = document.createElement('canvas');
    cv.width = 192; cv.height = 224;
    const g = cv.getContext('2d');
    const COL = { anti: ['#ff8478', '#ef4b42'], rescue: ['#64b8ff', '#2f86f0'], civic: ['#6fd08a', '#3fae5f'],
      coop: ['#ffd66b', '#f2a93b'], jam: ['#a99be0', '#7461c4'], block: ['#ffae6b', '#ee7d3a'], blackout: ['#8b93a5', '#555d70'],
      'ai-event': ['#b59cf3', '#7b58d8'], 'ai-none': ['#aab3c3', '#6f7a8e'], 'ai-civic': ['#6fd08a', '#3fae5f'] }[kind];
    const main = COL[1];
    g.fillStyle = 'rgba(70,40,20,0.18)';
    g.beginPath(); g.ellipse(96, 206, 34, 9, 0, 0, 7); g.fill();
    g.fillStyle = '#ffffff';
    g.beginPath(); g.arc(96, 86, 78, 0, 7); g.fill();
    g.beginPath(); g.moveTo(74, 150); g.lineTo(96, 186); g.lineTo(118, 150); g.fill();
    const grd = g.createLinearGradient(0, 20, 0, 150);
    grd.addColorStop(0, COL[0]);
    grd.addColorStop(1, main);
    g.fillStyle = grd;
    g.beginPath(); g.arc(96, 86, 64, 0, 7); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.beginPath(); g.ellipse(76, 50, 26, 12, -0.5, 0, 7); g.fill();
    g.fillStyle = '#fff';
    if (kind === 'anti') {
      roundRect(g, 85, 38, 22, 58, 11); g.fill();
      g.beginPath(); g.arc(96, 116, 12, 0, 7); g.fill();
    } else if (kind === 'rescue') {
      g.save(); g.translate(96, 88); g.scale(3.4, 3.4); g.translate(-12, -12);
      g.fill(new Path2D('M12 1.5c.7 3.6 6.5 7 6.5 13.4 0 4-2.9 7.4-6.5 7.4s-6.5-3.4-6.5-7.4c0-2.9 1.3-4.9 2.7-6.3.2 2 1.1 3.4 2.5 3.8C10.2 8.6 11.1 4.6 12 1.5z'));
      g.restore();
    } else if (kind === 'civic') {
      roundRect(g, 84, 44, 24, 84, 6); g.fill();
      roundRect(g, 54, 74, 84, 24, 6); g.fill();
    } else if (kind === 'coop') {
      // 两颗挨着的心
      g.save(); g.translate(96, 90); g.scale(2.5, 2.5); g.translate(-16, -16);
      g.fill(new Path2D('M16 27.5C9 22.6 3.5 18.2 3.5 11.6 3.5 7.6 6.6 4.8 10.2 4.8c2.5 0 4.6 1.3 5.8 3.3 1.2-2 3.3-3.3 5.8-3.3 3.6 0 6.7 2.8 6.7 6.8 0 6.6-5.5 11-12.5 15.9z'));
      g.restore();
    } else if (kind === 'jam') {
      // 信号波纹 + 斜杠
      g.strokeStyle = '#fff'; g.lineCap = 'round'; g.lineWidth = 11;
      [22, 40].forEach(function (rr) { g.beginPath(); g.arc(96, 112, rr, Math.PI * 1.22, Math.PI * 1.78); g.stroke(); });
      g.beginPath(); g.arc(96, 112, 8, 0, 7); g.fill();
      g.lineWidth = 10; g.beginPath(); g.moveTo(62, 48); g.lineTo(130, 124); g.stroke();
    } else if (kind === 'block') {
      // 路障
      roundRect(g, 50, 66, 92, 34, 8); g.fill();
      g.fillStyle = main;
      [62, 92, 122].forEach(function (x) { g.beginPath(); g.moveTo(x - 8, 66); g.lineTo(x + 8, 66); g.lineTo(x - 4, 100); g.lineTo(x - 20, 100); g.closePath(); g.fill(); });
      g.fillStyle = '#fff';
      roundRect(g, 60, 100, 12, 26, 4); g.fill(); roundRect(g, 120, 100, 12, 26, 4); g.fill();
    } else if (/^ai-/.test(kind)) {
      g.font = '900 66px "PingFang SC", "Helvetica Neue", Arial, sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('AI', 96, 92);
    } else {
      // 闪电
      g.fill(new Path2D('M104 34 64 98h28l-8 52 44-70h-30z'));
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    sp.scale.set(1.7, 1.7 * 224 / 192, 1);
    sp.center.set(0.5, 0.08);
    sp.renderOrder = 10;
    return sp;
  }

  // 环境区块：头顶一个徽章；通信干扰/停电再加一朵乌云
  addEnv(env, kind) {
    const p = hexToWorld(env.q, env.r);
    const g = new THREE.Group();
    const b = this.bubble(kind);
    b.scale.multiplyScalar(/^ai-/.test(kind) ? 0.95 : 0.72);   // AI 属地是大区块，标大一点
    b.position.set(p.x, 1.25, p.z);
    b.userData.envId = env.id;
    g.add(b);
    this.overlay.add(g);
    const bob = { o: b, base: 1.25, amp: 0.05, speed: 1.3, ph: env.id };
    this.bobbers.push(bob);
    const cloud = (kind === 'jam' || kind === 'blackout') ? this.addWeather(env) : null;
    const self = this;
    return { remove: function () { self.overlay.remove(g); self.bobbers.splice(self.bobbers.indexOf(bob), 1); if (cloud) cloud.remove(); } };
  }

  addWeather(env) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x8f929b, roughness: 1 });
    const p = hexToWorld(env.q, env.r);
    const g = new THREE.Group();
    const geo = new THREE.SphereGeometry(1, 20, 14);
    [[0, 0, 0, 1], [1, -0.1, 0.3, 0.8], [-1, -0.15, 0.2, 0.78], [0.3, 0.5, -0.2, 0.7], [-0.4, 0.2, 0.7, 0.6], [0.6, 0.1, -0.8, 0.6]].forEach(function (b) {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(b[0], b[1], b[2]); m.scale.setScalar(b[3]);
      m.castShadow = true;
      g.add(m);
    });
    g.scale.set(0.95, 0.62, 0.95);
    g.position.set(p.x, 2.4, p.z);
    this.root.add(g);
    const bob = { o: g, base: 2.4, amp: 0.1, speed: 0.8, ph: 1 };
    this.bobbers.push(bob);
    const self = this;
    return { remove: function () { self.root.remove(g); self.bobbers.splice(self.bobbers.indexOf(bob), 1); } };
  }

  // 民生设施：中心一个小喷泉 + 绿色气泡
  addFacility(cell) {
    const g = new THREE.Group();
    const b = this.inst('fountain', 0.3);
    const bub = this.bubble('civic');
    bub.scale.multiplyScalar(0.8);
    g.add(b);
    this.root.add(g);
    this.overlay.add(bub);
    const bob = { o: bub, base: 1.3, amp: 0.06, speed: 1.6, ph: 2 };
    this.bobbers.push(bob);
    const self = this;
    const move = function (c) { const pp = hexToWorld(c.q, c.r); b.position.set(pp.x, -0.11, pp.z); bub.position.set(pp.x, 1.3, pp.z); };
    move(cell);
    return { group: g, move: move, remove: function () { self.root.remove(g); self.overlay.remove(bub); self.bobbers.splice(self.bobbers.indexOf(bob), 1); } };
  }

  addAgent(opt) {
    const o = this.inst(opt.model, 1.9);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.53, 0.1, 40),
      new THREE.MeshStandardMaterial({ color: opt.color, roughness: 0.45 }));
    base.position.y = 0.05;
    base.castShadow = true; base.receiveShadow = true;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.66, 0.055, 10, 56), new THREE.MeshBasicMaterial({ color: opt.color }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04;
    ring.visible = false;
    const sel = new THREE.Mesh(new THREE.RingGeometry(0.64, 0.84, 48), new THREE.MeshBasicMaterial({ color: 0x3c95f4, transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false }));
    sel.rotation.x = -Math.PI / 2; sel.position.y = 0.03; sel.visible = false;
    // 选中时头顶一个上下跳的蓝箭头，一眼看出选的是谁
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.5, 24), new THREE.MeshStandardMaterial({ color: 0x3c95f4, roughness: 0.4 }));
    arrow.rotation.x = Math.PI; arrow.visible = false;
    const g = new THREE.Group();
    g.add(base, o, ring, sel, arrow);
    o.position.y = 0.1;
    const arrowY = new THREE.Box3().setFromObject(o).max.y + 0.5;
    arrow.position.y = arrowY;
    g.position.y = -0.11;
    this.root.add(g);
    const src = this.models[opt.model];
    const mixer = new THREE.AnimationMixer(o);
    const actions = {};
    ['idle', 'walk', 'interact-right', 'emote-yes', 'emote-no'].forEach(function (n) {
      const clip = THREE.AnimationClip.findByName(src.animations, n);
      if (clip) actions[n] = mixer.clipAction(clip);
    });
    let current = null;
    const play = function (n) {
      if (current === n || !actions[n]) return;
      const next = actions[n];
      next.reset().play();
      if (current && actions[current]) actions[current].crossFadeTo(next, 0.2, false);
      current = n;
    };
    play('idle');
    this.mixers.push(mixer);
    // pace：走路动画的快慢倍数（跟着实际移动速度调，免得脚在地上滑）
    const pace = function (k) { if (actions.walk) actions.walk.timeScale = k; };
    return { group: g, body: o, ring: ring, sel: sel, arrow: arrow, arrowY: arrowY, base: base, play: play, pace: pace };
  }

  // 路径白点
  pathDots(points) {
    const g = new THREE.Group();
    const geo = new THREE.SphereGeometry(0.075, 12, 8);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i], b = points[i + 1];
      for (let k = 0; k < 3; k++) {
        const t = (k + 0.5) / 3;
        const m = new THREE.Mesh(geo, mat);
        m.position.set(a.x + (b.x - a.x) * t, 0.06, a.z + (b.z - a.z) * t);
        g.add(m);
      }
    }
    this.root.add(g);
    const self = this;
    return { remove: function () { self.root.remove(g); } };
  }

  // 高亮几格（可部署的外圈等）
  highlight(cells, color) {
    if (this._hl) { this.root.remove(this._hl.g); this.pulses.splice(this.pulses.indexOf(this._hl.p), 1); this._hl = null; }
    if (!cells || !cells.length) return;
    const g = new THREE.Group();
    const geo = new THREE.RingGeometry(R * 0.6, R * 0.78, 6, 1);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: color || 0xffffff, transparent: true, opacity: 0.85, depthWrite: false });
    cells.forEach(function (c) {
      const p = hexToWorld(c.q, c.r);
      const m = new THREE.Mesh(geo, mat);
      m.position.set(p.x, 0.012, p.z);
      g.add(m);
    });
    this.root.add(g);
    const pulse = { mat: mat, base: 0.6, amp: 0.3, speed: 4 };
    this.pulses.push(pulse);
    this._hl = { g: g, p: pulse };
  }

  // ---------- 镜头 ----------
  resize(w, h, view) {
    const cur = { d: this.cam.fitD, cy: this._fitCy, v: this.view, z: this.cam.zoom, p: this.pitch };
    this.w = w; this.h = h; this.view = view;
    if (this.pitchWant) this.pitch = this.pitchWant;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.cam.fitD = this.fitDistance();
    if (!this.cam.inited) { this.cam.zoom = this.defaultZoom || 1; this.cam.inited = true; }
    const to = { d: this.cam.fitD, cy: this._fitCy, v: view, z: this.cam.zoom, p: this.pitch };
    // glideNext：这次换镜头要平滑过去（开局界面 → 游戏）
    if (this.glideNext && cur.v.w > 1) { this.glide = { from: cur, to: to, t: 0 }; this.glideNext = false; }
    else if (this.glide) this.glide.to = to;
    if (this.glide) this.stepGlide(0); else this.applyCamera();
  }
  stepGlide(dt) {
    const g = this.glide;
    g.t = Math.min(1, g.t + dt / 1.1);
    const k = g.t < 0.5 ? 2 * g.t * g.t : 1 - Math.pow(-2 * g.t + 2, 2) / 2;
    const L = function (a, b) { return a + (b - a) * k; };
    this.cam.fitD = L(g.from.d, g.to.d); this._fitCy = L(g.from.cy, g.to.cy); this.cam.zoom = L(g.from.z, g.to.z); this.pitch = L(g.from.p, g.to.p);
    this.view = { x: L(g.from.v.x, g.to.v.x), y: L(g.from.v.y, g.to.v.y), w: L(g.from.v.w, g.to.v.w), h: L(g.from.v.h, g.to.v.h) };
    if (g.t >= 1) { this.view = g.to.v; this.glide = null; }
    this.applyCamera();
  }
  fitDistance() {
    const cam = this.camera, w = this.w, h = this.h, view = this.view;
    const pitch = this.pitch * Math.PI / 180;
    if (!this._hull) {
      const pts = [], fitR = this.fitR;
      CELLS.forEach(function (c) {
        if (hexDist(c, { q: 0, r: 0 }) !== fitR) return;
        const p = hexToWorld(c.q, c.r);
        for (let i = 0; i < 6; i++) {
          const a = Math.PI / 3 * i;
          pts.push(new THREE.Vector3(p.x + Math.cos(a) * R, 0.0, p.z + Math.sin(a) * R));
          pts.push(new THREE.Vector3(p.x + Math.cos(a) * R, -1.2, p.z + Math.sin(a) * R));
        }
      });
      this._hull = pts;
    }
    const pts = this._hull, v = new THREE.Vector3();
    const measure = function (d) {
      cam.position.set(0, Math.sin(pitch) * d, Math.cos(pitch) * d);
      cam.lookAt(0, 0, 0);
      cam.clearViewOffset();
      cam.updateMatrixWorld(); cam.updateProjectionMatrix();
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      pts.forEach(function (p) { v.copy(p).project(cam); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); });
      return { w: (x1 - x0) / 2 * w, h: (y1 - y0) / 2 * h, cy: (y0 + y1) / 2 };
    };
    let lo = 5, hi = 300;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2, b = measure(mid);
      if (b.w <= view.w * 0.97 && b.h <= view.h * 0.97) hi = mid; else lo = mid;
    }
    this._fitCy = measure(hi).cy;
    return hi;
  }
  applyCamera() {
    const cam = this.camera, c = this.cam;
    const pitch = this.pitch * Math.PI / 180;
    // 放大后才能拖，最多拖到地图边缘
    const lim = (1 - 1 / c.zoom) * 10.5;
    c.tx = Math.max(-lim, Math.min(lim, c.tx));
    c.tz = Math.max(-lim * 1.1, Math.min(lim * 1.1, c.tz));
    const d = c.fitD / c.zoom;
    cam.position.set(c.tx, Math.sin(pitch) * d, c.tz + Math.cos(pitch) * d);
    cam.lookAt(c.tx, 0, c.tz);
    const w = this.w, h = this.h, view = this.view;
    const wantX = view.x + view.w / 2, wantY = view.y + view.h / 2;
    const fixY = (1 - this._fitCy) / 2 * h - h / 2;
    cam.setViewOffset(w, h, w / 2 - wantX, h / 2 - wantY + fixY / c.zoom, w, h);
    cam.updateProjectionMatrix();
  }
  pan(dxPx, dyPx) {
    const c = this.cam;
    const k = (c.fitD / c.zoom) * Math.tan(this.camera.fov * Math.PI / 360) * 2 / this.h;
    c.tx -= dxPx * k;
    c.tz -= dyPx * k / Math.sin(this.pitch * Math.PI / 180);
    this.applyCamera();
  }
  zoomBy(f) {
    this.cam.zoom = Math.max(1, Math.min(2.4, this.cam.zoom * f));
    this.applyCamera();
  }

  // 世界坐标 → 屏幕像素（界面飘字用）
  screenOf(x, y, z) {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    return { x: (v.x + 1) / 2 * this.w, y: (1 - v.y) / 2 * this.h };
  }

  // 屏幕坐标 → 事件气泡 / 格子
  pick(px, py) {
    const ndc = new THREE.Vector2(px / this.w * 2 - 1, -(py / this.h) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const sprites = [];
    this.overlay.traverse(function (o) { if (o.isSprite && (o.userData.eventId || o.userData.envId)) sprites.push(o); });
    const hit = ray.intersectObjects(sprites, false);
    if (hit.length) return hit[0].object.userData.eventId ? { eventId: hit[0].object.userData.eventId } : { envId: hit[0].object.userData.envId };
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0.1);
    const p = new THREE.Vector3();
    if (!ray.ray.intersectPlane(plane, p)) return null;
    const c = worldToHex(p.x, p.z);
    if (hexDist(c, { q: 0, r: 0 }) > MAP_R) return null;
    return { cell: c };
  }

  cellFree(key) { return !(this.propsByCell[key] || []).length; }
  // 地图破坏：塌掉的格子下沉、微微歪斜、颜色变暗（paint 里），上面散几块碎石；修好时反着来
  setRuins(ruins) {
    const self = this;
    Object.keys(ruins).forEach(function (k) {
      if (!self.ruinT[k]) { self.ruinT[k] = { t: 0, want: 1, rubble: self.makeRubble(k) }; self.dust(k); }
      self.ruinT[k].want = 1;
    });
    Object.keys(this.ruinT).forEach(function (k) { if (!ruins[k]) self.ruinT[k].want = 0; });
  }
  makeRubble(k) {
    const i = this.cellIndex[k], p = hexToWorld(CELLS[i].q, CELLS[i].r);
    if (!this.rubbleGeo) {
      this.rubbleGeo = new THREE.DodecahedronGeometry(1, 0);
      this.rubbleMat = [new THREE.MeshStandardMaterial({ color: 0xb3a597, roughness: 0.95, flatShading: true }),
        new THREE.MeshStandardMaterial({ color: 0x8f8377, roughness: 0.95, flatShading: true })];
    }
    const g = new THREE.Group(), rr = rng(i * 7 + 3);
    for (let n = 0; n < 6; n++) {
      const m = new THREE.Mesh(this.rubbleGeo, this.rubbleMat[n % 2]);
      const a = rr() * Math.PI * 2, d = 0.12 + rr() * 0.5, sz = 0.1 + rr() * 0.12;
      m.position.set(Math.cos(a) * d, sz * 0.6, Math.sin(a) * d);
      m.scale.set(sz * 1.3, sz, sz);
      m.rotation.set(rr() * 3, rr() * 3, rr() * 3);
      m.castShadow = true;
      g.add(m);
    }
    g.position.set(p.x, -0.32, p.z);
    g.scale.setScalar(0.001);
    this.root.add(g);
    return g;
  }
  dust(k) {
    const i = this.cellIndex[k], p = hexToWorld(CELLS[i].q, CELLS[i].r);
    if (!this.puffGeo) this.puffGeo = new THREE.SphereGeometry(1, 14, 10);
    const mat = new THREE.MeshStandardMaterial({ color: 0xe2d9ce, roughness: 1, transparent: true, opacity: 0.9, depthWrite: false });
    const g = new THREE.Group();
    for (let n = 0; n < 7; n++) {
      const m = new THREE.Mesh(this.puffGeo, mat), a = n / 7 * Math.PI * 2;
      m.userData.dir = new THREE.Vector3(Math.cos(a), 0.35 + (n % 3) * 0.2, Math.sin(a));
      g.add(m);
    }
    g.position.set(p.x, 0.05, p.z);
    this.root.add(g);
    this.puffs.push({ g: g, mat: mat, t: 0 });
  }
  // 干员所在/将要进入的格子：房子树木缩进地里让路，人走了再弹回来（避免穿模）
  clearCells(keys) {
    const self = this;
    Object.keys(keys).forEach(function (k) {
      if (!self.cellScale[k]) self.cellScale[k] = { t: 1, want: 1 };
    });
    Object.keys(this.cellScale).forEach(function (k) { self.cellScale[k].want = keys[k] ? 0 : 1; });
  }
  // 每格动画：rise = 地块升出水面（房子树木随后弹出来），yield = 干员进格时房子让路
  stepCells(dt) {
    const self = this;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), sc = new THREE.Vector3(), pos = new THREE.Vector3();
    let tiles = false;
    const ks = {};
    [this.cellScale, this.rise, this.ruinT].forEach(function (o) { Object.keys(o).forEach(function (k) { ks[k] = true; }); });
    Object.keys(ks).forEach(function (k) {
      const y = self.cellScale[k], r = self.rise[k], u = self.ruinT[k];
      let moved = false;
      if (u && u.t !== u.want) {
        u.t = u.want > u.t ? Math.min(1, u.t + dt * 2.4) : Math.max(0, u.t - dt * 1.5);
        moved = true; tiles = true;
      }
      if (y && y.t !== y.want) {
        y.t = y.want > y.t ? Math.min(1, y.t + dt * 3.2) : Math.max(0, y.t - dt * 7);
        moved = true;
      }
      if (r && (r.t !== r.want || r.force)) {
        if (r.delay > 0) r.delay -= dt;
        else r.t = r.want > r.t ? Math.min(1, r.t + dt * 1.9) : Math.max(0, r.t - dt * 3);
        r.force = false;
        moved = true; tiles = true;
      }
      if (!moved) return;
      // 缩下去用加速，弹回来带一点回弹
      const yv = y ? (y.want > 0 ? backOut(y.t) : y.t * y.t) : 1;
      const rt = r ? r.t : 1;
      const hv = r ? (rt <= 0.45 ? 0 : backOut((rt - 0.45) / 0.55)) : 1;
      const v = Math.max(0.001, yv * hv);
      (self.propsByCell[k] || []).forEach(function (p) { p.v = v; self.fitProp(p); });
      if (r || u) {
        // 地块从水下升上来，冒出水面时略微冲高一点再落稳；塌掉的再往下沉一截、歪一点
        const i = self.cellIndex[k], p = hexToWorld(CELLS[i].q, CELLS[i].r);
        const lift = r ? (r.want > 0 ? softBack(rt) : rt) - 1 : 0;
        const ut = u ? (u.want > 0 ? backOut(u.t) : u.t) : 0;
        const dy = lift * 2.0 - 0.3 * ut;
        if (u) q.setFromAxisAngle(up.set(Math.cos(i * 2.3), 0, Math.sin(i * 2.3)), 0.1 * ut); else q.identity();
        sc.set(1, 1, 1);
        m4.compose(pos.set(p.x, -1.22 + dy, p.z), q, sc); self.body.setMatrixAt(i, m4);
        m4.compose(pos.set(p.x, -0.19 + dy, p.z), q, sc); self.cap.setMatrixAt(i, m4);
        if (u) u.rubble.scale.setScalar(Math.max(0.001, ut));
        if (r) {
          const f = Math.max(0.001, Math.min(1, (rt - 0.3) / 0.4));
          m4.compose(pos.set(p.x, SEA_Y + 0.012, p.z), q.identity(), sc.set(f, 1, f)); self.foam.setMatrixAt(i, m4);
        }
      }
      if (y && y.t === 1 && y.want === 1) delete self.cellScale[k];
      if (r && r.t === 1 && r.want === 1) delete self.rise[k];
      if (u && u.t === 0 && u.want === 0) { self.root.remove(u.rubble); delete self.ruinT[k]; }
    });
    if (tiles) {
      this.body.instanceMatrix.needsUpdate = true; this.cap.instanceMatrix.needsUpdate = true; this.foam.instanceMatrix.needsUpdate = true;
      this.drawSea();
    }
  }

  tick(dt) {
    this.stepCells(dt);
    if (this.glide) this.stepGlide(dt);
    if (this.seaLayers) this.stepWaves(dt);
    this.clock += dt;
    const t = this.clock;
    this.mixers.forEach(function (m) { m.update(dt); });
    this.pulses.forEach(function (p) { p.mat.opacity = p.base + Math.sin(t * p.speed) * p.amp; });
    this.bobbers.forEach(function (b) { b.o.position.y = b.base + Math.sin(t * b.speed + (b.ph || 0)) * b.amp; });
    const self = this;
    this.puffs = this.puffs.filter(function (pf) {
      pf.t += dt / 0.9;
      if (pf.t >= 1) { self.root.remove(pf.g); pf.mat.dispose(); return false; }
      const e = 1 - Math.pow(1 - pf.t, 3);
      pf.g.children.forEach(function (m) { m.position.copy(m.userData.dir).multiplyScalar(0.85 * e); m.scale.setScalar(0.16 + 0.3 * e); });
      pf.mat.opacity = 0.9 * (1 - pf.t);
      return true;
    });
    this.renderer.render(this.scene, this.camera);
    this.renderer.autoClear = false;
    this.renderer.render(this.overlay, this.camera);
    this.renderer.autoClear = true;
  }

  // 把角色拍成透明底头像（给界面卡片用）
  portrait(model, size, opts) {
    opts = opts || {};
    const scene = new THREE.Scene();
    scene.environment = this.scene.environment;
    scene.environmentIntensity = 0.6;
    scene.add(new THREE.HemisphereLight(0xffffff, 0xd9c8b0, 1.4));
    const key = new THREE.DirectionalLight(0xfff3e0, 2.0);
    key.position.set(-2, 3, 4);
    scene.add(key);
    const o = this.inst(model, 1);
    const src = this.models[model];
    if (src.animations && src.animations.length) {
      const mixer = new THREE.AnimationMixer(o);
      const clip = THREE.AnimationClip.findByName(src.animations, opts.anim || 'idle');
      if (clip) { mixer.clipAction(clip).play(); mixer.update(opts.t || 0.3); }
    }
    o.rotation.y = opts.yaw == null ? 0.35 : opts.yaw;
    scene.add(o);
    const cam = new THREE.PerspectiveCamera(22, 1, 0.1, 20);
    cam.position.set(0, opts.camY || 0.62, opts.dist || 2.1);
    cam.lookAt(0, opts.lookY || 0.5, 0);
    const rt = new THREE.WebGLRenderTarget(size, size, { samples: 4 });
    rt.texture.colorSpace = THREE.SRGBColorSpace;
    const r = this.renderer;
    const prev = r.getRenderTarget();
    r.setRenderTarget(rt);
    r.setClearColor(0x000000, 0);
    r.clear();
    r.render(scene, cam);
    const buf = new Uint8Array(size * size * 4);
    r.readRenderTargetPixels(rt, 0, 0, size, size, buf);
    r.setRenderTarget(prev);
    rt.dispose();
    const cv = document.createElement('canvas');
    cv.width = size; cv.height = size;
    const g = cv.getContext('2d');
    const img = g.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      const s = (size - 1 - y) * size * 4;
      img.data.set(buf.subarray(s, s + size * 4), y * size * 4);
    }
    g.putImageData(img, 0, 0);
    return cv.toDataURL('image/png');
  }
}

function backOut(t) { const c = 1.9; t -= 1; return 1 + (c + 1) * t * t * t + c * t * t; }
function softBack(t) { const c = 1.1; t -= 1; return 1 + (c + 1) * t * t * t + c * t * t; }
function rgba(hex, a) { const n = parseInt(hex.slice(1), 16); return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')'; }
function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y);
  g.closePath();
}
