export const languages = {
  es: "Español",
  en: "English",
} as const;

export type Lang = keyof typeof languages;

export const defaultLang: Lang = "es";

export const ui = {
  es: {
    "nav.about": "About",
    "nav.work": "Work",
    "nav.notes": "Notes",
    "nav.home": "Inicio",
    "cta.work": "Proyectos",
    "cta.botardo": "Botardo",
    "home.brand": "Ramiro Cerdá",
    "home.thesis": "Tech lead que shippea.",
    "home.support":
      "Full-stack · liderazgo · IA-augmented. Proyectos reales, no un CV disfrazado.",
    "home.workLabel": "01 / WORK",
    "home.notesLabel": "02 / NOTES",
    "home.notesEmpty": "Pronto notas.",
    "about.title": "About",
    "work.title": "Work",
    "notes.title": "Notes",
    "notes.empty":
      "Todavía no hay notas. Vuelvo cuando tenga algo que valga la pena publicar.",
    "footer.line": "Diseñado y construido por Ramiro Cerdá · Buenos Aires",
    "project.problem": "Problema",
    "project.what": "Qué hice",
    "project.stack": "Stack",
    "project.links": "Links",
  },
  en: {
    "nav.about": "About",
    "nav.work": "Work",
    "nav.notes": "Notes",
    "nav.home": "Home",
    "cta.work": "Projects",
    "cta.botardo": "Botardo",
    "home.brand": "Ramiro Cerdá",
    "home.thesis": "Tech lead who ships.",
    "home.support":
      "Full-stack · leadership · AI-augmented. Real projects, not a CV in disguise.",
    "home.workLabel": "01 / WORK",
    "home.notesLabel": "02 / NOTES",
    "home.notesEmpty": "Notes coming soon.",
    "about.title": "About",
    "work.title": "Work",
    "notes.title": "Notes",
    "notes.empty":
      "No notes yet. Back when there’s something worth publishing.",
    "footer.line": "Designed and built by Ramiro Cerdá · Buenos Aires",
    "project.problem": "Problem",
    "project.what": "What I did",
    "project.stack": "Stack",
    "project.links": "Links",
  },
} as const;

export type UiKey = keyof (typeof ui)["es"];
