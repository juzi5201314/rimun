import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
  delete window.__RIMUN_RPC__;
  window.history.replaceState({}, "", "/");
});
