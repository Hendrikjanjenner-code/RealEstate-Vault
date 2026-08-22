import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test';
import crypto from 'node:crypto';
import { db, dealsTable, brokersTable, usersTable } from '@workspace/db';
import { inArray } from 'drizzle-orm';

/**
 * Anonymous public homepage endpoints must stay redacted:
 *  - /api/public/deal-teasers exposes only teaser fields and honours each
 *    listing's locationPrivacy (country_only must hide the region; legacy
 *    values like "district" whose region can be a city/district too).
 *  - No exact title, city, price, or broker identity may ever appear.
 *  - /api/public/stats returns aggregate numbers only.
 */

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:80';

const SECRET_TITLE = 'E2E Secret Tower Frankfurt';
const SECRET_CITY = 'Frankfurt-Secret';
const SECRET_BROKER = 'E2E Secret Broker';

const createdIds: number[] = [];
let api: APIRequestContext;

async function insertDeal(overrides: Partial<typeof dealsTable.$inferInsert>) {
  const [row] = await db
    .insert(dealsTable)
    .values({
      title: SECRET_TITLE,
      dealType: 'sale',
      assetClass: 'Offices',
      country: 'Germany',
      city: SECRET_CITY,
      currency: 'EUR',
      status: 'active',
      confidential: true,
      askingPrice: 42_000_000,
      brokerName: SECRET_BROKER,
      ...overrides,
    })
    .returning({ id: dealsTable.id });
  createdIds.push(row.id);
  return row.id;
}

test.beforeAll(async () => {
  api = await pwRequest.newContext({ baseURL: BASE });
});

test.afterAll(async () => {
  if (createdIds.length) {
    await db.delete(dealsTable).where(inArray(dealsTable.id, createdIds));
  }
  await api.dispose();
});

test('anonymous teasers honour location privacy and hide confidential fields', async () => {
  const countryOnlyId = await insertDeal({
    locationPrivacy: 'country_only',
    region: 'Westend-Sued', // district-level detail — must NOT be published
  });
  const regionOnlyId = await insertDeal({
    locationPrivacy: 'region_only',
    region: 'Hesse',
  });
  const legacyDistrictId = await insertDeal({
    locationPrivacy: 'district', // legacy value; region holds a city district
    region: 'Innenstadt-Secret',
  });
  const noPrivacyId = await insertDeal({
    locationPrivacy: null,
    region: 'Bahnhofsviertel-Secret',
  });

  const res = await api.get('/api/public/deal-teasers?limit=12');
  expect(res.status()).toBe(200);
  const teasers: Array<Record<string, unknown>> = await res.json();
  const byId = new Map(teasers.map((t) => [t.id as number, t]));

  for (const id of [countryOnlyId, regionOnlyId, legacyDistrictId, noPrivacyId]) {
    const t = byId.get(id);
    expect(t, `deal ${id} should appear in teasers`).toBeTruthy();
    // Only the allowed teaser fields — nothing else.
    expect(Object.keys(t!).sort()).toEqual(
      ['assetClass', 'confidential', 'country', 'grossYield', 'id', 'region', 'title', 'valueBand'].sort(),
    );
    // Masked title, coarse value band only.
    expect(t!.title).toBe('Confidential Offices Opportunity');
    expect(t!.valueBand).toBe('€25–50M');
  }

  // country_only, legacy, and unset privacy: region must be withheld.
  expect(byId.get(countryOnlyId)!.region).toBeNull();
  expect(byId.get(legacyDistrictId)!.region).toBeNull();
  expect(byId.get(noPrivacyId)!.region).toBeNull();
  // region_only: the broker-approved region may be shown.
  expect(byId.get(regionOnlyId)!.region).toBe('Hesse');

  // No confidential strings anywhere in the anonymous payload.
  const raw = JSON.stringify(teasers);
  expect(raw).not.toContain(SECRET_TITLE);
  expect(raw).not.toContain(SECRET_CITY);
  expect(raw).not.toContain(SECRET_BROKER);
  expect(raw).not.toContain('42000000');
  expect(raw).not.toContain('Westend-Sued');
  expect(raw).not.toContain('Innenstadt-Secret');
  expect(raw).not.toContain('Bahnhofsviertel-Secret');
});

test('anonymous public stats returns aggregates only', async () => {
  const res = await api.get('/api/public/stats');
  expect(res.status()).toBe(200);
  const stats = await res.json();
  expect(Object.keys(stats).sort()).toEqual(
    ['liveDeals', 'pipelineValue', 'verifiedProfessionals'].sort(),
  );
  expect(typeof stats.pipelineValue).toBe('number');
  expect(stats.liveDeals).toBeGreaterThan(0);
  expect(stats.verifiedProfessionals).toBeGreaterThan(0);
});

test('verified professionals excludes unverified records and never double-counts linked identities', async () => {
  const getCount = async () =>
    (await (await api.get('/api/public/stats')).json()).verifiedProfessionals as number;

  const uid = `e2e-stats-${crypto.randomUUID()}`;
  const brokerIds: number[] = [];
  try {
    const baseline = await getCount();

    // A registered user with a role counts once.
    await db.insert(usersTable).values({ id: uid, email: `${uid}@example.com`, role: 'broker' });
    expect(await getCount()).toBe(baseline + 1);

    // Linking that same user to a VERIFIED broker profile must not
    // double-count: still baseline + 1.
    const [linked] = await db
      .insert(brokersTable)
      .values({ userId: uid, name: 'E2E Verified', company: 'E2E', title: 'Broker', city: 'X', country: 'DE', verified: true })
      .returning({ id: brokersTable.id });
    brokerIds.push(linked.id);
    expect(await getCount()).toBe(baseline + 1);

    // An UNVERIFIED standalone broker profile is excluded entirely.
    const [unverified] = await db
      .insert(brokersTable)
      .values({ userId: null, name: 'E2E Unverified', company: 'E2E', title: 'Broker', city: 'X', country: 'DE', verified: false })
      .returning({ id: brokersTable.id });
    brokerIds.push(unverified.id);
    expect(await getCount()).toBe(baseline + 1);

    // A verified standalone (unlinked) profile counts once more.
    const [standalone] = await db
      .insert(brokersTable)
      .values({ userId: null, name: 'E2E Standalone', company: 'E2E', title: 'Broker', city: 'X', country: 'DE', verified: true })
      .returning({ id: brokersTable.id });
    brokerIds.push(standalone.id);
    expect(await getCount()).toBe(baseline + 2);
  } finally {
    if (brokerIds.length) await db.delete(brokersTable).where(inArray(brokersTable.id, brokerIds));
    await db.delete(usersTable).where(inArray(usersTable.id, [uid]));
  }
});
