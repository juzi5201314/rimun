import "./globals.css";
import { App } from "@/app/App";
import { createTestHostApi } from "@/shared/testing/createTestHostApi";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

const container = document.getElementById("root");

if (!container) {
  throw new Error("Missing root container");
}

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

  return createTestHostApi();
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

void installDevelopmentHelpers();

createRoot(container).render(
  <StrictMode>
    <App hostApi={resolveDevelopmentHostApi()} />
  </StrictMode>,
);
