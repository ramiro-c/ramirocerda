---
title: "Factory engineering: construir el sistema que construye el producto"
description: "Zach Lloyd (Warp) plantea que el software engineering se está convirtiendo en factory engineering: el trabajo pasa a ser el sistema de agentes que produce el producto. Qué propone, y formas concretas de implementarlo."
pubDate: 2026-10-15
lang: "es"
draft: false
---

Vi la charla de Zach Lloyd en el AI Engineer World's Fair y me quedó dando vueltas. La tesis, en sus palabras: *software engineering is becoming factory engineering: building the system of agents that builds the product*.

Es un corrimiento de lugar. Durante décadas el trabajo fue escribir el producto; lo que plantea Lloyd es que el trabajo pasa a ser **construir la software factory que lo produce**, y que esa factory se diseña, se mide y se mejora como cualquier otro sistema.

No es una idea que apareció de golpe en una charla. Warp viene construyendo el arco desde hace un par de años: el 2.0 de junio de 2025 convirtió la terminal en un entorno para dirigir agentes; en agosto de 2026 presentaron **Warp Factories**, que conecta pedidos, agentes, entornos de ejecución y decisiones humanas en un flujo administrado; y en abril de 2026 abrieron el cliente bajo AGPL. Con esa factory shipean alrededor de **2.000 PRs por mes**, con pedidos que entran desde Slack, pasan por Linear, se implementan y llegan a QA.

## Cómo está armada

Cuatro cosas de la charla me parecieron las más concretas:

**1. Triage primero.** Lo que define si un pedido va derecho a implementación o necesita una spec antes no es su tamaño, es su ambigüedad. Un issue claro y acotado se resuelve solo; el que tiene decisiones abiertas necesita que alguien las decida primero. Lloyd distingue dos specs: la de producto (qué comportamiento se espera) y la técnica (cómo se para la arquitectura y el código).

**2. El review y la verificación se quedan adentro.** Shipear completa una pasada, no el ciclo. Lo que pasa en producción vuelve como input de la próxima. El factory loop no termina en el merge.

**3. El skill loop.** Es la que más me gustó. Cuando un senior corrige un comentario que dejó el review automático, un agente observador usa esa corrección para reescribir la skill de review. La corrección humana deja de ser un parche que muere en ese PR y pasa a ser una mejora permanente del sistema.

**4. Comprar la infraestructura no te ahorra el trabajo.** Lloyd separa la infra de la factory (que se puede compartir o comprar) del trabajo de hacerla útil para un producto puntual: adaptar las skills, elegir los puntos de review, sostener el criterio. Y pide medir el output shipeado contra el tiempo humano y el costo en tokens, no contar agentes corriendo.

## Formas de implementarlo

No hace falta comprar una factory para probar el enfoque. De lo más chico a lo más grande:

**Triageá por ambigüedad, no por tamaño.** El criterio no es cuánto trabajo es, sino cuánto hay que decidir.

**Escribí spec solo cuando hace falta.** Para todo lo demás, derecho a implementación.

**Guardá cada corrección humana.** Cuando corregís un review automático, un prompt o un test que faltaba, eso no debería morir en ese PR. Es la materia prima del skill loop.

**Medí costo por PR.** Tokens más tiempo humano por unidad de output. Sin eso no sabés si mejoraste el flujo o simplemente corriste más agentes.

**GitHub Actions + tu tracker + un webhook ya son una versión chica de esto.** El webhook dispara, el tracker ordena el estado, el workflow ejecuta. Lo que comprás después es comodidad, no el concepto.

## Los límites que él mismo marca

Me gustó que la charla no venda autonomía total. Lloyd dice que su factory pública es una implementación que funciona pero imperfecta, que el review humano sigue siendo el cuello de botella, y que una factory eficiente que produce software que nadie quiere falló en su propósito.

## Los recursos

- Charla completa, 20 minutos — https://www.youtube.com/watch?v=tUPPVhBBcoM
- Transcripción editada y puntos clave — https://ai.engineer/talks/tUPPVhBBcoM-software-engineering-is-becoming-factory
- Cómo Warp shipea 2.000 PRs por mes (Lenny's Newsletter) — https://www.lennysnewsletter.com/p/how-warp-ships-2000-prs-a-month-with
- Software factories (Latent Space) — https://www.latent.space/p/software-factories
- Warp Factories, el anuncio — https://www.warp.dev/blog/open-infrastructure-for-building-a-software-factory
- La factory pública, en vivo — https://build.warp.dev/
- Repositorio de demo de la charla — https://github.com/warpdotdev-demos/cloud-factory-demo
- El handbook de Lloyd sobre product-first engineering — https://thezbook.com/code-first-vs-product-first

Yo todavía no mido el costo por PR en ningún lado. Si lo tenés andando, [contame cómo lo medís](https://www.linkedin.com/in/cerdaramiro/).
