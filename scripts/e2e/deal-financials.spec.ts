/**
 * Deal financials & financing UI:
 *  1. A granted investor sees historical figures, trend charts and the
 *     financial history table on the Financials tab.
 *  2. The Financing tab shows the readiness score (with disclaimer), lets
 *     the investor create a scenario and shows computed LTV/DSCR/Debt Yield.
 *  3. A basic (non-granted) viewer sees the locked notice instead of figures.
 */
import crypto from 'node:crypto';
import { test, expect, request as pwRequest } from '@playwright/test';
import { db, dealsTable, usersTable, sessionsTable, financingScenariosTable } from '@workspace/db';
import { eq, inArray } from 'drizzle-orm';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:80';

async function sessionFor(role: 'broker' | 'investor'): Promise<{ id: string; sid: string }> {
  const id = `e2e-fin-${role}-${crypto.randomUUID()}`;
  await db.insert(usersTable).values({ id, email: `${id}@example.com`, firstName: 'E2E', lastName: 'Fin', role });
  const sid = crypto.randomBytes(32).toString('hex');
  await db.insert(sessionsTable).values({
    sid,
    sess: { user: { id, email: `${id}@example.com`, firstName: 'E2E', lastName: 'Fin', profileImageUrl: null, role }, access_token: 'e2e-test' },
    expire: new Date(Date.now() + 60 * 60 * 1000),
  });
  return { id, sid };
}

async function grantedDealId(): Promise<number> {
  const [deal] = await db
    .select({ id: dealsTable.id })
    .from(dealsTable)
    .where(eq(dealsTable.title, 'Canal House Boutique Hotel'));
  if (!deal) throw new Error('Seeded Canal House deal not found — run the seed first.');
  return deal.id;
}

test('granted investor sees financial history and charts', async ({ page }) => {
  const dealId = await grantedDealId();
  await page.goto(`${BASE}/api/demo-login?as=investor&returnTo=/demo/deals/${dealId}`);
  await page.getByRole('button', { name: 'Financials' }).click();
  await expect(page.getByTestId('table-financial-history')).toBeVisible();
  // Latest-year metric cards
  await expect(page.getByText('EBITDA', { exact: true }).first()).toBeVisible();
  // Hotel KPIs present for a hotel deal
  await expect(page.getByText('RevPAR').first()).toBeVisible();
  // A chart rendered (recharts svg)
  await expect(page.locator('.recharts-surface').first()).toBeVisible();
});

test('granted investor models a financing scenario and sees readiness', async ({ page }) => {
  const dealId = await grantedDealId();
  await page.goto(`${BASE}/api/demo-login?as=investor&returnTo=/demo/deals/${dealId}`);
  await page.getByRole('button', { name: 'Financing' }).click();

  await expect(page.getByTestId('panel-readiness')).toBeVisible();
  await expect(page.getByTestId('text-readiness-disclaimer')).toContainText('NOT a guarantee');

  await page.getByTestId('btn-new-scenario').click();
  await page.getByTestId('input-scenario-name').fill('E2E Base Case');
  await page.getByTestId('input-scenario-purchasePrice').fill('38500000');
  await page.getByTestId('input-scenario-equity').fill('15500000');
  await page.getByTestId('input-scenario-debtAmount').fill('23000000');
  await page.getByTestId('input-scenario-interestRatePct').fill('4.2');
  await page.getByTestId('input-scenario-amortizationYears').fill('25');
  await page.getByTestId('input-scenario-termYears').fill('7');
  await page.getByTestId('btn-save-scenario').click();

  const card = page.locator('[data-testid^="card-scenario-"]', { hasText: 'E2E Base Case' });
  await expect(card).toBeVisible();
  await expect(card).toContainText('LTV');
  await expect(card).toContainText('59.7%');
  await expect(card).toContainText('DSCR');
  await expect(card).toContainText('historical');

  // Cleanup the scenario row
  await db
    .delete(financingScenariosTable)
    .where(eq(financingScenariosTable.name, 'E2E Base Case'));
});

test('unassigned confidential deal does not fall back to any-broker manager access', async () => {
  const dealId = await grantedDealId();
  const [prev] = await db.select({ brokerUserId: dealsTable.brokerUserId }).from(dealsTable).where(eq(dealsTable.id, dealId));
  const broker = await sessionFor('broker');
  const ctx = await pwRequest.newContext({ baseURL: BASE, extraHTTPHeaders: { Authorization: `Bearer ${broker.sid}` } });
  try {
    // Temporarily un-assign the deal: a random broker must still be denied.
    await db.update(dealsTable).set({ brokerUserId: null }).where(eq(dealsTable.id, dealId));
    expect((await ctx.get(`/api/deals/${dealId}/financials`)).status()).toBe(403);
    expect((await ctx.get(`/api/deals/${dealId}/financing/readiness`)).status()).toBe(403);
    expect((await ctx.post(`/api/deals/${dealId}/financing/pack`)).status()).toBe(403);
    expect((await ctx.put(`/api/deals/${dealId}/financials`, { data: { years: [] } })).status()).toBe(403);
  } finally {
    await db.update(dealsTable).set({ brokerUserId: prev.brokerUserId }).where(eq(dealsTable.id, dealId));
    await ctx.dispose();
    await db.delete(sessionsTable).where(eq(sessionsTable.sid, broker.sid));
    await db.delete(usersTable).where(inArray(usersTable.id, [broker.id]));
  }
});

test('scenario PATCH/DELETE require current deal access, not just ownership', async () => {
  // Investor without any NDA on the confidential deal: even if a scenario row
  // exists under their name (e.g. created before revocation), PATCH/DELETE
  // must be denied because current access is gone.
  const dealId = await grantedDealId();
  const investor = await sessionFor('investor');
  const [row] = await db
    .insert(financingScenariosTable)
    .values({ dealId, userId: investor.id, name: 'E2E Revoked', purchasePrice: 1000000, equity: 400000, debtAmount: 600000, interestRatePct: 4, amortizationYears: 20, termYears: 5 })
    .returning();
  const ctx = await pwRequest.newContext({ baseURL: BASE, extraHTTPHeaders: { Authorization: `Bearer ${investor.sid}` } });
  try {
    const body = { name: 'X', purchasePrice: 1000000, equity: 400000, debtAmount: 600000, interestRatePct: 4, amortizationYears: 20, termYears: 5 };
    expect((await ctx.patch(`/api/financing/scenarios/${row.id}`, { data: body })).status()).toBe(403);
    expect((await ctx.delete(`/api/financing/scenarios/${row.id}`)).status()).toBe(403);
    expect((await ctx.get(`/api/deals/${dealId}/financing/scenarios`)).status()).toBe(403);
  } finally {
    await ctx.dispose();
    await db.delete(financingScenariosTable).where(eq(financingScenariosTable.id, row.id));
    await db.delete(sessionsTable).where(eq(sessionsTable.sid, investor.sid));
    await db.delete(usersTable).where(eq(usersTable.id, investor.id));
  }
});

test('basic viewer gets a locked notice, not figures', async ({ page }) => {
  const dealId = await grantedDealId();
  // Demo broker is not the deal manager and has no NDA on this confidential deal.
  await page.goto(`${BASE}/api/demo-login?as=broker&returnTo=/demo/deals/${dealId}`);
  await page.getByRole('button', { name: 'Financials' }).click();
  await expect(page.getByTestId('notice-financials-locked')).toBeVisible();
  await page.getByRole('button', { name: 'Financing' }).click();
  await expect(page.getByTestId('notice-financials-locked')).toBeVisible();
});
