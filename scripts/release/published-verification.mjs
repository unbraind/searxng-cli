import { realpathSync } from "node:fs";
import { sep } from "node:path";

/**
 * Assert that one package-manager shim resolves inside its isolated package root.
 *
 * @param {string} binaryPath Expected executable shim path.
 * @param {string} packageRoot Exact installed package root.
 */
export function assertIsolatedBinary(binaryPath, packageRoot) {
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
export function hasSourceStatusResource(output) {
  return output.split(/\r?\n/u).some((line) => /^\s+source-status\s+/u.test(line));
}
