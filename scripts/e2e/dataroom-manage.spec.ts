/**
 * Broker document management (edit/delete) and its ownership rules:
 *  1. Anonymous callers cannot PATCH or DELETE data room documents.
 *  2. A shared-passcode broker session can edit and delete documents only on
 *     unowned (seeded/demo) deals.
 *  3. Documents on a deal owned by an identified broker are off-limits to the
 *     passcode session (403) — only the owning authenticated broker may
 *     mutate them.
 */
import crypto from 'node:crypto';
import { test, expect, request as pwRequest } from '@playwright/test';
import { db, usersTable, sessionsTable } from '@workspace/db';

const unique = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

function brokerHeaders(): Record<string, string> {
  const passcode = process.env.BROKER_PASSCODE ?? '';
  return passcode ? { 'X-Broker-Passcode': passcode } : {};
}

test('broker can edit and delete documents on an unowned deal; outsiders cannot', async ({ playwright }) => {
  const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:80';
  const broker = await playwright.request.newContext({ baseURL });
  const anon = await playwright.request.newContext({ baseURL });
  const bh = brokerHeaders();

  // Register a metadata-only document on unowned demo deal 1.
  const created = await broker.post('/api/deals/1/documents', {
    data: { name: `manage-${unique()}.pdf`, category: 'Financials', sizeKb: 5, ndaRequired: false, objectPath: '/objects/uploads/manage-e2e', contentType: 'application/pdf' },
    headers: bh,
  });
  expect(created.status()).toBe(201);
  const doc = await created.json();

  // Outsiders are rejected.
  expect((await anon.patch(`/api/deals/1/documents/${doc.id}`, { data: { name: 'hax' } })).status()).toBe(401);
  expect((await anon.delete(`/api/deals/1/documents/${doc.id}`)).status()).toBe(401);

  // Listing (authenticated user session) returns the public shape:
  // hasFile is present, storage internals are not.
  const viewerId = `e2e-viewer-${crypto.randomUUID()}`;
  await db.insert(usersTable).values({ id: viewerId, email: `${viewerId}@example.com`, firstName: 'E2E', lastName: 'Viewer', role: 'investor' });
  const viewerSid = crypto.randomBytes(32).toString('hex');
  await db.insert(sessionsTable).values({
    sid: viewerSid,
    sess: { user: { id: viewerId, email: `${viewerId}@example.com`, firstName: 'E2E', lastName: 'Viewer', profileImageUrl: null, role: 'investor' }, access_token: 'e2e-test' },
    expire: new Date(Date.now() + 60 * 60 * 1000),
  });
  const viewer = await pwRequest.newContext({ baseURL, extraHTTPHeaders: { Authorization: `Bearer ${viewerSid}` } });
  const listed = await (await viewer.get('/api/deals/1/documents')).json();
  await viewer.dispose();
  const listedDoc = listed.find((d: { id: number }) => d.id === doc.id);
  expect(listedDoc).toBeTruthy();
  expect(listedDoc.hasFile).toBe(true);
  expect(listedDoc.objectPath).toBeUndefined();
  expect(listedDoc.contentType).toBeUndefined();

  // Broker edits name, category, and NDA flag.
  const patched = await broker.patch(`/api/deals/1/documents/${doc.id}`, {
    data: { name: 'Updated Rent Roll.pdf', category: 'Legal', ndaRequired: true },
    headers: bh,
  });
  expect(patched.status()).toBe(200);
  const updated = await patched.json();
  expect(updated.name).toBe('Updated Rent Roll.pdf');
  expect(updated.category).toBe('Legal');
  expect(updated.ndaRequired).toBe(true);
  expect(updated.objectPath).toBeUndefined();

  // Empty patch is rejected.
  expect((await broker.patch(`/api/deals/1/documents/${doc.id}`, { data: {}, headers: bh })).status()).toBe(400);

  // Broker deletes; a second delete 404s.
  expect((await broker.delete(`/api/deals/1/documents/${doc.id}`, { headers: bh })).status()).toBe(200);
  expect((await broker.delete(`/api/deals/1/documents/${doc.id}`, { headers: bh })).status()).toBe(404);

  await broker.dispose();
  await anon.dispose();
});

test('an authenticated broker-role user (no passcode) can manage documents on unowned demo deals', async () => {
  const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:80';
  const id = `e2e-authed-broker-${crypto.randomUUID()}`;
  await db.insert(usersTable).values({ id, email: `${id}@example.com`, firstName: 'E2E', lastName: 'Authed', role: 'broker' });
  const sid = crypto.randomBytes(32).toString('hex');
  await db.insert(sessionsTable).values({
    sid,
    sess: { user: { id, email: `${id}@example.com`, firstName: 'E2E', lastName: 'Authed', profileImageUrl: null, role: 'broker' }, access_token: 'e2e-test' },
    expire: new Date(Date.now() + 60 * 60 * 1000),
  });
  const authed = await pwRequest.newContext({ baseURL, extraHTTPHeaders: { Authorization: `Bearer ${sid}` } });

  // Deal 1 is unowned/seeded; an authenticated broker may manage its documents.
  const created = await authed.post('/api/deals/1/documents', {
    data: { name: `authed-${unique()}.pdf`, category: 'Financials', sizeKb: 3, ndaRequired: false, objectPath: '/objects/uploads/authed-e2e', contentType: 'application/pdf' },
  });
  expect(created.status()).toBe(201);
  const doc = await created.json();

  const patched = await authed.patch(`/api/deals/1/documents/${doc.id}`, { data: { category: 'Legal' } });
  expect(patched.status()).toBe(200);
  expect((await patched.json()).category).toBe('Legal');

  expect((await authed.delete(`/api/deals/1/documents/${doc.id}`)).status()).toBe(200);

  await authed.dispose();
});

test('the authenticated owning broker can upload, edit, and delete documents on their own deal', async () => {
  const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:80';
  const id = `e2e-owner-broker-${crypto.randomUUID()}`;
  await db.insert(usersTable).values({ id, email: `${id}@example.com`, firstName: 'E2E', lastName: 'Owner', role: 'broker' });
  const sid = crypto.randomBytes(32).toString('hex');
  await db.insert(sessionsTable).values({
    sid,
    sess: { user: { id, email: `${id}@example.com`, firstName: 'E2E', lastName: 'Owner', profileImageUrl: null, role: 'broker' }, access_token: 'e2e-test' },
    expire: new Date(Date.now() + 60 * 60 * 1000),
  });
  const owner = await pwRequest.newContext({ baseURL, extraHTTPHeaders: { Authorization: `Bearer ${sid}` } });

  // Owner creates a deal (owned by them), uploads a doc, edits it, deletes it.
  const dealRes = await owner.post('/api/deals', {
    data: { title: `E2E Owner Deal ${unique()}`, assetClass: 'Office', dealType: 'asset_deal', country: 'DE', city: 'Berlin', askingPrice: 1000000, currency: 'EUR' },
  });
  expect(dealRes.status()).toBe(201);
  const deal = await dealRes.json();

  const created = await owner.post(`/api/deals/${deal.id}/documents`, {
    data: { name: `owner-${unique()}.pdf`, category: 'Financials', sizeKb: 5, ndaRequired: false, objectPath: '/objects/uploads/owner-e2e', contentType: 'application/pdf' },
  });
  expect(created.status()).toBe(201);
  const doc = await created.json();

  const patched = await owner.patch(`/api/deals/${deal.id}/documents/${doc.id}`, { data: { name: 'Owner Updated.pdf', ndaRequired: true } });
  expect(patched.status()).toBe(200);
  expect((await patched.json()).name).toBe('Owner Updated.pdf');

  expect((await owner.delete(`/api/deals/${deal.id}/documents/${doc.id}`)).status()).toBe(200);

  await owner.dispose();
});

test('passcode session cannot mutate documents on a deal owned by an identified broker', async ({ playwright }) => {
  test.skip(!process.env.DATABASE_URL, 'DATABASE_URL not available for seeding');
  const { execSync } = await import('node:child_process');
  const psql = (sql: string) =>
    execSync(`psql "$DATABASE_URL" -q -t -A -c ${JSON.stringify(sql)}`, { encoding: 'utf8' }).trim();

  const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:80';
  const broker = await playwright.request.newContext({ baseURL });
  const bh = brokerHeaders();

  // Seed a deal owned by an identified broker user, with one document.
  const owner = `e2e-owner-${unique()}`;
  const dealId = psql(
    `insert into deals (title, asset_class, deal_type, country, city, asking_price, broker_name, broker_company, broker_user_id) values ('E2E Owned Deal', 'Office', 'asset_deal', 'DE', 'Berlin', 1000000, 'E2E Broker', 'E2E Co', '${owner}') returning id;`,
  );
  const docId = psql(
    `insert into deal_documents (deal_id, name, category, size_kb, nda_required) values (${dealId}, 'Owned Doc', 'financials', 10, false) returning id;`,
  );

  try {
    expect((await broker.post(`/api/deals/${dealId}/documents`, {
      data: { name: 'x.pdf', category: 'c', sizeKb: 1, ndaRequired: false, objectPath: '/objects/uploads/z', contentType: 'application/pdf' },
      headers: bh,
    })).status()).toBe(403);
    expect((await broker.patch(`/api/deals/${dealId}/documents/${docId}`, { data: { name: 'hax' }, headers: bh })).status()).toBe(403);
    expect((await broker.delete(`/api/deals/${dealId}/documents/${docId}`, { headers: bh })).status()).toBe(403);
    // Document is untouched.
    expect(psql(`select name from deal_documents where id=${docId};`)).toBe('Owned Doc');
  } finally {
    psql(`delete from deal_documents where id=${docId};`);
    psql(`delete from deals where id=${dealId};`);
    await broker.dispose();
  }
});
