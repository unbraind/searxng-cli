#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const baseline = JSON.parse(readFileSync(new URL("./changelog-baseline.json", import.meta.url), "utf8"));
const changelog = readFileSync("CHANGELOG.md", "utf8").replace(/\s+/g, " ");
const tracker = JSON.parse(execFileSync("pm", ["list", "--status", "all", "--full", "--no-truncate", "--limit", "10000", "--json"], { encoding: "utf8" }));
const titles = new Set(tracker.items.map((item) => item.title));
const missingFromTracker = baseline.entries.filter((entry) => !titles.has(entry.title));
const missingFromChangelog = baseline.entries.filter((entry) => !changelog.includes(entry.title.replace(/\s+/g, " ")));
const missingHeadings = baseline.requiredGeneratedHeadings.filter((heading) => !changelog.includes(`## ${heading}`));

if (missingFromTracker.length || missingFromChangelog.length || missingHeadings.length) {
  console.error(JSON.stringify({ missingFromTracker, missingFromChangelog, missingHeadings }, null, 2));
  process.exit(1);
}
console.log(`Changelog preservation passed: ${baseline.entries.length} original entries exist in pm and generated markdown.`);
