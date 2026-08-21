import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

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
  return { deals, confidential: confidential! };
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
  const target = deals[0];

  await page.goto('/demo/deals');
  const search = page.getByPlaceholder('Search deals...');
  await expect(search).toBeVisible();

  // Search narrows the list to the matching deal
  const term = target.title.split(' ')[0];
  await search.fill(term);
  await expect(page.getByRole('link', { name: /view details/i }).first()).toBeVisible();
  const apiFiltered = await request.get(`/api/deals?search=${encodeURIComponent(term)}`);
  const filtered = (await apiFiltered.json()) as Array<{ id: number }>;
  await expect(page.getByRole('link', { name: /view details/i })).toHaveCount(filtered.length);

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
  page,
  request,
}) => {
  const { confidential } = await findConfidentialDeal(request);
  const requesterName = `E2E Tester ${unique()}`;

  // Request access from the deal detail page
  await page.goto(`/demo/deals/${confidential.id}`);
  await page.locator('#req-name').fill(requesterName);
  await page.locator('#req-company').fill('E2E Capital Partners');
  await page.locator('#req-message').fill('Automated end-to-end verification');
  await page.getByRole('button', { name: /request access/i }).click();
  await expect(page.getByText('Request Pending')).toBeVisible();

  // Backend recorded the request as pending
  const listRes = await request.get('/api/access-requests');
  const requests = (await listRes.json()) as Array<{
    id: number;
    requesterName: string;
    status: string;
  }>;
  const created = requests.find((r) => r.requesterName === requesterName);
  expect(created).toBeTruthy();
  expect(created!.status).toBe('pending');

  // Advance the lifecycle through the broker UI
  await page.goto('/demo/access-requests');
  const requestCard = page
    .getByText(requesterName)
    .locator('xpath=ancestor::*[contains(@class, "overflow-hidden")][1]')
    .first();

  await requestCard.getByRole('button', { name: /approve request/i }).click();
  await requestCard.getByRole('button', { name: /send digital nda/i }).click();
  await requestCard.getByRole('button', { name: /mark as signed/i }).click();
  await expect(requestCard.getByText('Access Granted')).toBeVisible();

  // Backend reflects the final status
  const finalRes = await request.get('/api/access-requests');
  const finalRequests = (await finalRes.json()) as Array<{ id: number; status: string }>;
  const finalReq = finalRequests.find((r) => r.id === created!.id);
  expect(finalReq?.status).toBe('nda_signed');
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
