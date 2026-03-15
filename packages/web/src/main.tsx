import "./globals.css";
import { App } from "@/app/App";
import type { RimunHostApi } from "@rimun/shared";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

const container = document.getElementById("root");

if (!container) {
  throw new Error("Missing root container");
}

const rootContainer: HTMLElement = container;

function resolveDevelopmentHostApi() {
  if (!import.meta.env.DEV) {
    return undefined;
  }

  const searchParams = new URLSearchParams(window.location.search);
  const shouldUseFixture =
    searchParams.get("fixture") === "demo" ||
    searchParams.get("mockHost") === "1";

  if (!shouldUseFixture) {
    return undefined;
  }

  return import("@/shared/testing/createTestHostApi").then(
    ({ createTestHostApi }) => createTestHostApi(),
  );
}

async function installDevelopmentHelpers() {
  if (!(import.meta.env.DEV || import.meta.env.MODE === "test")) {
    return;
  }

  const { installRimunPerfCapture } = await import(
    "@/shared/perf/rimunPerfCapture"
  );

  installRimunPerfCapture(window);
}

async function bootstrap() {
  const maybeHostApi = resolveDevelopmentHostApi();
  const hostApi: RimunHostApi | undefined =
    maybeHostApi instanceof Promise ? await maybeHostApi : maybeHostApi;

  await installDevelopmentHelpers();

  createRoot(rootContainer).render(
    <StrictMode>
      <App hostApi={hostApi} />
    </StrictMode>,
  );
}

void bootstrap();
