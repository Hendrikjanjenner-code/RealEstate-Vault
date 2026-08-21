import crypto from 'node:crypto';
import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test';
import { db, usersTable, sessionsTable, dealsTable, accessRequestsTable } from '@workspace/db';
import { eq, inArray } from 'drizzle-orm';

/**
 * Mobile NDA signing flow (Expo web build):
 * an investor whose access request is nda_sent can review and sign the NDA
 * from the mobile deal screen, which unlocks the data room.
 *
 * The test authenticates through the app's own mechanism: the mobile app
 * stores its session token (from /api/mobile-auth/token-exchange) in
 * localStorage on web / SecureStore on native and sends it as a Bearer
 * header via setAuthTokenGetter. We seed a real DB session and place its
 * sid in localStorage before the app loads (same DB-session pattern as
 * saved-deals.spec.ts; the interactive OIDC login needs real Replit
 * credentials and cannot run headlessly).
 */

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:80';
const EXPO_DOMAIN = process.env.REPLIT_EXPO_DEV_DOMAIN;

interface TestUser {
  id: string;
  sid: string;
}

async function createTestUser(label: string, role: 'investor' | 'broker'): Promise<TestUser> {
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

test('investor signs the NDA from the mobile deal screen', async ({ page }) => {
  test.skip(!EXPO_DOMAIN, 'REPLIT_EXPO_DEV_DOMAIN is not set (Expo dev server not available)');

  const investor = await createTestUser('mobile-investor', 'investor');
  const broker = await createTestUser('mobile-broker', 'broker');
  const investorApi = await apiAs(investor);
  const brokerApi = await apiAs(broker);
  let dealId: number | null = null;

  try {
    // Confidential deal owned by our test broker.
    const [deal] = await db
      .insert(dealsTable)
      .values({
        title: `E2E Mobile NDA Deal ${crypto.randomUUID().slice(0, 8)}`,
        dealType: 'single_asset',
        assetClass: 'Offices',
        country: 'Germany',
        city: 'Berlin',
        confidential: true,
        teaser: 'Prime office asset, details under NDA.',
        askingPrice: 25_000_000,
        brokerUserId: broker.id,
        brokerName: 'E2E Broker',
      })
      .returning({ id: dealsTable.id });
    dealId = deal.id;

    // Investor requests access.
    const reqRes = await investorApi.post(`/api/deals/${dealId}/access-requests`, {
      data: { requesterName: 'E2E Mobile Investor', requesterCompany: 'E2E Capital' },
    });
    expect(reqRes.ok()).toBeTruthy();
    const accessRequest = (await reqRes.json()) as { id: number; status: string };
    expect(accessRequest.status).toBe('pending');

    // Broker advances the request to nda_sent.
    for (const status of ['approved', 'nda_sent']) {
      const patch = await brokerApi.patch(`/api/access-requests/${accessRequest.id}`, {
        data: { status },
      });
      expect(patch.ok(), `broker PATCH -> ${status}`).toBeTruthy();
    }

    // Sign the app in as the investor via its own token storage
    // (auth_session_token in localStorage on web).
    await page.addInitScript((sid) => {
      window.localStorage.setItem('auth_session_token', sid);
    }, investor.sid);

    await page.goto(`https://${EXPO_DOMAIN}/deal/${dealId}`, { waitUntil: 'domcontentloaded' });

    // NDA-ready state with the Review & Sign action.
    const reviewButton = page.getByTestId('button-review-sign-nda');
    await expect(reviewButton).toBeVisible({ timeout: 30_000 });
    await reviewButton.click();

    // NDA form: text, typed name, agreement checkbox.
    await expect(page.getByTestId('form-sign-nda')).toBeVisible();
    await expect(page.getByText('Non-Disclosure Agreement', { exact: false }).first()).toBeVisible();
    await page.getByTestId('input-nda-signer-name').fill('E2E Mobile Investor');
    await page.getByTestId('checkbox-nda-agree').click();
    await page.getByTestId('button-sign-nda').click();

    // Deal access state refreshes to granted.
    await expect(page.getByText('Access granted. Full data room unlocked.')).toBeVisible({
      timeout: 20_000,
    });

    // Backend recorded the signature.
    const finalRes = await investorApi.get('/api/access-requests');
    const finalRequests = (await finalRes.json()) as Array<{
      id: number;
      status: string;
      signerName: string | null;
    }>;
    const finalReq = finalRequests.find((r) => r.id === accessRequest.id);
    expect(finalReq?.status).toBe('nda_signed');
    expect(finalReq?.signerName).toBe('E2E Mobile Investor');
  } finally {
    if (dealId != null) {
      await db.delete(accessRequestsTable).where(eq(accessRequestsTable.dealId, dealId));
      await db.delete(dealsTable).where(eq(dealsTable.id, dealId));
    }
    await db.delete(sessionsTable).where(inArray(sessionsTable.sid, [investor.sid, broker.sid]));
    await db.delete(usersTable).where(inArray(usersTable.id, [investor.id, broker.id]));
    await investorApi.dispose();
    await brokerApi.dispose();
  }
});
