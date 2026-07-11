export const languages = {
  es: "Español",
  en: "English",
} as const;

export type Lang = keyof typeof languages;

export const defaultLang: Lang = "es";

export const ui = {
  es: {
    "nav.about": "Sobre mí",
    "nav.work": "Proyectos",
    "nav.notes": "Notas",
    "nav.home": "Inicio",
    "cta.work": "Proyectos",
    "cta.botardo": "Botardo",
    "home.brand": "Ramiro Cerdá",
    "home.thesis": "Liderazgo técnico hands-on.",
    "home.support":
      "Full-stack · liderazgo · IA. Ownership real: arquitectura, código y deploy.",
    "home.workLabel": "01 / PROYECTOS",
    "home.workAll": "Ver todos",
    "home.notesLabel": "02 / NOTAS",
    "home.notesEmpty": "Pronto notas.",
    "botardo.welcome":
      "¡Hola! Soy Botardo, un asistente de IA con información sobre Ramiro. Preguntame sobre su experiencia, proyectos, habilidades o cualquier tema profesional.",
    "botardo.open": "Abrir Botardo",
    "botardo.close": "Cerrar chat",
    "botardo.placeholder": "Escribí tu pregunta…",
    "botardo.inputLabel": "Escribí tu pregunta para Botardo",
    "botardo.send": "Enviar mensaje",
    "botardo.typing": "Botardo está escribiendo…",
    "botardo.retry": "Reintentar",
    "about.title": "Sobre mí",
    "about.experience": "años de experiencia",
    "about.rolesLabel": "Trayectoria",
    "about.educationLabel": "Educación",
    "about.skillsLabel": "Skills",
    "about.linksLabel": "Links",
    "work.title": "Proyectos",
    "notes.title": "Notas",
    "notes.empty":
      "Todavía no hay notas. Vuelvo cuando tenga algo que valga la pena publicar.",
    "footer.line": "Diseñado y construido por Ramiro Cerdá · Buenos Aires",
    "footer.builtWith": "Hecho con",
    "footer.referralNote": "link de referido",
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
    "home.thesis": "Hands-on technical leadership.",
    "home.support":
      "Full-stack · leadership · AI. Real ownership: architecture, code, and deploy.",
    "home.workLabel": "01 / WORK",
    "home.workAll": "View all",
    "home.notesLabel": "02 / NOTES",
    "home.notesEmpty": "Notes coming soon.",
    "botardo.welcome":
      "Hi! I’m Botardo, an AI assistant with info about Ramiro. Ask me about his experience, projects, skills, or anything professional.",
    "botardo.open": "Open Botardo",
    "botardo.close": "Close chat",
    "botardo.placeholder": "Type your question…",
    "botardo.inputLabel": "Type your question for Botardo",
    "botardo.send": "Send message",
    "botardo.typing": "Botardo is typing…",
    "botardo.retry": "Retry",
    "about.title": "About",
    "about.experience": "years of experience",
    "about.rolesLabel": "Trajectory",
    "about.educationLabel": "Education",
    "about.skillsLabel": "Skills",
    "about.linksLabel": "Links",
    "work.title": "Work",
    "notes.title": "Notes",
    "notes.empty":
      "No notes yet. Back when there’s something worth publishing.",
    "footer.line": "Designed and built by Ramiro Cerdá · Buenos Aires",
    "footer.builtWith": "Built with",
    "footer.referralNote": "referral link",
    "project.problem": "Problem",
    "project.what": "What I did",
    "project.stack": "Stack",
    "project.links": "Links",
  },
} as const;

export type UiKey = keyof (typeof ui)["es"];
