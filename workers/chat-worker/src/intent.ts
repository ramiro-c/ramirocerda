/**
 * Hiring / services intent detection for Botardo.
 *
 * Deterministic keyword + regex matcher (es + en). When it fires, the /ask
 * response carries `offerContact: true` and the widget offers the same contact
 * form as the "Trabajemos juntos" button (lead origin "botardo").
 *
 * Kept standalone on purpose: once the adaptive-RAG router lands, this should
 * become one of its intents instead of a separate hook in index.ts.
 */

/** Accent-insensitive, lowercase copy of the message for matching. */
function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

// Patterns run against normalized text (no accents, lowercase).
const SERVICES_PATTERNS: RegExp[] = [
  // es: hiring / contracting
  /\b(contratar(lo|le)?|contratacion|contrato|contratarte)\b/,
  /\b(cotizar|cotizacion|presupuesto|tarifa|honorarios)\b/,
  /\b(freelance|freelancer|consultoria|consultor)\b/,
  /\b(trabajar|laburar) (con|junto)/,
  /\btrabajemos juntos\b/,
  /\b(esta|estas) disponible\b/,
  /\bdisponibilidad\b/,
  /\b(necesito|necesitamos|busco|buscamos|quiero|queremos) (un|una|ayuda|armar|hacer|desarrollar|construir)\b.*\b(proyecto|app|aplicacion|web|sitio|agente|bot|chatbot|sistema|mvp|desarrollador|dev|ingeniero)\b/,
  /\b(tengo|tenemos) un proyecto\b/,
  /\b(como|donde) (lo )?(contacto|contacta|contactarlo|contactar)\b/,
  /\bcontactar(lo|te)?\b/,
  /\b(propuesta|oferta) (laboral|de trabajo)\b/,
  // en: hiring / contracting
  /\b(hire|hiring|hired)\b/,
  /\b(quote|pricing|rates?|budget)\b.*\b(project|work|app|build)\b/,
  /\bhow much (does|do|would|for)\b/,
  /\b(consulting|contractor|contract work)\b/,
  /\bwork (with|together)\b/,
  /\blet'?s work together\b/,
  /\b(is he|are you) available\b/,
  /\bavailability\b/,
  /\b(need|looking for|want) (a|an|help|someone)\b.*\b(project|app|website|site|agent|bot|chatbot|system|mvp|developer|engineer)\b/,
  /\b(we|i) have a project\b/,
  /\b(contact|reach) (him|you|ramiro)\b/,
  /\bget in touch\b/,
  /\bjob (offer|opportunity)\b/,
];

/** True when the visitor's message signals hiring / services intent. */
export function detectServicesIntent(message: string): boolean {
  const text = normalize(message.trim());
  if (text.length === 0) return false;
  return SERVICES_PATTERNS.some((pattern) => pattern.test(text));
}
