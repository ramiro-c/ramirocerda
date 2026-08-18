---
slug: linkedin-markdownificator
kind: oss-fork
status: active
featured: false
order: 7
tags: ["Python", "Selenium", "OSS"]
repo: https://github.com/ramiro-c/linkedin-markdownificator
es:
  title: "linkedin-markdownificator"
  summary: "Fork OSS de una CLI que exporta el perfil completo de LinkedIn a Markdown (y JSON) para webs personales, CVs y agentes de IA. Sin API oficial: Selenium + HTML cacheado, pensado para no duplicar el CV a mano."
  problem: "LinkedIn no da API a developers individuales. El perfil público es incompleto y mantener LinkedIn + web/CV al día es trabajo doble. Cuando LinkedIn cambia el DOM React, los scrapers se rompen."
  what: "Retomé el fork y lo hice resiliente al DOM post-2025 (de clases artdeco a componentkey). Externalicé selectores en JSON, sumé scroll progresivo para componentes lazy, export JSON, templates Jinja2, modo headless/cached, y una suite de 26 tests de integración con Pytest + Ruff."
  highlights:
    - "Exporta el perfil completo (no solo el público) a Markdown y JSON, listo para CVs y agentes."
    - "Resiliente al DOM React post-2025: selectores externalizados en JSON en vez de hardcodeados."
    - "Scroll progresivo para secciones lazy, más modo headless y cacheo de HTML."
    - "Templates Jinja2 intercambiables y suite de 26 tests de integración con Pytest + Ruff."
  stack: ["Python", "Selenium", "BeautifulSoup", "Parsel", "Jinja2", "Pytest", "Ruff"]
en:
  title: "linkedin-markdownificator"
  summary: "OSS fork of a CLI that exports a full LinkedIn profile to Markdown (and JSON) for personal sites, CVs, and AI agents. No official API: Selenium + cached HTML, so you stop maintaining LinkedIn and a separate CV by hand."
  problem: "LinkedIn doesn’t give API access to individual developers. The public profile is incomplete, and keeping LinkedIn plus a site/CV in sync is double work. When LinkedIn ships a new React DOM, scrapers break."
  what: "Took over the fork and made it resilient to the post-2025 DOM (artdeco classes → componentkey). Externalized selectors in JSON, added progressive scroll for lazy sections, JSON export, Jinja2 templates, headless/cached modes, and a 26-test Pytest integration suite with Ruff."
  highlights:
    - "Exports the full profile (not just the public one) to Markdown and JSON, ready for CVs and agents."
    - "Resilient to the post-2025 React DOM: selectors externalized in JSON instead of hardcoded."
    - "Progressive scroll for lazy sections, plus headless mode and HTML caching."
    - "Swappable Jinja2 templates and a 26-test Pytest integration suite with Ruff."
  stack: ["Python", "Selenium", "BeautifulSoup", "Parsel", "Jinja2", "Pytest", "Ruff"]
---
