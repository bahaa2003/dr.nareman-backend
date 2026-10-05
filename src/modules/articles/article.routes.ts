import { Router } from "express";

import { validateParams, validateQuery } from "../../middleware/validate.middleware.js";
import { getPublicArticle, listPublicArticles } from "./article.controller.js";
import { publicArticleListQuerySchema, publicArticleSlugParamsSchema } from "./article.schema.js";

export const publicArticleRouter = Router();

publicArticleRouter.get("/", validateQuery(publicArticleListQuerySchema), listPublicArticles);
publicArticleRouter.get("/:slug", validateParams(publicArticleSlugParamsSchema), getPublicArticle);
