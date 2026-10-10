// Draws the Dictate icon (a pin over a record tally) as PNGs with no dependencies.
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
const PANEL = hex('#26231f');
const AMBER = hex('#e9a43b');
const RED = hex('#e0453a');

// Signed-distance shapes in a unit square, so every size is crisp.
const roundedSquare = (x, y, r) => {
  const qx = Math.abs(x - 0.5) - (0.5 - r);
  const qy = Math.abs(y - 0.5) - (0.5 - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
};
const circle = (x, y, cx, cy, r) => Math.hypot(x - cx, y - cy) - r;

function draw(size) {
  const buf = Buffer.alloc(size * size * 4);
  const aa = 1 / size;
  const cover = (d) => Math.min(1, Math.max(0, 0.5 - d / aa));
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const x = (px + 0.5) / size;
      const y = (py + 0.5) / size;
      const layers = [
        [PANEL, cover(roundedSquare(x, y, 0.2))],
        [AMBER, cover(Math.abs(circle(x, y, 0.5, 0.5, 0.27)) - 0.065)],
        [RED, cover(circle(x, y, 0.5, 0.5, 0.12))],
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

fs.mkdirSync(OUT, { recursive: true });
for (const size of [16, 32, 48, 128]) fs.writeFileSync(path.join(OUT, `icon${size}.png`), draw(size));
console.log(`Icons written to ${OUT}`);
