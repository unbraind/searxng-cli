# Output Formats

SearXNG CLI supports multiple output formats for different use cases.

## TOON (Default)

TOON (Token-Oriented Object Notation) is the default format, optimized for LLM consumption.

```bash
searxng-cli "query"
searxng-cli --format toon "query"
```

### TOON Structure

The format is minimal, uses indentation for arrays, and is token-efficient:

```
v: 2026.3.1
q: search query
n: 10
src: http://localhost:8080
ts: 2026-03-04T00:00:00.000Z
total: 1000000
results[10]{i,title,url,engine,score,snippet}:
  1,Example Title,https://example.com,google,0.9,This is a snippet from the page...
  2,Another Result,https://another.com,bing,0.8,Another page snippet...
answers[1]: The answer to your question
infobox:
  title: JavaScript
  content: JavaScript is a programming language...
suggestions[2]: related search 1,related search 2
domains:
  example.com: 5
  another.com: 3
  third.com: 2
```

### TOON Field Reference

| Field | Description | Example |
|-------|-------------|---------|
| `v:` | Schema version | `v: 2026.3.1` |
| `q:` | Search query | `q: nodejs tutorial` |
| `n:` | Result count returned | `n: 10` |
| `src:` | Source SearXNG instance URL | `src: http://localhost:8080` |
| `ts:` | Output generation timestamp (ISO-8601) | `ts: 2026-03-04T00:00:00.000Z` |
| `c: 1` | Cached result indicator | `c: 1` |
| `ca:` | Cache age in seconds | `ca: 45s` |
| `e:` | Engine(s) used | `e: google,bing` |
| `cat:` | Category filter | `cat: general` |
| `t:` | Time range filter | `t: day` |
| `total:` | Total results available | `total: 1000000` |
| `results[N]:` | Results array | `results[10]:` |
| `answers[N]:` | Direct answers array | `answers[1]: The Answer` |
| `infobox:` | Infobox object | `infobox:` |
| `suggestions[N]:`| Search suggestions array | `suggestions[2]: better query,alternative` |
| `corrections[N]:`| Spelling corrections | `corrections[1]: corrected query` |
| `domains:` | Domain distribution object | `domains:` |
| `unresponsive_engines:` | Unresponsive engines array | `unresponsive_engines[2]: engine1,engine2` |

Result rows contain: `idx,title,url[,engine][,score],snippet[,date]`

### TOON Benefits

- **Token-efficient**: ~40% fewer tokens than JSON
- **LLM-friendly**: Key-value pairs, no nesting syntax overhead
- **Context-rich**: Includes answers, infoboxes, suggestions, domain stats
- **Compact mode**: Use `--compact` or `--agent` for even smaller output

## JSON

Strict machine-readable JSON output for automation (`jq`, CI/CD, ETL).

```bash
searxng-cli --format json "query"
searxng-cli --json "query"
```

### JSON Schema (Top-Level)

```json
{
  "schemaVersion": "1.0",
  "query": "string",
  "format": "json",
  "source": "http://localhost:8080",
  "generatedAt": "2026-03-04T00:00:00.000Z",
  "resultCount": 0,
  "returnedCount": 0,
  "filtered": false,
  "cached": false,
  "cacheAgeMs": null,
  "timing": null,
  "numberOfResults": null,
  "results": [],
  "answers": [],
  "suggestions": [],
  "corrections": [],
  "unresponsiveEngines": [],
  "sourceParams": {}
}
```

### Options

```bash
searxng-cli --json --compact "query"      # No indentation
searxng-cli --json --pretty "query"       # Pretty print
```

## CSV

Comma-separated values for spreadsheet import.

```bash
searxng-cli --format csv "query"
```

### CSV Structure

```csv
i,title,url,engine,score,text
1,"Example Title","https://example.com","google","0.85","This is a snippet..."
```

## Markdown

Formatted Markdown output.

```bash
searxng-cli --format markdown "query"
searxng-cli -f md "query"
```

### Markdown Structure

```markdown
# query
> 2 results

1. [Example](https://example.com)
2. [Another Result](https://another.com)
```

## YAML

YAML format output.

```bash
searxng-cli --format yaml "query"
searxng-cli -f yml "query"
```

Top-level fields are stable for automation: `schemaVersion`, `query`, `format`, `source`,
`generatedAt`, `resultCount`, `returnedCount`, `cached`, `timing`, `results`, `answers`,
`suggestions`.

## Table

ASCII table format for terminal display.

```bash
searxng-cli --format table "query"
```

## XML

XML format for data interchange.

```bash
searxng-cli --format xml "query"
```

### XML Structure

```xml
<?xml version="1.0" encoding="UTF-8"?>
<search schema="1.0" query="query" source="http://localhost:8080" generatedAt="2026-03-04T00:00:00.000Z" resultCount="100" returnedCount="10">
  <results>
  <result index="1">
    <title>Example Title</title>
    <url>https://example.com</url>
    <engine>google</engine>
    <score>0.85</score>
    <text>Snippet text...</text>
  </result>
  </results>
</search>
```

## Validation Mode

Use `--validate-output` to verify format/schema before the CLI exits. Validation currently enforces structural checks for `toon`, `json`, `jsonl`/`ndjson`, `raw`, `csv`, `yaml`, `xml`, `markdown`, `table`, `text`, `simple`, and `html-report`.

For machine workflows, validation also enforces:
- JSON: `schemaVersion`, `format`, `source`, `generatedAt`, `resultCount`, `returnedCount`, and result object shape
- JSONL: line-delimited object validation (`schemaVersion`, `format`, `query`, `source`, `generatedAt`, sequential `index`, title/url)
- CSV: exact header and fixed six-column rows
- YAML: required top-level keys plus `schemaVersion: '1.0'`, `format: 'yaml'`, `source`, and `generatedAt`
- TOON: `q`, `n`, `src`, `ts`, sequential result indices and decode success
- XML: `<search>` root with `source` and `generatedAt` attributes

```bash
searxng --format json --validate-output "query" | jq '.results'
searxng --format jsonl --validate-output "query" | jq -R 'fromjson?'
searxng --format ndjson --validate-output "query" | jq -R 'fromjson?'
searxng --format toon --validate-output "query"
searxng --format yaml --validate-output "query"
searxng --format html-report --validate-output "query" > report.html
```

### Validate Existing Payloads

Use these commands to validate already-saved output files (or stdin) against the same formatter
validators used by `--validate-output`.

```bash
searxng --validate-payload json ./result.json
searxng --validate-payload json --input ./result.json
searxng --validate-payload-json toon ./result.toon | jq '.valid'
cat result.ndjson | searxng --validate-payload jsonl -
```

## HTML Report

Standalone HTML page with styled results.

```bash
searxng-cli --format html-report "query"
searxng-cli --format html "query"     # alias of html-report
```

## Text

Plain text output.

```bash
searxng-cli --format text "query"
searxng-cli --format simple "query"
```

## Special Output Modes

### URLs Only

```bash
searxng-cli --urls "query"
```

Output:
```
https://example.com/1
https://example.com/2
```

### Titles Only

```bash
searxng-cli --titles "query"
```

### JSONL (JSON Lines)

```bash
searxng-cli --jsonl "query"
```

Each result on a separate line for streaming:
```json
{"title":"Result 1","url":"https://example.com/1"}
{"title":"Result 2","url":"https://example.com/2"}
```

### Raw

Raw API response without processing.

```bash
searxng-cli --raw "query"
```

## Format Comparison

| Format | Use Case | LLM-Friendly | Human-Readable |
|--------|----------|--------------|----------------|
| toon | AI/LLM consumption | Best | Good |
| json | Data processing | Good | Good |
| csv | Spreadsheets | Poor | Good |
| markdown | Documentation | Good | Best |
| yaml | Configuration | Good | Best |
| table | Terminal display | Poor | Good |
| xml | Data interchange | Poor | Fair |
| html-report | Web viewing | Poor | Best |

## Choosing a Format

- **For AI/LLM**: Use `toon` (default)
- **For scripts**: Use `json` or `jsonl`
- **For spreadsheets**: Use `csv`
- **For documentation**: Use `markdown`
- **For quick viewing**: Use `table` or `text`
