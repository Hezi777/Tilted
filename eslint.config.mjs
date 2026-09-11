import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// The spec (section 9) requires Tailwind logical properties only, never physical ones,
// because the whole UI is RTL. This catches them mechanically instead of by review.
const PHYSICAL_CLASS =
  /(?:^|\s)-?(?:ml|mr|pl|pr|left|right|border-l|border-r|rounded-l|rounded-r|text-left|text-right)(?:-|\s|$)/;

// A logical inset flips under dir="rtl" and a physical transform does not, so an
// element given both lands a full offset away from where the maths put it. This
// shipped a table with seats outside their container, and later a winner's crown
// beside the winner's head. Neither utility is wrong alone, which is why this has
// to match the *pair* rather than either name.
const LOGICAL_INSET_WITH_PHYSICAL_TRANSFORM =
  /(?=[\s\S]*(?:^|\s)-?(?:start|end)-)(?=[\s\S]*(?:^|\s)-?translate-x-)/;

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: `JSXAttribute[name.name='className'] Literal[value=${PHYSICAL_CLASS}]`,
          message:
            "RTL: use Tailwind logical properties (ms-/me-/ps-/pe-/start-/end-/text-start/text-end), never physical ones.",
        },
        {
          selector: `JSXAttribute[name.name='className'] TemplateElement[value.raw=${PHYSICAL_CLASS}]`,
          message:
            "RTL: use Tailwind logical properties (ms-/me-/ps-/pe-/start-/end-/text-start/text-end), never physical ones.",
        },
        {
          selector: `JSXAttribute[name.name='className'] Literal[value=${LOGICAL_INSET_WITH_PHYSICAL_TRANSFORM}]`,
          message:
            "RTL: never combine a logical inset (start-/end-) with a physical transform (translate-x-). They disagree under dir=\"rtl\". Use left/right + translate-x, or a logical transform.",
        },
        {
          selector: `JSXAttribute[name.name='className'] TemplateElement[value.raw=${LOGICAL_INSET_WITH_PHYSICAL_TRANSFORM}]`,
          message:
            "RTL: never combine a logical inset (start-/end-) with a physical transform (translate-x-). They disagree under dir=\"rtl\". Use left/right + translate-x, or a logical transform.",
        },
      ],
    },
  },
  {
    // shadcn primitives are vendored upstream code; we style them, we don't police them.
    files: ["src/components/ui/**"],
    rules: { "no-restricted-syntax": "off" },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "drizzle/**",
  ]),
]);

export default eslintConfig;
