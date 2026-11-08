import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.e2e.spec.mjs',
  timeout: 45_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  projects: [
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } },
    { name: 'small-mobile-chromium', use: { ...devices['Pixel 5'], viewport: { width: 320, height: 720 } } }
  ],
  webServer: {
    command: 'python3 scripts/build_public_site.py --output _e2e_public && python3 -m http.server 4173 --bind 127.0.0.1 --directory _e2e_public',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000
  }
});
