import express from "express";

import request from "supertest";
import { describe, expect, it } from "vitest";

import { app } from "../src/app.js";
import { env } from "../src/config/env.js";
import { createDocumentationRouter } from "../src/docs/docs.routes.js";
import { openApiDocument } from "../src/docs/openapi.js";
import { errorHandler } from "../src/middleware/error.middleware.js";
import { notFoundHandler } from "../src/middleware/notFound.middleware.js";

describe("OpenAPI documentation", () => {
  it("serves Swagger UI and the canonical OpenAPI JSON when documentation is enabled", async () => {
    expect(env.apiDocsEnabled).toBe(true);

    const [uiResponse, jsonResponse] = await Promise.all([
      request(app).get("/api/docs"),
      request(app).get("/api/docs.json")
    ]);

    expect(uiResponse.status).toBe(200);
    expect(uiResponse.headers["content-type"]).toContain("text/html");
    expect(jsonResponse.status).toBe(200);
    expect(jsonResponse.body).toEqual(openApiDocument);
    expect(jsonResponse.body.openapi).toMatch(/^3\.1\./);
    expect(jsonResponse.body.info).toMatchObject({
      title: "Dr. Nareman Backend API",
      version: "1.0.0"
    });
  });

  it("documents every implemented API operation and the Admin cookie scheme", () => {
    const documentedPaths = openApiDocument.paths;

    expect(Object.keys(documentedPaths)).toEqual(
      expect.arrayContaining([
        "/api/health",
        "/api/admin/auth/login",
        "/api/admin/auth/logout",
        "/api/admin/auth/me",
        "/api/articles",
        "/api/articles/{slug}",
        "/api/admin/articles",
        "/api/admin/articles/{id}",
        "/api/admin/articles/{id}/cover-image",
        "/api/testimonials",
        "/api/admin/testimonials",
        "/api/admin/testimonials/{id}",
        "/api/admin/testimonials/{id}/image",
        "/api/leads",
        "/api/admin/leads",
        "/api/admin/leads/export.csv",
        "/api/admin/leads/{id}",
        "/api/weekly-live/current",
        "/api/weekly-live/{id}/questions",
        "/api/admin/weekly-live",
        "/api/admin/weekly-live/{id}",
        "/api/admin/weekly-live/{id}/questions",
        "/api/admin/weekly-live/questions/{questionId}"
      ])
    );
    expect(documentedPaths["/api/admin/articles"].get).toBeDefined();
    expect(documentedPaths["/api/admin/articles"].post).toBeDefined();
    expect(documentedPaths["/api/admin/articles/{id}"].get).toBeDefined();
    expect(documentedPaths["/api/admin/articles/{id}"].patch).toBeDefined();
    expect(documentedPaths["/api/admin/articles/{id}"].delete).toBeDefined();
    expect(documentedPaths["/api/admin/articles/{id}/cover-image"].put).toBeDefined();
    expect(documentedPaths["/api/admin/articles/{id}/cover-image"].patch).toBeDefined();
    expect(documentedPaths["/api/admin/articles/{id}/cover-image"].delete).toBeDefined();
    expect(documentedPaths["/api/testimonials"].get).toBeDefined();
    expect(documentedPaths["/api/admin/testimonials"].get).toBeDefined();
    expect(documentedPaths["/api/admin/testimonials"].post).toBeDefined();
    expect(documentedPaths["/api/admin/testimonials/{id}"].get).toBeDefined();
    expect(documentedPaths["/api/admin/testimonials/{id}"].patch).toBeDefined();
    expect(documentedPaths["/api/admin/testimonials/{id}"].delete).toBeDefined();
    expect(documentedPaths["/api/admin/testimonials/{id}/image"].put).toBeDefined();
    expect(documentedPaths["/api/leads"].post).toBeDefined();
    expect(documentedPaths["/api/admin/leads"].get).toBeDefined();
    expect(documentedPaths["/api/admin/leads/export.csv"].get).toBeDefined();
    expect(documentedPaths["/api/admin/leads/{id}"].get).toBeDefined();
    expect(documentedPaths["/api/admin/leads/{id}"].patch).toBeDefined();
    expect(documentedPaths["/api/admin/leads/{id}"].delete).toBeDefined();
    expect(documentedPaths["/api/weekly-live/current"].get).toBeDefined();
    expect(documentedPaths["/api/weekly-live/{id}/questions"].post).toBeDefined();
    expect(documentedPaths["/api/admin/weekly-live"].get).toBeDefined();
    expect(documentedPaths["/api/admin/weekly-live"].post).toBeDefined();
    expect(documentedPaths["/api/admin/weekly-live/{id}"].get).toBeDefined();
    expect(documentedPaths["/api/admin/weekly-live/{id}"].patch).toBeDefined();
    expect(documentedPaths["/api/admin/weekly-live/{id}/questions"].get).toBeDefined();
    expect(documentedPaths["/api/admin/weekly-live/questions/{questionId}"].get).toBeDefined();
    expect(documentedPaths["/api/admin/weekly-live/questions/{questionId}"].patch).toBeDefined();
    expect(documentedPaths["/api/admin/weekly-live/questions/{questionId}"].delete).toBeDefined();
    expect(documentedPaths["/api/health"].get.responses).toHaveProperty("500");
    expect(documentedPaths["/api/admin/articles/{id}/cover-image"].put.responses).toHaveProperty("415");

    expect(openApiDocument.components.securitySchemes).toEqual({
      AdminSessionCookie: expect.objectContaining({
        type: "apiKey",
        in: "cookie",
        name: "dr_nareman_admin_session"
      })
    });
    expect(Object.values(openApiDocument.components.securitySchemes)).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ scheme: "bearer" }),
        expect.objectContaining({ type: "http", scheme: "bearer" })
      ])
    );
  });

  it("keeps Article JSON mutation schemas and documented DTOs free of internal fields", () => {
    const schemas = openApiDocument.components.schemas;
    const createProperties = schemas.AdminArticleCreateInput.properties;
    const updateProperties = schemas.AdminArticleUpdateInput.properties;
    const schemaDocument = JSON.stringify(schemas);

    expect(createProperties).not.toHaveProperty("coverImage");
    expect(updateProperties).not.toHaveProperty("coverImage");
    expect(schemas.AdminArticleUpdateInput.minProperties).toBe(1);
    expect(createProperties.seoTitle.type).toBe("string");
    expect(createProperties.seoDescription.type).toBe("string");
    expect(updateProperties.seoTitle.type).toEqual(["string", "null"]);
    expect(updateProperties.seoDescription.type).toEqual(["string", "null"]);
    expect(schemas.CoverImageUploadInput.properties.image.format).toBe("binary");
    expect(schemaDocument).not.toMatch(/passwordHash|tokenHash|__v|\"_id\"/);
    expect(openApiDocument.components.schemas.PublicWeeklyLive.properties).not.toHaveProperty("meetingUrl");
  });

  it("falls through to the existing controlled JSON 404 when documentation is disabled", async () => {
    const disabledApp = express();
    disabledApp.use("/api", createDocumentationRouter(false));
    disabledApp.use(notFoundHandler);
    disabledApp.use(errorHandler);

    const response = await request(disabledApp).get("/api/docs.json");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ success: false, error: { message: "Route not found" } });
  });
});
