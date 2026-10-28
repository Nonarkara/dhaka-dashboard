/**
 * Node-side wrapper around the shared GIBS tile decoder.
 *
 * The decoding logic lives in src/gibs-png.ts so the Worker and the release
 * scripts use exactly the same rule. Only the inflate step differs: Node has
 * zlib, the Worker has DecompressionStream.
 */
import zlib from "node:zlib";
import { inspectGibsTile } from "../../src/gibs-png.ts";

export async function nodeInflate(bytes) {
  return new Uint8Array(zlib.inflateSync(Buffer.from(bytes)));
}

export async function tileHasData(buf) {
  return inspectGibsTile(buf, nodeInflate);
}
