import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { createDefaultQueryClient } from "@agentic-browser/shared/query";
import "@agentic-browser/shared/theme.css";
import App from "./App";

const queryClient = createDefaultQueryClient();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
);
