/**
 * Request validation for POST /ask (abuse/cost protection + history trimming).
 */

export const MAX_MESSAGE_LENGTH = 1500;
export const MAX_HISTORY_TURNS = 10;
export const MAX_HISTORY_MESSAGE_LENGTH = 1500;
/** Cap total characters across trimmed history entries. */
export const MAX_HISTORY_TOTAL_CHARS = 12_000;

export type HistoryRole = "user" | "assistant";

export interface ValidatedAskRequest {
  message: string;
  history: Array<{ role: HistoryRole; content: string }>;
  sessionId: string;
}

export type AskValidationError = {
  code: "INVALID_REQUEST";
  error: string;
};

function isHistoryRole(role: unknown): role is HistoryRole {
  return role === "user" || role === "assistant";
}

/**
 * Parse and validate the JSON body. Returns trimmed message, sanitized history,
 * and a session id (caller may still substitute a UUID when absent).
 */
export function validateAskBody(
  body: unknown,
): { ok: true; value: Omit<ValidatedAskRequest, "sessionId"> & { sessionId?: string } } | { ok: false; error: AskValidationError } {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return {
      ok: false,
      error: {
        code: "INVALID_REQUEST",
        error: "El cuerpo debe ser un objeto JSON / Request body must be a JSON object",
      },
    };
  }

  const record = body as Record<string, unknown>;

  if (typeof record.message !== "string") {
    return {
      ok: false,
      error: {
        code: "INVALID_REQUEST",
        error: "Message is required and must be a non-empty string",
      },
    };
  }

  const message = record.message.trim();
  if (message.length === 0) {
    return {
      ok: false,
      error: {
        code: "INVALID_REQUEST",
        error: "Message is required and must be a non-empty string",
      },
    };
  }

  if (message.length > MAX_MESSAGE_LENGTH) {
    return {
      ok: false,
      error: {
        code: "INVALID_REQUEST",
        error: `El mensaje es demasiado largo (máx. ${MAX_MESSAGE_LENGTH} caracteres). / Message is too long (max ${MAX_MESSAGE_LENGTH} characters).`,
      },
    };
  }

  if (record.sessionId !== undefined && typeof record.sessionId !== "string") {
    return {
      ok: false,
      error: {
        code: "INVALID_REQUEST",
        error: "sessionId must be a string when provided",
      },
    };
  }

  const sessionId =
    typeof record.sessionId === "string" && record.sessionId.trim().length > 0
      ? record.sessionId.trim()
      : undefined;

  let history: Array<{ role: HistoryRole; content: string }> = [];
  if (record.history !== undefined) {
    if (!Array.isArray(record.history)) {
      return {
        ok: false,
        error: {
          code: "INVALID_REQUEST",
          error: "history must be an array when provided",
        },
      };
    }
    history = trimHistory(record.history);
  }

  return { ok: true, value: { message, history, sessionId } };
}

/** Keep only valid turns, enforce per-message and total length caps, max 10 entries. */
export function trimHistory(
  raw: unknown[],
): Array<{ role: HistoryRole; content: string }> {
  const valid: Array<{ role: HistoryRole; content: string }> = [];

  for (const entry of raw) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) continue;
    const item = entry as Record<string, unknown>;
    if (!isHistoryRole(item.role) || typeof item.content !== "string") continue;
    const content = item.content.trim();
    if (content.length === 0) continue;
    valid.push({ role: item.role, content: content.slice(0, MAX_HISTORY_MESSAGE_LENGTH) });
  }

  const recent = valid.slice(-MAX_HISTORY_TURNS);
  const out: Array<{ role: HistoryRole; content: string }> = [];
  let totalChars = 0;
  let droppedTurns = 0;

  for (const turn of recent) {
    if (totalChars + turn.content.length > MAX_HISTORY_TOTAL_CHARS) {
      const room = MAX_HISTORY_TOTAL_CHARS - totalChars;
      // Count the dropped turns even when nothing fits (exact-fit case): that
      // is a real truncation and used to stay silent because the count was
      // only assigned after a partial slice had been pushed.
      droppedTurns = recent.length - out.length;
      if (room > 0) {
        out.push({ role: turn.role, content: turn.content.slice(0, room) });
      }
      break;
    }
    totalChars += turn.content.length;
    out.push(turn);
  }

  // Truncation used to be invisible server side; log only counts, which is why
  // no turn text ever appears in the event.
  if (droppedTurns > 0) {
    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        event: "chat.history_truncated",
        kept_turns: out.length,
        dropped_turns: droppedTurns,
      }),
    );
  }

  return out;
}
