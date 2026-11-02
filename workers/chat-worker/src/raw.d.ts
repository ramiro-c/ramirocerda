// Vite `?raw` imports (tests read the SQL migrations as text).
declare module "*.sql?raw" {
  const content: string;
  export default content;
}
