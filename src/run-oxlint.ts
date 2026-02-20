import { execSync, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { detectPackageManager } from "./clone.js";

export interface MigrationResult {
  unsupportedRules: string[];
  portedRulesCount: number;
}

export function migrateToOxlint(
  repoDir: string,
  options: { typeAware?: boolean } = {}
): MigrationResult {
  const { typeAware = false } = options;
  const pm = detectPackageManager(repoDir);

  const packages = ["oxlint@latest", ...(typeAware ? ["oxlint-tsgolint@latest"] : [])];
  const addCmd =
    pm === "pnpm"
      ? `pnpm add --save-dev ${packages.join(" ")}`
      : pm === "yarn"
        ? `yarn add --dev ${packages.join(" ")}`
        : `npm install --save-dev ${packages.join(" ")}`;

  console.log(`[oxlint] Installing ${packages.join(", ")}...`);
  execSync(addCmd, { cwd: repoDir, stdio: "inherit" });

  console.log("[oxlint] Running @oxlint/migrate...");
  const migrateArgs = ["--yes", "@oxlint/migrate", "--details", "--with-nursery"];
  if (typeAware) migrateArgs.push("--type-aware");

  const result = spawnSync("npx", migrateArgs, {
    cwd: repoDir,
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
  });

  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  const output = stdout + "\n" + stderr;

  if (result.status !== 0 && result.status !== null) {
    console.warn(
      `[oxlint] Migration exited with code ${result.status}. Continuing...`
    );
    console.warn("[oxlint] Migration output:", output);
  }

  const unsupportedRules = parseMigrationOutput(output);
  const portedRulesCount = countPortedRules(repoDir);
  console.log(
    `[oxlint] Migration complete. ${portedRulesCount} rules ported, ${unsupportedRules.length} unsupported.`
  );

  return { unsupportedRules, portedRulesCount };
}

function countPortedRules(repoDir: string): number {
  const oxlintrcPath = path.join(repoDir, ".oxlintrc.json");
  if (!fs.existsSync(oxlintrcPath)) return 0;

  try {
    const rc = JSON.parse(fs.readFileSync(oxlintrcPath, "utf8")) as {
      rules?: Record<string, unknown>;
      overrides?: Array<{ rules?: Record<string, unknown> }>;
    };
    const ruleNames = new Set<string>();
    for (const name of Object.keys(rc.rules ?? {})) ruleNames.add(name);
    for (const override of rc.overrides ?? []) {
      for (const name of Object.keys(override.rules ?? {})) ruleNames.add(name);
    }
    return ruleNames.size;
  } catch {
    return 0;
  }
}

function parseMigrationOutput(output: string): string[] {
  const unsupported: string[] = [];

  // The --details flag prints a "Skipped N rules:" block with subcategories:
  //
  //    Skipped 47 rules:
  //      - 6 Nursery
  //        - getter-return
  //        - import-x/named
  //      - 19 Unsupported
  //        - no-dupe-args: Superseded by strict mode.
  //        - import-x/no-unresolved: Will always contain false positives...
  //
  // All skipped rules (regardless of subcategory) are rules that ESLint may
  // flag but Oxlint won't, so we collect them all for filtering.
  const lines = output.split("\n");
  let inSkippedSection = false;

  for (const line of lines) {
    if (/skipped \d+ rules/i.test(line)) {
      inSkippedSection = true;
      continue;
    }

    if (!inSkippedSection) continue;

    // Subcategory headers look like "  - 6 Nursery" or "  - 21 JS Plugins".
    // Skip them so we don't mistake the count for a rule name.
    if (/^\s+-\s+\d+\s+/.test(line)) continue;

    // Rule entries: "    - rule-name" or "    - rule-name: reason text"
    // Capture the non-whitespace token after "- "; strip a trailing colon if
    // the rule name is followed by ": <reason>" on the same line.
    const m = line.match(/^\s+-\s+(\S+)/);
    if (m) {
      unsupported.push(m[1].replace(/:$/, ""));
    }
  }

  return [...new Set(unsupported)];
}

export function runOxlint(
  repoDir: string,
  options: { typeAware?: boolean; path?: string } = {}
): string {
  const { typeAware = false, path: lintPath } = options;
  const outputFile = path.join(repoDir, "oxlint-output.json");

  console.log(`[oxlint] Running Oxlint${typeAware ? " (type-aware)" : ""}...`);

  const pm = detectPackageManager(repoDir);
  const [bin, ...execPrefix] =
    pm === "pnpm"
      ? ["pnpm", "exec", "oxlint"]
      : pm === "yarn"
        ? ["yarn", "--silent", "run", "oxlint"]
        : ["npx", "oxlint"];

  const oxlintArgs = [...execPrefix, "--format", "json"];
  if (typeAware) oxlintArgs.push("--type-aware");
  if (lintPath) oxlintArgs.push(lintPath);

  // Write stdout directly to the output file via fd to avoid ENOBUFS on large repos
  const outFd = fs.openSync(outputFile, "w");
  const result = spawnSync(bin, oxlintArgs, {
    cwd: repoDir,
    stdio: ["ignore", outFd, "pipe"],
  });
  fs.closeSync(outFd);

  if (result.error) {
    throw new Error(`Failed to run Oxlint: ${result.error.message}`);
  }

  // If oxlint wrote nothing (e.g. no files matched), ensure valid JSON
  const written = fs.readFileSync(outputFile, "utf8").trim();
  if (!written) {
    fs.writeFileSync(outputFile, '{"diagnostics":[]}', "utf8");
  }

  console.log(`[oxlint] Output written to ${outputFile}`);
  return outputFile;
}
