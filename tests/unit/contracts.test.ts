/** Behavioral coverage for machine-readable CLI discovery contracts. */
import { describe, expect, it } from 'vitest';
import { decode } from '@toon-format/toon';
import {
  CLI_COMMANDS,
  getCliCommandContract,
  getCliContractEnvelope,
  renderCliContracts,
} from '@/contracts/index';

describe('CLI contracts', () => {
  it('describes commands, global defaults, current resources, and aliases', () => {
    const envelope = getCliContractEnvelope();
    expect(envelope).toMatchObject({
      schemaVersion: '1.0',
      format: 'cli-contracts',
      executable: 'searxng',
      defaults: {
        output: 'toon',
        searchMethod: 'get',
        cacheLimit: 'unlimited',
      },
    });
    expect(envelope.commands).toBe(CLI_COMMANDS);
    expect(getCliCommandContract('s')?.name).toBe('search');
    expect(getCliCommandContract('missing')).toBeNull();
    expect(getCliCommandContract('instance')?.subcommands).toContain('metrics');
  });

  it('renders lossless JSON and default TOON discovery', () => {
    const json = JSON.parse(renderCliContracts('json')) as Record<string, unknown>;
    const toon = decode(renderCliContracts('toon')) as Record<string, unknown>;
    expect(json.format).toBe('cli-contracts');
    expect(toon.format).toBe('cli-contracts');
    expect(json.commands).toEqual(toon.commands);
  });
});
