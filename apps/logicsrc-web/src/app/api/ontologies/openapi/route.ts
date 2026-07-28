import { getService } from "@/lib/ontology-service";

export const dynamic = "force-dynamic";

/**
 * OpenAPI description of the OpenOntology reference API.
 *
 * Component schemas point at the published JSON Schemas rather than restating
 * them, so the API, the packages, and the SDK cannot drift apart (R137).
 */
export async function GET() {
  const state = await getService();
  const ontologyId = state.ontologyId ?? "{ontologyId}";
  const schemaBase = "https://logicsrc.com/schemas/openontology";

  const ontologyParam = {
    name: "ontologyId",
    in: "path",
    required: true,
    schema: { type: "string" },
    example: ontologyId
  };

  const json = (ref: string) => ({
    content: { "application/json": { schema: { $ref: ref } } }
  });

  const errorResponse = {
    description: "Structured error",
    content: {
      "application/json": {
        schema: {
          type: "object",
          properties: {
            error: {
              type: "object",
              required: ["code", "message"],
              properties: {
                code: { type: "string", example: "OO-A-DENIED" },
                message: { type: "string" },
                hint: { type: "string" }
              }
            }
          }
        }
      }
    }
  };

  const document = {
    openapi: "3.1.0",
    info: {
      title: "LogicSRC OpenOntology reference API",
      version: "0.1.0",
      description: [
        "Reference implementation of the LogicSRC OpenOntology standard.",
        "",
        "**Auth.** No token is read-only. A bearer token matching OPENONTOLOGY_API_TOKEN acts as a",
        "curator; OPENONTOLOGY_AGENT_TOKEN acts as a proposer that can create change sets but can",
        "never apply them — that denial keys on actor type, not on scopes.",
        "",
        "**Writes.** Every mutation goes through a change set: propose, review, approve, apply.",
        "Mutating requests accept an Idempotency-Key header. Applying a change set authored against",
        "a stale revision fails with 409 rather than overwriting.",
        "",
        `**Storage.** ${
          state.persistence === "turso"
            ? "Turso/libSQL."
            : "In-memory, seeded from the example package: proposals do not survive a restart."
        }`
      ].join("\n"),
      license: { name: "MIT" }
    },
    servers: [{ url: "/api", description: "This deployment" }],
    tags: [
      { name: "ontologies" },
      { name: "knowledge" },
      { name: "query" },
      { name: "governance" },
      { name: "events" }
    ],
    paths: {
      "/ontologies": {
        get: {
          tags: ["ontologies"],
          summary: "List ontologies",
          responses: { "200": { description: "Ontologies", ...json(`${schemaBase}/manifest.schema.json`) } }
        }
      },
      "/ontologies/{ontologyId}/manifest": {
        get: {
          tags: ["ontologies"],
          summary: "Package manifest",
          parameters: [ontologyParam],
          responses: {
            "200": { description: "Manifest", ...json(`${schemaBase}/manifest.schema.json`) },
            "404": errorResponse
          }
        }
      },
      "/ontologies/{ontologyId}/schema": {
        get: {
          tags: ["ontologies"],
          summary: "Entity types, properties, relationships, constraints, saved queries",
          parameters: [ontologyParam],
          responses: { "200": { description: "Schema layer" }, "404": errorResponse }
        }
      },
      "/ontologies/{ontologyId}/entities": {
        get: {
          tags: ["knowledge"],
          summary: "List or search entities",
          description: "With ?q= this returns ranked candidates and the evidence for each match.",
          parameters: [
            ontologyParam,
            { name: "type", in: "query", schema: { type: "string" } },
            { name: "q", in: "query", schema: { type: "string" } },
            { name: "limit", in: "query", schema: { type: "integer", maximum: 200, default: 50 } },
            { name: "offset", in: "query", schema: { type: "integer", default: 0 } }
          ],
          responses: { "200": { description: "Entities" }, "404": errorResponse }
        }
      },
      "/ontologies/{ontologyId}/entities/{entityId}": {
        get: {
          tags: ["knowledge"],
          summary: "One entity and its claims",
          description: "A merged-away id still resolves; the response reports redirectedFrom.",
          parameters: [ontologyParam, { name: "entityId", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": { description: "Entity", ...json(`${schemaBase}/entity.schema.json`) },
            "404": errorResponse
          }
        }
      },
      "/ontologies/{ontologyId}/claims": {
        get: {
          tags: ["knowledge"],
          summary: "List claims",
          parameters: [
            ontologyParam,
            { name: "subject", in: "query", schema: { type: "string" } },
            { name: "predicate", in: "query", schema: { type: "string" } },
            {
              name: "status",
              in: "query",
              description: "Comma-separated claim statuses.",
              schema: { type: "string", default: "asserted" }
            },
            { name: "limit", in: "query", schema: { type: "integer", maximum: 500, default: 100 } }
          ],
          responses: { "200": { description: "Claims", ...json(`${schemaBase}/claim.schema.json`) } }
        }
      },
      "/ontologies/{ontologyId}/claims/{claimId}": {
        get: {
          tags: ["knowledge"],
          summary: "One claim with its history, sources, and evidence",
          parameters: [ontologyParam, { name: "claimId", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": { description: "Claim", ...json(`${schemaBase}/claim.schema.json`) },
            "404": errorResponse
          }
        }
      },
      "/ontologies/{ontologyId}/query": {
        post: {
          tags: ["query"],
          summary: "Run a portable triple-pattern query",
          parameters: [ontologyParam],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    savedQuery: { type: "string" },
                    query: { $ref: `${schemaBase}/query.schema.json` },
                    params: { type: "object" }
                  }
                },
                examples: {
                  saved: { value: { savedQuery: "people-working-on-topic" } },
                  adHoc: {
                    value: {
                      query: {
                        match: [{ subject: "?person", predicate: "worksOn", object: "?project" }],
                        select: ["?person", "?project"],
                        include: { claimStatus: ["asserted"] }
                      }
                    }
                  }
                }
              }
            }
          },
          responses: {
            "200": { description: "Rows, each carrying the claim ids behind it" },
            "413": { ...errorResponse, description: "Query exceeded a server-side limit" },
            "422": errorResponse
          }
        }
      },
      "/ontologies/{ontologyId}/explain": {
        post: {
          tags: ["query"],
          summary: "Explain one result row",
          description: "Answer → claims → evidence → sources, plus the filters that were applied.",
          parameters: [ontologyParam],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["resultId"],
                  properties: { resultId: { type: "string" }, row: { type: "integer", default: 0 } }
                }
              }
            }
          },
          responses: { "200": { description: "Explanation" }, "404": errorResponse }
        }
      },
      "/ontologies/{ontologyId}/validate": {
        post: {
          tags: ["ontologies"],
          summary: "Validate the package",
          parameters: [ontologyParam],
          requestBody: {
            content: {
              "application/json": { schema: { type: "object", properties: { strict: { type: "boolean" } } } }
            }
          },
          responses: { "200": { description: "Validation report" } }
        }
      },
      "/ontologies/{ontologyId}/changesets": {
        get: {
          tags: ["governance"],
          summary: "List change sets",
          parameters: [ontologyParam],
          responses: { "200": { description: "Change sets" } }
        },
        post: {
          tags: ["governance"],
          summary: "Propose a change set",
          description: "Creates a PROPOSED change set. Requires ontology:claim:propose.",
          parameters: [
            ontologyParam,
            { name: "Idempotency-Key", in: "header", schema: { type: "string" } }
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["title", "operations"],
                  properties: {
                    title: { type: "string" },
                    rationale: { type: "string" },
                    runId: { type: "string" },
                    operations: { type: "array", items: { type: "object" } }
                  }
                }
              }
            }
          },
          responses: {
            "201": { description: "Proposed change set and its semantic diff" },
            "403": { ...errorResponse, description: "Missing ontology:claim:propose" },
            "422": errorResponse
          }
        }
      },
      "/ontologies/{ontologyId}/changesets/{changeSetId}": {
        get: {
          tags: ["governance"],
          summary: "One change set with its diff, reviews, approvals, and events",
          parameters: [ontologyParam, { name: "changeSetId", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "Change set" }, "404": errorResponse }
        }
      },
      "/ontologies/{ontologyId}/changesets/{changeSetId}/review": {
        post: {
          tags: ["governance"],
          summary: "Review a change set",
          parameters: [ontologyParam, { name: "changeSetId", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    state: { type: "string", enum: ["commented", "changes-requested", "approved", "rejected"] },
                    comment: { type: "string" },
                    operationDecisions: { type: "array", items: { type: "object" } }
                  }
                }
              }
            }
          },
          responses: { "201": { description: "Review" }, "403": errorResponse }
        }
      },
      "/ontologies/{ontologyId}/changesets/{changeSetId}/approve": {
        post: {
          tags: ["governance"],
          summary: "Approve a change set",
          parameters: [ontologyParam, { name: "changeSetId", in: "path", required: true, schema: { type: "string" } }],
          responses: { "201": { description: "Approval" }, "403": errorResponse }
        }
      },
      "/ontologies/{ontologyId}/changesets/{changeSetId}/apply": {
        post: {
          tags: ["governance"],
          summary: "Apply an approved change set",
          description:
            "Requires ontology:claim:write and any approvals policy demands. Agent actors are denied outright.",
          parameters: [
            ontologyParam,
            { name: "changeSetId", in: "path", required: true, schema: { type: "string" } },
            { name: "Idempotency-Key", in: "header", schema: { type: "string" } }
          ],
          responses: {
            "200": { description: "Applied; returns the resulting revision and events" },
            "403": { ...errorResponse, description: "Denied by policy" },
            "409": { ...errorResponse, description: "Approval required, or the base revision is stale" }
          }
        }
      },
      "/ontologies/{ontologyId}/events": {
        get: {
          tags: ["events"],
          summary: "Event log, or a live SSE stream",
          description:
            "Send Accept: text/event-stream (or ?stream=1) for Server-Sent Events. The event objects are identical either way.",
          parameters: [
            ontologyParam,
            { name: "limit", in: "query", schema: { type: "integer", maximum: 500, default: 100 } }
          ],
          responses: {
            "200": {
              description: "Events",
              content: {
                "application/json": { schema: { $ref: `${schemaBase}/event.schema.json` } },
                "text/event-stream": { schema: { type: "string" } }
              }
            }
          }
        }
      }
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          description: "Curator or proposer token. Omit for read-only access."
        }
      }
    },
    security: [{}, { bearerAuth: [] }]
  };

  return Response.json(document, {
    headers: { "cache-control": "public, max-age=300" }
  });
}
