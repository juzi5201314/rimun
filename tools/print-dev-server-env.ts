import { resolveAvailableDevServerConfig } from "./dev-server";

const config = await resolveAvailableDevServerConfig(process.env);

console.log(`export RIMUN_WEB_PORT=${config.port}`);
console.log(`export RIMUN_DEV_SERVER_URL=${JSON.stringify(config.origin)}`);
