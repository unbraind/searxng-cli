import { decode as decodeToon } from '@toon-format/toon';
import type { OutputFormat } from '../types';

export interface OutputValidationResult {
  valid: boolean;
  message: string;
}

function stripAnsiCodes(output: string): string {
  return output.replace(/\x1b\[[0-9;]*m/g, '');
}

function parseJsonObject(output: string, label: string): Record<string, unknown> {
  const parsed = JSON.parse(output) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${label} is not a JSON object`);
  }
  return parsed as Record<string, unknown>;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function isIsoDateString(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim()) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && value.includes('T');
}

function validateJson(output: string): OutputValidationResult {
  const parsed = parseJsonObject(output, 'JSON output');
  if (parsed.schemaVersion !== '1.0') {
    return { valid: false, message: 'JSON output has invalid "schemaVersion"' };
  }
  if (parsed.format !== 'json') {
    return { valid: false, message: 'JSON output has invalid "format"' };
  }
  if (typeof parsed.query !== 'string' || !parsed.query.trim()) {
    return { valid: false, message: 'JSON output is missing non-empty string field "query"' };
  }
  if (!isHttpUrl(parsed.source)) {
    return { valid: false, message: 'JSON output is missing valid "source" URL' };
  }
  if (!isIsoDateString(parsed.generatedAt)) {
    return { valid: false, message: 'JSON output is missing valid ISO "generatedAt"' };
  }
  if (!Array.isArray(parsed.results)) {
    return { valid: false, message: 'JSON output is missing array field "results"' };
  }
  if (!isNonNegativeInteger(parsed.resultCount)) {
    return { valid: false, message: 'JSON output is missing non-negative integer "resultCount"' };
  }
  if (!isNonNegativeInteger(parsed.returnedCount)) {
    return { valid: false, message: 'JSON output is missing non-negative integer "returnedCount"' };
  }
  if ((parsed.returnedCount as number) > (parsed.resultCount as number)) {
    return { valid: false, message: 'JSON output has returnedCount > resultCount' };
  }
  if ((parsed.results as unknown[]).length !== (parsed.returnedCount as number)) {
    return { valid: false, message: 'JSON output has returnedCount mismatch with results length' };
  }

  const results = parsed.results as Array<Record<string, unknown>>;
  for (const [index, item] of results.entries()) {
    if (typeof item !== 'object' || item === null) {
      return { valid: false, message: `JSON output result ${index + 1} is not an object` };
    }
    if (!isNonNegativeInteger(item.index) || (item.index as number) < 1) {
      return { valid: false, message: `JSON output result ${index + 1} has invalid "index"` };
    }
    if (typeof item.title !== 'string' || typeof item.url !== 'string') {
      return { valid: false, message: `JSON output result ${index + 1} is missing title/url` };
    }
  }
  return { valid: true, message: 'JSON output validated' };
}

function validateJsonl(output: string): OutputValidationResult {
  const lines = output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return { valid: true, message: 'JSONL output validated (no results)' };
  }

  for (const [index, line] of lines.entries()) {
    let parsed: Record<string, unknown>;
    try {
      parsed = parseJsonObject(line, `JSONL line ${index + 1}`);
    } catch (err) {
      return { valid: false, message: (err as Error).message };
    }

    if (parsed.schemaVersion !== '1.0') {
      return { valid: false, message: `JSONL line ${index + 1} has invalid "schemaVersion"` };
    }
    if (parsed.format !== 'jsonl') {
      return { valid: false, message: `JSONL line ${index + 1} has invalid "format"` };
    }
    if (typeof parsed.query !== 'string' || !parsed.query.trim()) {
      return { valid: false, message: `JSONL line ${index + 1} is missing non-empty "query"` };
    }
    if (!isHttpUrl(parsed.source)) {
      return { valid: false, message: `JSONL line ${index + 1} is missing valid "source"` };
    }
    if (!isIsoDateString(parsed.generatedAt)) {
      return {
        valid: false,
        message: `JSONL line ${index + 1} is missing valid ISO "generatedAt"`,
      };
    }
    if (!isNonNegativeInteger(parsed.index) || (parsed.index as number) < 1) {
      return { valid: false, message: `JSONL line ${index + 1} has invalid "index"` };
    }
    if ((parsed.index as number) !== index + 1) {
      return { valid: false, message: `JSONL line ${index + 1} has non-sequential "index"` };
    }
    if (typeof parsed.title !== 'string' || typeof parsed.url !== 'string') {
      return { valid: false, message: `JSONL line ${index + 1} is missing title/url` };
    }
  }

  return { valid: true, message: 'JSONL output validated' };
}

function validateRawJson(output: string): OutputValidationResult {
  const parsed = parseJsonObject(output, 'Raw JSON output');
  if (typeof parsed.query !== 'string') {
    return { valid: false, message: 'Raw JSON output is missing string field "query"' };
  }
  if (!Array.isArray(parsed.results)) {
    return { valid: false, message: 'Raw JSON output is missing array field "results"' };
  }
  const results = parsed.results as unknown[];
  for (const [index, item] of results.entries()) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return {
        valid: false,
        message: `Raw JSON output result ${index + 1} is not an object`,
      };
    }
  }
  return { valid: true, message: 'Raw JSON output validated' };
}

function splitCsvRow(row: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (ch === '"') {
      const next = row[i + 1];
      if (inQuotes && next === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      cells.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  cells.push(current);
  return cells;
}

function validateCsv(output: string): OutputValidationResult {
  const rows = output
    .split('\n')
    .map((row) => row.trim())
    .filter((row) => row.length > 0);
  if (rows.length === 0) {
    return { valid: false, message: 'CSV output is empty' };
  }
  if (rows[0] !== 'i,title,url,engine,score,text') {
    return { valid: false, message: 'CSV header does not match expected schema' };
  }
  for (const [index, row] of rows.slice(1).entries()) {
    const cols = splitCsvRow(row);
    if (cols.length !== 6) {
      return {
        valid: false,
        message: `CSV row ${index + 2} has ${cols.length} columns, expected 6`,
      };
    }
    const itemIndex = parseInt(cols[0] ?? '', 10);
    if (isNaN(itemIndex) || itemIndex < 1) {
      return { valid: false, message: `CSV row ${index + 2} has invalid result index` };
    }
    if (itemIndex !== index + 1) {
      return { valid: false, message: `CSV row ${index + 2} has non-sequential result index` };
    }
    if (!(cols[2] ?? '').trim()) {
      return { valid: false, message: `CSV row ${index + 2} is missing URL` };
    }
  }
  return { valid: true, message: 'CSV output validated' };
}

function validateYaml(output: string): OutputValidationResult {
  const lines = output
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);

  const requiredTopLevelKeys = [
    'schemaVersion:',
    'query:',
    'format:',
    'source:',
    'generatedAt:',
    'resultCount:',
    'results:',
  ];
  for (const key of requiredTopLevelKeys) {
    if (!lines.some((line) => line.startsWith(key))) {
      return {
        valid: false,
        message: `YAML output is missing required field "${key.slice(0, -1)}"`,
      };
    }
  }

  if (!lines.some((line) => line === "schemaVersion: '1.0'" || line === 'schemaVersion: "1.0"')) {
    return { valid: false, message: 'YAML output has invalid "schemaVersion"' };
  }
  if (!lines.some((line) => line === "format: 'yaml'" || line === 'format: "yaml"')) {
    return { valid: false, message: 'YAML output has invalid "format"' };
  }
  if (!lines.some((line) => line.startsWith('source: '))) {
    return { valid: false, message: 'YAML output is missing "source"' };
  }
  if (!lines.some((line) => line.startsWith('generatedAt: '))) {
    return { valid: false, message: 'YAML output is missing "generatedAt"' };
  }

  const resultEntryIndexes: number[] = [];
  lines.forEach((line, idx) => {
    if (line.startsWith('  - i:')) {
      resultEntryIndexes.push(idx);
    }
  });

  for (const startIndex of resultEntryIndexes) {
    const block = lines.slice(startIndex, startIndex + 6).join('\n');
    if (!/title:\s*/.test(block) || !/url:\s*/.test(block)) {
      return { valid: false, message: 'YAML result entry is missing title/url fields' };
    }
  }

  return { valid: true, message: 'YAML output validated' };
}

function validateXml(output: string): OutputValidationResult {
  if (!output.startsWith('<?xml version="1.0"')) {
    return { valid: false, message: 'XML declaration is missing' };
  }
  if (!output.includes('<search ') || !output.includes('</search>')) {
    return { valid: false, message: 'XML root <search> element is missing or malformed' };
  }
  if (!/source="https?:\/\/[^"]+"/.test(output)) {
    return { valid: false, message: 'XML output is missing valid source URL attribute' };
  }
  if (!/generatedAt="[^"]+"/.test(output)) {
    return { valid: false, message: 'XML output is missing generatedAt attribute' };
  }
  if (!output.includes('<results>') || !output.includes('</results>')) {
    return { valid: false, message: 'XML <results> section is missing' };
  }
  const resultOpenCount = (output.match(/<result\s+/g) ?? []).length;
  const resultCloseCount = (output.match(/<\/result>/g) ?? []).length;
  if (resultOpenCount !== resultCloseCount) {
    return { valid: false, message: 'XML result element count mismatch' };
  }
  return { valid: true, message: 'XML output validated' };
}

function validateToon(output: string): OutputValidationResult {
  const parsed = decodeToon(output) as {
    q?: unknown;
    n?: unknown;
    src?: unknown;
    ts?: unknown;
    results?: unknown;
  };
  if (!parsed || typeof parsed !== 'object') {
    return { valid: false, message: 'TOON output is not an object' };
  }
  if (typeof parsed.q !== 'string' || !parsed.q.trim()) {
    return { valid: false, message: 'TOON output is missing non-empty string field "q"' };
  }
  if (!isHttpUrl(parsed.src)) {
    return { valid: false, message: 'TOON output is missing valid "src" URL' };
  }
  if (!isIsoDateString(parsed.ts)) {
    return { valid: false, message: 'TOON output is missing valid ISO "ts" timestamp' };
  }
  if (!Array.isArray(parsed.results)) {
    return { valid: false, message: 'TOON output is missing array field "results"' };
  }
  if (typeof parsed.n === 'number' && parsed.n !== parsed.results.length) {
    return { valid: false, message: 'TOON output has n mismatch with results length' };
  }

  const items = parsed.results as Array<Record<string, unknown>>;
  for (const [index, item] of items.entries()) {
    if (typeof item !== 'object' || item === null) {
      return { valid: false, message: 'TOON result entry is not an object' };
    }
    if (
      typeof item.i !== 'number' ||
      typeof item.title !== 'string' ||
      typeof item.url !== 'string'
    ) {
      return { valid: false, message: 'TOON result entry is missing required i/title/url fields' };
    }
    if ((item.i as number) !== index + 1) {
      return { valid: false, message: 'TOON result entry has non-sequential index field' };
    }
  }

  return { valid: true, message: 'TOON output validated' };
}

function validateMarkdown(output: string): OutputValidationResult {
  const lines = stripAnsiCodes(output)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (!lines[0]?.startsWith('# ')) {
    return { valid: false, message: 'Markdown output is missing heading line "# ..."' };
  }
  if (!lines.some((line) => /^>\s+\d+\s+results$/i.test(line))) {
    return { valid: false, message: 'Markdown output is missing results summary line' };
  }

  const listLines = lines.filter((line) => /^\d+\.\s+\[.+\]\(.+\)$/.test(line));
  if (listLines.length === 0 && lines.length > 2) {
    return { valid: false, message: 'Markdown output has content but no result list lines' };
  }

  return { valid: true, message: 'Markdown output validated' };
}

function validateTable(output: string): OutputValidationResult {
  const lines = stripAnsiCodes(output)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (!lines.some((line) => line.includes('| # |') && line.includes('Title'))) {
    return { valid: false, message: 'Table output is missing expected header row' };
  }
  if (!lines.some((line) => line.includes('| Engine') && line.includes('| Score'))) {
    return { valid: false, message: 'Table output is missing expected columns' };
  }
  if (!lines.some((line) => line.startsWith('|') && line.endsWith('|'))) {
    return { valid: false, message: 'Table output does not contain table rows' };
  }

  return { valid: true, message: 'Table output validated' };
}

function validateText(output: string): OutputValidationResult {
  const lines = stripAnsiCodes(output)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (!lines[0] || !/^.+\s+\(\d+\s+results\)$/i.test(lines[0])) {
    return { valid: false, message: 'Text output is missing query/results summary line' };
  }

  return { valid: true, message: 'Text output validated' };
}

function validateSimple(output: string): OutputValidationResult {
  const lines = stripAnsiCodes(output)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return { valid: true, message: 'Simple output validated (no results)' };
  }

  const numberedIndexes = lines
    .map((line, index) => (line.match(/^(\d+)\.\s+.+/) ? index : -1))
    .filter((index) => index >= 0);

  if (numberedIndexes.length === 0) {
    return { valid: false, message: 'Simple output is missing numbered result lines' };
  }

  for (let i = 0; i < numberedIndexes.length; i++) {
    const lineIndex = numberedIndexes[i] ?? -1;
    const currentLine = lines[lineIndex] ?? '';
    const match = currentLine.match(/^(\d+)\.\s+.+/);
    const currentNumber = parseInt(match?.[1] ?? '', 10);
    if (!Number.isInteger(currentNumber) || currentNumber !== i + 1) {
      return { valid: false, message: 'Simple output has non-sequential numbering' };
    }

    const nextLine = lines[lineIndex + 1] ?? '';
    if (!/^https?:\/\//i.test(nextLine)) {
      return { valid: false, message: 'Simple output result entry is missing URL line' };
    }
  }

  return { valid: true, message: 'Simple output validated' };
}

function validateHtmlReport(output: string): OutputValidationResult {
  const compact = output.replace(/\s+/g, ' ').toLowerCase();
  if (!compact.includes('<!doctype html>')) {
    return { valid: false, message: 'HTML output is missing doctype' };
  }
  if (!compact.includes('<html') || !compact.includes('</html>')) {
    return { valid: false, message: 'HTML output is missing html root element' };
  }
  if (!compact.includes('<body') || !compact.includes('</body>')) {
    return { valid: false, message: 'HTML output is missing body element' };
  }
  if (!compact.includes('<title>') || !compact.includes('</title>')) {
    return { valid: false, message: 'HTML output is missing title element' };
  }
  return { valid: true, message: 'HTML report output validated' };
}

export function validateFormattedOutput(
  format: OutputFormat | string,
  output: string
): OutputValidationResult {
  try {
    if (format === 'json') return validateJson(output);
    if (format === 'jsonl' || format === 'ndjson') return validateJsonl(output);
    if (format === 'raw') return validateRawJson(output);
    if (format === 'csv') return validateCsv(output);
    if (format === 'yaml' || format === 'yml') return validateYaml(output);
    if (format === 'xml') return validateXml(output);
    if (format === 'toon') return validateToon(output);
    if (format === 'markdown' || format === 'md') return validateMarkdown(output);
    if (format === 'table') return validateTable(output);
    if (format === 'text') return validateText(output);
    if (format === 'simple') return validateSimple(output);
    if (format === 'html' || format === 'html-report') return validateHtmlReport(output);
    return { valid: true, message: `Validation skipped for format "${format}"` };
  } catch (err) {
    return { valid: false, message: `Validation error: ${(err as Error).message}` };
  }
}
