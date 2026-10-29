// Draws the Dictate icon (a cursor clicking a tally light) as PNGs and an SVG with no dependencies.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'extension', 'icons');

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const COLORS = { panel: '#131518', rec: '#e23b2e', fg: '#f2f2ee' };

// One set of shapes in a unit square feeds both the PNGs and the SVG. The cursor's tip
// presses the tally light's edge and the click rays fan out into the dark. At 16px the
// cursor grows and the rays drop, so the toolbar icon still reads as a cursor on a light.
const ARROW = [[0, 0], [0, 0.9], [0.235, 0.69], [0.385, 1.02], [0.525, 0.955], [0.375, 0.63], [0.66, 0.63]];
function shapes(size) {
  const small = size <= 16;
  const tally = small ? { cx: 0.4, cy: 0.4, r: 0.27 } : { cx: 0.385, cy: 0.385, r: 0.25 };
  const tip = small ? [0.5, 0.5] : [0.55, 0.55];
  const scale = small ? 0.46 : 0.335;
  return {
    tally,
    cursor: ARROW.map(([x, y]) => [tip[0] + x * scale, tip[1] + y * scale]),
    halo: small ? 0.06 : 0.035, // panel-colored rim that lifts the cursor off the red
    ticks: small ? [] : [[[0.64, 0.495], [0.675, 0.435]], [[0.65, 0.58], [0.72, 0.555]]],
    tickR: 0.021,
  };
}

// Signed-distance shapes, so every size is crisp.
const roundedSquare = (x, y, r) => {
  const qx = Math.abs(x - 0.5) - (0.5 - r);
  const qy = Math.abs(y - 0.5) - (0.5 - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
};
const circle = (x, y, { cx, cy, r }) => Math.hypot(x - cx, y - cy) - r;
const segment = (x, y, [ax, ay], [bx, by], r) => {
  const ex = bx - ax, ey = by - ay;
  const t = Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey) / (ex * ex + ey * ey)));
  return Math.hypot(x - ax - ex * t, y - ay - ey * t) - r;
};
function polygon(x, y, pts) {
  let d = Infinity;
  let sign = 1;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [ax, ay] = pts[i];
    const ex = pts[j][0] - ax, ey = pts[j][1] - ay;
    const wx = x - ax, wy = y - ay;
    const t = Math.max(0, Math.min(1, (wx * ex + wy * ey) / (ex * ex + ey * ey)));
    d = Math.min(d, Math.hypot(wx - ex * t, wy - ey * t));
    const a = y >= ay, b = y < pts[j][1], c = ex * wy > ey * wx;
    if ((a && b && c) || (!a && !b && !c)) sign = -sign;
  }
  return sign * d;
}

// pad: transparent margin as a fraction of the size (the store's 128px icon wants 96px of art).
function draw(size, pad = 0) {
  const buf = Buffer.alloc(size * size * 4);
  const art = size * (1 - 2 * pad);
  const aa = 1 / art;
  const cover = (d) => Math.min(1, Math.max(0, 0.5 - d / aa));
  const [panel, rec, fg] = [COLORS.panel, COLORS.rec, COLORS.fg].map(hex);
  const g = shapes(art);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const x = (px + 0.5 - size * pad) / art;
      const y = (py + 0.5 - size * pad) / art;
      const arrow = polygon(x, y, g.cursor);
      const layers = [
        [panel, cover(roundedSquare(x, y, 0.2))],
        [rec, cover(circle(x, y, g.tally))],
        [panel, cover(arrow - g.halo)],
        [fg, cover(arrow)],
        ...g.ticks.map(([a, b]) => [fg, cover(segment(x, y, a, b, g.tickR))]),
      ];
      let rgb = [0, 0, 0];
      let alpha = 0;
      for (const [color, a] of layers) {
        if (!a) continue;
        rgb = rgb.map((c, i) => c * (1 - a) + color[i] * a);
        alpha = alpha + a * (1 - alpha);
      }
      const o = (py * size + px) * 4;
      buf[o] = rgb[0];
      buf[o + 1] = rgb[1];
      buf[o + 2] = rgb[2];
      buf[o + 3] = Math.round(Math.min(1, alpha) * 255);
    }
  }
  return png(size, buf);
}

function svg() {
  const g = shapes(128);
  const n = (v) => +(v * 128).toFixed(2);
  const points = g.cursor.map(([x, y]) => `${n(x)},${n(y)}`).join(' ');
  const ticks = g.ticks.map(([[ax, ay], [bx, by]]) => `<line x1="${n(ax)}" y1="${n(ay)}" x2="${n(bx)}" y2="${n(by)}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
<rect width="128" height="128" rx="${n(0.2)}" fill="${COLORS.panel}"/>
<circle cx="${n(g.tally.cx)}" cy="${n(g.tally.cy)}" r="${n(g.tally.r)}" fill="${COLORS.rec}"/>
<polygon points="${points}" fill="${COLORS.panel}" stroke="${COLORS.panel}" stroke-width="${n(g.halo * 2)}" stroke-linejoin="round"/>
<polygon points="${points}" fill="${COLORS.fg}"/>
<g stroke="${COLORS.fg}" stroke-width="${n(g.tickR * 2)}" stroke-linecap="round">${ticks}</g>
</svg>
`;
}

fs.mkdirSync(OUT, { recursive: true });
for (const size of [16, 32, 48]) fs.writeFileSync(path.join(OUT, `icon${size}.png`), draw(size));
fs.writeFileSync(path.join(OUT, 'icon128.png'), draw(128, 16 / 128));
fs.writeFileSync(path.join(OUT, 'icon.svg'), svg());
console.log(`Icons written to ${OUT}`);
