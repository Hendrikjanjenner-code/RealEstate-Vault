/**
 * Trust score:
 *  1. Professionals directory returns server-computed trustScore/trustTier and
 *     the trust report marks self-claimed signals as unconfirmed with a small
 *     max weight.
 *  2. Verified platform evidence (completed engagements) raises the score;
 *     the score is derived server-side and not caller-settable.
 *  3. Seeded reviews never count for real (non-demo) profiles.
 *  4. The trust badge with breakdown is visible in the directory UI.
 */
import crypto from 'node:crypto';
import { test, expect, request as pwRequest } from '@playwright/test';
import {
  db,
  usersTable,
  sessionsTable,
  brokersTable,
  dealsTable,
  brokerConnectionsTable,
  professionalEngagementsTable,
  professionalReviewsTable,
} from '@workspace/db';
import { eq } from 'drizzle-orm';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:80';

async function sessionFor(role: 'broker' | 'investor'): Promise<{ id: string; sid: string }> {
  const id = `e2e-trust-${role}-${crypto.randomUUID()}`;
  await db.insert(usersTable).values({ id, email: `${id}@example.com`, firstName: 'E2E', lastName: 'Trust', role });
  const sid = crypto.randomBytes(32).toString('hex');
  await db.insert(sessionsTable).values({
    sid,
    sess: { user: { id, email: `${id}@example.com`, firstName: 'E2E', lastName: 'Trust', profileImageUrl: null, role }, access_token: 'e2e-test' },
    expire: new Date(Date.now() + 60 * 60 * 1000),
  });
  return { id, sid };
}

const auth = (sid: string) => ({ Authorization: `Bearer ${sid}` });

test('directory exposes trust score and report marks self-claims unconfirmed', async () => {
  const viewer = await sessionFor('investor');
  const api = await pwRequest.newContext({ baseURL: BASE });

  const listRes = await api.get('/api/professionals', { headers: auth(viewer.sid) });
  expect(listRes.status()).toBe(200);
  const professionals = await listRes.json();
  expect(professionals.length).toBeGreaterThan(0);
  for (const p of professionals) {
    expect(typeof p.trustScore).toBe('number');
    expect(['new', 'developing', 'established']).toContain(p.trustTier);
  }

  const first = professionals[0];
  const reportRes = await api.get(`/api/professionals/${first.id}/trust`, { headers: auth(viewer.sid) });
  expect(reportRes.status()).toBe(200);
  const report = await reportRes.json();
  expect(report.score).toBe(first.trustScore);

  const selfClaimed = report.signals.find((s: { key: string }) => s.key === 'self_claimed');
  expect(selfClaimed).toBeTruthy();
  expect(selfClaimed.confirmed).toBe(false);
  // Self-claims weigh light: at most 10 of 100 points.
  expect(selfClaimed.maxPoints).toBeLessThanOrEqual(10);
  const confirmedMax = report.signals
    .filter((s: { confirmed: boolean }) => s.confirmed)
    .reduce((sum: number, s: { maxPoints: number }) => sum + s.maxPoints, 0);
  expect(confirmedMax).toBeGreaterThan(selfClaimed.maxPoints * 5);

  // The total is the sum of the signal points — nothing injected client-side.
  const total = report.signals.reduce((sum: number, s: { points: number }) => sum + s.points, 0);
  expect(Math.abs(total - report.score)).toBeLessThan(0.5);
});

test('completed engagements raise the score; seeded reviews never count for real profiles', async () => {
  const viewer = await sessionFor('investor');
  const owner = await sessionFor('broker');
  const api = await pwRequest.newContext({ baseURL: BASE });

  // A real (non-demo) profile with inflated self-claims.
  const [profile] = await db.insert(brokersTable).values({
    userId: owner.id,
    isDemo: false,
    name: 'E2E Trust Broker',
    company: 'E2E Capital',
    title: 'Partner',
    city: 'Amsterdam',
    country: 'Netherlands',
    closedDeals: 500,
    transactionVolume: 9_000_000_000,
    yearsExperience: 40,
  } as never).returning({ id: brokersTable.id });
  const [deal] = await db
    .select({ id: dealsTable.id })
    .from(dealsTable)
    .limit(1);
  if (!deal) throw new Error('No seeded deal found');

  const engagementIds: number[] = [];
  let seededReviewId: number | null = null;
  try {
    const before = await (await api.get(`/api/professionals/${profile.id}/trust`, { headers: auth(viewer.sid) })).json();

    // A seeded "editorial" review on a REAL profile must not count.
    const [review] = await db.insert(professionalReviewsTable).values({
      professionalId: profile.id,
      reviewerName: 'Fake Seeder',
      source: 'seeded',
      verifiedEngagement: true,
      ratingExpertise: 10, ratingCommunication: 10, ratingSpeed: 10, ratingQuality: 10,
      ratingProfessionalism: 10, ratingDealUnderstanding: 10, ratingOverall: 10,
    } as never).returning({ id: professionalReviewsTable.id });
    seededReviewId = review.id;

    const afterSeededReview = await (await api.get(`/api/professionals/${profile.id}/trust`, { headers: auth(viewer.sid) })).json();
    const reviewsBefore = before.signals.find((s: { key: string }) => s.key === 'verified_reviews');
    const reviewsAfter = afterSeededReview.signals.find((s: { key: string }) => s.key === 'verified_reviews');
    expect(reviewsAfter.points).toBe(reviewsBefore.points);

    // Real, completed engagements DO raise the score.
    // Unique index is (dealId, role, professionalId) — vary the role.
    const roles = ['legal_advisors', 'tax_advisors', 'valuers'];
    for (const role of roles) {
      const [e] = await db.insert(professionalEngagementsTable).values({
        dealId: deal.id,
        professionalId: profile.id,
        role,
        invitedByUserId: owner.id,
        invitedByName: 'E2E',
        status: 'completed',
      } as never).returning({ id: professionalEngagementsTable.id });
      engagementIds.push(e.id);
    }
    const after = await (await api.get(`/api/professionals/${profile.id}/trust`, { headers: auth(viewer.sid) })).json();
    expect(after.score).toBeGreaterThan(before.score);
    const engagements = after.signals.find((s: { key: string }) => s.key === 'engagements');
    expect(engagements.confirmed).toBe(true);
    expect(engagements.points).toBeGreaterThan(0);

    // Despite absurd self-claims, the unconfirmed contribution stays capped.
    const selfClaimed = after.signals.find((s: { key: string }) => s.key === 'self_claimed');
    expect(selfClaimed.points).toBeLessThanOrEqual(selfClaimed.maxPoints);
    expect(after.isDemo).toBe(false);
  } finally {
    for (const id of engagementIds) {
      await db.delete(professionalEngagementsTable).where(eq(professionalEngagementsTable.id, id));
    }
    if (seededReviewId != null) {
      await db.delete(professionalReviewsTable).where(eq(professionalReviewsTable.id, seededReviewId));
    }
    await db.delete(brokersTable).where(eq(brokersTable.id, profile.id));
  }
});

test('demo-account activity never raises a real profile\'s trust score', async () => {
  const viewer = await sessionFor('investor');
  const owner = await sessionFor('broker');
  const api = await pwRequest.newContext({ baseURL: BASE });

  // Demo counterparty (flagged via users.isDemo).
  const demoId = `demo-e2e-${crypto.randomUUID()}`;
  await db.insert(usersTable).values({
    id: demoId, email: `${demoId}@example.com`, firstName: 'Demo', lastName: 'Counterparty',
    role: 'investor', isDemo: true,
  } as never);

  const [profile] = await db.insert(brokersTable).values({
    userId: owner.id,
    isDemo: false,
    name: 'E2E Real Broker',
    company: 'E2E Real Capital',
    title: 'Partner',
    city: 'Rotterdam',
    country: 'Netherlands',
  } as never).returning({ id: brokersTable.id });
  const [deal] = await db.select({ id: dealsTable.id }).from(dealsTable).limit(1);

  let connectionId: number | null = null;
  let engagementId: number | null = null;
  let reviewId: number | null = null;
  try {
    const before = await (await api.get(`/api/professionals/${profile.id}/trust`, { headers: auth(viewer.sid) })).json();

    // Demo-owned accepted connection.
    const [conn] = await db.insert(brokerConnectionsTable).values({
      ownerUserId: demoId,
      ownerName: 'Demo Counterparty',
      ownerCompany: 'Demo Fund',
      message: 'Demo connection request',
      brokerId: profile.id,
      status: 'accepted',
    } as never).returning({ id: brokerConnectionsTable.id });
    connectionId = conn.id;

    // Demo-invited completed engagement.
    const [eng] = await db.insert(professionalEngagementsTable).values({
      dealId: deal.id,
      professionalId: profile.id,
      role: 'notaries',
      invitedByUserId: demoId,
      invitedByName: 'Demo',
      status: 'completed',
    } as never).returning({ id: professionalEngagementsTable.id });
    engagementId = eng.id;

    // Connection review written by the demo account.
    const [rev] = await db.insert(professionalReviewsTable).values({
      professionalId: profile.id,
      reviewerName: 'Demo Counterparty',
      reviewerUserId: demoId,
      connectionId: conn.id,
      source: 'connection',
      verifiedEngagement: true,
      ratingExpertise: 10, ratingCommunication: 10, ratingSpeed: 10, ratingQuality: 10,
      ratingProfessionalism: 10, ratingDealUnderstanding: 10, ratingOverall: 10,
    } as never).returning({ id: professionalReviewsTable.id });
    reviewId = rev.id;

    const after = await (await api.get(`/api/professionals/${profile.id}/trust`, { headers: auth(viewer.sid) })).json();
    expect(after.score).toBe(before.score);
    for (const key of ['connections', 'engagements', 'verified_reviews']) {
      const b = before.signals.find((s: { key: string }) => s.key === key);
      const a = after.signals.find((s: { key: string }) => s.key === key);
      expect(a.points).toBe(b.points);
    }
  } finally {
    if (reviewId != null) await db.delete(professionalReviewsTable).where(eq(professionalReviewsTable.id, reviewId));
    if (engagementId != null) await db.delete(professionalEngagementsTable).where(eq(professionalEngagementsTable.id, engagementId));
    if (connectionId != null) await db.delete(brokerConnectionsTable).where(eq(brokerConnectionsTable.id, connectionId));
    await db.delete(brokersTable).where(eq(brokersTable.id, profile.id));
    await db.delete(usersTable).where(eq(usersTable.id, demoId));
  }
});

test('trust badge with breakdown is visible in the professionals directory', async ({ page }) => {
  await page.goto(`${BASE}/api/demo-login?as=investor&returnTo=/demo/professionals`);
  const badge = page.locator('[data-testid^="badge-trust-"]').first();
  await expect(badge).toBeVisible();
  await badge.click();
  const popover = page.locator('[data-testid^="popover-trust-"]');
  await expect(popover).toBeVisible();
  await expect(popover.getByText('Self-reported track record')).toBeVisible();
  await expect(popover.getByText('Unconfirmed', { exact: true }).first()).toBeVisible();
});
