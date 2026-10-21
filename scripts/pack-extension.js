// Zips extension/ into dist/dictate-extension-<version>.zip for the Chrome Web Store,
// with no dependencies. The same files always give the same zip.
//
//   node scripts/pack-extension.js        prints the zip's path
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { ROOT, manifestVersion } from '../server/install.js';

const SOURCE = path.join(ROOT, 'extension');
const DIST = path.join(ROOT, 'dist');

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function listFiles(dir, base = dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => !d.name.startsWith('.'))
    .flatMap((d) => (d.isDirectory() ? listFiles(path.join(dir, d.name), base) : [path.relative(base, path.join(dir, d.name)).replaceAll('\\', '/')]))
    .sort();
}

// A fixed timestamp (2020-01-01 00:00) keeps the zip byte-for-byte reproducible.
const DOS_TIME = 0;
const DOS_DATE = ((2020 - 1980) << 9) | (1 << 5) | 1;

export function packExtension() {
  const version = manifestVersion(SOURCE);
  if (!version) throw new Error('extension/manifest.json has no version');
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const name of listFiles(SOURCE)) {
    const data = fs.readFileSync(path.join(SOURCE, name));
    const packed = zlib.deflateRawSync(data, { level: 9 });
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    locals.push(local, nameBuf, packed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);

    offset += local.length + nameBuf.length + packed.length;
  }
  const centralSize = centrals.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(centrals.length / 2, 8);
  end.writeUInt16LE(centrals.length / 2, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);

  fs.mkdirSync(DIST, { recursive: true });
  const file = path.join(DIST, `dictate-extension-${version}.zip`);
  fs.writeFileSync(file, Buffer.concat([...locals, ...centrals, end]));
  return { file, version };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) console.log(packExtension().file);
