import * as fs from "node:fs";
import * as path from "node:path";
import type { NormalizedViolation } from "./types.js";

interface EslintMessage {
  ruleId: string | null;
  line: number;
  column: number;
  severity: number;
  message: string;
}

interface EslintFileResult {
  filePath: string;
  messages: EslintMessage[];
}

export function parseEslintOutput(
  outputFile: string,
  repoDir: string
): NormalizedViolation[] {
  const raw = fs.readFileSync(outputFile, "utf8").trim();
  if (!raw || raw === "") return [];

  let results: EslintFileResult[];
  try {
    results = JSON.parse(raw) as EslintFileResult[];
  } catch (err) {
    throw new Error(`Failed to parse ESLint JSON output: ${err}`);
  }

  if (!Array.isArray(results)) {
    throw new Error("ESLint output is not an array");
  }

  const violations: NormalizedViolation[] = [];

  for (const fileResult of results) {
    const relPath = path.relative(repoDir, fileResult.filePath);

    for (const msg of fileResult.messages) {
      // Skip parse errors and messages without a ruleId
      if (!msg.ruleId) continue;

      violations.push({
        filePath: relPath,
        line: msg.line,
        column: msg.column,
        ruleId: msg.ruleId,
      });
    }
  }

  return violations;
}
