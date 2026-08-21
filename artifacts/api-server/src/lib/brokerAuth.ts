import { createHmac, timingSafeEqual } from "crypto";
import type { Request, Response, NextFunction } from "express";

const COOKIE_NAME = "broker_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET is not configured");
  return s;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function mintBrokerCookie(res: Response): void {
  const payload = `broker.${Date.now() + SESSION_TTL_MS}`;
  res.cookie(COOKIE_NAME, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: "lax",
    // Secure by default; local development (plain-HTTP dev proxy/localhost)
    // is the only explicit exception, since Secure cookies are dropped there.
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_TTL_MS,
    path: "/",
  });
}

export function clearBrokerCookie(res: Response): void {
  res.clearCookie(COOKIE_NAME, { path: "/" });
}

export function isBroker(req: Request): boolean {
  // 1. Cookie-based session (UI sign-in flow).
  const raw = (req as Request & { cookies?: Record<string, string> }).cookies?.[
    COOKIE_NAME
  ];
  if (raw) {
    const idx = raw.lastIndexOf(".");
    if (idx > 0) {
      const payload = raw.slice(0, idx);
      const mac = raw.slice(idx + 1);
      const expected = sign(payload);
      const a = Buffer.from(mac);
      const b = Buffer.from(expected);
      if (a.length === b.length && timingSafeEqual(a, b)) {
        const [role, expiry] = payload.split(".");
        if (role === "broker" && Number(expiry) > Date.now()) return true;
      }
    }
  }

  // 2. Header-based passcode (test / API-client flow where cookie management
  //    is not reliable).  Never exposed in the OpenAPI spec.
  const headerPasscode = req.headers["x-broker-passcode"];
  if (typeof headerPasscode === "string" && headerPasscode) {
    return verifyBrokerPasscode(headerPasscode);
  }

  return false;
}

// Broker-only gate for administrative and upload endpoints.
// TODO(auth): replace with per-user sessions and deal ownership once the
// real-accounts work (Task 1) merges.
export function requireBroker(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!isBroker(req)) {
    res.status(401).json({ error: "Broker sign-in required" });
    return;
  }
  next();
}

export function verifyBrokerPasscode(passcode: string): boolean {
  const expected = process.env.BROKER_PASSCODE;
  if (!expected) return false;
  const a = Buffer.from(passcode);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
