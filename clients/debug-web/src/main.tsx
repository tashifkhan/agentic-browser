import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { ApiProvider, createDefaultQueryClient } from "@agentic-browser/shared/query";
import { router } from "./router";
import "@agentic-browser/shared/theme.css";
import "./styles.css";
import "./shell.css";

const queryClient = createDefaultQueryClient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      {/* Vite proxies /api to the backend, so the base URL is same-origin. */}
      <ApiProvider baseUrl="">
        <RouterProvider router={router} />
      </ApiProvider>
    </QueryClientProvider>
  </StrictMode>
);
