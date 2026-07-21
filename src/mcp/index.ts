/**
 * Model Context Protocol server exposing SearXNG search and page-content tools through validated agent-facing schemas.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { performSearch } from '../index';
import { fetchWebpageContent } from '../search';
import { reloadSearxngUrl } from '../config';
import { createDefaultOptions } from '../cli';
import type { SearchOptions, SearchResult, TimeRange } from '../types';

export const mcpRuntimeHooks = {
  performSearch,
  fetchWebpageContent,
  reloadSearxngUrl,
};

/**
 *
 */
export async function runMcpServer(): Promise<void> {
  const server = new Server(
    {
      name: 'searxng-cli-mcp',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, () => {
    return {
      tools: [
        {
          name: 'search',
          description:
            'Perform a web search using SearXNG metasearch engine. Ideal for research, checking latest information, fetching technical docs, and investigating current events.',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'The search query. Be specific.',
              },
              engines: {
                type: 'string',
                description:
                  'Comma-separated list of engines (e.g., "google,bing,duckduckgo,wikipedia"). Leave empty to use default.',
              },
              category: {
                type: 'string',
                description: 'Search category: general, news, science, it, images, videos, files.',
              },
              limit: {
                type: 'number',
                description: 'Maximum number of results to return (default: 10)',
              },
              timeRange: {
                type: 'string',
                description: 'Time range for results: day, week, month, year',
              },
              fetchContent: {
                type: 'boolean',
                description:
                  'If true, fetches the text content of the result webpages. Slower but provides full context.',
              },
            },
            required: ['query'],
          },
        },
        {
          name: 'fetch_webpage',
          description: 'Fetch the text content of a single webpage by its URL.',
          inputSchema: {
            type: 'object',
            properties: {
              url: {
                type: 'string',
                description: 'The URL of the webpage to fetch.',
              },
            },
            required: ['url'],
          },
        },
      ],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name === 'search') {
      const args = request.params.arguments ?? {};
      const query = args.query;

      if (!query || typeof query !== 'string') {
        throw new Error('Missing or invalid query parameter');
      }

      const defaultOptions = createDefaultOptions();

      const options: SearchOptions = {
        ...defaultOptions,
        query,
        format: 'json',
        engines: typeof args.engines === 'string' ? args.engines : null,
        timeRange:
          typeof args.timeRange === 'string' &&
          ['day', 'week', 'month', 'year'].includes(args.timeRange)
            ? (args.timeRange as TimeRange)
            : null,
        category: typeof args.category === 'string' ? args.category : null,
        limit: typeof args.limit === 'number' ? args.limit : defaultOptions.limit,
        fetchContent: Boolean(args.fetchContent),
        verbose: false,
        output: null,
        interactive: false,
        quick: false,
        systemPrompt: null,
        rawContent: true,
        analyze: false,
        agent: true,
        citation: false,
        exportEmbeddings: false,
        autoRefine: false,
        compact: true,
        noCache: false,
        silent: true,
        validateOutput: false,
        pretty: false,
      };

      mcpRuntimeHooks.reloadSearxngUrl();

      try {
        const result = await mcpRuntimeHooks.performSearch(options);

        if (!result) {
          return {
            content: [
              {
                type: 'text',
                text: 'No results returned or an error occurred.',
              },
            ],
          };
        }

        const jsonOutput = JSON.stringify(
          {
            query: result.query,
            number_of_results: result.number_of_results,
            results:
              result.results?.map((r: SearchResult) => ({
                title: r.title,
                url: r.url,
                snippet: r.content,
                score: r.score,
                engine: r.engine,
                publishedDate: r.publishedDate,
              })) || [],
          },
          null,
          2
        );

        return {
          content: [
            {
              type: 'text',
              text: jsonOutput,
            },
          ],
        };
      } catch (error: unknown) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Search failed: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }

    if (request.params.name === 'fetch_webpage') {
      const args = request.params.arguments ?? {};
      const url = args.url;

      if (!url || typeof url !== 'string') {
        throw new Error('Missing or invalid url parameter');
      }

      try {
        // Create a dummy result to reuse the fetchWebpageContent logic
        const dummyResult = { url, title: 'Dummy', content: '', engine: 'dummy', score: 1 };
        const fetched = await mcpRuntimeHooks.fetchWebpageContent([dummyResult]);

        if (!fetched || fetched.length === 0 || !fetched[0].content) {
          return {
            content: [
              {
                type: 'text',
                text: 'Failed to fetch content or content is empty.',
              },
            ],
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: fetched[0].content,
            },
          ],
        };
      } catch (error: unknown) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Fetch failed: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }

    throw new Error(`Tool not found: ${request.params.name}`);
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.log = () => undefined;
  console.info = () => undefined;
  console.warn = () => undefined;
}
