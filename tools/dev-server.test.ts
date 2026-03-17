import { afterAll, describe, expect, it } from "bun:test";
import { createServer } from "node:net";
import {
  DEFAULT_DEV_SERVER_PORT,
  findAvailablePort,
  readDevServerConfig,
  resolveAvailableDevServerConfig,
} from "./dev-server";

const servers: Array<ReturnType<typeof createServer>> = [];

function listen(
  server: ReturnType<typeof createServer>,
  host: string,
  port: number,
) {
  return new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen({ host, port }, () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
}

afterAll(async () => {
  await Promise.all(
    servers.map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => {
            if (error) {
              reject(error);
              return;
            }

            resolve();
          });
        }),
    ),
  );
});

describe("readDevServerConfig", () => {
  it("returns the explicit origin when RIMUN_DEV_SERVER_URL is provided", () => {
    const config = readDevServerConfig({
      RIMUN_DEV_SERVER_URL: "http://127.0.0.1:6100",
      RIMUN_WEB_PORT: "5173",
    });

    expect(config.usesExplicitOrigin).toBe(true);
    expect(config.origin).toBe("http://127.0.0.1:6100");
    expect(config.port).toBe(6100);
  });

  it("falls back to the default dev port when no env is set", () => {
    const config = readDevServerConfig({});

    expect(config.usesExplicitOrigin).toBe(false);
    expect(config.port).toBe(DEFAULT_DEV_SERVER_PORT);
    expect(config.origin).toBe("http://127.0.0.1:5173");
  });
});

describe("resolveAvailableDevServerConfig", () => {
  it("skips occupied ports and returns a different available one", async () => {
    const startPort = await findAvailablePort("127.0.0.1", 45_000);
    const blocker = createServer();
    servers.push(blocker);
    await listen(blocker, "127.0.0.1", startPort);

    const config = await resolveAvailableDevServerConfig({
      RIMUN_WEB_PORT: String(startPort),
    });

    expect(config.port).not.toBe(startPort);
    expect(config.origin).toBe(`http://127.0.0.1:${config.port}`);
  });

  it("keeps the preferred port when it is available", async () => {
    const port = await findAvailablePort("127.0.0.1", 46_000);
    const config = await resolveAvailableDevServerConfig({
      RIMUN_WEB_PORT: String(port),
    });

    expect(config.port).toBe(port);
    expect(config.origin).toBe(`http://127.0.0.1:${port}`);
  });
});
