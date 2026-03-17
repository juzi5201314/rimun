import { createServer } from "node:net";

export const DEFAULT_DEV_SERVER_HOST = "127.0.0.1";
export const DEFAULT_DEV_SERVER_PORT = 5173;
const MAX_PORT = 65_535;
const DEFAULT_SCAN_LIMIT = 100;

export type DevServerConfig = {
  host: string;
  origin: string;
  port: number;
  preferredPort: number;
  usesExplicitOrigin: boolean;
};

export function parseWebPort(
  rawPort: string | undefined,
  fallbackPort = DEFAULT_DEV_SERVER_PORT,
) {
  if (!rawPort) {
    return fallbackPort;
  }

  const port = Number.parseInt(rawPort, 10);

  if (!Number.isInteger(port) || port < 1 || port > MAX_PORT) {
    throw new Error(`Invalid RIMUN_WEB_PORT: ${rawPort}`);
  }

  return port;
}

export function readDevServerConfig(
  env: NodeJS.ProcessEnv = process.env,
): DevServerConfig {
  const explicitOrigin = env["RIMUN_DEV_SERVER_URL"]?.trim();

  if (explicitOrigin) {
    const url = new URL(explicitOrigin);
    const port =
      url.port.length > 0
        ? Number.parseInt(url.port, 10)
        : url.protocol === "https:"
          ? 443
          : 80;

    return {
      host: url.hostname,
      origin: url.origin,
      port,
      preferredPort: port,
      usesExplicitOrigin: true,
    };
  }

  const preferredPort = parseWebPort(env["RIMUN_WEB_PORT"]);

  return {
    host: DEFAULT_DEV_SERVER_HOST,
    origin: `http://${DEFAULT_DEV_SERVER_HOST}:${preferredPort}`,
    port: preferredPort,
    preferredPort,
    usesExplicitOrigin: false,
  };
}

async function canBindPort(host: string, port: number) {
  const server = createServer();

  return await new Promise<boolean>((resolve) => {
    const cleanup = () => server.removeAllListeners();

    server.once("error", () => {
      cleanup();
      resolve(false);
    });

    server.once("listening", () => {
      server.close(() => {
        cleanup();
        resolve(true);
      });
    });

    server.listen({
      host,
      port,
      exclusive: true,
    });
  });
}

async function findEphemeralPort(host: string) {
  const server = createServer();

  return await new Promise<number>((resolve, reject) => {
    const cleanup = () => server.removeAllListeners();

    server.once("error", (error) => {
      cleanup();
      reject(error);
    });

    server.once("listening", () => {
      const address = server.address();

      if (!address || typeof address === "string") {
        server.close(() => {
          cleanup();
          reject(new Error(`Unable to resolve an ephemeral port for ${host}.`));
        });
        return;
      }

      server.close(() => {
        cleanup();
        resolve(address.port);
      });
    });

    server.listen({
      host,
      port: 0,
      exclusive: true,
    });
  });
}

export async function findAvailablePort(
  host: string,
  startPort: number,
  scanLimit = DEFAULT_SCAN_LIMIT,
) {
  const lastPort = Math.min(MAX_PORT, startPort + scanLimit - 1);

  for (
    let candidatePort = startPort;
    candidatePort <= lastPort;
    candidatePort++
  ) {
    if (await canBindPort(host, candidatePort)) {
      return candidatePort;
    }
  }

  return findEphemeralPort(host);
}

export async function resolveAvailableDevServerConfig(
  env: NodeJS.ProcessEnv = process.env,
) {
  const config = readDevServerConfig(env);

  if (config.usesExplicitOrigin) {
    return config;
  }

  const port = await findAvailablePort(config.host, config.preferredPort);

  return {
    ...config,
    origin: `http://${config.host}:${port}`,
    port,
  };
}
