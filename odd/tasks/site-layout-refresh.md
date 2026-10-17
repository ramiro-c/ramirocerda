# Site layout refresh

**Objective:** Redesign the whole site with the won home variant B (projects + notes rail hub) and remove the linear/static feel of every page: about, work, workflow, notes — adding cross-links between notes and projects.
**Branch:** `redesign/site-layout` (from main) · capturas de prototipo en `prototype/home-variants`
**Delivery strategy:** work-unit commits per page/task; user feedback loop per page before integration.
**Test runner:** `pnpm build` (static Astro site; no test suite) + dev-server spot checks on each page.

## Specs

- S1: "me gusto el B ahi che" — the home fusa to the variant-B hub layout: projects column (catalog treatment: status-led meta, filete fino, no journal feel) + sticky notes rail on the right; mobile collapses to single column.
- S2: "lo unico que deberiamos iterar el resto de secciones para que no queden tan lineales/estaticas" — about, work, workflow and notes pages get less linear layouts (user feedback accepted per page before integration).
- S3: "las notas no quedan a la vista y siento que no esta bien interconectada" — notes visible from home (rail) and interconnected: cross-links note↔proyecto related, note↔notas related, project↔notas related. Also dates returned to the notes listing (una señal de vida).
- S4: "muy de diario" — proyecto items must read as work/catalog (status · tipo · year led, tight filetes), never as journal entries; that's the harmony line with the notes rail.

Assumptions (marked as assumptions):
- i18n: cada página existe en ES (`/`) y EN (`/en/`); las pages EN must follow the same layout per task.
- Botardo widget interactions (cta.botardo, data-open-botardo) must keep working on home.
- Shared components (`ProjectList`) will be extended carefully, but existing pages must not break when not touched by a task.

## Tasks

- T1: Capture ?variant= home prototype on throwaway branch `prototype/home-variants`. — S1 — route: parent — commit: 73237b1 (branch)
- T2: Fold variant B into real home (ES + EN), delete prototype machinery from main line, verify build + both langs. — S1, S4 — route: parent — commit: fc99b47
- T3: Interconnection: related-links section between notes, projects and related notes (detail pages + data mapping). — S3 — route: parent — commit: b18c8ed (relatedProjects frontmatter schema + ui keys + related sections on note/project detail + dates back in notes index)
- T4: `/notes` redesign (datos: dates, rhythm, less linear) prototype → user feedback → integrate (ES+EN). — S2, S3 — route: parent — user picked B; prototype captured at prototype/notes-variants 6c4dafd; commit: bcf5d04
- T5: `/work` redesign prototype → user feedback → integrate (ES+EN). — S2, S4 — route: parent — user picked B (catálogo status-led); prototype captured at prototype/work-variants 6c6b6f8; ProjectList.astro deleted (quedó huérfano); commit: 725bf66
- T6: `/about` redesign prototype → user feedback → integrate (ES+EN). — S2 — route: parent — commit: c8709c7 (variant B folded as AboutDossier.astro con labels via useTranslations; bio "high ownership, high agency"; prototype captured 1600be1 en prototype/about-variants)
- T7: `/workflow` redesign prototype → user feedback → integrate (ES+EN). — S2 — status: pending
- T8: Final sweep: Risk line + build verification, both langs, mobile collapse check. — Sall — pending

## Log

- L1 (2026-10-17, verbatim): "me gustaria acomodar un poco mi web, no me fusta, las notas no quedan a la vista y siento que no esta bien interconectada"
- L2: user asked prototypes of focalizado + reorganización: "me gustarian prototipos del 1 y 2" → built 4-variant home prototype (?variant= current/a/b/c).
- L3: after B seen: "me gusto mucho lo del rail, incluso suavizaria un poco los items de proyectos asi no quedan tan distintos en estilo" → softened projects to match rail.
- L4: "mmmm dont like it, muy de diario" → un-softened to catalog treatment: status-led, filete fino, no date on projects. User approved: "me gusto el B ahi che".
- L5: "lo unico que deberiamos iterar el resto de secciones para que no queden tan lineales/estaticas" → scope question answered: "Todo el sitio".
- L6 (delivery note): branch única autorizada por el usuario ("sisi mandalo"). Forecast de la feature supera las ~400 líneas.
- L7 (2026-10-17): T3 verificado con build: note detail de botardo-kb-determinista linkea proyecto botardo + otras notas; project detail de botardo linkea la nota; fechas visibles en /notes (formato es-AR "15 de oct de 2026"); EN paritario. Vigilar: el frontmatter nuevo `relatedProjects` feeds también al KB → correr `pnpm chat:populate` en próximo deploy.
- L8 (2026-10-17): Feedback T6-B del usuario verbatim: "no me gusto, o sea la B es la que mas me gusto pero no me convence, como que lo ultimo de la primer columna queda descolgado, que es eso? educacion formal o algo asi deberia decir / tampoco me gusta mucho el texto del about me". Ajustes: ... bio reescrita ES+EN.
- L10 (2026-10-17): Verdict T6: "me gusta, yo soy high ownership, high agency, hago lo que haya que hacer, devops, frontend, backend, mobile" → bio reescrita ES+EN con esa voz; variante B plasmada como componente real src/components/AboutDossier.astro; páginas about ES/EN reducidas a h1 + componente; maquinaria dev borrada saliendo del worktree; prototipos A/B/C capturados en throwaway branch prototype/about-variants (1600be1). Gotchas: frontmatter doble fence al generar un .astro por string-replace (queda import fuera del frontmatter); imports de páginas /en/ sin slug son 2 niveles (../../), con slug 3.
- L8 (2026-10-17): corrección del usuario verbatim: "la de producto fue el 16, no el 15". Causa real: bug de timezone — pubDate PARSEA como UTC medianoche, toLocaleDateString usa TZ server (America/Buenos_Aires UTC-3) → se atrasa un día. Fix: `timeZone: "UTC"` en las opciones en los 7 archivos que formatean fechas (HomeHub, notes/index, notes/[slug], work/[slug] + espejos EN). Verificado: "16 de oct de 2026" en binario.
- L9 (2026-10-17): T4 kicked ON: prototipo ?variant= sobre /notes (ES+EN), mismo patrón que home. Variantes: A actual, B índice de archivo (filas numeradas, títulos display, fecha derecha), C tarjetas (grid 2 col). Gated por import.meta.env.DEV; build prod intacto (39 págs). Esperando feedback del usuario por variante.
