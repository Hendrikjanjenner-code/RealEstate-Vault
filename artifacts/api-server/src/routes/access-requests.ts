import { toJson } from "../lib/serialize";
import { Router, type IRouter } from "express";
import { desc, eq, or, isNull, inArray } from "drizzle-orm";
import {
  db,
  accessRequestsTable,
  activityTable,
  dealsTable,
} from "@workspace/db";
import {
  ListAccessRequestsResponse,
  UpdateAccessRequestParams,
  UpdateAccessRequestBody,
  UpdateAccessRequestResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

const VALID_STATUSES = [
  "pending",
  "approved",
  "nda_sent",
  "nda_signed",
  "rejected",
];

router.get("/access-requests", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  let requests;
  if (req.user.role === "broker") {
    // Brokers see requests on deals they list (plus legacy unowned seed deals).
    const ownedDeals = await db
      .select({ id: dealsTable.id })
      .from(dealsTable)
      .where(
        or(
          eq(dealsTable.brokerUserId, req.user.id),
          isNull(dealsTable.brokerUserId),
        ),
      );
    const dealIds = ownedDeals.map((d) => d.id);
    requests = dealIds.length
      ? await db
          .select()
          .from(accessRequestsTable)
          .where(inArray(accessRequestsTable.dealId, dealIds))
          .orderBy(desc(accessRequestsTable.createdAt))
      : [];
  } else {
    // Investors only see their own requests. Confidential deal titles stay
    // masked until the NDA is signed.
    const rows = await db
      .select({
        request: accessRequestsTable,
        confidential: dealsTable.confidential,
        assetClass: dealsTable.assetClass,
      })
      .from(accessRequestsTable)
      .leftJoin(dealsTable, eq(accessRequestsTable.dealId, dealsTable.id))
      .where(eq(accessRequestsTable.requesterUserId, req.user.id))
      .orderBy(desc(accessRequestsTable.createdAt));
    requests = rows.map(({ request, confidential, assetClass }) =>
      confidential && request.status !== "nda_signed"
        ? {
            ...request,
            dealTitle: `Confidential ${assetClass ?? ""} Opportunity`.replace("  ", " "),
          }
        : request,
    );
  }

  res.json(ListAccessRequestsResponse.parse(toJson(requests)));
});

router.patch("/access-requests/:id", async (req, res): Promise<void> => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = UpdateAccessRequestParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdateAccessRequestBody.safeParse(req.body);
  if (!body.success || !VALID_STATUSES.includes(body.data.status)) {
    res.status(400).json({ error: "Invalid status" });
    return;
  }

  const [existing] = await db
    .select()
    .from(accessRequestsTable)
    .where(eq(accessRequestsTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Access request not found" });
    return;
  }

  const [deal] = await db
    .select()
    .from(dealsTable)
    .where(eq(dealsTable.id, existing.dealId));

  // Only the listing broker may advance the NDA lifecycle. Legacy seed deals
  // (no owner) are manageable by any broker-role user.
  const isListingBroker =
    deal != null &&
    (deal.brokerUserId === req.user.id ||
      (deal.brokerUserId == null && req.user.role === "broker"));

  if (!isListingBroker) {
    res
      .status(403)
      .json({ error: "Only the listing broker can manage this request" });
    return;
  }

  const [request] = await db
    .update(accessRequestsTable)
    .set({ status: body.data.status })
    .where(eq(accessRequestsTable.id, params.data.id))
    .returning();

  if (body.data.status === "nda_signed") {
    await db.insert(activityTable).values({
      type: "nda_signed",
      description: `${request.requesterName} signed the NDA for ${request.dealTitle}`,
    });
  }

  res.json(UpdateAccessRequestResponse.parse(toJson(request)));
});

export default router;
