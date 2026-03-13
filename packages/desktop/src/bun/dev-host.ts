import { rimunRpcSchemas } from "@rimun/shared";
import { SettingsRepository } from "./persistence";
import { createRimunHostService } from "./host-service";

const HOST = "127.0.0.1";
const PORT = Number.parseInt(process.env["RIMUN_DEV_HOST_PORT"] ?? "3070", 10);

const repository = new SettingsRepository();
const hostService = createRimunHostService(repository);

const requestHandlers = {
  getBootstrap: () => hostService.getBootstrap(),
  getProfileCatalog: () => hostService.getProfileCatalog(),
  createProfile: (payload: any) => hostService.createProfile(payload),
  renameProfile: (payload: any) => hostService.renameProfile(payload),
  saveProfile: (payload: any) => hostService.saveProfile(payload),
  deleteProfile: (payload: any) => hostService.deleteProfile(payload),
  switchProfile: (payload: any) => hostService.switchProfile(payload),
  getModSourceSnapshot: (payload: any) =>
    hostService.getModSourceSnapshot(payload),
  getSettings: () => hostService.getSettings(),
  saveSettings: (payload: any) => hostService.saveSettings(payload),
  detectPaths: (payload: any) => hostService.detectPaths(payload),
  validatePath: (payload: any) => hostService.validatePath(payload),
  applyActivePackageIds: (payload: any) =>
    hostService.applyActivePackageIds(payload),
} as const;

type RequestMethod = keyof typeof requestHandlers;

function jsonResponse(status: number, body: unknown) {
  return Response.json(body, {
    status,
    headers: {
      "Access-Control-Allow-Origin": "http://127.0.0.1:5173",
      "Access-Control-Allow-Headers": "content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
  });
}

Bun.serve({
  hostname: HOST,
  port: PORT,
  idleTimeout: 30,
  fetch: async (request) => {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "http://127.0.0.1:5173",
          "Access-Control-Allow-Headers": "content-type",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
        },
      });
    }

    if (request.method === "GET" && url.pathname === "/health") {
      return jsonResponse(200, { ok: true });
    }

    if (request.method !== "POST" || !url.pathname.startsWith("/api/rimun/")) {
      return jsonResponse(404, {
        error: {
          code: "not_found",
          message: "Unknown dev host route.",
        },
      });
    }

    const method = url.pathname.slice("/api/rimun/".length) as RequestMethod;

    if (!(method in requestHandlers)) {
      return jsonResponse(404, {
        error: {
          code: "unknown_method",
          message: `Unknown host method ${method}.`,
        },
      });
    }

    const schema =
      rimunRpcSchemas.bun.requests[
        method as keyof typeof rimunRpcSchemas.bun.requests
      ];

    try {
      const payload =
        schema.params === rimunRpcSchemas.bun.requests.getBootstrap.params ||
        schema.params === rimunRpcSchemas.bun.requests.getProfileCatalog.params ||
        schema.params === rimunRpcSchemas.bun.requests.getSettings.params
          ? {}
          : await request.json();
      const result = await requestHandlers[method](payload);
      return jsonResponse(200, result);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown dev host error.";

      return jsonResponse(500, {
        error: {
          code: "internal_error",
          message,
        },
      });
    }
  },
});

console.log(`rimun dev host listening on http://${HOST}:${PORT}`);
