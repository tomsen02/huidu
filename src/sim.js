// 规则引擎：照《策划总案 V0.5》实现，不碰画面。
// 策划案写明的数值一律照抄；没写的地方在 GAPS 里列出取值，方便和策划对。
// 状态 G 是纯数据（可直接 JSON 存档），随机数也存在 G 里，读档后结果一致。

export const MAP_R = 6;
export const CELLS = [];
for (let q = -MAP_R; q <= MAP_R; q++) for (let r = -MAP_R; r <= MAP_R; r++) {
  if (Math.abs(q + r) <= MAP_R) CELLS.push({ q: q, r: r });
}
export const key = (c) => c.q + ',' + c.r;
export const dist = (a, b) => Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r), Math.abs(a.q + a.r - b.q - b.r));
const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
const inMap = (c) => dist(c, { q: 0, r: 0 }) <= MAP_R;
// 塌掉的格子（地图破坏）：走不过去、不能出动
export const ruined = (G, c) => !!(G.ruins && G.ruins[key(c)]);
const open = (G, c) => inMap(c) && !ruined(G, c);
export const OUTER = CELLS.filter((c) => dist(c, { q: 0, r: 0 }) === MAP_R);
export const area = (r) => 3 * r * (r + 1) + 1;          // 半径 r 的大六边形格数

export const ROUND_TIME = 180;           // 1.2 伪回合：3 分钟
export const BASE_MOVE = 5;              // 1.3.1 移动 1 格/5s
export const BASE_JUDGE = 6;             // 1.4.1 判定 1 段/6s
export const FAIL_HOLD = 60;             // 1.4.1 失败后延续“事件处理”60s
export const LUCK = [-2, -1, 0, 1, 2];   // 1.4.1 初始“意外”数组
export const SEGS = { 1: 5, 2: 7, 3: 9, 4: 11 };   // 危险评级 → 判定段数
export const COHESION_START = 50;

// 策划案没写、由我们补的取值（给策划确认用）
export const GAPS = {
  startMoney: 6,
  recruitCost: 3,
  eventReward: 1,          // 事件成功 +1 资金（1.5.2 说事件会影响资金，未给数）
  failKeepsEvent: true,    // 失败后事件留在地图上、进度清零
  retreatFromHandling: 'cooldown',
  envPerRound: 1,          // 每回合准备阶段最多新增 1 个环境区块
  envRadius: [1, 2], envLife: [1, 3],
  minJudge: 2, minMove: 1,
  startTechs: { clinic: { q: -2, r: -1 } },   // 开局送一个已建好的街区医疗站（策划案没写开局拥有什么）
  // 地图破坏（10/20 开发安排 §1/§3 只说"部分事件会破坏地图、干员要实时改道"）：哪些事件、多久塌一格由我们定
  ruinEvents: ['团伙火并', '危楼搜救', '黑市武装', '工业泄漏', '街区暴乱', '城区灾害'],
  ruinFirst: 15, ruinEvery: 30, ruinMax: 2,   // 没人处理时开场 15 秒塌第一格，之后每 30 秒一格，每起最多 2 格；事件解决后修好
  // AI 属地（§4 只说随"系列事件"的进度在事件 / 民生 / 都不属于之间变化）
  aiFrom: 2, aiRadius: 1, aiStart: -1,        // 第 2 回合出现；进度 ≤-1 算事件区，0–1 都不算，≥2 算民生区
};

// 十种词条（迈格尔指定）。词条按已拥有干员计数，计数 ≥1 即生效
export const TRAITS = {
  实验体: '处理事件时第一段自动成功',
  生物兵器: '全队只能拥有一名生物兵器，招募候选同样互斥',
  机械体: '每格固定 5 秒，不受移动加减速影响',
  恶徒: '每次设施结算凝聚力 −5',
  榜样: '每次设施结算凝聚力 +5',
  大亨: '每回合基础收入 +2',
  都市英雄: '可部署至地图任意格',
  隐士: '处理失败后立刻待命，无 60 秒滞留',
  老练: '撤退后可立即再次部署',
  全能: '意外值恒为 0',
};

// 干员（测试数据，名字和数值待策划替换）
export const ROSTER = [
  { id: 'lindeng', name: '林灯', role: '街区救援员', anti: 2, rescue: 4, traits: ['榜样'] },
  { id: 'lishi', name: '砾石', role: '外勤执行者', anti: 4, rescue: 2, traits: ['老练'] },
  { id: 'k09', name: 'K-09', role: '机械巡查员', anti: 3, rescue: 3, traits: ['机械体'] },
  { id: 'linghao', name: '零号', role: '适应性实验体', anti: 4, rescue: 4, traits: ['实验体', '生物兵器', '恶徒'], lock: 'bio' },
  { id: 'shouye', name: '守夜人', role: '城市传说', anti: 4, rescue: 4, traits: ['都市英雄', '隐士'] },
  { id: 'wenzhou', name: '闻舟', role: '企业联络人', anti: 2, rescue: 3, traits: ['大亨'] },
  { id: 'heng', name: '衡', role: '综合行动专家', anti: 4, rescue: 4, traits: ['全能'] },
  { id: 'chisun', name: '赤隼', role: '生物强化士兵', anti: 6, rescue: 2, traits: ['生物兵器', '恶徒', '实验体'], lock: 'bio' },
  { id: 'bailu', name: '白芦', role: '志愿医疗队长', anti: 2, rescue: 5, traits: ['榜样', '隐士'] },
];
export const START_AGENTS = ['lindeng', 'lishi', 'k09'];

// 技术。tier 决定花费和时长（1.5.3 标准模型）
export const TIERS = { 1: { cost: 1, time: 3 }, 2: { cost: 2, time: 4 }, 3: { cost: 3, time: 5 }, 4: { cost: 5, time: 7 } };
export const TECHS = [
  { id: 'clinic', name: '街区医疗站', civic: true, tier: 1, radius: 2, cohesion: 3, buff: { rescue: 1 }, desc: '范围内救援 +1' },
  { id: 'radio', name: '应急广播', civic: true, tier: 1, radius: 2, cohesion: 2, buff: { anti: 1 }, desc: '范围内反恶 +1' },
  { id: 'grid', name: '社区互助网', civic: true, tier: 2, radius: 3, cohesion: 5, req: 'clinic', buff: { anti: 1, rescue: 1 }, desc: '范围内全能力 +1' },
  { id: 'transit', name: '公共交通网', civic: true, tier: 2, radius: 3, cohesion: 3, req: 'radio', buff: { move: 1 }, desc: '范围内移动每格 −1 秒' },
  { id: 'shelter', name: '城市庇护网', civic: true, tier: 3, radius: 4, cohesion: 6, req: 'grid', buff: { rescue: 2 }, desc: '范围内救援 +2' },
  { id: 'beacon', name: '公共服务中枢', civic: true, tier: 4, radius: 6, cohesion: 8, req: 'shelter', desc: '放在中心可覆盖全城' },
  { id: 'analysis', name: '判定分析', tier: 1, cohesion: -3, global: { anti: 1, rescue: 1 }, desc: '全体能力 +1' },
  { id: 'predict', name: '预测性管控', tier: 2, cohesion: -5, req: 'analysis', global: { diff: -1 }, desc: '所有事件难度 −1' },
  { id: 'fund', name: '能源商业化', tier: 2, cohesion: -3, global: { income: 2 }, desc: '每回合收入 +2' },
  { id: 'bio', name: '生物强化研究', tier: 2, cohesion: -4, req: 'analysis', desc: '解锁生物兵器干员' },
  // 每回合随机提案（不在主技术树上）
  { id: 'patrol', name: '夜间巡逻', tier: 1, cohesion: -2, proposal: true, global: { move: 1 }, desc: '全体移动每格 −1 秒' },
  { id: 'volunteer', name: '志愿者站', civic: true, tier: 1, radius: 1, cohesion: 2, proposal: true, buff: { judge: 1 }, desc: '范围内判定每段 −1 秒' },
  { id: 'levy', name: '紧急征调', tier: 1, cohesion: -2, proposal: true, global: { deploy: 1 }, desc: '部署上限 +1' },
  // 隐藏分支：反恶事件累计解决 8 起后出现
  { id: 'special', name: '特别行动许可', tier: 3, cohesion: -6, hidden: (G) => G.stats.antiResolved >= 8, global: { anti: 2 }, desc: '全体反恶 +2' },
];
export const tech = (id) => TECHS.find((t) => t.id === id);

// 事件模板：出现等级 1–6，每级一反恶一救援（名字为测试数据）
export const EVENT_TEMPLATES = [
  { level: 1, danger: 1, diff: 2, radius: 0, anti: '街头勒索', rescue: '住宅火情' },
  { level: 2, danger: 1, diff: 3, radius: 1, anti: '仓库劫持', rescue: '交通事故' },
  { level: 3, danger: 2, diff: 4, radius: 1, anti: '团伙火并', rescue: '危楼搜救' },
  { level: 4, danger: 2, diff: 5, radius: 1, anti: '物资抢夺', rescue: '供水中断' },
  { level: 5, danger: 3, diff: 6, radius: 2, anti: '黑市武装', rescue: '工业泄漏' },
  { level: 6, danger: 4, diff: 7, radius: 2, anti: '街区暴乱', rescue: '城区灾害' },
];

// 常规环境区块（1.7 效果库），地图上同时最多 3 种、不重复
export const ENV_TYPES = [
  { id: 'coop', name: '协作街区', desc: '范围内干员能力 +1', ability: 1 },
  { id: 'jam', name: '通信干扰', desc: '接触范围的事件难度 +1', diff: 1 },
  { id: 'block', name: '道路封闭', desc: '范围内移动每格 +2 秒', move: 2 },
  { id: 'blackout', name: '停电', desc: '范围内判定每段 +2 秒', judge: 2 },
];

// 设施扩建（1.5.1）：列出的数值是花钱升上去的各级，默认值是第 0 级
export const UPGRADES = {
  income: { name: '资金配给', block: '中控', values: [1, 3, 5], costs: [4, 15] },
  recruit: { name: '招募渠道', block: '中控', values: [2, 3, 4, 5], costs: [3, 7, 12] },
  parallel: { name: '并行研究', block: '研究', values: [2, 3, 4, 5], costs: [3, 7, 12] },
  research: { name: '研究提速', block: '研究', values: [0, 1, 2], costs: [5, 11] },
  deploy: { name: '外勤编制', block: '后勤', values: [2, 4, 6, 8], costs: [3, 7, 12] },
  move: { name: '行动运输', block: '后勤', values: [0, 1, 2], costs: [5, 11] },
  handle: { name: '事件支援', block: '后勤', values: [0, 1, 2], costs: [5, 11] },
};

// ---------- 随机数（存在 G 里） ----------
function rand(G) {
  G.rng = (Math.imul(G.rng, 1664525) + 1013904223) >>> 0;
  return G.rng / 4294967296;
}
const pick = (G, arr) => arr[Math.floor(rand(G) * arr.length)];
const randInt = (G, a, b) => a + Math.floor(rand(G) * (b - a + 1));

// ---------- 建局 ----------
export function create(seed, opts) {
  const G = {
    v: 1, rng: (seed >>> 0) || 1, round: 1, phase: 'prep', time: ROUND_TIME,
    money: GAPS.startMoney, cohesion: COHESION_START,
    agents: START_AGENTS.map(newAgent), events: [], envs: [],
    owned: Object.keys(GAPS.startTechs), projects: [], placements: JSON.parse(JSON.stringify(GAPS.startTechs)), up: { income: 0, recruit: 0, parallel: 0, research: 0, deploy: 0, move: 0, handle: 0 },
    candidates: [], proposal: null, nextId: 1, ending: null,
    stats: { resolved: 0, failed: 0, antiResolved: 0 }, fx: [], report: null,
    ruins: {}, ai: null,
  };
  enterPrep(G);
  if (opts && opts.tutorial) {
    // 新手引导的第一回合：只放一起好处理的治安事件，离外圈两格；不刷环境区块
    const t = EVENT_TEMPLATES[0];
    G.events = [{ id: G.nextId++, type: 'anti', name: t.anti, level: 1, danger: t.danger, diff: t.diff, radius: t.radius,
      q: -3, r: 4, segs: SEGS[t.danger], ok: 0, bad: 0, clock: 0, log: [], agentId: null, calm: true }];
    G.envs = [];
    G.fx = [];
  }
  return G;
}
function newAgent(id) {
  const d = ROSTER.find((a) => a.id === id);
  return { id: d.id, state: 'reserve', cell: null, next: null, prog: 0, path: [], dest: null, newDest: null,
    autoEvent: null, eventId: null, hold: 0, deployedThisRound: false };
}
export const data = (a) => ROSTER.find((d) => d.id === a.id);
export const has = (a, t) => data(a).traits.indexOf(t) >= 0;
const count = (G, t) => G.agents.filter((a) => has(a, t)).length;
const owned = (G, id) => G.owned.indexOf(id) >= 0;
const upv = (G, k) => UPGRADES[k].values[G.up[k]];
const globalSum = (G, k) => G.owned.reduce((s, id) => s + ((tech(id).global || {})[k] || 0), 0);

// ---------- 覆盖、发展度 ----------
export function techCells(G, id) {
  const at = G.placements[id];
  if (!at) return [];
  const t = tech(id);
  return CELLS.filter((c) => dist(c, at) <= t.radius);
}
export function civicUnion(G) {
  const s = {};
  Object.keys(G.placements).forEach((id) => techCells(G, id).forEach((c) => { s[key(c)] = true; }));
  if (G.ai && G.ai.state === 'civic') aiCells(G).forEach((c) => { s[key(c)] = true; });
  return s;
}
export function eventUnion(G) {
  const s = {};
  G.events.forEach((e) => CELLS.forEach((c) => { if (dist(c, e) <= e.radius) s[key(c)] = true; }));
  if (G.ai && G.ai.state === 'event') aiCells(G).forEach((c) => { s[key(c)] = true; });
  return s;
}
// 1.6.1 发展度：已拥有民生技术的理论最大覆盖格数之和 / 地图格数
export function devPct(G) {
  const sum = G.owned.filter((id) => tech(id).civic).reduce((s, id) => s + area(tech(id).radius), 0) +
    (G.ai && G.ai.state === 'civic' ? area(G.ai.radius) : 0);
  return Math.floor(sum / CELLS.length * 100);
}
export function stage(G) { return Math.min(6, Math.floor(devPct(G) / 20) + 1); }

// 1.4.2 凝聚力档位 → 成功比例
export function successRatio(cohesion) { return cohesion <= 40 ? 0.6 : cohesion <= 80 ? 0.4 : 0.2; }
export function thresholds(segs, cohesion) {
  const S = Math.max(1, Math.round(segs * successRatio(cohesion)));
  return { S: S, F: segs - S + 1 };
}

// ---------- 能力、难度、速度 ----------
function envsAt(G, c) { return G.envs.filter((e) => dist(c, e) <= e.radius); }
function civicAt(G, c) { return Object.keys(G.placements).filter((id) => dist(c, G.placements[id]) <= tech(id).radius); }
export function ability(G, a, ev) {
  const d = data(a), kind = ev.type;
  let n = d[kind];
  let k = globalSum(G, kind);
  if (a.cell) {
    civicAt(G, a.cell).forEach((id) => { k += ((tech(id).buff || {})[kind] || 0); });
    envsAt(G, a.cell).forEach((e) => { k += envType(e).ability || 0; });
  }
  return { n: n, k: k, total: n + k };
}
export function difficulty(G, ev) {
  let y = globalSum(G, 'diff');
  G.envs.forEach((e) => { if (dist(e, ev) <= e.radius + ev.radius) y += envType(e).diff || 0; });
  return { x: ev.diff, y: y, total: ev.diff + y };
}
// 单段成功率（给界面显示）
export function chance(G, a, ev) {
  if (has(a, '全能')) return ability(G, a, ev).total >= difficulty(G, ev).total ? 1 : 0;
  const gap = ability(G, a, ev).total - difficulty(G, ev).total;
  return LUCK.filter((d) => gap >= d).length / LUCK.length;
}
export const envType = (e) => ENV_TYPES.find((t) => t.id === e.type);
export function stepTime(G, a, c) {
  if (has(a, '机械体')) return BASE_MOVE;
  let s = BASE_MOVE - upv(G, 'move') - globalSum(G, 'move');
  civicAt(G, c).forEach((id) => { s -= ((tech(id).buff || {}).move || 0); });
  envsAt(G, c).forEach((e) => { s += envType(e).move || 0; });
  return Math.max(GAPS.minMove, s);
}
export function judgeTime(G, a) {
  let s = BASE_JUDGE - upv(G, 'handle');
  if (a.cell) {
    civicAt(G, a.cell).forEach((id) => { s -= ((tech(id).buff || {}).judge || 0); });
    envsAt(G, a.cell).forEach((e) => { s += envType(e).judge || 0; });
  }
  return Math.max(GAPS.minJudge, s);
}
export function deployCap(G) { return upv(G, 'deploy') + globalSum(G, 'deploy'); }
export const onMap = (a) => a.state === 'idle' || a.state === 'moving' || a.state === 'handling' || a.state === 'stuck';
export function deployedCount(G) { return G.agents.filter(onMap).length; }
export function income(G) { return upv(G, 'income') + 2 * count(G, '大亨') + globalSum(G, 'income'); }
export function cohesionDelta(G) {
  return G.owned.reduce((s, id) => s + tech(id).cohesion, 0) + 5 * count(G, '榜样') - 5 * count(G, '恶徒');
}

// ---------- 阶段流转 ----------
function log(G, text) { G.fx.push({ t: 'log', text: text }); }

// 回合进程前：环境区块 → 事件生成；玩家可部署/移动民生技术
function enterPrep(G) {
  G.phase = 'prep';
  G.time = ROUND_TIME;
  G.agents.forEach((a) => { if (a.state === 'cooldown') a.state = 'reserve'; a.deployedThisRound = false; });
  G.saveNow = true;
  // 环境：到期的移除，再按需新增
  G.envs.forEach((e) => { e.life -= 1; });
  G.envs = G.envs.filter((e) => e.life > 0);
  for (let n = 0; n < GAPS.envPerRound && G.envs.length < 3; n++) {
    const types = ENV_TYPES.filter((t) => !G.envs.some((e) => e.type === t.id));
    if (!types.length) break;
    const c = pick(G, CELLS);
    G.envs.push({ id: G.nextId++, type: pick(G, types).id, q: c.q, r: c.r,
      radius: randInt(G, GAPS.envRadius[0], GAPS.envRadius[1]), life: randInt(G, GAPS.envLife[0], GAPS.envLife[1]) });
  }
  spawnEvents(G);
  if (!G.ai && G.round >= GAPS.aiFrom) spawnAi(G);
  spawnAiEvent(G);
}
// 1.6.2：发展阶段 d 下每回合生成 d 个事件，等级 i 的数量 ≤ d−i+1
export function spawnEvents(G) {
  const d = stage(G), counts = {};
  for (let n = 0; n < d; n++) {
    const levels = [];
    for (let i = 1; i <= d; i++) if ((counts[i] || 0) < d - i + 1) levels.push(i);
    const lv = pick(G, levels);
    counts[lv] = (counts[lv] || 0) + 1;
    // 新事件不和已有事件同一个中心格
    const free = CELLS.filter((x) => !G.events.some((e) => e.q === x.q && e.r === x.r));
    const tpl = EVENT_TEMPLATES[lv - 1], type = rand(G) < 0.5 ? 'anti' : 'rescue', c = pick(G, free.length ? free : CELLS);
    const ev = { id: G.nextId++, type: type, name: tpl[type], level: lv, danger: tpl.danger, diff: tpl.diff, radius: tpl.radius,
      q: c.q, r: c.r, segs: SEGS[tpl.danger], ok: 0, bad: 0, clock: 0, log: [], agentId: null };
    G.events.push(ev);
    G.fx.push({ t: 'spawn', id: ev.id });
  }
  log(G, '发展阶段 ' + d + '，新增 ' + d + ' 起事件');
}

// 准备阶段：部署或移动民生技术（距离不限）
export function placeTech(G, id, c) {
  if (G.phase !== 'prep' || !owned(G, id) || !tech(id).civic || !inMap(c)) return false;
  G.placements[id] = { q: c.q, r: c.r };
  return true;
}
export function startRun(G) {
  if (G.phase !== 'prep') return false;
  G.phase = 'run';
  // 凝聚力档位变了：在办事件如果已经够新阈值，开场直接结算
  G.events.slice().forEach((ev) => { if (ev.agentId) checkDone(G, ev); });
  return true;
}

// ---------- 外勤指令 ----------
export function canDeployAt(G, a, c) {
  if (!open(G, c)) return false;
  return has(a, '都市英雄') || dist(c, { q: 0, r: 0 }) === MAP_R;
}
export function deploy(G, aid, c) {
  const a = G.agents.find((x) => x.id === aid);
  if (G.phase !== 'run' || !a || a.state !== 'reserve' || !canDeployAt(G, a, c) || deployedCount(G) >= deployCap(G)) return false;
  a.state = 'idle'; a.cell = { q: c.q, r: c.r }; a.next = null; a.prog = 0; a.path = [];
  a.deployedThisRound = true;
  return true;
}
// 寻路：六边形网格 BFS，绕开塌掉的格子；走不到返回 null
export function findPath(from, to, G) {
  if (from.q === to.q && from.r === to.r) return [];
  const prev = {}, seen = {}, q = [from];
  seen[key(from)] = true;
  let found = false;
  while (q.length) {
    const c = q.shift();
    if (c.q === to.q && c.r === to.r) { found = true; break; }
    DIRS.forEach((d) => {
      const n = { q: c.q + d[0], r: c.r + d[1] };
      if (!inMap(n) || seen[key(n)] || (G && ruined(G, n))) return;
      seen[key(n)] = true; prev[key(n)] = c; q.push(n);
    });
  }
  if (!found) return null;
  const out = [];
  let c = to;
  while (c && !(c.q === from.q && c.r === from.r)) { out.unshift(c); c = prev[key(c)]; }
  return out;
}
// 从 from 能走到的格子里（绕开塌掉的），挑离 target 最近、路最短的一格
function nearestOpen(G, from, target) {
  const seen = {}, q = [{ c: from, n: 0 }], all = [];
  seen[key(from)] = true;
  while (q.length) {
    const it = q.shift();
    all.push(it);
    DIRS.forEach((d) => {
      const n = { q: it.c.q + d[0], r: it.c.r + d[1] };
      if (!inMap(n) || seen[key(n)] || ruined(G, n)) return;
      seen[key(n)] = true; q.push({ c: n, n: it.n + 1 });
    });
  }
  all.sort((x, y) => dist(x.c, target) - dist(y.c, target) || x.n - y.n);
  return all[0].c;
}
// 去处理事件时站哪：事件范围里没塌、走得到、路最短的一格
function handleCell(G, from, ev) {
  let best = null, bestN = Infinity;
  CELLS.forEach((c) => {
    if (dist(c, ev) > ev.radius || !open(G, c)) return;
    const p = findPath(from, c, G);
    if (p && p.length < bestN) { best = c; bestN = p.length; }
  });
  return best;
}
// 移动：待命的直接走；移动中的在抵达下一格后改走新路径；点到塌掉/走不到的格子就走到旁边最近能到的格
export function move(G, aid, c, autoEvent) {
  const a = G.agents.find((x) => x.id === aid);
  if (!a || !inMap(c) || (a.state !== 'idle' && a.state !== 'moving')) return false;
  if (G.phase !== 'run') return false;
  a.autoEvent = autoEvent || null;
  const from = a.state === 'moving' ? a.next : a.cell;
  if (!open(G, c) || !findPath(from, c, G)) c = nearestOpen(G, from, c);
  if (a.state === 'moving') { a.newDest = { q: c.q, r: c.r }; return true; }
  a.dest = { q: c.q, r: c.r };
  a.path = findPath(a.cell, a.dest, G) || [];
  if (!a.path.length) { tryAuto(G, a); return true; }
  a.next = a.path.shift(); a.prog = 0; a.state = 'moving';
  return true;
}
// 去处理某事件：走到事件覆盖范围里离自己最近的一格，到了自动开始
export function goHandle(G, aid, eid) {
  const a = G.agents.find((x) => x.id === aid), ev = G.events.find((e) => e.id === eid);
  if (!a || !ev) return false;
  if (a.state === 'idle' && dist(a.cell, ev) <= ev.radius) return handle(G, aid, eid);
  const from = a.state === 'moving' ? a.next : a.cell;
  const at = handleCell(G, from, ev);
  return at ? move(G, aid, at, eid) : false;
}
// 路线上有格子塌了：从正在迈进的那一格起重新找路（要去处理事件的，换一个走得到的处理位置）
function reroute(G, a) {
  const from = a.next, ev = a.autoEvent && G.events.find((e) => e.id === a.autoEvent);
  let dest = (ev && handleCell(G, from, ev)) || a.newDest || a.dest;
  if (!open(G, dest) || !findPath(from, dest, G)) dest = nearestOpen(G, from, dest);
  a.newDest = null;
  a.dest = { q: dest.q, r: dest.r };
  a.path = findPath(from, a.dest, G) || [];
}
function tryAuto(G, a) {
  if (!a.autoEvent) return;
  const eid = a.autoEvent; a.autoEvent = null;
  handle(G, a.id, eid);
}
export function handle(G, aid, eid) {
  const a = G.agents.find((x) => x.id === aid), ev = G.events.find((e) => e.id === eid);
  if (G.phase !== 'run' || !a || !ev || a.state !== 'idle' || ev.agentId || dist(a.cell, ev) > ev.radius) return false;
  a.state = 'handling'; a.eventId = ev.id; ev.agentId = a.id; ev.clock = 0; ev.first = true;
  return true;
}
// 撤退：待命 → 离场冷却；处理中 → 视为失败并离场
export function retreat(G, aid) {
  const a = G.agents.find((x) => x.id === aid);
  if (!a || G.phase !== 'run') return false;
  if (a.state === 'handling') {
    const ev = G.events.find((e) => e.id === a.eventId);
    if (ev) failEvent(G, ev, true);
  } else if (a.state !== 'idle') return false;
  a.state = has(a, '老练') ? 'reserve' : 'cooldown';
  a.cell = null; a.next = null; a.path = []; a.eventId = null; a.autoEvent = null;
  return true;
}

// ---------- 时间推进 ----------
export function step(G, dt) {
  if (G.phase !== 'run') return;
  dt = Math.min(dt, G.time);
  // 按不超过 0.25 秒的小步走，倍速时判定和移动也一致
  let left = dt;
  while (left > 1e-9) {
    const h = Math.min(0.25, left);
    left -= h;
    G.time -= h;
    G.agents.forEach((a) => stepAgent(G, a, h));
    G.events.slice().forEach((ev) => stepEvent(G, ev, h));
    G.events.slice().forEach((ev) => stepRuin(G, ev, h));
  }
  if (G.time <= 1e-6) { G.time = 0; endRound(G); }
}
function stepAgent(G, a, h) {
  if (a.state === 'stuck') {
    a.hold -= h;
    if (a.hold <= 0) { a.hold = 0; a.state = 'idle'; }
    return;
  }
  if (a.state !== 'moving') return;
  a.prog += h / stepTime(G, a, a.next);
  while (a.prog >= 1 && a.state === 'moving') {
    a.prog -= 1;
    a.cell = a.next;
    if (a.newDest) { a.dest = a.newDest; a.newDest = null; a.path = findPath(a.cell, a.dest, G) || []; }
    if (a.path.length) { a.next = a.path.shift(); }
    else { a.next = null; a.prog = 0; a.state = 'idle'; tryAuto(G, a); }
  }
}
function stepEvent(G, ev, h) {
  if (!ev.agentId) return;
  const a = G.agents.find((x) => x.id === ev.agentId);
  ev.clock += h;
  const need = judgeTime(G, a);
  if (ev.clock < need) return;
  ev.clock -= need;
  let ok;
  if (ev.first && has(a, '实验体')) ok = true;
  else {
    const D = has(a, '全能') || ev.calm ? 0 : pick(G, LUCK);   // calm：引导用事件，没有意外
    ok = ability(G, a, ev).total >= difficulty(G, ev).total + D;
  }
  ev.first = false;
  if (ok) ev.ok++; else ev.bad++;
  ev.log.push(ok);
  G.fx.push({ t: 'judge', id: ev.id, ok: ok });
  checkDone(G, ev);
}
// 地图破坏：会破坏地图的事件没人处理时，隔一段时间让旁边塌一格。
// 中心格不塌（总留着能去处理的位置）；干员脚下和正要进的格不塌；优先塌在干员要走的路上，塌了马上改道
function stepRuin(G, ev, h) {
  if (GAPS.ruinEvents.indexOf(ev.name) < 0 || ev.agentId || (ev.ruined || 0) >= GAPS.ruinMax) return;
  if (ev.ruinT == null) ev.ruinT = GAPS.ruinFirst;
  ev.ruinT -= h;
  if (ev.ruinT > 0) return;
  ev.ruinT = GAPS.ruinEvery;
  const taken = {};
  G.agents.forEach((a) => { if (a.cell) taken[key(a.cell)] = 1; if (a.next) taken[key(a.next)] = 1; });
  G.events.forEach((e) => { taken[key(e)] = 1; });
  Object.keys(G.placements).forEach((id) => { taken[key(G.placements[id])] = 1; });
  const near = CELLS.filter((c) => { const d = dist(c, ev); return d >= 1 && d <= Math.max(1, ev.radius) && !taken[key(c)] && !ruined(G, c); });
  if (!near.length) return;
  const onPath = (a, c) => a.state === 'moving' && a.path.some((p) => p.q === c.q && p.r === c.r);
  // 干员路线上的格子里，挑离他最近的（正前方的路断了）
  const ahead = (c) => Math.min.apply(null, G.agents.map((a) => (a.state === 'moving' ? a.path.findIndex((p) => p.q === c.q && p.r === c.r) : -1)).filter((i) => i >= 0).concat([99]));
  const hit = near.filter((c) => ahead(c) < 99).sort((x, y) => ahead(x) - ahead(y));
  const c = hit.length ? hit[0] : pick(G, near);
  (G.ruins = G.ruins || {})[key(c)] = ev.id;
  ev.ruined = (ev.ruined || 0) + 1;
  G.fx.push({ t: 'ruin', q: c.q, r: c.r, name: ev.name });
  G.agents.forEach((a) => {
    const d = a.newDest || a.dest;
    if (onPath(a, c) || (a.state === 'moving' && d && d.q === c.q && d.r === c.r)) { reroute(G, a); G.fx.push({ t: 'reroute', agent: a.id }); }
  });
}
function checkDone(G, ev) {
  const th = thresholds(ev.segs, G.cohesion);
  if (ev.ok >= th.S) resolveEvent(G, ev);
  else if (ev.bad >= th.F) failEvent(G, ev, false);
}
function resolveEvent(G, ev) {
  const a = G.agents.find((x) => x.id === ev.agentId);
  G.events.splice(G.events.indexOf(ev), 1);
  if (a) { a.state = 'idle'; a.eventId = null; }
  G.money += GAPS.eventReward;
  G.stats.resolved++;
  // 这起事件弄塌的格子修好
  if (G.ruins) Object.keys(G.ruins).forEach((k) => { if (G.ruins[k] === ev.id) delete G.ruins[k]; });
  if (ev.series && G.ai) setAiProg(G, 1);
  if (ev.type === 'anti') G.stats.antiResolved++;
  G.fx.push({ t: 'resolved', id: ev.id, name: ev.name, agent: a && a.id });
}
function failEvent(G, ev, retreated) {
  const a = G.agents.find((x) => x.id === ev.agentId);
  ev.ok = 0; ev.bad = 0; ev.clock = 0; ev.log = []; ev.agentId = null;
  G.stats.failed++;
  if (a && !retreated) {
    a.eventId = null;
    if (has(a, '隐士')) a.state = 'idle';
    else { a.state = 'stuck'; a.hold = FAIL_HOLD; }
  }
  G.fx.push({ t: 'failed', id: ev.id, name: ev.name, agent: a && a.id });
}

// 回合进程后：判胜负，然后进设施
// 玩家提前结束本回合（10/20 开发安排 §2）：剩下的时间直接作废，不再推进判定和移动
export function endEarly(G) {
  if (G.phase !== 'run') return false;
  G.time = 0;
  endRound(G);
  return true;
}
function endRound(G) {
  G.phase = 'post';
  // AI 属地的系列事件拖到回合结束还没解决：退回一步
  if (G.ai && G.events.some((e) => e.id === G.ai.eventId)) setAiProg(G, -1);
  if (checkEnd(G)) return;
  enterFacility(G);
}
export function checkEnd(G) {
  const total = CELLS.length;
  if (Object.keys(eventUnion(G)).length >= total) return finish(G, false, '事件吞没了整座城市。');
  if (Object.keys(civicUnion(G)).length >= total && !G.events.length) return finish(G, true, '民生技术覆盖全城，所有事件已平息。');
  if (G.cohesion <= 0) return finish(G, false, '城市失去了凝聚力。');
  return false;
}
function finish(G, win, text) {
  G.phase = 'ended';
  G.ending = { win: win, text: text, round: G.round };
  return true;
}

// 设施操作前：收入、研究完成、刷新招募和提案
function enterFacility(G) {
  G.phase = 'facility';
  const inc = income(G);
  G.money += inc;
  const done = [];
  G.projects = G.projects.filter((p) => {
    const dur = Math.max(1, TIERS[tech(p.id).tier].time - upv(G, 'research'));
    if (G.round - p.start >= dur) { G.owned.push(p.id); done.push(p.id); return false; }
    return true;
  });
  rollCandidates(G);
  const pool = TECHS.filter((t) => t.proposal && !owned(G, t.id) && !G.projects.some((p) => p.id === t.id));
  G.proposal = pool.length ? pick(G, pool).id : null;
  G.report = { round: G.round, income: inc, done: done, delta: cohesionDelta(G) };
  G.saveNow = true;
}
function rollCandidates(G) {
  const haveBio = G.agents.some((a) => has(a, '生物兵器'));
  let pool = ROSTER.filter((d) => !G.agents.some((a) => a.id === d.id) && (!d.lock || owned(G, d.lock)));
  if (haveBio) pool = pool.filter((d) => d.traits.indexOf('生物兵器') < 0);
  const out = [];
  while (out.length < upv(G, 'recruit') && pool.length) {
    const d = pool.splice(Math.floor(rand(G) * pool.length), 1)[0];
    out.push(d.id);
    if (d.traits.indexOf('生物兵器') >= 0) pool = pool.filter((x) => x.traits.indexOf('生物兵器') < 0);
  }
  G.candidates = out;
}
export function techCost(G, id) { return TIERS[tech(id).tier].cost; }
export function techTime(G, id) { return Math.max(1, TIERS[tech(id).tier].time - upv(G, 'research')); }
export function techAvailable(G, id) {
  const t = tech(id);
  if (owned(G, id) || G.projects.some((p) => p.id === id)) return false;
  if (t.proposal && G.proposal !== id) return false;
  if (t.hidden && !t.hidden(G)) return false;
  return !t.req || owned(G, t.req);
}
export function research(G, id) {
  if (G.phase !== 'facility' || !techAvailable(G, id) || G.projects.length >= upv(G, 'parallel') || G.money < techCost(G, id)) return false;
  G.money -= techCost(G, id);
  G.projects.push({ id: id, start: G.round });
  if (G.proposal === id) G.proposal = null;
  return true;
}
export function upgradeCost(G, k) { return UPGRADES[k].costs[G.up[k]]; }
export function upgrade(G, k) {
  const c = upgradeCost(G, k);
  if (G.phase !== 'facility' || c === undefined || G.money < c) return false;
  G.money -= c;
  G.up[k]++;
  if (k === 'recruit') rollCandidates(G);
  return true;
}
export function recruit(G, id) {
  if (G.phase !== 'facility' || G.candidates.indexOf(id) < 0 || G.money < GAPS.recruitCost) return false;
  G.money -= GAPS.recruitCost;
  G.agents.push(newAgent(id));
  const isBio = ROSTER.find((d) => d.id === id).traits.indexOf('生物兵器') >= 0;
  G.candidates = G.candidates.filter((x) => x !== id && !(isBio && ROSTER.find((d) => d.id === x).traits.indexOf('生物兵器') >= 0));
  return true;
}
// 设施操作后：凝聚力结算 → 判负 → 下一回合
export function leaveFacility(G) {
  if (G.phase !== 'facility') return false;
  G.cohesion = Math.max(0, Math.min(100, G.cohesion + cohesionDelta(G)));
  if (G.cohesion <= 0) return finish(G, false, '城市失去了凝聚力。');
  G.round++;
  enterPrep(G);
  return true;
}

// ---------- AI 属地（10/20 开发安排 §4：第三种区块，随系列事件的进度在事件 / 民生 / 都不属于之间变化） ----------
const AI_EVENTS = { anti: ['AI 封街', '机器巡逻对峙'], rescue: ['无人车失控', '自动闸门失灵'] };
export const AI_LABEL = { event: '事件区', none: '都不算', civic: '民生区' };
export const aiState = (p) => (p <= -1 ? 'event' : p >= 2 ? 'civic' : 'none');
export function aiCells(G) { return G.ai ? CELLS.filter((c) => dist(c, G.ai) <= G.ai.radius) : []; }
function setAiProg(G, d) {
  const was = G.ai.state;
  G.ai.prog = Math.max(-2, Math.min(3, G.ai.prog + d));
  G.ai.state = aiState(G.ai.prog);
  if (G.ai.state !== was) G.fx.push({ t: 'ai', from: was, to: G.ai.state });
}
// 出现在离中心 2–4 格、不压着民生覆盖和已有事件的地方
function spawnAi(G) {
  const civ = civicUnion(G);
  const opts = CELLS.filter((c) => {
    const d = dist(c, { q: 0, r: 0 });
    return d >= 2 && d <= 4 && !civ[key(c)] && !G.events.some((e) => dist(e, c) <= 1);
  });
  const c = pick(G, opts.length ? opts : CELLS);
  G.ai = { id: G.nextId++, q: c.q, r: c.r, radius: GAPS.aiRadius, prog: GAPS.aiStart, state: aiState(GAPS.aiStart), eventId: null, n: 0 };
  G.fx.push({ t: 'aiNew' });
}
// 每回合一起系列事件（上一起还没解决就不再加）
function spawnAiEvent(G) {
  const ai = G.ai;
  if (!ai || G.events.some((e) => e.id === ai.eventId)) return;
  const type = ai.n % 2 ? 'rescue' : 'anti', lv = Math.min(stage(G) + 1, 3), tpl = EVENT_TEMPLATES[lv - 1];
  const cells = aiCells(G).filter((c) => !G.events.some((e) => e.q === c.q && e.r === c.r) && !ruined(G, c));
  const c = cells.length ? pick(G, cells) : ai;
  const ev = { id: G.nextId++, type: type, name: AI_EVENTS[type][Math.floor(ai.n / 2) % 2], level: lv, danger: tpl.danger, diff: tpl.diff, radius: 0,
    q: c.q, r: c.r, segs: SEGS[tpl.danger], ok: 0, bad: 0, clock: 0, log: [], agentId: null, series: true };
  G.events.push(ev);
  ai.eventId = ev.id; ai.n++;
  G.fx.push({ t: 'spawn', id: ev.id });
}
// 开发试玩用：马上放出 AI 属地
export function spawnAiNow(G) { if (!G.ai) spawnAi(G); spawnAiEvent(G); }
