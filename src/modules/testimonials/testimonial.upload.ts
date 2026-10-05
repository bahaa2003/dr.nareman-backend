import multer from "multer";

import { articleCoverUploadMaxBytes } from "../media/localMediaStorage.js";

export const testimonialImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: articleCoverUploadMaxBytes, files: 1 }
});
