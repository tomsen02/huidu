// 游戏主循环：规则状态（sim）→ 3D 画面（world）+ 界面（DOM）。点干员、点地图、点事件都在这里接。
import { World, hexToWorld, hexDist, MAP_R } from './world.js';
import * as S from './sim.js';
import { ICON } from './icons.js';
import { Guide } from './guide.js';

const canvas = document.getElementById('world');
const ui = document.getElementById('ui');
const world = new World(canvas);

const A = 'assets/';
const MODELS = [
  ['fountain', A + 'park/fountain.gltf'],
];
// 干员外观：模型、底座颜色、卡片底色
const LOOK = {
  lindeng: { model: 'character-male-e', color: '#7fcf8a', bg: '#dff3dc' },
  lishi: { model: 'character-female-b', color: '#ffa25a', bg: '#ffe6cf' },
  k09: { model: 'character-male-c', color: '#5aa9ff', bg: '#d9ecff' },
  linghao: { model: 'character-male-a', color: '#b48cf0', bg: '#ece2fb' },
  shouye: { model: 'character-male-d', color: '#6d7488', bg: '#e3e6ee' },
  wenzhou: { model: 'character-female-c', color: '#f0c04a', bg: '#fbf0cf' },
  heng: { model: 'character-male-f', color: '#4cc3c0', bg: '#d8f3f1' },
  chisun: { model: 'character-female-d', color: '#ef6a5e', bg: '#fde0dc' },
  bailu: { model: 'character-female-a', color: '#f28bb5', bg: '#fde3ee' },
};
Object.keys(LOOK).forEach(function (id) { MODELS.push([LOOK[id].model, A + 'chars/' + LOOK[id].model + '.glb']); });

const ENV_KIND = { coop: 'coop', jam: 'jam', block: 'block', blackout: 'blackout' };
const ENV_TINT = { coop: ['#ffd66b', 0.38], jam: ['#8f80d0', 0.32], block: ['#f3a160', 0.34], blackout: ['#5b6273', 0.4] };
// AI 属地：事件区偏紫，都不算偏冷灰；民生区直接是绿地
const AI_TINT = { event: ['#8d6fe0', 0.42], none: ['#9aa3b5', 0.3] };
const AI_HINT = { event: '算进事件覆盖：全城被事件盖满就输', none: '暂时既不算事件，也不算民生', civic: '算进民生覆盖和发展度' };
const TRAIT_SHORT = { 实验体: '验', 生物兵器: '兵', 机械体: '械', 恶徒: '恶', 榜样: '榜', 大亨: '商', 都市英雄: '侠', 隐士: '隐', 老练: '练', 全能: '全' };

// ---------- 存档 ----------
const SAVE_KEY = 'huidu-save-v1';
const store = {
  get() { try { return JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { return null; } },
  set(G) { try { const c = Object.assign({}, G, { fx: [] }); localStorage.setItem(SAVE_KEY, JSON.stringify(c)); } catch (e) { /* 存不了就算了 */ } },
  clear() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* */ } },
};
const params = new URLSearchParams(location.search);
const newSeed = () => Number(params.get('seed')) || (Date.now() % 100000);
// ?new：开发用，直接开新局、不进开局界面和引导
const DEV_NEW = params.has('new');
const saved = store.get();
const hasSave = !!(saved && saved.v === 1 && saved.phase !== 'ended');
let G = DEV_NEW || !hasSave ? S.create(newSeed()) : saved;
let titleOn = !DEV_NEW;
const TITLE_R = 4;   // 开局界面露出的小岛半径

// 界面状态（不进存档）
const V = { sel: null, focus: null, placing: null, paused: false, speed: 1, tab: 'research', toast: null, toastT: 0, skipArm: 0, newArm: 0 };
const vis = { events: {}, envs: {}, facs: {}, agents: {}, path: null, pathKey: '', paintKey: '', hlKey: '', ai: null, aiKey: '', ruinKey: '' };
// ?new&try=ruin / ?new&try=ai：开发试玩，一打开就在要看的东西跟前
const TRY = DEV_NEW && params.get('try');
if (TRY === 'ruin') {
  // 一起会塌路的事件在正中间，K-09 正从下往上穿过它旁边
  G.events = [{ id: G.nextId++, type: 'rescue', name: '危楼搜救', level: 3, danger: 2, diff: 4, radius: 1, q: 0, r: 0, segs: S.SEGS[2], ok: 0, bad: 0, clock: 0, log: [], agentId: null, ruinT: 6 }];
  G.envs = [];
  S.startRun(G); S.deploy(G, 'k09', { q: 0, r: 6 }); S.move(G, 'k09', { q: 0, r: -6 });
  V.sel = 'k09';
} else if (TRY === 'ai') {
  S.spawnAiNow(G);
  V.focus = { kind: 'ai' };
}
let titleAgents = null;   // 开局界面上摆着的三个小人
let portraits = {};

// ---------- 布局 ----------
// 电脑上默认把游戏装进一块手机比例（390×844）的竖屏里，按窗口大小整体缩放；?wide 用横屏布局
const stage = document.getElementById('stage');
const FRAME = !params.has('wide');
const PHONE_W = 390, PHONE_H = 844;
let SCALE = 1;
function framed() { return FRAME && window.innerWidth / window.innerHeight > 0.75; }
function wide() { return !FRAME && window.innerWidth / window.innerHeight > 1.05 && window.innerWidth >= 760; }
// 元素在 #ui 里的纵坐标（不受整体缩放影响）
function topIn(el) { let y = 0; while (el && el !== ui) { y += el.offsetTop; el = el.offsetParent; } return y; }
function layout() {
  const fr = framed();
  document.body.classList.toggle('framed', fr);
  SCALE = fr ? Math.min(window.innerHeight * 0.96 / PHONE_H, window.innerWidth * 0.96 / PHONE_W, 1.3) : 1;
  stage.style.setProperty('--s', SCALE);
  const w = stage.offsetWidth, h = stage.offsetHeight;
  ui.classList.toggle('wide', wide());
  const col = ui.querySelector('.column');
  if (!col) return;
  if (titleOn) {
    // 开局界面：小岛放在标题和按钮之间
    world.defaultZoom = 1.0;
    world.resize(w, h, { x: 0, y: h * 0.25, w: w, h: h * 0.5 });
    return;
  }
  if (wide()) {
    world.defaultZoom = 1.0;
    world.resize(w, h, { x: 0, y: 0, w: col.offsetLeft, h: h });
  } else {
    const tb = ui.querySelector('.topbar');
    const top = topIn(tb) + tb.offsetHeight + 4;
    const bottomEl = ui.querySelector(ui.classList.contains('in-sheet') ? '.sheet' : '.bottom');
    const b = bottomEl ? topIn(bottomEl) - 2 : h - 300;
    world.defaultZoom = 1.18;
    world.resize(w, h, { x: 0, y: top, w: w, h: Math.max(200, b - top) });
  }
}
// 屏幕坐标 → 画布里的坐标（扣掉手机框的位置和缩放）
function local(e) {
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) / SCALE, y: (e.clientY - r.top) / SCALE };
}

// ---------- 小工具 ----------
const agentOf = (id) => G.agents.find((a) => a.id === id);
const eventOf = (id) => G.events.find((e) => e.id === id);
const pad = (n) => (n < 10 ? '0' : '') + n;
const fmt = (t) => { t = Math.ceil(t); return pad(Math.floor(t / 60)) + ':' + pad(t % 60); };
const WALK_SPEED = 0.75;   // 走路动画按原速播放时，小人每秒正好走这么远（再快再慢就要调动画速度）
function agentPos(a) {
  const p = hexToWorld(a.cell.q, a.cell.r);
  if (a.state === 'moving' && a.next) {
    const n = hexToWorld(a.next.q, a.next.r);
    p.lerp(n, Math.min(1, a.prog));
  }
  return p;
}
function toast(text) {
  V.toast = text; V.toastT = 1.8;
  const el = ui.querySelector('.toast');
  if (el) { el.textContent = text; el.classList.add('on'); }
}
function floater(q, r, html, cls) {
  const p = hexToWorld(q, r);
  const s = world.screenOf(p.x, 1.6, p.z);
  const el = document.createElement('div');
  el.className = 'floater ' + (cls || '');
  el.innerHTML = html;
  el.style.left = s.x + 'px'; el.style.top = s.y + 'px';
  document.getElementById('stage').appendChild(el);
  setTimeout(function () { el.remove(); }, 1300);
}

// ---------- 画面同步 ----------
function syncWorld(dt) {
  // 事件（开局界面上不画）
  const evs = titleOn ? [] : G.events, envs = titleOn ? [] : G.envs;
  evs.forEach(function (ev) {
    if (!vis.events[ev.id]) vis.events[ev.id] = world.addEvent(ev);
  });
  Object.keys(vis.events).forEach(function (id) {
    if (!evs.some((e) => e.id === +id)) { vis.events[id].remove(); delete vis.events[id]; }
  });
  // 环境区块
  envs.forEach(function (e) {
    if (!vis.envs[e.id]) vis.envs[e.id] = world.addEnv(e, ENV_KIND[e.type]);
  });
  Object.keys(vis.envs).forEach(function (id) {
    if (!envs.some((e) => e.id === +id)) { vis.envs[id].remove(); delete vis.envs[id]; }
  });
  // AI 属地：中心一个“AI”气泡，颜色跟着状态变
  const ai = titleOn ? null : G.ai, aik = ai ? ai.id + ai.state : '';
  if (aik !== vis.aiKey) {
    if (vis.ai) vis.ai.remove();
    vis.ai = ai ? world.addEnv(ai, 'ai-' + ai.state) : null;
    vis.aiKey = aik;
  }
  // 塌掉的格子
  const ruins = titleOn ? {} : (G.ruins || {}), rk = Object.keys(ruins).sort().join('|');
  if (rk !== vis.ruinKey) { world.setRuins(ruins); vis.ruinKey = rk; }
  // 民生设施
  Object.keys(G.placements).forEach(function (id) {
    const c = G.placements[id];
    if (!vis.facs[id]) vis.facs[id] = world.addFacility(c);
    else vis.facs[id].move(c);
  });
  // 地块上色：民生覆盖 = 绿地 + 彩色房子；环境区块染色
  let lawn = S.civicUnion(G);
  const tint = {};
  // 开局界面：左半岛已经恢复颜色，右半岛还是白的
  if (titleOn) { lawn = {}; S.CELLS.forEach(function (c) { if (c.q < 0 || (c.q === 0 && c.r > 0)) lawn[S.key(c)] = true; }); }
  envs.forEach(function (e) {
    S.CELLS.forEach(function (c) { if (S.dist(c, e) <= e.radius) tint[S.key(c)] = ENV_TINT[e.type]; });
  });
  if (ai && AI_TINT[ai.state]) S.aiCells(G).forEach(function (c) { tint[S.key(c)] = AI_TINT[ai.state]; });
  const pk = Object.keys(lawn).sort().join('|') + '#' + JSON.stringify(tint) + '#' + rk;
  if (pk !== vis.paintKey) { world.paint({ lawn: lawn, tint: tint, ruins: ruins }); vis.paintKey = pk; }

  // 干员
  G.agents.forEach(function (a) {
    let v = vis.agents[a.id];
    if (!v) {
      v = vis.agents[a.id] = world.addAgent({ model: LOOK[a.id].model, color: LOOK[a.id].color });
      v.yaw = 0; v.spd = 0;
    }
    const on = S.onMap(a) && !titleOn;
    v.group.visible = on;
    if (!on) return;
    const p = agentPos(a);
    if (v.placed) {
      const dx = p.x - v.group.position.x, dz = p.z - v.group.position.z;
      if (dx * dx + dz * dz > 1e-6) v.want = Math.atan2(dx, dz);
      // 实际移动速度（平滑过）：策划案 5 秒一格很慢，腿要跟着放慢
      if (dt > 0) v.spd += (Math.hypot(dx, dz) / dt - v.spd) * Math.min(1, dt * 6);
    }
    v.group.position.x = p.x; v.group.position.z = p.z; v.placed = true;
    if (a.state === 'handling') {
      const ev = eventOf(a.eventId);
      if (ev) { const e = hexToWorld(ev.q, ev.r); if (e.distanceTo(p) > 0.1) v.want = Math.atan2(e.x - p.x, e.z - p.z); }
    }
    if (v.want != null) {
      let d = v.want - v.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      v.yaw += d * Math.min(1, dt * 10);
      v.body.rotation.y = v.yaw;
    }
    v.play(a.state === 'moving' ? 'walk' : a.state === 'handling' ? 'interact-right' : 'idle');
    v.ring.visible = a.state === 'handling';
    v.pace(Math.min(2, v.spd / WALK_SPEED));
    v.sel.visible = v.arrow.visible = V.sel === a.id;
    if (v.arrow.visible) v.arrow.position.y = v.arrowY + Math.sin(performance.now() / 160) * 0.08;
  });
  Object.keys(vis.agents).forEach(function (id) { if (!agentOf(id)) { vis.agents[id].group.visible = false; } });

  // 干员站的格子和下一格：房子树木让路
  const busy = {};
  G.agents.forEach(function (a) {
    if (!S.onMap(a)) return;
    busy[S.key(a.cell)] = true;
    if (a.state === 'moving' && a.next) busy[S.key(a.next)] = true;
  });
  (titleAgents || []).forEach(function (t) { busy[S.key(t.cell)] = true; if (t.next) busy[S.key(t.next)] = true; });
  // 摆了设施的格子、塌掉的格子，房子树木也让开
  Object.keys(G.placements).forEach(function (k) { const c = G.placements[k]; if (c) busy[S.key(c)] = true; });
  Object.keys(ruins).forEach(function (k) { busy[k] = true; });
  world.clearCells(busy);

  // 选中干员的路线
  const sa = V.sel && agentOf(V.sel);
  let pts = null;
  if (sa && sa.state === 'moving') {
    pts = [agentPos(sa), hexToWorld(sa.next.q, sa.next.r)].concat(sa.path.map((c) => hexToWorld(c.q, c.r)));
  }
  const key = pts ? sa.id + ':' + S.key(sa.next) + ':' + sa.path.map(S.key).join(';') : '';
  if (key !== vis.pathKey) {
    if (vis.path) vis.path.remove();
    vis.path = pts ? world.pathDots([hexToWorld(sa.cell.q, sa.cell.r)].concat(pts.slice(1))) : null;
    vis.pathKey = key;
  }
  // 可出动的格子
  let hl = null;
  if (G.phase === 'run' && sa && sa.state === 'reserve' && !S.has(sa, '都市英雄')) hl = S.OUTER.filter((c) => !S.ruined(G, c));
  const hk = hl ? 'outer' + rk : '';
  if (hk !== vis.hlKey) { world.highlight(hl, 0x3c95f4); vis.hlKey = hk; }
}

// ---------- 规则事件 → 飘字 ----------
function consumeFx() {
  G.fx.forEach(function (f) {
    const ev = vis.events[f.id] ? eventOf(f.id) : null;
    if (f.t === 'judge' && ev) floater(ev.q, ev.r, f.ok ? ICON.check() : ICON.xmark(), f.ok ? 'ok' : 'bad');
    if (f.t === 'resolved') {
      const a = f.agent && agentOf(f.agent);
      const c = a && a.cell ? a.cell : { q: 0, r: 0 };
      floater(c.q, c.r, '<b>' + f.name + '</b> 解决<i>' + ICON.coin() + '+' + S.GAPS.eventReward + '</i>', 'win');
      if (V.focus && V.focus.id === f.id) V.focus = null;
    }
    if (f.t === 'failed') {
      const e2 = eventOf(f.id);
      if (e2) floater(e2.q, e2.r, '<b>' + f.name + '</b> 失败', 'lose');
    }
    if (f.t === 'ruin') floater(f.q, f.r, '<b>' + f.name + '</b> 波及，道路塌了', 'lose');
    if (f.t === 'reroute') {
      const a = agentOf(f.agent);
      if (a && a.cell) floater(a.cell.q, a.cell.r, '<b>' + S.data(a).name + '</b> 改道', '');
    }
    if (f.t === 'aiNew') toast('地图上出现了 AI 属地，点它看看');
    if (f.t === 'ai') toast('AI 属地变成了「' + S.AI_LABEL[f.to] + '」');
  });
  G.fx.length = 0;
}

// ---------- 点击地图 ----------
function agentAtCell(c) {
  return G.agents.find(function (a) {
    if (!S.onMap(a)) return false;
    const at = a.state === 'moving' && a.prog > 0.5 ? a.next : a.cell;
    return at.q === c.q && at.r === c.r;
  });
}
function eventAtCell(c) {
  const list = G.events.filter((e) => S.dist(c, e) <= e.radius);
  list.sort((x, y) => S.dist(c, x) - S.dist(c, y));
  return list[0];
}
function tapMap(px, py) {
  const hit = world.pick(px, py);
  if (!hit) { V.focus = null; V.placing = null; return; }
  if (hit.envId) { V.focus = G.ai && G.ai.id === hit.envId ? { kind: 'ai' } : { kind: 'env', id: hit.envId }; return; }
  const sa = V.sel && agentOf(V.sel);
  const inAi = (c) => G.ai && c && S.dist(c, G.ai) <= G.ai.radius;

  if (G.phase === 'prep') {
    if (hit.eventId) { V.focus = { kind: 'event', id: hit.eventId }; return; }
    const c = hit.cell;
    if (V.placing) {
      S.placeTech(G, V.placing, c);
      V.placing = null;
      store.set(G);
      return;
    }
    const fac = Object.keys(G.placements).find((id) => G.placements[id].q === c.q && G.placements[id].r === c.r);
    if (fac) { V.placing = fac; V.focus = null; toast('点一格，把' + S.tech(fac).name + '挪过去'); return; }
    const ev = eventAtCell(c);
    V.focus = ev ? { kind: 'event', id: ev.id } : inAi(c) ? { kind: 'ai' } : null;
    return;
  }
  if (G.phase !== 'run') return;

  const c = hit.cell || (hit.eventId && eventOf(hit.eventId));
  const ev = hit.eventId ? eventOf(hit.eventId) : eventAtCell(c);
  const other = hit.cell && agentAtCell(c);
  // 点到别的干员：切换选中
  if (other && other.id !== V.sel && !(ev && sa && S.onMap(sa))) { select(other.id); return; }

  if (!sa) {
    V.focus = ev ? { kind: 'event', id: ev.id } : null;
    const env = G.envs.find((e) => S.dist(c, e) <= e.radius);
    if (!ev && env) V.focus = { kind: 'env', id: env.id };
    if (!ev && inAi(c)) V.focus = { kind: 'ai' };
    return;
  }
  if (sa.state === 'reserve') {
    if (S.deployedCount(G) >= S.deployCap(G)) { toast('出动人数已满 ' + S.deployCap(G) + '/' + S.deployCap(G)); return; }
    const at = hit.cell || c;
    if (!S.canDeployAt(G, sa, at)) { toast(S.ruined(G, at) ? '这格塌了，换一格出动' : '从最外圈出动'); return; }
    S.deploy(G, sa.id, at);
    // 只出动还没定去哪：保持选中，下一下点目的地；连事件一起定了就放开选中
    if (ev) { S.goHandle(G, sa.id, ev.id); V.focus = { kind: 'event', id: ev.id }; V.sel = null; }
    return;
  }
  if (sa.state === 'cooldown') { toast('撤下来的干员下回合才能再出动'); return; }
  if (sa.state === 'handling') { toast('正在处理，先撤退才能走开'); return; }
  if (sa.state === 'stuck') { toast('失败后要原地滞留 ' + Math.ceil(sa.hold) + ' 秒'); return; }
  if (ev) {
    if (ev.agentId && ev.agentId !== sa.id) { toast('已有干员在处理'); V.focus = { kind: 'event', id: ev.id }; return; }
    S.goHandle(G, sa.id, ev.id);
    V.focus = { kind: 'event', id: ev.id };
    V.sel = null;   // 命令下完就放开选中，再点地图不会改他的路线
    return;
  }
  S.move(G, sa.id, hit.cell);
  V.sel = null;
}
function select(id) {
  V.sel = V.sel === id ? null : id;
  const a = V.sel && agentOf(V.sel);
  if (a && a.eventId) V.focus = { kind: 'event', id: a.eventId };
  else if (a && a.autoEvent) V.focus = { kind: 'event', id: a.autoEvent };
  else if (a) V.focus = null;
}

// ---------- 界面 ----------
function skeleton() {
  ui.innerHTML =
    '<div class="column">' +
      '<header class="topbar clay">' +
        '<div class="round"><svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="18" class="track"/><circle cx="22" cy="22" r="18" class="arc" id="t-arc" style="stroke-dasharray:113;stroke-dashoffset:0"/></svg><span id="t-round">1</span></div>' +
        '<div class="timer"><b id="t-time">03:00</b><i class="bar"><em id="t-bar" style="width:100%"></em></i></div>' +
        '<div class="stats">' +
          '<span class="stat">' + ICON.coin() + '<b id="t-money">0</b></span>' +
          '<span class="stat">' + ICON.heart() + '<b id="t-coh">50</b></span>' +
          '<span class="stat">' + ICON.house() + '<b id="t-cov">0%</b><i class="mini"><em id="t-covbar"></em></i></span>' +
        '</div>' +
        '<button class="pause clay-btn" data-act="pause" id="t-pause">' + ICON.pause() + '</button>' +
      '</header>' +
      '<div class="ctrl"><button class="clay-btn spd" data-act="speed" id="t-spd">1×</button>' +
        '<button class="clay-btn skip" data-act="skip" id="t-skip">' + ICON.skip() + '</button></div>' +
      '<div class="toast"></div>' +
      '<div class="spacer"></div>' +
      '<section class="bottom"><div class="card-slot"></div><div class="agents"></div></section>' +
    '</div>' +
    '<div class="sheet-slot"></div>';
}

function updateTop() {
  const $ = (id) => document.getElementById(id);
  $('t-round').textContent = G.round;
  const frac = G.phase === 'run' ? G.time / S.ROUND_TIME : 1;
  $('t-arc').style.strokeDashoffset = (113 * (1 - frac)).toFixed(1);
  $('t-time').textContent = G.phase === 'facility' ? '设施' : fmt(G.time);
  $('t-bar').style.width = (frac * 100).toFixed(1) + '%';
  $('t-money').textContent = G.money;
  $('t-coh').textContent = G.cohesion;
  const cov = Math.round(Object.keys(S.civicUnion(G)).length / S.CELLS.length * 100);
  $('t-cov').textContent = cov + '%';
  $('t-covbar').style.width = cov + '%';
  const pb = $('t-pause');
  const ik = V.paused || G.phase !== 'run' ? 'play' : 'pause';
  if (pb.dataset.icon !== ik) { pb.innerHTML = ICON[ik](); pb.dataset.icon = ik; }
  pb.classList.toggle('dim', G.phase !== 'run');
  ui.classList.toggle('running', G.phase === 'run');
  $('t-spd').textContent = V.speed + '×';
  $('t-skip').classList.toggle('armed', V.skipArm > 0);
  const t = ui.querySelector('.toast');
  if (V.toastT <= 0) t.classList.remove('on');
}

function stateBadge(a) {
  if (a.state === 'handling') return '<b class="ring-spin"></b>';
  if (a.state === 'moving') return ICON.feet();
  if (a.state === 'stuck') return '<b class="hold" data-hold="' + a.id + '">' + Math.ceil(a.hold) + '</b>';
  if (a.state === 'cooldown') return ICON.moon();
  if (a.state === 'idle') return '<b class="dot"></b>';
  return '';
}
function agentsHTML() {
  return G.agents.map(function (a) {
    const d = S.data(a), L = LOOK[a.id];
    const cls = 'agent clay' + (V.sel === a.id ? ' sel' : '') + (a.state === 'cooldown' ? ' cool' : '') + (S.onMap(a) ? ' out' : '');
    const badge = stateBadge(a);
    return '<button class="' + cls + '" data-act="agent" data-id="' + a.id + '">' +
      '<div class="photo" style="background:' + L.bg + '">' +
        '<img src="' + portraits[a.id] + '" alt="">' +
        '<i class="trait">' + d.traits.map((t) => '<em>' + TRAIT_SHORT[t] + '</em>').join('') + '</i>' +
        (badge ? '<i class="state s-' + a.state + '">' + badge + '</i>' : '') +
      '</div>' +
      '<div class="name">' + d.name + '</div>' +
      '<div class="abil"><span class="pill red">' + ICON.shield() + '<b>' + d.anti + '</b></span><span class="pill blue">' + ICON.cross() + '<b>' + d.rescue + '</b></span></div>' +
    '</button>';
  }).join('');
}
function agentsKey() {
  return G.agents.map((a) => a.id + a.state).join(',') + '|' + V.sel;
}

// 事件卡：判定条从左往右填成功、从右往左填失败，两头在“决定格”相遇，旗子插在决定格上
function segsHTML(ev) {
  const th = S.thresholds(ev.segs, G.cohesion);
  let out = '';
  for (let i = 0; i < ev.segs; i++) {
    const fromRight = ev.segs - 1 - i;
    const flag = i === th.S - 1 ? '<i class="flag">' + ICON.flag() + '</i>' : '';
    if (i < ev.ok) out += '<i class="seg ok">' + ICON.check() + flag + '</i>';
    else if (fromRight < ev.bad) out += '<i class="seg bad">' + ICON.xmark() + flag + '</i>';
    else out += '<i class="seg">' + flag + '</i>';
  }
  return out;
}
function pips(n) {
  let s = '';
  for (let i = 1; i <= 4; i++) s += ICON.dropPip(i <= n);
  return s;
}
function aiNext() {
  const ai = G.ai;
  return ai.state === 'civic' ? '它的系列事件拖到回合结束没处理，就会退回去' : '再处理 ' + (2 - ai.prog) + ' 起它的系列事件，就变成民生区';
}
function cardHTML() {
  const sa = V.sel && agentOf(V.sel), f = V.focus;
  if (G.phase === 'prep') {
    const n = G.events.filter((e) => !e.agentId && e.ok === 0 && e.bad === 0).length;
    // 准备阶段点了 AI 属地：说明放在这张卡里，开始按钮还在
    if (f && f.kind === 'ai' && G.ai) {
      return '<div class="event clay prep"><div class="badge ai-badge ai-' + G.ai.state + '">AI</div>' +
        '<div class="prep-main"><b>AI 属地<small>' + S.AI_LABEL[G.ai.state] + '</small></b><span>' + AI_HINT[G.ai.state] + '</span><em>' + aiNext() + '</em></div>' +
        '<button class="go clay-btn blue" data-act="start">开始行动</button></div>';
    }
    return '<div class="event clay prep">' +
      '<div class="prep-main"><b>第 ' + G.round + ' 回合</b><span>城里有 ' + G.events.length + ' 起事件 · 发展阶段 ' + S.stage(G) + '</span>' +
      (Object.keys(G.placements).length ? '<em>点绿色设施可以挪位置</em>' : '') + '</div>' +
      '<button class="go clay-btn blue" data-act="start">开始行动</button></div>';
  }
  if (f && f.kind === 'event' && eventOf(f.id)) {
    const ev = eventOf(f.id);
    const who = ev.agentId ? agentOf(ev.agentId) : (sa && S.onMap(sa) ? sa : null);
    const ch = who ? Math.round(S.chance(G, who, ev) * 100) : null;
    const ab = who ? S.ability(G, who, ev).total : null, df = S.difficulty(G, ev).total;
    const busy = ev.agentId ? agentOf(ev.agentId) : null;
    const right = busy
      ? '<button class="retreat clay-btn" data-act="retreat" data-id="' + busy.id + '">' + ICON.retreat() + '<span>撤退</span></button>'
      : '';
    return '<div class="event clay">' +
      '<div class="gem">' + ICON.hexGem(ev.type) + '</div>' +
      '<div class="ev-main">' +
        '<div class="ev-title"><b>' + ev.name + '</b><span class="pips">' + pips(ev.danger) + '</span>' +
          (who ? '<span class="ev-who" title="' + S.data(who).name + '"><img src="' + portraits[who.id] + '"><svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="29" class="rtrack"/><circle cx="32" cy="32" r="29" class="arc" id="c-arc" style="stroke-dasharray:182;stroke-dashoffset:182"/></svg></span>' : '') +
        '</div>' +
        '<div class="segs">' + segsHTML(ev) + '</div>' +
        '<div class="ev-meta"><span class="vs ' + ev.type + '">' + (ev.type === 'anti' ? ICON.shield() : ICON.cross()) + '<b>' + (ab == null ? '?' : ab) + '</b><i>vs</i><b>' + df + '</b></span>' +
          (ch == null ? '<span class="hint">选一名干员再点它</span>' : '<span class="rate">每段成功率 <b>' + ch + '%</b></span>') + '</div>' +
      '</div>' + right + '</div>';
  }
  if (f && f.kind === 'ai' && G.ai) {
    const st = G.ai.state;
    return '<div class="event clay info"><div class="badge ai-badge ai-' + st + '">AI</div><div class="prep-main"><b>AI 属地<small>' + S.AI_LABEL[st] + '</small></b>' +
      '<span>' + AI_HINT[st] + '</span><em>' + aiNext() + '</em></div></div>';
  }
  if (f && f.kind === 'env') {
    const e = G.envs.find((x) => x.id === f.id);
    if (e) {
      const t = S.envType(e);
      return '<div class="event clay info"><div class="badge env-' + e.type + '"></div><div class="prep-main"><b>' + t.name + '</b><span>' + t.desc + ' · 还剩 ' + e.life + ' 回合</span></div></div>';
    }
  }
  if (sa) {
    const d = S.data(sa);
    let line = '', btn = '';
    if (sa.state === 'reserve') line = S.has(sa, '都市英雄') ? '点地图任意一格出动' : '点亮起的外圈格出动';
    else if (sa.state === 'cooldown') line = '已撤下，下回合可再出动';
    else if (sa.state === 'idle') line = '点地图移动，点事件去处理';
    else if (sa.state === 'moving') line = '移动中 · 还有 ' + (sa.path.length + 1) + ' 格';
    else if (sa.state === 'stuck') line = '处理失败，原地滞留 <b data-hold="' + sa.id + '">' + Math.ceil(sa.hold) + '</b> 秒';
    if (S.onMap(sa) && sa.state !== 'handling') btn = '<button class="retreat clay-btn" data-act="retreat" data-id="' + sa.id + '">' + ICON.retreat() + '<span>撤退</span></button>';
    return '<div class="event clay info">' +
      '<span class="face" style="background:' + LOOK[sa.id].bg + '"><img src="' + portraits[sa.id] + '"></span>' +
      '<div class="prep-main"><b>' + d.name + '<small>' + d.role + '</small></b><span>' + line + '</span>' +
      '<em>' + d.traits.map((t) => t + '：' + S.TRAITS[t]).join('<br>') + '</em></div>' + btn + '</div>';
  }
  return '<div class="event clay info"><div class="prep-main"><b>外勤行动</b><span>点下面的干员，再点地图出动</span>' +
    '<em>出动 ' + S.deployedCount(G) + '/' + S.deployCap(G) + ' · 事件 ' + G.events.length + ' 起</em></div></div>';
}
function cardKey() {
  const f = V.focus, ev = f && f.kind === 'event' && eventOf(f.id);
  const sa = V.sel && agentOf(V.sel);
  return [G.phase, G.round, G.events.length, V.sel, sa && sa.state, sa && sa.path.length, f && f.kind, f && f.id,
    ev && ev.ok, ev && ev.bad, ev && ev.agentId, G.cohesion, S.deployedCount(G), G.ai && G.ai.prog].join('|');
}
function updateCardLive() {
  const f = V.focus, ev = f && f.kind === 'event' && eventOf(f.id);
  const arc = document.getElementById('c-arc');
  if (arc && ev && ev.agentId) {
    const need = S.judgeTime(G, agentOf(ev.agentId));
    arc.style.strokeDashoffset = (182 * (1 - Math.min(1, ev.clock / need))).toFixed(1);
  }
  ui.querySelectorAll('[data-hold]').forEach(function (el) {
    const a = agentOf(el.dataset.hold);
    if (a) el.textContent = Math.ceil(a.hold);
  });
}

// ---------- 设施（回合之间）----------
function techIcon(t) {
  return '<span class="ticon ' + (t.civic ? 'civic' : 'gen') + '">' + (t.civic ? ICON.house() : ICON.gear()) + '</span>';
}
function sheetHTML() {
  if (G.phase === 'ended') {
    const e = G.ending;
    return '<div class="sheet clay end ' + (e.win ? 'win' : 'lose') + '"><b class="big">' + (e.win ? '城市恢复了色彩' : '城市陷入灰暗') + '</b>' +
      '<p>' + e.text + '</p><p class="sub">坚持了 ' + e.round + ' 回合 · 解决事件 ' + G.stats.resolved + ' 起</p>' +
      '<button class="go clay-btn red" data-act="restart">再来一局</button></div>';
  }
  if (G.phase !== 'facility') return '';
  const r = G.report || { income: 0, done: [] };
  const tabs = [['research', '研究'], ['build', '扩建'], ['recruit', '招募']].map(function (t) {
    return '<button class="tab clay-btn' + (V.tab === t[0] ? ' on' : '') + '" data-act="tab" data-id="' + t[0] + '">' + t[1] + '</button>';
  }).join('');
  let body = '';
  if (V.tab === 'research') {
    const slots = S.UPGRADES.parallel.values[G.up.parallel];
    body = '<div class="sub-line">研究位 ' + G.projects.length + '/' + slots + ' · 研究需要的回合数到了才完成</div><div class="grid">' +
      S.TECHS.filter((t) => !(t.proposal && G.proposal !== t.id && G.owned.indexOf(t.id) < 0 && !G.projects.some((p) => p.id === t.id)) && !(t.hidden && !t.hidden(G) && G.owned.indexOf(t.id) < 0))
        .map(function (t) {
          const own = G.owned.indexOf(t.id) >= 0, proj = G.projects.find((p) => p.id === t.id);
          const avail = S.techAvailable(G, t.id);
          const locked = !own && !proj && !avail;
          const left = proj ? S.techTime(G, t.id) - (G.round - proj.start) : 0;
          const cls = 'tech' + (own ? ' own' : '') + (proj ? ' doing' : '') + (locked ? ' locked' : '') + (t.proposal ? ' prop' : '');
          return '<button class="' + cls + '" data-act="research" data-id="' + t.id + '">' +
            techIcon(t) +
            (proj ? '<i class="left">' + left + '</i>' : own ? '<i class="left done">' + ICON.check() + '</i>' : '') +
            '<b>' + t.name + '</b><small>' + t.desc + (t.radius ? ' · 半径' + t.radius : '') + '</small>' +
            '<span class="cost">' + ICON.coin() + S.techCost(G, t.id) + '<em>' + S.techTime(G, t.id) + '回合</em>' +
            '<em class="' + (t.cohesion >= 0 ? 'up' : 'down') + '">' + ICON.heart() + (t.cohesion >= 0 ? '+' : '') + t.cohesion + '</em></span>' +
            (locked && t.req && G.owned.indexOf(t.req) < 0 ? '<i class="req">需先有' + S.tech(t.req).name + '</i>' : '') +
            (t.proposal ? '<i class="tag">本回合提案</i>' : '') +
          '</button>';
        }).join('') + '</div>';
  } else if (V.tab === 'build') {
    body = '<div class="list">' + Object.keys(S.UPGRADES).map(function (k) {
      const u = S.UPGRADES[k], lv = G.up[k], cost = u.costs[lv];
      const unit = k === 'move' || k === 'handle' ? '−' : k === 'research' ? '−' : '';
      const fmtv = (v) => k === 'move' || k === 'handle' ? '快' + v + '秒' : k === 'research' ? '少' + v + '回合' : v;
      return '<div class="row"><span class="blk">' + u.block + '</span><b>' + u.name + '</b>' +
        '<span class="val">' + fmtv(u.values[lv]) + (cost !== undefined ? ' → <b>' + fmtv(u.values[lv + 1]) + '</b>' : '') + '</span>' +
        (cost !== undefined ? '<button class="buy clay-btn" data-act="upgrade" data-id="' + k + '">' + ICON.coin() + cost + '</button>' : '<span class="max">满级</span>') +
      '</div>';
    }).join('') + '</div>';
  } else {
    body = '<div class="sub-line">招募费 ' + S.GAPS.recruitCost + ' · 每回合刷新 ' + S.UPGRADES.recruit.values[G.up.recruit] + ' 人</div><div class="grid">' +
      (G.candidates.length ? G.candidates.map(function (id) {
        const d = S.ROSTER.find((x) => x.id === id), L = LOOK[id];
        return '<button class="cand" data-act="recruit" data-id="' + id + '">' +
          '<span class="face" style="background:' + L.bg + '"><img src="' + portraits[id] + '"></span>' +
          '<b>' + d.name + '</b><small>' + d.role + '</small>' +
          '<div class="abil"><span class="pill red">' + ICON.shield() + '<b>' + d.anti + '</b></span><span class="pill blue">' + ICON.cross() + '<b>' + d.rescue + '</b></span></div>' +
          '<em>' + d.traits.join(' · ') + '</em>' +
          '<span class="cost">' + ICON.coin() + S.GAPS.recruitCost + '</span></button>';
      }).join('') : '<p class="empty">本回合没有可招募的人</p>') + '</div>';
  }
  const delta = S.cohesionDelta(G);
  return '<div class="sheet clay">' +
    '<div class="report">第 ' + r.round + ' 回合结束 · 收入 ' + ICON.coin() + '+' + r.income +
      (r.done.length ? ' · 研究完成：' + r.done.map((id) => S.tech(id).name).join('、') : '') + '</div>' +
    '<div class="tabs">' + tabs + '</div>' +
    '<div class="sheet-body">' + body + '</div>' +
    '<div class="sheet-foot"><span class="delta ' + (delta >= 0 ? 'up' : 'down') + '">' + ICON.heart() + '凝聚力 ' + (delta >= 0 ? '+' : '') + delta + '</span>' +
      '<button class="go clay-btn red" data-act="next">出发 →</button></div>' +
  '</div>';
}
function sheetKey() {
  return [G.phase, V.tab, G.money, G.projects.length, G.candidates.join(), G.agents.length, JSON.stringify(G.up), G.owned.length].join('|');
}

const keys = { agents: '', card: '', sheet: '' };
function renderUI() {
  // 回合前干员还不能出动：只留「开始行动」，开始后干员卡片再升上来（地图跟着平滑让位）
  const prep = G.phase === 'prep';
  if (ui.classList.contains('in-prep') !== prep) { ui.classList.toggle('in-prep', prep); world.glideNext = true; layoutSoon(); }
  const ak = agentsKey();
  if (ak !== keys.agents) { ui.querySelector('.agents').innerHTML = agentsHTML(); keys.agents = ak; }
  const ck = cardKey();
  if (ck !== keys.card) { ui.querySelector('.card-slot').innerHTML = cardHTML(); keys.card = ck; layoutSoon(); }
  const sk = sheetKey();
  if (sk !== keys.sheet) {
    ui.querySelector('.sheet-slot').innerHTML = sheetHTML();
    ui.classList.toggle('in-sheet', G.phase === 'facility' || G.phase === 'ended');
    keys.sheet = sk; layoutSoon();
  }
  updateTop();
  updateCardLive();
}
let layoutPending = false;
function layoutSoon() {
  if (layoutPending) return;
  layoutPending = true;
  requestAnimationFrame(function () { layoutPending = false; layout(); });
}

// ---------- 按钮 ----------
ui.addEventListener('click', function (e) {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const act = b.dataset.act, id = b.dataset.id;
  if (act === 'agent') select(id);
  else if (act === 'pause') { if (G.phase === 'run') V.paused = !V.paused; else if (G.phase === 'prep') begin(); }
  else if (act === 'start') begin();
  else if (act === 'speed') { V.speed = V.speed >= 3 ? 1 : V.speed + 1; }
  else if (act === 'skip') {
    // 点两下才结束，防误触
    if (V.skipArm > 0 || guide.active) { V.skipArm = 0; S.endEarly(G); V.sel = null; V.focus = null; }
    else { V.skipArm = 2; toast('再点一次，提前结束本回合'); }
  }
  else if (act === 'retreat') { S.retreat(G, id); if (V.focus && V.focus.kind === 'event') V.focus = null; }
  else if (act === 'tab') V.tab = id;
  else if (act === 'research') {
    if (!S.research(G, id)) {
      const t = S.tech(id);
      if (G.owned.indexOf(id) >= 0 || G.projects.some((p) => p.id === id)) return;
      if (t.req && G.owned.indexOf(t.req) < 0) toast('需要先研究' + S.tech(t.req).name);
      else if (G.projects.length >= S.UPGRADES.parallel.values[G.up.parallel]) toast('研究位满了，去扩建加位置');
      else if (G.money < S.techCost(G, id)) toast('资金不够');
    }
  } else if (act === 'upgrade') { if (!S.upgrade(G, id)) toast('资金不够'); }
  else if (act === 'recruit') { if (!S.recruit(G, id)) toast('资金不够'); else ensurePortraits(); }
  else if (act === 'next') { S.leaveFacility(G); V.sel = null; V.focus = null; store.set(G); }
  else if (act === 'restart') startNew(false);
  renderUI();
});
function begin() { if (S.startRun(G)) { V.paused = false; V.focus = null; } }

// ---------- 地图手势：拖动平移、滚轮/双指缩放、点按 ----------
const pointers = {};
let drag = null;
canvas.addEventListener('pointerdown', function (e) {
  canvas.setPointerCapture(e.pointerId);
  pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
  const ids = Object.keys(pointers);
  if (ids.length === 1) drag = { x: e.clientX, y: e.clientY, moved: false, sx: e.clientX, sy: e.clientY };
  else if (ids.length === 2) {
    const a = pointers[ids[0]], b = pointers[ids[1]];
    drag = { pinch: Math.hypot(a.x - b.x, a.y - b.y), moved: true };
  }
});
canvas.addEventListener('pointermove', function (e) {
  if (!pointers[e.pointerId] || !drag) return;
  pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
  const ids = Object.keys(pointers);
  if (ids.length >= 2 && drag.pinch) {
    const a = pointers[ids[0]], b = pointers[ids[1]];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    world.zoomBy(d / drag.pinch);
    drag.pinch = d;
    return;
  }
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 8) drag.moved = true;
  if (drag.moved) world.pan(dx / SCALE, dy / SCALE);
  drag.x = e.clientX; drag.y = e.clientY;
});
function endPointer(e) {
  if (!pointers[e.pointerId]) return;
  delete pointers[e.pointerId];
  if (drag && !drag.moved && !drag.pinch && Object.keys(pointers).length === 0) { const p = local(e); tapMap(p.x, p.y); renderUI(); }
  if (Object.keys(pointers).length === 0) drag = null;
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', function (e) { delete pointers[e.pointerId]; drag = null; });
canvas.addEventListener('wheel', function (e) { e.preventDefault(); world.zoomBy(Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
window.addEventListener('keydown', function (e) {
  if (e.code === 'Space') { e.preventDefault(); if (G.phase === 'run') V.paused = !V.paused; else if (G.phase === 'prep') begin(); }
  else if (e.code === 'Escape') { V.sel = null; V.focus = null; V.placing = null; }
  else if (/^Digit[1-9]$/.test(e.code)) { const a = G.agents[+e.code.slice(5) - 1]; if (a) select(a.id); }
  else if (e.code === 'KeyF') { V.speed = V.speed >= 3 ? 1 : V.speed + 1; toast(V.speed + ' 倍速'); }
  else return;
  renderUI();
});

// ---------- 开局界面（选存档/新游戏）、新手引导 ----------
const guide = new Guide({
  G: function () { return G; }, V: V, stage: stage, ui: ui, world: world,
  scale: function () { return SCALE; },
  deployCell: function () {
    const ev = G.events[0];
    if (!ev) return null;
    // 离事件最近的外圈格；一样近的挑在屏幕上最靠中间的那格
    const v = world.view, cx = v.x + v.w / 2, cy = v.y + v.h / 2;
    const off = function (c) { const p = hexToWorld(c.q, c.r), s2 = world.screenOf(p.x, 0, p.z); return Math.hypot(s2.x - cx, s2.y - cy); };
    let best = null;
    S.OUTER.forEach(function (c) {
      if (!best || S.dist(c, ev) < S.dist(best, ev) || (S.dist(c, ev) === S.dist(best, ev) && off(c) < off(best))) best = c;
    });
    return best;
  },
  onDone: function () { V.speed = 1; try { localStorage.setItem('huidu-guide-done', '1'); } catch (e) { /* */ } },
});
const titleEl = document.createElement('div');
titleEl.className = 'title-screen';
stage.appendChild(titleEl);
function showTitle() {
  titleOn = true;
  ui.classList.add('titled');
  const cont = hasSave && G === saved;
  titleEl.innerHTML =
    '<div class="logo"><img src="assets/ui/logo.png" alt="灰度决断"><span>把灰色的城市重新点亮</span></div>' +
    '<div class="title-btns">' +
      (cont ? '<button class="go clay-btn coral" data-t="continue">继续<small>第 ' + G.round + ' 回合' + (G.phase === 'facility' ? ' · 设施' : '') + '</small></button>' : '') +
      '<button class="go clay-btn ' + (cont ? 'plain' : 'coral') + '" data-t="new">新游戏</button>' +
    '</div>';
  titleEl.classList.add('on');
  // 开局界面只露出中间的小岛；绿地上站三个小人
  world.setIsland(TITLE_R, false);
  world.pitchWant = 50;   // 开局界面镜头放低一点，看得到岛的侧壁
  if (!titleAgents) {
    // 绿地上挑三块空地站人（不站房子和树上，免得穿模）
    const spots = S.CELLS.filter(function (c) {
      return titleLawn(c) && hexDist(c, { q: 0, r: 0 }) <= TITLE_R - 1 && world.cellFree(S.key(c)) && !placedAt(c);
    });
    titleAgents = ['k09', 'lindeng', 'lishi'].map(function (id, i) {
      const c = spots[Math.floor((i + 0.5) * spots.length / 3)] || { q: -1 - i, r: 1 };
      const v = world.addAgent({ model: LOOK[id].model, color: LOOK[id].color });
      v.base.visible = false;
      const p = hexToWorld(c.q, c.r);
      v.group.position.x = p.x; v.group.position.z = p.z;
      v.body.position.y = 0.02;
      v.body.rotation.y = 0.3 - i * 0.3;
      v.group.scale.setScalar(1.15);
      return { v: v, cell: c, next: null, wait: 0.6 + i * 1.1 };
    });
  }
  layout();
}
// 开局界面左半岛（已经点亮的那一半）
function titleLawn(c) { return c.q < 0 || (c.q === 0 && c.r > 0); }
function placedAt(c) { return Object.keys(G.placements).some(function (k) { const p = G.placements[k]; return p && p.q === c.q && p.r === c.r; }); }
// 开局界面的小人在绿地的空地之间散步：走一格、停一会儿，偶尔挥手
function stepTitleAgents(dt) {
  if (!titleAgents) return;
  titleAgents.forEach(function (t) {
    const g = t.v.group;
    if (t.next) {
      const p = hexToWorld(t.next.q, t.next.r), dx = p.x - g.position.x, dz = p.z - g.position.z, d = Math.hypot(dx, dz);
      if (d < 0.03) { t.cell = t.next; t.next = null; t.wait = 1.2 + Math.random() * 2.5; t.v.play(Math.random() < 0.3 ? 'emote-yes' : 'idle'); return; }
      const k = Math.min(d, dt * 0.85);
      g.position.x += dx / d * k; g.position.z += dz / d * k;
      t.v.body.rotation.y = Math.atan2(dx, dz);
      return;
    }
    t.wait -= dt;
    if (t.wait > 0) return;
    const taken = titleAgents.map(function (o) { return S.key(o.next || o.cell); });
    const opts = S.CELLS.filter(function (c) {
      return hexDist(c, t.cell) === 1 && titleLawn(c) && hexDist(c, { q: 0, r: 0 }) <= TITLE_R - 1 &&
        world.cellFree(S.key(c)) && !placedAt(c) && taken.indexOf(S.key(c)) < 0;
    });
    if (!opts.length) { t.wait = 1 + Math.random() * 2; t.v.play(Math.random() < 0.5 ? 'emote-yes' : 'idle'); return; }
    t.next = opts[Math.floor(Math.random() * opts.length)];
    t.v.play('walk');
  });
}
function hideTitle() {
  titleOn = false;
  ui.classList.remove('titled');
  if (titleAgents) { titleAgents.forEach(function (t) { world.root.remove(t.v.group); }); titleAgents = null; }
  world.cam.inited = false; world.cam.tx = 0; world.cam.tz = 0;   // 进游戏用游戏里的默认缩放
  // 外圈从海里一圈圈升起来，镜头跟着平滑拉远
  world.setIsland(MAP_R, true);
  world.pitchWant = 55;
  world.glideNext = true;
  titleEl.classList.remove('on');
  layoutSoon();
}
titleEl.addEventListener('click', function (e) {
  const b = e.target.closest('[data-t]');
  if (!b) return;
  if (b.dataset.t === 'continue') {
    hideTitle();
    if (G.phase === 'run') V.paused = true;   // 读档回到回合中先暂停，不催人
    return;
  }
  // 有存档时点两下才覆盖
  if (hasSave && G === saved && V.newArm <= 0) {
    V.newArm = 2.5;
    b.innerHTML = '再点一次<small>会覆盖当前存档</small>';
    return;
  }
  hideTitle();
  startNew(true);
});
// 换一局：旧局的事件/环境/设施画面全部拆掉
function resetVisuals() {
  Object.keys(vis.events).forEach(function (id) { vis.events[id].remove(); });
  Object.keys(vis.envs).forEach(function (id) { vis.envs[id].remove(); });
  Object.keys(vis.facs).forEach(function (id) { vis.facs[id].remove(); });
  vis.events = {}; vis.envs = {}; vis.facs = {};
  if (vis.ai) vis.ai.remove();
  vis.ai = null; vis.aiKey = ''; vis.ruinKey = '';
  world.setRuins({});
  if (vis.path) vis.path.remove();
  vis.path = null; vis.pathKey = ''; vis.paintKey = ''; vis.hlKey = '';
  world.highlight(null);
  keys.agents = ''; keys.card = ''; keys.sheet = '';
}
function startNew(tutorial) {
  G = S.create(newSeed(), { tutorial: tutorial });
  Object.assign(V, { sel: null, focus: null, placing: null, paused: false, speed: 1, tab: 'research', skipArm: 0 });
  resetVisuals();
  store.set(G);
  ensurePortraits();
  syncWorld(0);
  renderUI();
  if (tutorial) guide.start();
}

// ---------- 主循环 ----------
function ensurePortraits() {
  G.agents.concat(G.candidates.map((id) => ({ id: id }))).forEach(function (a) {
    if (!portraits[a.id]) portraits[a.id] = world.portrait(LOOK[a.id].model, 256, { yaw: 0.35, dist: 3.3, camY: 0.75, lookY: 0.42 });
  });
}
let saveT = 0;
world.load(MODELS).then(function () {
  world.buildCity({ seed: 11, reserved: {},
    towns: [{ q: 1, r: -3 }, { q: -3, r: 4 }, { q: 4, r: 1 }, { q: 0, r: 3 }, { q: -5, r: 2 }],
    downtown: [{ q: 1, r: 2 }, { q: 2, r: -4 }],
    parks: [{ q: -1, r: -5 }, { q: 3, r: 3 }, { q: 5, r: -3 }, { q: -4, r: 1 }] });
  Object.keys(LOOK).forEach(function (id) {
    portraits[id] = world.portrait(LOOK[id].model, 256, { yaw: 0.35, dist: 3.3, camY: 0.75, lookY: 0.42 });
  });
  skeleton();
  syncWorld(0);
  renderUI();
  layout();
  if (titleOn) showTitle();
  window.addEventListener('resize', layout);
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (G.phase === 'run' && !V.paused && !titleOn && !guide.freeze) {
      S.step(G, dt * V.speed);
      saveT += dt;
      if (saveT > 5) { saveT = 0; store.set(G); }
    }
    if (G.saveNow) { G.saveNow = false; store.set(G); }
    if (V.toastT > 0) V.toastT -= dt;
    if (V.skipArm > 0) V.skipArm -= dt;
    if (V.newArm > 0) V.newArm -= dt;
    consumeFx();
    stepTitleAgents(dt);
    syncWorld(dt);
    renderUI();
    guide.tick();
    world.tick(dt);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  Object.defineProperty(window, '__G', { get: function () { return G; } });
  window.__S = S; window.__guide = guide; window.__V = V; window.__world = world; window.__tap = function (x, y) { tapMap(x, y); renderUI(); };
  window.__ready = true;
}).catch(function (e) { console.error(e); ui.textContent = '加载失败：' + e.message; });
