import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: './tests/ui', timeout: 90000, workers: 1, fullyParallel: false, reporter: 'list', outputDir: '../test-results/desktop', use: { trace: 'retain-on-failure' } });
