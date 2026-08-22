import { test, expect } from '@playwright/test';

/**
 * A healthy-but-empty platform must render truthful zeros and an honest
 * empty state on the public homepage — never the static fabricated
 * placeholder figures (€4.2B+/850+) or invented opportunity cards. Those
 * placeholders are reserved for the API being unreachable.
 *
 * The public endpoints are mocked via route interception so the live DB
 * doesn't need to be emptied.
 */

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:80';

test('empty successful API responses show zeros and empty state, not fabricated data', async ({ page }) => {
  await page.route('**/api/deals*', (route) =>
    route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'Unauthorized' }) }),
  );
  await page.route('**/api/public/deal-teasers*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.route('**/api/public/stats', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ pipelineValue: 0, liveDeals: 0, verifiedProfessionals: 0 }),
    }),
  );

  await page.goto(`${BASE}/`);

  // Truthful empty state for opportunities, no invented cards.
  await expect(page.getByTestId('text-no-opportunities')).toBeVisible();
  await expect(page.getByText('Core logistics portfolio')).toHaveCount(0);

  // Real zero metrics, not the static fallback figures.
  await expect(page.getByTestId('stat-pipeline-value')).toContainText('€0');
  await expect(page.getByTestId('stat-live-opportunities')).toContainText('0');
  await expect(page.getByTestId('stat-verified-professionals')).toContainText('0+');
  await expect(page.getByText('€4.2B+')).toHaveCount(0);
  await expect(page.getByText('850+')).toHaveCount(0);
});

test('unreachable API falls back to static placeholder cards and figures', async ({ page }) => {
  await page.route('**/api/deals*', (route) => route.abort());
  await page.route('**/api/public/deal-teasers*', (route) => route.abort());
  await page.route('**/api/public/stats', (route) => route.abort());

  await page.goto(`${BASE}/`);

  await expect(page.getByText('Core logistics portfolio')).toBeVisible();
  await expect(page.getByText('€4.2B+')).toBeVisible();
});
