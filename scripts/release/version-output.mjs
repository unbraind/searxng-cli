/**
 * Determine whether command output contains the expected CLI version as a
 * complete line. Consumers may print surrounding diagnostics, but a version
 * prefix or suffix must never satisfy release verification.
 *
 * @param {string} output Captured command output.
 * @param {string} expectedVersionOutput Exact version line to locate.
 * @returns {boolean} Whether the expected version appears as a complete line.
 */
export function hasExactVersionLine(output, expectedVersionOutput) {
  return output.split(/\r?\n/u).some((line) => line.trim() === expectedVersionOutput);
}
