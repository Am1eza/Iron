import { defineConfig } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import reactHooks from "eslint-plugin-react-hooks";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig([
    {
        extends: [...nextCoreWebVitals, ...nextTypescript],

        rules: {
            "import/no-default-export": "off",
            "@typescript-eslint/consistent-type-imports": "warn",
        },
    },
    {
        plugins: { "react-hooks": reactHooks },
        rules: {
            // eslint-config-next 16 pulled in eslint-plugin-react-hooks 5→7,
            // which ships a whole new "React Compiler readiness" diagnostic
            // family (set-state-in-effect, set-state-in-render, refs, purity,
            // static-components, incompatible-library, use-memo) — 100+ new
            // findings here, on patterns this codebase uses deliberately and
            // extensively (e.g. the documented "assign ref.current during
            // render, read it later in an effect" idiom). React's own docs
            // say explicitly: "you don't need to fix all violations
            // immediately — address them at your own pace"
            // (https://react.dev/reference/eslint-plugin-react-hooks).
            // Adopting React Compiler is a deliberate, separate initiative,
            // not a side effect of a Next.js version bump — downgraded to
            // warn so they stay visible without blocking CI.
            // rules-of-hooks/exhaustive-deps (the pre-existing,
            // well-understood rules) are untouched.
            "react-hooks/set-state-in-effect": "warn",
            "react-hooks/set-state-in-render": "warn",
            "react-hooks/refs": "warn",
            "react-hooks/purity": "warn",
            "react-hooks/static-components": "warn",
            "react-hooks/incompatible-library": "warn",
            "react-hooks/use-memo": "warn",
        },
    },
    {
        // server.cjs is CommonJS on purpose (cPanel/Passenger entry point —
        // see its own header comment); `next lint` never reached the repo
        // root, but plain `eslint .` does, so require() here now needs an
        // explicit exemption from the TypeScript-oriented rule that assumes
        // ESM everywhere.
        files: ["server.cjs"],
        rules: {
            "@typescript-eslint/no-require-imports": "off",
        },
    },
]);