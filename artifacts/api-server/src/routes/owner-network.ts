import { toJson } from "../lib/serialize";
import { Router, type IRouter } from "express";
import { desc, eq, inArray } from "drizzle-orm";
import {
  db,
  brokersTable,
  ownerAssignmentsTable,
  brokerConnectionsTable,
  threadsTable,
  messagesTable,
  notificationsTable,
  activityTable,
} from "@workspace/db";
import {
  ListOwnerAssignmentsResponse,
  CreateOwnerAssignmentBody,
  CreateOwnerAssignmentResponse,
  UpdateOwnerAssignmentStatusParams,
  UpdateOwnerAssignmentStatusBody,
  UpdateOwnerAssignmentStatusResponse,
  ListBrokerConnectionsResponse,
  CreateBrokerConnectionBody,
  CreateBrokerConnectionResponse,
  RespondBrokerConnectionParams,
  RespondBrokerConnectionBody,
  RespondBrokerConnectionResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

function displayName(user: {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
}): string {
  return (
    [user.firstName, user.lastName].filter(Boolean).join(" ") ||
    user.email ||
    "Member"
  );
}

// ── Owner assignments ────────────────────────────────────────────────────────

router.get("/assignments", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  // Owners see their own assignments (any status); brokers see open
  // assignments from all owners. Other roles have no business here.
  if (req.user.role !== "owner" && req.user.role !== "broker") {
    res.status(403).json({ error: "Assignments are only visible to owners and brokers" });
    return;
  }
  const rows =
    req.user.role === "owner"
      ? await db
          .select()
          .from(ownerAssignmentsTable)
          .where(eq(ownerAssignmentsTable.ownerUserId, req.user.id))
          .orderBy(desc(ownerAssignmentsTable.createdAt))
      : await db
          .select()
          .from(ownerAssignmentsTable)
          .where(eq(ownerAssignmentsTable.status, "open"))
          .orderBy(desc(ownerAssignmentsTable.createdAt));

  const presented = rows.map((row) => ({
    ...row,
    isOwn: row.ownerUserId === req.user.id,
  }));
  res.json(ListOwnerAssignmentsResponse.parse(toJson(presented)));
});

router.post("/assignments", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (req.user.role !== "owner") {
    res.status(403).json({ error: "Only property owners can post assignments" });
    return;
  }
  const parsed = CreateOwnerAssignmentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [assignment] = await db
    .insert(ownerAssignmentsTable)
    .values({
      ownerUserId: req.user.id,
      ownerName: displayName(req.user),
      title: parsed.data.title,
      propertyType: parsed.data.propertyType,
      country: parsed.data.country,
      city: parsed.data.city,
      areaSqm: parsed.data.areaSqm ?? null,
      indicativeValue: parsed.data.indicativeValue ?? null,
      goal: parsed.data.goal,
      description: parsed.data.description ?? null,
      status: "open",
    })
    .returning();

  await db.insert(activityTable).values({
    type: "assignment_posted",
    description: `New owner assignment: ${assignment.title} (${assignment.city})`,
  });

  res.status(201).json(
    CreateOwnerAssignmentResponse.parse(toJson({ ...assignment, isOwn: true })),
  );
});

router.patch("/assignments/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = UpdateOwnerAssignmentStatusParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdateOwnerAssignmentStatusBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [existing] = await db
    .select()
    .from(ownerAssignmentsTable)
    .where(eq(ownerAssignmentsTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Assignment not found" });
    return;
  }
  if (existing.ownerUserId !== req.user.id) {
    res.status(403).json({ error: "Only the assignment owner can change it" });
    return;
  }

  const [updated] = await db
    .update(ownerAssignmentsTable)
    .set({ status: body.data.status })
    .where(eq(ownerAssignmentsTable.id, params.data.id))
    .returning();

  res.json(
    UpdateOwnerAssignmentStatusResponse.parse(
      toJson({ ...updated, isOwn: true }),
    ),
  );
});

// ── Broker connection requests ───────────────────────────────────────────────

async function presentConnections(
  rows: (typeof brokerConnectionsTable.$inferSelect)[],
) {
  const brokerIds = [...new Set(rows.map((r) => r.brokerId))];
  const assignmentIds = [
    ...new Set(rows.map((r) => r.assignmentId).filter((v): v is number => v != null)),
  ];
  const [brokers, assignments] = await Promise.all([
    brokerIds.length
      ? db.select().from(brokersTable).where(inArray(brokersTable.id, brokerIds))
      : [],
    assignmentIds.length
      ? db
          .select()
          .from(ownerAssignmentsTable)
          .where(inArray(ownerAssignmentsTable.id, assignmentIds))
      : [],
  ]);
  const brokerById = new Map(brokers.map((b) => [b.id, b]));
  const assignmentById = new Map(assignments.map((a) => [a.id, a]));
  return rows.map((row) => ({
    ...row,
    brokerName: brokerById.get(row.brokerId)?.name ?? "Unknown broker",
    brokerCompany: brokerById.get(row.brokerId)?.company ?? null,
    assignmentTitle:
      row.assignmentId != null
        ? (assignmentById.get(row.assignmentId)?.title ?? null)
        : null,
  }));
}

router.get("/connections", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  let rows: (typeof brokerConnectionsTable.$inferSelect)[] = [];
  if (req.user.role === "broker") {
    // Requests addressed to any broker profile linked to this account.
    const profiles = await db
      .select({ id: brokersTable.id })
      .from(brokersTable)
      .where(eq(brokersTable.userId, req.user.id));
    const profileIds = profiles.map((p) => p.id);
    rows = profileIds.length
      ? await db
          .select()
          .from(brokerConnectionsTable)
          .where(inArray(brokerConnectionsTable.brokerId, profileIds))
          .orderBy(desc(brokerConnectionsTable.createdAt))
      : [];
  } else {
    rows = await db
      .select()
      .from(brokerConnectionsTable)
      .where(eq(brokerConnectionsTable.ownerUserId, req.user.id))
      .orderBy(desc(brokerConnectionsTable.createdAt));
  }

  const presented = await presentConnections(rows);
  res.json(ListBrokerConnectionsResponse.parse(toJson(presented)));
});

router.post("/connections", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (req.user.role !== "owner") {
    res
      .status(403)
      .json({ error: "Only property owners can send connection requests" });
    return;
  }
  const parsed = CreateBrokerConnectionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [broker] = await db
    .select()
    .from(brokersTable)
    .where(eq(brokersTable.id, parsed.data.brokerId));
  if (!broker) {
    res.status(404).json({ error: "Broker not found" });
    return;
  }
  if (broker.category !== "brokers") {
    // Owner connection requests are a broker-specific workflow; other
    // professional categories get their own engagement flow (Deal Teams).
    res.status(400).json({ error: "Connection requests can only be sent to brokers" });
    return;
  }
  if (!broker.userId) {
    // No account is linked to this directory profile, so nobody could ever
    // see or accept the request. Fail loudly instead of silently dropping it.
    res.status(409).json({
      error: "This broker is not yet accepting connection requests on the platform",
    });
    return;
  }

  if (parsed.data.assignmentId != null) {
    const [assignment] = await db
      .select()
      .from(ownerAssignmentsTable)
      .where(eq(ownerAssignmentsTable.id, parsed.data.assignmentId));
    if (!assignment || assignment.ownerUserId !== req.user.id) {
      res.status(400).json({ error: "Assignment not found or not yours" });
      return;
    }
  }

  const [connection] = await db
    .insert(brokerConnectionsTable)
    .values({
      ownerUserId: req.user.id,
      ownerName: displayName(req.user),
      brokerId: broker.id,
      assignmentId: parsed.data.assignmentId ?? null,
      message: parsed.data.message,
      status: "pending",
    })
    .returning();

  if (broker.userId) {
    await db.insert(notificationsTable).values({
      userId: broker.userId,
      type: "connection_request",
      message: `${connection.ownerName} wants to connect about a property assignment`,
    });
  }
  await db.insert(activityTable).values({
    type: "connection_requested",
    description: `${connection.ownerName} requested to connect with ${broker.name}`,
  });

  const [presented] = await presentConnections([connection]);
  res
    .status(201)
    .json(CreateBrokerConnectionResponse.parse(toJson(presented)));
});

router.patch("/connections/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = RespondBrokerConnectionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = RespondBrokerConnectionBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [connection] = await db
    .select()
    .from(brokerConnectionsTable)
    .where(eq(brokerConnectionsTable.id, params.data.id));
  if (!connection) {
    res.status(404).json({ error: "Connection request not found" });
    return;
  }

  const [broker] = await db
    .select()
    .from(brokersTable)
    .where(eq(brokersTable.id, connection.brokerId));
  if (!broker || broker.userId !== req.user.id) {
    res
      .status(403)
      .json({ error: "Only the addressed broker can respond to this request" });
    return;
  }
  if (connection.status !== "pending") {
    res.status(409).json({ error: "This request has already been answered" });
    return;
  }

  let threadId: number | null = null;
  if (body.data.status === "accepted") {
    // Open a real private thread between the owner and the broker account.
    const [thread] = await db
      .insert(threadsTable)
      .values({
        subject: connection.assignmentId
          ? `Assignment: ${
              (
                await db
                  .select({ title: ownerAssignmentsTable.title })
                  .from(ownerAssignmentsTable)
                  .where(eq(ownerAssignmentsTable.id, connection.assignmentId))
              )[0]?.title ?? "Property assignment"
            }`
          : `Introduction: ${connection.ownerName}`,
        counterpartName: connection.ownerName,
        counterpartCompany: connection.ownerCompany ?? "Private owner",
        participantAUserId: connection.ownerUserId,
        participantBUserId: req.user.id,
        participantAName: connection.ownerName,
        participantACompany: connection.ownerCompany ?? "Private owner",
        participantBName: broker.name,
        participantBCompany: broker.company,
      })
      .returning();
    threadId = thread.id;

    await db.insert(messagesTable).values({
      threadId: thread.id,
      senderName: connection.ownerName,
      senderUserId: connection.ownerUserId,
      body: connection.message,
      fromMe: false,
    });
  }

  const [updated] = await db
    .update(brokerConnectionsTable)
    .set({
      status: body.data.status,
      threadId,
      respondedAt: new Date(),
    })
    .where(eq(brokerConnectionsTable.id, params.data.id))
    .returning();

  await db.insert(notificationsTable).values({
    userId: connection.ownerUserId,
    type: "connection_response",
    message:
      body.data.status === "accepted"
        ? `${broker.name} accepted your connection request — you can now message directly`
        : `${broker.name} declined your connection request`,
  });
  if (body.data.status === "accepted") {
    await db.insert(activityTable).values({
      type: "connection_accepted",
      description: `${broker.name} connected with ${connection.ownerName}`,
    });
  }

  const [presented] = await presentConnections([updated]);
  res.json(RespondBrokerConnectionResponse.parse(toJson(presented)));
});

export default router;
