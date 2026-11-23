import { defineConfig } from '@playwright/test';
const externalUrl = process.env.PLAYWRIGHT_BASE_URL;
export default defineConfig({
  testDir: './tests/browser',
  use: { baseURL: externalUrl ?? 'http://127.0.0.1:3100' },
  webServer: externalUrl ? undefined : { command: 'npm run dev -- --port 3100', url: 'http://127.0.0.1:3100', reuseExistingServer: false, env: { PROOFQUEST_POC_ENABLED: 'false' } },
});
