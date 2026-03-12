import { existsSync } from "node:fs";
import { join } from "node:path";

const buildEnv = process.env["ELECTROBUN_BUILD_ENV"] ?? "dev";

if (buildEnv === "dev") {
  process.exit(0);
}

const webDistDir = join(import.meta.dir, "..", "..", "web", "dist");
const requiredFiles = [
  join(webDistDir, "index.html"),
  join(webDistDir, "assets", "app.js"),
  join(webDistDir, "assets", "index.js"),
];

const missingFiles = requiredFiles.filter((filePath) => !existsSync(filePath));

if (missingFiles.length > 0) {
  console.error(
    "Web build assets are missing. Run `bun run build` from the workspace root first.",
  );
  for (const filePath of missingFiles) {
    console.error(`- ${filePath}`);
  }
  process.exit(1);
}
