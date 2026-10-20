// 界面图标：全部是内嵌 SVG（小工具不能联网），带渐变和高光，做出“软胶玩具”的质感。
let uid = 0;
const id = (p) => p + (++uid);

function svg(w, h, body) {
  return '<svg viewBox="0 0 ' + w + ' ' + h + '" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' + body + '</svg>';
}
function lin(gid, a, b, x1, y1, x2, y2) {
  return '<linearGradient id="' + gid + '" x1="' + (x1 || 0) + '" y1="' + (y1 || 0) + '" x2="' + (x2 || 0) + '" y2="' + (y2 == null ? 1 : y2) + '"><stop offset="0" stop-color="' + a + '"/><stop offset="1" stop-color="' + b + '"/></linearGradient>';
}

export const ICON = {
  coin() {
    const g = id('c'), h = id('ch');
    const disc = (y, top) =>
      '<ellipse cx="16" cy="' + (y + 2.2) + '" rx="11" ry="4.2" fill="#c98a12"/>' +
      '<rect x="5" y="' + y + '" width="22" height="2.2" fill="#d99a1c"/>' +
      '<ellipse cx="16" cy="' + y + '" rx="11" ry="4.2" fill="url(#' + (top ? h : g) + ')"/>';
    return svg(32, 32,
      '<defs>' + lin(g, '#ffd86a', '#f2b632') + lin(h, '#ffe9a3', '#f5c142') + '</defs>' +
      disc(22, false) + disc(17, false) + disc(12, true) +
      '<ellipse cx="16" cy="12" rx="6.5" ry="2.2" fill="none" stroke="#e0a524" stroke-width="1.2"/>' +
      '<ellipse cx="12" cy="10.6" rx="3" ry="1" fill="#fff6d6" opacity=".8"/>');
  },
  heart() {
    const g = id('h');
    return svg(32, 32,
      '<defs>' + lin(g, '#ff7b7b', '#e8434b') + '</defs>' +
      '<path d="M16 27.5C9 22.6 3.5 18.2 3.5 11.6 3.5 7.6 6.6 4.8 10.2 4.8c2.5 0 4.6 1.3 5.8 3.3 1.2-2 3.3-3.3 5.8-3.3 3.6 0 6.7 2.8 6.7 6.8 0 6.6-5.5 11-12.5 15.9z" fill="url(#' + g + ')"/>' +
      '<path d="M8.2 9.2c1-1.6 3-2 4.2-1" stroke="#fff" stroke-width="2.2" stroke-linecap="round" fill="none" opacity=".75"/>');
  },
  house() {
    const r = id('r'), w = id('w');
    return svg(32, 32,
      '<defs>' + lin(r, '#ff9f5a', '#f0703a') + lin(w, '#fff8ee', '#f1e4d2') + '</defs>' +
      '<rect x="7" y="14" width="18" height="13" rx="2.5" fill="url(#' + w + ')"/>' +
      '<rect x="13.5" y="19" width="5" height="8" rx="1.5" fill="#f3a35b"/>' +
      '<path d="M3.5 15.5 16 5l12.5 10.5c.8.7.3 2-.8 2H4.3c-1.1 0-1.6-1.3-.8-2z" fill="url(#' + r + ')"/>' +
      '<path d="M9 12.5 16 7" stroke="#fff" stroke-width="1.8" stroke-linecap="round" opacity=".6"/>');
  },
  pause() {
    return svg(24, 24, '<rect x="6" y="5" width="4.2" height="14" rx="2" fill="#4a4f5c"/><rect x="13.8" y="5" width="4.2" height="14" rx="2" fill="#4a4f5c"/>');
  },
  play() {
    return svg(24, 24, '<path d="M8 5.5v13c0 .9 1 1.4 1.7.9l9.4-6.5c.6-.4.6-1.3 0-1.7L9.7 4.6C9 4.1 8 4.6 8 5.5z" fill="#4a4f5c"/>');
  },
  skip() {
    return svg(24, 24, '<path d="M4.5 6.2v11.6c0 .8.9 1.3 1.6.8l7.6-5.8c.5-.4.5-1.2 0-1.6L6.1 5.4c-.7-.5-1.6 0-1.6.8z" fill="#4a4f5c"/><rect x="15.5" y="5" width="3.6" height="14" rx="1.8" fill="#4a4f5c"/>');
  },
  shield() {
    const g = id('s');
    return svg(24, 24,
      '<defs>' + lin(g, '#ff7d72', '#e2463f') + '</defs>' +
      '<path d="M12 2.5 4.5 5.3v6.1c0 4.8 3.2 8.4 7.5 10.1 4.3-1.7 7.5-5.3 7.5-10.1V5.3z" fill="url(#' + g + ')"/>' +
      '<path d="M8 7.2 12 5.7" stroke="#fff" stroke-width="1.8" stroke-linecap="round" opacity=".65"/>');
  },
  cross() {
    const g = id('x');
    return svg(24, 24,
      '<defs>' + lin(g, '#5fb6ff', '#2f86f0') + '</defs>' +
      '<path d="M9.3 3h5.4c.6 0 1 .4 1 1v5.3H21c.6 0 1 .4 1 1v5.4c0 .6-.4 1-1 1h-5.3V22c0 .6-.4 1-1 1H9.3c-.6 0-1-.4-1-1v-5.3H3c-.6 0-1-.4-1-1v-5.4c0-.6.4-1 1-1h5.3V4c0-.6.4-1 1-1z" transform="translate(0 -1) scale(1 .96)" fill="url(#' + g + ')"/>' +
      '<path d="M10.5 5.2v3" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".7"/>');
  },
  flame(color) {
    return svg(24, 24,
      '<path d="M12 2.2c.6 3.2 5.8 6.4 5.8 12 0 3.6-2.6 6.6-5.8 6.6s-5.8-3-5.8-6.6c0-2.6 1.2-4.4 2.4-5.6.2 1.8 1 3 2.2 3.4C10.4 8.6 11.2 5 12 2.2z" fill="' + (color || '#fff') + '"/>' +
      '<path d="M12 13.2c1.2 1.4 2.6 2.6 2.6 4.4 0 1.5-1.2 2.6-2.6 2.6s-2.6-1.1-2.6-2.6c0-1.6 1.6-2.8 2.6-4.4z" fill="' + (color ? '#fff' : '#8cc8ff') + '" opacity=".9"/>');
  },
  alert(color) {
    return svg(24, 24,
      '<rect x="10" y="4" width="4" height="11" rx="2" fill="' + (color || '#fff') + '"/>' +
      '<circle cx="12" cy="19" r="2.3" fill="' + (color || '#fff') + '"/>');
  },
  hexGem(kind) {
    const g = id('g'), e = id('e');
    const a = kind === 'anti' ? ['#ff8a7a', '#e24a44', '#c7353a'] : ['#69bdff', '#3088f0', '#2370d4'];
    const inner = kind === 'anti' ? ICON.alertPath() : ICON.flamePath();
    return svg(56, 60,
      '<defs>' + lin(g, a[0], a[1]) + lin(e, '#ffffff', 'rgba(255,255,255,0)') + '</defs>' +
      '<path d="M28 6.5 49 18.6v24.3L28 55 7 42.9V18.6z" fill="' + a[2] + '" transform="translate(0 2.5)"/>' +
      '<path d="M28 4 49 16.1v24.3L28 52.5 7 40.4V16.1z" fill="url(#' + g + ')" stroke="' + a[2] + '" stroke-width="1" stroke-linejoin="round"/>' +
      '<path d="M28 7.5 46 17.9v6c-6-3.6-13-5-18-5s-12 1.4-18 5v-6z" fill="url(#' + e + ')" opacity=".45"/>' +
      '<g transform="translate(16 16) scale(1)">' + inner + '</g>');
  },
  flamePath() {
    return '<path d="M12 1.5c.7 3.6 6.5 7 6.5 13.4 0 4-2.9 7.4-6.5 7.4s-6.5-3.4-6.5-7.4c0-2.9 1.3-4.9 2.7-6.3.2 2 1.1 3.4 2.5 3.8C10.2 8.6 11.1 4.6 12 1.5z" fill="#fff"/>';
  },
  alertPath() {
    return '<rect x="9.6" y="2.5" width="4.8" height="13" rx="2.4" fill="#fff"/><circle cx="12" cy="20" r="2.7" fill="#fff"/>';
  },
  retreat() {
    return svg(32, 32, '<path d="M12.5 7.5 6 13.5l6.5 6" stroke="#4a4f5c" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M7.5 13.5h11c4 0 7 3 7 6.8S22.5 27 18.5 27H14" stroke="#4a4f5c" stroke-width="3.4" stroke-linecap="round" fill="none"/>');
  },
  check() {
    return svg(24, 24, '<path d="m6 12.5 4 4 8-9" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>');
  },
  xmark() {
    return svg(24, 24, '<path d="m7 7 10 10M17 7 7 17" stroke="#ec5b5b" stroke-width="3" stroke-linecap="round"/>');
  },
  flag() {
    return svg(20, 30, '<rect x="3" y="3" width="2.4" height="26" rx="1.2" fill="#7b6a58"/><path d="M5 3.5h11.5c.7 0 1 .8.6 1.3L14.5 8l2.6 3.2c.4.5.1 1.3-.6 1.3H5z" fill="#3c95f4"/>');
  },
  star() {
    return svg(24, 24, '<path d="m12 3 2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6-4.5-4.2 6.1-.7z" fill="#3c95f4" stroke="#3c95f4" stroke-width="1.2" stroke-linejoin="round"/>');
  },
  gear() {
    return svg(24, 24, '<path d="M10.3 2.5h3.4l.5 2.6 1.9.8 2.2-1.5 2.4 2.4-1.5 2.2.8 1.9 2.6.5v3.4l-2.6.5-.8 1.9 1.5 2.2-2.4 2.4-2.2-1.5-1.9.8-.5 2.6h-3.4l-.5-2.6-1.9-.8-2.2 1.5-2.4-2.4 1.5-2.2-.8-1.9-2.6-.5v-3.4l2.6-.5.8-1.9L4.3 6.8l2.4-2.4 2.2 1.5 1.9-.8z" fill="#5d6270"/><circle cx="12" cy="12" r="3.4" fill="#fff"/>');
  },
  moon() {
    return svg(24, 24, '<path d="M15.5 3.5a8.5 8.5 0 1 0 5 15.2A9 9 0 0 1 15.5 3.5z" fill="#9aa0ad"/>');
  },
  feet() {
    return svg(24, 24, '<ellipse cx="8" cy="9" rx="3" ry="4.5" fill="#f08a3c"/><ellipse cx="16" cy="14" rx="3" ry="4.5" fill="#f08a3c"/><circle cx="8" cy="15.6" r="1.6" fill="#f08a3c"/><circle cx="16" cy="20.6" r="1.6" fill="#f08a3c"/>');
  },
  dropPip(on) {
    return svg(14, 18, '<path d="M7 1.5c.4 2.2 4.5 4.6 4.5 9 0 2.7-2 5-4.5 5s-4.5-2.3-4.5-5c0-2 1-3.4 1.9-4.3.1 1.3.8 2.3 1.7 2.6C5.6 6.7 6.4 3.6 7 1.5z" fill="' + (on ? '#f0503f' : '#d9d2c7') + '"/>');
  },
};
