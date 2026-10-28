/**
 * Message router (adaptive RAG step 1).
 *
 * Decides, before any retrieval, whether the visitor's message needs the
 * knowledge base at all:
 *   - smalltalk:    greetings, thanks, goodbyes, acks. Canned identity reply, no retrieval, no LLM.
 *   - about_ramiro: anything about Ramiro, his work, his notes or Botardo. Goes to retrieval.
 *   - off_topic:    unrelated requests. Polite canned refusal, no retrieval, no generation.
 *
 * Cheap deterministic heuristics run first; a small LLM call is used only when
 * the heuristics cannot decide. Any router failure (error, timeout, unparsable
 * label, LLM disabled) fails open to about_ramiro, which is exactly the old
 * linear behavior.
 */

import type { AdaptiveConfig } from "./config";
import type { Language } from "./language";
import { runSmallModel, type SmallLlmBinding } from "./small-llm";

export type Route = "smalltalk" | "about_ramiro" | "off_topic";
export type SmalltalkKind = "greeting" | "thanks" | "bye" | "ack";

export interface RouteDecision {
  route: Route;
  /** heuristic | llm | fallback (fail-open after an LLM error or unknown label) | disabled (LLM off) */
  via: "heuristic" | "llm" | "fallback" | "disabled";
  smalltalkKind?: SmalltalkKind;
  /** Language implied by the smalltalk phrase itself ("hi" is English even though detectLanguage says es). */
  smalltalkLang?: Language;
}

export interface HistoryTurn {
  role: "user" | "assistant";
  content: string;
}

/** Lowercase, strip accents and punctuation/emoji, collapse whitespace. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9ñ\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface Phrase {
  tokens: string[];
  kind: SmalltalkKind;
  lang?: Language;
}

function phrases(kind: SmalltalkKind, lang: Language | undefined, list: string[]): Phrase[] {
  return list.map((p) => ({ tokens: p.split(" "), kind, lang }));
}

const SMALLTALK_PHRASES: Phrase[] = [
  ...phrases("greeting", "es", [
    "hola", "holis", "holas", "buenas", "buen dia", "buenos dias", "buenas tardes", "buenas noches",
    "que tal", "como va", "como andas", "como estas", "como te va", "todo bien", "que onda", "saludos",
  ]),
  ...phrases("greeting", "en", [
    "hi", "hello", "hey", "hiya", "howdy", "good morning", "good afternoon", "good evening",
    "how are you", "how is it going", "hows it going", "how s it going", "whats up", "what s up", "sup", "yo",
  ]),
  ...phrases("thanks", "es", ["gracias", "muchas gracias", "mil gracias", "te agradezco"]),
  ...phrases("thanks", "en", ["thanks", "thank you", "thx", "ty", "thanks a lot", "many thanks", "cheers"]),
  ...phrases("bye", "es", ["chau", "chao", "adios", "nos vemos", "hasta luego", "hasta pronto", "hasta la proxima"]),
  ...phrases("bye", "en", ["bye", "goodbye", "bye bye", "see you", "see ya", "see you later"]),
  ...phrases("ack", "es", [
    "dale", "perfecto", "genial", "buenisimo", "barbaro", "joya", "de una", "entendido", "listo", "excelente", "copado",
  ]),
  ...phrases("ack", "en", ["cool", "nice", "great", "awesome", "got it", "perfect", "sounds good", "alright"]),
  ...phrases("ack", undefined, ["ok", "okay", "oki", "okey", "k"]),
];

/** Tokens allowed around smalltalk phrases without changing their meaning. */
const FILLER_TOKENS = new Set(["botardo", "bot", "che", "y", "and", "vos", "todo", "muy", "very", "much", "so", "oh", "ah", "eh", "there"]);
const LAUGH = /^(j[aei]){2,}j?$|^(h[ae]){2,}h?$|^lol$|^xd+$|^jaja\w*$|^haha\w*$/;
const MAX_SMALLTALK_TOKENS = 8;

/**
 * Pure smalltalk only: the whole message must be made of greeting/thanks/bye/ack
 * phrases (plus a few fillers and laughs). "hola, ¿dónde trabaja Ramiro?" is NOT smalltalk.
 */
export function matchSmalltalk(message: string): { kind: SmalltalkKind; lang?: Language } | null {
  const tokens = normalize(message).split(" ").filter(Boolean);
  if (tokens.length === 0 || tokens.length > MAX_SMALLTALK_TOKENS) return null;

  let kind: SmalltalkKind | undefined;
  let lang: Language | undefined;
  let i = 0;
  while (i < tokens.length) {
    let best: Phrase | undefined;
    for (const phrase of SMALLTALK_PHRASES) {
      const len = phrase.tokens.length;
      if (len > (best?.tokens.length ?? 0) && phrase.tokens.every((t, k) => tokens[i + k] === t)) {
        best = phrase;
      }
    }
    if (best) {
      // The first meaningful phrase decides the reply ("hola, gracias" greets).
      if (!kind || (kind === "ack" && best.kind !== "ack")) kind = best.kind;
      lang ??= best.lang;
      i += best.tokens.length;
      continue;
    }
    if (FILLER_TOKENS.has(tokens[i]) || LAUGH.test(tokens[i])) {
      i += 1;
      continue;
    }
    return null;
  }
  return { kind: kind ?? "ack", lang };
}

/**
 * Signals that the message is about Ramiro's profile (or Botardo itself). Biased
 * toward recall: a false positive costs one retrieval, which is the old behavior.
 */
const ABOUT_RAMIRO = new RegExp(
  "\\b(" +
    [
      "ramiro", "cerda", "rami", "botardo",
      "experiencia", "experience", "experienced",
      "proyect\\w*", "project\\w*", "portfolio", "portafolio",
      "skill\\w*", "habilidad\\w*", "stack",
      "trabaj\\w*", "laburo", "laburas?", "empleo\\w*", "job\\w*", "career", "carrera",
      "cv", "resume", "curriculum",
      "educacion", "education", "estudi\\w*", "studied", "degree", "titulo", "universidad", "university", "utn",
      "certific\\w*", "idiomas?", "ingles",
      "tech lead", "lider\\w*", "ldp", "librodepases", "libro de pases",
      "notas?", "notes?", "articulos?", "articles?", "blog",
      "factory", "contact\\w*", "linkedin", "github", "email", "mail",
      "contratar\\w*", "hire", "hiring", "freelance", "sueldo", "salary",
      "sos", "quien sos", "who are you", "he", "his", "him",
    ].join("|") +
    ")\\b",
);

export function heuristicRoute(message: string): RouteDecision | null {
  const smalltalk = matchSmalltalk(message);
  if (smalltalk) {
    return { route: "smalltalk", via: "heuristic", smalltalkKind: smalltalk.kind, smalltalkLang: smalltalk.lang };
  }
  if (ABOUT_RAMIRO.test(normalize(message))) {
    return { route: "about_ramiro", via: "heuristic" };
  }
  return null;
}

export const ROUTER_SYSTEM_PROMPT = `You route messages sent to Botardo, the assistant on the personal website of Ramiro Cerdá, a software engineer (Full-Stack Engineer, Tech Lead). Classify the LAST user message into exactly one label:
- about_ramiro: anything about Ramiro (career, jobs, projects, skills, stack, education, certifications, languages, contact, the notes/articles he wrote on the site, his opinions on engineering topics he writes about) or about Botardo itself. Short follow-ups that continue the conversation also count.
- smalltalk: greetings, thanks, goodbyes or chit-chat that asks nothing.
- off_topic: anything unrelated to Ramiro or Botardo (general knowledge, coding help for the visitor, jokes, news, other people, tasks).
If unsure, answer about_ramiro. Reply with the label only.`;

const ROUTER_HISTORY_TURNS = 2;
const ROUTER_TURN_CHARS = 300;

export function parseRouteLabel(raw: string | null): Route | null {
  if (!raw) return null;
  const text = raw.toLowerCase();
  if (/off[\s_-]?topic/.test(text)) return "off_topic";
  if (/small[\s_-]?talk/.test(text)) return "smalltalk";
  if (/about[\s_-]?ramiro/.test(text)) return "about_ramiro";
  return null;
}

export async function routeMessage(
  message: string,
  history: HistoryTurn[] | undefined,
  env: SmallLlmBinding,
  config: Pick<AdaptiveConfig, "routerModel" | "routerLlmEnabled" | "routerTimeoutMs">,
): Promise<RouteDecision> {
  const heuristic = heuristicRoute(message);
  if (heuristic) return heuristic;
  if (!config.routerLlmEnabled) return { route: "about_ramiro", via: "disabled" };

  const context = (history ?? [])
    .slice(-ROUTER_HISTORY_TURNS)
    .map((turn) => `${turn.role}: ${turn.content.slice(0, ROUTER_TURN_CHARS)}`)
    .join("\n");
  const user = context ? `Conversation so far:\n${context}\n\nLast user message: ${message}` : `Last user message: ${message}`;

  const raw = await runSmallModel(env, {
    model: config.routerModel,
    messages: [
      { role: "system", content: ROUTER_SYSTEM_PROMPT },
      { role: "user", content: user },
    ],
    maxTokens: 8,
    timeoutMs: config.routerTimeoutMs,
  });
  const route = parseRouteLabel(raw);
  if (!route) return { route: "about_ramiro", via: "fallback" };
  return route === "smalltalk" ? { route, via: "llm", smalltalkKind: "greeting" } : { route, via: "llm" };
}
