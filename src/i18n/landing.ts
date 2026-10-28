/**
 * Copy slots for the conversion layer (home landing, CTAs, contact form,
 * storage notice). Kept apart from ui.ts so the landing kit can rewrite copy
 * in one place. Rules (landing kit): sentence case, no hyphens inside copy,
 * benefit first CTAs, calm system messages.
 *
 * Positioning: full profile (Tech Lead at Libro de Pases, end to end product
 * work, collaboration with Kano Studio), applied AI as one capability among others.
 * Every claim comes from the site (about, projects) or Ramiro's CV note in his
 * vault (Kano Studio landing); nothing invented. Gaps stay as TODOs.
 * Public product URLs (checked with curl when added):
 *   Libro de Pases: https://www.ldptech.ai/ (librodepases.com redirects there)
 *   Kano Studio: https://kano.studio/ (site of the kano-landing repo)
 *   Avellana: https://avellana.store/ (Kano Studio product; copy from its public site)
 */
import type { Lang } from "./ui";

export interface CaseStudy {
  /** Stable id, used as the cta_click position for the case link. */
  id: string;
  /**
   * Where the case link points. A path opens the case page on this site, an
   * absolute URL opens the product's public site in a new tab, and null hides
   * the link (no public page yet).
   */
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
  cases: { label: string; title: string; items: CaseStudy[]; more: string; visit: string };
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

// Kano Studio and Avellana (a Kano Studio product) are presented as a
// collaboration, confirmed by Ramiro. Unconfirmed names only render in
// `astro dev` (marked as placeholders), never in the build.
const LOGOS = [
  { name: "LDP (Libro de Pases)", confirmed: true },
  { name: "Kano Studio", confirmed: true },
  { name: "Avellana", confirmed: true },
];

// TODO(Ramiro): add real testimonials (quote + full name + role, with consent).
// The section stays hidden while this list is empty.
const TESTIMONIALS: Testimonial[] = [];

export const landing: Record<Lang, LandingCopy> = {
  es: {
    hero: {
      eyebrow: "Ramiro Cerdá · Tech Lead y Full Stack Engineer",
      headline: "De la idea",
      headlineAccent: "al producto en producción.",
      sub: "Tech Lead en Libro de Pases y colaboro con Kano Studio. Desarrollo apps web y mobile, plataformas y agentes de IA, y me quedo hasta que funcionan bien con usuarios reales.",
      returningNote: "Hola de nuevo.",
      proof: "En LDP lideré refactors de búsqueda que mejoraron la latencia más del 75%.",
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
      body: "La IA es una de las cosas que hago. Botardo es un agente RAG que armé para esta web. Busca en una base de conocimiento curada y responde en tu idioma. Si no tiene un dato, lo dice en vez de inventarlo.",
      prompts: ["¿Qué hace Ramiro en Libro de Pases?", "¿Qué productos construyó?"],
    },
    cases: {
      label: "Casos",
      title: "Productos que ya están en uso",
      more: "Ver el caso",
      visit: "Ver el sitio",
      items: [
        {
          id: "ldp",
          href: "https://www.ldptech.ai/",
          label: "Tech Lead · plataforma",
          title: "Libro de Pases (LDP), plataforma de fútbol",
          result: "Entré por la app mobile y hoy lidero el desarrollo full stack. Hice refactors de búsqueda que mejoraron la latencia más del 75%, y sumé observabilidad con Sentry y New Relic, tests y CI.",
        },
        {
          id: "kano",
          href: "https://kano.studio/",
          label: "Colaboración · web",
          title: "Kano Studio, landing y diagnóstico interactivo",
          result: "Con el equipo de Kano hice el design system, la i18n y el SEO. También corregí los problemas de accesibilidad WCAG 2.2 AA que marcó una auditoría.",
        },
        {
          id: "avellana",
          href: "https://avellana.store/",
          label: "Colaboración con Kano Studio · app mobile",
          title: "Avellana, app para comprar ropa en Av. Avellaneda",
          result: "App gratuita para Android e iOS. Compara precios de ropa de mujer entre los locales de Av. Avellaneda, guarda favoritos y arma el recorrido más corto.",
        },
        {
          id: "lactaria",
          href: "/work/lactaria/",
          label: "Freelance · app mobile",
          title: "LactarIA, apoyo en lactancia materna",
          result: "App de salud con un chatbot de IA que responde desde un banco de preguntas curado. Tuvo un piloto cerrado con 50 madres.",
        },
        {
          id: "mundial-2026",
          href: "/work/mundial-2026/",
          label: "Producto · full stack",
          title: "Mundial 2026, la app para seguir el torneo",
          result: "Muestra grupos, fixture en tu huso horario, cuadro eliminatorio, mapa de sedes y guía de TV por país. Cruza datos históricos entre selecciones. Está online.",
        },
        {
          id: "agent-general",
          href: "/work/agent-general/",
          label: "IA en producción",
          title: "Agent General, asistente de producto",
          result: "Un agente raíz delega en 14 subagentes de dominio y usa el JWT de cada usuario. Lo evalúo con casos reales, sin LLM juez.",
        },
        {
          id: "freelance",
          href: "/about/",
          label: "Freelance · sistemas de gestión",
          title: "Software de gestión para negocios",
          result: "Hice sistemas de gestión multi rubro en DevGAM (PHP, JS, MySQL) y un sistema de trámites administrativos para la UTN FRLP (Laravel, Vue).",
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
          body: "Armamos un alcance chico que se puede probar con usuarios reales antes de sumar funcionalidades.",
        },
        {
          title: "Producción y mantenimiento",
          body: "Hago el deploy, configuro el monitoreo de errores y dejo tests que corren en CI. Después sigo con el mantenimiento.",
        },
      ],
    },
    tagline: "Me hago cargo del producto completo, desde la primera pantalla hasta el deploy.",
    faq: {
      label: "Preguntas frecuentes",
      title: "Antes de escribirme",
      items: [
        {
          q: "¿Qué tipo de proyectos hacés?",
          a: "Apps web y mobile, plataformas con backend propio, sitios y landings, y agentes de IA. Algunos ejemplos: la plataforma de Libro de Pases, la landing de Kano Studio, la app Avellana, LactarIA y Mundial 2026.",
        },
        {
          q: "¿Podés mejorar algo que ya existe?",
          a: "Sí. En Libro de Pases buena parte del trabajo fue mejorar lo que ya estaba: refactors de búsqueda con mejoras de latencia de más del 75%, observabilidad con Sentry y New Relic, testing y CI.",
        },
        {
          q: "¿Necesito IA en mi producto?",
          a: "No siempre. Si una regla, un formulario o una buena búsqueda resuelven el problema, conviene eso. Cuando la IA sirve, por ejemplo para responder sobre tus documentos, la diseño para que cite la fuente y diga cuando no sabe.",
        },
        {
          q: "¿Qué pasa después del lanzamiento?",
          a: "El producto sale con monitoreo de errores y de performance, y con tests que corren en cada cambio. Así veo los problemas antes que tus usuarios.",
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
        email: "Revisá el email. Tiene que tener la forma nombre@dominio.com.",
        message: "El mensaje necesita al menos 10 caracteres.",
        turnstile: "No pudimos verificar que sos una persona. Esperá a que cargue la verificación y probá de nuevo.",
        rateLimited: "Llegaron varios envíos seguidos. Esperá un minuto y probá de nuevo.",
        unavailable: "El formulario no está disponible ahora. Escribime a {email}.",
        generic: "No se pudo enviar el mensaje. Probá de nuevo o escribime a {email}.",
      },
      privacy: "Uso tus datos solo para responderte.",
    },
    botardoOffer: {
      text: "Dejame tus datos y Ramiro te escribe para charlar tu proyecto.",
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
      headline: "From idea",
      headlineAccent: "to a product in production.",
      sub: "Tech Lead at Libro de Pases, collaborating with Kano Studio. I build web and mobile apps, platforms, and AI agents, and I stay until they work well with real users.",
      returningNote: "Welcome back.",
      proof: "At LDP I led search refactors that improved latency by more than 75%.",
    },
    cta: {
      primary: "Book 20 minutes to talk through your idea",
      primaryReturning: "Tell me about your project",
      reassurance: "Free and with no commitment. I reply by email.",
      cases: "See cases",
      botardo: "Talk to Botardo",
      whatsapp: "WhatsApp",
    },
    proof: { workedWith: "Worked with", logos: LOGOS },
    demo: {
      label: "Live demo",
      title: "Try an agent I built",
      body: "AI is one of the things I do. Botardo is a RAG agent I built for this site. It searches a curated knowledge base and answers in your language. When it lacks a fact, it says so instead of making it up.",
      prompts: ["What does Ramiro do at Libro de Pases?", "What products has he built?"],
    },
    cases: {
      label: "Cases",
      title: "Products already in use",
      more: "Read the case",
      visit: "Visit the site",
      items: [
        {
          id: "ldp",
          href: "https://www.ldptech.ai/",
          label: "Tech Lead · platform",
          title: "Libro de Pases (LDP), football platform",
          result: "I joined on the mobile app and now lead full stack development. I did search refactors that improved latency by more than 75%, and added observability with Sentry and New Relic, tests, and CI.",
        },
        {
          id: "kano",
          href: "https://kano.studio/",
          label: "Collaboration · web",
          title: "Kano Studio, landing and interactive diagnostic",
          result: "With the Kano team I built the design system, i18n, and SEO. I also fixed the WCAG 2.2 AA accessibility issues an audit flagged.",
        },
        {
          id: "avellana",
          href: "https://avellana.store/",
          label: "Collaboration with Kano Studio · mobile app",
          title: "Avellana, an app to shop for clothes on Av. Avellaneda",
          result: "A free app for Android and iOS. It compares women's clothing prices across the shops on Av. Avellaneda in Buenos Aires, saves favorites, and plans the shortest route.",
        },
        {
          id: "lactaria",
          href: "/en/work/lactaria/",
          label: "Freelance · mobile app",
          title: "LactarIA, breastfeeding support",
          result: "A health app with an AI chatbot that answers from a curated question bank. It ran a closed pilot with 50 mothers.",
        },
        {
          id: "mundial-2026",
          href: "/en/work/mundial-2026/",
          label: "Product · full stack",
          title: "Mundial 2026, the app to follow the tournament",
          result: "It shows groups, fixtures in your time zone, the knockout bracket, a venue map, and a TV guide by country. It cross references historical data between teams. It is live.",
        },
        {
          id: "agent-general",
          href: "/en/work/agent-general/",
          label: "AI in production",
          title: "Agent General, product assistant",
          result: "A root agent delegates to 14 domain sub agents and uses each user's JWT. I evaluate it on real cases, with no LLM judge.",
        },
        {
          id: "freelance",
          href: "/en/about/",
          label: "Freelance · business software",
          title: "Management software for businesses",
          result: "I built multi industry management systems at DevGAM (PHP, JS, MySQL) and an administrative workflow system for UTN FRLP (Laravel, Vue).",
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
          body: "We set a small scope you can test with real users before adding features.",
        },
        {
          title: "Production and maintenance",
          body: "I deploy it, set up error monitoring, and leave tests running in CI. Then I keep maintaining it.",
        },
      ],
    },
    tagline: "I own the whole product, from the first screen to the deploy.",
    faq: {
      label: "FAQ",
      title: "Before you write",
      items: [
        {
          q: "What kind of projects do you take on?",
          a: "Web and mobile apps, platforms with their own backend, sites and landing pages, and AI agents. Some examples: the Libro de Pases platform, the Kano Studio landing, the Avellana app, LactarIA, and Mundial 2026.",
        },
        {
          q: "Can you improve something that already exists?",
          a: "Yes. At Libro de Pases much of the work was improving what was there: search refactors with latency improvements of more than 75%, observability with Sentry and New Relic, testing and CI.",
        },
        {
          q: "Do I need AI in my product?",
          a: "Not always. If a rule, a form, or good search solves the problem, use that. When AI helps, for example to answer from your documents, I design it to cite its sources and say when it does not know.",
        },
        {
          q: "What happens after launch?",
          a: "The product ships with error and performance monitoring, and with tests that run on every change. That way I see problems before your users do.",
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
        email: "Check the email. It should look like name@domain.com.",
        message: "The message needs at least 10 characters.",
        turnstile: "We could not verify you are human. Wait for the check to load and try again.",
        rateLimited: "Several messages arrived in a row. Wait a minute and try again.",
        unavailable: "The form is not available right now. Email me at {email}.",
        generic: "The message could not be sent. Try again or email me at {email}.",
      },
      privacy: "I only use your details to reply to you.",
    },
    botardoOffer: {
      text: "Leave your details and Ramiro will write to you about your project.",
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
