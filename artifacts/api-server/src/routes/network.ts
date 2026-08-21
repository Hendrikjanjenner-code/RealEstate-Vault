import { toJson } from "../lib/serialize";
import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import {
  db,
  brokersTable,
  mandatesTable,
  transactionsTable,
  activityTable,
} from "@workspace/db";
import {
  ListBrokersResponse,
  GetBrokerParams,
  GetBrokerResponse,
  ListMandatesResponse,
  CreateMandateBody,
  CreateMandateResponse,
  ListTransactionsResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/brokers", async (_req, res): Promise<void> => {
  const brokers = await db
    .select()
    .from(brokersTable)
    .orderBy(desc(brokersTable.score));

  res.json(ListBrokersResponse.parse(toJson(brokers)));
});

router.get("/brokers/:id", async (req, res): Promise<void> => {
  const params = GetBrokerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [broker] = await db
    .select()
    .from(brokersTable)
    .where(eq(brokersTable.id, params.data.id));

  if (!broker) {
    res.status(404).json({ error: "Broker not found" });
    return;
  }

  res.json(GetBrokerResponse.parse(toJson(broker)));
});

router.get("/mandates", async (_req, res): Promise<void> => {
  const mandates = await db
    .select()
    .from(mandatesTable)
    .orderBy(desc(mandatesTable.createdAt));

  res.json(ListMandatesResponse.parse(toJson(mandates)));
});

router.post("/mandates", async (req, res): Promise<void> => {
  const parsed = CreateMandateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [mandate] = await db
    .insert(mandatesTable)
    .values({ ...parsed.data, status: "active", matches: 0 })
    .returning();

  await db.insert(activityTable).values({
    type: "mandate_created",
    description: `New mandate: ${mandate.title} (${mandate.investorName})`,
  });

  res.status(201).json(CreateMandateResponse.parse(toJson(mandate)));
});

router.get("/transactions", async (_req, res): Promise<void> => {
  const transactions = await db
    .select()
    .from(transactionsTable)
    .orderBy(desc(transactionsTable.closedAt));

  res.json(ListTransactionsResponse.parse(toJson(transactions)));
});

export default router;
