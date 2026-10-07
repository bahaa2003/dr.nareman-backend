const errorResponse = (description: string) => ({
  description,
  content: {
    "application/json": {
      schema: { $ref: "#/components/schemas/ErrorResponse" }
    }
  }
});

const internalServerError = {
  "500": errorResponse("Unexpected internal server error.")
};

const articleIdParameter = {
  name: "id",
  in: "path",
  required: true,
  description: "MongoDB ObjectId of the Article.",
  schema: {
    type: "string",
    pattern: "^[a-fA-F0-9]{24}$",
    example: "65c5f8f8a9197a79a85e51d2"
  }
};

const adminSecurity = [{ AdminSessionCookie: [] }];

export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "Dr. Nareman Backend API",
    version: "1.0.0",
    description:
      "API for public Article content and authenticated Admin content management, including local Article cover media. Admin endpoints use an opaque HttpOnly session cookie; no JWT or bearer-token authentication is provided."
  },
  servers: [
    {
      url: "/",
      description: "Portable relative server URL"
    }
  ],
  tags: [
    { name: "Health", description: "Lightweight application readiness information." },
    { name: "Admin Authentication", description: "Admin cookie-session authentication." },
    { name: "Public Articles", description: "Published Article content only." },
    { name: "Admin Articles", description: "Authenticated Article content management." },
    { name: "Article Media", description: "Authenticated Article cover-image and video management." },
    { name: "Public Testimonials", description: "Visible, privacy-confirmed testimonial screenshots only." },
    { name: "Admin Testimonials", description: "Authenticated testimonial screenshot management." },
    { name: "Public Leads", description: "Privacy-notice accepted marketing lead capture." },
    { name: "Admin Leads", description: "Authenticated marketing lead management and export." },
    { name: "Public Weekly Live", description: "Public weekly live discovery and consent-based question submission." },
    { name: "Admin Weekly Live", description: "Authenticated weekly live event management." },
    { name: "Admin Weekly Live Questions", description: "Authenticated weekly live question moderation." }
  ],
  paths: {
    "/api/health": {
      get: {
        tags: ["Health"],
        operationId: "getHealth",
        summary: "Get backend health",
        responses: {
          "200": {
            description: "Backend is responding. Database readiness reflects the current Mongoose connection state.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/HealthResponse" }
              }
            }
          },
          ...internalServerError
        }
      }
    },
    "/api/admin/auth/login": {
      post: {
        tags: ["Admin Authentication"],
        operationId: "loginAdmin",
        summary: "Create an Admin session",
        description:
          "Valid credentials create a fresh opaque session. The raw session token is set only in the HttpOnly cookie and is never returned in JSON.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/AdminLoginInput" },
              example: {
                email: "editor@example.com",
                password: "example-password-not-a-real-secret"
              }
            }
          }
        },
        responses: {
          "200": {
            description: "Authenticated Admin identity. Sets the `dr_nareman_admin_session` HttpOnly cookie.",
            headers: {
              "Set-Cookie": {
                description:
                  "Opaque HttpOnly Admin session cookie. Secure in production, SameSite=Lax, and scoped to `/api/admin`.",
                schema: { type: "string" }
              }
            },
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AdminIdentityResponse" }
              }
            }
          },
          "400": errorResponse("Invalid login request body."),
          "401": errorResponse("Generic invalid-credentials response; does not disclose whether the email exists."),
          "429": errorResponse("Too many login attempts."),
          ...internalServerError
        }
      }
    },
    "/api/admin/auth/logout": {
      post: {
        tags: ["Admin Authentication"],
        operationId: "logoutAdmin",
        summary: "Revoke and clear the current Admin session",
        description:
          "If a session cookie is present, its matching session is revoked. The cookie is cleared in all cases, so logout is cookie-optional and idempotent.",
        responses: {
          "204": {
            description: "Session cookie cleared; no response body.",
            headers: {
              "Set-Cookie": {
                description: "Clears the Admin session cookie using its original cookie scope.",
                schema: { type: "string" }
              }
            }
          },
          ...internalServerError
        }
      }
    },
    "/api/admin/auth/me": {
      get: {
        tags: ["Admin Authentication"],
        operationId: "getCurrentAdmin",
        summary: "Get the authenticated Admin identity",
        security: adminSecurity,
        responses: {
          "200": {
            description: "Safe Admin identity.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AdminIdentityResponse" }
              }
            }
          },
          "401": errorResponse("Missing, expired, revoked, or inactive Admin session."),
          ...internalServerError
        }
      }
    },
    "/api/articles": {
      get: {
        tags: ["Public Articles"],
        operationId: "listPublishedArticles",
        summary: "List published Articles",
        description:
          "Returns published Articles only, sorted by `publishedAt` descending and then `_id` descending. Full Article `content` is intentionally excluded.",
        parameters: [
          {
            name: "page",
            in: "query",
            description: "One-based page number. Defaults to 1.",
            schema: { type: "integer", minimum: 1, default: 1 }
          },
          {
            name: "limit",
            in: "query",
            description: "Maximum number of items. Defaults to 10; maximum is 50.",
            schema: { type: "integer", minimum: 1, maximum: 50, default: 10 }
          },
          {
            name: "category",
            in: "query",
            description: "Optional exact, trimmed category match.",
            schema: { type: "string", minLength: 1, maxLength: 80, example: "صحة المرأة" }
          }
        ],
        responses: {
          "200": {
            description: "Published Article page.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/PublicArticleListResponse" }
              }
            }
          },
          "400": errorResponse("Invalid pagination or category query parameter."),
          ...internalServerError
        }
      }
    },
    "/api/articles/{slug}": {
      get: {
        tags: ["Public Articles"],
        operationId: "getPublishedArticleBySlug",
        summary: "Get a published Article by slug",
        description:
          "Supports Unicode Arabic and mixed Arabic/Latin slugs. Drafts intentionally return the same 404 contract as unknown Articles.",
        parameters: [
          {
            name: "slug",
            in: "path",
            required: true,
            description: "URL-safe Article slug. URL-encode Unicode characters in requests.",
            schema: {
              type: "string",
              minLength: 1,
              maxLength: 220,
              example: "متابعة-التبويض-خطوة-بخطوة"
            }
          }
        ],
        responses: {
          "200": {
            description: "Published Article, including Markdown-compatible canonical content.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ArticleDetailResponse" }
              }
            }
          },
          "400": errorResponse("Invalid slug encoding or parameter."),
          "404": errorResponse("Article does not exist or is not published."),
          ...internalServerError
        }
      }
    },
    "/api/admin/articles": {
      get: {
        tags: ["Admin Articles"],
        operationId: "listAdminArticles",
        summary: "List all Articles for Admins",
        description:
          "Includes draft and published Articles, sorted by `updatedAt` descending and then `_id` descending. Full Article `content` is intentionally excluded.",
        security: adminSecurity,
        parameters: [
          {
            name: "page",
            in: "query",
            description: "One-based page number. Defaults to 1.",
            schema: { type: "integer", minimum: 1, default: 1 }
          },
          {
            name: "limit",
            in: "query",
            description: "Maximum number of items. Defaults to 20; maximum is 100.",
            schema: { type: "integer", minimum: 1, maximum: 100, default: 20 }
          },
          {
            name: "status",
            in: "query",
            schema: { $ref: "#/components/schemas/ArticleStatus" }
          },
          {
            name: "category",
            in: "query",
            description: "Optional exact, trimmed category match.",
            schema: { type: "string", minLength: 1, maxLength: 80 }
          },
          {
            name: "search",
            in: "query",
            description: "Case-insensitive literal search against title and excerpt.",
            schema: { type: "string", minLength: 1, maxLength: 100 }
          }
        ],
        responses: {
          "200": {
            description: "Admin Article page.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AdminArticleListResponse" }
              }
            }
          },
          "400": errorResponse("Invalid Admin list query parameter."),
          "401": errorResponse("Missing, expired, revoked, or inactive Admin session."),
          ...internalServerError
        }
      },
      post: {
        tags: ["Admin Articles"],
        operationId: "createAdminArticle",
        summary: "Create an Article",
        description:
          "Creates a draft by default. A supplied `published` status publishes immediately. The slug is generated from the title when omitted; reading time is derived server-side. Cover images cannot be set through this JSON endpoint.",
        security: adminSecurity,
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/AdminArticleCreateInput" },
              example: {
                title: "متابعة التبويض خطوة بخطوة",
                excerpt: "دليل مختصر لمتابعة التبويض.",
                content: "# متابعة التبويض\n\nمحتوى متوافق مع Markdown.",
                category: "صحة المرأة",
                status: "draft",
                seoTitle: "متابعة التبويض"
              }
            }
          }
        },
        responses: {
          "201": {
            description: "Article created.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ArticleDetailResponse" }
              }
            }
          },
          "400": errorResponse("Invalid Article input."),
          "401": errorResponse("Missing, expired, revoked, or inactive Admin session."),
          "403": errorResponse("Untrusted browser Origin for an unsafe Admin request."),
          "409": errorResponse("An explicitly supplied slug already exists."),
          ...internalServerError
        }
      }
    },
    "/api/admin/articles/{id}": {
      get: {
        tags: ["Admin Articles"],
        operationId: "getAdminArticle",
        summary: "Get an Article by id",
        description: "Returns the full safe Article DTO. Drafts are visible to authenticated Admins.",
        security: adminSecurity,
        parameters: [articleIdParameter],
        responses: {
          "200": {
            description: "Full safe Article DTO.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ArticleDetailResponse" }
              }
            }
          },
          "400": errorResponse("Malformed Article ObjectId."),
          "401": errorResponse("Missing, expired, revoked, or inactive Admin session."),
          "404": errorResponse("Article not found."),
          ...internalServerError
        }
      },
      patch: {
        tags: ["Admin Articles"],
        operationId: "updateAdminArticle",
        summary: "Partially update an Article",
        description:
          "At least one supported property is required. Title-only updates preserve the existing slug; an explicitly supplied slug is normalized. Reading time is recalculated when content changes. Publishing sets `publishedAt` when absent, while normal published edits preserve it. Cover images cannot be changed through this JSON endpoint.",
        security: adminSecurity,
        parameters: [articleIdParameter],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/AdminArticleUpdateInput" }
            }
          }
        },
        responses: {
          "200": {
            description: "Updated Article.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ArticleDetailResponse" }
              }
            }
          },
          "400": errorResponse("Malformed ObjectId, empty update, or invalid Article input."),
          "401": errorResponse("Missing, expired, revoked, or inactive Admin session."),
          "403": errorResponse("Untrusted browser Origin for an unsafe Admin request."),
          "404": errorResponse("Article not found."),
          "409": errorResponse("Explicit slug already exists."),
          ...internalServerError
        }
      },
      delete: {
        tags: ["Admin Articles"],
        operationId: "deleteAdminArticle",
        summary: "Hard-delete an Article",
        description:
          "Permanently deletes the Article. Managed local cover media and video files are cleaned up after the database document is deleted.",
        security: adminSecurity,
        parameters: [articleIdParameter],
        responses: {
          "204": { description: "Article deleted; no response body." },
          "400": errorResponse("Malformed Article ObjectId."),
          "401": errorResponse("Missing, expired, revoked, or inactive Admin session."),
          "403": errorResponse("Untrusted browser Origin for an unsafe Admin request."),
          "404": errorResponse("Article not found."),
          ...internalServerError
        }
      }
    },
    "/api/admin/articles/{id}/cover-image": {
      put: {
        tags: ["Article Media"],
        operationId: "replaceArticleCoverImage",
        summary: "Upload or replace an Article cover image",
        description:
          "Accepts JPEG, PNG, or WebP input up to 5 MB. The image is decoded and normalized to managed WebP media; the response exposes only the generated `/uploads/articles/<generated>.webp` URL.",
        security: adminSecurity,
        parameters: [articleIdParameter],
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: { $ref: "#/components/schemas/CoverImageUploadInput" }
            }
          }
        },
        responses: {
          "200": {
            description: "Updated Article with cover-image metadata.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ArticleDetailResponse" }
              }
            }
          },
          "400": errorResponse("Missing image, invalid image upload, invalid alt text, or malformed ObjectId."),
          "401": errorResponse("Missing, expired, revoked, or inactive Admin session."),
          "403": errorResponse("Untrusted browser Origin for an unsafe Admin request."),
          "404": errorResponse("Article not found."),
          "413": errorResponse("Image file exceeds the 5 MB input limit."),
          "415": errorResponse("Unsupported or invalid image format."),
          ...internalServerError
        }
      },
      patch: {
        tags: ["Article Media"],
        operationId: "updateArticleCoverAlt",
        summary: "Update Article cover alt text",
        security: adminSecurity,
        parameters: [articleIdParameter],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CoverImageAltInput" },
              example: { alt: "صورة توضيحية لمتابعة التبويض" }
            }
          }
        },
        responses: {
          "200": {
            description: "Updated Article.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ArticleDetailResponse" }
              }
            }
          },
          "400": errorResponse("Malformed ObjectId or invalid alt text."),
          "401": errorResponse("Missing, expired, revoked, or inactive Admin session."),
          "403": errorResponse("Untrusted browser Origin for an unsafe Admin request."),
          "404": errorResponse("Article or Article cover image not found."),
          ...internalServerError
        }
      },
      delete: {
        tags: ["Article Media"],
        operationId: "deleteArticleCoverImage",
        summary: "Remove an Article cover image",
        description:
          "Clears Article cover metadata and attempts managed local-media cleanup. If no cover is set, the unchanged Article is returned.",
        security: adminSecurity,
        parameters: [articleIdParameter],
        responses: {
          "200": {
            description: "Updated Article.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ArticleDetailResponse" }
              }
            }
          },
          "400": errorResponse("Malformed Article ObjectId."),
          "401": errorResponse("Missing, expired, revoked, or inactive Admin session."),
          "403": errorResponse("Untrusted browser Origin for an unsafe Admin request."),
          "404": errorResponse("Article not found."),
          ...internalServerError
        }
      }
    },
    "/api/admin/articles/{id}/videos": {
      post: {
        tags: ["Article Media"],
        operationId: "uploadArticleVideo",
        summary: "Upload one Article video",
        description: "Streams one MP4 or WebM upload to managed disk storage. The per-file limit is exactly 1 GiB. The server checks the declared MIME type and container signature, but does not perform codec validation or transcoding.",
        security: adminSecurity,
        parameters: [articleIdParameter],
        requestBody: { required: true, content: { "multipart/form-data": { schema: { $ref: "#/components/schemas/ArticleVideoUploadInput" } } } },
        responses: {
          "201": { description: "Updated Article with safe video metadata.", content: { "application/json": { schema: { $ref: "#/components/schemas/ArticleDetailResponse" } } } },
          "400": errorResponse("Missing video or malformed Article ObjectId."),
          "401": errorResponse("Missing, expired, revoked, or inactive Admin session."),
          "403": errorResponse("Untrusted browser Origin for an unsafe Admin request."),
          "404": errorResponse("Article not found."),
          "413": errorResponse("Video file exceeds the 1 GiB limit."),
          "415": errorResponse("Unsupported MIME type or invalid MP4/WebM container signature."),
          ...internalServerError
        }
      }
    },
    "/api/admin/articles/{id}/videos/{videoId}": {
      delete: {
        tags: ["Article Media"],
        operationId: "deleteArticleVideo",
        summary: "Remove an Article video",
        security: adminSecurity,
        parameters: [articleIdParameter, { name: "videoId", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: {
          "200": { description: "Updated Article.", content: { "application/json": { schema: { $ref: "#/components/schemas/ArticleDetailResponse" } } } },
          "400": errorResponse("Malformed Article or video id."),
          "401": errorResponse("Missing, expired, revoked, or inactive Admin session."),
          "403": errorResponse("Untrusted browser Origin for an unsafe Admin request."),
          "404": errorResponse("Article or Article video not found."),
          ...internalServerError
        }
      }
    },
    "/api/testimonials": {
      get: {
        tags: ["Public Testimonials"], operationId: "listPublicTestimonials", summary: "List visible approved testimonial screenshots",
        description: "Returns at most the requested number of visible testimonials that retain both server-recorded privacy and publication confirmations. Ordered by sortOrder then id.",
        parameters: [{ name: "limit", in: "query", description: "Defaults to 10; maximum is 30.", schema: { type: "integer", minimum: 1, maximum: 30, default: 10 } }],
        responses: { "200": { description: "Minimal public testimonial collection.", content: { "application/json": { schema: { $ref: "#/components/schemas/PublicTestimonialListResponse" } } } }, "400": errorResponse("Invalid limit."), ...internalServerError }
      }
    },
    "/api/admin/testimonials": {
      get: {
        tags: ["Admin Testimonials"], operationId: "listAdminTestimonials", summary: "List testimonial screenshots", security: adminSecurity,
        parameters: [{ name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } }, { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 20 } }, { name: "isVisible", in: "query", schema: { type: "boolean" } }],
        responses: { "200": { description: "Paginated Admin testimonial list ordered by sortOrder then id.", content: { "application/json": { schema: { $ref: "#/components/schemas/AdminTestimonialListResponse" } } } }, "400": errorResponse("Invalid query."), "401": errorResponse("Missing or invalid Admin session."), ...internalServerError }
      },
      post: {
        tags: ["Admin Testimonials"], operationId: "createAdminTestimonial", summary: "Upload a publication-safe testimonial screenshot", security: adminSecurity,
        description: "Requires explicit privacy and publication attestations. JPEG, PNG, and WebP up to 5 MB are decoded, metadata-stripped, and stored as generated WebP. New records are always hidden.",
        requestBody: { required: true, content: { "multipart/form-data": { schema: { $ref: "#/components/schemas/TestimonialUploadInput" } } } },
        responses: { "201": { description: "Hidden testimonial created.", content: { "application/json": { schema: { $ref: "#/components/schemas/AdminTestimonialResponse" } } } }, "400": errorResponse("Missing image, attestation, or invalid multipart fields."), "401": errorResponse("Missing or invalid Admin session."), "403": errorResponse("Untrusted browser Origin."), "413": errorResponse("Image exceeds 5 MB."), "415": errorResponse("Unsupported or invalid image."), ...internalServerError }
      }
    },
    "/api/admin/testimonials/{id}": {
      get: { tags: ["Admin Testimonials"], operationId: "getAdminTestimonial", summary: "Get a testimonial screenshot", security: adminSecurity, parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", pattern: "^[a-fA-F0-9]{24}$" } }], responses: { "200": { description: "Admin testimonial.", content: { "application/json": { schema: { $ref: "#/components/schemas/AdminTestimonialResponse" } } } }, "400": errorResponse("Invalid id."), "401": errorResponse("Missing or invalid Admin session."), "404": errorResponse("Testimonial not found."), ...internalServerError } },
      patch: { tags: ["Admin Testimonials"], operationId: "updateAdminTestimonial", summary: "Update testimonial alt text, visibility, or order", security: adminSecurity, parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", pattern: "^[a-fA-F0-9]{24}$" } }], requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/TestimonialUpdateInput" } } } }, responses: { "200": { description: "Updated testimonial.", content: { "application/json": { schema: { $ref: "#/components/schemas/AdminTestimonialResponse" } } } }, "400": errorResponse("Invalid update or an unconfirmed item cannot be visible."), "401": errorResponse("Missing or invalid Admin session."), "403": errorResponse("Untrusted browser Origin."), "404": errorResponse("Testimonial not found."), ...internalServerError } },
      delete: { tags: ["Admin Testimonials"], operationId: "deleteAdminTestimonial", summary: "Delete a testimonial screenshot", security: adminSecurity, parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", pattern: "^[a-fA-F0-9]{24}$" } }], responses: { "204": { description: "Record deleted; managed media cleanup is attempted afterwards." }, "400": errorResponse("Invalid id."), "401": errorResponse("Missing or invalid Admin session."), "403": errorResponse("Untrusted browser Origin."), "404": errorResponse("Testimonial not found."), ...internalServerError } }
    },
    "/api/admin/testimonials/{id}/image": {
      put: { tags: ["Admin Testimonials"], operationId: "replaceAdminTestimonialImage", summary: "Replace a testimonial screenshot", security: adminSecurity, description: "Requires both attestations again. New media is persisted before the database reference changes; prior managed media is cleaned only after successful persistence.", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", pattern: "^[a-fA-F0-9]{24}$" } }], requestBody: { required: true, content: { "multipart/form-data": { schema: { $ref: "#/components/schemas/TestimonialUploadInput" } } } }, responses: { "200": { description: "Updated testimonial.", content: { "application/json": { schema: { $ref: "#/components/schemas/AdminTestimonialResponse" } } } }, "400": errorResponse("Invalid id, file, or attestations."), "401": errorResponse("Missing or invalid Admin session."), "403": errorResponse("Untrusted browser Origin."), "404": errorResponse("Testimonial not found."), "413": errorResponse("Image exceeds 5 MB."), "415": errorResponse("Unsupported or invalid image."), ...internalServerError } }
    },
    "/api/leads": {
      post: {
        tags: ["Public Leads"], operationId: "createPublicLead", summary: "Create a privacy-notice accepted marketing lead",
        description: "Anonymous rate-limited lead capture. Contact, consent, source, and bounded attribution fields only; health answers and client timestamps are not accepted. The response deliberately contains only the generated lead id.",
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/PublicLeadCreateInput" } } } },
        responses: { "201": { description: "Lead stored.", content: { "application/json": { schema: { $ref: "#/components/schemas/PublicLeadCreateResponse" } } } }, "400": errorResponse("Invalid strict lead input or privacy notice not accepted."), "429": errorResponse("Too many lead submissions."), ...internalServerError }
      }
    },
    "/api/admin/leads": {
      get: {
        tags: ["Admin Leads"], operationId: "listAdminLeads", summary: "List marketing leads", security: adminSecurity,
        description: "Newest first, then id descending. Supports bounded pagination and exact source, status, marketing-consent, UTM campaign, and created-date filters.",
        parameters: [
          { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 20 } },
          { name: "source", in: "query", schema: { $ref: "#/components/schemas/LeadSource" } },
          { name: "status", in: "query", schema: { $ref: "#/components/schemas/LeadStatus" } },
          { name: "marketingConsent", in: "query", schema: { type: "boolean" } },
          { name: "utmCampaign", in: "query", schema: { type: "string", minLength: 1, maxLength: 200 } },
          { name: "dateFrom", in: "query", schema: { type: "string", format: "date-time" } },
          { name: "dateTo", in: "query", schema: { type: "string", format: "date-time" } }
        ],
        responses: { "200": { description: "Paginated Admin lead list.", content: { "application/json": { schema: { $ref: "#/components/schemas/AdminLeadListResponse" } } } }, "400": errorResponse("Invalid lead filters."), "401": errorResponse("Missing or invalid Admin session."), ...internalServerError }
      }
    },
    "/api/admin/leads/export.csv": {
      get: {
        tags: ["Admin Leads"], operationId: "exportAdminLeadsCsv", summary: "Export filtered leads as CSV", security: adminSecurity,
        description: "Uses the same filters as the Admin list. Export is capped at 1,000 rows, begins with a UTF-8 BOM, quotes CSV cells, and neutralizes formula-leading values.",
        parameters: [
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 1000, default: 1000 } },
          { name: "source", in: "query", schema: { $ref: "#/components/schemas/LeadSource" } },
          { name: "status", in: "query", schema: { $ref: "#/components/schemas/LeadStatus" } },
          { name: "marketingConsent", in: "query", schema: { type: "boolean" } },
          { name: "utmCampaign", in: "query", schema: { type: "string", minLength: 1, maxLength: 200 } },
          { name: "dateFrom", in: "query", schema: { type: "string", format: "date-time" } },
          { name: "dateTo", in: "query", schema: { type: "string", format: "date-time" } }
        ],
        responses: { "200": { description: "UTF-8 BOM CSV attachment.", content: { "text/csv": { schema: { type: "string", format: "binary" } } } }, "400": errorResponse("Invalid export filters."), "401": errorResponse("Missing or invalid Admin session."), ...internalServerError }
      }
    },
    "/api/admin/leads/{id}": {
      get: {
        tags: ["Admin Leads"], operationId: "getAdminLead", summary: "Get one marketing lead", security: adminSecurity,
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", pattern: "^[a-fA-F0-9]{24}$" } }],
        responses: { "200": { description: "Admin lead.", content: { "application/json": { schema: { $ref: "#/components/schemas/AdminLeadResponse" } } } }, "400": errorResponse("Invalid lead id."), "401": errorResponse("Missing or invalid Admin session."), "404": errorResponse("Lead not found."), ...internalServerError }
      },
      patch: {
        tags: ["Admin Leads"], operationId: "updateAdminLeadStatus", summary: "Update one lead status", security: adminSecurity,
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", pattern: "^[a-fA-F0-9]{24}$" } }],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/AdminLeadStatusUpdateInput" } } } },
        responses: { "200": { description: "Updated Admin lead.", content: { "application/json": { schema: { $ref: "#/components/schemas/AdminLeadResponse" } } } }, "400": errorResponse("Invalid strict status update."), "401": errorResponse("Missing or invalid Admin session."), "403": errorResponse("Untrusted browser Origin."), "404": errorResponse("Lead not found."), ...internalServerError }
      },
      delete: {
        tags: ["Admin Leads"], operationId: "deleteAdminLead", summary: "Delete one marketing lead", security: adminSecurity,
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", pattern: "^[a-fA-F0-9]{24}$" } }],
        responses: { "204": { description: "Lead deleted; no response body." }, "400": errorResponse("Invalid lead id."), "401": errorResponse("Missing or invalid Admin session."), "403": errorResponse("Untrusted browser Origin."), "404": errorResponse("Lead not found."), ...internalServerError }
      }
    },
    "/api/weekly-live/current": {
      get: {
        tags: ["Public Weekly Live"], operationId: "getCurrentWeeklyLive", summary: "Get the currently visible weekly live",
        description: "Returns `live: null` when no event is promoted. The meeting URL is intentionally never included.",
        responses: { "200": { description: "Public-safe weekly live or null.", content: { "application/json": { schema: { $ref: "#/components/schemas/PublicWeeklyLiveCurrentResponse" } } } }, ...internalServerError }
      }
    },
    "/api/weekly-live/{id}/questions": {
      post: {
        tags: ["Public Weekly Live"], operationId: "submitWeeklyLiveQuestion", summary: "Submit a question and receive the join URL",
        description: "Requires separate question consent and privacy acknowledgement. The service creates a Weekly Live Lead internally with fixed source weekly_live, then persists the question; the join URL is returned only after both persist and is never returned by the current-live endpoint.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", pattern: "^[a-fA-F0-9]{24}$" } }],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/PublicWeeklyLiveQuestionInput" } } } },
        responses: { "201": { description: "Question stored and join URL released.", content: { "application/json": { schema: { $ref: "#/components/schemas/PublicWeeklyLiveSubmissionResponse" } } } }, "400": errorResponse("Invalid id or strict question input."), "404": errorResponse("Unknown or hidden weekly live."), "409": errorResponse("Questions are closed."), "429": errorResponse("Too many submission attempts."), ...internalServerError }
      }
    },
    "/api/admin/weekly-live": {
      get: {
        tags: ["Admin Weekly Live"], operationId: "listAdminWeeklyLives", summary: "List weekly live events", security: adminSecurity,
        parameters: [{ name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } }, { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 20 } }],
        responses: { "200": { description: "Paginated Admin event list.", content: { "application/json": { schema: { $ref: "#/components/schemas/AdminWeeklyLiveListResponse" } } } }, "401": errorResponse("Missing or invalid Admin session."), ...internalServerError }
      },
      post: {
        tags: ["Admin Weekly Live"], operationId: "createAdminWeeklyLive", summary: "Create a weekly live event", security: adminSecurity,
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/AdminWeeklyLiveCreateInput" } } } },
        responses: { "201": { description: "Created event.", content: { "application/json": { schema: { $ref: "#/components/schemas/AdminWeeklyLiveResponse" } } } }, "400": errorResponse("Invalid strict event input."), "401": errorResponse("Missing or invalid Admin session."), "403": errorResponse("Untrusted browser Origin."), ...internalServerError }
      }
    },
    "/api/admin/weekly-live/{id}": {
      get: { tags: ["Admin Weekly Live"], operationId: "getAdminWeeklyLive", summary: "Get a weekly live event", security: adminSecurity, parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Admin event.", content: { "application/json": { schema: { $ref: "#/components/schemas/AdminWeeklyLiveResponse" } } } }, "400": errorResponse("Invalid id."), "401": errorResponse("Missing or invalid Admin session."), "404": errorResponse("Weekly live not found."), ...internalServerError } },
      patch: { tags: ["Admin Weekly Live"], operationId: "updateAdminWeeklyLive", summary: "Update a weekly live event", security: adminSecurity, parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/AdminWeeklyLiveUpdateInput" } } } }, responses: { "200": { description: "Updated event.", content: { "application/json": { schema: { $ref: "#/components/schemas/AdminWeeklyLiveResponse" } } } }, "400": errorResponse("Invalid id or update."), "401": errorResponse("Missing or invalid Admin session."), "403": errorResponse("Untrusted browser Origin."), "404": errorResponse("Weekly live not found."), ...internalServerError } }
    },
    "/api/admin/weekly-live/{id}/questions": {
      get: {
        tags: ["Admin Weekly Live Questions"], operationId: "listAdminWeeklyLiveQuestions", summary: "List and filter questions for one event", security: adminSecurity,
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }, { name: "page", in: "query", schema: { type: "integer", minimum: 1 } }, { name: "limit", in: "query", schema: { type: "integer", maximum: 100 } }, { name: "status", in: "query", schema: { $ref: "#/components/schemas/WeeklyLiveQuestionStatus" } }, { name: "region", in: "query", schema: { type: "string" } }, { name: "city", in: "query", schema: { type: "string" } }, { name: "minAge", in: "query", schema: { type: "integer", minimum: 18, maximum: 100 } }, { name: "maxAge", in: "query", schema: { type: "integer", minimum: 18, maximum: 100 } }, { name: "dateFrom", in: "query", schema: { type: "string", format: "date-time" } }, { name: "dateTo", in: "query", schema: { type: "string", format: "date-time" } }, { name: "search", in: "query", schema: { type: "string", maxLength: 100 } }],
        responses: { "200": { description: "Filtered Admin-only question page.", content: { "application/json": { schema: { $ref: "#/components/schemas/AdminWeeklyLiveQuestionListResponse" } } } }, "400": errorResponse("Invalid filters."), "401": errorResponse("Missing or invalid Admin session."), "404": errorResponse("Weekly live not found."), ...internalServerError }
      }
    },
    "/api/admin/weekly-live/questions/{questionId}": {
      get: { tags: ["Admin Weekly Live Questions"], operationId: "getAdminWeeklyLiveQuestion", summary: "Get a submitted question", security: adminSecurity, parameters: [{ name: "questionId", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Admin question detail.", content: { "application/json": { schema: { $ref: "#/components/schemas/AdminWeeklyLiveQuestionResponse" } } } }, "400": errorResponse("Invalid id."), "401": errorResponse("Missing or invalid Admin session."), "404": errorResponse("Question not found."), ...internalServerError } },
      patch: { tags: ["Admin Weekly Live Questions"], operationId: "updateAdminWeeklyLiveQuestion", summary: "Moderate a submitted question", security: adminSecurity, parameters: [{ name: "questionId", in: "path", required: true, schema: { type: "string" } }], requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/AdminWeeklyLiveQuestionUpdateInput" } } } }, responses: { "200": { description: "Updated question status or moderated wording.", content: { "application/json": { schema: { $ref: "#/components/schemas/AdminWeeklyLiveQuestionResponse" } } } }, "400": errorResponse("Invalid strict update."), "401": errorResponse("Missing or invalid Admin session."), "403": errorResponse("Untrusted browser Origin."), "404": errorResponse("Question not found."), ...internalServerError } },
      delete: { tags: ["Admin Weekly Live Questions"], operationId: "deleteAdminWeeklyLiveQuestion", summary: "Delete a submitted question", security: adminSecurity, parameters: [{ name: "questionId", in: "path", required: true, schema: { type: "string" } }], responses: { "204": { description: "Question deleted; event remains." }, "400": errorResponse("Invalid id."), "401": errorResponse("Missing or invalid Admin session."), "403": errorResponse("Untrusted browser Origin."), "404": errorResponse("Question not found."), ...internalServerError } }
    }
  },
  components: {
    securitySchemes: {
      AdminSessionCookie: {
        type: "apiKey",
        in: "cookie",
        name: "dr_nareman_admin_session",
        description:
          "Opaque Admin session cookie. It is HttpOnly, SameSite=Lax, scoped to `/api/admin`, and Secure when NODE_ENV is production."
      }
    },
    schemas: {
      ErrorResponse: {
        type: "object",
        additionalProperties: false,
        required: ["success", "error"],
        properties: {
          success: { type: "boolean", const: false },
          error: {
            type: "object",
            additionalProperties: false,
            required: ["message"],
            properties: { message: { type: "string" } }
          }
        },
        example: { success: false, error: { message: "Invalid request body" } }
      },
      HealthResponse: {
        type: "object",
        additionalProperties: false,
        required: ["success", "status", "database"],
        properties: {
          success: { type: "boolean", const: true },
          status: { type: "string", const: "ok" },
          database: { type: "string", enum: ["connected", "unavailable"] }
        },
        example: { success: true, status: "ok", database: "connected" }
      },
      AdminSafeIdentity: {
        type: "object",
        additionalProperties: false,
        required: ["id", "email"],
        properties: {
          id: { type: "string", example: "65c5f8f8a9197a79a85e51d2" },
          email: { type: "string", format: "email", example: "editor@example.com" }
        }
      },
      AdminIdentityResponse: {
        type: "object",
        additionalProperties: false,
        required: ["success", "admin"],
        properties: {
          success: { type: "boolean", const: true },
          admin: { $ref: "#/components/schemas/AdminSafeIdentity" }
        }
      },
      AdminLoginInput: {
        type: "object",
        additionalProperties: false,
        required: ["email", "password"],
        properties: {
          email: { type: "string", format: "email", maxLength: 254 },
          password: { type: "string", minLength: 1, maxLength: 1024, format: "password" }
        }
      },
      ArticleStatus: {
        type: "string",
        enum: ["draft", "published"]
      },
      ArticleCoverImage: {
        type: "object",
        additionalProperties: false,
        required: ["url", "alt"],
        properties: {
          url: {
            type: "string",
            maxLength: 2048,
            description:
              "HTTP(S) URL or application-relative URL. Managed local covers use `/uploads/articles/<generated>.webp`.",
            example: "/uploads/articles/6d7158a0-4570-4b9b-bd85-6c88e5eeabdb.webp"
          },
          alt: { type: "string", minLength: 1, maxLength: 180, example: "صورة توضيحية لمتابعة التبويض" }
        }
      },
      ArticleVideo: {
        type: "object",
        additionalProperties: false,
        required: ["id", "url", "originalName", "mimeType", "sizeBytes", "createdAt"],
        properties: {
          id: { type: "string", format: "uuid" },
          url: { type: "string", pattern: "^/uploads/articles/videos/[0-9a-f-]{36}\\.(mp4|webm)$", description: "Generated managed public media URL; no filesystem path is exposed." },
          originalName: { type: "string", maxLength: 255 },
          mimeType: { type: "string", enum: ["video/mp4", "video/webm"] },
          sizeBytes: { type: "integer", minimum: 1, maximum: 1073741824 },
          createdAt: { type: "string", format: "date-time" }
        }
      },
      ArticleListItem: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "title",
          "slug",
          "excerpt",
          "category",
          "status",
          "publishedAt",
          "readingTime",
          "coverImage",
          "videos",
          "seoTitle",
          "seoDescription"
        ],
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          slug: { type: "string" },
          excerpt: { type: "string" },
          category: { type: "string" },
          status: { type: "string", const: "published" },
          publishedAt: { type: "string", format: "date-time" },
          readingTime: { type: "integer", minimum: 1 },
          coverImage: { anyOf: [{ $ref: "#/components/schemas/ArticleCoverImage" }, { type: "null" }] },
          videos: { type: "array", items: { $ref: "#/components/schemas/ArticleVideo" } },
          seoTitle: { type: ["string", "null"] },
          seoDescription: { type: ["string", "null"] }
        }
      },
      AdminArticleListItem: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "title",
          "slug",
          "excerpt",
          "category",
          "status",
          "publishedAt",
          "readingTime",
          "coverImage",
          "videos",
          "seoTitle",
          "seoDescription",
          "createdAt",
          "updatedAt"
        ],
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          slug: { type: "string" },
          excerpt: { type: "string" },
          category: { type: "string" },
          status: { $ref: "#/components/schemas/ArticleStatus" },
          publishedAt: { type: ["string", "null"], format: "date-time" },
          readingTime: { type: "integer", minimum: 1 },
          coverImage: { anyOf: [{ $ref: "#/components/schemas/ArticleCoverImage" }, { type: "null" }] },
          videos: { type: "array", items: { $ref: "#/components/schemas/ArticleVideo" } },
          seoTitle: { type: ["string", "null"] },
          seoDescription: { type: ["string", "null"] },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" }
        }
      },
      ArticleDetail: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "title",
          "slug",
          "excerpt",
          "content",
          "category",
          "status",
          "publishedAt",
          "readingTime",
          "coverImage",
          "videos",
          "seoTitle",
          "seoDescription",
          "createdAt",
          "updatedAt"
        ],
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          slug: { type: "string" },
          excerpt: { type: "string" },
          content: {
            type: "string",
            description:
              "Markdown-compatible canonical text. Clients rendering it as HTML must use an appropriate safe Markdown rendering and sanitization policy."
          },
          category: { type: "string" },
          status: { $ref: "#/components/schemas/ArticleStatus" },
          publishedAt: { type: ["string", "null"], format: "date-time" },
          readingTime: { type: "integer", minimum: 1 },
          coverImage: { anyOf: [{ $ref: "#/components/schemas/ArticleCoverImage" }, { type: "null" }] },
          videos: { type: "array", items: { $ref: "#/components/schemas/ArticleVideo" } },
          seoTitle: { type: ["string", "null"] },
          seoDescription: { type: ["string", "null"] },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" }
        }
      },
      Pagination: {
        type: "object",
        additionalProperties: false,
        required: ["page", "limit", "total", "totalPages"],
        properties: {
          page: { type: "integer", minimum: 1 },
          limit: { type: "integer", minimum: 1 },
          total: { type: "integer", minimum: 0 },
          totalPages: { type: "integer", minimum: 0 }
        }
      },
      PublicArticleListResponse: {
        type: "object",
        additionalProperties: false,
        required: ["success", "items", "pagination"],
        properties: {
          success: { type: "boolean", const: true },
          items: { type: "array", items: { $ref: "#/components/schemas/ArticleListItem" } },
          pagination: { $ref: "#/components/schemas/Pagination" }
        }
      },
      AdminArticleListResponse: {
        type: "object",
        additionalProperties: false,
        required: ["success", "items", "pagination"],
        properties: {
          success: { type: "boolean", const: true },
          items: { type: "array", items: { $ref: "#/components/schemas/AdminArticleListItem" } },
          pagination: { $ref: "#/components/schemas/Pagination" }
        }
      },
      ArticleDetailResponse: {
        type: "object",
        additionalProperties: false,
        required: ["success", "article"],
        properties: {
          success: { type: "boolean", const: true },
          article: { $ref: "#/components/schemas/ArticleDetail" }
        }
      },
      AdminArticleCreateInput: {
        type: "object",
        additionalProperties: false,
        required: ["title", "excerpt", "content", "category"],
        properties: {
          title: { type: "string", minLength: 1, maxLength: 180 },
          slug: { type: "string", minLength: 1, maxLength: 220 },
          excerpt: { type: "string", minLength: 1, maxLength: 320 },
          content: { type: "string", minLength: 1, maxLength: 50000 },
          category: { type: "string", minLength: 1, maxLength: 80 },
          status: { $ref: "#/components/schemas/ArticleStatus", default: "draft" },
          seoTitle: { type: "string", minLength: 1, maxLength: 70 },
          seoDescription: { type: "string", minLength: 1, maxLength: 170 }
        }
      },
      AdminArticleUpdateInput: {
        type: "object",
        additionalProperties: false,
        minProperties: 1,
        properties: {
          title: { type: "string", minLength: 1, maxLength: 180 },
          slug: { type: "string", minLength: 1, maxLength: 220 },
          excerpt: { type: "string", minLength: 1, maxLength: 320 },
          content: { type: "string", minLength: 1, maxLength: 50000 },
          category: { type: "string", minLength: 1, maxLength: 80 },
          status: { $ref: "#/components/schemas/ArticleStatus" },
          seoTitle: { type: ["string", "null"], minLength: 1, maxLength: 70 },
          seoDescription: { type: ["string", "null"], minLength: 1, maxLength: 170 }
        }
      },
      CoverImageUploadInput: {
        type: "object",
        additionalProperties: false,
        required: ["image", "alt"],
        properties: {
          image: {
            type: "string",
            format: "binary",
            description: "Required JPEG, PNG, or WebP file; maximum input size is 5 MB."
          },
          alt: { type: "string", minLength: 1, maxLength: 180 }
        }
      },
      CoverImageAltInput: {
        type: "object",
        additionalProperties: false,
        required: ["alt"],
        properties: {
          alt: { type: "string", minLength: 1, maxLength: 180 }
        }
      },
      ArticleVideoUploadInput: {
        type: "object",
        additionalProperties: false,
        required: ["video"],
        properties: {
          video: { type: "string", format: "binary", description: "One MP4 or WebM video. Maximum individual size: 1,073,741,824 bytes (1 GiB)." }
        }
      },
      LeadSource: { type: "string", enum: ["ovulation_calculator", "weekly_live"] },
      LeadStatus: { type: "string", enum: ["new", "contacted", "qualified", "converted", "not_interested", "do_not_contact"] },
      LeadClickIds: {
        type: "object", additionalProperties: false,
        properties: { gclid: { type: ["string", "null"], maxLength: 512 }, fbclid: { type: ["string", "null"], maxLength: 512 }, ttclid: { type: ["string", "null"], maxLength: 512 }, msclkid: { type: ["string", "null"], maxLength: 512 } }
      },
      LeadAttribution: {
        type: "object", additionalProperties: false,
        required: ["utmSource", "utmMedium", "utmCampaign", "utmContent", "utmTerm", "landingPath", "referrerHost", "clickIds"],
        properties: { utmSource: { type: ["string", "null"] }, utmMedium: { type: ["string", "null"] }, utmCampaign: { type: ["string", "null"] }, utmContent: { type: ["string", "null"] }, utmTerm: { type: ["string", "null"] }, landingPath: { type: ["string", "null"] }, referrerHost: { type: ["string", "null"] }, clickIds: { $ref: "#/components/schemas/LeadClickIds" } }
      },
      AdminLead: {
        type: "object", additionalProperties: false,
        required: ["id", "contact", "location", "source", "attribution", "privacyNoticeAcceptedAt", "marketingConsent", "marketingConsentAt", "status", "createdAt", "updatedAt"],
        properties: {
          id: { type: "string" },
          contact: { type: "object", additionalProperties: false, required: ["name", "phone", "email"], properties: { name: { type: "string", maxLength: 100 }, phone: { type: "string", maxLength: 16 }, email: { type: ["string", "null"], format: "email" } } },
          location: { type: "object", additionalProperties: false, required: ["region", "city"], properties: { region: { type: ["string", "null"] }, city: { type: ["string", "null"] } } },
          source: { $ref: "#/components/schemas/LeadSource" }, attribution: { $ref: "#/components/schemas/LeadAttribution" }, privacyNoticeAcceptedAt: { type: "string", format: "date-time" }, marketingConsent: { type: "boolean" }, marketingConsentAt: { type: ["string", "null"], format: "date-time" }, status: { $ref: "#/components/schemas/LeadStatus" }, createdAt: { type: "string", format: "date-time" }, updatedAt: { type: "string", format: "date-time" }
        }
      },
      PublicLeadCreateInput: {
        type: "object", additionalProperties: false, required: ["name", "phone", "source", "privacyNoticeAccepted", "marketingConsent"],
        properties: {
          name: { type: "string", minLength: 1, maxLength: 100 }, phone: { type: "string", description: "Digits with optional leading +; Arabic-Indic digits and spaces/parentheses/hyphens are normalized.", maxLength: 60 }, email: { type: "string", format: "email", maxLength: 254 }, region: { type: "string", maxLength: 80 }, city: { type: "string", maxLength: 100 }, source: { $ref: "#/components/schemas/LeadSource" }, privacyNoticeAccepted: { type: "boolean", const: true }, marketingConsent: { type: "boolean" },
          attribution: { type: "object", additionalProperties: false, properties: { utmSource: { type: "string", maxLength: 200 }, utmMedium: { type: "string", maxLength: 200 }, utmCampaign: { type: "string", maxLength: 200 }, utmContent: { type: "string", maxLength: 200 }, utmTerm: { type: "string", maxLength: 200 }, landingPath: { type: "string", maxLength: 500, description: "Application-relative path only; no query, fragment, protocol, or host." }, referrerHost: { type: "string", maxLength: 253, description: "Hostname only; no scheme, path, query, or credentials." }, clickIds: { type: "object", additionalProperties: false, properties: { gclid: { type: "string", maxLength: 512 }, fbclid: { type: "string", maxLength: 512 }, ttclid: { type: "string", maxLength: 512 }, msclkid: { type: "string", maxLength: 512 } } } } }
        }
      },
      PublicLeadCreateResponse: { type: "object", additionalProperties: false, required: ["success", "lead"], properties: { success: { type: "boolean", const: true }, lead: { type: "object", additionalProperties: false, required: ["id"], properties: { id: { type: "string" } } } } },
      AdminLeadStatusUpdateInput: { type: "object", additionalProperties: false, required: ["status"], properties: { status: { $ref: "#/components/schemas/LeadStatus" } } },
      AdminLeadResponse: { type: "object", additionalProperties: false, required: ["success", "lead"], properties: { success: { type: "boolean", const: true }, lead: { $ref: "#/components/schemas/AdminLead" } } },
      AdminLeadListResponse: { type: "object", additionalProperties: false, required: ["success", "items", "pagination"], properties: { success: { type: "boolean", const: true }, items: { type: "array", items: { $ref: "#/components/schemas/AdminLead" } }, pagination: { $ref: "#/components/schemas/Pagination" } } },
      WeeklyLiveQuestionStatus: { type: "string", enum: ["new", "selected", "answered", "archived"] },
      PublicWeeklyLive: {
        type: "object", additionalProperties: false, required: ["id", "title", "scheduledAt", "timezone", "acceptingQuestions"],
        properties: { id: { type: "string" }, title: { type: "string", maxLength: 120 }, scheduledAt: { type: "string", format: "date-time" }, timezone: { type: "string", const: "Asia/Riyadh" }, acceptingQuestions: { type: "boolean" } }
      },
      PublicWeeklyLiveCurrentResponse: {
        type: "object", additionalProperties: false, required: ["success", "live"],
        properties: { success: { type: "boolean", const: true }, live: { anyOf: [{ $ref: "#/components/schemas/PublicWeeklyLive" }, { type: "null" }] } }
      },
      TestimonialImage: {
        type: "object", additionalProperties: false, required: ["url", "alt"],
        properties: {
          url: { type: "string", pattern: "^/uploads/testimonials/[0-9a-f-]{36}\\.webp$", description: "Generated managed public media URL." },
          alt: { type: "string", minLength: 1, maxLength: 160, description: "Neutral accessibility text; do not include names, contact details, or health information." }
        }
      },
      AdminTestimonial: {
        type: "object", additionalProperties: false, required: ["id", "image", "isVisible", "sortOrder", "privacyConfirmedAt", "publicationApprovedAt", "createdAt", "updatedAt"],
        properties: { id: { type: "string" }, image: { $ref: "#/components/schemas/TestimonialImage" }, isVisible: { type: "boolean", default: false }, sortOrder: { type: "integer", minimum: 0, maximum: 1000000 }, privacyConfirmedAt: { type: "string", format: "date-time" }, publicationApprovedAt: { type: "string", format: "date-time" }, createdAt: { type: "string", format: "date-time" }, updatedAt: { type: "string", format: "date-time" } }
      },
      PublicTestimonial: {
        type: "object", additionalProperties: false, required: ["id", "image"],
        properties: { id: { type: "string" }, image: { $ref: "#/components/schemas/TestimonialImage" } }
      },
      TestimonialUploadInput: {
        type: "object", additionalProperties: false, required: ["image", "alt", "privacyConfirmed", "publicationApproved"],
        properties: { image: { type: "string", format: "binary", description: "JPEG, PNG, or WebP, maximum 5 MB. SVG, GIF, invalid files, and original filenames are not retained." }, alt: { type: "string", minLength: 1, maxLength: 160 }, privacyConfirmed: { type: "boolean", const: true, description: "Admin attests identifying details have been removed or obscured as appropriate." }, publicationApproved: { type: "boolean", const: true, description: "Admin attests this publication copy is approved/permitted for public use." } }
      },
      TestimonialUpdateInput: {
        type: "object", additionalProperties: false, minProperties: 1,
        properties: { alt: { type: "string", minLength: 1, maxLength: 160 }, isVisible: { type: "boolean", description: "May be true only when managed media and both confirmation timestamps exist." }, sortOrder: { type: "integer", minimum: 0, maximum: 1000000 } }
      },
      AdminTestimonialResponse: { type: "object", additionalProperties: false, required: ["success", "testimonial"], properties: { success: { type: "boolean", const: true }, testimonial: { $ref: "#/components/schemas/AdminTestimonial" } } },
      AdminTestimonialListResponse: { type: "object", additionalProperties: false, required: ["success", "items", "pagination"], properties: { success: { type: "boolean", const: true }, items: { type: "array", items: { $ref: "#/components/schemas/AdminTestimonial" } }, pagination: { $ref: "#/components/schemas/Pagination" } } },
      PublicTestimonialListResponse: { type: "object", additionalProperties: false, required: ["success", "items"], properties: { success: { type: "boolean", const: true }, items: { type: "array", items: { $ref: "#/components/schemas/PublicTestimonial" } } } },
      PublicWeeklyLiveQuestionInput: {
        type: "object", additionalProperties: false, required: ["contactName", "phone", "displayName", "age", "region", "city", "question", "consent", "privacyNoticeAccepted", "marketingConsent"],
        properties: {
          contactName: { type: "string", minLength: 1, maxLength: 100, description: "Lead contact name; not the question display name." },
          phone: { type: "string", maxLength: 60, description: "Digits with optional leading +; Arabic-Indic digits and common punctuation are normalized." },
          email: { type: "string", format: "email", maxLength: 254 },
          displayName: { type: "string", minLength: 2, maxLength: 80, description: "Question-specific first name or alias." },
          age: { type: "integer", minimum: 18, maximum: 100 },
          region: { type: "string", minLength: 1, maxLength: 80 },
          city: { type: "string", minLength: 1, maxLength: 100 },
          question: { type: "string", minLength: 10, maxLength: 2000 },
          consent: { type: "boolean", const: true, description: "Question/informational acknowledgement." },
          privacyNoticeAccepted: { type: "boolean", const: true, description: "Required acknowledgement for Lead contact processing." },
          marketingConsent: { type: "boolean", description: "Optional; false does not block question submission or join URL release." },
          attribution: { $ref: "#/components/schemas/PublicLeadCreateInput/properties/attribution" }
        }
      },
      PublicWeeklyLiveSubmissionResponse: {
        type: "object", additionalProperties: false, required: ["success", "submissionId", "joinUrl", "event"],
        properties: { success: { type: "boolean", const: true }, submissionId: { type: "string" }, joinUrl: { type: "string", format: "uri", description: "HTTPS meeting URL released only after persistence." }, event: { type: "object", additionalProperties: false, required: ["title", "scheduledAt", "timezone"], properties: { title: { type: "string" }, scheduledAt: { type: "string", format: "date-time" }, timezone: { type: "string", const: "Asia/Riyadh" } } } }
      },
      AdminWeeklyLive: {
        type: "object", additionalProperties: false, required: ["id", "title", "scheduledAt", "timezone", "meetingUrl", "isVisible", "acceptingQuestions", "questionCount", "createdAt", "updatedAt"],
        properties: { id: { type: "string" }, title: { type: "string" }, scheduledAt: { type: "string", format: "date-time" }, timezone: { type: "string", const: "Asia/Riyadh" }, meetingUrl: { type: "string", format: "uri" }, isVisible: { type: "boolean" }, acceptingQuestions: { type: "boolean" }, questionCount: { type: "integer", minimum: 0 }, createdAt: { type: "string", format: "date-time" }, updatedAt: { type: "string", format: "date-time" } }
      },
      AdminWeeklyLiveCreateInput: {
        type: "object", additionalProperties: false, required: ["title", "scheduledAt", "meetingUrl"],
        properties: { title: { type: "string", minLength: 1, maxLength: 120 }, scheduledAt: { type: "string", format: "date-time" }, meetingUrl: { type: "string", format: "uri", pattern: "^https://" }, isVisible: { type: "boolean", default: false }, acceptingQuestions: { type: "boolean", default: false } }
      },
      AdminWeeklyLiveUpdateInput: { type: "object", additionalProperties: false, minProperties: 1, properties: { title: { type: "string", minLength: 1, maxLength: 120 }, scheduledAt: { type: "string", format: "date-time" }, meetingUrl: { type: "string", format: "uri", pattern: "^https://" }, isVisible: { type: "boolean" }, acceptingQuestions: { type: "boolean" } } },
      AdminWeeklyLiveResponse: { type: "object", additionalProperties: false, required: ["success", "live"], properties: { success: { type: "boolean", const: true }, live: { $ref: "#/components/schemas/AdminWeeklyLive" } } },
      AdminWeeklyLiveListResponse: { type: "object", additionalProperties: false, required: ["success", "items", "pagination"], properties: { success: { type: "boolean", const: true }, items: { type: "array", items: { $ref: "#/components/schemas/AdminWeeklyLive" } }, pagination: { $ref: "#/components/schemas/Pagination" } } },
      AdminWeeklyLiveQuestion: {
        type: "object", additionalProperties: false, required: ["id", "weeklyLiveId", "displayName", "age", "region", "city", "question", "status", "moderatedQuestion", "consentAt", "privacyNoticeVersion", "createdAt", "updatedAt"],
        properties: { id: { type: "string" }, weeklyLiveId: { type: "string" }, weeklyLive: { type: "object", additionalProperties: false, required: ["id", "title", "scheduledAt", "timezone"], properties: { id: { type: "string" }, title: { type: "string" }, scheduledAt: { type: "string", format: "date-time" }, timezone: { type: "string", const: "Asia/Riyadh" } } }, displayName: { type: "string" }, age: { type: "integer" }, region: { type: "string" }, city: { type: "string" }, question: { type: "string" }, status: { $ref: "#/components/schemas/WeeklyLiveQuestionStatus" }, moderatedQuestion: { type: ["string", "null"] }, consentAt: { type: "string", format: "date-time" }, privacyNoticeVersion: { type: "string", const: "weekly-live-v1" }, createdAt: { type: "string", format: "date-time" }, updatedAt: { type: "string", format: "date-time" } }
      },
      AdminWeeklyLiveQuestionUpdateInput: { type: "object", additionalProperties: false, minProperties: 1, properties: { status: { $ref: "#/components/schemas/WeeklyLiveQuestionStatus" }, moderatedQuestion: { type: ["string", "null"], minLength: 1, maxLength: 2000 } } },
      AdminWeeklyLiveQuestionResponse: { type: "object", additionalProperties: false, required: ["success", "question"], properties: { success: { type: "boolean", const: true }, question: { $ref: "#/components/schemas/AdminWeeklyLiveQuestion" } } },
      AdminWeeklyLiveQuestionListResponse: { type: "object", additionalProperties: false, required: ["success", "items", "pagination"], properties: { success: { type: "boolean", const: true }, items: { type: "array", items: { $ref: "#/components/schemas/AdminWeeklyLiveQuestion" } }, pagination: { $ref: "#/components/schemas/Pagination" } } }
    }
  }
} as const;
