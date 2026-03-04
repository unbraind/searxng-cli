import { describe, it, expect } from 'vitest';
import { encode } from '@toon-format/toon';
import { validateFormattedOutput } from '@/formatters/validation';

describe('Output Validation', () => {
  it('validates JSON output', () => {
    const result = validateFormattedOutput(
      'json',
      JSON.stringify({
        schemaVersion: '1.0',
        query: 'test',
        source: 'http://localhost:8080',
        generatedAt: '2026-03-04T00:00:00.000Z',
        results: [{ index: 1, title: 't', url: 'https://example.com' }],
        format: 'json',
        resultCount: 1,
        returnedCount: 1,
      })
    );
    expect(result.valid).toBe(true);
  });

  it('validates JSONL output', () => {
    const jsonl = [
      JSON.stringify({
        schemaVersion: '1.0',
        format: 'jsonl',
        query: 'test',
        source: 'http://localhost:8080',
        generatedAt: '2026-03-04T00:00:00.000Z',
        index: 1,
        title: 't1',
        url: 'https://example.com/1',
      }),
      JSON.stringify({
        schemaVersion: '1.0',
        format: 'jsonl',
        query: 'test',
        source: 'http://localhost:8080',
        generatedAt: '2026-03-04T00:00:00.000Z',
        index: 2,
        title: 't2',
        url: 'https://example.com/2',
      }),
    ].join('\n');
    const result = validateFormattedOutput('jsonl', jsonl);
    expect(result.valid).toBe(true);
  });

  it('validates NDJSON alias output', () => {
    const jsonl = JSON.stringify({
      schemaVersion: '1.0',
      format: 'jsonl',
      query: 'test',
      source: 'http://localhost:8080',
      generatedAt: '2026-03-04T00:00:00.000Z',
      index: 1,
      title: 't1',
      url: 'https://example.com/1',
    });
    const result = validateFormattedOutput('ndjson', jsonl);
    expect(result.valid).toBe(true);
  });

  it('rejects JSONL output with non-sequential index', () => {
    const jsonl = [
      JSON.stringify({
        schemaVersion: '1.0',
        format: 'jsonl',
        query: 'test',
        source: 'http://localhost:8080',
        generatedAt: '2026-03-04T00:00:00.000Z',
        index: 2,
        title: 't1',
        url: 'https://example.com/1',
      }),
    ].join('\n');
    const result = validateFormattedOutput('jsonl', jsonl);
    expect(result.valid).toBe(false);
  });

  it('rejects invalid JSON schema', () => {
    const result = validateFormattedOutput('json', JSON.stringify({ foo: 'bar' }));
    expect(result.valid).toBe(false);
  });

  it('rejects JSON returnedCount mismatch', () => {
    const result = validateFormattedOutput(
      'json',
      JSON.stringify({
        schemaVersion: '1.0',
        query: 'test',
        source: 'http://localhost:8080',
        generatedAt: '2026-03-04T00:00:00.000Z',
        results: [{ index: 1, title: 't', url: 'https://example.com' }],
        format: 'json',
        resultCount: 1,
        returnedCount: 0,
      })
    );
    expect(result.valid).toBe(false);
  });

  it('validates CSV output', () => {
    const csv = 'i,title,url,engine,score,text\n1,"a","https://x","g","1","text"';
    const result = validateFormattedOutput('csv', csv);
    expect(result.valid).toBe(true);
  });

  it('validates YAML output', () => {
    const yaml =
      "schemaVersion: '1.0'\nquery: 'test'\nformat: 'yaml'\nsource: 'http://localhost:8080'\ngeneratedAt: '2026-03-04T00:00:00.000Z'\nresultCount: 1\nresults:\n  - i: 1\n    title: 'Result'\n    url: 'https://example.com'";
    const result = validateFormattedOutput('yaml', yaml);
    expect(result.valid).toBe(true);
  });

  it('validates XML output', () => {
    const xml =
      '<?xml version="1.0" encoding="UTF-8"?><search schema="1.0" source="http://localhost:8080" generatedAt="2026-03-04T00:00:00.000Z"><results><result index="1"><title>R</title><url>https://example.com</url></result></results></search>';
    const result = validateFormattedOutput('xml', xml);
    expect(result.valid).toBe(true);
  });

  it('validates TOON output', () => {
    const toon = encode({
      q: 'test',
      n: 1,
      src: 'http://localhost:8080',
      ts: '2026-03-04T00:00:00.000Z',
      results: [{ i: 1, title: 'Result', url: 'https://example.com' }],
    });
    const result = validateFormattedOutput('toon', toon);
    expect(result.valid).toBe(true);
  });

  it('rejects TOON n mismatch', () => {
    const toon = encode({
      q: 'test',
      n: 2,
      src: 'http://localhost:8080',
      ts: '2026-03-04T00:00:00.000Z',
      results: [{ i: 1, title: 'Result', url: 'https://example.com' }],
    });
    const result = validateFormattedOutput('toon', toon);
    expect(result.valid).toBe(false);
  });

  it('validates markdown output', () => {
    const markdown = '# test\n> 1 results\n\n1. [Result](https://example.com)';
    const result = validateFormattedOutput('markdown', markdown);
    expect(result.valid).toBe(true);
  });

  it('validates table output', () => {
    const table = '+++\n| # | Title | Engine | Score |\n===\n| 1 | R | g | 1.0 |\n+++';
    const result = validateFormattedOutput('table', table);
    expect(result.valid).toBe(true);
  });

  it('validates table output with ANSI escape codes', () => {
    const table =
      '\u001b[36m+++\u001b[0m\n\u001b[36m| # | Title | Engine | Score |\u001b[0m\n| 1 | R | g | 1.0 |\n\u001b[36m+++\u001b[0m';
    const result = validateFormattedOutput('table', table);
    expect(result.valid).toBe(true);
  });

  it('validates text output', () => {
    const text = 'test (1 results)\n\n1. Result\n   https://example.com';
    const result = validateFormattedOutput('text', text);
    expect(result.valid).toBe(true);
  });

  it('validates simple output', () => {
    const simple = '1. Result\n   https://example.com';
    const result = validateFormattedOutput('simple', simple);
    expect(result.valid).toBe(true);
  });

  it('rejects simple output when URL line is missing', () => {
    const simple = '1. Result';
    const result = validateFormattedOutput('simple', simple);
    expect(result.valid).toBe(false);
  });

  it('rejects simple output when numbering is not sequential', () => {
    const simple = '2. Result\n   https://example.com';
    const result = validateFormattedOutput('simple', simple);
    expect(result.valid).toBe(false);
  });

  it('validates html-report output', () => {
    const html = '<!DOCTYPE html><html><head><title>t</title></head><body><h1>t</h1></body></html>';
    const result = validateFormattedOutput('html-report', html);
    expect(result.valid).toBe(true);
  });

  it('validates html alias output', () => {
    const html = '<!DOCTYPE html><html><head><title>t</title></head><body><h1>t</h1></body></html>';
    const result = validateFormattedOutput('html', html);
    expect(result.valid).toBe(true);
  });

  it('validates raw output as API JSON', () => {
    const raw = JSON.stringify({ query: 'test', results: [] });
    const result = validateFormattedOutput('raw', raw);
    expect(result.valid).toBe(true);
  });
});
