import { defaultLang, languages, ui, type Lang, type UiKey } from "./ui";

export function getLangFromUrl(url: URL): Lang {
  const [, maybe] = url.pathname.split("/");
  if (maybe in ui) return maybe as Lang;
  return defaultLang;
}

export function useTranslations(lang: Lang) {
  return function t(key: UiKey): string {
    return ui[lang][key] ?? ui[defaultLang][key];
  };
}

export function getLocalizedPath(lang: Lang, path: string): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  if (lang === defaultLang) return clean;
  if (clean === "/") return `/${lang}/`;
  return `/${lang}${clean}`;
}

export function switchLangPath(currentPath: string, nextLang: Lang): string {
  const parts = currentPath.split("/").filter(Boolean);
  const currentLang = parts.length > 0 && parts[0] in languages;
  if (currentLang) parts.shift();

  const rest = parts.join("/");

  if (nextLang === defaultLang) {
    return rest ? `/${rest}${currentPath.endsWith("/") ? "/" : ""}` : "/";
  }

  return rest
    ? `/${nextLang}/${rest}${currentPath.endsWith("/") ? "/" : ""}`
    : `/${nextLang}/`;
}