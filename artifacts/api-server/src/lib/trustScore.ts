/**
 * Server-computed trust score for professional/broker profiles.
 *
 * Every signal is derived from data the platform can verify itself
 * (verification tier, verified-engagement reviews, engagement history,
 * accepted connections, Q&A responsiveness, account age). Self-claimed
 * profile figures (years of experience, closed deals, credentials) are
 * included but explicitly marked unconfirmed and carry a deliberately
 * small maximum weight. Nothing here is caller-settable.
 */
import { eq, inArray, and, isNotNull } from "drizzle-orm";
import {
  db,
  brokersTable,
  usersTable,
  brokerConnectionsTable,
  professionalEngagementsTable,
  dealQuestionsTable,
  type Broker,
} from "@workspace/db";
import { getReviewAggregates, type ReviewAggregate } from "../routes/professionals";

export type TrustTier = "new" | "developing" | "established";

export interface TrustSignal {
  key: string;
  label: string;
  confirmed: boolean;
  points: number;
  maxPoints: number;
  detail: string;
}

export interface TrustReport {
  professionalId: number;
  score: number;
  tier: TrustTier;
  isDemo: boolean;
  signals: TrustSignal[];
}

const VERIFICATION_POINTS: Record<string, number> = {
  unverified: 0,
  verification_pending: 4,
  verified_professional: 18,
  verified_firm: 18,
  specialist_verified: 25,
};

function tierFor(score: number): TrustTier {
  if (score >= 70) return "established";
  if (score >= 40) return "developing";
  return "new";
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

interface SignalInputs {
  professional: Broker;
  reviews: ReviewAggregate | undefined;
  completedEngagements: number;
  activeEngagements: number;
  acceptedConnections: number;
  /** Median answer time in hours across answered Q&A, when any. */
  medianAnswerHours: number | null;
  accountCreatedAt: Date | null;
}

function buildSignals(inputs: SignalInputs): TrustSignal[] {
  const p = inputs.professional;
  const signals: TrustSignal[] = [];

  // 1. Verification tier (confirmed, max 25)
  const verificationPoints = VERIFICATION_POINTS[p.verificationStatus] ?? 0;
  signals.push({
    key: "verification",
    label: "Identity & firm verification",
    confirmed: true,
    points: verificationPoints,
    maxPoints: 25,
    detail: `Verification status: ${p.verificationStatus.replaceAll("_", " ")}`,
  });

  // 2. Verified-engagement reviews (confirmed, max 25). Count damping keeps a
  // single glowing review from outranking a consistent record.
  const avg = inputs.reviews?.avgRating ?? null;
  const count = inputs.reviews?.reviewCount ?? 0;
  const reviewPoints = avg != null ? (avg / 10) * 25 * Math.min(1, count / 3) : 0;
  signals.push({
    key: "verified_reviews",
    label: "Reviews from verified collaborations",
    confirmed: true,
    points: round1(reviewPoints),
    maxPoints: 25,
    detail:
      avg != null
        ? `${count} verified review${count === 1 ? "" : "s"}, average ${avg.toFixed(1)}/10`
        : "No verified-engagement reviews yet",
  });

  // 3. Engagement track record on-platform (confirmed, max 15)
  const engagementUnits = inputs.completedEngagements + inputs.activeEngagements * 0.5;
  const engagementPoints = Math.min(1, engagementUnits / 4) * 15;
  signals.push({
    key: "engagements",
    label: "Deal-team engagements on Closa",
    confirmed: true,
    points: round1(engagementPoints),
    maxPoints: 15,
    detail: `${inputs.completedEngagements} completed, ${inputs.activeEngagements} active engagement(s)`,
  });

  // 4. Accepted network connections (confirmed, max 10)
  const connectionPoints = Math.min(1, inputs.acceptedConnections / 5) * 10;
  signals.push({
    key: "connections",
    label: "Accepted network connections",
    confirmed: true,
    points: round1(connectionPoints),
    maxPoints: 10,
    detail: `${inputs.acceptedConnections} accepted connection(s)`,
  });

  // 5. Responsiveness (max 10). Measured from answered Q&A when available
  // (confirmed); otherwise the profile's indicative response time counts as
  // unconfirmed at half weight.
  if (inputs.medianAnswerHours != null) {
    const h = inputs.medianAnswerHours;
    const pts = h <= 24 ? 10 : h <= 72 ? 7 : h <= 168 ? 4 : 1;
    signals.push({
      key: "responsiveness",
      label: "Response time on deal Q&A",
      confirmed: true,
      points: pts,
      maxPoints: 10,
      detail: `Median answer time ${Math.round(h)}h across answered questions`,
    });
  } else if (p.avgResponseHours != null) {
    const h = p.avgResponseHours;
    const pts = (h <= 24 ? 10 : h <= 72 ? 7 : h <= 168 ? 4 : 1) / 2;
    signals.push({
      key: "responsiveness",
      label: "Indicative response time",
      confirmed: false,
      points: round1(pts),
      maxPoints: 5,
      detail: `Self-reported typical response time ~${Math.round(h)}h (unconfirmed)`,
    });
  } else {
    signals.push({
      key: "responsiveness",
      label: "Response time",
      confirmed: true,
      points: 0,
      maxPoints: 10,
      detail: "No measured response activity yet",
    });
  }

  // 6. Account age (confirmed, max 5). Only when linked to a real account.
  let agePoints = 0;
  let ageDetail = "No linked platform account";
  if (inputs.accountCreatedAt) {
    const years =
      (Date.now() - inputs.accountCreatedAt.getTime()) / (365.25 * 24 * 3600 * 1000);
    agePoints = Math.min(1, years / 2) * 5;
    ageDetail = `Account active for ${years < 1 ? `${Math.max(1, Math.round(years * 12))} month(s)` : `${years.toFixed(1)} year(s)`}`;
  }
  signals.push({
    key: "account_age",
    label: "Account history",
    confirmed: true,
    points: round1(agePoints),
    maxPoints: 5,
    detail: ageDetail,
  });

  // 7. Self-claimed track record (unconfirmed, max 10). Deliberately light:
  // claims never outweigh verified evidence.
  const claimed =
    Math.min(1, p.yearsExperience / 20) * 4 +
    Math.min(1, p.closedDeals / 50) * 3 +
    Math.min(1, p.credentials.length / 3) * 3;
  signals.push({
    key: "self_claimed",
    label: "Self-reported track record",
    confirmed: false,
    points: round1(claimed),
    maxPoints: 10,
    detail: `${p.yearsExperience} yrs experience, ${p.closedDeals} closed deals, ${p.credentials.length} credential(s) — unconfirmed claims, weighted lightly`,
  });

  return signals;
}

function reportFrom(inputs: SignalInputs): TrustReport {
  const signals = buildSignals(inputs);
  const score = round1(signals.reduce((sum, s) => sum + s.points, 0));
  return {
    professionalId: inputs.professional.id,
    score,
    tier: tierFor(score),
    isDemo: inputs.professional.isDemo,
    signals,
  };
}

/**
 * Compute trust reports for a batch of professionals with a fixed number of
 * queries, independent of batch size.
 */
export async function computeTrustReports(
  professionals: Broker[],
): Promise<Map<number, TrustReport>> {
  const out = new Map<number, TrustReport>();
  if (professionals.length === 0) return out;
  const ids = professionals.map((p) => p.id);
  const userIds = professionals
    .map((p) => p.userId)
    .filter((u): u is string => u != null);

  const [reviews, allEngagements, allConnections, users] = await Promise.all([
    getReviewAggregates(professionals),
    db
      .select({
        id: professionalEngagementsTable.id,
        professionalId: professionalEngagementsTable.professionalId,
        status: professionalEngagementsTable.status,
        invitedByUserId: professionalEngagementsTable.invitedByUserId,
      })
      .from(professionalEngagementsTable)
      .where(inArray(professionalEngagementsTable.professionalId, ids)),
    db
      .select({
        brokerId: brokerConnectionsTable.brokerId,
        ownerUserId: brokerConnectionsTable.ownerUserId,
      })
      .from(brokerConnectionsTable)
      .where(
        and(
          inArray(brokerConnectionsTable.brokerId, ids),
          eq(brokerConnectionsTable.status, "accepted"),
        ),
      ),
    userIds.length
      ? db
          .select({ id: usersTable.id, createdAt: usersTable.createdAt })
          .from(usersTable)
          .where(inArray(usersTable.id, userIds))
      : Promise.resolve([] as { id: string; createdAt: Date }[]),
  ]);

  // Demo provenance: activity produced by demo accounts never counts toward
  // real (non-demo) profiles. Resolve the demo flag for every counterparty
  // involved in the evidence.
  const counterpartyIds = [
    ...new Set([
      ...allEngagements.map((e) => e.invitedByUserId),
      ...allConnections.map((c) => c.ownerUserId),
    ]),
  ];
  const demoUsers = counterpartyIds.length
    ? await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(
          and(inArray(usersTable.id, counterpartyIds), eq(usersTable.isDemo, true)),
        )
    : [];
  const demoUserIds = new Set(demoUsers.map((u) => u.id));
  const demoProfileIds = new Set(
    professionals.filter((p) => p.isDemo).map((p) => p.id),
  );
  const isRealProfile = (pid: number) => !demoProfileIds.has(pid);
  const engagements = allEngagements.filter(
    (e) => !(isRealProfile(e.professionalId) && demoUserIds.has(e.invitedByUserId)),
  );
  const connections = allConnections.filter(
    (c) => !(isRealProfile(c.brokerId) && demoUserIds.has(c.ownerUserId)),
  );

  // Q&A responsiveness: answered questions assigned to these professionals'
  // engagements.
  const engagementIds = engagements.map((e) => e.id);
  const answered = engagementIds.length
    ? await db
        .select({
          assignedEngagementId: dealQuestionsTable.assignedEngagementId,
          createdAt: dealQuestionsTable.createdAt,
          answeredAt: dealQuestionsTable.answeredAt,
          askedByUserId: dealQuestionsTable.askedByUserId,
          askerIsDemo: usersTable.isDemo,
        })
        .from(dealQuestionsTable)
        .leftJoin(usersTable, eq(usersTable.id, dealQuestionsTable.askedByUserId))
        .where(
          and(
            inArray(dealQuestionsTable.assignedEngagementId, engagementIds),
            isNotNull(dealQuestionsTable.answeredAt),
          ),
        )
    : [];

  const engagementOwner = new Map(engagements.map((e) => [e.id, e.professionalId]));
  const answerHours = new Map<number, number[]>();
  for (const q of answered) {
    if (q.assignedEngagementId == null || q.answeredAt == null) continue;
    const pid = engagementOwner.get(q.assignedEngagementId);
    if (pid == null) continue;
    // Demo-asked questions never feed a real profile's responsiveness signal.
    if (isRealProfile(pid) && q.askerIsDemo === true) continue;
    const hours = (q.answeredAt.getTime() - q.createdAt.getTime()) / 3600000;
    if (hours < 0) continue;
    const list = answerHours.get(pid) ?? [];
    list.push(hours);
    answerHours.set(pid, list);
  }

  const engagementCounts = new Map<number, { completed: number; active: number }>();
  for (const e of engagements) {
    const c = engagementCounts.get(e.professionalId) ?? { completed: 0, active: 0 };
    if (e.status === "completed") c.completed += 1;
    else if (e.status === "active" || e.status === "appointed") c.active += 1;
    engagementCounts.set(e.professionalId, c);
  }
  const connectionCounts = new Map<number, number>();
  for (const c of connections) {
    connectionCounts.set(c.brokerId, (connectionCounts.get(c.brokerId) ?? 0) + 1);
  }
  const userCreated = new Map(users.map((u) => [u.id, u.createdAt]));

  for (const p of professionals) {
    const hours = (answerHours.get(p.id) ?? []).sort((a, b) => a - b);
    const median =
      hours.length === 0
        ? null
        : hours.length % 2
          ? (hours[(hours.length - 1) / 2] ?? null)
          : ((hours[hours.length / 2 - 1] ?? 0) + (hours[hours.length / 2] ?? 0)) / 2;
    const counts = engagementCounts.get(p.id) ?? { completed: 0, active: 0 };
    out.set(
      p.id,
      reportFrom({
        professional: p,
        reviews: reviews.get(p.id),
        completedEngagements: counts.completed,
        activeEngagements: counts.active,
        acceptedConnections: connectionCounts.get(p.id) ?? 0,
        medianAnswerHours: median,
        accountCreatedAt: p.userId ? (userCreated.get(p.userId) ?? null) : null,
      }),
    );
  }
  return out;
}

export async function computeTrustReport(
  professionalId: number,
): Promise<TrustReport | null> {
  const [professional] = await db
    .select()
    .from(brokersTable)
    .where(eq(brokersTable.id, professionalId));
  if (!professional) return null;
  const reports = await computeTrustReports([professional]);
  return reports.get(professionalId) ?? null;
}
