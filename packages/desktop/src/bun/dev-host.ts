import { rimunRpcSchemas } from "@rimun/shared";
import { createRimunHostService } from "./host-service";
import { SettingsRepository } from "./persistence";

const HOST = "127.0.0.1";
const PORT = Number.parseInt(process.env["RIMUN_DEV_HOST_PORT"] ?? "3070", 10);
const DEV_SERVER_ORIGIN =
  process.env["RIMUN_DEV_SERVER_URL"] ?? "http://127.0.0.1:5173";

const repository = new SettingsRepository();
const hostService = createRimunHostService(repository);

type RimunRequestSchemas = typeof rimunRpcSchemas.bun.requests;
type RequestMethod = keyof RimunRequestSchemas;

function jsonResponse(status: number, body: unknown) {
  return Response.json(body, {
    status,
    headers: {
      "Access-Control-Allow-Origin": DEV_SERVER_ORIGIN,
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
          "Access-Control-Allow-Origin": DEV_SERVER_ORIGIN,
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

    const method = url.pathname.slice("/api/rimun/".length);

    if (!(method in rimunRpcSchemas.bun.requests)) {
      return jsonResponse(404, {
        error: {
          code: "unknown_method",
          message: `Unknown host method ${method}.`,
        },
      });
    }

    const requestMethod = method as RequestMethod;

    try {
      const result = await (async () => {
        switch (requestMethod) {
          case "getBootstrap":
            return hostService.getBootstrap();
          case "getI18nDictionaries":
            return hostService.getI18nDictionaries();
          case "getProfileCatalog":
            return hostService.getProfileCatalog();
          case "createProfile":
            return hostService.createProfile(
              rimunRpcSchemas.bun.requests.createProfile.params.parse(
                await request.json(),
              ),
            );
          case "renameProfile":
            return hostService.renameProfile(
              rimunRpcSchemas.bun.requests.renameProfile.params.parse(
                await request.json(),
              ),
            );
          case "saveProfile":
            return hostService.saveProfile(
              rimunRpcSchemas.bun.requests.saveProfile.params.parse(
                await request.json(),
              ),
            );
          case "deleteProfile":
            return hostService.deleteProfile(
              rimunRpcSchemas.bun.requests.deleteProfile.params.parse(
                await request.json(),
              ),
            );
          case "switchProfile":
            return hostService.switchProfile(
              rimunRpcSchemas.bun.requests.switchProfile.params.parse(
                await request.json(),
              ),
            );
          case "getModSourceSnapshot":
            return hostService.getModSourceSnapshot(
              rimunRpcSchemas.bun.requests.getModSourceSnapshot.params.parse(
                await request.json(),
              ),
            );
          case "getSettings":
            return hostService.getSettings();
          case "saveSettings":
            return hostService.saveSettings(
              rimunRpcSchemas.bun.requests.saveSettings.params.parse(
                await request.json(),
              ),
            );
          case "getLlmSettings":
            return hostService.getLlmSettings();
          case "saveLlmSettings":
            return hostService.saveLlmSettings(
              rimunRpcSchemas.bun.requests.saveLlmSettings.params.parse(
                await request.json(),
              ),
            );
          case "searchModelMetadata":
            return hostService.searchModelMetadata(
              rimunRpcSchemas.bun.requests.searchModelMetadata.params.parse(
                await request.json(),
              ),
            );
          case "detectPaths":
            return hostService.detectPaths(
              rimunRpcSchemas.bun.requests.detectPaths.params.parse(
                await request.json(),
              ),
            );
          case "validatePath":
            return hostService.validatePath(
              rimunRpcSchemas.bun.requests.validatePath.params.parse(
                await request.json(),
              ),
            );
          case "applyActivePackageIds":
            return hostService.applyActivePackageIds(
              rimunRpcSchemas.bun.requests.applyActivePackageIds.params.parse(
                await request.json(),
              ),
            );
        }
      })();
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
