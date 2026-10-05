import { Router } from "express";
import swaggerUi from "swagger-ui-express";

import { openApiDocument } from "./openapi.js";

export function createDocumentationRouter(isEnabled: boolean): Router {
  const documentationRouter = Router();

  if (!isEnabled) {
    return documentationRouter;
  }

  documentationRouter.get("/docs.json", (_request, response) => {
    response.status(200).json(openApiDocument);
  });
  documentationRouter.get(
    "/docs",
    swaggerUi.setup(openApiDocument, {
      swaggerOptions: {
        url: "/api/docs.json"
      }
    })
  );
  documentationRouter.use("/docs", swaggerUi.serve);

  return documentationRouter;
}
