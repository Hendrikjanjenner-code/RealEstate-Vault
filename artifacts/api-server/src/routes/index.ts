import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import dealsRouter from "./deals";
import accessRequestsRouter from "./access-requests";
import networkRouter from "./network";
import messagesRouter from "./messages";
import dashboardRouter from "./dashboard";

const router: IRouter = Router();

// Public routes
router.use(healthRouter);
router.use(authRouter);

// Everything below requires an authenticated user.
function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}
router.use(requireAuth);

router.use(dealsRouter);
router.use(accessRequestsRouter);
router.use(networkRouter);
router.use(messagesRouter);
router.use(dashboardRouter);

export default router;
