import * as fs from "node:fs";
import * as path from "node:path";
import { cloneRepo } from "./clone.js";
import { runEslint } from "./run-eslint.js";
import { migrateToOxlint, runOxlint } from "./run-oxlint.js";
import { parseEslintOutput } from "./parse-eslint.js";
import { parseOxlintOutput } from "./parse-oxlint.js";
import { compareViolations } from "./compare.js";
import type { ComparisonReport, NormalizedViolation } from "./types.js";

function getPackageVersion(repoDir: string, packageName: string): string {
  try {
    const pkgJson = JSON.parse(
      fs.readFileSync(
        path.join(repoDir, "node_modules", packageName, "package.json"),
        "utf8"
      )
    ) as { version: string };
    return pkgJson.version;
  } catch {
    return "unknown";
  }
}

function parseArgs(argv: string[]): {
  repoUrl: string;
  branch?: string;
  typeAware: boolean;
} {
  const args = argv.slice(2); // remove 'node' and script path

  if (args.length === 0) {
    console.error(
      "Usage: pnpm run compare <repo-url> [--branch <branch>] [--type-aware]"
    );
    process.exit(1);
  }

  const repoUrl = args[0];
  let branch: string | undefined;
  let typeAware = false;

  for (let i = 1; i < args.length; i++) {
    if (args[i] === "--branch" && args[i + 1]) {
      branch = args[i + 1];
      i++;
    } else if (args[i] === "--type-aware") {
      typeAware = true;
    }
  }

  return { repoUrl, branch, typeAware };
}

interface ToolVersions {
  eslint: string;
  oxlint: string;
  oxlintTsgolint?: string;
}

function printReport(
  report: ComparisonReport,
  repoUrl: string,
  versions: ToolVersions
): void {
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

  const versionParts = [
    `ESLint ${versions.eslint}`,
    `Oxlint ${versions.oxlint}`,
    ...(versions.oxlintTsgolint ? [`oxlint-tsgolint ${versions.oxlintTsgolint}`] : []),
  ];
  const totalRules = report.portedRulesCount + report.unsupportedRules.length;
  const portedPct =
    totalRules > 0
      ? ((report.portedRulesCount / totalRules) * 100).toFixed(1)
      : "N/A";
  const matchSummary =
    report.eslintTotal > 0
      ? `Oxlint matched ${matchPct}% of ESLint violations for supported rules.`
      : "ESLint reported no violations.";
  console.log(
    `\nSummary: Migration ported ${report.portedRulesCount} rules (${portedPct}% of ${totalRules} total). ${matchSummary}`
  );
  console.log(`Versions: ${versionParts.join(", ")}`);
}

async function main(): Promise<void> {
  const { repoUrl, branch, typeAware } = parseArgs(process.argv);

  console.log(`\n[comparator] Starting comparison for: ${repoUrl}`);
  if (branch) console.log(`[comparator] Branch: ${branch}`);
  if (typeAware) console.log(`[comparator] Mode: type-aware`);

  // Phase 1: Clone and install
  const repoDir = cloneRepo(repoUrl, branch);
  console.log(`[comparator] Repo ready at: ${repoDir}`);

  // Phase 2: Run ESLint
  const eslintOutputFile = runEslint(repoDir);

  // Phase 3: Migrate ESLint config → Oxlint config
  const { unsupportedRules, portedRulesCount } = migrateToOxlint(repoDir, { typeAware });

  // Phase 4: Run Oxlint
  const oxlintOutputFile = runOxlint(repoDir, { typeAware });

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
    new Set(unsupportedRules),
    portedRulesCount
  );

  // Phase 7: Report
  const versions: ToolVersions = {
    eslint: getPackageVersion(repoDir, "eslint"),
    oxlint: getPackageVersion(repoDir, "oxlint"),
    ...(typeAware && {
      oxlintTsgolint: getPackageVersion(repoDir, "oxlint-tsgolint"),
    }),
  };
  printReport(report, repoUrl, versions);
}

main().catch((err) => {
  console.error("\n[comparator] Fatal error:", err.message || err);
  process.exit(1);
});
