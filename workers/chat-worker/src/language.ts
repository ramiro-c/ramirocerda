/**
 * Deterministic language detection for the visitor's latest message.
 *
 * The scorer counts Spanish vs English marker words on a word boundary.
 * Ties and empty input default to Spanish (es), which is the site's primary
 * audience and the KB's language (R4 / design D7).
 */

export type Language = "es" | "en";

const ES_MARKERS = [
  "qué", "cómo", "dónde", "cuál", "cuáles", "cuándo", "quién", "quiénes",
  "por qué", "para qué", "cuál es",
  "sos", "estás", "trabajás", "hacés", "tenés", "podés", "querés", "sabés",
  "conocés", "usás", "hizo", "hacen", "estudiaste",
  "experiencia", "proyectos", "habilidades", "educación", "idiomas",
  "trabaja", "trabajo", "trabajas", "laboral", "perfil", "stack",
  "tu", "tus", "sobre", "decime", "contame", "preguntame",
];

const EN_MARKERS = [
  "what", "how", "where", "which", "when", "who", "why",
  "is", "are", "do", "does", "did", "can", "could", "would", "have", "has",
  "you", "your", "work", "works", "working", "worked", "built", "made",
  "experience", "projects", "skills", "education", "languages", "stack",
  "tell", "about", "his", "he", "him",
];

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function countMatches(text: string, markers: string[]): number {
  let count = 0;
  for (const marker of markers) {
    if (new RegExp(`\\b${escapeRegExp(marker)}\\b`, "i").test(text)) {
      count += 1;
    }
  }
  return count;
}

export function detectLanguage(message: string): Language {
  const text = message.trim();
  if (text.length === 0) return "es";
  const es = countMatches(text, ES_MARKERS);
  const en = countMatches(text, EN_MARKERS);
  return es >= en ? "es" : "en";
}
