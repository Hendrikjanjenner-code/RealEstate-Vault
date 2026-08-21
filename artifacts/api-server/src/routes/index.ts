import { Router, type IRouter } from "express";
import healthRouter from "./health";
import dealsRouter from "./deals";
import accessRequestsRouter from "./access-requests";
import networkRouter from "./network";
import messagesRouter from "./messages";
import dashboardRouter from "./dashboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use(dealsRouter);
router.use(accessRequestsRouter);
router.use(networkRouter);
router.use(messagesRouter);
router.use(dashboardRouter);

export default router;
