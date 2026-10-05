import type { SafeAdminIdentity } from "../modules/adminAuth/adminAuth.types.js";

declare global {
  namespace Express {
    interface Request {
      admin?: SafeAdminIdentity;
    }
  }
}

export {};
