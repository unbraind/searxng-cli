#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const baseline = JSON.parse(readFileSync(new URL("./changelog-baseline.json", import.meta.url), "utf8"));
const args = process.argv.slice(2);
const checkIndex = args.indexOf("--check");
const check = checkIndex !== -1;
if (check) args.splice(checkIndex, 1);

const hasReleaseVersion = args.some(
  (arg) => arg === "--release-version" || arg === "--release-version-from-package",
);
const releaseArgs = hasReleaseVersion ? args : ["--release-version-from-package", ...args];
const result = JSON.parse(
  execFileSync(
    "pm",
    [
      "--json",
      "changelog",
      "generate",
      "--stdout",
      "--title",
      "Changelog",
      "--mode",
      "replace",
      ...releaseArgs,
      "--all-release-tags",
      "--status",
      "closed",
      "--item-url-base",
      "https://github.com/unbraind/searxng-cli/blob/master/.agents/pm",
    ],
    { encoding: "utf8" },
  ),
);

const marker = "# Changelog\n\n";
if (!result.changelog.startsWith(marker)) {
  throw new Error("pm-changelog output did not start with the expected title");
}

const preamble = `${baseline.preamble.join("\n\n")}\n\n`;
const changelog = result.changelog.replace(marker, `${marker}${preamble}`);
const output = "CHANGELOG.md";
const previous = readFileSync(output, "utf8");
const changed = previous !== changelog;

if (check) {
  console.log(JSON.stringify({ file: output, action: changed ? "would_change" : "unchanged", changed }));
  if (changed) process.exitCode = 1;
} else {
  writeFileSync(output, changelog);
  console.log(JSON.stringify({ file: output, action: changed ? "replaced" : "unchanged", changed }));
}
