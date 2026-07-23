#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hasExactVersionLine } from "./version-output.mjs";

const index = process.argv.indexOf("--version");
const version = index >= 0 ? process.argv[index + 1] : process.env.npm_package_version;
if (!version) throw new Error("Pass --version <version>");
const expectedVersionOutput = `SearXNG CLI v${version}`;

/**
 * Execute one release command with deterministic UTF-8 output handling.
 *
 * @param {string} command Executable name.
 * @param {string[]} args Command arguments.
 * @param {string} cwd Working directory for the child process.
 * @returns {string} Captured stdout.
 */
function run(command, args, cwd = process.cwd()) {
  return execFileSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
}

let published = "";
for (let attempt = 0; attempt < 30; attempt++) {
  try {
    published = run("npm", ["view", `searxng-cli@${version}`, "version"]).trim();
    if (published === version) break;
  } catch {}
  await new Promise((resolve) => setTimeout(resolve, 10_000));
}
if (published !== version) throw new Error(`npm registry did not expose searxng-cli@${version}`);
const verificationDirectory = mkdtempSync(join(tmpdir(), "searxng-cli-release-"));
try {
  const npmOutput = run(
    "npx",
    ["--yes", "--package", `searxng-cli@${version}`, "--", "searxng", "--version"],
    verificationDirectory,
  ).trim();
  const bunOutput = run(
    "bunx",
    ["--bun", `searxng-cli@${version}`, "--version"],
    verificationDirectory,
  ).trim();
  if (!hasExactVersionLine(npmOutput, expectedVersionOutput)) {
    throw new Error(`npx returned an unexpected version: ${npmOutput}`);
  }
  if (!hasExactVersionLine(bunOutput, expectedVersionOutput)) {
    throw new Error(`bunx returned an unexpected version: ${bunOutput}`);
  }
  process.stdout.write(`${npmOutput}\n${bunOutput}\n`);
} finally {
  rmSync(verificationDirectory, { recursive: true, force: true });
}
console.log(`Published release verified through npm, npx, and bunx: ${version}`);
