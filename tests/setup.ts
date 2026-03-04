import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

const tmpDir = path.join(
  os.tmpdir(),
  'searxng-cli-test-' + process.pid + '-' + Math.random().toString(36).substring(2)
);

if (!fs.existsSync(tmpDir)) {
  fs.mkdirSync(tmpDir, { recursive: true });
}

process.env.SEARXNG_CLI_CONFIG_DIR = tmpDir;
