/**
 * Prepare the e2e demo fixture so it tests the CURRENT library source.
 *
 * Run from `playwright.demo.config.ts`'s `webServer.command` (NOT from
 * `globalSetup`): in Playwright the web server is started during plugin
 * setup, which runs BEFORE the user `globalSetup`, so the install must
 * happen inside the web server command — ahead of `vite dev`.
 *
 * Steps (every run, so the fixture always reflects local `src/`):
 *   1. Build the library from source (`npm run build` at the repo root).
 *   2. `npm pack` the freshly built library into the fixture's gitignored
 *      `app/.artifact/cloudflare-auth.tgz`.
 *   3. Force-reinstall that artifact into the fixture.
 *
 * Everything produced here (the tarball, node_modules, package-lock.json)
 * is gitignored, so `git status` stays clean after `npm run test:e2e:demo`
 * (issue #20).
 */
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url)); // tests/e2e-demo
const repoRoot = join(here, "..", "..");
const appDir = join(here, "app");
const artifactDir = join(appDir, ".artifact");
const tarball = join(artifactDir, "cloudflare-auth.tgz");

const run = (cmd, cwd) => execSync(cmd, { cwd, stdio: "inherit" });

// 1. Build the library from current source.
run("npm run build", repoRoot);

// 2. Pack the freshly built library into the (gitignored) fixture artifact.
mkdirSync(artifactDir, { recursive: true });
for (const file of readdirSync(artifactDir)) {
  if (/^adrianhall-cloudflare-auth-.*\.tgz$/.test(file)) {
    rmSync(join(artifactDir, file), { force: true });
  }
}
run(`npm pack --pack-destination "${artifactDir}"`, repoRoot);
const packed = readdirSync(artifactDir).find((f) => /^adrianhall-cloudflare-auth-.*\.tgz$/.test(f));
if (!packed) {
  throw new Error(`npm pack did not produce a tarball in ${artifactDir}`);
}
renameSync(join(artifactDir, packed), tarball);

// 3. Force-reinstall the freshly built artifact, then install fixture deps.
//    Removing the installed copy guarantees the new tarball is materialised
//    even when node_modules already exists from a previous run.
rmSync(join(appDir, "node_modules", "@adrianhall"), { recursive: true, force: true });
if (!existsSync(tarball)) {
  throw new Error(`expected built artifact at ${tarball}`);
}
run("npm install", appDir);
