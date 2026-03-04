import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runMcpServer, mcpRuntimeHooks } from '../../src/mcp/index';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const { mockSetRequestHandler } = vi.hoisted(() => {
  return { mockSetRequestHandler: vi.fn() };
});

vi.mock('@modelcontextprotocol/sdk/server/index.js', () => {
  const ServerMock = vi.fn().mockImplementation(() => ({
    setRequestHandler: mockSetRequestHandler,
    connect: vi.fn().mockResolvedValue(undefined),
  }));
  return { Server: ServerMock };
});

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => {
  return { StdioServerTransport: vi.fn() };
});

describe('MCP Server', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mcpRuntimeHooks.reloadSearxngUrl = vi.fn();
    mcpRuntimeHooks.performSearch = vi.fn().mockImplementation(async (options: any) => {
      if (options.query === 'fail') {
        throw new Error('Search failed');
      }
      if (options.query === 'empty') {
        return null;
      }
      if (options.query === 'no-results-array') {
        return {
          query: 'test',
          number_of_results: 0,
        };
      }
      return {
        query: 'test',
        number_of_results: 1,
        results: [
          {
            title: 'Test',
            url: 'http://test.com',
            content: 'snippet',
            score: 1,
            engine: 'google',
            publishedDate: '2023-01-01',
          },
        ],
      };
    });
    mcpRuntimeHooks.fetchWebpageContent = vi.fn().mockImplementation(async (results: any[]) => {
      if (results[0].url === 'http://fail.com') {
        throw new Error('Fetch failed');
      }
      return [
        {
          ...results[0],
          content: results[0].url === 'http://empty.com' ? '' : 'Fetched content',
        },
      ];
    });
  });

  it('should initialize and register handlers', async () => {
    await runMcpServer();
    expect(Server).toHaveBeenCalled();
    expect(mockSetRequestHandler).toHaveBeenCalledWith(
      ListToolsRequestSchema,
      expect.any(Function)
    );
    expect(mockSetRequestHandler).toHaveBeenCalledWith(CallToolRequestSchema, expect.any(Function));
  });

  it('should list tools correctly', async () => {
    await runMcpServer();
    const listToolsHandler = mockSetRequestHandler.mock.calls.find(
      (call: any) => call[0] === ListToolsRequestSchema
    )[1];

    const result = await listToolsHandler();
    expect(result.tools).toHaveLength(2);
    expect(result.tools[0].name).toBe('search');
    expect(result.tools[1].name).toBe('fetch_webpage');
  });

  it('should handle tool call for search successfully', async () => {
    await runMcpServer();
    const callToolHandler = mockSetRequestHandler.mock.calls.find(
      (call: any) => call[0] === CallToolRequestSchema
    )[1];

    const result = await callToolHandler({
      params: { name: 'search', arguments: { query: 'test', limit: 5, fetchContent: true } },
    });

    expect(result.content[0].type).toBe('text');
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.query).toBe('test');
    expect(parsed.results[0].title).toBe('Test');
  });

  it('should handle tool call for search with missing query', async () => {
    await runMcpServer();
    const callToolHandler = mockSetRequestHandler.mock.calls.find(
      (call: any) => call[0] === CallToolRequestSchema
    )[1];

    await expect(callToolHandler({ params: { name: 'search', arguments: {} } })).rejects.toThrow(
      'Missing or invalid query parameter'
    );
  });

  it('should handle tool call for search empty result', async () => {
    await runMcpServer();
    const callToolHandler = mockSetRequestHandler.mock.calls.find(
      (call: any) => call[0] === CallToolRequestSchema
    )[1];

    const result = await callToolHandler({
      params: { name: 'search', arguments: { query: 'empty' } },
    });
    expect(result.content[0].text).toBe('No results returned or an error occurred.');
  });

  it('should handle tool call for search with missing results array', async () => {
    await runMcpServer();
    const callToolHandler = mockSetRequestHandler.mock.calls.find(
      (call: any) => call[0] === CallToolRequestSchema
    )[1];

    const result = await callToolHandler({
      params: { name: 'search', arguments: { query: 'no-results-array' } },
    });

    expect(result.content[0].type).toBe('text');
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.results).toEqual([]);
  });

  it('should handle tool call for search with error', async () => {
    await runMcpServer();
    const callToolHandler = mockSetRequestHandler.mock.calls.find(
      (call: any) => call[0] === CallToolRequestSchema
    )[1];

    const result = await callToolHandler({
      params: { name: 'search', arguments: { query: 'fail' } },
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('Search failed: Search failed');
  });

  it('should handle tool call for fetch_webpage successfully', async () => {
    await runMcpServer();
    const callToolHandler = mockSetRequestHandler.mock.calls.find(
      (call: any) => call[0] === CallToolRequestSchema
    )[1];

    const result = await callToolHandler({
      params: { name: 'fetch_webpage', arguments: { url: 'http://test.com' } },
    });

    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toBe('Fetched content');
  });

  it('should handle tool call for fetch_webpage empty content', async () => {
    await runMcpServer();
    const callToolHandler = mockSetRequestHandler.mock.calls.find(
      (call: any) => call[0] === CallToolRequestSchema
    )[1];

    const result = await callToolHandler({
      params: { name: 'fetch_webpage', arguments: { url: 'http://empty.com' } },
    });

    expect(result.content[0].text).toBe('Failed to fetch content or content is empty.');
  });

  it('should handle tool call for fetch_webpage with error', async () => {
    await runMcpServer();
    const callToolHandler = mockSetRequestHandler.mock.calls.find(
      (call: any) => call[0] === CallToolRequestSchema
    )[1];

    const result = await callToolHandler({
      params: { name: 'fetch_webpage', arguments: { url: 'http://fail.com' } },
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('Fetch failed: Fetch failed');
  });

  it('should handle tool call for fetch_webpage missing url', async () => {
    await runMcpServer();
    const callToolHandler = mockSetRequestHandler.mock.calls.find(
      (call: any) => call[0] === CallToolRequestSchema
    )[1];

    await expect(
      callToolHandler({ params: { name: 'fetch_webpage', arguments: {} } })
    ).rejects.toThrow('Missing or invalid url parameter');
  });

  it('should throw error for unknown tool', async () => {
    await runMcpServer();
    const callToolHandler = mockSetRequestHandler.mock.calls.find(
      (call: any) => call[0] === CallToolRequestSchema
    )[1];

    await expect(
      callToolHandler({ params: { name: 'unknown_tool', arguments: {} } })
    ).rejects.toThrow('Tool not found: unknown_tool');
  });
});
