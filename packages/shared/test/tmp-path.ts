import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function rimunTmpPath(...segments: string[]) {
  return join(tmpdir(), "rimun-test", ...segments);
}

export function createRimunTempDir(prefix: string) {
  return mkdtempSync(join(tmpdir(), prefix));
}
