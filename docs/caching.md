# Caching

SearXNG CLI includes a sophisticated caching system for improved performance and reduced API calls.

## Overview

The cache system features:

- **Unlimited In-Memory Cache**: No entry cap (`LRU_CACHE_SIZE=0`)
- **Persistent Storage**: Cache survives restarts
- **Compression**: Optional gzip compression
- **Search**: Full-text search in cached entries
- **Import/Export**: Share cache between systems

## Cache Commands

### Show Cache Status

```bash
searxng-cli --cache
searxng-cli --cache-status
```

Output:
```
╔════════════════════════════════════════════════════════════╗
║              Cache Status                                  ║
╚════════════════════════════════════════════════════════════╝

Memory Cache:
  Entries: 150 (Unlimited)
  Oldest entry: 2 hours ago
  Newest entry: 5 minutes ago

Configuration:
  Persistent: Enabled
  Compressed: Yes
  Max age: Endless

Disk Cache:
  File: ~/.searxng-cli/cache.json
  Exists: Yes
  Size: 125 KB
```

### List Cache Entries

```bash
searxng-cli --cache-list          # List 50 entries
searxng-cli --cache-list 100      # List 100 entries
```

### Search Cache

```bash
searxng-cli --cache-search "term"
```

### Inspect Cache Entry

```bash
searxng-cli --cache-inspect 1
```

### Delete Cache Entry

```bash
searxng-cli --cache-delete 1
```

### Clear Cache

```bash
searxng-cli --cache-clear
searxng-cli --clear-cache
```

### Export Cache

```bash
searxng-cli --cache-export backup.json
```

### Import Cache

```bash
searxng-cli --cache-import backup.json       # Merge with existing
```

### Prune Old Entries

```bash
searxng-cli --cache-prune 7     # Remove entries older than 7 days
```

## Cache Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CACHE_MAX_AGE` | `Infinity` | Maximum cache age (ms) |
| `CACHE_COMPRESSION` | `true` | Enable compression |
| `PERSISTENT_CACHE` | `true` | Enable disk persistence |

### Configuration File

Edit `~/.searxng-cli/config.json`:

```json
{
  "cacheSize": 0,
  "cacheMaxAge": null,
  "cacheCompression": true,
  "persistentCache": true
}
```

## Cache Key Structure

Cache keys are generated from:

- Query string
- Category
- Language
- Page number
- Engines
- Time range

Example key: `nodejs:general:en:1:google,bing:all`

## Cache Behavior

### Cache Hit

When a cached result exists:

1. No network request is made
2. Cached data is returned immediately
3. `_cached: true` flag is set in response

### Cache Miss

When no cached result exists:

1. Request is sent to SearXNG
2. Response is cached
3. Cache is periodically saved to disk

### Bypassing Cache

```bash
searxng-cli --no-cache "query"
searxng-cli -C "query"
```

## Cache Storage

### Location

```
~/.searxng-cli/
├── cache.json          # Main cache file
├── engines.json        # Engine discovery cache
├── history.json        # Search history
├── bookmarks.json      # Bookmarks
└── config.json         # Configuration
```

### File Format

Cache file format (when compression is disabled):

```json
{
  "query:category:lang:page:engines:range": {
    "timestamp": 1705312800000,
    "data": {
      "query": "search query",
      "results": [...]
    }
  }
}
```

When compression is enabled, the file contains base64-encoded deflated JSON.

## Performance

### Memory Usage

- Default in-memory cache size: unlimited (`0` means no cap)
- Memory usage grows with cache volume; use `--cache-prune` for lifecycle management

### Disk Usage

- Typical cache file: 50-500 KB
- Compressed: ~30-70% smaller

### Cache Hit Rate

Monitor your cache effectiveness:

```bash
searxng-cli --stats "query"
```

## Best Practices

1. **Use persistent cache**: Keep `PERSISTENT_CACHE=true`
2. **Enable compression**: Saves disk space
3. **Regular pruning**: Use `--cache-prune` periodically
4. **Export backups**: Use `--cache-export` for backups
5. **Monitor usage**: Check `--cache` regularly

## Troubleshooting

### Cache Not Persisting

1. Check permissions on `~/.searxng-cli/`
2. Verify disk space
3. Check for file corruption

### Cache File Too Large

1. Run `--cache-prune` to remove old entries
2. Reduce `cacheSize` in config
3. Clear and rebuild cache

### Corrupted Cache

```bash
searxng-cli --cache-clear
```

This removes the cache file and starts fresh.
