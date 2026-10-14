const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests', workers: 1, use: { baseURL: 'http://127.0.0.1:4173', headless: true, launchOptions: { executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium' }, viewport: { width: 1440, height: 1000 } },
  webServer: { command: 'npm run dev', url: 'http://127.0.0.1:4173', reuseExistingServer: false }
});
