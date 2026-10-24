---
slug: rag-citation-agent
kind: personal
featured: true
order: 6
track: "ai-systems"
tags: ["Python", "RAG", "Citations", "pytest"]
repo: https://github.com/ramiro-c/rag-citation-agent
es:
  title: "RAG Citation Agent — Respuestas con citas y umbral de confianza"
  summary: "Agente RAG escrito a mano que recupera contexto, responde citando fuentes y marca las respuestas de baja confianza. Si la evidencia no alcanza, amplía la búsqueda y reintenta una vez antes de admitir que no sabe."
  problem: "Un RAG que responde con fluidez pero sin citas verificables no se puede auditar: el modelo puede inventar lo que dice una fuente y nada en la salida lo delata. Y cuando la evidencia es escasa, el camino fácil es la respuesta segura pero inútil."
  what: "El mecanismo es el contenido del repo, no un detalle de implementación de un framework: retrieval detrás de una interfaz `Retriever` (TF-IDF + coseno en memoria, reemplazable por embeddings reales), cliente OpenAI-compatible en JSON mode, y una orquestación explícita — recuperar → responder → validar cada cita (que el `doc_id` exista y que la cita aparezca literal en el texto de la fuente) → gate de confianza → fallback. Si el fallback tampoco sostiene la respuesta, el agente devuelve `insufficient_evidence` en vez de inventar."
  highlights:
    - "Citas validadas contra la fuente: el `doc_id` existe y la quote aparece literal en el texto."
    - "Confidence gate con umbral configurable y fallback de retrieval (una reintención) antes de rendirse."
    - "`insufficient_evidence` explícito: la falta de evidencia es un estado del contrato, no una alucinación silenciosa."
    - "Retriever detrás de una interfaz: TF-IDF hoy, embeddings reales mañana, sin tocar la orquestación."
    - "Corpus local de Wikipedia, demo interactivo y tests de contrato del pipeline."
  stack: ["Python 3.12", "TF-IDF + coseno", "OpenRouter (OpenAI-compatible)", "Pydantic", "pytest", "uv"]
en:
  title: "RAG Citation Agent — Cited answers with a confidence gate"
  summary: "A hand-written RAG agent that retrieves context, answers with cited sources, and flags low-confidence replies. When the evidence is not enough, it widens the search and retries once before admitting it does not know."
  problem: "A RAG that answers fluently without verifiable citations cannot be audited: the model can invent what a source says and nothing in the output gives it away. And when the evidence is thin, the easy path is a safe but useless answer."
  what: "The mechanism is the content of the repo, not an implementation detail of a framework: retrieval behind a `Retriever` interface (in-memory TF-IDF + cosine, swappable for real embeddings), an OpenAI-compatible client in JSON mode, and an explicit orchestration — retrieve → answer → validate every citation (the `doc_id` exists and the quote appears verbatim in the source text) → confidence gate → fallback. If the fallback cannot hold the answer either, the agent returns `insufficient_evidence` instead of making something up."
  highlights:
    - "Citations validated against the source: the `doc_id` exists and the quote appears verbatim in the text."
    - "Confidence gate with a configurable threshold and a retrieval fallback (one retry) before giving up."
    - "Explicit `insufficient_evidence`: missing evidence is a state of the contract, not a silent hallucination."
    - "Retriever behind an interface: TF-IDF today, real embeddings tomorrow, without touching the orchestration."
    - "Local Wikipedia corpus, interactive demo, and contract tests for the pipeline."
  stack: ["Python 3.12", "TF-IDF + cosine", "OpenRouter (OpenAI-compatible)", "Pydantic", "pytest", "uv"]

---
