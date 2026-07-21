import { execFileSync } from "node:child_process";

export function calendarVersion(date = new Date()) {
  return `${date.getUTCFullYear()}.${date.getUTCMonth() + 1}.${date.getUTCDate()}`;
}

export function isReleaseRelevantPath(file) {
  return !file.startsWith(".agents/pm/");
}

export function nextCalendarVersion(tags, date = new Date()) {
  const base = calendarVersion(date);
  let highest = 0;
  for (const tag of tags) {
    const match = tag.match(new RegExp(`^v?${base.replaceAll(".", "\\.")}(?:-(\\d+))?$`));
    if (match) highest = Math.max(highest, match[1] ? Number(match[1]) : 1);
  }
  return highest === 0 ? base : `${base}-${highest + 1}`;
}

export function git(args, options = {}) {
  try {
    return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...options }).trim();
  } catch (error) {
    if (options.allowFailure) return "";
    throw error;
  }
}

export function releaseState() {
  const lastTag = git(["describe", "--tags", "--abbrev=0"], { allowFailure: true }) || null;
  const range = lastTag ? `${lastTag}..HEAD` : "HEAD";
  const commitCount = Number(git(["rev-list", "--count", range]) || "0");
  const changedFiles = (lastTag ? git(["diff", "--name-only", range]) : git(["ls-files"]))
    .split(/\r?\n/).filter(Boolean);
  const tags = git(["tag", "--list"]).split(/\r?\n/).filter(Boolean);
  return {
    lastTag,
    commitCount,
    changedFiles,
    relevantFiles: changedFiles.filter(isReleaseRelevantPath),
    tags,
  };
}
