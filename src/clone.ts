import { execSync, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

const WORKDIR = path.join(process.cwd(), ".comparator-workdir");

export function detectPackageManager(repoDir: string): "pnpm" | "yarn" | "npm" {
  if (fs.existsSync(path.join(repoDir, "pnpm-lock.yaml"))) return "pnpm";
  if (fs.existsSync(path.join(repoDir, "yarn.lock"))) return "yarn";
  return "npm";
}

export function cloneRepo(repoUrl: string, branch?: string): string {
  fs.mkdirSync(WORKDIR, { recursive: true });

  const repoName = repoUrl.split("/").pop()?.replace(/\.git$/, "") ?? "repo";
  const repoDir = path.join(WORKDIR, repoName);

  if (fs.existsSync(repoDir)) {
    console.log(`[clone] Directory ${repoDir} already exists, skipping clone.`);
    console.log("[clone] To re-clone, delete the directory and run again.");
  } else {
    console.log(`[clone] Cloning ${repoUrl} into ${repoDir} (shallow)...`);
    const cloneArgs = ["clone", "--depth", "1", repoUrl, repoDir];
    if (branch) {
      cloneArgs.push("--branch", branch);
    }
    cloneArgs.push("--single-branch");
    const result = spawnSync("git", cloneArgs, { stdio: "inherit" });
    if (result.status !== 0) {
      throw new Error(`git clone failed with exit code ${result.status}`);
    }
  }

  const pm = detectPackageManager(repoDir);
  console.log(`[clone] Detected package manager: ${pm}`);
  console.log(`[clone] Installing dependencies in ${repoDir}...`);

  const installCmd =
    pm === "pnpm"
      ? "pnpm install --frozen-lockfile"
      : pm === "yarn"
        ? "yarn install --frozen-lockfile"
        : "npm ci";

  try {
    execSync(installCmd, { cwd: repoDir, stdio: "inherit" });
  } catch {
    console.warn(
      "[clone] Frozen install failed, retrying without frozen lockfile..."
    );
    const fallback =
      pm === "pnpm"
        ? "pnpm install"
        : pm === "yarn"
          ? "yarn install"
          : "npm install";
    execSync(fallback, { cwd: repoDir, stdio: "inherit" });
  }

  return repoDir;
}
