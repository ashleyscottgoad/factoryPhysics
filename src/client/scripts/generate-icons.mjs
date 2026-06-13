// Generates the PWA icon set with no image libraries — just the built-in zlib
// PNG encoder below. Draws three ascending white bars (a throughput/idle-growth
// motif) on the app's factory-green, full-bleed so it works as a maskable icon.
// Re-run with: node scripts/generate-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
mkdirSync(OUT, { recursive: true });

const BG = [47, 125, 79]; // #2f7d4f factory green
const FG = [232, 234, 240]; // #e8eaf0 off-white

function render(size) {
  const px = Buffer.alloc(size * size * 4);
  const set = (x, y, [r, g, b]) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255;
  };

  // Background.
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) set(x, y, BG);

  // Three ascending bars, centered, within the maskable safe zone.
  const barW = Math.round(size * 0.13);
  const gap = Math.round(size * 0.07);
  const baseline = Math.round(size * 0.74);
  const heights = [0.20, 0.30, 0.42].map((h) => Math.round(size * h));
  const groupW = barW * 3 + gap * 2;
  let x0 = Math.round((size - groupW) / 2);
  for (const h of heights) {
    for (let x = x0; x < x0 + barW; x++) {
      for (let y = baseline - h; y < baseline; y++) set(x, y, FG);
    }
    x0 += barW + gap;
  }

  return encodePng(size, size, px);
}

// --- Minimal PNG (8-bit RGBA, filter 0) ---
function encodePng(w, h, rgba) {
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0, 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  writeFileSync(join(OUT, name), render(size));
  console.log('wrote', name);
}
