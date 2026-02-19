import * as path from "node:path";
import { cloneRepo } from "./clone.js";
import { runEslint } from "./run-eslint.js";
import { migrateToOxlint, runOxlint } from "./run-oxlint.js";
import { parseEslintOutput } from "./parse-eslint.js";
import { parseOxlintOutput } from "./parse-oxlint.js";
import { compareViolations } from "./compare.js";
import type { ComparisonReport, NormalizedViolation } from "./types.js";

function parseArgs(argv: string[]): { repoUrl: string; branch?: string } {
  const args = argv.slice(2); // remove 'node' and script path

  if (args.length === 0) {
    console.error("Usage: pnpm run compare <repo-url> [--branch <branch>]");
    process.exit(1);
  }

  const repoUrl = args[0];
  let branch: string | undefined;

  for (let i = 1; i < args.length; i++) {
    if (args[i] === "--branch" && args[i + 1]) {
      branch = args[i + 1];
      i++;
    }
  }

  return { repoUrl, branch };
}

function printReport(report: ComparisonReport, repoUrl: string): void {
  const matchPct =
    report.eslintTotal > 0
      ? ((report.matchedCount / report.eslintTotal) * 100).toFixed(1)
      : "N/A";

  console.log("\n=== Oxlint vs ESLint Comparison ===");
  console.log(`Repository: ${repoUrl}`);
  console.log("");
  console.log(
    `ESLint violations (supported rules only): ${report.eslintTotal}`
  );
  console.log(`Oxlint violations: ${report.oxlintTotal}`);
  console.log(`Matched violations: ${report.matchedCount}`);

  console.log(
    `\n--- Only in ESLint (${report.onlyInEslint.length} violations) ---`
  );
  if (report.onlyInEslint.length === 0) {
    console.log("  (none)");
  } else {
    for (const v of report.onlyInEslint) {
      console.log(`  ${v.filePath}:${v.line}:${v.column}  ${v.ruleId}`);
    }
  }

  console.log(
    `\n--- Only in Oxlint (${report.onlyInOxlint.length} violations) ---`
  );
  if (report.onlyInOxlint.length === 0) {
    console.log("  (none)");
  } else {
    for (const v of report.onlyInOxlint) {
      console.log(`  ${v.filePath}:${v.line}:${v.column}  ${v.ruleId}`);
    }
  }

  const totalUnsupported = report.unsupportedRules.length;
  console.log(
    `\n--- Unsupported Rules (skipped, ${totalUnsupported} total) ---`
  );
  if (totalUnsupported === 0) {
    console.log("  (none)");
  } else {
    const SHOW_MAX = 20;
    const toShow = report.unsupportedRules.slice(0, SHOW_MAX);
    for (const rule of toShow) {
      console.log(`  ${rule}`);
    }
    if (totalUnsupported > SHOW_MAX) {
      console.log(`  ... and ${totalUnsupported - SHOW_MAX} more`);
    }
  }

  console.log(
    `\nSummary: Oxlint matched ${matchPct}% of ESLint violations for supported rules.`
  );
}

async function main(): Promise<void> {
  const { repoUrl, branch } = parseArgs(process.argv);

  console.log(`\n[comparator] Starting comparison for: ${repoUrl}`);
  if (branch) console.log(`[comparator] Branch: ${branch}`);

  // Phase 1: Clone and install
  const repoDir = cloneRepo(repoUrl, branch);
  console.log(`[comparator] Repo ready at: ${repoDir}`);

  // Phase 2: Run ESLint
  const eslintOutputFile = runEslint(repoDir);

  // Phase 3: Migrate ESLint config → Oxlint config
  const { unsupportedRules } = migrateToOxlint(repoDir);

  // Phase 4: Run Oxlint
  const oxlintOutputFile = runOxlint(repoDir);

  // Phase 5: Parse outputs
  const eslintViolations = parseEslintOutput(eslintOutputFile, repoDir);
  const oxlintViolations = parseOxlintOutput(oxlintOutputFile, repoDir);

  console.log(
    `\n[comparator] ESLint: ${eslintViolations.length} total violations`
  );
  console.log(
    `[comparator] Oxlint: ${oxlintViolations.length} total violations`
  );
  console.log(
    `[comparator] Unsupported rules (will be filtered): ${unsupportedRules.length}`
  );

  // Phase 6: Compare
  const report = compareViolations(
    eslintViolations,
    oxlintViolations,
    new Set(unsupportedRules)
  );

  // Phase 7: Report
  printReport(report, repoUrl);
}

main().catch((err) => {
  console.error("\n[comparator] Fatal error:", err.message || err);
  process.exit(1);
});
