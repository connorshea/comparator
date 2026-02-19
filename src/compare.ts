import type { NormalizedViolation, ComparisonReport } from "./types.js";

function violationKey(v: NormalizedViolation): string {
  return `${v.line}:${v.column}:${v.ruleId}`;
}

export function compareViolations(
  eslintViolations: NormalizedViolation[],
  oxlintViolations: NormalizedViolation[],
  unsupportedRules: Set<string>,
  portedRulesCount: number
): ComparisonReport {
  // Filter ESLint violations to only those for rules Oxlint supports
  const filteredEslint = eslintViolations.filter(
    (v) => !unsupportedRules.has(v.ruleId)
  );

  // Build lookup: filePath → Set<"line:column:ruleId">
  const oxlintByFile = new Map<string, Set<string>>();
  for (const v of oxlintViolations) {
    if (!oxlintByFile.has(v.filePath)) {
      oxlintByFile.set(v.filePath, new Set());
    }
    oxlintByFile.get(v.filePath)!.add(violationKey(v));
  }

  const eslintByFile = new Map<string, Set<string>>();
  for (const v of filteredEslint) {
    if (!eslintByFile.has(v.filePath)) {
      eslintByFile.set(v.filePath, new Set());
    }
    eslintByFile.get(v.filePath)!.add(violationKey(v));
  }

  // Find violations only in ESLint
  const onlyInEslint: NormalizedViolation[] = [];
  for (const v of filteredEslint) {
    const oxlintKeys = oxlintByFile.get(v.filePath);
    if (!oxlintKeys || !oxlintKeys.has(violationKey(v))) {
      onlyInEslint.push(v);
    }
  }

  // Find violations only in Oxlint
  const onlyInOxlint: NormalizedViolation[] = [];
  for (const v of oxlintViolations) {
    const eslintKeys = eslintByFile.get(v.filePath);
    if (!eslintKeys || !eslintKeys.has(violationKey(v))) {
      onlyInOxlint.push(v);
    }
  }

  const matchedCount = filteredEslint.length - onlyInEslint.length;

  return {
    eslintTotal: filteredEslint.length,
    oxlintTotal: oxlintViolations.length,
    onlyInEslint,
    onlyInOxlint,
    matchedCount,
    unsupportedRules: [...unsupportedRules],
    portedRulesCount,
  };
}
