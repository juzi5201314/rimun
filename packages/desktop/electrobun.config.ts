import type { ElectrobunConfig } from "electrobun";

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
      bundleCEF: false,
    },
    win: {
      bundleCEF: false,
    },
  },
  scripts: {
    preBuild: "./scripts/pre-build.ts",
  },
} satisfies ElectrobunConfig;
