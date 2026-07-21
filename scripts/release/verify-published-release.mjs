#!/usr/bin/env node

import { execFileSync } from "node:child_process";

const index = process.argv.indexOf("--version");
const version = index >= 0 ? process.argv[index + 1] : process.env.npm_package_version;
if (!version) throw new Error("Pass --version <version>");

function run(command, args, capture = false) {
  return execFileSync(command, args, { encoding: "utf8", stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit" });
}

let published = "";
for (let attempt = 0; attempt < 30; attempt++) {
  try {
    published = run("npm", ["view", `searxng-cli@${version}`, "version"], true).trim();
    if (published === version) break;
  } catch {}
  await new Promise((resolve) => setTimeout(resolve, 10_000));
}
if (published !== version) throw new Error(`npm registry did not expose searxng-cli@${version}`);
run("npx", ["--yes", "--package", `searxng-cli@${version}`, "--", "searxng", "--version"]);
run("bunx", ["--bun", `searxng-cli@${version}`, "--version"]);
console.log(`Published release verified through npm, npx, and bunx: ${version}`);
