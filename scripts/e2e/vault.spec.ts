import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { db, usersTable, sessionsTable, dealsTable, accessRequestsTable } from '@workspace/db';

/** Seed a user account with a DB-backed session (bearer sid / `sid` cookie). */
async function seedUser(role: 'broker' | 'investor') {
  const id = `e2e-${role}-${crypto.randomUUID()}`;
  const user = { id, email: `${id}@example.com`, firstName: 'E2E', lastName: role === 'broker' ? 'Broker' : 'Investor', profileImageUrl: null, role };
  await db.insert(usersTable).values({ id, email: user.email, firstName: user.firstName, lastName: user.lastName, role });
  const sid = crypto.randomBytes(32).toString('hex');
  await db.insert(sessionsTable).values({
    sid,
    sess: { user, access_token: 'e2e-test' },
    expire: new Date(Date.now() + 60 * 60 * 1000),
  });
  return { id, sid };
}

async function cleanupUser(u: { id: string; sid: string }) {
  await db.delete(sessionsTable).where(eq(sessionsTable.sid, u.sid));
  await db.delete(usersTable).where(eq(usersTable.id, u.id));
}

/**
 * End-to-end coverage for the RealEstate Vault core flows:
 *  1. Landing → demo entry
 *  2. Deal filter/search
 *  3. Request access on a confidential deal
 *  4. Access request lifecycle: pending → approved → nda_sent → nda_signed
 *  5. Mandate creation
 *  6. Messaging
 */

const unique = () => Math.random().toString(36).slice(2, 8);

async function findConfidentialDeal(request: APIRequestContext) {
  const res = await request.get('/api/deals');
  expect(res.ok()).toBeTruthy();
  const deals = (await res.json()) as Array<{
    id: number;
    title: string;
    confidential: boolean;
    assetClass: string;
  }>;
  expect(deals.length).toBeGreaterThan(0);
  const confidential = deals.find((d) => d.confidential);
  expect(confidential, 'expected at least one confidential deal in seed data').toBeTruthy();
  // Prefer a non-confidential deal for search-term matching (confidential titles
  // are masked server-side and don't match real DB titles).
  const searchTarget = deals.find((d) => !d.confidential) ?? deals[0];
  return { deals, confidential: confidential!, searchTarget };
}

test('landing page renders and Enter the Vault leads to the demo dashboard', async ({ page }) => {
  await page.goto('/');
  const enter = page.getByRole('link', { name: /enter the vault/i }).first();
  await expect(enter).toBeVisible();
  await enter.click();
  await expect(page).toHaveURL(/\/demo$/);
  // Dashboard content renders
  await expect(page.locator('main, [class*="p-8"]').first()).toBeVisible();
});

test('deals can be searched and filtered by asset class', async ({ page, request }) => {
  const { deals } = await findConfidentialDeal(request);

  // Probe for a search term that matches the actual DB-stored title/city/teaser.
  // API-visible titles may be masked; the search endpoint queries raw DB fields.
  let searchTerm = '';
  let expectedSearchCount = 0;
  const probeWords = [
    'Prime', 'Park', 'Plaza', 'Gate', 'House', 'Tower', 'Hub', 'Center',
    'Munich', 'Berlin', 'London', 'Paris', 'Amsterdam', 'Frankfurt',
    ...deals.flatMap((d) => d.city?.split(/\s+/) ?? []),
  ];
  for (const word of probeWords) {
    if (!word || word.length < 3) continue;
    const r = await request.get(`/api/deals?search=${encodeURIComponent(word)}`);
    const found = (await r.json()) as Array<{ id: number }>;
    if (found.length > 0) {
      searchTerm = word;
      expectedSearchCount = found.length;
      break;
    }
  }

  await page.goto('/demo/deals');
  const search = page.getByPlaceholder('Search deals...');
  await expect(search).toBeVisible();

  if (searchTerm) {
    // Search narrows the list to deals whose DB title/city/teaser contains the term
    await search.fill(searchTerm);
    await expect(page.getByRole('link', { name: /view details/i }).first()).toBeVisible();
    const apiFiltered = await request.get(`/api/deals?search=${encodeURIComponent(searchTerm)}`);
    const filtered = (await apiFiltered.json()) as Array<{ id: number }>;
    await expect(page.getByRole('link', { name: /view details/i })).toHaveCount(filtered.length);
  }

  // Asset class filter applies
  await search.fill('');
  await page.getByRole('combobox').first().click();
  await page.getByRole('option', { name: 'Offices' }).click();
  const offices = (await (await request.get('/api/deals?assetClass=Offices')).json()) as Array<{
    id: number;
  }>;
  await expect(page.getByRole('link', { name: /view details/i })).toHaveCount(offices.length);
});

test('confidential deal access request lifecycle: request → approve → NDA sent → NDA signed', async ({
  browser,
  baseURL,
}) => {
  // The shared broker passcode is retired: the lifecycle now runs as a real
  // broker account that owns the deal, plus a signed-in investor requester.
  const broker = await seedUser('broker');
  const investor = await seedUser('investor');
  const requesterName = `E2E Tester ${unique()}`;

  const [deal] = await db
    .insert(dealsTable)
    .values({
      title: `E2E Confidential Deal ${unique()}`,
      dealType: 'asset_deal',
      assetClass: 'Offices',
      country: 'DE',
      city: 'Berlin',
      askingPrice: 25000000,
      confidential: true,
      brokerName: 'E2E Broker',
      brokerUserId: broker.id,
    })
    .returning();

  const cookieFor = (sid: string) => [{ name: 'sid', value: sid, url: baseURL ?? 'http://localhost:80' }];

  try {
    // Investor requests access from the deal detail page.
    const investorCtx = await browser.newContext({ baseURL });
    await investorCtx.addCookies(cookieFor(investor.sid));
    const invPage = await investorCtx.newPage();
    await invPage.goto(`/demo/deals/${deal.id}`);
    await invPage.locator('#req-name').fill(requesterName);
    await invPage.locator('#req-company').fill('E2E Capital Partners');
    await invPage.locator('#req-message').fill('Automated end-to-end verification');
    await invPage.getByRole('button', { name: /request access/i }).click();
    await expect(invPage.getByText('Request Pending')).toBeVisible();
    await investorCtx.close();

    // Broker signs in with their own account; they only see their own deals' requests.
    const brokerCtx = await browser.newContext({ baseURL });
    await brokerCtx.addCookies(cookieFor(broker.sid));
    const page = await brokerCtx.newPage();
    await page.goto('/demo/access-requests');
    await expect(page.getByText('Manage data room access and NDAs for your deals.')).toBeVisible();

    // Backend recorded the request as pending (bearer session auth).
    const bh = { Authorization: `Bearer ${broker.sid}` };
    const listRes = await page.request.get('/api/access-requests', { headers: bh });
    const requests = (await listRes.json()) as Array<{
      id: number;
      requesterName: string;
      status: string;
    }>;
    const created = requests.find((r) => r.requesterName === requesterName);
    expect(created).toBeTruthy();
    expect(created!.status).toBe('pending');

    // Advance the lifecycle through the broker UI
    const requestCard = page
      .getByText(requesterName)
      .locator('xpath=ancestor::*[contains(@class, "overflow-hidden")][1]')
      .first();

    await requestCard.getByRole('button', { name: /approve request/i }).click();
    await requestCard.getByRole('button', { name: /send digital nda/i }).click();
    await expect(requestCard.getByText(/waiting for the investor to sign/i)).toBeVisible();

    // The investor signs the NDA on their own request (authenticated session).
    const signRes = await page.request.post(`/api/access-requests/${created!.id}/sign`, {
      headers: { Authorization: `Bearer ${investor.sid}`, 'Content-Type': 'application/json' },
      data: { signerName: requesterName, agreed: true },
    });
    expect(signRes.ok()).toBeTruthy();

    // Broker sees the granted state after refresh.
    await page.reload();
    await expect(requestCard.getByText('Access Granted')).toBeVisible();

    // Backend reflects the final status
    const finalRes = await page.request.get('/api/access-requests', { headers: bh });
    const finalRequests = (await finalRes.json()) as Array<{ id: number; status: string }>;
    const finalReq = finalRequests.find((r) => r.id === created!.id);
    expect(finalReq?.status).toBe('nda_signed');
    await brokerCtx.close();
  } finally {
    await db.delete(accessRequestsTable).where(eq(accessRequestsTable.dealId, deal.id));
    await db.delete(dealsTable).where(eq(dealsTable.id, deal.id));
    await cleanupUser(broker);
    await cleanupUser(investor);
  }
});

test('a new acquisition mandate can be created from the mandates page', async ({ page }) => {
  const title = `E2E Mandate ${unique()}`;

  await page.goto('/demo/mandates');
  await page.getByRole('button', { name: /new mandate/i }).click();
  await expect(page.getByText('Create Acquisition Mandate')).toBeVisible();

  const dialog = page.getByRole('dialog');
  await dialog.getByPlaceholder('e.g. Core European Office Acquisition').fill(title);
  // Investor name is the first empty required text input after the title
  await dialog.locator('input:not([type="number"])').nth(1).fill('E2E Family Office');
  const numberInputs = dialog.locator('input[type="number"]');
  await numberInputs.nth(0).fill('10');
  await numberInputs.nth(1).fill('50');
  await dialog.getByRole('button', { name: /create mandate|create|submit/i }).last().click();

  // Dialog closes and the mandate appears in the list
  await expect(page.getByText('Create Acquisition Mandate')).toBeHidden();
  await expect(page.getByText(title)).toBeVisible();
});

test('a message can be sent in an existing thread', async ({ page, request }) => {
  const body = `E2E hello ${unique()}`;

  const threadsRes = await request.get('/api/threads');
  const threads = (await threadsRes.json()) as Array<{ id: number; counterpartName: string }>;
  expect(threads.length).toBeGreaterThan(0);

  await page.goto('/demo/messages');
  // Open the first conversation in the thread list by its counterpart name
  await page.getByText(threads[0].counterpartName).first().click();
  const composer = page.getByPlaceholder('Type a secure message...');
  await expect(composer).toBeVisible();
  await composer.fill(body);
  await composer.press('Enter');

  // Message renders in the thread (bubble + thread preview both show it)
  await expect(page.getByText(body).first()).toBeVisible();

  // Persisted server-side
  const messagesRes = await request.get(`/api/threads/${threads[0].id}/messages`);
  const messages = (await messagesRes.json()) as Array<{ body: string }>;
  expect(messages.some((m) => m.body === body)).toBeTruthy();
});
