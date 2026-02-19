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

  const packages = ["oxlint", "@oxlint/migrate", ...(typeAware ? ["oxlint-tsgolint"] : [])];
  const addCmd =
    pm === "pnpm"
      ? `pnpm add --save-dev ${packages.join(" ")}`
      : pm === "yarn"
        ? `yarn add --dev ${packages.join(" ")}`
        : `npm install --save-dev ${packages.join(" ")}`;

  console.log(`[oxlint] Installing ${packages.join(", ")}...`);
  execSync(addCmd, { cwd: repoDir, stdio: "inherit" });

  console.log("[oxlint] Running @oxlint/migrate...");
  const [migrateBin, ...migrateArgs] =
    pm === "pnpm"
      ? ["pnpm", "exec", "@oxlint/migrate", "--details"]
      : pm === "yarn"
        ? ["yarn", "exec", "@oxlint/migrate", "--details"]
        : ["npx", "@oxlint/migrate", "--details"];
  if (typeAware) migrateArgs.push("--type-aware");

  const result = spawnSync(migrateBin, migrateArgs, {
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

  // The --details flag prints unsupported rules. Lines typically look like:
  // "  - @typescript-eslint/no-floating-promises (not supported)"
  // "  - custom-plugin/rule-name"
  // We look for "unsupported" sections in the output.
  const lines = output.split("\n");
  let inUnsupportedSection = false;

  for (const line of lines) {
    const lower = line.toLowerCase();

    // Detect section headers
    if (
      lower.includes("unsupported") ||
      lower.includes("not supported") ||
      lower.includes("cannot migrate")
    ) {
      inUnsupportedSection = true;
    }

    if (inUnsupportedSection) {
      // Match rule-like patterns: word/word, @scope/package/rule, etc.
      const ruleMatch = line.match(/[-•*]\s+([@\w][\w/@-]*\/[\w-]+)/);
      if (ruleMatch) {
        unsupported.push(ruleMatch[1]);
      }
    }

    // Reset section on blank line after content
    if (inUnsupportedSection && line.trim() === "" && unsupported.length > 0) {
      // Keep scanning — there may be multiple sections
    }
  }

  return [...new Set(unsupported)];
}

export function runOxlint(
  repoDir: string,
  options: { typeAware?: boolean } = {}
): string {
  const { typeAware = false } = options;
  const outputFile = path.join(repoDir, "oxlint-output.json");

  console.log(`[oxlint] Running Oxlint${typeAware ? " (type-aware)" : ""}...`);

  const pm = detectPackageManager(repoDir);
  const [bin, ...execPrefix] =
    pm === "pnpm"
      ? ["pnpm", "exec", "oxlint"]
      : pm === "yarn"
        ? ["yarn", "exec", "oxlint"]
        : ["npx", "oxlint"];

  const oxlintArgs = [...execPrefix, "--format", "json"];
  if (typeAware) oxlintArgs.push("--type-aware");

  const result = spawnSync(bin, oxlintArgs, {
    cwd: repoDir,
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
  });

  if (result.error) {
    throw new Error(`Failed to run Oxlint: ${result.error.message}`);
  }

  // Oxlint exits non-zero when violations found — not fatal
  const stdout = result.stdout ?? "";
  fs.writeFileSync(outputFile, stdout || '{"diagnostics":[]}', "utf8");

  console.log(`[oxlint] Output written to ${outputFile}`);
  return outputFile;
}
