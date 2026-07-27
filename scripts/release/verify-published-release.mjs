#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
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

/**
 * Assert that one package-manager shim resolves inside its isolated package root.
 *
 * @param {string} binaryPath Expected executable shim path.
 * @param {string} packageRoot Exact installed package root.
 */
function assertIsolatedBinary(binaryPath, packageRoot) {
  const resolvedBinary = realpathSync(binaryPath);
  const resolvedRoot = realpathSync(packageRoot);
  if (!resolvedBinary.startsWith(`${resolvedRoot}${sep}`)) {
    throw new Error(`Published executable escaped its isolated package root: ${resolvedBinary}`);
  }
}

/**
 * Detect the exact source-status resource row in instance help output.
 *
 * @param {string} output Captured instance help text.
 * @returns {boolean} Whether the published CLI exposes the source-status contract.
 */
function hasSourceStatusResource(output) {
  return output.split(/\r?\n/u).some((line) => /^\s+source-status\s+/u.test(line));
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
  const npmDirectory = join(verificationDirectory, "npm");
  const bunDirectory = join(verificationDirectory, "bun");
  mkdirSync(npmDirectory);
  mkdirSync(bunDirectory);
  run(
    "npm",
    [
      "install",
      "--prefix",
      npmDirectory,
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      `searxng-cli@${version}`,
    ],
    verificationDirectory,
  );
  run(
    "bun",
    ["add", "--cwd", bunDirectory, "--no-save", `searxng-cli@${version}`],
    verificationDirectory,
  );
  assertIsolatedBinary(
    join(npmDirectory, "node_modules", ".bin", "searxng"),
    join(npmDirectory, "node_modules", "searxng-cli"),
  );
  assertIsolatedBinary(
    join(bunDirectory, "node_modules", ".bin", "searxng"),
    join(bunDirectory, "node_modules", "searxng-cli"),
  );
  const npmOutput = run(
    "npx",
    ["--no-install", "--prefix", npmDirectory, "searxng", "--version"],
    verificationDirectory,
  ).trim();
  const npmHelp = run(
    "npx",
    ["--no-install", "--prefix", npmDirectory, "searxng", "instance", "--help"],
    verificationDirectory,
  );
  const bunOutput = run(
    "bunx",
    ["--bun", "--no-install", "searxng", "--version"],
    bunDirectory,
  ).trim();
  const bunHelp = run(
    "bunx",
    ["--bun", "--no-install", "searxng", "instance", "--help"],
    bunDirectory,
  );
  if (!hasExactVersionLine(npmOutput, expectedVersionOutput)) {
    throw new Error(`npx returned an unexpected version: ${npmOutput}`);
  }
  if (!hasExactVersionLine(bunOutput, expectedVersionOutput)) {
    throw new Error(`bunx returned an unexpected version: ${bunOutput}`);
  }
  if (!hasSourceStatusResource(npmHelp) || !hasSourceStatusResource(bunHelp)) {
    throw new Error("Published consumers do not expose the source-status resource");
  }
  process.stdout.write(`${npmOutput}\n${bunOutput}\n`);
} finally {
  rmSync(verificationDirectory, { recursive: true, force: true });
}
console.log(`Published release verified through npm, npx, and bunx: ${version}`);
