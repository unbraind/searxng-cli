#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { calendarVersion, git, nextCalendarVersion, releaseState } from "./release-state.mjs";

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const push = args.has("--push");
const json = args.has("--json");
const releasePushToken = process.env.RELEASE_PUSH_TOKEN?.trim() ?? "";
delete process.env.RELEASE_PUSH_TOKEN;

function output(value) {
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `skipped=${value.skipped ? "true" : "false"}\n`);
    appendFileSync(process.env.GITHUB_OUTPUT, `tag=${value.tag ?? ""}\n`);
    appendFileSync(process.env.GITHUB_OUTPUT, `version=${value.version ?? ""}\n`);
    appendFileSync(process.env.GITHUB_OUTPUT, `reason=${value.reason ?? ""}\n`);
  }
  process.stdout.write(json ? `${JSON.stringify(value, null, 2)}\n` : `${value.message}\n`);
}

function run(command, commandArgs, env = process.env) {
  execFileSync(command, commandArgs, { stdio: "inherit", env });
}

function writeVersion(version) {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  pkg.version = version;
  writeFileSync("package.json", `${JSON.stringify(pkg, null, 2)}\n`);
}

if (push && dryRun) throw new Error("--push and --dry-run are mutually exclusive");
if (git(["status", "--porcelain"])) throw new Error("Release pipeline requires a clean working tree");

const state = releaseState();
if (state.commitCount === 0) {
  output({ ok: true, skipped: true, reason: "no_changes_since_last_tag", last_tag: state.lastTag, message: "No changes since the last release tag." });
  process.exit(0);
}
if (state.relevantFiles.length === 0) {
  output({ ok: true, skipped: true, reason: "tracker_only_changes_since_last_tag", last_tag: state.lastTag, message: "Only pm tracker changes exist since the last release tag." });
  process.exit(0);
}

const today = calendarVersion();
if (state.tags.some((tag) => tag === `v${today}` || tag.startsWith(`v${today}-`))) {
  output({ ok: true, skipped: true, reason: "release_already_cut_today", date_key: today, message: `A release already exists for ${today}.` });
  process.exit(0);
}

const version = nextCalendarVersion(state.tags);
const originals = new Map([
  ["package.json", readFileSync("package.json")],
  ["CHANGELOG.md", readFileSync("CHANGELOG.md")],
  [".agents/pm/extensions/.managed-extensions.json", readFileSync(".agents/pm/extensions/.managed-extensions.json")],
]);

try {
  writeVersion(version);
  run("pm", ["install", "npm:pm-changelog", "--project"]);
  run("pm", ["changelog", "generate", "--output", "CHANGELOG.md", "--title", "Changelog", "--mode", "replace", "--release-version", version, "--all-release-tags", "--status", "closed", "--item-url-base", "https://github.com/unbraind/searxng-cli/blob/master/.agents/pm"]);
  run(process.execPath, ["scripts/release/check-changelog-preservation.mjs"]);
  run("bun", ["run", "release:dry-run"]);

  if (dryRun) {
    output({ ok: true, dry_run: true, version, last_tag: state.lastTag, changed_files: state.relevantFiles, message: `Dry-run gates passed for v${version}.` });
    process.exitCode = 0;
  } else {
    run("git", ["add", "package.json", "CHANGELOG.md", ".agents/pm/extensions/.managed-extensions.json"]);
    run("git", ["commit", "-m", `release: ${version}`], { ...process.env, GIT_AUTHOR_NAME: "github-actions[bot]", GIT_AUTHOR_EMAIL: "41898282+github-actions[bot]@users.noreply.github.com", GIT_COMMITTER_NAME: "github-actions[bot]", GIT_COMMITTER_EMAIL: "41898282+github-actions[bot]@users.noreply.github.com" });
    run("git", ["tag", `v${version}`]);
    if (push) {
      const token = releasePushToken;
      if (!token) throw new Error("RELEASE_PUSH_TOKEN is required with --push");
      const auth = Buffer.from(`x-access-token:${token}`).toString("base64");
      run("git", ["-c", `http.https://github.com/.extraheader=Authorization: Basic ${auth}`, "push", "--atomic", "origin", "HEAD:master", `v${version}`]);
    }
    output({ ok: true, version, tag: `v${version}`, pushed: push, message: `Prepared release v${version}.` });
  }
} finally {
  if (dryRun) {
    for (const [file, contents] of originals) writeFileSync(file, contents);
  }
}
