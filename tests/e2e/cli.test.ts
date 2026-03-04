import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { decode as decodeToon } from '@toon-format/toon';

const CLI_PATH = path.resolve(__dirname, '../../dist/searxng-cli.js');
const E2E_TIMEOUT = 120000;
const COMMAND_TIMEOUT = 30000;

let cliBinDir = '';
let cliConfigDir = '';
const E2E_SEARXNG_URL = process.env.E2E_SEARXNG_URL ?? '';
const EXPECTED_LOCAL_URL = E2E_SEARXNG_URL || 'http://localhost:8080';

const runCLI = async (args: string[], timeoutMs = COMMAND_TIMEOUT): Promise<string> => {
  return await new Promise((resolve, reject) => {
    const child = spawn('searxng', args, {
      env: {
        ...process.env,
        PATH: cliBinDir ? `${cliBinDir}:${process.env.PATH ?? ''}` : process.env.PATH,
        SEARXNG_CLI_CONFIG_DIR: cliConfigDir,
        SEARXNG_URL: E2E_SEARXNG_URL,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let finished = false;

    const timeout = setTimeout(() => {
      if (finished) return;
      finished = true;
      child.kill('SIGKILL');
      reject(new Error(`Command timed out after ${timeoutMs}ms: searxng ${args.join(' ')}`));
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (err) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      reject(err);
    });
    child.on('close', (code, signal) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      if (signal !== null) {
        reject(new Error(`Command terminated by signal ${signal}: searxng ${args.join(' ')}`));
        return;
      }
      if (code !== 0) {
        reject(new Error(`Command exited with code ${code}: searxng ${args.join(' ')}`));
        return;
      }
      resolve((stdout + stderr).trim());
    });
  });
};

const runCLIStdout = async (args: string[], timeoutMs = COMMAND_TIMEOUT): Promise<string> => {
  return await new Promise((resolve, reject) => {
    const child = spawn('searxng', args, {
      env: {
        ...process.env,
        PATH: cliBinDir ? `${cliBinDir}:${process.env.PATH ?? ''}` : process.env.PATH,
        SEARXNG_CLI_CONFIG_DIR: cliConfigDir,
        SEARXNG_URL: E2E_SEARXNG_URL,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let finished = false;

    const timeout = setTimeout(() => {
      if (finished) return;
      finished = true;
      child.kill('SIGKILL');
      reject(new Error(`Command timed out after ${timeoutMs}ms: searxng ${args.join(' ')}`));
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (err) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      reject(err);
    });
    child.on('close', (code, signal) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      if (signal !== null) {
        reject(new Error(`Command terminated by signal ${signal}: searxng ${args.join(' ')}`));
        return;
      }
      if (code !== 0) {
        reject(new Error(`Command exited with code ${code}: searxng ${args.join(' ')}\n${stderr}`));
        return;
      }
      resolve(stdout.trim());
    });
  });
};

const runCLIWithCode = async (
  args: string[],
  timeoutMs = COMMAND_TIMEOUT
): Promise<{ code: number; stdout: string; stderr: string }> => {
  return await new Promise((resolve, reject) => {
    const child = spawn('searxng', args, {
      env: {
        ...process.env,
        PATH: cliBinDir ? `${cliBinDir}:${process.env.PATH ?? ''}` : process.env.PATH,
        SEARXNG_CLI_CONFIG_DIR: cliConfigDir,
        SEARXNG_URL: E2E_SEARXNG_URL,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let finished = false;

    const timeout = setTimeout(() => {
      if (finished) return;
      finished = true;
      child.kill('SIGKILL');
      reject(new Error(`Command timed out after ${timeoutMs}ms: searxng ${args.join(' ')}`));
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (err) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      reject(err);
    });
    child.on('close', (code, signal) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      if (signal !== null) {
        reject(new Error(`Command terminated by signal ${signal}: searxng ${args.join(' ')}`));
        return;
      }
      resolve({ code: code ?? -1, stdout: stdout.trim(), stderr: stderr.trim() });
    });
  });
};

const parseArgs = (argsStr: string): string[] => {
  return (
    argsStr
      .match(/(?:[^\s"]+|"[^"]*")+/g)
      ?.map((a) => (a.startsWith('"') && a.endsWith('"') ? a.slice(1, -1) : a)) ?? []
  );
};

const extractFirstJsonObject = (output: string): string => {
  const text = output.trim();
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i] ?? '';
    if (start === -1) {
      if (ch === '{') {
        start = i;
        depth = 1;
      }
      continue;
    }

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') {
      depth++;
      continue;
    }
    if (ch === '}') {
      depth--;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }

  return text;
};

const runAndParseJson = async (args: string[], attempts = 2): Promise<Record<string, unknown>> => {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const output = await runCLIStdout(args);
    try {
      return JSON.parse(output) as Record<string, unknown>;
    } catch (error) {
      const payload = extractFirstJsonObject(output);
      try {
        return JSON.parse(payload) as Record<string, unknown>;
      } catch (nestedError) {
        lastError = nestedError as Error;
        if (attempt < attempts) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }
    }
  }
  throw lastError ?? new Error('Failed to parse JSON output');
};

describe('E2E CLI Tests', () => {
  beforeAll(async () => {
    const build = spawnSync('bun', ['run', 'build'], {
      cwd: path.resolve(__dirname, '../..'),
      stdio: 'inherit',
    });
    if (build.status !== 0) {
      throw new Error('Failed to build CLI for E2E tests');
    }

    cliBinDir = fs.mkdtempSync(path.join(os.tmpdir(), 'searxng-cli-bin-'));
    cliConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), 'searxng-cli-config-'));
    const wrapperPath = path.join(cliBinDir, 'searxng');
    fs.writeFileSync(wrapperPath, `#!/usr/bin/env bash\nnode "${CLI_PATH}" "$@"\n`);
    fs.chmodSync(wrapperPath, 0o755);

    await runCLI(['--set-url', EXPECTED_LOCAL_URL]);
    await runCLI(['--set-format', 'toon']);
  }, 120000);

  afterAll(() => {
    if (cliBinDir && fs.existsSync(cliBinDir)) {
      fs.rmSync(cliBinDir, { recursive: true, force: true });
    }
    if (cliConfigDir && fs.existsSync(cliConfigDir)) {
      fs.rmSync(cliConfigDir, { recursive: true, force: true });
    }
  });

  it(
    'should show help',
    async () => {
      const output = await runCLI(parseArgs('--help'));
      expect(output).toContain('Usage: searxng');
    },
    E2E_TIMEOUT
  );

  it(
    'should show version',
    async () => {
      const output = await runCLI(parseArgs('--version'));
      expect(output).toContain('SearXNG CLI v');
    },
    E2E_TIMEOUT
  );

  it(
    'should expose configured local URL and TOON default in settings output',
    async () => {
      const output = await runCLI(parseArgs('--settings'));
      expect(output).toContain(`SearXNG URL: ${EXPECTED_LOCAL_URL}`);
      expect(output).toContain('Default format: toon');
    },
    E2E_TIMEOUT
  );

  it(
    'should expose settings in machine-readable JSON format',
    async () => {
      const data = await runAndParseJson(parseArgs('--settings-json'));
      expect(data.schemaVersion).toBe('1.0');
      expect(data.format).toBe('settings');
      expect(typeof data.settingsFile).toBe('string');
      expect(typeof data.configDir).toBe('string');
      expect((data.settings as Record<string, unknown>).searxngUrl).toBe(EXPECTED_LOCAL_URL);
      expect((data.settings as Record<string, unknown>).defaultFormat).toBe('toon');
      expect((data.settings as Record<string, unknown>).forceLocalRouting).toBe(true);
    },
    E2E_TIMEOUT
  );

  it(
    'should expose global config/cache/history/bookmark paths as JSON',
    async () => {
      const data = await runAndParseJson(parseArgs('--paths-json'));
      expect(data.schemaVersion).toBe('1.0');
      expect(data.format).toBe('paths');
      expect(typeof data.configDir).toBe('string');
      expect(typeof data.settingsFile).toBe('string');
      const files = data.files as Record<string, unknown>;
      expect(typeof files.settings).toBe('string');
      expect(typeof files.cache).toBe('string');
      expect(typeof files.history).toBe('string');
      expect(typeof files.bookmarks).toBe('string');
    },
    E2E_TIMEOUT
  );

  it(
    'should support non-interactive local setup bootstrap',
    async () => {
      await runCLI(['--set-url', 'https://example.com']);
      await runCLI(['--set-format', 'json']);
      await runCLI(['--set-limit', '17']);
      const setupOutput = await runCLI(parseArgs('--setup-local'));
      expect(setupOutput).toContain('Connection check:');
      expect(setupOutput).toContain('Instance discovery cache:');
      expect(setupOutput).toContain('Force local routing: true');

      const output = await runCLI(parseArgs('--settings'));
      expect(output).toContain(`SearXNG URL: ${EXPECTED_LOCAL_URL}`);
      expect(output).toContain('Default format: toon');
      expect(output).toContain('Default limit: 10');
    },
    E2E_TIMEOUT
  );

  it(
    'should update force-local-routing setting',
    async () => {
      await runCLI(['--set-force-local-routing', 'off']);
      const settingsOff = await runAndParseJson(parseArgs('--settings-json'));
      expect((settingsOff.settings as Record<string, unknown>).forceLocalRouting).toBe(false);

      await runCLI(['--set-force-local-routing', 'on']);
      const settingsOn = await runAndParseJson(parseArgs('--settings-json'));
      expect((settingsOn.settings as Record<string, unknown>).forceLocalRouting).toBe(true);
    },
    E2E_TIMEOUT
  );

  it(
    'should apply global default SearXNG passthrough params from settings',
    async () => {
      await runCLI(['--clear-params']);
      await runCLI(['--set-param', 'theme=simple']);
      await runCLI(['--set-param', 'image_proxy=true']);

      const withDefaults = await runAndParseJson(parseArgs('"test search" --json --limit 1'));
      expect(withDefaults.sourceParams).toMatchObject({
        theme: 'simple',
        image_proxy: 'true',
      });

      const overrideTheme = await runAndParseJson(
        parseArgs('"test search" --json --limit 1 --param theme=contrast')
      );
      expect(overrideTheme.sourceParams).toMatchObject({
        theme: 'contrast',
        image_proxy: 'true',
      });

      await runCLI(['--unset-param', 'theme']);
      const afterUnset = await runAndParseJson(parseArgs('"test search" --json --limit 1'));
      expect(afterUnset.sourceParams).not.toHaveProperty('theme');
      expect(afterUnset.sourceParams).toMatchObject({ image_proxy: 'true' });

      await runCLI(['--clear-params']);
      const cleared = await runAndParseJson(parseArgs('"test search" --json --limit 1'));
      expect(cleared.sourceParams).toEqual({});
    },
    E2E_TIMEOUT
  );

  it(
    'should replace global default passthrough params from JSON and query payloads',
    async () => {
      await runCLI(['--set-params-json', '{"theme":"simple","image_proxy":true}']);
      let payload = await runAndParseJson(parseArgs('"bulk params json" --json --limit 1'));
      expect(payload.sourceParams).toMatchObject({
        theme: 'simple',
        image_proxy: 'true',
      });

      await runCLI(['--set-params-query', 'enabled_plugins=Hash_plugin&theme=contrast']);
      payload = await runAndParseJson(parseArgs('"bulk params query" --json --limit 1'));
      expect(payload.sourceParams).toMatchObject({
        enabled_plugins: 'Hash_plugin',
        theme: 'contrast',
      });
      expect(payload.sourceParams).not.toHaveProperty('image_proxy');

      await runCLI(['--clear-params']);
    },
    E2E_TIMEOUT
  );

  it(
    'should perform a basic search and output TOON by default',
    async () => {
      const output = await runCLI(parseArgs('"test search" --limit 1'));
      expect(output).toContain('q: test search');
      expect(output).toContain('n: 1');
      expect(output).toContain('results');
    },
    E2E_TIMEOUT
  );

  it(
    'should output resolved request metadata in JSON',
    async () => {
      const data = await runAndParseJson(parseArgs('"request json test" --request-json --limit 1'));
      expect(data.schemaVersion).toBe('1.0');
      expect(data.format).toBe('request');
      expect(data.source).toBe(EXPECTED_LOCAL_URL);
      const request = data.request as Record<string, unknown>;
      expect(request.method).toBe('GET');
      expect(typeof request.url).toBe('string');
      expect((request.url as string).startsWith(`${EXPECTED_LOCAL_URL}/search?`)).toBe(true);
      const params = request.params as Record<string, unknown>;
      expect(params.q).toBe('request json test');
      expect(params.format).toBe('json');
      expect(params.pageno).toBe('1');
      expect(params.safesearch).toBe('0');
    },
    E2E_TIMEOUT
  );

  it(
    'should respect --limit',
    async () => {
      const output = await runCLI(parseArgs('"test search" --limit 2 --toon'));
      const match = output.match(/n:\s*(\d+)/);
      expect(match).not.toBeNull();
      if (match) {
        expect(parseInt(match[1], 10)).toBeLessThanOrEqual(2);
      }
    },
    E2E_TIMEOUT
  );

  it(
    'should support --json output',
    async () => {
      const data = await runAndParseJson(parseArgs('"test search" --json --limit 1'));
      expect(data.query).toBe('test search');
    },
    E2E_TIMEOUT
  );

  it(
    'should support --raw output',
    async () => {
      const rawFile = path.join(os.tmpdir(), `searxng-raw-${Date.now()}.json`);
      try {
        await runCLI(parseArgs(`"test search" --raw --limit 1 --output "${rawFile}"`));
        const data = JSON.parse(fs.readFileSync(rawFile, 'utf8')) as Record<string, unknown>;
        expect(data.query).toBe('test search');
        expect(Array.isArray(data.results)).toBe(true);
      } finally {
        if (fs.existsSync(rawFile)) {
          fs.unlinkSync(rawFile);
        }
      }
    },
    E2E_TIMEOUT
  );

  it(
    'should support --jsonl output',
    async () => {
      const output = await runCLI(parseArgs('"test search" --jsonl --limit 2'));
      const lines = output.split('\n').filter((line) => line.trim().length > 0);
      expect(lines.length).toBeGreaterThan(0);
      lines.forEach((line) => {
        expect(() => JSON.parse(line)).not.toThrow();
      });
    },
    E2E_TIMEOUT
  );

  it(
    'should support --ndjson output alias',
    async () => {
      const output = await runCLI(parseArgs('"test search" --ndjson --limit 2'));
      const lines = output.split('\n').filter((line) => line.trim().length > 0);
      expect(lines.length).toBeGreaterThan(0);
      lines.forEach((line) => {
        expect(() => JSON.parse(line)).not.toThrow();
      });
    },
    E2E_TIMEOUT
  );

  it(
    'should validate JSONL formatter output',
    async () => {
      const output = await runCLI(parseArgs('"test search" --jsonl --limit 2 --validate-output'));
      const lines = output.split('\n').filter((line) => line.trim().length > 0);
      expect(lines.length).toBeGreaterThan(0);
      lines.forEach((line, index) => {
        const parsed = JSON.parse(line) as Record<string, unknown>;
        expect(parsed.schemaVersion).toBe('1.0');
        expect(parsed.format).toBe('jsonl');
        expect(parsed.index).toBe(index + 1);
      });
    },
    E2E_TIMEOUT
  );

  it(
    'should validate JSON formatter output',
    async () => {
      const output = await runCLI(parseArgs('"test search" --json --limit 1 --validate-output'));
      expect(() => JSON.parse(output)).not.toThrow();
    },
    E2E_TIMEOUT
  );

  it(
    'should support --citation output',
    async () => {
      const output = await runCLI(parseArgs('"test search" --citation --limit 1'));
      expect(output).toContain('[1]');
      expect(output).toContain('URL:');
    },
    E2E_TIMEOUT
  );

  it(
    'should support agent mode',
    async () => {
      const output = await runCLI(parseArgs('"test search" --agent --limit 1'));
      expect(output).toContain('v:');
      expect(output).toContain('q: test search');
      expect(output).toContain('n: 1');
    },
    E2E_TIMEOUT
  );

  it(
    'should support agent-json mode for machine-readable validated output',
    async () => {
      const data = await runAndParseJson(parseArgs('"test search" --agent-json --limit 1'));
      expect(data.schemaVersion).toBe('1.0');
      expect(data.format).toBe('json');
      expect(data.query).toBe('test search');
      expect(Array.isArray(data.results)).toBe(true);
    },
    E2E_TIMEOUT
  );

  it(
    'should support agent mode with --system-prompt wrapping',
    async () => {
      const output = await runCLI(
        parseArgs('"test search" --agent --limit 1 --system-prompt="Respond with citations only"')
      );
      expect(output).toContain('<system_prompt>');
      expect(output).toContain('Respond with citations only');
      expect(output).toContain('</search_results>');
      expect(output).toContain('q: test search');
    },
    E2E_TIMEOUT
  );

  it(
    'should support agent-ci mode for deterministic offline validated output',
    async () => {
      await runCLI(parseArgs('"test search" --limit 1'));
      const output = await runCLI(parseArgs('"test search" --agent-ci --limit 1'));
      expect(output).toContain('q: test search');
      expect(output).toContain('n: 1');
    },
    E2E_TIMEOUT
  );

  it(
    'should force agent mode searches to the local SearXNG URL',
    async () => {
      await runCLI(['--set-url', 'https://example.com']);
      try {
        const output = await runCLI(
          parseArgs('"agent local route test" --agent --verbose --limit 1')
        );
        expect(output).toContain(`URL: ${EXPECTED_LOCAL_URL}/search?`);
      } finally {
        await runCLI(['--set-url', EXPECTED_LOCAL_URL]);
      }
    },
    E2E_TIMEOUT
  );

  it(
    'should force multi-search agent mode searches to the local SearXNG URL',
    async () => {
      await runCLI(['--set-url', 'https://example.com']);
      try {
        const output = await runCLI([
          '--multi',
          'agent local route one;;agent local route two',
          '--agent',
          '--verbose',
          '--limit',
          '1',
          '--no-cache',
        ]);
        expect(output).toContain(`URL: ${EXPECTED_LOCAL_URL}/search?`);
      } finally {
        await runCLI(['--set-url', EXPECTED_LOCAL_URL]);
      }
    },
    E2E_TIMEOUT
  );

  it(
    'should allow disabling forced local routing for agent mode via settings',
    async () => {
      await runCLI(['--set-url', 'https://example.com']);
      await runCLI(['--set-force-local-routing', 'off']);
      await runCLI(['--set-force-local-agent-routing', 'off']);
      try {
        const data = await runAndParseJson(
          parseArgs('"agent routing override" --agent --request-json --limit 1')
        );
        const request = data.request as Record<string, unknown>;
        expect((request.url as string).startsWith('https://example.com/search?')).toBe(true);
      } finally {
        await runCLI(['--set-force-local-routing', 'on']);
        await runCLI(['--set-force-local-agent-routing', 'on']);
        await runCLI(['--set-url', EXPECTED_LOCAL_URL]);
      }
    },
    E2E_TIMEOUT
  );

  it(
    'should use cache on second run',
    async () => {
      await runCLI(parseArgs('"cache test" --limit 1'));
      const output = await runCLI(parseArgs('"cache test" --limit 1 --verbose'));
      expect(output).toContain('Using cached result');
    },
    E2E_TIMEOUT
  );

  it(
    'should expose cache status in machine-readable JSON format',
    async () => {
      const data = await runAndParseJson(parseArgs('--cache-status-json'));
      expect(data.schemaVersion).toBe('1.0');
      expect(data.format).toBe('cache-status');
      expect(typeof data.entries).toBe('number');
      expect(typeof data.maxSize === 'string' || typeof data.maxSize === 'number').toBe(true);
      expect(typeof data.file).toBe('string');
    },
    E2E_TIMEOUT
  );

  it(
    'should support offline-first cache-only retrieval',
    async () => {
      await runCLI(parseArgs('"offline cache test" --limit 1'));
      const output = await runCLI(parseArgs('"offline cache test" --limit 1 --offline-first'));
      expect(output).toContain('q: offline cache test');
      expect(output).toContain('n: 1');
    },
    E2E_TIMEOUT
  );

  it(
    'should show instance info in JSON',
    async () => {
      const data = await runAndParseJson(parseArgs('--instance-info-json'));
      expect(data.schemaVersion).toBe('1.0');
      expect(data.format).toBe('instance-capabilities');
      expect(data.instance).toBeDefined();
      expect(Array.isArray(data.engines)).toBe(true);
    },
    E2E_TIMEOUT
  );

  it(
    'should provide formatter schema metadata',
    async () => {
      const output = await runCLI(parseArgs('--schema-json json'));
      const data = JSON.parse(output);
      expect(data.format).toBe('json');
      expect(data.mimeType).toBe('application/json');
      expect(Array.isArray(data.requiredChecks)).toBe(true);
    },
    E2E_TIMEOUT
  );

  it(
    'should provide JSONL formatter schema metadata',
    async () => {
      const output = await runCLI(parseArgs('--schema-json jsonl'));
      const data = JSON.parse(output);
      expect(data.format).toBe('jsonl');
      expect(data.mimeType).toBe('application/x-ndjson');
      expect(Array.isArray(data.requiredChecks)).toBe(true);
    },
    E2E_TIMEOUT
  );

  it(
    'should provide NDJSON alias formatter schema metadata',
    async () => {
      const output = await runCLI(parseArgs('--schema-json ndjson'));
      const data = JSON.parse(output);
      expect(data.format).toBe('jsonl');
      expect(data.mimeType).toBe('application/x-ndjson');
      expect(Array.isArray(data.requiredChecks)).toBe(true);
    },
    E2E_TIMEOUT
  );

  it(
    'should validate a saved JSON payload via --validate-payload-json',
    async () => {
      const payloadPath = path.join(os.tmpdir(), `searxng-payload-${Date.now()}.json`);
      try {
        const jsonPayload = await runCLIStdout(
          parseArgs('"payload validation test" --json --limit 1')
        );
        fs.writeFileSync(payloadPath, jsonPayload);
        const validation = await runAndParseJson(
          parseArgs(`--validate-payload-json json "${payloadPath}"`)
        );
        expect(validation.schemaVersion).toBe('1.0');
        expect(validation.format).toBe('payload-validation');
        expect(validation.targetFormat).toBe('json');
        expect(validation.valid).toBe(true);
      } finally {
        if (fs.existsSync(payloadPath)) {
          fs.unlinkSync(payloadPath);
        }
      }
    },
    E2E_TIMEOUT
  );

  it(
    'should validate a saved JSON payload via --input flag',
    async () => {
      const payloadPath = path.join(os.tmpdir(), `searxng-payload-input-${Date.now()}.json`);
      try {
        const jsonPayload = await runCLIStdout(
          parseArgs('"payload validation input test" --json --limit 1')
        );
        fs.writeFileSync(payloadPath, jsonPayload);
        const validation = await runAndParseJson([
          '--validate-payload-json',
          'json',
          '--input',
          payloadPath,
        ]);
        expect(validation.schemaVersion).toBe('1.0');
        expect(validation.format).toBe('payload-validation');
        expect(validation.targetFormat).toBe('json');
        expect(validation.valid).toBe(true);
        expect(validation.source).toBe(payloadPath);
      } finally {
        if (fs.existsSync(payloadPath)) {
          fs.unlinkSync(payloadPath);
        }
      }
    },
    E2E_TIMEOUT
  );

  it(
    'should return non-zero for invalid payload validation',
    async () => {
      const payloadPath = path.join(os.tmpdir(), `searxng-invalid-${Date.now()}.txt`);
      try {
        fs.writeFileSync(payloadPath, 'not-valid-json');
        const result = await runCLIWithCode(
          parseArgs(`--validate-payload-json json "${payloadPath}"`)
        );
        expect(result.code).toBe(1);
        const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
        expect(parsed.format).toBe('payload-validation');
        expect(parsed.targetFormat).toBe('json');
        expect(parsed.valid).toBe(false);
      } finally {
        if (fs.existsSync(payloadPath)) {
          fs.unlinkSync(payloadPath);
        }
      }
    },
    E2E_TIMEOUT
  );

  it(
    'should emit valid csv output',
    async () => {
      const output = await runCLI(parseArgs('"format coverage seed" --format csv --limit 1'));
      const lines = output.split('\n').filter((line) => line.trim().length > 0);
      expect(lines[0]).toBe('i,title,url,engine,score,text');
      expect(lines.length).toBeGreaterThanOrEqual(2);
    },
    E2E_TIMEOUT
  );

  it(
    'should emit valid yaml output',
    async () => {
      const output = await runCLI(
        parseArgs('"format coverage seed" --format yaml --limit 1 --validate-output')
      );
      expect(output).toContain('schemaVersion:');
      expect(output).toContain('results:');
    },
    E2E_TIMEOUT
  );

  it(
    'should emit valid markdown output',
    async () => {
      const output = await runCLI(
        parseArgs('"format coverage seed" --format markdown --limit 1 --validate-output')
      );
      expect(output).toContain('# format coverage seed');
    },
    E2E_TIMEOUT
  );

  it(
    'should emit valid xml output',
    async () => {
      const output = await runCLI(
        parseArgs('"format coverage seed" --format xml --limit 1 --validate-output')
      );
      expect(output).toContain('<?xml version="1.0"');
      expect(output).toContain('<search ');
    },
    E2E_TIMEOUT
  );

  it(
    'should emit valid html output',
    async () => {
      const output = await runCLI(
        parseArgs('"format coverage seed" --format html --limit 1 --validate-output')
      );
      expect(output.toLowerCase()).toContain('<!doctype html>');
      expect(output.toLowerCase()).toContain('<html');
    },
    E2E_TIMEOUT
  );

  it(
    'should emit valid table output',
    async () => {
      const output = await runCLI(
        parseArgs('"format coverage seed" --format table --limit 1 --validate-output')
      );
      expect(output).toContain('| # |');
      expect(output).toContain('Title');
    },
    E2E_TIMEOUT
  );

  it(
    'should emit valid text output',
    async () => {
      const output = await runCLI(
        parseArgs('"format coverage seed" --format text --limit 1 --validate-output')
      );
      expect(output).toContain('format coverage seed');
      expect(output).toContain('results');
    },
    E2E_TIMEOUT
  );

  it(
    'should emit valid simple output',
    async () => {
      const output = await runCLI(
        parseArgs('"format coverage seed" --format simple --limit 1 --validate-output')
      );
      expect(output).toContain('1.');
      expect(output).toContain('http');
    },
    E2E_TIMEOUT
  );

  it(
    'should support --simple shortcut flag',
    async () => {
      const output = await runCLI(parseArgs('"format coverage seed" --simple --limit 1'));
      expect(output).toContain('1.');
      expect(output).toContain('http');
      expect(output).not.toContain('(1 results)');
    },
    E2E_TIMEOUT
  );

  it(
    'should support params-json passthrough',
    async () => {
      const output = await runCLI([
        'test search',
        '--json',
        '--limit',
        '1',
        '--params-json',
        '{"language":"en-US"}',
      ]);
      const data = JSON.parse(output);
      expect(data.sourceParams).toMatchObject({ language: 'en-US' });
    },
    E2E_TIMEOUT
  );

  it(
    'should support params-file passthrough',
    async () => {
      const tempFile = path.join(cliBinDir, 'params.json');
      fs.writeFileSync(tempFile, '{"theme":"simple","language":"en-US"}');
      const output = await runCLI([
        'test search',
        '--json',
        '--limit',
        '1',
        '--params-file',
        tempFile,
      ]);
      const data = JSON.parse(output);
      expect(data.sourceParams).toMatchObject({
        theme: 'simple',
        language: 'en-US',
      });
    },
    E2E_TIMEOUT
  );

  it(
    'should support dedicated --sx-* passthrough flags',
    async () => {
      const output = await runCLI([
        'test search',
        '--json',
        '--limit',
        '1',
        '--sx-theme',
        'simple',
        '--sx-enabled-plugins',
        'Hash_plugin,Tracker_URL_remover',
        '--sx-disabled-plugins',
        'Hostnames_plugin',
        '--sx-enabled-engines',
        'google,bing',
        '--sx-disabled-engines',
        'duckduckgo',
        '--sx-enabled-categories',
        'general,news',
        '--sx-disabled-categories',
        'music',
        '--sx-image-proxy',
        'true',
      ]);
      const data = JSON.parse(output);
      expect(data.sourceParams).toMatchObject({
        theme: 'simple',
        enabled_plugins: 'Hash_plugin,Tracker_URL_remover',
        disabled_plugins: 'Hostnames_plugin',
        enabled_engines: 'google,bing',
        disabled_engines: 'duckduckgo',
        enabled_categories: 'general,news',
        disabled_categories: 'music',
        image_proxy: 'true',
      });
    },
    E2E_TIMEOUT
  );

  it(
    'should support --sx and --sx-query passthrough aliases',
    async () => {
      const output = await runCLI([
        'test search',
        '--json',
        '--limit',
        '1',
        '--sx',
        'theme=simple',
        '--sx-query',
        'enabled_plugins=Hash_plugin&image_proxy=true',
      ]);
      const data = JSON.parse(output);
      expect(data.sourceParams).toMatchObject({
        theme: 'simple',
        enabled_plugins: 'Hash_plugin',
        image_proxy: 'true',
      });
    },
    E2E_TIMEOUT
  );

  it(
    'should produce decodeable toon output in default mode',
    async () => {
      const output = await runCLI(parseArgs('"test search" --limit 1 --toon --validate-output'));
      const decoded = decodeToon(output) as { q?: string; results?: unknown[] };
      expect(decoded.q).toBe('test search');
      expect(Array.isArray(decoded.results)).toBe(true);
    },
    E2E_TIMEOUT
  );

  it(
    'should run doctor diagnostics successfully',
    async () => {
      const output = await runCLI(parseArgs('--doctor'));
      expect(output).toContain('SearXNG CLI Doctor');
      expect(output).toContain('Doctor result:');
    },
    E2E_TIMEOUT
  );

  it(
    'should run doctor diagnostics in json mode',
    async () => {
      const data = await runAndParseJson(parseArgs('--doctor-json'));
      expect(data.schemaVersion).toBe('1.0');
      expect(data.format).toBe('doctor');
      expect(typeof data.success).toBe('boolean');
      expect(Array.isArray(data.checks)).toBe(true);
      expect(typeof data.total).toBe('number');
      const firstCheck = (data.checks as Array<Record<string, unknown>>)[0];
      expect(typeof firstCheck?.id).toBe('string');
      expect(typeof firstCheck?.ok).toBe('boolean');
      expect(typeof firstCheck?.pass).toBe('boolean');
    },
    E2E_TIMEOUT
  );

  it(
    'should verify all formatter outputs in machine-readable mode',
    async () => {
      const data = await runAndParseJson(['--verify-formats-json', 'format verifier']);
      expect(data.schemaVersion).toBe('1.0');
      expect(data.format).toBe('format-verification');
      expect(data.success).toBe(true);
      expect(Array.isArray(data.formats)).toBe(true);
      const formats = data.formats as Array<{ format: string; valid: boolean }>;
      expect(formats.length).toBeGreaterThanOrEqual(14);
      expect(formats.every((entry) => entry.valid)).toBe(true);
    },
    E2E_TIMEOUT
  );

  it(
    'should exit with code 2 in strict mode when no results are returned',
    async () => {
      const query = `searxng-cli-noresult-${Date.now()}-zzzzzzzzzzzzzzzzzz`;
      await runCLI(['--cache-clear']);
      const result = await runCLIWithCode(
        ['--strict', '--offline-first', '--json', query],
        E2E_TIMEOUT
      );

      expect(result.code).toBe(2);
      const payload = JSON.parse(result.stdout) as Record<string, unknown>;
      expect(Array.isArray(payload.results)).toBe(true);
      expect((payload.results as unknown[]).length).toBe(0);
      expect(result.stderr).toContain('Strict mode: no results returned');
    },
    E2E_TIMEOUT
  );
});
