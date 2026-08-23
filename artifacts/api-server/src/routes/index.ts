import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import dealsRouter from "./deals";
import accessRequestsRouter from "./access-requests";
import networkRouter from "./network";
import professionalsRouter from "./professionals";
import dealTeamRouter from "./deal-team";
import dealAdvisoryRouter from "./deal-advisory";
import dealAiRouter from "./deal-ai";
import messagesRouter from "./messages";
import ownerNetworkRouter from "./owner-network";
import dashboardRouter from "./dashboard";
import notificationsRouter from "./notifications";
import storageRouter from "./storage";
import publicRouter from "./public";

const router: IRouter = Router();

// Public routes
router.use(healthRouter);
router.use(authRouter);
router.use(publicRouter);

// Storage routes use their own broker auth, not the session-based requireAuth.
router.use(storageRouter);

// Deals and access-requests have per-route auth (public listing, anonymous
// access-request creation, broker-only upload, etc.) — must come before
// the blanket requireAuth wall.
router.use(dealsRouter);
router.use(accessRequestsRouter);

// Everything below requires an authenticated user.
function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}
router.use(requireAuth);

router.use(networkRouter);
router.use(professionalsRouter);
router.use(dealTeamRouter);
router.use(dealAdvisoryRouter);
router.use(dealAiRouter);
router.use(ownerNetworkRouter);
router.use(messagesRouter);
router.use(dashboardRouter);
router.use(notificationsRouter);

export default router;
