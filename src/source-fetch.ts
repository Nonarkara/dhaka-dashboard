import { AsyncLocalStorage } from "node:async_hooks";

type Archive = (url: string, response: Response) => Promise<void>;
const archive = new AsyncLocalStorage<Archive>();
let active = 0;
const waiting: Array<() => void> = [];

/** Bound upstream concurrency; archive complete responses inside collector scope. */
export async function fetchSource(url: string, init?: RequestInit): Promise<Response> {
  if (active >= 4) await new Promise<void>(resolve => waiting.push(resolve));
  else active++;
  try {
    const response = await fetch(url, init);
    const sink = archive.getStore();
    if (sink) await sink(url, response.clone());
    return response;
  } finally {
    const next = waiting.shift();
    if (next) next(); else active--;
  }
}
export function withSourceArchive<T>(sink: Archive, collect: () => Promise<T>): Promise<T> {
  return archive.run(sink, collect);
}
