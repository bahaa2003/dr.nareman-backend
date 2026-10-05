import { connectDatabase, disconnectDatabase } from "../config/database.js";
import { logger } from "../utils/logger.js";
import { provisionAdminSchema } from "../modules/adminAuth/adminAuth.schema.js";
import { AdminAlreadyExistsError, provisionAdmin } from "../modules/adminAuth/adminAuth.service.js";

async function main(): Promise<void> {
  const input = provisionAdminSchema.safeParse({
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_INITIAL_PASSWORD
  });

  if (!input.success) {
    logger.error("Invalid admin provisioning input");
    process.exitCode = 1;
    return;
  }

  try {
    await connectDatabase();
    const admin = await provisionAdmin(input.data);
    logger.info({ adminId: admin.id, email: admin.email }, "Admin provisioned");
  } catch (error) {
    if (error instanceof AdminAlreadyExistsError) {
      logger.error("Admin provisioning refused because the email already exists");
    } else {
      logger.error(
        { errorName: error instanceof Error ? error.name : "UnknownError" },
        "Admin provisioning failed"
      );
    }

    process.exitCode = 1;
  } finally {
    try {
      await disconnectDatabase();
    } catch (error) {
      logger.error(
        { errorName: error instanceof Error ? error.name : "UnknownError" },
        "MongoDB disconnect failed after provisioning"
      );
      process.exitCode = 1;
    }
  }
}

void main();
