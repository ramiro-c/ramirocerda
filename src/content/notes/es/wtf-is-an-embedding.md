---
title: "¿Qué c#rajo es un embedding?"
description: "Empecé a leer AI Engineering y me frenó un concepto: representar cualquier cosa con 'flechitas' de muchas dimensiones. Yo solo lo conocía aplicado a palabras. Acá va mi intento de explicarlo simple."
pubDate: 2026-11-01
lang: "es"
draft: false
---

Empecé a leer AI Engineering, de Chip Huyen. En una parte cuenta que hay empresas que representan a sus usuarios con embeddings. Me pareció súper interesante porque yo solo lo había aplicado en un contexto de palabras, pero no a ese nivel. Spotify modela a cada usuario como una secuencia de embeddings que cambia según lo que viene escuchando ([lo publicaron en su blog de research](https://research.atspotify.com/2021/04/contextual-and-sequential-user-embeddings-for-music-recommendation)). Pinterest representa usuarios y pins en el mismo espacio de vectores para el homefeed ([acá el post de su team de engineering](https://medium.com/pinterest-engineering/evolving-pinterests-embedding-retrieval-platform-aede4e831e01)).

Pero el salto que me hizo clic es que no hay nada de especial en las palabras. Es muy loco pensar la cantidad de cosas que se pueden hacer representando cualquier cosa con "flechitas" de muchas dimensiones: con esto podés matchear imágenes con búsquedas por texto, porque un modelo aprende a meterlas en el mismo espacio y tu búsqueda es apenas otro vector que encuentra lo que está cerca. Al final todo es un embedding.
