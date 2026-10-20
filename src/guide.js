// 新手剧情 + 手把手引导（对应 10/20 开发安排流程图里的“剧情场景 → 完成新手剧情”）。
// 做法：每一步一句话，给一个高亮目标；玩家做到了就自动进下一步，纯说明的步骤点“好的”。
// 引导期间除了“看判定”那一步，回合时间都停着，不催人。
import { hexToWorld } from './world.js';
import { onMap } from './sim.js';

const STEPS = [
  { story: true, text: '这座城市正在褪色。', sub: '事件越积越多，街区一片片变灰。' },
  { story: true, text: '你是新来的调度员。', sub: '派人处理事件，用技术把街区重新点亮。' },
  { text: '绿色的街区有民生设施照看，房子也是彩色的。', at: { tech: 'clinic' }, ok: true, need: (G) => G.phase === 'prep' },
  { text: '气泡是事件：红色是治安，蓝色是救援。', at: { event: true }, ok: true, need: (G) => G.phase === 'prep' },
  { text: '准备好了，点「开始行动」。', at: { el: '[data-act=start]' }, until: (G) => G.phase === 'run', need: (G) => G.phase === 'prep' },
  { text: '先点一名干员。', at: { el: '.agents' }, until: (G, V) => !!V.sel || G.agents.some(onMap), need: (G) => G.phase === 'run' },
  { text: '外圈亮起的格子都能出动。点这一格，让他出发。', at: { deploy: true }, until: (G) => G.agents.some(onMap), need: (G) => G.phase === 'run' },
  { text: '再点事件气泡，他会自己走过去处理。', at: { event: true },
    until: (G) => G.agents.some((a) => a.autoEvent || a.state === 'handling') || G.stats.resolved > 0, need: (G) => G.phase === 'run' },
  { text: '处理时一格一格判定，蓝勾攒到小旗那格就成功。', at: { el: '.segs', fallback: { event: true } }, flow: true,
    until: (G) => G.stats.resolved > 0 || G.stats.failed > 0, need: (G) => G.phase === 'run' },
  { text: '成功了！每解决一起事件拿 1 块钱。', at: { el: '#t-money' }, ok: true, need: (G) => G.phase === 'run' },
  { text: '时间到了回合会自动结束。这次点这里提前结束。', at: { el: '[data-act=skip]' }, until: (G) => G.phase === 'facility', need: (G) => G.phase === 'run' },
  { text: '回合之间来这里花钱。先研究「应急广播」。', at: { el: '[data-act=research][data-id=radio]' },
    until: (G) => G.projects.some((p) => p.id === 'radio') || G.owned.indexOf('radio') >= 0, need: (G) => G.phase === 'facility' },
  { text: '研究要等几个回合，完成后就能摆到地图上。', at: { el: '.tech.doing' }, ok: true, need: (G) => G.phase === 'facility' },
  { text: '灰色的技术效果更猛，但每回合扣凝聚力。', at: { el: '.tech .ticon.gen' }, ok: true, need: (G) => G.phase === 'facility' },
  { text: '凝聚力越高，处理事件需要的蓝勾越少。', at: { el: '#t-coh' }, ok: true, need: (G) => G.phase === 'facility' },
  { text: '点「出发」进入下一回合，之后就靠你了！', at: { el: '[data-act=next]' }, until: (G) => G.phase !== 'facility', need: (G) => G.phase === 'facility' },
];

export class Guide {
  // api: { G(), V, stage, ui, world, scale(), deployCell(), onDone() }
  constructor(api) {
    this.api = api;
    this.i = -1;
    this.el = document.createElement('div');
    this.el.className = 'guide';
    this.el.innerHTML = '<div class="spot"></div><div class="coach clay"><p></p><small></small><div class="coach-row"><button class="skip-guide">跳过引导</button><button class="ok clay-btn blue">好的</button></div></div>';
    api.stage.appendChild(this.el);
    this.spot = this.el.querySelector('.spot');
    this.coach = this.el.querySelector('.coach');
    const self = this;
    this.el.querySelector('.ok').addEventListener('click', function () { self.go(self.i + 1); });
    this.el.querySelector('.skip-guide').addEventListener('click', function () { self.finish(); });
    // 剧情页点哪都能往下走
    this.el.addEventListener('click', function (e) {
      const s = STEPS[self.i];
      if (s && s.story && !e.target.closest('.skip-guide')) self.go(self.i + 1);
    });
  }
  get active() { return this.i >= 0 && this.i < STEPS.length; }
  // 引导中时间停住，只有“看判定”那一步放行
  get freeze() { return this.active && !STEPS[this.i].flow; }
  start() { this.go(0); }
  finish() {
    this.i = STEPS.length;
    this.el.classList.remove('on', 'story');
    this.api.onDone();
  }
  go(i) {
    const G = this.api.G(), V = this.api.V;
    // 玩家抢先做了后面的事：跳过前提已经不成立的步骤
    while (i < STEPS.length && STEPS[i].need && !STEPS[i].need(G, V)) i++;
    if (i >= STEPS.length) { this.finish(); return; }
    this.i = i;
    const s = STEPS[i];
    this.el.classList.add('on');
    this.el.classList.toggle('story', !!s.story);
    this.coach.querySelector('p').textContent = s.text;
    this.coach.querySelector('small').textContent = s.sub || '';
    this.coach.querySelector('.ok').style.display = s.ok ? '' : 'none';
    this.coach.classList.toggle('has-sub', !!s.sub);
    if (s.flow) V.speed = 2;
    // 目标在滚动区里看不见时，先滚过去
    const api = this.api;
    if (s.at && s.at.el) requestAnimationFrame(function () {
      const el = api.ui.querySelector(s.at.el);
      if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
    });
  }
  // 每帧：检查进度、更新高亮位置
  tick() {
    if (!this.active) return;
    const G = this.api.G(), V = this.api.V, s = STEPS[this.i];
    if (s.until && s.until(G, V)) { this.go(this.i + 1); return; }
    if (s.need && !s.need(G, V)) { this.go(this.i + 1); return; }
    if (s.story) { this.spot.style.display = 'none'; this.place(null); return; }
    const t = this.target(s.at);
    if (!t) { this.spot.style.display = 'none'; this.place(null); return; }
    this.spot.style.display = 'block';
    this.spot.style.left = t.x + 'px'; this.spot.style.top = t.y + 'px';
    this.spot.style.width = t.w + 'px'; this.spot.style.height = t.h + 'px';
    this.spot.style.borderRadius = t.round ? '50%' : '20px';
    this.place(t);
  }
  // 把目标换算成 #stage 里的矩形（手机框可能整体缩放过）
  target(at) {
    const api = this.api, G = api.G(), world = api.world;
    if (!at) return null;
    if (at.el) {
      const el = api.ui.querySelector(at.el) || document.querySelector(at.el);
      if (el && el.offsetParent !== null) {
        const r = el.getBoundingClientRect(), st = api.stage.getBoundingClientRect(), k = api.scale();
        const pad = 6;
        return { x: (r.left - st.left) / k - pad, y: (r.top - st.top) / k - pad, w: r.width / k + pad * 2, h: r.height / k + pad * 2 };
      }
      return at.fallback ? this.target(at.fallback) : null;
    }
    let p = null, y = 0, rad = 34;
    if (at.event) {
      const ev = G.events[0];
      if (!ev) return null;
      p = hexToWorld(ev.q, ev.r); y = 2.8; rad = 36;
    } else if (at.tech) {
      const c = G.placements[at.tech];
      if (!c) return null;
      p = hexToWorld(c.q, c.r); y = 0.4; rad = 70;
    } else if (at.deploy) {
      const c = api.deployCell();
      if (!c) return null;
      p = hexToWorld(c.q, c.r); y = 0; rad = 30;
    }
    if (!p) return null;
    const s = world.screenOf(p.x, y, p.z);
    return { x: s.x - rad, y: s.y - rad, w: rad * 2, h: rad * 2, round: true };
  }
  // 说明气泡放在目标上方或下方，别挡住目标
  place(t) {
    const W = this.api.stage.offsetWidth, H = this.api.stage.offsetHeight;
    const c = this.coach, cw = Math.min(W - 32, 320);
    c.style.width = cw + 'px';
    if (!t) {
      c.style.left = (W - cw) / 2 + 'px';
      c.style.top = (H * 0.42) + 'px';
      return;
    }
    const ch = c.offsetHeight;
    const cx = t.x + t.w / 2;
    c.style.left = Math.max(16, Math.min(W - cw - 16, cx - cw / 2)) + 'px';
    const below = t.y + t.h + 14, above = t.y - ch - 14;
    c.style.top = (t.y + t.h / 2 < H * 0.5 ? (below + ch < H - 8 ? below : above) : (above > 8 ? above : below)) + 'px';
  }
}
