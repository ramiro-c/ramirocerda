/**
 * Scroll reveals (landing kit B7) and the word by word tagline (B11), both on
 * IntersectionObserver, never a scroll listener. Each element reveals once.
 */
export function initReveal(): void {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const sections = document.querySelectorAll<HTMLElement>(".reveal");
  const words = document.querySelectorAll<HTMLElement>("[data-tagline] .tagline-word");

  if (!("IntersectionObserver" in window) || reduce) {
    sections.forEach((el) => el.classList.add("is-visible"));
    words.forEach((el) => el.classList.add("is-lit"));
    return;
  }

  const sectionObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-visible");
        sectionObserver.unobserve(entry.target);
      }
    },
    { rootMargin: "0px 0px -10% 0px" },
  );
  sections.forEach((el) => sectionObserver.observe(el));

  // Words light up as they cross a line 40% above the bottom of the viewport.
  // Words crossing in the same frame are staggered in reading order.
  const wordObserver = new IntersectionObserver(
    (entries) => {
      const crossing = entries
        .filter((entry) => entry.isIntersecting)
        .map((entry) => entry.target as HTMLElement)
        .sort((a, b) => Number(a.dataset.index) - Number(b.dataset.index));
      crossing.forEach((word, i) => {
        word.style.transitionDelay = `${i * 60}ms`;
        word.classList.add("is-lit");
        wordObserver.unobserve(word);
      });
    },
    { rootMargin: "0px 0px -40% 0px" },
  );
  words.forEach((el) => wordObserver.observe(el));
}
