import crypto from 'node:crypto';
import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test';
import { db, usersTable, sessionsTable, dealsTable } from '@workspace/db';
import { eq } from 'drizzle-orm';

/**
 * Public broker profile page (Task: broker detail page):
 * - GET /api/brokers/:id returns the profile; unknown id is a 404
 * - GET /api/brokers/:id/deals lists only that broker's deals
 * - /demo/brokers/:id renders profile + active listings in the web app
 * - deal detail "Represented By" panel links to the broker profile
 * - directory cards link to the profile page
 */

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:80';

interface TestUser {
  id: string;
  sid: string;
}

async function createTestUser(label: string, role: 'broker' | 'investor'): Promise<TestUser> {
  const id = `e2e-${label}-${crypto.randomUUID()}`;
  await db.insert(usersTable).values({
    id,
    email: `${id}@example.com`,
    firstName: 'E2E',
    lastName: label,
    role,
  });
  const sid = crypto.randomBytes(32).toString('hex');
  await db.insert(sessionsTable).values({
    sid,
    sess: {
      user: {
        id,
        email: `${id}@example.com`,
        firstName: 'E2E',
        lastName: label,
        profileImageUrl: null,
        role,
      },
      access_token: 'e2e-test',
    },
    expire: new Date(Date.now() + 60 * 60 * 1000),
  });
  return { id, sid };
}

async function apiAs(user: TestUser): Promise<APIRequestContext> {
  return pwRequest.newContext({
    baseURL: BASE,
    extraHTTPHeaders: { Authorization: `Bearer ${user.sid}` },
  });
}

test('broker public profile page shows the profile and their listings', async ({ page, context }) => {
  const broker = await createTestUser('broker', 'broker');
  const investor = await createTestUser('investor', 'investor');
  const brokerApi = await apiAs(broker);
  const investorApi = await apiAs(investor);
  const suffix = crypto.randomUUID().slice(0, 8);

  // Create the broker's directory profile.
  const name = `E2E Broker ${suffix}`;
  const company = `E2E Capital ${suffix}`;
  const putRes = await brokerApi.put('/api/brokers/me', {
    data: {
      name,
      company,
      title: 'Managing Director',
      city: 'Lisbon',
      country: 'Portugal',
      bio: 'E2E test broker bio.',
      specialisations: ['Offices'],
      yearsExperience: 12,
    },
  });
  expect(putRes.status()).toBe(200);
  const profile = (await putRes.json()) as { id: number };

  // Create a deal owned by this broker.
  const dealTitle = `E2E Broker Deal ${suffix}`;
  const dealRes = await brokerApi.post('/api/deals', {
    data: {
      title: dealTitle,
      teaser: 'Teaser for e2e broker deal',
      assetClass: 'Offices',
      dealType: 'asset_sale',
      city: 'Lisbon',
      country: 'Portugal',
      askingPrice: 12000000,
      currency: 'EUR',
      confidential: false,
    },
  });
  expect(dealRes.status()).toBe(201);
  const deal = (await dealRes.json()) as { id: number; brokerProfileId: number | null };
  expect(deal.brokerProfileId).toBe(profile.id);

  // Create a second deal and mark it non-active; it must not appear as a listing.
  const closedTitle = `E2E Closed Deal ${suffix}`;
  const closedRes = await brokerApi.post('/api/deals', {
    data: {
      title: closedTitle,
      teaser: 'Closed e2e deal',
      assetClass: 'Offices',
      dealType: 'asset_sale',
      city: 'Lisbon',
      country: 'Portugal',
      askingPrice: 5000000,
      currency: 'EUR',
      confidential: false,
    },
  });
  expect(closedRes.status()).toBe(201);
  const closedDeal = (await closedRes.json()) as { id: number };
  await db
    .update(dealsTable)
    .set({ status: 'closed' })
    .where(eq(dealsTable.id, closedDeal.id));

  // API: profile endpoint and per-broker deals endpoint.
  const brokerGet = await investorApi.get(`/api/brokers/${profile.id}`);
  expect(brokerGet.status()).toBe(200);
  expect(((await brokerGet.json()) as { name: string }).name).toBe(name);

  const dealsGet = await investorApi.get(`/api/brokers/${profile.id}/deals`);
  expect(dealsGet.status()).toBe(200);
  const brokerDeals = (await dealsGet.json()) as Array<{ id: number; brokerProfileId: number | null }>;
  expect(brokerDeals.some((d) => d.id === deal.id)).toBe(true);
  expect(brokerDeals.every((d) => d.brokerProfileId === profile.id)).toBe(true);
  // Non-active listings are excluded from the public profile.
  expect(brokerDeals.some((d) => d.id === closedDeal.id)).toBe(false);

  expect((await investorApi.get('/api/brokers/999999')).status()).toBe(404);
  expect((await investorApi.get('/api/brokers/999999/deals')).status()).toBe(404);

  // Web: sign in as the investor via the session cookie.
  await context.addCookies([
    { name: 'sid', value: investor.sid, url: BASE },
  ]);

  // Profile page renders the broker and their listing.
  await page.goto(`${BASE}/demo/brokers/${profile.id}`);
  await expect(page.getByTestId('text-broker-name')).toContainText(name);
  await expect(page.getByTestId('text-broker-bio')).toContainText('E2E test broker bio.');
  await expect(page.getByText(dealTitle)).toBeVisible();
  await expect(page.getByText(closedTitle)).toHaveCount(0);

  // Deal detail links to the broker profile.
  await page.goto(`${BASE}/demo/deals/${deal.id}`);
  const profileLink = page.getByTestId('button-view-broker-profile');
  await expect(profileLink).toBeVisible();
  await profileLink.click();
  await expect(page).toHaveURL(new RegExp(`/demo/brokers/${profile.id}$`));
  await expect(page.getByTestId('text-broker-name')).toContainText(name);

  // Directory cards link to the profile page.
  await page.goto(`${BASE}/demo/brokers`);
  await page.getByTestId(`button-view-profile-${profile.id}`).click();
  await expect(page).toHaveURL(new RegExp(`/demo/brokers/${profile.id}$`));
  await expect(page.getByTestId('text-broker-name')).toContainText(name);
});
