# Agent Mode (`--agent`, `--agent-json`)

The SearXNG CLI is highly optimized for integration into AI agents, Language Models (LLMs), and autonomous pipelines. Use `--agent`/`--ai` for TOON output, or `--agent-json` when you need compact validated JSON for machine pipelines.

## Key Optimizations

1. **TOON Format as Default**
   The `--agent` flag automatically activates the **Token-Oriented Object Notation (TOON)** output format, utilizing the official `@toon-format/toon` specification. This format reduces token usage by approximately 40% compared to standard JSON by combining YAML-like indentation with CSV-style tabular data, while explicit array metadata (e.g., `[N]`) act as strict parsing guardrails.

2. **Content Truncation**
   URL lengths and content snippets are intelligently truncated to maximize information density.

3. **Machine JSON Agent Mode**
   `--agent-json` enables agent mode while forcing compact validated JSON output. This is useful for strict `jq`, CI/CD, and tool-calling pipelines that expect JSON contracts instead of TOON text.

4. **No Decorative Output**
   Features like `--pretty`, human-readable spinners, ANSI color codes, and extra newlines are aggressively suppressed to keep the payload machine-readable and concise.

5. **Local Instance Routing Safety**
   Agent mode forces searches through the local SearXNG instance `http://localhost:8080`, even if a different URL was previously configured. This protects autonomous agents from silently drifting to remote endpoints. This guard is controlled by persistent setting `forceLocalAgentRouting` (default `true`), and can be managed with:
   `searxng --set-force-local-agent-routing on|off`.
   For stricter policies, enable `forceLocalRouting` to pin all searches (not just `--agent`) to the configured `searxngUrl`:
   `searxng --set-force-local-routing on|off`.

6. **Automatic Output Contract Validation**
   Agent mode now automatically enables `--validate-output` so formatter output is schema-checked by default in automation workflows.

7. **Multi-Query Local Routing Guarantee**
   Agent mode local routing is enforced for every execution path, including `--multi`, so batched agent searches are also guaranteed to stay on the local instance.

8. **Request Reproducibility Envelope**
   Use `--request-json` to print the exact final request URL and query params (after settings, presets, aliases, and passthrough params are applied). This makes CI replay/debug deterministic for agent pipelines.

9. **Strict Exit Codes for Automation**
   Use `--strict` (or `--fail-on-empty`) to make automation deterministic: the CLI exits with status `2` when no results are returned, which is useful for CI/CD gates and retry logic in agent orchestration.

## Example Usage

\`\`\`bash
# Run an optimized search query directly from your LLM agent
searxng-cli --agent "latest react native updates" --limit 5

# Pipe it straight into another pipeline, extracting full content
searxng-cli --agent "machine learning papers" --raw-content > results.toon

# Get compact validated JSON for downstream machine parsing
searxng-cli --agent-json "machine learning papers" | jq '.results[0]'

# Fail fast in automation if the query yields zero results
searxng-cli --agent --strict "site:internal.example incident postmortem"
\`\`\`

## Model Context Protocol (MCP) Integration

The CLI includes built-in support for the **Model Context Protocol (MCP)** via the `--mcp` flag. This allows you to run SearXNG CLI directly as an MCP stdio server. By hooking this server into MCP-compatible clients (like Claude Desktop or other AI agents), the model can autonomously execute structured search queries without needing a `run_shell_command` wrapper. 

**Usage:**
\`\`\`bash
searxng-cli --mcp
\`\`\`

The MCP server exposes two robust tools:
1. **`search`**: A fully-featured search tool equipped with input schemas that naturally parse arguments like `query`, `engines`, `limit`, `timeRange`, `category`, and **`fetchContent`** (to automatically retrieve the full webpage text of the results).
2. **`fetch_webpage`**: A dedicated tool to fetch and extract the clean text content of any single webpage by its URL, allowing agents to dive deeper into specific search results.

## Using with Function Calling

When building a system that executes `run_shell_command` dynamically, instruct your agent to exclusively use the `--agent` flag for data retrieval. 

### Why TOON is Better for LLMs
- **Reduced Hallucinations:** The rigid schema defined at the top of the TOON output helps the model correctly identify and map the data types.
- **Lower Context Cost:** For large result sets, stripping out repetitive keys (like `"title":`, `"url":`, `"snippet":` in JSON) across arrays saves thousands of tokens.
- **Lossless Parsing:** The data can be unambiguously read back into a structured schema natively using the `@toon-format/toon` parser in your backend systems.

## Advanced Agent Features

1. **Context-Aware Web Scraping (`--fetch-content`)**: Automatically fetch and strip the HTML from the target URLs to get the actual page content directly in the CLI output, eliminating the need for a separate "browser" tool.
2. **System Prompt Wrapping (`--system-prompt <p>` or `--system-prompt=<p>`)**: Automatically wrap the structured output in XML-like tags with an injected system instruction, allowing you to pass the output directly into an LLM's context window.
3. **Auto-Correction & Query Refinement (`--auto-refine`)**: Allows the CLI to detect poor query results (e.g., zero results) and autonomously rewrite the query using synonyms or advanced operators, then automatically re-fetch.
4. **Vector Embedding Export (`--export-embeddings`)**: Returns the search results alongside lightweight vector embeddings for each snippet, allowing the agent to immediately insert the results into a vector database for RAG (Retrieval-Augmented Generation).
5. **Deterministic Cache Retrieval (`--offline-first`)**: Uses exact and semantic cache hits without making network requests, useful for reproducible CI/agent workflows.
6. **Machine Validation and Diagnostics**: Use `--validate-output`, `--verify-formats-json`, and `--doctor-json` to enforce parser-safe output contracts and runtime readiness gates.

## Ideas for Future Agent Enhancements

To make `searxng-cli` even more powerful for LLMs and autonomous agents, the following features could be considered for future development:

1. **Structured Streaming Search Responses**: Emit results incrementally as they arrive from SearXNG for lower end-to-end latency in long-running automation.
2. **Intent-Aware Local Re-Ranking**: Add optional objective-aware re-ranking tuned for agent tasks (research, debugging, incident response).
3. **Policy Profiles for Agents**: Named trust/safety profiles that constrain engines, categories, and passthrough params in multi-agent environments.
4. **Built-in Result Summarization Integrations**: Optional local/offline summarization adapters (for example Ollama) for pre-condensed agent context.
