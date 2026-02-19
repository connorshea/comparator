import * as fs from "node:fs";
import * as path from "node:path";
import type { NormalizedViolation } from "./types.js";
import { normalizeOxlintRule } from "./normalize-rules.js";

interface OxlintSpan {
  offset: number;
  length: number;
  line: number;
  column: number;
}

interface OxlintLabel {
  span: OxlintSpan;
  message?: string;
}

interface OxlintDiagnostic {
  /** Rule identifier, e.g. "eslint(no-unused-vars)" or "react(exhaustive-deps)" */
  code: string;
  /** File path (relative or absolute) */
  filename: string;
  labels: OxlintLabel[];
  message?: string;
  severity?: string;
}

interface OxlintOutput {
  diagnostics: OxlintDiagnostic[];
}

export function parseOxlintOutput(
  outputFile: string,
  repoDir: string
): NormalizedViolation[] {
  const raw = fs.readFileSync(outputFile, "utf8").trim();
  if (!raw) return [];

  let output: OxlintOutput;
  try {
    output = JSON.parse(raw) as OxlintOutput;
  } catch (err) {
    throw new Error(`Failed to parse Oxlint JSON output: ${err}`);
  }

  if (!output.diagnostics || !Array.isArray(output.diagnostics)) {
    return [];
  }

  const violations: NormalizedViolation[] = [];
  const unmappedRules = new Set<string>();

  for (const diagnostic of output.diagnostics) {
    if (!diagnostic.code || !diagnostic.filename) continue;

    // Normalize file path to relative from repo root
    const absOrRel = diagnostic.filename;
    const relPath = path.isAbsolute(absOrRel)
      ? path.relative(repoDir, absOrRel)
      : absOrRel;

    // Get location from the first label
    const label = diagnostic.labels?.[0];
    if (!label?.span) continue;

    // Oxlint span line/column are 1-based
    const line = label.span.line;
    const column = label.span.column;

    const { ruleId, unmapped } = normalizeOxlintRule(diagnostic.code);
    if (unmapped) {
      unmappedRules.add(diagnostic.code);
      continue;
    }

    violations.push({
      filePath: relPath,
      line,
      column,
      ruleId,
    });
  }

  if (unmappedRules.size > 0) {
    console.warn(
      `[oxlint] Warning: ${unmappedRules.size} unmapped rule(s) skipped:`
    );
    for (const rule of unmappedRules) {
      console.warn(`  - ${rule}`);
    }
  }

  return violations;
}
