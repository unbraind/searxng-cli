/**
 * Machine-readable CLI command contracts for agents, completion tools, and integration discovery.
 */
import { encode as encodeToon } from '@toon-format/toon';
import { CONFIG_DIR, DEFAULT_SEARXNG_URL, VERSION } from '../config';
import { safeJsonStringify } from '../utils';

/** One documented CLI command and its stable invocation surface. */
export interface CliCommandContract {
  name: string;
  aliases: string[];
  summary: string;
  usage: string;
  subcommands: string[];
  flags: string[];
}

/** Complete versioned discovery envelope emitted by `searxng commands`. */
export interface CliContractEnvelope {
  schemaVersion: '1.0';
  format: 'cli-contracts';
  generatedAt: string;
  executable: 'searxng';
  version: string;
  defaults: {
    output: 'toon';
    searchMethod: 'get';
    searxngUrl: string;
    stateRoot: string;
    cacheLimit: 'unlimited';
  };
  globalFlags: string[];
  commands: CliCommandContract[];
}

const GLOBAL_FLAGS = [
  '--help, -h',
  '--version, -v',
  '--verbose, -V',
  '--silent, -s',
  '--no-cache, -C',
  '--format, -f <format>',
  '--output, -o <file>',
  '--settings-json',
  '--paths-json',
];

/** Stable command catalog shared by human help and machine discovery. */
export const CLI_COMMANDS: CliCommandContract[] = [
  {
    name: 'search',
    aliases: ['s'],
    summary: 'Search the configured SearXNG instance with TOON output by default.',
    usage: 'searxng search [flags] <query>',
    subcommands: [],
    flags: [
      '--method <get|post>',
      '--get',
      '--post',
      '--format <format>',
      '--param <key=value>',
      '--params-json <object>',
      '--params-file <file>',
      '--engines <list>',
      '--category <name>',
      '--lang <code>',
      '--page <number>',
      '--safe <0|1|2>',
      '--time <day|week|month|year>',
      '--limit <number>',
      '--request-json',
      '--validate-output',
    ],
  },
  {
    name: 'autocomplete',
    aliases: [],
    summary: 'Return suggestions from the configured SearXNG autocompleter.',
    usage: 'searxng autocomplete <query> [--limit <number>] [--json]',
    subcommands: [],
    flags: ['--limit <number>', '--json', '--toon'],
  },
  {
    name: 'setup',
    aliases: [],
    summary: 'Run the interactive setup wizard or apply governed local defaults.',
    usage: 'searxng setup [--local]',
    subcommands: ['local'],
    flags: ['--local'],
  },
  {
    name: 'settings',
    aliases: [],
    summary: 'Inspect effective global settings stored under ~/.searxng-cli.',
    usage: 'searxng settings [json]',
    subcommands: ['json'],
    flags: ['--json'],
  },
  {
    name: 'set',
    aliases: [],
    summary: 'Update one durable global setting.',
    usage: 'searxng set <key> <value>',
    subcommands: [
      'url',
      'local-url',
      'limit',
      'format',
      'theme',
      'engines',
      'timeout',
      'history',
      'max-history',
      'force-local-routing',
      'force-local-agent-routing',
      'param',
      'params-json',
      'params-query',
      'unset-param',
      'clear-params',
    ],
    flags: [],
  },
  {
    name: 'cache',
    aliases: [],
    summary: 'Inspect and manage the unlimited persistent search cache.',
    usage: 'searxng cache <subcommand> [args]',
    subcommands: [
      'status',
      'json',
      'list',
      'search',
      'inspect',
      'delete',
      'clear',
      'export',
      'import',
      'prune',
    ],
    flags: [],
  },
  {
    name: 'formats',
    aliases: [],
    summary: 'Discover schemas and validate every supported output contract.',
    usage: 'searxng formats <verify|schema|validate> [args]',
    subcommands: ['verify', 'schema', 'validate'],
    flags: ['--json'],
  },
  {
    name: 'instance',
    aliases: [],
    summary: 'Read SearXNG application resources with provenance-bearing envelopes.',
    usage: 'searxng instance <resource> [--format <toon|json|raw>]',
    subcommands: [
      'info',
      'json',
      'capabilities',
      'engines',
      'categories',
      'languages',
      'plugins',
      'health',
      'stats',
      'errors',
      'config',
      'descriptions',
      'metrics',
      'stats-page',
      'opensearch',
      'manifest',
      'robots',
      'source-status',
    ],
    flags: ['--format <toon|json|raw>', '--json', '--toon', '--raw', '--output <file>'],
  },
  {
    name: 'commands',
    aliases: [],
    summary: 'Emit this versioned command catalog in TOON or JSON.',
    usage: 'searxng commands [json|--json]',
    subcommands: ['json'],
    flags: ['--json', '--toon'],
  },
  ...[
    ['doctor', 'Run release-readiness diagnostics.', 'searxng doctor [json]'],
    ['health', 'Read the configured instance health resource.', 'searxng health [flags]'],
    ['history', 'Show local search history.', 'searxng history'],
    ['bookmarks', 'Show local result bookmarks.', 'searxng bookmarks'],
    ['suggestions', 'Show local recent and popular query suggestions.', 'searxng suggestions'],
    ['presets', 'List stored search presets.', 'searxng presets'],
    [
      'config',
      'Inspect, edit, or reset application configuration.',
      'searxng config <show|edit|reset>',
    ],
    ['paths', 'Emit managed ~/.searxng-cli paths as JSON.', 'searxng paths'],
    ['version', 'Print the CLI version.', 'searxng version'],
    ['test', 'Run built-in diagnostic self-tests.', 'searxng test'],
  ].map(([name, summary, usage]) => ({
    name,
    aliases: [],
    summary,
    usage,
    subcommands: name === 'config' ? ['show', 'edit', 'reset'] : name === 'doctor' ? ['json'] : [],
    flags: [],
  })),
];

/** Build a fresh command-discovery envelope without reading private settings. */
export function getCliContractEnvelope(): CliContractEnvelope {
  return {
    schemaVersion: '1.0',
    format: 'cli-contracts',
    generatedAt: new Date().toISOString(),
    executable: 'searxng',
    version: VERSION,
    defaults: {
      output: 'toon',
      searchMethod: 'get',
      searxngUrl: DEFAULT_SEARXNG_URL,
      stateRoot: CONFIG_DIR,
      cacheLimit: 'unlimited',
    },
    globalFlags: GLOBAL_FLAGS,
    commands: CLI_COMMANDS,
  };
}

/**
 * Render command discovery in the requested lossless machine format.
 * @param format Serialization selected by an agent or integration consumer.
 */
export function renderCliContracts(format: 'json' | 'toon'): string {
  const envelope = getCliContractEnvelope();
  return format === 'json' ? safeJsonStringify(envelope, 2) : encodeToon(envelope);
}

/**
 * Find one command contract for detailed help generation.
 * @param name Canonical command name or documented alias to resolve.
 */
export function getCliCommandContract(name: string): CliCommandContract | null {
  const normalized = name.trim().toLowerCase();
  return (
    CLI_COMMANDS.find(
      (command) => command.name === normalized || command.aliases.includes(normalized)
    ) ?? null
  );
}
