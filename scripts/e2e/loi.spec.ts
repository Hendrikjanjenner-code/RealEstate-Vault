/**
 * Letter of Intent:
 *  1. LOI draft & submission are only available after the NDA is signed (403 before).
 *  2. Submission stores the LOI text verbatim; the record HTML reproduces it
 *     and stays unchanged through status transitions.
 *  3. Only the deal manager can review; unauthorized users get 403 on
 *     transitions and on other investors' records.
 *  4. Manager + investor notifications fire on submit and status change.
 */
import crypto from 'node:crypto';
import { test, expect, request as pwRequest } from '@playwright/test';
import {
  db,
  dealsTable,
  usersTable,
  sessionsTable,
  accessRequestsTable,
  loisTable,
  notificationsTable,
} from '@workspace/db';
import { eq, and } from 'drizzle-orm';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:80';
const auth = (sid: string) => ({ Authorization: `Bearer ${sid}` });

async function sessionFor(role: 'broker' | 'investor'): Promise<{ id: string; sid: string }> {
  const id = `e2e-loi-${role}-${crypto.randomUUID()}`;
  await db.insert(usersTable).values({ id, email: `${id}@example.com`, firstName: 'E2E', lastName: 'Loi', role });
  const sid = crypto.randomBytes(32).toString('hex');
  await db.insert(sessionsTable).values({
    sid,
    sess: { user: { id, email: `${id}@example.com`, firstName: 'E2E', lastName: 'Loi', profileImageUrl: null, role }, access_token: 'e2e-test' },
    expire: new Date(Date.now() + 60 * 60 * 1000),
  });
  return { id, sid };
}

test('full LOI lifecycle: gated by NDA, verbatim text, manager review, notifications', async () => {
  const manager = await sessionFor('broker');
  const investor = await sessionFor('investor');
  const stranger = await sessionFor('investor');
  const api = await pwRequest.newContext({ baseURL: BASE });

  // Confidential deal owned by the manager.
  const [deal] = await db.insert(dealsTable).values({
    title: `E2E LOI Hotel ${Date.now()}`,
    dealType: 'hotel',
    assetClass: 'Hospitality',
    country: 'Netherlands',
    city: 'Utrecht',
    currency: 'EUR',
    askingPrice: 12_500_000,
    confidential: true,
    brokerUserId: manager.id,
    brokerName: 'E2E Manager',
    brokerCompany: 'E2E Brokerage',
  } as never).returning({ id: dealsTable.id });

  let requestId: number | null = null;
  let loiId: number | null = null;
  try {
    // 1. Before NDA: draft and submit are forbidden.
    expect((await api.get(`/api/deals/${deal.id}/loi-draft`, { headers: auth(investor.sid) })).status()).toBe(403);
    expect((await api.post(`/api/deals/${deal.id}/lois`, {
      headers: auth(investor.sid),
      data: { offerPrice: 11_000_000, exclusivityDays: 30, validityDays: 14 },
    })).status()).toBe(403);

    // Signed NDA access request for the investor.
    const [request] = await db.insert(accessRequestsTable).values({
      dealId: deal.id,
      dealTitle: 'E2E LOI Hotel',
      requesterUserId: investor.id,
      requesterName: 'Eva Investor',
      requesterCompany: 'Eva Capital',
      status: 'nda_signed',
      signerName: 'Eva Investor',
      signedAt: new Date(),
    } as never).returning({ id: accessRequestsTable.id });
    requestId = request.id;

    // 2. Draft now available, pre-filled with deal facts and placeholders.
    const draftRes = await api.get(`/api/deals/${deal.id}/loi-draft`, { headers: auth(investor.sid) });
    expect(draftRes.status()).toBe(200);
    const draft = await draftRes.json();
    expect(draft.paragraphs.join(' ')).toContain('Utrecht');
    expect(draft.paragraphs.join(' ')).toContain('Eva Capital');
    expect(draft.paragraphs.join(' ')).toContain('[offer price]');

    // Submit.
    const submitRes = await api.post(`/api/deals/${deal.id}/lois`, {
      headers: auth(investor.sid),
      data: { offerPrice: 11_750_000, conditions: 'Subject to board approval', exclusivityDays: 30, validityDays: 21 },
    });
    expect(submitRes.status()).toBe(201);
    const loi = await submitRes.json();
    loiId = loi.id;
    expect(loi.status).toBe('submitted');
    const submittedText = loi.documentText.join('\n');
    expect(submittedText).toContain('EUR 11,750,000');
    expect(submittedText).toContain('Subject to board approval');
    expect(submittedText).not.toContain('[offer price]');

    // Duplicate open LOI is rejected.
    expect((await api.post(`/api/deals/${deal.id}/lois`, {
      headers: auth(investor.sid),
      data: { offerPrice: 1, exclusivityDays: 10, validityDays: 10 },
    })).status()).toBe(409);

    // Manager was notified.
    const managerNote = await db.select().from(notificationsTable).where(
      and(eq(notificationsTable.userId, manager.id), eq(notificationsTable.type, 'loi_submitted')),
    );
    expect(managerNote.length).toBe(1);

    // 3. Authz: stranger cannot list manager-view, see record, or transition.
    const strangerList = await (await api.get(`/api/deals/${deal.id}/lois`, { headers: auth(stranger.sid) })).json();
    expect(strangerList.canManage).toBe(false);
    expect(strangerList.lois.length).toBe(0);
    expect((await api.get(`/api/lois/${loi.id}/record`, { headers: auth(stranger.sid) })).status()).toBe(403);
    expect((await api.patch(`/api/lois/${loi.id}`, { headers: auth(stranger.sid), data: { status: 'accepted' } })).status()).toBe(403);
    // The investor cannot review their own LOI either.
    expect((await api.patch(`/api/lois/${loi.id}`, { headers: auth(investor.sid), data: { status: 'accepted' } })).status()).toBe(403);

    // Manager sees it and moves it through review.
    const managerList = await (await api.get(`/api/deals/${deal.id}/lois`, { headers: auth(manager.sid) })).json();
    expect(managerList.canManage).toBe(true);
    expect(managerList.lois.length).toBe(1);

    expect((await api.patch(`/api/lois/${loi.id}`, { headers: auth(manager.sid), data: { status: 'under_review' } })).status()).toBe(200);
    const accepted = await (await api.patch(`/api/lois/${loi.id}`, { headers: auth(manager.sid), data: { status: 'accepted' } })).json();
    expect(accepted.status).toBe('accepted');
    expect(accepted.decidedAt).toBeTruthy();
    // No transitions out of a decided state.
    expect((await api.patch(`/api/lois/${loi.id}`, { headers: auth(manager.sid), data: { status: 'rejected' } })).status()).toBe(409);

    // Investor was notified of the status change.
    const investorNotes = await db.select().from(notificationsTable).where(
      and(eq(notificationsTable.userId, investor.id), eq(notificationsTable.type, 'loi_status')),
    );
    expect(investorNotes.length).toBeGreaterThanOrEqual(2);

    // 4. Verbatim preservation: record HTML reproduces the submitted text
    // exactly, even after status changes.
    const recordRes = await api.get(`/api/lois/${loi.id}/record`, { headers: auth(investor.sid) });
    expect(recordRes.status()).toBe(200);
    const html = await recordRes.text();
    expect(html).toContain('EUR 11,750,000');
    expect(html).toContain('Subject to board approval');
    const [stored] = await db.select().from(loisTable).where(eq(loisTable.id, loi.id));
    expect(JSON.parse(stored.documentText)).toEqual(loi.documentText);
    // Manager can also open the record.
    expect((await api.get(`/api/lois/${loi.id}/record?download=1`, { headers: auth(manager.sid) })).status()).toBe(200);
  } finally {
    if (loiId != null) await db.delete(loisTable).where(eq(loisTable.id, loiId));
    if (requestId != null) await db.delete(accessRequestsTable).where(eq(accessRequestsTable.id, requestId));
    await db.delete(notificationsTable).where(eq(notificationsTable.userId, manager.id));
    await db.delete(notificationsTable).where(eq(notificationsTable.userId, investor.id));
    await db.delete(dealsTable).where(eq(dealsTable.id, deal.id));
  }
});

test('deal page shows the Prepare LOI step after NDA signature', async ({ browser, baseURL }) => {
  const investor = await sessionFor('investor');
  const manager = await sessionFor('broker');
  const [deal] = await db.insert(dealsTable).values({
    title: `E2E LOI UI Hotel ${Date.now()}`,
    dealType: 'hotel',
    assetClass: 'Hospitality',
    country: 'Netherlands',
    city: 'Leiden',
    currency: 'EUR',
    askingPrice: 8_000_000,
    confidential: true,
    brokerUserId: manager.id,
    brokerName: 'E2E Manager',
    brokerCompany: 'E2E Brokerage',
  } as never).returning({ id: dealsTable.id });
  const [request] = await db.insert(accessRequestsTable).values({
    dealId: deal.id,
    dealTitle: 'E2E LOI UI Hotel',
    requesterUserId: investor.id,
    requesterName: 'Ulla Investor',
    requesterCompany: 'Ulla Capital',
    status: 'nda_signed',
    signerName: 'Ulla Investor',
    signedAt: new Date(),
  } as never).returning({ id: accessRequestsTable.id });

  const ctx = await browser.newContext({ baseURL: baseURL ?? BASE });
  await ctx.addCookies([{ name: 'sid', value: investor.sid, url: baseURL ?? BASE }]);
  const page = await ctx.newPage();
  try {
    await page.goto(`/demo/deals/${deal.id}`);
    await expect(page.getByTestId('panel-loi')).toBeVisible();
    await page.getByTestId('button-prepare-loi').click();
    await expect(page.getByTestId('form-loi')).toBeVisible();
    await expect(page.getByText('Ulla Capital').first()).toBeVisible();
    await page.getByTestId('input-loi-offer').fill('7500000');
    await page.getByTestId('button-submit-loi').click();
    await expect(page.getByTestId('card-my-loi')).toBeVisible();
    await expect(page.getByTestId('badge-loi-status-submitted')).toBeVisible();
  } finally {
    await ctx.close();
    await db.delete(loisTable).where(eq(loisTable.dealId, deal.id));
    await db.delete(accessRequestsTable).where(eq(accessRequestsTable.id, request.id));
    await db.delete(notificationsTable).where(eq(notificationsTable.userId, manager.id));
    await db.delete(dealsTable).where(eq(dealsTable.id, deal.id));
  }
});
