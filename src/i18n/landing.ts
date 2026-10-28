/**
 * Copy slots for the conversion layer (home landing, CTAs, contact form,
 * storage notice). Kept apart from ui.ts so the landing kit can rewrite copy
 * in one place. Rules (landing kit): sentence case, no hyphens inside copy,
 * benefit first CTAs, calm system messages.
 *
 * Positioning: full profile (Tech Lead at Libro de Pases, end to end product
 * work, cofounder of Kano Studio), applied AI as one capability among others.
 * Every claim comes from the site (about, projects) or Ramiro's CV note in his
 * vault (Kano Studio landing); nothing invented. Gaps stay as TODOs.
 */
import type { Lang } from "./ui";

export interface CaseStudy {
  /** Stable id, used as the cta_click position for the case link. */
  id: string;
  /** Where "read the case" points; null hides the link (no public page yet). */
  href: string | null;
  label: string;
  title: string;
  result: string;
}

export interface Testimonial {
  quote: string;
  name: string;
  role: string;
}

export interface LandingCopy {
  hero: {
    eyebrow: string;
    headline: string;
    headlineAccent: string;
    sub: string;
    returningNote: string;
    proof: string;
  };
  cta: {
    primary: string;
    primaryReturning: string;
    reassurance: string;
    cases: string;
    botardo: string;
    whatsapp: string;
  };
  proof: { workedWith: string; logos: Array<{ name: string; confirmed: boolean }> };
  demo: { label: string; title: string; body: string; prompts: string[] };
  cases: { label: string; title: string; items: CaseStudy[]; more: string };
  testimonials: { label: string; items: Testimonial[] };
  steps: { label: string; title: string; items: Array<{ title: string; body: string }> };
  tagline: string;
  faq: { label: string; title: string; items: Array<{ q: string; a: string }> };
  final: { title: string; body: string };
  form: {
    title: string;
    lede: string;
    name: string;
    email: string;
    message: string;
    messagePlaceholder: string;
    submit: string;
    submitting: string;
    close: string;
    success: string;
    errors: {
      name: string;
      email: string;
      message: string;
      turnstile: string;
      rateLimited: string;
      unavailable: string;
      generic: string;
    };
    privacy: string;
  };
  botardoOffer: { text: string; button: string };
  notice: { text: string; link: string; dismiss: string };
  dock: { label: string };
}

// Kano Studio: Ramiro is a cofounder (his own PR #21 feedback). Avellana is
// not mentioned anywhere in the site or notes yet.
// TODO(Ramiro): confirm Avellana can be named publicly. Unconfirmed names only
// render in `astro dev` (marked as placeholders), never in the build.
const LOGOS = [
  { name: "LDP (Libro de Pases)", confirmed: true },
  { name: "Kano Studio", confirmed: true },
  { name: "Avellana", confirmed: false },
];

// TODO(Ramiro): add real testimonials (quote + full name + role, with consent).
// The section stays hidden while this list is empty.
const TESTIMONIALS: Testimonial[] = [];

export const landing: Record<Lang, LandingCopy> = {
  es: {
    hero: {
      eyebrow: "Ramiro Cerdá · Tech Lead y Full Stack Engineer",
      headline: "Construyo productos web y mobile de punta a punta,",
      headlineAccent: "con IA donde suma.",
      sub: "Tech Lead en Libro de Pases y cofundador de Kano Studio. Me encargo del producto completo: frontend, mobile, backend, performance y calidad, y sumo agentes de IA cuando resuelven un problema real.",
      returningNote: "Qué bueno verte de nuevo.",
      proof: "Tech Lead en LDP: mejoras de latencia de más del 75% en búsqueda.",
    },
    cta: {
      primary: "Agendá 20 min para charlar tu idea",
      primaryReturning: "Contame tu proyecto",
      reassurance: "Sin costo ni compromiso. Te respondo por mail.",
      cases: "Ver casos",
      botardo: "Hablar con Botardo",
      whatsapp: "WhatsApp",
    },
    proof: { workedWith: "Trabajé con", logos: LOGOS },
    demo: {
      label: "Demo en vivo",
      title: "Probá un agente que construí",
      body: "La IA es una de las cosas que hago. Botardo es un agente RAG que armé para esta web: busca en una base de conocimiento curada, responde en tu idioma y, si no tiene el dato, lo dice en vez de inventar.",
      prompts: ["¿Qué hace Ramiro en Libro de Pases?", "¿Qué productos construyó?"],
    },
    cases: {
      label: "Casos",
      title: "Productos que ya están en uso",
      more: "Ver el caso",
      items: [
        {
          id: "ldp",
          href: "/about/",
          label: "Tech Lead · plataforma",
          title: "Libro de Pases (LDP), plataforma futbolística",
          result: "Entré en la app mobile y hoy lidero el desarrollo full stack: refactors de búsqueda, observabilidad con Sentry y New Relic, testing y CI, con mejoras de latencia de más del 75%.",
        },
        {
          id: "kano",
          // TODO(Ramiro): link to the live landing or a case page when there is one.
          href: null,
          label: "Cofundador · web",
          title: "Kano Studio, landing y diagnóstico interactivo",
          result: "Design system, i18n, SEO y remediación de accesibilidad WCAG 2.2 AA a partir de una auditoría.",
        },
        {
          id: "lactaria",
          href: "/work/lactaria/",
          label: "Freelance · app mobile",
          title: "LactarIA, apoyo en lactancia materna",
          result: "App móvil de salud con un chatbot de IA apoyado en un banco de preguntas curado, validada en un piloto cerrado con 50 madres.",
        },
        {
          id: "mundial-2026",
          href: "/work/mundial-2026/",
          label: "Producto · full stack",
          title: "Mundial 2026, la app para seguir el torneo",
          result: "Grupos, fixture con huso local, bracket, mapa de sedes y guía de TV por país, con datos históricos cruzados. Está online.",
        },
        {
          id: "agent-general",
          href: "/work/agent-general/",
          label: "IA en producción",
          title: "Agent General, asistente de producto",
          result: "Un agente raíz delega en 14 subagentes de dominio, usa el JWT de cada usuario y se evalúa con casos reales, sin LLM juez.",
        },
        {
          id: "freelance",
          href: "/about/",
          label: "Freelance · sistemas de gestión",
          title: "Software de gestión para negocios",
          result: "Sistemas de gestión multi rubro en DevGAM (PHP, JS, MySQL) y trámites administrativos para la UTN FRLP (Laravel, Vue).",
        },
      ],
    },
    testimonials: { label: "Lo que dicen", items: TESTIMONIALS },
    steps: {
      label: "Cómo trabajamos",
      title: "Tres pasos, sin humo",
      items: [
        {
          title: "Charlamos 20 minutos",
          body: "Entiendo el problema, quién lo va a usar y qué hace falta construir. Si la solución no necesita software nuevo, o no necesita IA, te lo digo.",
        },
        {
          title: "Una primera versión usable",
          body: "Un alcance acotado que se puede probar con usuarios reales antes de sumar funcionalidades.",
        },
        {
          title: "Producción y mantenimiento",
          body: "Deploy, observabilidad y tests en CI para que el producto siga andando bien cuando crece.",
        },
      ],
    },
    tagline: "De la primera pantalla al último deploy, con alguien que se hace cargo del producto completo.",
    faq: {
      label: "Preguntas frecuentes",
      title: "Antes de escribirme",
      items: [
        {
          q: "¿Qué tipo de proyectos hacés?",
          a: "Apps web y mobile, plataformas con backend propio, sitios y landings, y agentes de IA. Algunos ejemplos: la plataforma de Libro de Pases, la landing de Kano Studio, LactarIA y Mundial 2026.",
        },
        {
          q: "¿Podés mejorar algo que ya existe?",
          a: "Sí. En Libro de Pases buena parte del trabajo fue mejorar lo que ya estaba: refactors de búsqueda con mejoras de latencia de más del 75%, observabilidad con Sentry y New Relic, testing y CI.",
        },
        {
          q: "¿Necesito IA en mi producto?",
          a: "No siempre. Si una regla, un formulario o una buena búsqueda resuelven el problema, es mejor. Cuando la IA suma, como responder sobre tus documentos o automatizar consultas, la diseño para que cite la fuente y diga cuando no sabe.",
        },
        {
          q: "¿Qué pasa después del lanzamiento?",
          a: "El producto sale con monitoreo de errores y performance y con tests que corren en cada cambio, para detectar problemas antes que tus usuarios.",
        },
        {
          q: "¿Con qué stack trabajás?",
          a: "React, React Native y TypeScript en el frontend; Node.js, NestJS, Python, PostgreSQL y MySQL en el backend; GCP y Cloudflare Workers para infraestructura; Google ADK y LangGraph para agentes de IA.",
        },
        {
          q: "¿Cuánto cuesta?",
          a: "Depende del alcance. En la charla de 20 minutos vemos qué necesitás y después te paso una propuesta concreta por mail.",
        },
      ],
    },
    final: {
      title: "¿Tenés una idea o un producto para mejorar?",
      body: "Contame qué querés resolver. En 20 minutos vemos si tiene sentido y cuál sería el primer paso.",
    },
    form: {
      title: "Contame tu idea",
      lede: "Dejame tus datos y te escribo para coordinar los 20 minutos.",
      name: "Nombre",
      email: "Email",
      message: "Mensaje",
      messagePlaceholder: "Qué querés construir y para quién",
      submit: "Enviar mensaje",
      submitting: "Enviando…",
      close: "Cerrar formulario",
      success: "Recibí tu mensaje. Te respondo a {email}.",
      errors: {
        name: "Escribí tu nombre.",
        email: "Revisá el email: tiene que tener la forma nombre@dominio.com.",
        message: "Contame un poco más: el mensaje necesita al menos 10 caracteres.",
        turnstile: "No pudimos verificar que sos una persona. Esperá a que cargue la verificación y probá de nuevo.",
        rateLimited: "Llegaron varios envíos seguidos. Esperá un minuto y probá de nuevo.",
        unavailable: "El formulario no está disponible ahora. Escribime a {email}.",
        generic: "No se pudo enviar el mensaje. Probá de nuevo o escribime a {email}.",
      },
      privacy: "Uso tus datos solo para responderte.",
    },
    botardoOffer: {
      text: "Si querés, dejame tus datos y Ramiro te escribe para charlar tu proyecto.",
      button: "Dejar mis datos",
    },
    notice: {
      text: "Guardo un identificador anónimo en tu navegador para contar visitas. Sin cookies de terceros ni trackers.",
      link: "Privacidad",
      dismiss: "Entendido",
    },
    dock: { label: "Contacto rápido" },
  },
  en: {
    hero: {
      eyebrow: "Ramiro Cerdá · Tech Lead and Full Stack Engineer",
      headline: "I build web and mobile products end to end,",
      headlineAccent: "with AI where it pays off.",
      sub: "Tech Lead at Libro de Pases and cofounder of Kano Studio. I own the whole product: frontend, mobile, backend, performance, and quality, and I add AI agents when they solve a real problem.",
      returningNote: "Good to see you again.",
      proof: "Tech Lead at LDP: search latency improvements of more than 75%.",
    },
    cta: {
      primary: "Book 20 minutes to talk through your idea",
      primaryReturning: "Tell me about your project",
      reassurance: "Free, no strings attached. I reply by email.",
      cases: "See cases",
      botardo: "Talk to Botardo",
      whatsapp: "WhatsApp",
    },
    proof: { workedWith: "Worked with", logos: LOGOS },
    demo: {
      label: "Live demo",
      title: "Try an agent I built",
      body: "AI is one of the things I do. Botardo is a RAG agent I built for this site: it searches a curated knowledge base, answers in your language and, when it lacks the data, says so instead of making it up.",
      prompts: ["What does Ramiro do at Libro de Pases?", "What products has he built?"],
    },
    cases: {
      label: "Cases",
      title: "Products already in use",
      more: "Read the case",
      items: [
        {
          id: "ldp",
          href: "/en/about/",
          label: "Tech Lead · platform",
          title: "Libro de Pases (LDP), football platform",
          result: "I joined on the mobile app and now lead full stack development: search refactors, observability with Sentry and New Relic, testing and CI, with latency improvements of more than 75%.",
        },
        {
          id: "kano",
          // TODO(Ramiro): link to the live landing or a case page when there is one.
          href: null,
          label: "Cofounder · web",
          title: "Kano Studio, landing and interactive diagnostic",
          result: "Design system, i18n, SEO, and WCAG 2.2 AA accessibility remediation driven by an audit.",
        },
        {
          id: "lactaria",
          href: "/en/work/lactaria/",
          label: "Freelance · mobile app",
          title: "LactarIA, breastfeeding support",
          result: "A mobile health app with an AI chatbot grounded in a curated Q&A bank, validated in a closed pilot with 50 mothers.",
        },
        {
          id: "mundial-2026",
          href: "/en/work/mundial-2026/",
          label: "Product · full stack",
          title: "Mundial 2026, the app to follow the tournament",
          result: "Groups, fixtures in local time, bracket, venue map, and TV guide by country, with cross referenced historical data. It is live.",
        },
        {
          id: "agent-general",
          href: "/en/work/agent-general/",
          label: "AI in production",
          title: "Agent General, product assistant",
          result: "A root agent delegates to 14 domain sub agents, uses each user's JWT, and is evaluated on real cases with no LLM judge.",
        },
        {
          id: "freelance",
          href: "/en/about/",
          label: "Freelance · business software",
          title: "Management software for businesses",
          result: "Multi industry management systems at DevGAM (PHP, JS, MySQL) and administrative workflows for UTN FRLP (Laravel, Vue).",
        },
      ],
    },
    testimonials: { label: "What people say", items: TESTIMONIALS },
    steps: {
      label: "How we work",
      title: "Three steps, no fluff",
      items: [
        {
          title: "A 20 minute call",
          body: "I learn the problem, who will use it, and what needs to be built. If the answer does not need new software, or does not need AI, I tell you.",
        },
        {
          title: "A first usable version",
          body: "A tight scope you can test with real users before adding features.",
        },
        {
          title: "Production and maintenance",
          body: "Deploy, observability, and CI tests so the product keeps working well as it grows.",
        },
      ],
    },
    tagline: "From the first screen to the last deploy, with someone who owns the whole product.",
    faq: {
      label: "FAQ",
      title: "Before you write",
      items: [
        {
          q: "What kind of projects do you take on?",
          a: "Web and mobile apps, platforms with their own backend, sites and landing pages, and AI agents. Some examples: the Libro de Pases platform, the Kano Studio landing, LactarIA, and Mundial 2026.",
        },
        {
          q: "Can you improve something that already exists?",
          a: "Yes. At Libro de Pases much of the work was improving what was there: search refactors with latency improvements of more than 75%, observability with Sentry and New Relic, testing and CI.",
        },
        {
          q: "Do I need AI in my product?",
          a: "Not always. If a rule, a form, or good search solves the problem, that is better. When AI helps, like answering from your documents or automating questions, I design it to cite its sources and say when it does not know.",
        },
        {
          q: "What happens after launch?",
          a: "The product ships with error and performance monitoring and with tests that run on every change, so problems show up before your users find them.",
        },
        {
          q: "What is your stack?",
          a: "React, React Native, and TypeScript on the frontend; Node.js, NestJS, Python, PostgreSQL, and MySQL on the backend; GCP and Cloudflare Workers for infrastructure; Google ADK and LangGraph for AI agents.",
        },
        {
          q: "How much does it cost?",
          a: "It depends on scope. In the 20 minute call we see what you need, and then I send you a concrete proposal by email.",
        },
      ],
    },
    final: {
      title: "Got an idea or a product to improve?",
      body: "Tell me what you want to solve. In 20 minutes we see whether it makes sense and what the first step would be.",
    },
    form: {
      title: "Tell me about your idea",
      lede: "Leave your details and I will write back to set up the 20 minutes.",
      name: "Name",
      email: "Email",
      message: "Message",
      messagePlaceholder: "What you want to build and for whom",
      submit: "Send message",
      submitting: "Sending…",
      close: "Close form",
      success: "Got your message. I will reply to {email}.",
      errors: {
        name: "Enter your name.",
        email: "Check the email: it should look like name@domain.com.",
        message: "Tell me a bit more: the message needs at least 10 characters.",
        turnstile: "We could not verify you are human. Wait for the check to load and try again.",
        rateLimited: "Several messages arrived in a row. Wait a minute and try again.",
        unavailable: "The form is not available right now. Email me at {email}.",
        generic: "The message could not be sent. Try again or email me at {email}.",
      },
      privacy: "I only use your details to reply to you.",
    },
    botardoOffer: {
      text: "If you like, leave your details and Ramiro will write to you about your project.",
      button: "Leave my details",
    },
    notice: {
      text: "I store an anonymous id in your browser to count visits. No third party cookies or trackers.",
      link: "Privacy",
      dismiss: "Got it",
    },
    dock: { label: "Quick contact" },
  },
};
