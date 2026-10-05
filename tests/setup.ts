import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.NODE_ENV = "test";
process.env.MONGODB_URI = "mongodb://127.0.0.1:27017/dr_nareman_test_placeholder";
process.env.ALLOWED_ORIGINS = "http://localhost:3000";
process.env.ADMIN_SESSION_TTL_HOURS = "168";
process.env.UPLOAD_ROOT_DIR ??= join(tmpdir(), `dr-nareman-backend-test-uploads-${process.pid}`);
