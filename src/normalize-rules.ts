/**
 * Maps Oxlint rule codes to ESLint canonical names.
 *
 * Oxlint codes use two formats:
 *   - "eslint(rule-name)"                  → "rule-name"
 *   - "eslint-plugin-react(rule-name)"     → "react/rule-name"
 *   - "eslint-plugin-import(rule-name)"    → "import/rule-name"
 *   etc.
 *
 * Special cases handled:
 * - eslint-plugin-react(exhaustive-deps) → react-hooks/exhaustive-deps
 * - eslint-plugin-react(rules-of-hooks)  → react-hooks/rules-of-hooks
 * - eslint-plugin-node(rule-name)        → n/rule-name
 */

const SPECIAL_CASE_MAP: Record<string, string> = {
  "eslint-plugin-react(exhaustive-deps)": "react-hooks/exhaustive-deps",
  "eslint-plugin-react(rules-of-hooks)": "react-hooks/rules-of-hooks",
};

// Keyed by the plugin segment after stripping "eslint-plugin-" (or "eslint" for core)
const PLUGIN_PREFIX_MAP: Record<string, string> = {
  eslint: "",
  react: "react/",
  typescript: "@typescript-eslint/",
  "typescript-eslint": "@typescript-eslint/",
  import: "import/",
  nextjs: "@next/next/",
  node: "n/",
  "jsx-a11y": "jsx-a11y/",
  jsdoc: "jsdoc/",
  jest: "jest/",
  vitest: "vitest/",
  unicorn: "unicorn/",
  promise: "promise/",
  "react-perf": "react-perf/",
  vue: "vue/",
  oxc: null as unknown as string, // Oxc-specific, no ESLint equivalent
};

export interface NormalizeResult {
  ruleId: string;
  unmapped: boolean;
}

/**
 * Parses an Oxlint code like "eslint(no-unused-vars)" or "react(exhaustive-deps)"
 * and returns the canonical ESLint rule name.
 */
export function normalizeOxlintRule(code: string): NormalizeResult {
  // Check special cases first
  if (SPECIAL_CASE_MAP[code]) {
    return { ruleId: SPECIAL_CASE_MAP[code], unmapped: false };
  }

  // Parse "eslint-plugin-X(rule-name)" or "eslint(rule-name)" format
  const match = code.match(/^([\w-]+)\((.+)\)$/);
  if (!match) {
    return { ruleId: code, unmapped: true };
  }

  const [, rawPlugin, ruleName] = match;
  // Strip "eslint-plugin-" prefix if present
  const plugin = rawPlugin.startsWith("eslint-plugin-")
    ? rawPlugin.slice("eslint-plugin-".length)
    : rawPlugin;

  if (!(plugin in PLUGIN_PREFIX_MAP)) {
    return { ruleId: code, unmapped: true };
  }

  const prefix = PLUGIN_PREFIX_MAP[plugin];

  // oxc rules have no ESLint equivalent
  if (prefix === null) {
    return { ruleId: code, unmapped: true };
  }

  return { ruleId: `${prefix}${ruleName}`, unmapped: false };
}
