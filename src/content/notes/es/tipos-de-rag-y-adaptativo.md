---
title: "Tipos de RAG, y por qué Botardo pasó al adaptativo"
description: "Del RAG que busca siempre al que primero decide si tiene que buscar. Un repaso corto de las variantes más comunes y cómo quedó el pipeline de Botardo."
pubDate: 2026-11-02
lang: "es"
draft: false
relatedProjects: ["botardo"]
---

RAG (retrieval-augmented generation) es darle al modelo información que no tiene antes de que responda: buscás en tu base de conocimiento, le pasás lo que encontraste y responde con eso. La idea es simple, pero hay varias formas de armarlo.

## Las variantes más comunes

**RAG lineal (o naive).** Toda pregunta se convierte en un embedding, se buscan los chunks más parecidos y el modelo responde con ellos. Siempre los mismos pasos, sin importar qué te pregunten. Es lo primero que arma todo el mundo, y fue la primera versión de Botardo.

**RAG con reranking.** Igual que el lineal, pero después de la búsqueda vectorial un segundo modelo (un cross-encoder) vuelve a ordenar los resultados mirando la pregunta y cada chunk juntos. La búsqueda trae candidatos rápido y el reranker elige mejor cuáles sirven.

**RAG híbrido.** Combina búsqueda por vectores con búsqueda por palabras clave (tipo BM25). Sirve cuando hay nombres propios, siglas o códigos que el embedding no captura bien.

**RAG correctivo.** Después de buscar, algo evalúa si lo que se trajo alcanza. Si no alcanza, corrige: reformula la consulta, busca de nuevo o busca en otra fuente. Es la idea de [Corrective RAG](https://arxiv.org/abs/2401.15884).

**Self-RAG.** El mismo modelo decide cuándo buscar y critica sus propias respuestas mientras genera ([el paper](https://arxiv.org/abs/2310.11511)).

**RAG adaptativo.** Antes de buscar, se decide qué estrategia usar según la pregunta: no buscar, buscar una vez o buscar en varios pasos. El nombre viene de [Adaptive-RAG](https://arxiv.org/abs/2403.14403), que usa un clasificador de complejidad de la pregunta para elegir.

**RAG agéntico.** Un agente tiene la búsqueda como herramienta y decide solo cuándo, dónde y cuántas veces usarla, en un loop.

## Cómo quedó Botardo

Botardo empezó lineal: cada mensaje se buscaba en el índice, aunque fuera un "hola". El problema era doble. Buscar para un saludo es gastar de más, y cuando la búsqueda no traía lo justo, el modelo respondía igual con lo que había.

Ahora es adaptativo con un paso correctivo:

1. Un router con un modelo chico de decisión clasifica cada mensaje: búsqueda, charla o fuera de tema. También decide si hace falta el historial de la conversación y si el visitante quiere contactarme.
2. Si es charla o fuera de tema, responde sin buscar.
3. Si es búsqueda, trae chunks de Vectorize y los reordena con un reranker.
4. Un juez evalúa si esos chunks alcanzan para responder. Si no alcanzan, hace una segunda búsqueda con la pregunta reescrita según el contexto, junta los resultados y vuelve a evaluar.
5. Recién ahí genera la respuesta, en streaming.

Para que la decisión no sume espera, la búsqueda arranca en paralelo con el router. Si el router dice que no hacía falta, ese resultado se descarta.

## Cómo sé que decide bien

Lo medí con un set de casos de evaluación contra el router en producción. Acertó si había que buscar en 47 de 47 casos y la clasificación del mensaje en 51 de 51. La intención de contacto la detectó en 55 de 56. La decisión tarda alrededor de 124 ms en la mediana.

Probalo en [Botardo](/es/), abajo a la derecha.
