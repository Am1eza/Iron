// TypeScript 6 turned on `noUncheckedSideEffectImports` by default, so a
// bare `import './globals.css'` (src/app/layout.tsx) needs an ambient module
// declaration — TS ships none for CSS, unlike the image types next-env.d.ts
// already references.
declare module '*.css';
