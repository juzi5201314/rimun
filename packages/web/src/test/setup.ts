import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";

afterEach(() => {
  delete window.__RIMUN_RPC__;
  window.history.replaceState({}, "", "/");
});
