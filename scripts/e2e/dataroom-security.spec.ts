/**
 * Data room security & document flow:
 *  1. Outsiders (no broker session) cannot mint upload URLs, register
 *     documents, list access requests, or advance a request's lifecycle.
 *  2. Broker uploads a PDF, registers it NDA-required; responses never leak
 *     storage paths.
 *  3. Investor lifecycle: only the requester's secret key yields a download
 *     token; downloads require the token; bad/missing tokens are denied.
 */
import { test, expect, type APIRequestContext } from '@playwright/test';

const unique = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

/**
 * Return headers that authenticate subsequent API calls as a broker.
 * Standalone APIRequestContexts don't reliably forward cookies across requests,
 * so we use the X-Broker-Passcode header instead (accepted by isBroker() on the server).
 */
function brokerHeaders(): Record<string, string> {
  const passcode = process.env.BROKER_PASSCODE ?? '';
  return passcode ? { 'X-Broker-Passcode': passcode } : {};
}

test('outsiders cannot upload, list, or advance access requests', async ({ playwright }) => {
  const anon = await playwright.request.newContext({ baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:80' });

  expect((await anon.post('/api/storage/uploads/request-url', { data: { name: 'x.pdf', size: 10, contentType: 'application/pdf' } })).status()).toBe(401);
  expect((await anon.post('/api/deals/1/documents', { data: { name: 'x.pdf', category: 'Financials', sizeKb: 1, ndaRequired: false, objectPath: '/objects/uploads/fake', contentType: 'application/pdf' } })).status()).toBe(401);
  expect((await anon.get('/api/access-requests')).status()).toBe(401);

  // Access request creation is open (unauthenticated investors can request access).
  // Only broker lifecycle transitions require a session; signing requires the correct requestKey.
  expect((await anon.post('/api/deals/1/access-requests', { data: { requesterName: `Anon ${unique()}`, requesterCompany: 'Anon Co' } })).status()).toBe(201);
  expect((await anon.patch('/api/access-requests/1', { data: { status: 'approved' } })).status()).toBe(401);
  expect((await anon.patch('/api/access-requests/1', { data: { status: 'nda_signed', requestKey: 'wrong' } })).status()).toBe(403);

  await anon.dispose();
});

test('broker uploads an NDA-gated document; only the signed requester can download it', async ({ playwright }) => {
  const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:80';
  const broker = await playwright.request.newContext({ baseURL });
  const investor = await playwright.request.newContext({ baseURL });
  const bh = brokerHeaders();

  // Broker: non-PDF is refused, PDF is minted and uploaded
  expect((await broker.post('/api/storage/uploads/request-url', { data: { name: 'x.exe', size: 10, contentType: 'application/x-msdownload' }, headers: bh })).status()).toBe(400);
  const mint = await (await broker.post('/api/storage/uploads/request-url', { data: { name: 'e2e.pdf', size: 16, contentType: 'application/pdf' }, headers: bh })).json();
  const put = await broker.put(mint.uploadURL, { data: Buffer.from('E2E-PDF-CONTENT!'), headers: { 'Content-Type': 'application/pdf' } });
  expect(put.status()).toBe(200);

  // Broker registers the document; response exposes hasFile, never objectPath
  const docRes = await broker.post('/api/deals/2/documents', {
    data: { name: `e2e-${unique()}.pdf`, category: 'Financials', sizeKb: 1, ndaRequired: true, objectPath: mint.objectPath, contentType: 'application/pdf' },
    headers: bh,
  });
  expect(docRes.status()).toBe(201);
  const doc = await docRes.json();
  expect(doc.hasFile).toBe(true);
  expect(doc.objectPath).toBeUndefined();

  // Direct private-object fetch is denied even for the broker session
  expect((await broker.get(`/api/storage${mint.objectPath}`, { headers: bh })).status()).toBe(403);

  // Investor requests access; broker approves and sends the NDA
  const reqCreated = await (await investor.post('/api/deals/2/access-requests', { data: { requesterName: `E2E Inv ${unique()}`, requesterCompany: 'E2E Cap' } })).json();
  expect(typeof reqCreated.requestKey).toBe('string');
  expect((await broker.patch(`/api/access-requests/${reqCreated.id}`, { data: { status: 'approved' }, headers: bh })).status()).toBe(200);
  expect((await broker.patch(`/api/access-requests/${reqCreated.id}`, { data: { status: 'nda_sent' }, headers: bh })).status()).toBe(200);

  // Download locked until signed
  expect((await investor.get(`/api/deals/2/documents/${doc.id}/download`)).status()).toBe(403);

  // Wrong key cannot sign; right key signs and receives the token
  expect((await investor.patch(`/api/access-requests/${reqCreated.id}`, { data: { status: 'nda_signed', requestKey: 'wrong-key' } })).status()).toBe(403);
  const signed = await (await investor.patch(`/api/access-requests/${reqCreated.id}`, { data: { status: 'nda_signed', requestKey: reqCreated.requestKey } })).json();
  expect(typeof signed.downloadToken).toBe('string');

  // Bad token denied; real token downloads the file
  expect((await investor.get(`/api/deals/2/documents/${doc.id}/download?token=bogus`)).status()).toBe(403);
  const dl = await investor.get(`/api/deals/2/documents/${doc.id}/download?token=${signed.downloadToken}`);
  expect(dl.status()).toBe(200);
  expect((await dl.body()).toString()).toBe('E2E-PDF-CONTENT!');

  await broker.dispose();
  await investor.dispose();
});
