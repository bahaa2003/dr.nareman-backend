import { Router } from "express";

import { getDatabaseReadiness } from "../config/database.js";
import { env } from "../config/env.js";
import { createDocumentationRouter } from "../docs/docs.routes.js";
import { adminAuthRouter } from "../modules/adminAuth/adminAuth.routes.js";
import { adminArticleRouter } from "../modules/articles/articleAdmin.routes.js";
import { publicArticleRouter } from "../modules/articles/article.routes.js";
import { adminLeadRouter, publicLeadRouter } from "../modules/leads/lead.routes.js";
import { adminTestimonialRouter, publicTestimonialRouter } from "../modules/testimonials/testimonial.routes.js";
import { adminWeeklyLiveRouter, publicWeeklyLiveRouter } from "../modules/weeklyLive/weeklyLive.routes.js";

export const apiRouter = Router();

apiRouter.use(createDocumentationRouter(env.apiDocsEnabled));

apiRouter.get("/health", (_request, response) => {
  response.status(200).json({
    success: true,
    status: "ok",
    database: getDatabaseReadiness() ? "connected" : "unavailable"
  });
});

apiRouter.use("/admin/auth", adminAuthRouter);
apiRouter.use("/admin/articles", adminArticleRouter);
apiRouter.use("/admin/weekly-live", adminWeeklyLiveRouter);
apiRouter.use("/admin/testimonials", adminTestimonialRouter);
apiRouter.use("/admin/leads", adminLeadRouter);
apiRouter.use("/articles", publicArticleRouter);
apiRouter.use("/testimonials", publicTestimonialRouter);
apiRouter.use("/weekly-live", publicWeeklyLiveRouter);
apiRouter.use("/leads", publicLeadRouter);
