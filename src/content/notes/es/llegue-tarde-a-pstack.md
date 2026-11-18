---
title: "Llegué tarde a pstack"
description: "El plugin de Lauren Tan para Cursor es el workflow más pulido que probé para trabajar con agentes. Uso /how, /architect y /poteto-mode, con un mix de modelos más token friendly que el default."
pubDate: 2026-11-18
lang: "es"
draft: false
---

Llegué tarde a pstack, el plugin de Cursor de Lauren Tan (poteto), y me encantó. Es el workflow más pulido que probé para trabajar con agentes.

Entró al marketplace con el [PR #73 de cursor/plugins](https://github.com/cursor/plugins/pull/73), mergeado el 23 de mayo de 2026. Hoy está en la v0.15.43: 22 playbooks y 24 principios.

Las tres skills que uso:

- `/how` para entender el código como está, antes de tocarlo. Desde la v0.15.43 lanza un subagente de solo lectura; lo invoco a mano con `/how`.
- `/architect` para fijar tipos y estructura antes de escribir.
- `/poteto-mode` para ejecutar con un chequeo que pase o falle.

No lo uso con los modelos default, porque me explotan los tokens. Uso un mix más token friendly, que se configura con `/setup-pstack`.

## Para profundizar

- [pstack en cursor/plugins](https://github.com/cursor/plugins/tree/main/pstack)
- [Cambio de la v0.15.43](https://github.com/cursor/plugins/commit/2f87c854fe3e2fcda44ca86b46ede35aad3c46b7)
