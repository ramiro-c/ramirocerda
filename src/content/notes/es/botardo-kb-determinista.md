---
title: "Determinism for the win"
description: "Botardo tiene un RAG con mi experiencia y proyectos. Antes lo reindexaba a mano o con un agent. Ahora, si cambia el contenido, un script en CI lo reindexa."
pubDate: 2026-10-04
lang: "es"
draft: false
---

Botardo, el chatbot de mi web, tiene un RAG con mi experiencia y proyectos.

Cada vez que modificaba el contenido tenía que reindexar el conocimiento a mano, o decirle al agent que lo haga. A veces no lo hacía. A veces yo me olvidaba.

Lo venía manejando con skills. Lo que se me ocurrió fue buscarle la vuelta y hacerlo determinista. Después de pingponearlo con mi amigo Claudito, la mejor opción fue meter un script en CI: si se modifica contenido, se reindexa.

Sin LLMs en ese paso. Sin tener que acordarme. 100% determinista.
