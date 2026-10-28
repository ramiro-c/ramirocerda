/**
 * Copy slots for the conversion layer (home landing, CTAs, contact form,
 * storage notice). Kept apart from ui.ts so the landing kit can rewrite copy
 * in one place. Rules (landing kit): sentence case, no hyphens inside copy,
 * benefit first CTAs, calm system messages. Every claim below comes from data
 * already in the repo (projects, about); nothing invented.
 */
import type { Lang } from "./ui";

export interface CaseStudy {
  /** Project slug under /work/, or null for a non project case. */
  slug: string | null;
  href: string;
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

// TODO(Ramiro): confirm Kano and Avellana can be named publicly. Unconfirmed
// names only render in `astro dev` (marked as placeholders), never in the build.
const LOGOS = [
  { name: "LDP (Libro de Pases)", confirmed: true },
  { name: "Kano", confirmed: false },
  { name: "Avellana", confirmed: false },
];

// TODO(Ramiro): add real testimonials (quote + full name + role, with consent).
// The section stays hidden while this list is empty.
const TESTIMONIALS: Testimonial[] = [];

export const landing: Record<Lang, LandingCopy> = {
  es: {
    hero: {
      eyebrow: "Ramiro Cerdá · AI & Full Stack Engineer",
      headline: "Agentes de IA para tu negocio,",
      headlineAccent: "con respuestas que podés verificar.",
      sub: "Diseño y pongo en producción agentes y sistemas RAG conectados a tus datos: citan la fuente, respetan los permisos de cada usuario y pasan tests antes de cada deploy.",
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
      title: "Probá lo que puedo construir para vos",
      body: "Botardo es un agente RAG que armé para esta web: busca en una base de conocimiento curada, responde en tu idioma y, si no tiene el dato, lo dice en vez de inventar.",
      prompts: ["¿Qué agentes de IA construyó Ramiro?", "¿Cómo evalúa sus agentes?"],
    },
    cases: {
      label: "Casos",
      title: "Lo que ya está funcionando",
      more: "Ver el caso",
      items: [
        {
          slug: "agent-general",
          href: "/work/agent-general/",
          label: "Multiagente en producción",
          title: "Asistente de producto para una plataforma de fútbol",
          result: "Un agente raíz delega en 14 subagentes de dominio, usa el JWT de cada usuario y se evalúa con casos reales, sin LLM juez.",
        },
        {
          slug: "botardo",
          href: "/work/botardo/",
          label: "RAG en Cloudflare",
          title: "Botardo, el chat de esta web",
          result: "Responde con hechos de una base curada; sin contexto, contesta sin llamar al modelo: costo cero en preguntas fuera de tema.",
        },
        {
          slug: null,
          href: "/about/",
          label: "Performance",
          title: "Tech Lead en LDP (Libro de Pases)",
          result: "Lideré refactors de búsqueda, observabilidad con Sentry y New Relic, testing y CI, con mejoras de latencia de más del 75%.",
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
          body: "Entiendo el problema, qué datos tenés y si un agente es la herramienta correcta. Si no lo es, te lo digo.",
        },
        {
          title: "Prototipo con tus datos",
          body: "Una primera versión acotada, con evals que miden si responde bien antes de sumar alcance.",
        },
        {
          title: "Producción y medición",
          body: "Deploy, observabilidad y tests en CI para que el agente siga respondiendo bien cuando cambian los datos.",
        },
      ],
    },
    tagline: "No es magia. Es un agente que cita la fuente, sabe cuándo no sabe y pasa los tests.",
    faq: {
      label: "Preguntas frecuentes",
      title: "Antes de escribirme",
      items: [
        {
          q: "¿Qué es un sistema RAG y cuándo conviene?",
          a: "Es un agente que antes de responder busca en tus documentos o datos y arma la respuesta con eso. Conviene cuando la información cambia seguido o es propia de tu negocio y no querés que el modelo la invente.",
        },
        {
          q: "¿Qué pasa si el agente no sabe la respuesta?",
          a: "Lo diseño para que lo diga. Botardo, por ejemplo, contesta que no tiene el dato cuando la búsqueda no encuentra contexto, sin llamar al modelo.",
        },
        {
          q: "¿Cómo sé si responde bien?",
          a: "Con evals determinísticos: casos de prueba que verifican qué herramientas usa, que los números salgan de los datos y el idioma de la respuesta. Corren en CI y cortan el deploy si algo se rompe.",
        },
        {
          q: "¿Qué pasa con los permisos y los datos privados?",
          a: "El agente ve lo mismo que ve el usuario que pregunta. En Agent General cada llamada usa el JWT de ese usuario y las sesiones quedan aisladas.",
        },
        {
          q: "¿Con qué stack trabajás?",
          a: "TypeScript y Python; Cloudflare Workers, Vectorize y Workers AI; GCP con Vertex AI; Google ADK y LangGraph para orquestar agentes.",
        },
        {
          q: "¿Cuánto cuesta?",
          a: "Depende del alcance. En la charla de 20 minutos vemos qué necesitás y después te paso una propuesta concreta por mail.",
        },
      ],
    },
    final: {
      title: "¿Tenés una idea para un agente?",
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
      eyebrow: "Ramiro Cerdá · AI & Full Stack Engineer",
      headline: "AI agents for your business,",
      headlineAccent: "with answers you can verify.",
      sub: "I design and ship AI agents and RAG systems wired to your data: they cite their sources, respect each user's permissions, and pass tests before every deploy.",
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
      title: "Try what I can build for you",
      body: "Botardo is a RAG agent I built for this site: it searches a curated knowledge base, answers in your language and, when it lacks the data, says so instead of making it up.",
      prompts: ["What AI agents has Ramiro built?", "How does he evaluate his agents?"],
    },
    cases: {
      label: "Cases",
      title: "What is already running",
      more: "Read the case",
      items: [
        {
          slug: "agent-general",
          href: "/en/work/agent-general/",
          label: "Multi agent in production",
          title: "Product assistant for a football platform",
          result: "A root agent delegates to 14 domain sub agents, uses each user's JWT, and is evaluated on real cases with no LLM judge.",
        },
        {
          slug: "botardo",
          href: "/en/work/botardo/",
          label: "RAG on Cloudflare",
          title: "Botardo, this site's chat",
          result: "Answers with facts from a curated base; with no context it replies without calling the model: zero cost on off topic questions.",
        },
        {
          slug: null,
          href: "/en/about/",
          label: "Performance",
          title: "Tech Lead at LDP (Libro de Pases)",
          result: "Led search refactors, observability with Sentry and New Relic, testing and CI, with latency improvements of more than 75%.",
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
          body: "I learn the problem, what data you have, and whether an agent is the right tool. If it is not, I tell you.",
        },
        {
          title: "A prototype on your data",
          body: "A first scoped version, with evals that measure whether it answers well before adding scope.",
        },
        {
          title: "Production and measurement",
          body: "Deploy, observability, and CI tests so the agent keeps answering well when your data changes.",
        },
      ],
    },
    tagline: "Not magic. An agent that cites its sources, knows when it does not know, and passes the tests.",
    faq: {
      label: "FAQ",
      title: "Before you write",
      items: [
        {
          q: "What is a RAG system and when does it make sense?",
          a: "An agent that searches your documents or data before answering and builds the reply from them. It makes sense when the information changes often or is specific to your business and you do not want the model to make it up.",
        },
        {
          q: "What happens when the agent does not know the answer?",
          a: "I design it to say so. Botardo, for example, replies that it lacks the data when retrieval finds no context, without calling the model.",
        },
        {
          q: "How do I know it answers well?",
          a: "Deterministic evals: test cases that check which tools it calls, that numbers come from the data, and the reply language. They run in CI and block the deploy when something breaks.",
        },
        {
          q: "What about permissions and private data?",
          a: "The agent sees what the asking user sees. In Agent General every call uses that user's JWT and sessions stay isolated.",
        },
        {
          q: "What is your stack?",
          a: "TypeScript and Python; Cloudflare Workers, Vectorize, and Workers AI; GCP with Vertex AI; Google ADK and LangGraph to orchestrate agents.",
        },
        {
          q: "How much does it cost?",
          a: "It depends on scope. In the 20 minute call we see what you need, and then I send you a concrete proposal by email.",
        },
      ],
    },
    final: {
      title: "Got an idea for an agent?",
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
