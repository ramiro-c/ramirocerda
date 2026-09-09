---
title: "Qué pasa con UX, QA y Devs cuando el código lo generan los agentes"
description: "Cuando generar código se vuelve casi gratis, el cuello de botella ya no es tipear. Cómo cambia el trabajo de un equipo de producto cuando pasamos del pipeline lineal a gobernar agentes."
pubDate: 2026-09-08
lang: "es"
draft: false
---

Casi toda la conversación sobre desarrollo con inteligencia artificial sigue estancada en la misma pregunta: *¿cuál es el mejor chat para tirar código?* o *¿cómo hago para que el modelo me autocomplete más rápido?*

Pero una vez que empezás a usar agentes en serio para resolver tareas complejas, el problema se mueve de lugar enseguida. Escribir código deja de ser el cuello de botella. Cuando podés pedirle a un agente que te arme un módulo entero, una migración y una batería de tests en un par de minutos, lo que se rompe no es el editor: es la forma en la que venimos organizando los equipos de desarrollo desde hace veinte años.

El modelo tradicional (el clásico SDLC) funciona como una cinta transportadora: el PM escribe un ticket, diseño dibuja pantallas en Figma, el dev pica el código, QA prueba lo que puede al final de la cola y DevOps lo manda a producción. Todo en fila india, pasando la posta de mano en mano.

Si acelerás esa cinta transportadora a 10x con agentes que generan código sin parar, el sistema no se vuelve 10x más ágil. Se atasca. Se acumulan PRs gigantescos que nadie llega a revisar, features que compilan pero no resuelven nada, y una deuda invisible que crece abajo de la alfombra: lo que en el manifiesto de ADLC (Agentic Development Life Cycle) se llama **Validation Debt**, que es la cantidad de código generado que llega a producción sin que nadie haya medido si realmente sirvió para algo en el mundo real.

¿Qué pasa entonces con los roles tradicionales? ¿Los agentes sacan del medio al diseñador, al QA o al programador?

La respuesta corta es que no, pero les cambia el foco por completo. Pasan de la producción mecánica al juicio y la gobernanza.

### 1. El Diseñador de Producto / UX: de la fábrica de pantallas a gobernar software vivo

En el flujo lineal de siempre, diseño pasa semanas ajustando componentes estáticos en Figma, especificando espaciados y peleando para que el frontend quede pixel-perfect.

Cuando sumás agentes, el salto es enorme:
- En lugar de dibujar 40 variantes estáticas de una pantalla, diseña el **modelo mental**, los flujos críticos y el **Design System** (tokens, reglas visuales, coherencia de marca).
- Los agentes pueden generar componentes interactivos directamente en código sobre ese sistema de diseño en cuestión de minutos.
- A la hora de revisar, el diseñador ya no mira un mockup muerto en Figma: audita una aplicación viva en el navegador, evalúa la ergonomía real, descarta lo que se siente tosco y aprueba la interacción que mejor funciona.

El rol no desaparece; se libera del trabajo de operario de interfaces para concentrarse en el gusto, la usabilidad y la experiencia real de quien usa el producto.

### 2. El Desarrollador: de tipear boilerplate a ser arquitecto de límites

La mayor parte del tiempo de un desarrollador en un sprint típico se va en cosas repetitivas: armar DTOs, escribir queries CRUD, conectar adaptadores y pelear con tipos.

Con agentes bien orquestados, ese trabajo mecánico lo absorbe la máquina. El rol del dev se mueve hacia dos lugares mucho más valiosos:
1. **Definir invariantes y arquitectura:** El humano fija los límites que los agentes no pueden cruzar. Por ejemplo: *"en esta app todo se escribe primero en la base local offline; nada bloquea la UI por red; no se meten dependencias de pago"*.
2. **Construir el harness:** Diseñar el entorno donde los agentes operan (sus contratos, los linters, el contexto que leen y los oráculos contra los que se miden).

El programador deja de ser un compilador humano que traduce requerimientos en líneas de código para pasar a ser el arquitecto que define el terreno de juego y audita la seguridad, la robustez y la mantenibilidad.

### 3. QA: de testear a mano al final de la cola a dirigir la prueba adversaria

QA suele ser el rol más castigado del pipeline secuencial: llega siempre tarde, con poco tiempo antes de la fecha límite y obligado a hacer testing manual repetitivo.

En un ciclo con agentes, la validación corre **al mismo tiempo** que la generación:
- Tenés un agente generando la funcionalidad y otro agente (el validador) corriendo en simultáneo intentando romperla, generando casos borde, inyecciones de datos raros y tests de regresión antes de que cualquier humano lo mire.
- El especialista en QA pasa a ser el **director de esa estrategia**: define los oráculos de prueba, le enseña al agente qué esquinas oscuras del sistema atacar y vigila que no se aprueben cambios solo porque "pasan los tests unitarios", sino porque hay evidencia de que el sistema resiste el uso real.

Pasa de ser el cuello de botella que frena el release a ser el estratega de calidad del sistema.

### 4. El Product Manager: de backlog groomer a dueño de hipótesis

En el modelo tradicional, el PM pasa horas escribiendo historias de usuario larguísimas que intentan predecir el futuro en un ticket de Jira.

En este nuevo esquema, los requerimientos estáticos se reemplazan por **Bets (apuestas)**. Una Bet no es una orden de trabajo; es una hipótesis explícita:
> *"Creemos que resolver X va a provocar Y, y lo vamos a saber cuando la telemetría muestre Z antes de tal fecha."*

El PM deja de gestionar un cementerio de tickets pendientes para pasar a formular apuestas acotadas, definir qué métrica define el éxito y gobernar la señal que vuelve de producción para decidir si una apuesta se consolida, se redirige o se descarta rápido sin lamentar el tiempo invertido.

---

### Equipos que gobiernan, agentes que ejecutan

Al final, la convivencia no pasa por reemplazar personas por scripts, sino por romper la ilusión de la cinta transportadora.

En vez de pasarse una posta lenta donde cada disciplina se queja de la anterior, el equipo de producto opera como un **consejo de gobernanza**: el PM, el UX, el Dev y el QA definen la intención, fijan las restricciones y evalúan la evidencia juntos, mientras los agentes se encargan de la fontanería pesada en paralelo.

Menos tiempo tipeando pantallas y formularios; mucho más tiempo ejerciendo criterio sobre lo que de verdad le llega a la gente.
