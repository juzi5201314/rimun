import "./globals.css";
import { App } from "@/app/App";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

const container = document.getElementById("root");

if (!container) {
  throw new Error("Missing root container");
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
