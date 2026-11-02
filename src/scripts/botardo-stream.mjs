/**
 * Client side of the /ask contract. Asks for SSE (Accept: text/event-stream) and
 * still understands the plain JSON reply, so an older worker, an error status
 * (400/403/429/500 stay JSON) or a proxy that drops the stream all keep working.
 *
 * Timeouts (one AbortController): `firstTokenMs` until the first text (or the
 * JSON body) arrives, then `idleMs` between chunks. The server bounds its own
 * work at ~24 s of generation plus router/retrieval, so 30 s is the outer limit.
 */

export const FIRST_TOKEN_TIMEOUT_MS = 30_000;
export const IDLE_TIMEOUT_MS = 15_000;

export class BotardoError extends Error {
  /** @param {string} code TIMEOUT | NETWORK | RATE_LIMITED | MODEL_ERROR | SERVER */
  constructor(code, message = code) {
    super(message);
    this.name = "BotardoError";
    this.code = code;
  }
}

/**
 * Parse SSE blocks from a growing buffer. Returns the unparsed tail.
 * @param {string} buffer
 * @param {(event: string, data: unknown) => void} onEvent
 */
export function parseEvents(buffer, onEvent) {
  const blocks = buffer.split(/\r?\n\r?\n/);
  const rest = blocks.pop() ?? "";
  for (const block of blocks) {
    let event = "message";
    const data = [];
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
    }
    if (data.length === 0) continue;
    try {
      onEvent(event, JSON.parse(data.join("\n")));
    } catch {
      // A malformed block is skipped; `done` carries the authoritative reply anyway.
    }
  }
  return rest;
}

/**
 * @param {{
 *   url: string,
 *   payload: unknown,
 *   onMeta?: (meta: { offerContact: boolean }) => void,
 *   onDelta?: (text: string, soFar: string) => void,
 *   firstTokenMs?: number,
 *   idleMs?: number,
 *   fetchImpl?: typeof fetch,
 * }} options
 * @returns {Promise<{ reply: string, offerContact: boolean }>}
 */
export async function askBotardo({
  url,
  payload,
  onMeta = () => {},
  onDelta = () => {},
  firstTokenMs = FIRST_TOKEN_TIMEOUT_MS,
  idleMs = IDLE_TIMEOUT_MS,
  fetchImpl = fetch,
}) {
  const controller = new AbortController();
  let timedOut = false;
  let timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, firstTokenMs);
  const arm = (ms) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, ms);
  };

  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream, application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const type = response.headers.get("Content-Type") ?? "";
    if (!response.ok || !type.includes("text/event-stream") || !response.body) {
      let data = null;
      try {
        data = await response.json();
      } catch {
        data = null;
      }
      if (!response.ok) {
        const code = data?.code === "RATE_LIMITED" || response.status === 429 ? "RATE_LIMITED" : data?.code === "MODEL_ERROR" ? "MODEL_ERROR" : "SERVER";
        throw new BotardoError(code, typeof data?.error === "string" ? data.error : code);
      }
      if (typeof data?.reply !== "string") throw new BotardoError("SERVER");
      return { reply: data.reply, offerContact: data.offerContact === true };
    }

    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";
    let soFar = "";
    let final = null;
    let failure = null;
    let offerContact = false;
    const onEvent = (event, data) => {
      if (event === "meta") {
        offerContact = data?.offerContact === true;
        onMeta({ offerContact });
      } else if (event === "delta" && typeof data?.text === "string") {
        soFar += data.text;
        arm(idleMs);
        onDelta(data.text, soFar);
      } else if (event === "done" && typeof data?.reply === "string") {
        final = { reply: data.reply, offerContact: data.offerContact === true };
      } else if (event === "error") {
        failure = new BotardoError(data?.code === "RATE_LIMITED" ? "RATE_LIMITED" : "MODEL_ERROR", data?.error);
      }
    };
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer = parseEvents(buffer + value, onEvent);
    }
    parseEvents(buffer + "\n\n", onEvent);
    if (failure) throw failure;
    if (final) return final;
    // Stream closed without `done`: treat a cut stream as an error, not a reply.
    throw new BotardoError("SERVER");
  } catch (error) {
    if (error instanceof BotardoError) throw error;
    throw new BotardoError(timedOut ? "TIMEOUT" : "NETWORK", String(error));
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Localized message for an error code. `strings` comes from the page (data-* attributes).
 * @param {string} code
 * @param {{ timeout: string, network: string, rateLimited: string, server: string }} strings
 */
export function errorText(code, strings) {
  if (code === "TIMEOUT") return strings.timeout;
  if (code === "NETWORK") return strings.network;
  if (code === "RATE_LIMITED") return strings.rateLimited;
  return strings.server;
}
