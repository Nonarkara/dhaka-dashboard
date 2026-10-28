/**
 * GIBS tile inspection — shared by the Worker and the release scripts.
 *
 * NASA GIBS sometimes publishes a date directory before the observation
 * behind it is ingested, and serves that date as a fully blank placeholder
 * tile: HTTP 200, non-empty, opaque, and a single uniform colour. A status
 * check or a byte count accepts it as data. Only decoding it tells the
 * truth — and a placeholder painted over the map is an opaque white square,
 * which reads as a broken layer.
 *
 * GIBS tiles are 8-bit palette PNGs, which keeps the decoder small: inflate
 * the IDAT stream, undo the per-scanline filters, then look at the pixels.
 *
 * The inflate step is injected because the environments differ: the Worker
 * uses DecompressionStream, Node uses zlib. This module must not import
 * either, so it stays portable.
 */

export type Inflate = (bytes: Uint8Array) => Promise<Uint8Array>;

export interface GibsTileVerdict {
  /** True when the tile carries actual content rather than a placeholder. */
  hasData: boolean;
  /** Machine-readable explanation, safe to surface in an API. */
  reason: "has-content" | "uniform-colour" | "no-opaque-pixels" | "not-a-png" | "unsupported";
  /** Luminance spread across the tile. A placeholder has none. */
  range?: number;
}

interface PngImage {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
  interlace: number;
  palette: Uint8Array | null;
  data: Uint8Array;
  channels: number;
  stride: number;
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3]) >>>
    0
  );
}

function parseChunks(bytes: Uint8Array): {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
  interlace: number;
  palette: Uint8Array | null;
  idat: Uint8Array[];
} {
  let offset = 8; // PNG signature
  let width = 0;
  let height = 0;
  let bitDepth = 8;
  let colorType = 6;
  let interlace = 0;
  let palette: Uint8Array | null = null;
  const idat: Uint8Array[] = [];
  while (offset + 8 <= bytes.length) {
    const length = readUint32(bytes, offset);
    const type = String.fromCharCode(
      bytes[offset + 4],
      bytes[offset + 5],
      bytes[offset + 6],
      bytes[offset + 7],
    );
    const start = offset + 8;
    if (type === "IHDR") {
      width = readUint32(bytes, start);
      height = readUint32(bytes, start + 4);
      bitDepth = bytes[start + 8];
      colorType = bytes[start + 9];
      interlace = bytes[start + 12];
    } else if (type === "PLTE") {
      palette = bytes.subarray(start, start + length);
    } else if (type === "IDAT") {
      idat.push(bytes.subarray(start, start + length));
    } else if (type === "IEND") {
      break;
    }
    offset = start + length + 4; // length + type + data + crc
  }
  return { width, height, bitDepth, colorType, interlace, palette, idat };
}

async function decodePng(bytes: Uint8Array, inflate: Inflate): Promise<PngImage> {
  const header = parseChunks(bytes);
  if (!header.width || !header.height || !header.idat.length) {
    throw new Error("png: no image data");
  }
  if (header.interlace !== 0) throw new Error("png: interlaced");
  const channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[header.colorType];
  if (!channels) throw new Error(`png: unsupported colour type ${header.colorType}`);
  if (header.bitDepth !== 8) throw new Error(`png: unsupported bit depth ${header.bitDepth}`);

  const raw = await inflate(concat(header.idat));
  const bpp = channels;
  const stride = header.width * channels;
  const out = new Uint8Array(header.height * stride);
  let pos = 0;
  let prev = new Uint8Array(stride);
  for (let y = 0; y < header.height; y++) {
    const filter = raw[pos++];
    const cur = new Uint8Array(stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      let x = raw[pos + i];
      if (filter === 1) x += a;
      else if (filter === 2) x += b;
      else if (filter === 3) x += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        x += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[i] = x & 0xff;
    }
    out.set(cur, y * stride);
    prev = cur;
    pos += stride;
  }
  return {
    width: header.width,
    height: header.height,
    bitDepth: header.bitDepth,
    colorType: header.colorType,
    interlace: header.interlace,
    palette: header.palette,
    data: out,
    channels,
    stride,
  };
}

function concat(chunks: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

/**
 * Decide whether a tile carries an observation or is a blank placeholder.
 *
 * A placeholder is a single uniform colour, so the luminance spread across
 * its pixels is zero. A real raster — night lights, aerosol, flood extent —
 * spans a wide range.
 */
export async function inspectGibsTile(
  bytes: ArrayBuffer | Uint8Array,
  inflate: Inflate,
): Promise<GibsTileVerdict> {
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let img: PngImage;
  try {
    img = await decodePng(buf, inflate);
  } catch {
    return { hasData: false, reason: "not-a-png" };
  }
  const { width, height, colorType, palette, data, channels, stride } = img;
  let min = 255;
  let max = 0;
  let seen = 0;
  for (let y = 0; y < height; y++) {
    const row = y * stride;
    for (let x = 0; x < width; x++) {
      const base = row + x * channels;
      if (colorType === 3) {
        const idx = data[base];
        const r = palette ? palette[idx * 3] : 255;
        const g = palette ? palette[idx * 3 + 1] : 255;
        const b = palette ? palette[idx * 3 + 2] : 255;
        const lum = (r + g + b) / 3;
        if (lum < min) min = lum;
        if (lum > max) max = lum;
        seen++;
      } else if (colorType === 2 || colorType === 6) {
        const lum = (data[base] + data[base + 1] + data[base + 2]) / 3;
        if (lum < min) min = lum;
        if (lum > max) max = lum;
        seen++;
      } else if (colorType === 4) {
        if (data[base + 1] > 8) {
          const lum = data[base];
          if (lum < min) min = lum;
          if (lum > max) max = lum;
          seen++;
        }
      } else {
        const lum = data[base];
        if (lum < min) min = lum;
        if (lum > max) max = lum;
        seen++;
      }
    }
  }
  if (!seen) return { hasData: false, reason: "no-opaque-pixels" };
  const range = max - min;
  if (range <= 2) return { hasData: false, reason: "uniform-colour", range };
  return { hasData: true, reason: "has-content", range };
}

/** Inflate using the Workers runtime's DecompressionStream. */
export async function workerInflate(bytes: Uint8Array): Promise<Uint8Array> {
  // Copy into a plain ArrayBuffer: the incoming view may be backed by a
  // SharedArrayBuffer, which Blob will not accept.
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  const stream = new Blob([copy]).stream().pipeThrough(new DecompressionStream("deflate"));
  const buffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(buffer);
}
