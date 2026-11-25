#!/usr/bin/env node
/**
 * deploy.mjs — one-command deploy: build, then push public/ to the gh-pages
 * branch (GitHub Pages serves it). Run from a clone with push access:
 *   npm run deploy
 * Requires: node, git, a `gh-pages` branch configured as the Pages source
 * (one-time setup, see README.md). No secrets, no dependencies.
 */
import { execSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function sh(cmd, cwd = process.cwd()) {
  console.log(`$ ${cmd}`);
  return execSync(cmd, { stdio: "inherit", cwd, shell: "/bin/bash" });
}

sh("node scripts/build.mjs");

const work = mkdtempSync(join(tmpdir(), "tmviz-deploy-"));
try {
  const repo = execSync("git config --get remote.origin.url", { encoding: "utf8" }).trim();
  sh(`git clone --quiet ${repo} ${work}`);
  const hasGhPages =
    execSync("git show-ref --verify --quiet refs/remotes/origin/gh-pages && echo yes || echo no", {
      cwd: work, encoding: "utf8", shell: "/bin/bash",
    }).trim() === "yes";
  if (hasGhPages) {
    sh("git checkout --quiet gh-pages", work);
  } else {
    sh("git checkout --quiet --orphan gh-pages", work);
  }
  // Clear everything except .git, then copy the fresh build in.
  sh("git rm -rf --quiet . 2>/dev/null || true", work);
  sh(`cp -r ${join(process.cwd(), "public")}/. ${work}/`, work);
  const stamp = new Date().toISOString();
  sh(`git add -A && (git -c user.name="taskmarket-visualizer" -c user.email="visualizer@taskmarket.dev" commit -qm "deploy: data as of ${stamp}" || echo "nothing to commit")`, work);
  sh("git push --quiet origin gh-pages", work);
  console.log("deployed to gh-pages.");
} finally {
  rmSync(work, { recursive: true, force: true });
}
