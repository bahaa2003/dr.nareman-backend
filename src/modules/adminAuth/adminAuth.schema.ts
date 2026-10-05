import { z } from "zod";

const emailSchema = z.string().trim().toLowerCase().email().max(254);

export const loginSchema = z.strictObject({
  email: emailSchema,
  password: z.string().min(1).max(1_024)
});

export const provisionAdminSchema = z.strictObject({
  email: emailSchema,
  password: z.string().min(12).max(1_024)
});

export type LoginInput = z.infer<typeof loginSchema>;
export type ProvisionAdminInput = z.infer<typeof provisionAdminSchema>;
