---
slug: spec-refinery
kind: personal
featured: true
order: 7
track: "ai-systems"
tags: ["Python", "LangGraph", "RAG", "FastAPI", "Streamlit"]
repo: https://github.com/ramiro-c/spec-refinery
es:
  title: "Spec Refinery — Refinador de requerimientos para PMs"
  summary: "Pegás un ticket vago y el sistema te interroga ronda a ronda hasta que la spec sea implementable: cruza el pedido con las reglas de la empresa vía RAG, distingue choque real de contexto y no deja pasar una respuesta vaga."
  problem: "Un ticket vago que llega a desarrollo es un problema de meses, no de días. Los pedidos suelen contradecir reglas que la empresa ya escribió (reservas de stock, pasos de envío) y nadie las tiene a mano en el momento de escribir el ticket."
  what: "El sistema interroga hasta que la spec queda implementable: cruza el pedido con el corpus (Chroma + RAG, con el glosario primero), clasifica cada documento recuperado como choque real o contexto, repregunta si la respuesta es evasiva y devuelve la contradicción con el documento que la prueba. El LLM decide qué preguntar en cada ronda (presupuesto visible: 3 preguntas por ronda, 5 rondas), pero las reglas del corpus son evidencia, no ley: si el humano decide cambiarlas, quedan anotadas como decisión. Trazas con Phoenix, `golden_set.json` + `evaluate.py` para medir la calidad de las specs y un modo fake del grafo para correr sin credenciales."
  highlights:
    - "RAG con glosario primero: una contradicción se declara sólo si la definición no la disuelve."
    - "Presupuesto visible: 3 preguntas por ronda, 5 rondas, y el humano cierra cuando quiere."
    - "Choques reales separados de contexto recuperado, cada uno con el documento que lo prueba."
    - "`golden_set.json` + `evaluate.py`: la calidad de las specs se mide, no se supone."
    - "Streamlit + FastAPI, Docker Compose y un modo fake para correr el grafo sin credenciales."
  stack: ["Python 3.12", "LangGraph", "FastAPI", "Streamlit", "Chroma", "Phoenix", "Docker"]
en:
  title: "Spec Refinery — Requirements refiner for PMs"
  summary: "Paste a vague ticket and the system interrogates you round by round until the spec is implementable: it crosses the request with the company's rules through RAG, tells a real clash apart from context, and does not let a vague answer through."
  problem: "A vague ticket that reaches development is a problem of months, not days. Requests often contradict rules the company already wrote down (stock reservations, shipping steps) and nobody has those rules at hand while writing the ticket."
  what: "The system interrogates until the spec is implementable: it crosses the request with the corpus (Chroma + RAG, glossary first), classifies every retrieved document as a real clash or as context, re-asks when the answer is evasive, and returns the contradiction together with the document that proves it. The LLM decides what to ask each round (visible budget: 3 questions per round, 5 rounds), but the corpus rules are evidence, not law: when a human decides to change one, it is recorded as a decision. Phoenix tracing, `golden_set.json` + `evaluate.py` to measure spec quality, and a fake graph mode to run without credentials."
  highlights:
    - "RAG with the glossary first: a contradiction is declared only if the definition does not dissolve it."
    - "Visible budget: 3 questions per round, 5 rounds, and the human closes whenever they want."
    - "Real clashes separated from recovered context, each with the document that proves it."
    - "`golden_set.json` + `evaluate.py`: spec quality is measured, not assumed."
    - "Streamlit + FastAPI, Docker Compose, and a fake mode to run the graph without credentials."
  stack: ["Python 3.12", "LangGraph", "FastAPI", "Streamlit", "Chroma", "Phoenix", "Docker"]

---
