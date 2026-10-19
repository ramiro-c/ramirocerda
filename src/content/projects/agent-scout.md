---
slug: agent-scout
year: "2026"
featured: true
order: 2
tags: ["Python", "Google ADK", "Vertex AI", "LiteLLM", "LLM Evals"]
es:
  title: "Agent Scout — Asistente de scouting"
  summary: "Asistente de scouting para una plataforma futbolística: responde preguntas de clubes y agentes en lenguaje natural llamando a la API de la plataforma — búsqueda de jugadores estructurada y en texto libre, jugadores similares, destinos país→liga→club, encajes para un club y plantillas — construido con Google ADK."
  problem: "Encontrar jugadores es filtrar por veinte combos y buscar a mano. El scouting vive de preguntas difusas: 'busco un central zurdo sub-23, pie similar a X, que jugaría acá'. Los LLM exploratorios sirven para eso, pero cada respuesta tiene que salir de la API real, no del modelo: un scout no puede recibir un jugador que no existe."
  what: "Construí el agente con Google ADK y 9 tools sobre la API de la plataforma: parseo de consultas en texto libre a filtros estructurados, búsqueda híbrida, jugadores similares, mapa de destinos por país/liga/club, encajes por club y perfiles. El proveedor de LLM es intercambiable vía LiteLLM: Vertex AI Gemini en producción o cualquier modelo vía OpenRouter. Responde en español del usuario y pide aclaraciones cuando la pregunta es ambigua, en vez de asumir filtros. Evals determinísticos sin LLM juez: 12 casos scripted (tools, menciones, aclaración, grounding numérico) más 32 consultas reales que miden cobertura de filtros y honestidad sobre criterios no aplicados."
  highlights:
    - "9 tools sobre la API real: búsqueda de jugadores, similares, destinos, encajes por club, plantillas y perfiles."
    - "Consultas en texto libre parseadas a filtros estructurados — el scout pregunta, no asume."
    - "Proveedor de LLM intercambiable: Vertex AI Gemini u OpenRouter vía LiteLLM, mismo agente."
    - "Evals determinísticos: 12 casos scripted + 32 consultas reales midiendo cobertura de filtros y honestidad sobre criterios no aplicados."
  stack: ["Python 3.13", "Google ADK", "Vertex AI", "Gemini", "LiteLLM", "OpenRouter", "uv"]
en:
  title: "Agent Scout — Scouting assistant"
  summary: "A scouting assistant for a football platform: it answers club and agent questions in natural language by calling the platform's API — structured and free-text player search, similar players, country→league→club destinations, club fits, and rosters — built with Google ADK."
  problem: "Finding players means filtering through twenty dropdowns and searching by hand. Scouting lives on fuzzy questions: 'left-footed center-back under 23, profile similar to X, who would fit here'. Exploratory LLMs are a good fit for this, but every answer has to come from the real API, not from the model: a scout can't be handed a player who doesn't exist."
  what: "I built the agent with Google ADK and 9 tools over the platform's API: free-text query parsing into structured filters, hybrid search, similar players, a country/league/club destination map, per-club fits, and profiles. The LLM provider is swappable via LiteLLM: Vertex AI Gemini in production or any model via OpenRouter. It replies in the user's Spanish and asks clarifying questions when the request is ambiguous instead of assuming filters. Deterministic evals with no LLM judge: 12 scripted cases (tools, mentions, clarification, numeric grounding) plus 32 real queries measuring filter coverage and honesty about unapplied criteria."
  highlights:
    - "9 tools over the real API: player search, similar players, destinations, per-club fits, rosters, and profiles."
    - "Free-text queries parsed into structured filters — the scout asks, it doesn't assume."
    - "Swappable LLM provider: Vertex AI Gemini or OpenRouter via LiteLLM, same agent."
    - "Deterministic evals: 12 scripted cases + 32 real queries measuring filter coverage and honesty about unapplied criteria."
  stack: ["Python 3.13", "Google ADK", "Vertex AI", "Gemini", "LiteLLM", "OpenRouter", "uv"]
---
