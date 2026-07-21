import { globSync } from 'node:fs';
import { readFileSync } from 'node:fs';

const sourceFiles = globSync('src/**/*.ts').sort();
const missing = sourceFiles.filter((path) => {
  const source = readFileSync(path, 'utf8').trimStart();
  const match = /^\/\*\*\s*\n\s*\*\s+([^\n]+)\n\s*\*\//.exec(source);
  return !match || match[1].trim().length < 24;
});

if (missing.length > 0) {
  process.stderr.write(
    `Source files missing a descriptive leading module docstring:\n${missing.join('\n')}\n`
  );
  process.exitCode = 1;
} else {
  process.stdout.write(`Module docstring coverage: 100% (${sourceFiles.length}/${sourceFiles.length})\n`);
}
