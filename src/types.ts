export interface NormalizedViolation {
  filePath: string; // Relative path from repo root
  line: number; // 1-based
  column: number; // 1-based
  ruleId: string; // Canonical rule name (ESLint convention)
}

export interface ComparisonReport {
  eslintTotal: number;
  oxlintTotal: number;
  onlyInEslint: NormalizedViolation[];
  onlyInOxlint: NormalizedViolation[];
  matchedCount: number;
  unsupportedRules: string[];
}
