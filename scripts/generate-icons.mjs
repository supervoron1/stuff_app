// Скрипт генерации простых PWA-иконок (зелёный квадрат с точкой)
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const OUT_DIR = join(process.cwd(), "public", "icons");
mkdirSync(OUT_DIR, { recursive: true });

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, "ascii");
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function makePng(size) {
  const bg = [34, 197, 94, 255]; // green-500
  const fg = [255, 255, 255, 255];
  const raw = Buffer.alloc(size * (size * 4 + 1));
  const cx = size / 2;
  const dotR = size * 0.12;

  let offset = 0;
  for (let y = 0; y < size; y++) {
    raw[offset] = 0; // filter None
    offset += 1;
    for (let x = 0; x < size; x++) {
      const corner = size * 0.22;
      let isCorner = false;
      if (x < corner && y < corner) isCorner = Math.hypot(x - corner, y - corner) > corner;
      else if (x >= size - corner && y < corner) isCorner = Math.hypot(x - (size - corner), y - corner) > corner;
      else if (x < corner && y >= size - corner) isCorner = Math.hypot(x - corner, y - (size - corner)) > corner;
      else if (x >= size - corner && y >= size - corner) isCorner = Math.hypot(x - (size - corner), y - (size - corner)) > corner;

      if (isCorner) {
        raw[offset] = 0;
        raw[offset + 1] = 0;
        raw[offset + 2] = 0;
        raw[offset + 3] = 0;
      } else {
        const dist = Math.hypot(x - cx, y - cx);
        const px = dist <= dotR ? fg : bg;
        raw[offset] = px[0];
        raw[offset + 1] = px[1];
        raw[offset + 2] = px[2];
        raw[offset + 3] = px[3];
      }
      offset += 4;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

writeFileSync(join(OUT_DIR, "icon-192.png"), makePng(192));
writeFileSync(join(OUT_DIR, "icon-512.png"), makePng(512));
console.log("Icons generated:", OUT_DIR);