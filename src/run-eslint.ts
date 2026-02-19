import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { detectPackageManager } from "./clone.js";

export function runEslint(repoDir: string): string {
  const outputFile = path.join(repoDir, "eslint-output.json");

  console.log("[eslint] Running ESLint...");

  // Detect if repo uses a flat config or legacy config
  const hasEslintConfig = detectEslintConfig(repoDir);
  if (!hasEslintConfig) {
    throw new Error(
      "No ESLint configuration found in target repo. Cannot proceed."
    );
  }

  const pm = detectPackageManager(repoDir);
  const [bin, ...eslintArgs] =
    pm === "pnpm"
      ? ["pnpm", "exec", "eslint", ".", "--format", "json", "--output-file", outputFile]
      : pm === "yarn"
        ? ["yarn", "exec", "eslint", ".", "--format", "json", "--output-file", outputFile]
        : ["npx", "eslint", ".", "--format", "json", "--output-file", outputFile];

  const result = spawnSync(bin, eslintArgs, {
      cwd: repoDir,
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
    }
  );

  // ESLint exits with code 1 when violations are found — not a fatal error
  if (result.status !== null && result.status > 1) {
    const stderr = result.stderr?.toString() ?? "";
    throw new Error(`ESLint failed with exit code ${result.status}:\n${stderr}`);
  }

  if (result.error) {
    throw new Error(`Failed to run ESLint: ${result.error.message}`);
  }

  // ESLint with --output-file writes to the file; if no violations, it may
  // still write an empty array. Ensure the file exists.
  if (!fs.existsSync(outputFile)) {
    // ESLint may have written to stdout instead
    const stdout = result.stdout?.toString() ?? "[]";
    fs.writeFileSync(outputFile, stdout || "[]", "utf8");
  }

  const content = fs.readFileSync(outputFile, "utf8").trim();
  if (!content || content === "") {
    fs.writeFileSync(outputFile, "[]", "utf8");
  }

  console.log(`[eslint] Output written to ${outputFile}`);
  return outputFile;
}

function detectEslintConfig(repoDir: string): boolean {
  const flatConfigs = [
    "eslint.config.js",
    "eslint.config.mjs",
    "eslint.config.cjs",
    "eslint.config.ts",
    "eslint.config.mts",
  ];
  const legacyConfigs = [
    ".eslintrc",
    ".eslintrc.js",
    ".eslintrc.cjs",
    ".eslintrc.yaml",
    ".eslintrc.yml",
    ".eslintrc.json",
  ];

  for (const config of flatConfigs) {
    if (fs.existsSync(path.join(repoDir, config))) {
      console.log(`[eslint] Found flat config: ${config}`);
      return true;
    }
  }

  for (const config of legacyConfigs) {
    if (fs.existsSync(path.join(repoDir, config))) {
      console.error(
        `[eslint] Found legacy config: ${config}. Legacy ESLint configs are not supported by @oxlint/migrate. Please migrate to flat config first.`
      );
      throw new Error(
        `Legacy ESLint config detected (${config}). Only flat config (eslint.config.*) is supported.`
      );
    }
  }

  return false;
}

export { detectEslintConfig };
