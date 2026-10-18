---
slug: agent-mcp
status: active
year: "2026"
featured: false
order: 3
tags: ["Python", "MCP", "Vertex AI", "Security"]
es:
  title: "Agent MCP — Tu asistente de la plataforma dentro del editor"
  summary: "Servidor MCP (stdio) que expone el asistente de producto de la plataforma futbolística como una tool `ask(message)` para agentes de código: el agente corre desplegado en Vertex AI Agent Engine y el server solo hace de puente, llevando el JWT del usuario en el estado de la sesión remota. Wired a OpenCode y Claude Desktop."
  problem: "El asistente vive desplegado en la nube, pero el trabajo real pasa en el editor y en la terminal: quería preguntarle a mi agente de código directamente ('¿cuántos jugadores cargó este club esta semana?') y que respondiera con datos de la plataforma, sin copiar tokens ni pegar contexto a mano. El transporte stdio de MCP es el estándar para eso, pero unir identidad, secretos y sesión remota tiene trampa: el password no puede quedar en el entorno ni en disco, y la sesión remota tiene que sobrevivir a la rotación del JWT."
  what: "El server es un puente deliberadamente angosto: una sola tool, `ask(message, reset)`, contra el agente desplegado en Agent Engine, reutilizando una sesión por proceso y reconstruyéndola cuando rota el JWT. La identidad viaja igual que en el smoke test de deploy: el JWT del usuario va en el estado de la sesión remota, así que plan, permisos y datos privados son exactamente los del usuario. Los secretos viven en el macOS Keychain: un script de setup one-time valida el password con un login real y lo guarda ahí; el server solo lo lee cuando el JWT cacheado (gitignored, modo 0600) está por vencer. El password nunca toca el entorno ni el disco, y no viaja a ningún lado salvo al endpoint de auth de la plataforma por HTTPS."
  highlights:
    - "Una sola tool, ask(message, reset): el server es un puente, no una capa de datos — quien razona es el agente desplegado."
    - "Password en el macOS Keychain vía script de setup one-time que lo valida con un login real; nunca en el entorno ni en disco."
    - "JWT cacheado localmente (0600) con sesión remota que se reconstruye sola cuando el token rota."
    - "Misma config para OpenCode y Claude Desktop: command, env y timeout de ejecución larga."
  stack: ["Python 3.13", "MCP", "Vertex AI Agent Engine", "macOS Keychain", "uv", "pytest"]
en:
  title: "Agent MCP — The platform assistant inside your coding agent"
  summary: "An MCP server (stdio) that exposes the football platform's product assistant as a single `ask(message)` tool for coding agents: the agent runs deployed on Vertex AI Agent Engine and the server is just a bridge, carrying the user's JWT in the remote session state. Wired into OpenCode and Claude Desktop."
  problem: "The assistant lives deployed in the cloud, but real work happens in the editor and the terminal: I wanted to ask my coding agent directly ('how many players did this club load this week?') and get an answer backed by platform data, without copying tokens or pasting context by hand. MCP's stdio transport is the standard for this, but joining identity, secrets, and a remote session is tricky: the password can never sit in the environment or on disk, and the remote session has to survive JWT rotation."
  what: "The server is a deliberately narrow bridge: one tool, `ask(message, reset)`, against the agent deployed on Agent Engine, reusing one session per process and rebuilding it when the JWT rotates. Identity travels exactly like in the deploy smoke test: the user's JWT goes in the remote session state, so plan, permissions, and private data are exactly that user's. Secrets live in the macOS Keychain: a one-time setup script validates the password with a real login and stores it there; the server only reads it when the cached JWT (gitignored, mode 0600) is about to expire. The password never touches the environment or disk, and it travels nowhere except the platform's own auth endpoint over HTTPS."
  highlights:
    - "One tool, ask(message, reset): the server is a bridge, not a data layer — the deployed agent does the reasoning."
    - "Password in the macOS Keychain via a one-time setup script that validates it with a real login; never in the environment or on disk."
    - "JWT cached locally (0600) with a remote session that rebuilds itself when the token rotates."
    - "Same config shape for OpenCode and Claude Desktop: command, env, and a long execution timeout."
  stack: ["Python 3.13", "MCP", "Vertex AI Agent Engine", "macOS Keychain", "uv", "pytest"]
---
