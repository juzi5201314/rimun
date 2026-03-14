import type { ElectrobunConfig } from "electrobun";

const electrobunBuildEnv = process.env["ELECTROBUN_BUILD_ENV"] ?? "dev";
const linuxCdpPort = process.env["RIMUN_CDP_PORT"] ?? "9222";
const enableLinuxCefAutomation =
  process.platform === "linux" &&
  electrobunBuildEnv !== "stable" &&
  process.env["RIMUN_ENABLE_CEF_AUTOMATION"] === "1";

export default {
  app: {
    name: "rimun",
    identifier: "sh.blackboard.rimun",
    version: "0.1.0",
  },
  build: {
    bun: {
      entrypoint: "src/bun/index.ts",
    },
    copy: {
      "../web/dist/index.html": "views/app/index.html",
      "../web/dist/assets/app.js": "views/app/assets/app.js",
      "../web/dist/assets/index.js": "views/app/assets/index.js",
    },
    mac: {
      bundleCEF: false,
    },
    linux: {
      bundleCEF: enableLinuxCefAutomation,
      defaultRenderer: enableLinuxCefAutomation ? "cef" : "native",
      chromiumFlags: enableLinuxCefAutomation
        ? {
            "remote-debugging-port": linuxCdpPort,
          }
        : undefined,
    },
    win: {
      bundleCEF: false,
    },
  },
  scripts: {
    preBuild: "./scripts/pre-build.ts",
  },
} satisfies ElectrobunConfig;
