import { execSync, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

export interface MigrationResult {
  unsupportedRules: string[];
}

export function migrateToOxlint(repoDir: string): MigrationResult {
  console.log("[oxlint] Installing @oxlint/migrate and oxlint...");
  execSync("npx --yes oxlint@latest --version", {
    cwd: repoDir,
    stdio: "ignore",
  });

  console.log("[oxlint] Running @oxlint/migrate...");
  const result = spawnSync("npx", ["--yes", "@oxlint/migrate", "--details"], {
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
  console.log(
    `[oxlint] Migration complete. ${unsupportedRules.length} unsupported rules found.`
  );

  return { unsupportedRules };
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

export function runOxlint(repoDir: string): string {
  const outputFile = path.join(repoDir, "oxlint-output.json");

  console.log("[oxlint] Running Oxlint...");

  const result = spawnSync(
    "npx",
    ["oxlint", "--format", "json"],
    {
      cwd: repoDir,
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
    }
  );

  if (result.error) {
    throw new Error(`Failed to run Oxlint: ${result.error.message}`);
  }

  // Oxlint exits non-zero when violations found — not fatal
  const stdout = result.stdout ?? "";
  fs.writeFileSync(outputFile, stdout || '{"diagnostics":[]}', "utf8");

  console.log(`[oxlint] Output written to ${outputFile}`);
  return outputFile;
}
