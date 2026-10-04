import "server-only";
import { site } from "@/lib/site";

/**
 * Fetches the authorised data feed, when one is configured. This is a plain, identified request
 * to the address the store was given, with the access token the source issued (if any). When the
 * source refuses it — a login wall, a 401/403, a bot check — the run stops with that message.
 * There is no fallback route: the alternative is uploading the export by hand.
 */
export class FeedAccessError extends Error {
  /** true when retrying later cannot help (the source said no) */
  constructor(message: string, public permanent: boolean) {
    super(message);
  }
}

const MAX_BYTES = 25 * 1024 * 1024;

export function checkFeedUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new FeedAccessError("The feed address is not a valid URL.", true);
  }
  if (url.protocol !== "https:") throw new FeedAccessError("The feed address must start with https://.", true);
  if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|\[?::1)/i.test(url.hostname) || /^\d+\.\d+\.\d+\.\d+$/.test(url.hostname)) throw new FeedAccessError("The feed address must be a public host name.", true);
  return url;
}

export async function fetchFeed(rawUrl: string): Promise<{ text: string; fileName: string }> {
  const url = checkFeedUrl(rawUrl);
  const token = process.env.HIPCOMIC_FEED_TOKEN;
  let res: Response;
  try {
    res = await fetch(url, {
      signal: AbortSignal.timeout(45_000),
      headers: { accept: "application/json, text/csv;q=0.9", "user-agent": `RareComicsCollectors-Import/1.0 (+${site.url})`, ...(token ? { authorization: `Bearer ${token}` } : {}) },
      cache: "no-store",
    });
  } catch (err) {
    throw new FeedAccessError(`The feed could not be reached (${err instanceof Error ? err.message : String(err)}).`, false);
  }
  if (res.status === 401 || res.status === 403) throw new FeedAccessError(`The source refused the request (HTTP ${res.status}). Check the feed address and the access token with the source; nothing was imported.`, true);
  if (res.status === 404 || res.status === 410) throw new FeedAccessError(`The feed address does not exist (HTTP ${res.status}).`, true);
  if (res.status === 429 || res.status >= 500) throw new FeedAccessError(`The source is busy or down (HTTP ${res.status}); it will be tried again later.`, false);
  if (!res.ok) throw new FeedAccessError(`The feed answered HTTP ${res.status}.`, true);
  const length = Number(res.headers.get("content-length") ?? 0);
  if (length > MAX_BYTES) throw new FeedAccessError("The feed is larger than 25 MB.", true);
  const text = await res.text();
  if (text.length > MAX_BYTES) throw new FeedAccessError("The feed is larger than 25 MB.", true);
  if (/^\s*<(!doctype|html)/i.test(text)) throw new FeedAccessError("The source answered with a web page instead of data (a login or access check). Nothing was imported and nothing was done to get around it.", true);
  const name = url.pathname.split("/").filter(Boolean).pop() ?? "feed";
  return { text, fileName: `${name.slice(0, 80)} (${new Date().toISOString().slice(0, 10)})` };
}
