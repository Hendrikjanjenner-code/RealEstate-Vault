import { toJson } from "../lib/serialize";
import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { db, accessRequestsTable, activityTable } from "@workspace/db";
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

router.get("/access-requests", async (_req, res): Promise<void> => {
  const requests = await db
    .select()
    .from(accessRequestsTable)
    .orderBy(desc(accessRequestsTable.createdAt));

  res.json(ListAccessRequestsResponse.parse(toJson(requests)));
});

router.patch("/access-requests/:id", async (req, res): Promise<void> => {
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

  const [request] = await db
    .update(accessRequestsTable)
    .set({ status: body.data.status })
    .where(eq(accessRequestsTable.id, params.data.id))
    .returning();

  if (!request) {
    res.status(404).json({ error: "Access request not found" });
    return;
  }

  if (body.data.status === "nda_signed") {
    await db.insert(activityTable).values({
      type: "nda_signed",
      description: `${request.requesterName} signed the NDA for ${request.dealTitle}`,
    });
  }

  res.json(UpdateAccessRequestResponse.parse(toJson(request)));
});

export default router;
