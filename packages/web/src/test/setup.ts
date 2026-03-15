import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";

function createMemoryStorage(): Storage {
  const data = new Map<string, string>();

  return {
    get length() {
      return data.size;
    },
    clear() {
      data.clear();
    },
    getItem(key: string) {
      return data.has(key) ? data.get(key)! : null;
    },
    key(index: number) {
      return [...data.keys()][index] ?? null;
    },
    removeItem(key: string) {
      data.delete(key);
    },
    setItem(key: string, value: string) {
      data.set(key, String(value));
    },
  };
}

const memoryStorage = createMemoryStorage();
Object.defineProperty(window, "localStorage", {
  value: memoryStorage,
  configurable: true,
});

afterEach(() => {
  vi.restoreAllMocks();
  memoryStorage.clear();
  window.history.replaceState({}, "", "/");
});
