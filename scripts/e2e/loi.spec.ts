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
  loiCountersTable,
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

test('counterproposal lifecycle: manager-only issue, verbatim versions, investor accept/withdraw', async () => {
  const manager = await sessionFor('broker');
  const investor = await sessionFor('investor');
  const otherBroker = await sessionFor('broker');
  const api = await pwRequest.newContext({ baseURL: BASE });

  const [deal] = await db.insert(dealsTable).values({
    title: `E2E Counter Hotel ${Date.now()}`,
    dealType: 'hotel',
    assetClass: 'Hospitality',
    country: 'Netherlands',
    city: 'Delft',
    currency: 'EUR',
    askingPrice: 10_000_000,
    confidential: true,
    brokerUserId: manager.id,
    brokerName: 'E2E Manager',
    brokerCompany: 'E2E Brokerage',
  } as never).returning({ id: dealsTable.id });
  const [request] = await db.insert(accessRequestsTable).values({
    dealId: deal.id,
    dealTitle: 'E2E Counter Hotel',
    requesterUserId: investor.id,
    requesterName: 'Cora Investor',
    requesterCompany: 'Cora Capital',
    status: 'nda_signed',
    signerName: 'Cora Investor',
    signedAt: new Date(),
  } as never).returning({ id: accessRequestsTable.id });

  try {
    // Investor submits an LOI.
    const loi = await (await api.post(`/api/deals/${deal.id}/lois`, {
      headers: auth(investor.sid),
      data: { offerPrice: 9_000_000, conditions: 'Subject to financing', exclusivityDays: 45, validityDays: 14 },
    })).json();
    const originalText = loi.documentText.join('\n');

    const counterBody = { offerPrice: 9_600_000, conditions: 'No financing condition', exclusivityDays: 30, validityDays: 10 };
    // Strict manager check: another broker (any-broker fallback) and the investor get 403.
    expect((await api.post(`/api/lois/${loi.id}/counter`, { headers: auth(otherBroker.sid), data: counterBody })).status()).toBe(403);
    expect((await api.post(`/api/lois/${loi.id}/counter`, { headers: auth(investor.sid), data: counterBody })).status()).toBe(403);

    // Manager issues a counter; LOI moves to countered.
    const counterRes = await api.post(`/api/lois/${loi.id}/counter`, { headers: auth(manager.sid), data: counterBody });
    expect(counterRes.status()).toBe(201);
    const counter1 = await counterRes.json();
    expect(counter1.status).toBe('proposed');
    expect(counter1.documentText.join('\n')).toContain('EUR 9,600,000');
    expect(counter1.documentText.join('\n')).toContain('No financing condition');

    // Investor was notified of the counter.
    const counterNotes = await db.select().from(notificationsTable).where(
      and(eq(notificationsTable.userId, investor.id), eq(notificationsTable.type, 'loi_countered')),
    );
    expect(counterNotes.length).toBe(1);

    // A second counter supersedes the first.
    const counter2 = await (await api.post(`/api/lois/${loi.id}/counter`, {
      headers: auth(manager.sid),
      data: { offerPrice: 9_400_000, exclusivityDays: 35, validityDays: 12 },
    })).json();
    const investorView = await (await api.get(`/api/deals/${deal.id}/lois`, { headers: auth(investor.sid) })).json();
    expect(investorView.lois[0].status).toBe('countered');
    const history = investorView.lois[0].counters;
    expect(history.length).toBe(2);
    expect(history.find((c: { id: number }) => c.id === counter1.id).status).toBe('superseded');
    expect(history.find((c: { id: number }) => c.id === counter2.id).status).toBe('proposed');

    // A countered LOI is still open: the investor cannot submit a second one.
    expect((await api.post(`/api/deals/${deal.id}/lois`, {
      headers: auth(investor.sid),
      data: { offerPrice: 8_000_000, exclusivityDays: 30, validityDays: 14 },
    })).status()).toBe(409);
    // ...and the DATABASE itself enforces it: a direct insert that bypasses
    // the application's read-before-insert check hits the partial unique
    // index (which counts countered as open).
    const directInsert = await db.insert(loisTable).values({
      dealId: deal.id,
      investorUserId: investor.id,
      investorName: 'Cora Investor',
      investorCompany: 'Cora Capital',
      documentText: '[]',
      offerPrice: 1,
      currency: 'EUR',
      exclusivityDays: 10,
      validityDays: 10,
      status: 'submitted',
    } as never).then(() => null, (err: Error & { cause?: Error }) => `${err.message} ${err.cause?.message ?? ''}`);
    expect(directInsert).toMatch(/lois_open_per_investor_idx|duplicate key/);

    // Only the LOI's investor may respond; superseded counters are closed.
    expect((await api.post(`/api/loi-counters/${counter2.id}/respond`, { headers: auth(manager.sid), data: { action: 'accept' } })).status()).toBe(403);
    expect((await api.post(`/api/loi-counters/${counter1.id}/respond`, { headers: auth(investor.sid), data: { action: 'accept' } })).status()).toBe(409);

    // Investor accepts the open counter → counter accepted, LOI accepted.
    const acceptRes = await api.post(`/api/loi-counters/${counter2.id}/respond`, { headers: auth(investor.sid), data: { action: 'accept' } });
    expect(acceptRes.status()).toBe(200);
    expect((await acceptRes.json()).status).toBe('accepted');
    const afterAccept = await (await api.get(`/api/deals/${deal.id}/lois`, { headers: auth(manager.sid) })).json();
    expect(afterAccept.lois[0].status).toBe('accepted');
    // Verbatim preservation: the original LOI text and both counter texts are unchanged.
    expect(afterAccept.lois[0].documentText.join('\n')).toBe(originalText);
    const storedCounters = await db.select().from(loiCountersTable).where(eq(loiCountersTable.loiId, loi.id));
    expect(JSON.parse(storedCounters.find((c) => c.id === counter1.id)!.documentText)).toEqual(counter1.documentText);
    expect(JSON.parse(storedCounters.find((c) => c.id === counter2.id)!.documentText)).toEqual(counter2.documentText);

    // Manager was notified of the acceptance.
    const managerNotes = await db.select().from(notificationsTable).where(
      and(eq(notificationsTable.userId, manager.id), eq(notificationsTable.type, 'loi_counter_response')),
    );
    expect(managerNotes.length).toBe(1);

    // Decided LOIs cannot be countered, and closed counters cannot be re-responded.
    expect((await api.post(`/api/lois/${loi.id}/counter`, { headers: auth(manager.sid), data: counterBody })).status()).toBe(409);
    expect((await api.post(`/api/loi-counters/${counter2.id}/respond`, { headers: auth(investor.sid), data: { action: 'withdraw' } })).status()).toBe(409);
  } finally {
    await db.delete(loiCountersTable).where(eq(loiCountersTable.loiId,
      (await db.select({ id: loisTable.id }).from(loisTable).where(eq(loisTable.dealId, deal.id)))[0]?.id ?? -1));
    await db.delete(loisTable).where(eq(loisTable.dealId, deal.id));
    await db.delete(accessRequestsTable).where(eq(accessRequestsTable.id, request.id));
    await db.delete(notificationsTable).where(eq(notificationsTable.userId, manager.id));
    await db.delete(notificationsTable).where(eq(notificationsTable.userId, investor.id));
    await db.delete(dealsTable).where(eq(dealsTable.id, deal.id));
  }
});

test('investor can withdraw their LOI in response to a counter', async () => {
  const manager = await sessionFor('broker');
  const investor = await sessionFor('investor');
  const api = await pwRequest.newContext({ baseURL: BASE });
  const [deal] = await db.insert(dealsTable).values({
    title: `E2E Withdraw Hotel ${Date.now()}`,
    dealType: 'hotel',
    assetClass: 'Hospitality',
    country: 'Netherlands',
    city: 'Gouda',
    currency: 'EUR',
    askingPrice: 5_000_000,
    confidential: true,
    brokerUserId: manager.id,
    brokerName: 'E2E Manager',
    brokerCompany: 'E2E Brokerage',
  } as never).returning({ id: dealsTable.id });
  const [request] = await db.insert(accessRequestsTable).values({
    dealId: deal.id,
    dealTitle: 'E2E Withdraw Hotel',
    requesterUserId: investor.id,
    requesterName: 'Wilma Investor',
    requesterCompany: 'Wilma Capital',
    status: 'nda_signed',
    signerName: 'Wilma Investor',
    signedAt: new Date(),
  } as never).returning({ id: accessRequestsTable.id });
  try {
    const loi = await (await api.post(`/api/deals/${deal.id}/lois`, {
      headers: auth(investor.sid),
      data: { offerPrice: 4_500_000, exclusivityDays: 30, validityDays: 14 },
    })).json();
    const counter = await (await api.post(`/api/lois/${loi.id}/counter`, {
      headers: auth(manager.sid),
      data: { offerPrice: 4_800_000, exclusivityDays: 21, validityDays: 7 },
    })).json();
    const res = await api.post(`/api/loi-counters/${counter.id}/respond`, { headers: auth(investor.sid), data: { action: 'withdraw' } });
    expect(res.status()).toBe(200);
    expect((await res.json()).status).toBe('withdrawn');
    const view = await (await api.get(`/api/deals/${deal.id}/lois`, { headers: auth(manager.sid) })).json();
    expect(view.lois[0].status).toBe('withdrawn');
    // A withdrawn LOI frees the investor to submit a new one.
    const secondRes = await api.post(`/api/deals/${deal.id}/lois`, {
      headers: auth(investor.sid),
      data: { offerPrice: 4_600_000, exclusivityDays: 30, validityDays: 14 },
    });
    expect(secondRes.status()).toBe(201);
    const secondLoi = await secondRes.json();

    // Manager counters the new LOI, then rejects it outright: the rejection
    // must also close the still-proposed counter.
    const counter2 = await (await api.post(`/api/lois/${secondLoi.id}/counter`, {
      headers: auth(manager.sid),
      data: { offerPrice: 4_900_000, exclusivityDays: 21, validityDays: 7 },
    })).json();
    expect((await api.patch(`/api/lois/${secondLoi.id}`, { headers: auth(manager.sid), data: { status: 'rejected' } })).status()).toBe(200);
    const [storedCounter] = await db.select().from(loiCountersTable).where(eq(loiCountersTable.id, counter2.id));
    expect(storedCounter.status).toBe('superseded');
    expect(storedCounter.respondedAt).toBeTruthy();
    // And the closed counter can no longer be accepted.
    expect((await api.post(`/api/loi-counters/${counter2.id}/respond`, { headers: auth(investor.sid), data: { action: 'accept' } })).status()).toBe(409);
  } finally {
    const loiIds = (await db.select({ id: loisTable.id }).from(loisTable).where(eq(loisTable.dealId, deal.id))).map((r) => r.id);
    for (const id of loiIds) await db.delete(loiCountersTable).where(eq(loiCountersTable.loiId, id));
    await db.delete(loisTable).where(eq(loisTable.dealId, deal.id));
    await db.delete(accessRequestsTable).where(eq(accessRequestsTable.id, request.id));
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
