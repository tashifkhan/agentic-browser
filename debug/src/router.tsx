import { createRootRoute, createRoute, createRouter, Outlet, redirect } from "@tanstack/react-router";
import { AppShell } from "./App";
import { DashboardPanel } from "./components/DashboardPanel";
import { RunDetailPanel, RunsPanel } from "./components/RunsPanel";
import { MemoryPanel } from "./components/MemoryPanel";
import { MaintenanceDetailPanel, MaintenancePanel } from "./components/MaintenancePanel";
import { SettingsPanel } from "./components/SettingsPanel";
import { ChatPanel } from "./components/ChatPanel";

const rootRoute = createRootRoute({
  component: AppShell,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
  component: Outlet,
});

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/dashboard",
  component: DashboardPanel,
});

const runsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/runs",
  component: RunsPanel,
});

const runDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/runs/$runId",
  component: RunDetailPanel,
});

const memoryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/memory",
  component: MemoryPanel,
});

const diagnosticsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/diagnostics",
  component: MaintenancePanel,
});

const diagnosticsDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/diagnostics/$runId",
  component: MaintenanceDetailPanel,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: SettingsPanel,
});

const chatRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/chat",
  component: ChatPanel,
});

const chatDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/chat/$conversationId",
  component: ChatPanel,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  dashboardRoute,
  runsRoute,
  runDetailRoute,
  memoryRoute,
  diagnosticsRoute,
  diagnosticsDetailRoute,
  settingsRoute,
  chatRoute,
  chatDetailRoute,
]);

export const router = createRouter({
  routeTree,
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
