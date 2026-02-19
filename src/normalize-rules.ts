/**
 * Maps Oxlint rule codes (format: "plugin(rule-name)") to ESLint canonical names.
 *
 * Special cases handled:
 * - react(exhaustive-deps) → react-hooks/exhaustive-deps
 * - react(rules-of-hooks) → react-hooks/rules-of-hooks
 * - node(rule-name) → n/rule-name
 */

const SPECIAL_CASE_MAP: Record<string, string> = {
  "react(exhaustive-deps)": "react-hooks/exhaustive-deps",
  "react(rules-of-hooks)": "react-hooks/rules-of-hooks",
};

const PLUGIN_PREFIX_MAP: Record<string, string> = {
  eslint: "",
  react: "react/",
  typescript: "@typescript-eslint/",
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

  // Parse "plugin(rule-name)" format
  const match = code.match(/^([\w-]+)\((.+)\)$/);
  if (!match) {
    // Not a recognized format — treat as unmapped
    return { ruleId: code, unmapped: true };
  }

  const [, plugin, ruleName] = match;

  if (!(plugin in PLUGIN_PREFIX_MAP)) {
    // Unknown plugin — log as unmapped
    return { ruleId: code, unmapped: true };
  }

  const prefix = PLUGIN_PREFIX_MAP[plugin];

  // oxc rules have no ESLint equivalent
  if (prefix === null) {
    return { ruleId: code, unmapped: true };
  }

  return { ruleId: `${prefix}${ruleName}`, unmapped: false };
}
