/**
 * Due Diligence center & structured Q&A:
 *  1. A granted investor sees the DD workstreams with completion progress.
 *  2. The investor can ask a question in the Q&A tab; it appears with status.
 *  3. API authz: a non-granted investor gets 403 on DD and Q&A; the manager
 *     can update items and answer questions; the asker can flag follow-up.
 *  4. Finding classification is manager/professional only.
 */
import crypto from 'node:crypto';
import { test, expect, request as pwRequest } from '@playwright/test';
import { db, dealsTable, usersTable, sessionsTable } from '@workspace/db';
import { eq } from 'drizzle-orm';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:80';

async function sessionFor(role: 'broker' | 'investor', userId?: string): Promise<{ id: string; sid: string }> {
  const id = userId ?? `e2e-dd-${role}-${crypto.randomUUID()}`;
  if (!userId) {
    await db.insert(usersTable).values({ id, email: `${id}@example.com`, firstName: 'E2E', lastName: 'Dd', role });
  }
  const sid = crypto.randomBytes(32).toString('hex');
  await db.insert(sessionsTable).values({
    sid,
    sess: { user: { id, email: `${id}@example.com`, firstName: 'E2E', lastName: 'Dd', profileImageUrl: null, role }, access_token: 'e2e-test' },
    expire: new Date(Date.now() + 60 * 60 * 1000),
  });
  return { id, sid };
}

async function canalHouse(): Promise<{ id: number; brokerUserId: string | null }> {
  const [deal] = await db
    .select({ id: dealsTable.id, brokerUserId: dealsTable.brokerUserId })
    .from(dealsTable)
    .where(eq(dealsTable.title, 'Canal House Boutique Hotel'));
  if (!deal) throw new Error('Seeded Canal House deal not found — run the seed first.');
  return deal;
}

test('granted investor sees DD workstreams and can ask a Q&A question', async ({ page }) => {
  const deal = await canalHouse();
  await page.goto(`${BASE}/api/demo-login?as=investor&returnTo=/demo/deals/${deal.id}`);
  await page.getByRole('button', { name: 'Due Diligence' }).click();
  await expect(page.getByTestId('panel-dd-progress')).toBeVisible();
  await expect(page.getByTestId('card-workstream-financial')).toBeVisible();
  // Hotel deal gets the hotel-specific workstreams.
  await expect(page.getByTestId('card-workstream-hotel_operational')).toBeVisible();

  await page.getByRole('button', { name: 'Q&A', exact: true }).click();
  await page.getByTestId('btn-new-question').click();
  await page.getByTestId('select-question-category').selectOption('legal');
  const question = `E2E: litigation status check ${Date.now()}`;
  await page.getByTestId('input-question-text').fill(question);
  await page.getByTestId('btn-submit-question').click();
  await expect(page.getByText(question)).toBeVisible();
});

test('API authz: non-granted 403, manager updates item, Q&A lifecycle', async () => {
  const deal = await canalHouse();
  if (!deal.brokerUserId) throw new Error('Deal has no manager');
  const manager = await sessionFor('broker', deal.brokerUserId);
  const outsider = await sessionFor('investor');
  const granted = await sessionFor('investor', 'demo-investor-jonathan');

  const api = await pwRequest.newContext({ baseURL: BASE });
  const auth = (sid: string) => ({ Authorization: `Bearer ${sid}` });

  // Outsider is locked out of DD and Q&A.
  expect((await api.get(`/api/deals/${deal.id}/dd`, { headers: auth(outsider.sid) })).status()).toBe(403);
  expect((await api.get(`/api/deals/${deal.id}/questions`, { headers: auth(outsider.sid) })).status()).toBe(403);

  // Manager sees the DD center and can update an item.
  const dd = await api.get(`/api/deals/${deal.id}/dd`, { headers: auth(manager.sid) });
  expect(dd.status()).toBe(200);
  const ddBody = await dd.json();
  expect(ddBody.canManage).toBe(true);
  const item = ddBody.workstreams[0].items.find((i: { status: string }) => i.status === 'open') ?? ddBody.workstreams[0].items[0];
  const patched = await api.patch(`/api/dd/items/${item.id}`, { headers: auth(manager.sid), data: { status: 'in_progress' } });
  expect(patched.status()).toBe(200);
  // Granted investor cannot update items.
  expect((await api.patch(`/api/dd/items/${item.id}`, { headers: auth(granted.sid), data: { status: 'done' } })).status()).toBe(403);

  // Q&A lifecycle: granted asks, manager answers, asker flags follow-up.
  const created = await api.post(`/api/deals/${deal.id}/questions`, {
    headers: auth(granted.sid),
    data: { category: 'tax', question: 'E2E: what is the VAT position of the asset?' },
  });
  expect(created.status()).toBe(201);
  const q = await created.json();
  // Outsider (no current deal access) cannot touch the question at all.
  expect((await api.patch(`/api/questions/${q.id}`, { headers: auth(outsider.sid), data: { status: 'closed' } })).status()).toBe(403);
  // Asker cannot close/follow-up before an answer exists.
  expect((await api.patch(`/api/questions/${q.id}`, { headers: auth(granted.sid), data: { status: 'closed' } })).status()).toBe(400);
  // Nobody can mark 'answered' without an answer.
  expect((await api.patch(`/api/questions/${q.id}`, { headers: auth(manager.sid), data: { status: 'answered' } })).status()).toBe(400);
  // Granted asker cannot answer their own question.
  expect((await api.patch(`/api/questions/${q.id}`, { headers: auth(granted.sid), data: { answerText: 'self-answer' } })).status()).toBe(403);
  const answered = await api.patch(`/api/questions/${q.id}`, { headers: auth(manager.sid), data: { answerText: 'Asset is VAT-opted; memo in data room.' } });
  expect(answered.status()).toBe(200);
  expect((await answered.json()).status).toBe('answered');
  const followUp = await api.patch(`/api/questions/${q.id}`, { headers: auth(granted.sid), data: { status: 'follow_up' } });
  expect(followUp.status()).toBe(200);
  expect((await followUp.json()).status).toBe('follow_up');
});

test('appointed professional can load the DD center and update items in their workstream', async () => {
  const deal = await canalHouse();
  const pro = await sessionFor('broker');
  const api = await pwRequest.newContext({ baseURL: BASE });
  const auth = (sid: string) => ({ Authorization: `Bearer ${sid}` });

  const { brokersTable, professionalEngagementsTable } = await import('@workspace/db');
  const [profile] = await db.insert(brokersTable).values({
    userId: pro.id, name: 'E2E Technical DD', company: 'E2E Surveys BV', title: 'Technical DD Lead',
    city: 'Amsterdam', country: 'Netherlands',
  }).returning();
  const [engagement] = await db.insert(professionalEngagementsTable).values({
    dealId: deal.id, professionalId: profile.id, role: 'technical_dd', status: 'active',
    invitedByUserId: deal.brokerUserId ?? 'e2e', invitedByName: 'E2E Manager',
  }).returning();
  try {
    // Professional (no NDA/granted access) can read the DD center.
    const dd = await api.get(`/api/deals/${deal.id}/dd`, { headers: auth(pro.sid) });
    expect(dd.status()).toBe(200);
    const body = await dd.json();
    expect(body.canManage).toBe(false);
    const technical = body.workstreams.find((w: { key: string }) => w.key === 'technical');
    expect(technical).toBeTruthy();
    // They can update an item in their (role-matched) workstream…
    const item = technical.items[0];
    const ok = await api.patch(`/api/dd/items/${item.id}`, { headers: auth(pro.sid), data: { status: 'in_progress', note: 'E2E survey scheduled' } });
    expect(ok.status()).toBe(200);
    // …but not in someone else's workstream.
    const legal = body.workstreams.find((w: { key: string }) => w.key === 'legal');
    expect((await api.patch(`/api/dd/items/${legal.items[0].id}`, { headers: auth(pro.sid), data: { status: 'done' } })).status()).toBe(403);
    // And they can read Q&A too.
    expect((await api.get(`/api/deals/${deal.id}/questions`, { headers: auth(pro.sid) })).status()).toBe(200);
    // Manager can update the workstream (response includes capability flag).
    const mgr = await sessionFor('broker', deal.brokerUserId!);
    const wsPatch = await api.patch(`/api/dd/workstreams/${technical.id}`, { headers: auth(mgr.sid), data: { status: 'in_progress' } });
    expect(wsPatch.status()).toBe(200);
    expect((await wsPatch.json()).canUpdateItems).toBe(true);
    // Assigned professional can answer a question assigned to their engagement.
    const { dealQuestionsTable } = await import('@workspace/db');
    const [assignedQ] = await db.insert(dealQuestionsTable).values({
      dealId: deal.id, category: 'technical', question: 'E2E: roof survey findings?',
      askedByUserId: mgr.id, askedByName: 'E2E Manager', status: 'assigned',
      assignedEngagementId: engagement.id,
    }).returning();
    try {
      const ans = await api.patch(`/api/questions/${assignedQ.id}`, { headers: auth(pro.sid), data: { answerText: 'Roof in fair condition; report to follow.' } });
      expect(ans.status()).toBe(200);
      expect((await ans.json()).status).toBe('answered');
      // But they cannot reassign or close.
      expect((await api.patch(`/api/questions/${assignedQ.id}`, { headers: auth(pro.sid), data: { status: 'closed' } })).status()).toBe(403);
    } finally {
      await db.delete(dealQuestionsTable).where(eq(dealQuestionsTable.id, assignedQ.id));
    }
    // Document-level authz: with no data-room permissions granted to this
    // engagement, the professional cannot link any deal document to an item
    // and DD responses hide document names.
    const { dealDocumentsTable } = await import('@workspace/db');
    const [restrictedDoc] = await db
      .select({ id: dealDocumentsTable.id })
      .from(dealDocumentsTable)
      .where(eq(dealDocumentsTable.dealId, deal.id))
      .limit(1);
    if (restrictedDoc) {
      expect((await api.patch(`/api/dd/items/${item.id}`, { headers: auth(pro.sid), data: { documentId: restrictedDoc.id } })).status()).toBe(403);
      // Every workstream shows 0 visible documents for this permission-less
      // engagement, and no restricted document ids or names leak through items.
      const ddAgain = await (await api.get(`/api/deals/${deal.id}/dd`, { headers: auth(pro.sid) })).json();
      for (const w of ddAgain.workstreams) {
        expect(w.documentsCount).toBe(0);
        for (const i of w.items) {
          expect(i.documentId).toBeNull();
          expect(i.documentName).toBeNull();
        }
      }
      // Capability flags: only their own (technical) workstream is editable.
      for (const w of ddAgain.workstreams) {
        expect(w.canUpdateItems).toBe(w.key === 'technical');
      }
      // Q&A answer attachments are equally redacted for this viewer.
      const qs = await (await api.get(`/api/deals/${deal.id}/questions`, { headers: auth(pro.sid) })).json();
      for (const q of qs) {
        expect(q.answerDocumentId).toBeNull();
        expect(q.answerDocumentName ?? null).toBeNull();
      }
      // Nor can they classify a finding sourced from a restricted document.
      const { aiAnalysisRunsTable, aiFindingsTable } = await import('@workspace/db');
      const [run] = await db.insert(aiAnalysisRunsTable).values({ dealId: deal.id, kind: 'document_analysis', status: 'completed', model: 'e2e', requestedByUserId: deal.brokerUserId! }).returning();
      const [restrictedFinding] = await db.insert(aiFindingsTable).values({ runId: run.id, dealId: deal.id, documentId: restrictedDoc.id, category: 'clause', title: 'E2E restricted finding', confidence: 'high', reviewStatus: 'ai_generated' }).returning();
      try {
        expect((await api.post(`/api/ai-findings/${restrictedFinding.id}/classify`, { headers: auth(pro.sid), data: { classification: 'confirmed' } })).status()).toBe(403);
      } finally {
        await db.delete(aiFindingsTable).where(eq(aiFindingsTable.id, restrictedFinding.id));
        await db.delete(aiAnalysisRunsTable).where(eq(aiAnalysisRunsTable.id, run.id));
      }
    }
  } finally {
    await db.delete(professionalEngagementsTable).where(eq(professionalEngagementsTable.id, engagement.id));
    await db.delete(brokersTable).where(eq(brokersTable.id, profile.id));
  }
});

test('unrelated broker gets no AI findings on an unowned confidential deal', async () => {
  const stranger = await sessionFor('broker');
  const api = await pwRequest.newContext({ baseURL: BASE });
  const auth = (sid: string) => ({ Authorization: `Bearer ${sid}` });

  const { aiAnalysisRunsTable, aiFindingsTable, dealDocumentsTable } = await import('@workspace/db');
  // Take a seeded confidential deal and temporarily make it unowned to
  // exercise the any-broker fallback path; restored afterwards.
  const [seeded] = await db
    .select({ id: dealsTable.id, brokerUserId: dealsTable.brokerUserId })
    .from(dealsTable)
    .where(eq(dealsTable.confidential, true))
    .limit(1);
  if (!seeded) throw new Error('No confidential seeded deal found');
  const deal = { id: seeded.id };
  await db.update(dealsTable).set({ brokerUserId: null }).where(eq(dealsTable.id, deal.id));
  try {
    const [doc] = await db.insert(dealDocumentsTable).values({
      dealId: deal.id, name: 'Restricted SPA.pdf', category: 'legal', ndaRequired: true, sizeKb: 100,
    } as never).returning({ id: dealDocumentsTable.id });
    const [run] = await db.insert(aiAnalysisRunsTable).values({ dealId: deal.id, kind: 'document_analysis', status: 'completed', model: 'e2e', requestedByUserId: 'e2e', contextAccess: 'full' } as never).returning();
    const [finding] = await db.insert(aiFindingsTable).values({ runId: run.id, dealId: deal.id, documentId: doc.id, category: 'clause', title: 'Secret indemnity clause', confidence: 'high', reviewStatus: 'ai_generated', classificationNote: 'sensitive note' } as never).returning();
    try {
      // The any-broker fallback must not grant AI findings access on unowned deals.
      const res = await api.get(`/api/deals/${deal.id}/ai-findings`, { headers: auth(stranger.sid) });
      if (res.status() === 200) {
        const body = await res.json();
        const leaked = JSON.stringify(body);
        expect(leaked).not.toContain('Secret indemnity clause');
        expect(leaked).not.toContain('sensitive note');
      } else {
        expect([401, 403]).toContain(res.status());
      }
      // Nor can they classify or review findings on it.
      expect((await api.post(`/api/ai-findings/${finding.id}/classify`, { headers: auth(stranger.sid), data: { classification: 'confirmed' } })).status()).toBe(403);
    } finally {
      await db.delete(aiFindingsTable).where(eq(aiFindingsTable.id, finding.id));
      await db.delete(aiAnalysisRunsTable).where(eq(aiAnalysisRunsTable.id, run.id));
      await db.delete(dealDocumentsTable).where(eq(dealDocumentsTable.id, doc.id));
    }
  } finally {
    await db.update(dealsTable).set({ brokerUserId: seeded.brokerUserId }).where(eq(dealsTable.id, deal.id));
  }
});

test('finding classification is restricted to manager/professionals', async () => {
  const deal = await canalHouse();
  if (!deal.brokerUserId) throw new Error('Deal has no manager');
  const manager = await sessionFor('broker', deal.brokerUserId);
  const granted = await sessionFor('investor', 'demo-investor-jonathan');
  const api = await pwRequest.newContext({ baseURL: BASE });
  const auth = (sid: string) => ({ Authorization: `Bearer ${sid}` });

  // Seed a synthetic finding directly.
  const { aiAnalysisRunsTable, aiFindingsTable } = await import('@workspace/db');
  const [run] = await db.insert(aiAnalysisRunsTable).values({ dealId: deal.id, kind: 'document_analysis', status: 'completed', model: 'e2e', requestedByUserId: manager.id }).returning();
  const [finding] = await db.insert(aiFindingsTable).values({ runId: run.id, dealId: deal.id, category: 'clause', title: 'E2E clause finding', confidence: 'high', reviewStatus: 'ai_generated' }).returning();
  try {
    // Granted (non-professional) viewer cannot classify.
    expect((await api.post(`/api/ai-findings/${finding.id}/classify`, { headers: auth(granted.sid), data: { classification: 'confirmed' } })).status()).toBe(403);
    // Manager can classify; provenance is promoted.
    const res = await api.post(`/api/ai-findings/${finding.id}/classify`, {
      headers: auth(manager.sid),
      data: { classification: 'material_risk', note: 'E2E: verify indemnity cap.' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.classification).toBe('material_risk');
    expect(body.reviewStatus).toBe('professional_reviewed');
  } finally {
    await db.delete(aiFindingsTable).where(eq(aiFindingsTable.id, finding.id));
    await db.delete(aiAnalysisRunsTable).where(eq(aiAnalysisRunsTable.id, run.id));
  }
});
