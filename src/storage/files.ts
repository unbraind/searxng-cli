/**
 * Global data-directory bootstrap and application configuration persistence.
 */
import * as fs from 'fs';
import {
  BOOKMARKS_FILE,
  CACHE_FILE,
  CONFIG_DIR,
  CONFIG_FILE,
  ENGINES_CACHE_FILE,
  getDefaultConfig,
  HISTORY_FILE,
  PRESETS_FILE,
  SUGGESTIONS_FILE,
} from '../config';
import type { AppConfig } from '../types';
import { colorize } from '../utils';

/** Ensure the CLI data directory exists. */
export function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
}

function writeJsonFileIfMissing(filePath: string, data: unknown): void {
  if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

/** Initialize every managed global data file without overwriting user data. */
export function bootstrapGlobalDataFiles(): void {
  ensureConfigDir();
  try {
    writeJsonFileIfMissing(HISTORY_FILE, []);
    writeJsonFileIfMissing(BOOKMARKS_FILE, []);
    writeJsonFileIfMissing(PRESETS_FILE, {});
    writeJsonFileIfMissing(SUGGESTIONS_FILE, { popular: [], recent: [] });
    writeJsonFileIfMissing(CACHE_FILE, {});
    writeJsonFileIfMissing(ENGINES_CACHE_FILE, {
      timestamp: 0,
      engines: [],
      categories: [],
      info: {
        name: 'SearXNG',
        version: 'unknown',
        engines_count: 0,
        categories_count: 0,
        api_version: '1.0',
        contact_url: null,
        donation_url: null,
        privacypolicy_url: null,
      },
    });
  } catch (error) {
    if (process.env.DEBUG) {
      console.error(
        colorize(
          `Warning: Could not bootstrap global data files: ${(error as Error).message}`,
          'yellow'
        )
      );
    }
  }
}

/** Load application presentation and history preferences. */
export function loadConfig(): AppConfig {
  ensureConfigDir();
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) as AppConfig;
    }
  } catch (error) {
    console.error(
      colorize(`Warning: Could not load config: ${(error as Error).message}`, 'yellow')
    );
  }
  return getDefaultConfig();
}

/**
 * Persist application presentation and history preferences.
 * @param config Validated application configuration.
 */
export function saveConfig(config: AppConfig): void {
  ensureConfigDir();
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  } catch (error) {
    console.error(
      colorize(`Warning: Could not save config: ${(error as Error).message}`, 'yellow')
    );
  }
}
