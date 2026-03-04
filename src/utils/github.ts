import { execSync } from 'child_process';

const REPO = 'unbraind/searxng-cli';

/**
 * Checks if GitHub CLI is installed and authenticated.
 */
export function isGhAuthenticated(): boolean {
  try {
    execSync('gh auth status', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Checks if the user has already starred the repository.
 */
export function hasStarredRepo(): boolean {
  try {
    const output = execSync(`gh repo view ${REPO} --json viewerHasStarred`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const { viewerHasStarred } = JSON.parse(output);
    return !!viewerHasStarred;
  } catch {
    return false;
  }
}

/**
 * Stars the repository using GitHub CLI.
 */
export function starRepo(): boolean {
  try {
    execSync(`gh repo star ${REPO}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
