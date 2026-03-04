export interface FormatterSchemaRecord {
  format: string;
  aliases: string[];
  mimeType: string;
  fileExtension: string;
  schema: Record<string, unknown>;
  requiredChecks: string[];
}

export interface FormatterSchemaBundle {
  schemaVersion: string;
  generatedAt: string;
  formats: FormatterSchemaRecord[];
}

const RESULT_OBJECT_SCHEMA = {
  type: 'object',
  additionalProperties: true,
  required: ['index', 'title', 'url'],
  properties: {
    index: { type: 'integer', minimum: 1 },
    title: { type: 'string' },
    url: { type: 'string' },
    content: { type: 'string' },
    engine: { type: ['string', 'null'] },
    score: { type: ['number', 'null'] },
    publishedDate: { type: ['string', 'null'] },
    thumbnail: { type: ['string', 'null'] },
  },
};

const FORMAT_SCHEMAS: FormatterSchemaRecord[] = [
  {
    format: 'toon',
    aliases: [],
    mimeType: 'text/plain',
    fileExtension: '.toon',
    schema: {
      type: 'object',
      additionalProperties: true,
      required: ['q', 'n', 'results'],
      properties: {
        q: { type: 'string', minLength: 1 },
        n: { type: 'integer', minimum: 0 },
        src: { type: 'string' },
        ts: { type: 'string' },
        results: {
          type: 'array',
          items: {
            type: 'object',
            required: ['i', 'title', 'url'],
            properties: {
              i: { type: 'integer', minimum: 1 },
              title: { type: 'string' },
              url: { type: 'string' },
              engine: { type: 'string' },
              score: { type: ['number', 'string'] },
              snippet: { type: 'string' },
            },
          },
        },
      },
    },
    requiredChecks: [
      'TOON decode succeeds',
      'q is non-empty string',
      'src is valid URL',
      'ts is ISO timestamp',
      'results is array',
    ],
  },
  {
    format: 'json',
    aliases: [],
    mimeType: 'application/json',
    fileExtension: '.json',
    schema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      additionalProperties: true,
      required: [
        'schemaVersion',
        'query',
        'format',
        'source',
        'generatedAt',
        'resultCount',
        'returnedCount',
        'results',
      ],
      properties: {
        schemaVersion: { const: '1.0' },
        query: { type: 'string', minLength: 1 },
        format: { const: 'json' },
        source: { type: 'string' },
        generatedAt: { type: 'string' },
        resultCount: { type: 'integer', minimum: 0 },
        returnedCount: { type: 'integer', minimum: 0 },
        filtered: { type: 'boolean' },
        cached: { type: 'boolean' },
        cacheAgeMs: { type: ['number', 'null'] },
        timing: { type: ['string', 'null'] },
        numberOfResults: { type: ['number', 'null'] },
        results: {
          type: 'array',
          items: RESULT_OBJECT_SCHEMA,
        },
      },
    },
    requiredChecks: [
      'schemaVersion is "1.0"',
      'format is "json"',
      'source is URL',
      'generatedAt is ISO timestamp',
      'returnedCount equals results.length',
    ],
  },
  {
    format: 'jsonl',
    aliases: ['ndjson'],
    mimeType: 'application/x-ndjson',
    fileExtension: '.jsonl',
    schema: {
      type: 'object',
      additionalProperties: true,
      required: [
        'schemaVersion',
        'format',
        'query',
        'source',
        'generatedAt',
        'index',
        'title',
        'url',
      ],
      properties: {
        schemaVersion: { const: '1.0' },
        format: { const: 'jsonl' },
        query: { type: 'string', minLength: 1 },
        source: { type: 'string' },
        generatedAt: { type: 'string' },
        index: { type: 'integer', minimum: 1 },
        title: { type: 'string' },
        url: { type: 'string' },
        content: { type: 'string' },
        engine: { type: ['string', 'null'] },
        score: { type: ['number', 'null'] },
        publishedDate: { type: ['string', 'null'] },
        thumbnail: { type: ['string', 'null'] },
        cached: { type: 'boolean' },
        cacheAgeMs: { type: ['number', 'null'] },
      },
    },
    requiredChecks: [
      'Each line parses as JSON object',
      'schemaVersion is "1.0"',
      'format is "jsonl"',
      'source is URL',
      'generatedAt is ISO timestamp',
      'index is sequential',
    ],
  },
  {
    format: 'raw',
    aliases: [],
    mimeType: 'application/json',
    fileExtension: '.json',
    schema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      additionalProperties: true,
      required: ['query', 'results'],
      properties: {
        query: { type: 'string' },
        results: { type: 'array', items: { type: 'object' } },
      },
    },
    requiredChecks: ['query is present', 'results is array'],
  },
  {
    format: 'csv',
    aliases: [],
    mimeType: 'text/csv',
    fileExtension: '.csv',
    schema: {
      type: 'string',
      pattern: '^i,title,url,engine,score,text(?:\\r?\\n.*)*$',
    },
    requiredChecks: ['Header is i,title,url,engine,score,text', 'Rows have 6 columns'],
  },
  {
    format: 'yaml',
    aliases: ['yml'],
    mimeType: 'application/yaml',
    fileExtension: '.yaml',
    schema: {
      type: 'string',
      requiredTopLevelKeys: [
        'schemaVersion',
        'query',
        'format',
        'source',
        'generatedAt',
        'resultCount',
        'results',
      ],
    },
    requiredChecks: [
      'schemaVersion exists',
      'source exists',
      'generatedAt exists',
      'results list exists',
    ],
  },
  {
    format: 'xml',
    aliases: [],
    mimeType: 'application/xml',
    fileExtension: '.xml',
    schema: {
      type: 'string',
      requiredElements: [
        '<?xml version="1.0"',
        '<search',
        'source=',
        'generatedAt=',
        '<results>',
        '</results>',
        '</search>',
      ],
    },
    requiredChecks: [
      'XML declaration exists',
      'search/results root sections exist',
      'source and generatedAt attributes exist',
    ],
  },
  {
    format: 'markdown',
    aliases: ['md'],
    mimeType: 'text/markdown',
    fileExtension: '.md',
    schema: {
      type: 'string',
      requiredPatterns: ['^# ', '^> \\d+ results$', '^\\d+\\. \\[.+\\]\\(.+\\)$'],
    },
    requiredChecks: ['Heading is present', 'Result list lines are valid markdown links'],
  },
  {
    format: 'table',
    aliases: [],
    mimeType: 'text/plain',
    fileExtension: '.txt',
    schema: {
      type: 'string',
      requiredFragments: ['| # |', '| Engine', '| Score'],
    },
    requiredChecks: ['Table headers include title/engine/score'],
  },
  {
    format: 'text',
    aliases: [],
    mimeType: 'text/plain',
    fileExtension: '.txt',
    schema: {
      type: 'string',
      requiredPattern: '^.+\\(\\d+ results\\)$',
    },
    requiredChecks: ['Summary line contains query and result count'],
  },
  {
    format: 'simple',
    aliases: [],
    mimeType: 'text/plain',
    fileExtension: '.txt',
    schema: {
      type: 'string',
      requiredPatterns: ['^\\d+\\.\\s+.+$', '^\\s*https?://'],
    },
    requiredChecks: ['Numbered result lines exist', 'Each entry includes a URL line'],
  },
  {
    format: 'html-report',
    aliases: ['html'],
    mimeType: 'text/html',
    fileExtension: '.html',
    schema: {
      type: 'string',
      requiredElements: ['<!DOCTYPE html>', '<html', '<body', '<title>'],
    },
    requiredChecks: ['Valid HTML document shell is present'],
  },
];

const ALIAS_TO_FORMAT = FORMAT_SCHEMAS.reduce(
  (acc, schema) => {
    acc[schema.format] = schema.format;
    schema.aliases.forEach((alias) => {
      acc[alias] = schema.format;
    });
    return acc;
  },
  {} as Record<string, string>
);

function findFormatSchema(format: string): FormatterSchemaRecord | null {
  const normalized = format.trim().toLowerCase();
  const canonical = ALIAS_TO_FORMAT[normalized];
  if (!canonical) return null;
  return FORMAT_SCHEMAS.find((schema) => schema.format === canonical) ?? null;
}

export function getSupportedSchemaFormats(): string[] {
  return FORMAT_SCHEMAS.map((schema) => schema.format);
}

export function getFormatterSchemas(
  format = 'all'
): FormatterSchemaBundle | FormatterSchemaRecord | null {
  if (format.trim().toLowerCase() === 'all') {
    return {
      schemaVersion: '1.0',
      generatedAt: new Date().toISOString(),
      formats: FORMAT_SCHEMAS,
    };
  }
  return findFormatSchema(format);
}
