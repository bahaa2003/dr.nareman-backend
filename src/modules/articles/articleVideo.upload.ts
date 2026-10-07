import multer from "multer";

import { AppError } from "../../shared/errors/AppError.js";
import { articleVideoUploadMaxBytes, localMediaStorage } from "../media/localMediaStorage.js";

export const articleVideoUpload = multer({
  storage: multer.diskStorage({
    destination: (_request, _file, callback) => callback(null, localMediaStorage.articleVideoTemporaryDirectory),
    filename: (_request, _file, callback) => callback(null, localMediaStorage.createArticleVideoTemporaryFilename())
  }),
  limits: {
    fileSize: articleVideoUploadMaxBytes,
    files: 1
  },
  fileFilter: (_request, file, callback) => {
    if (file.mimetype === "video/mp4" || file.mimetype === "video/webm") {
      callback(null, true);
      return;
    }

    callback(new AppError("Only MP4 and WebM videos are supported", 415));
  }
});
