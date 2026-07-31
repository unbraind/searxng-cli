import { describe, it, expect } from 'vitest';
import { encode } from '@toon-format/toon';
import { validateFormattedOutput } from '@/formatters/validation';
import { getFormatterSchemas, getSupportedSchemaFormats } from '@/formatters/schema';

describe('Output Validation', () => {
  it('exposes all schemas, aliases, and unknown-format behavior', () => {
    const bundle = getFormatterSchemas();
    expect(bundle).toMatchObject({ schemaVersion: '1.0' });
    expect(getFormatterSchemas('toon')).toMatchObject({ mimeType: 'text/toon' });
    expect(getSupportedSchemaFormats()).toContain('toon');
    expect(getFormatterSchemas('md')).toMatchObject({ format: 'markdown' });
    expect(getFormatterSchemas('does-not-exist')).toBeNull();
  });

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

  it('validates RSS output and rejects every required structural violation', () => {
    const rss = `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>q</title><link>https://example.com</link><description>d</description><lastBuildDate>Thu, 31 Jul 2026 10:00:00 GMT</lastBuildDate><item><title>r</title><link>https://example.com/r</link><guid isPermaLink="true">https://example.com/r</guid></item></channel></rss>`;
    expect(validateFormattedOutput('rss', rss)).toMatchObject({ valid: true });
    for (const output of [
      rss.replace('<?xml version="1.0" encoding="UTF-8"?>\n', ''),
      rss.replace('<rss version="2.0">', '<rss>'),
      rss.replace('<channel>', '<feed>'),
      rss.replace('<description>d</description>', ''),
      rss.replace('<guid isPermaLink="true">https://example.com/r</guid>', ''),
    ]) {
      expect(validateFormattedOutput('rss', output).valid).toBe(false);
    }
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

  it('accepts TOON 4.1 byte-order marks and trailing spaces in strict decoding', () => {
    const toon = encode({
      q: 'test',
      n: 1,
      src: 'http://localhost:8080',
      ts: '2026-03-04T00:00:00.000Z',
      results: [{ i: 1, title: 'Result', url: 'https://example.com' }],
    });
    expect(validateFormattedOutput('toon', `\uFEFF${toon}   `).valid).toBe(true);
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
    const raw = JSON.stringify({ query: 'test', results: [{}] });
    const result = validateFormattedOutput('raw', raw);
    expect(result.valid).toBe(true);
  });

  it('skips validation for an intentionally unstructured format', () => {
    expect(validateFormattedOutput('unknown', 'anything')).toEqual({
      valid: true,
      message: 'Validation skipped for format "unknown"',
    });
  });

  it.each([
    ['non-object', 'null', 'not a JSON object'],
    ['array', '[]', 'not a JSON object'],
    ['invalid syntax', '{', 'Validation error'],
  ])('rejects %s JSON envelopes', (_name, output, message) => {
    expect(validateFormattedOutput('json', output)).toMatchObject({ valid: false });
    expect(validateFormattedOutput('json', output).message).toContain(message);
  });

  const validJson = {
    schemaVersion: '1.0',
    format: 'json',
    query: 'test',
    source: 'https://searx.example',
    generatedAt: '2026-03-04T00:00:00.000Z',
    results: [{ index: 1, title: 'title', url: 'https://example.com' }],
    resultCount: 1,
    returnedCount: 1,
  };

  it.each([
    ['schemaVersion', { schemaVersion: '2.0' }],
    ['format', { format: 'raw' }],
    ['query type', { query: 1 }],
    ['blank query', { query: ' ' }],
    ['source type', { source: 1 }],
    ['blank source', { source: ' ' }],
    ['malformed source', { source: 'not a url' }],
    ['source protocol', { source: 'ftp://example.com' }],
    ['generatedAt type', { generatedAt: 1 }],
    ['blank generatedAt', { generatedAt: ' ' }],
    ['invalid generatedAt', { generatedAt: 'not-a-date' }],
    ['generatedAt without time', { generatedAt: '2026-03-04' }],
    ['results', { results: null }],
    ['resultCount type', { resultCount: '1' }],
    ['resultCount fractional', { resultCount: 1.5 }],
    ['resultCount negative', { resultCount: -1 }],
    ['returnedCount', { returnedCount: -1 }],
    ['returnedCount greater than total', { resultCount: 0 }],
    ['returnedCount mismatch', { results: [] }],
    ['result null', { results: [null] }],
    ['result primitive', { results: ['bad'] }],
    ['result index type', { results: [{ index: '1', title: 't', url: 'u' }] }],
    ['result index zero', { results: [{ index: 0, title: 't', url: 'u' }] }],
    ['result title', { results: [{ index: 1, title: 1, url: 'u' }] }],
    ['result URL', { results: [{ index: 1, title: 't', url: 1 }] }],
  ])('rejects invalid JSON %s', (_name, patch) => {
    expect(validateFormattedOutput('json', JSON.stringify({ ...validJson, ...patch })).valid).toBe(
      false
    );
  });

  const validJsonl = {
    schemaVersion: '1.0',
    format: 'jsonl',
    query: 'test',
    source: 'http://localhost:8080',
    generatedAt: '2026-03-04T00:00:00.000Z',
    index: 1,
    title: 'title',
    url: 'https://example.com',
  };

  it('accepts empty JSONL and rejects malformed JSONL records', () => {
    expect(validateFormattedOutput('jsonl', ' \n ')).toMatchObject({ valid: true });
    expect(validateFormattedOutput('jsonl', 'null')).toMatchObject({ valid: false });
    expect(validateFormattedOutput('jsonl', '{')).toMatchObject({ valid: false });
  });

  it.each([
    ['schema', { schemaVersion: '2' }],
    ['format', { format: 'json' }],
    ['query type', { query: 1 }],
    ['query blank', { query: ' ' }],
    ['source', { source: 'invalid' }],
    ['date', { generatedAt: 'invalid' }],
    ['index type', { index: '1' }],
    ['index zero', { index: 0 }],
    ['title', { title: 1 }],
    ['url', { url: 1 }],
  ])('rejects invalid JSONL %s', (_name, patch) => {
    expect(
      validateFormattedOutput('jsonl', JSON.stringify({ ...validJsonl, ...patch })).valid
    ).toBe(false);
  });

  it.each([
    ['missing query', JSON.stringify({ results: [] })],
    ['missing results', JSON.stringify({ query: 'test' })],
    ['null result', JSON.stringify({ query: 'test', results: [null] })],
    ['array result', JSON.stringify({ query: 'test', results: [[]] })],
    ['primitive result', JSON.stringify({ query: 'test', results: [1] })],
  ])('rejects raw JSON with %s', (_name, output) => {
    expect(validateFormattedOutput('raw', output).valid).toBe(false);
  });

  it.each([
    ['empty', ''],
    ['header', 'wrong'],
    ['column count', 'i,title,url,engine,score,text\n1,too,few'],
    ['index NaN', 'i,title,url,engine,score,text\nx,"t","https://x","e","1","t"'],
    ['index zero', 'i,title,url,engine,score,text\n0,"t","https://x","e","1","t"'],
    ['index sequence', 'i,title,url,engine,score,text\n2,"t","https://x","e","1","t"'],
    ['URL', 'i,title,url,engine,score,text\n1,"t","","e","1","t"'],
  ])('rejects CSV %s violations', (_name, output) => {
    expect(validateFormattedOutput('csv', output).valid).toBe(false);
  });

  it('validates escaped quotes and embedded commas in CSV', () => {
    expect(
      validateFormattedOutput(
        'csv',
        'i,title,url,engine,score,text\n1,"a, ""quoted"" title","https://x","e","1","text"'
      ).valid
    ).toBe(true);
  });

  const validYaml =
    "schemaVersion: '1.0'\nquery: 'test'\nformat: 'yaml'\nsource: 'http://localhost:8080'\ngeneratedAt: '2026-03-04T00:00:00.000Z'\nresultCount: 1\nresults:\n  - i: 1\n    title: 'Result'\n    url: 'https://example.com'";

  it.each([
    ['required field', validYaml.replace("query: 'test'\n", '')],
    ['schema', validYaml.replace("schemaVersion: '1.0'", "schemaVersion: '2.0'")],
    ['format', validYaml.replace("format: 'yaml'", "format: 'json'")],
    ['result title', validYaml.replace("    title: 'Result'\n", '')],
    ['result URL', validYaml.replace("    url: 'https://example.com'", '')],
  ])('rejects YAML %s violations', (_name, output) => {
    expect(validateFormattedOutput('yaml', output).valid).toBe(false);
  });

  it('accepts YAML aliases and double-quoted schema metadata', () => {
    expect(
      validateFormattedOutput(
        'yml',
        validYaml
          .replace("schemaVersion: '1.0'", 'schemaVersion: "1.0"')
          .replace("format: 'yaml'", 'format: "yaml"')
      ).valid
    ).toBe(true);
  });

  const validXml =
    '<?xml version="1.0"?><search source="https://searx.example" generatedAt="now"><results><result index="1"></result></results></search>';
  it.each([
    ['declaration', validXml.replace('<?xml version="1.0"?>', '')],
    ['open root', validXml.replace('<search ', '<broken ')],
    ['close root', validXml.replace('</search>', '')],
    ['source', validXml.replace('source="https://searx.example"', 'source="ftp://bad"')],
    ['generatedAt', validXml.replace('generatedAt="now"', '')],
    ['results open', validXml.replace('<results>', '')],
    ['results close', validXml.replace('</results>', '')],
    ['result count', validXml.replace('</result>', '')],
  ])('rejects XML %s violations', (_name, output) => {
    expect(validateFormattedOutput('xml', output).valid).toBe(false);
  });

  it('accepts XML with no result elements', () => {
    expect(
      validateFormattedOutput(
        'xml',
        '<?xml version="1.0"?><search source="https://searx.example" generatedAt="now"><results></results></search>'
      ).valid
    ).toBe(true);
  });

  const validToon = {
    q: 'query',
    n: 1,
    src: 'https://searx.example',
    ts: '2026-03-04T00:00:00.000Z',
    results: [{ i: 1, title: 'title', url: 'https://example.com' }],
  };
  it.each([
    ['query type', { q: 1 }],
    ['query blank', { q: ' ' }],
    ['source', { src: 'invalid' }],
    ['timestamp', { ts: 'invalid' }],
    ['results', { results: 'invalid' }],
    ['result primitive', { results: ['invalid'] }],
    ['result null', { results: [null] }],
    ['result index', { results: [{ i: '1', title: 't', url: 'u' }] }],
    ['result title', { results: [{ i: 1, title: 1, url: 'u' }] }],
    ['result URL', { results: [{ i: 1, title: 't', url: 1 }] }],
    ['result sequence', { results: [{ i: 2, title: 't', url: 'u' }] }],
  ])('rejects TOON %s violations', (_name, patch) => {
    expect(validateFormattedOutput('toon', encode({ ...validToon, ...patch })).valid).toBe(false);
  });

  it('rejects scalar TOON output', () => {
    expect(validateFormattedOutput('toon', encode('scalar')).valid).toBe(false);
  });

  it.each([
    ['heading', 'missing\n> 0 results'],
    ['summary', '# heading'],
    ['list', '# heading\n> 1 results\nextra content'],
  ])('rejects Markdown %s violations', (_name, output) => {
    expect(validateFormattedOutput('md', output).valid).toBe(false);
  });

  it.each([
    ['header', '| Engine | Score |'],
    ['columns', '| # | Title |'],
    ['rows', 'prefix | # | Title | Engine | Score suffix'],
  ])('rejects table %s violations', (_name, output) => {
    expect(validateFormattedOutput('table', output).valid).toBe(false);
  });

  it('rejects invalid text and accepts empty simple output', () => {
    expect(validateFormattedOutput('text', '').valid).toBe(false);
    expect(validateFormattedOutput('text', 'invalid').valid).toBe(false);
    expect(validateFormattedOutput('simple', '').valid).toBe(true);
    expect(validateFormattedOutput('simple', 'unnumbered\nhttps://example.com').valid).toBe(false);
  });

  it.each([
    ['doctype', '<html><head><title>x</title></head><body></body></html>'],
    ['html root', '<!doctype html><head><title>x</title></head><body></body>'],
    ['body', '<!doctype html><html><head><title>x</title></head></html>'],
    ['title', '<!doctype html><html><head></head><body></body></html>'],
  ])('rejects HTML %s violations', (_name, output) => {
    expect(validateFormattedOutput('html', output).valid).toBe(false);
  });
});
