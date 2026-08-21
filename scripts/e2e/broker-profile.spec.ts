import crypto from 'node:crypto';
import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test';
import { db, usersTable, sessionsTable } from '@workspace/db';

/**
 * Broker directory profiles linked to real auth accounts:
 * - a broker can create and edit a profile via /api/brokers/me
 * - the profile appears in the directory (not flagged as demo)
 * - deals owned by the broker show the profile's name/company
 * - seeded personas are flagged isDemo
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

test('broker directory profile is linked to the broker account and shown on their deals', async () => {
  const broker = await createTestUser('broker', 'broker');
  const investor = await createTestUser('investor', 'investor');
  const brokerApi = await apiAs(broker);
  const investorApi = await apiAs(investor);
  const suffix = crypto.randomUUID().slice(0, 8);

  // No profile yet.
  const empty = (await (await brokerApi.get('/api/brokers/me')).json()) as {
    profile: unknown;
  };
  expect(empty.profile).toBeNull();

  // Investors have no broker profile endpoint access.
  expect((await investorApi.get('/api/brokers/me')).status()).toBe(403);
  expect(
    (
      await investorApi.put('/api/brokers/me', {
        data: { name: 'X', company: 'X', title: 'X', city: 'X', country: 'X' },
      })
    ).status(),
  ).toBe(403);

  // Create the profile.
  const name = `E2E Broker ${suffix}`;
  const company = `E2E Capital ${suffix}`;
  const created = await brokerApi.put('/api/brokers/me', {
    data: {
      name,
      company,
      title: 'Partner',
      city: 'Amsterdam',
      country: 'Netherlands',
      yearsExperience: 7,
      specialisations: ['Offices'],
      bio: 'E2E test broker profile',
    },
  });
  expect(created.ok()).toBeTruthy();
  const profile = (await created.json()) as {
    id: number;
    userId: string;
    isDemo: boolean;
    name: string;
    company: string;
  };
  expect(profile.userId).toBe(broker.id);
  expect(profile.isDemo).toBe(false);
  expect(profile.name).toBe(name);

  // Directory contains the real profile; seeded personas are flagged demo.
  const directory = (await (await investorApi.get('/api/brokers')).json()) as Array<{
    id: number;
    userId: string | null;
    isDemo: boolean;
    name: string;
  }>;
  const mine = directory.find((b) => b.id === profile.id);
  expect(mine).toBeTruthy();
  expect(mine!.isDemo).toBe(false);
  expect(directory.some((b) => b.isDemo && b.userId === null)).toBe(true);

  // Broker lists a deal; it carries the profile's name/company.
  const dealRes = await brokerApi.post('/api/deals', {
    data: {
      title: `E2E Profile Deal ${suffix}`,
      dealType: 'sale',
      assetClass: 'Offices',
      country: 'Netherlands',
      city: 'Amsterdam',
      currency: 'EUR',
    },
  });
  expect(dealRes.status()).toBe(201);
  const deal = (await dealRes.json()) as {
    id: number;
    brokerName: string | null;
    brokerCompany: string | null;
    brokerProfileId: number | null;
  };
  expect(deal.brokerName).toBe(name);
  expect(deal.brokerCompany).toBe(company);
  expect(deal.brokerProfileId).toBe(profile.id);

  // Investor sees the real profile on the deal detail.
  const detail = (await (await investorApi.get(`/api/deals/${deal.id}`)).json()) as {
    brokerName: string | null;
    brokerCompany: string | null;
    brokerProfileId: number | null;
  };
  expect(detail.brokerName).toBe(name);
  expect(detail.brokerCompany).toBe(company);
  expect(detail.brokerProfileId).toBe(profile.id);

  // Editing the profile updates what listings show (upsert, same row).
  const newCompany = `E2E Renamed ${suffix}`;
  const updated = await brokerApi.put('/api/brokers/me', {
    data: {
      name,
      company: newCompany,
      title: 'Managing Partner',
      city: 'Amsterdam',
      country: 'Netherlands',
    },
  });
  expect(updated.ok()).toBeTruthy();
  expect(((await updated.json()) as { id: number }).id).toBe(profile.id);

  const after = (await (await investorApi.get(`/api/deals/${deal.id}`)).json()) as {
    brokerCompany: string | null;
  };
  expect(after.brokerCompany).toBe(newCompany);
});
