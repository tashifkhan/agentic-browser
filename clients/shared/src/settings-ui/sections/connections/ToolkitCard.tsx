import { Button } from "../../../ui/Button";
import { Pill, StatusPill } from "../../../ui/Pill";
import type { ComposioConnection, ComposioToolkit } from "../../../types/api";
import { connectionTitle, isActive, isPending } from "./util";

/** One Composio toolkit with its connected accounts. */
export function ToolkitCard({
  toolkit,
  connecting,
  onConnect,
  onInspect,
  onRename,
  onDisconnect,
}: {
  toolkit: ComposioToolkit;
  connecting: boolean;
  onConnect: () => void;
  onInspect: () => void;
  onRename: (c: ComposioConnection) => void;
  onDisconnect: (c: ComposioConnection) => void;
}) {
  const active = toolkit.connections.filter(isActive).length;
  const pending = toolkit.connections.filter(isPending).length;
  const needsAuthConfig = toolkit.auth_mode === "byo" && !toolkit.has_auth_config;

  return (
    <div className="set-toolkit">
      <div className="set-toolkit__head">
        <div className="set-head">
          <div className="set-head__top">
            <strong>{toolkit.display_name}</strong>
            <Pill tone={active ? "ok" : pending ? "warn" : "neutral"}>{active ? `${active} active` : pending ? `${pending} pending` : "not connected"}</Pill>
          </div>
          <div className="set-facts">
            <span>{toolkit.slug}</span>
            {toolkit.tool_count ? <span>{toolkit.tool_count} tools</span> : null}
            <span>{toolkit.auth_mode} auth</span>
          </div>
        </div>
        <div className="set-actions">
          <Button size="sm" variant="ghost" onClick={onInspect}>Tools</Button>
          <Button size="sm" variant={active ? "default" : "primary"} disabled={pending > 0 || needsAuthConfig} loading={connecting} onClick={onConnect}
            title={pending ? "Finish or cancel the pending sign-in first" : undefined}>
            {pending ? "Waiting for sign-in" : active ? "Add account" : "Connect"}
          </Button>
        </div>
      </div>

      {needsAuthConfig && <div className="set-callout set-callout--err">Add an auth config for this toolkit in the Composio dashboard before connecting.</div>}
      {pending > 0 && <div className="set-callout set-callout--warn">Sign-in is still pending. Finish it in the window Composio opened, or reconnect if you closed it.</div>}

      {toolkit.connections.length > 0 && (
        <div className="set-accounts">
          {toolkit.connections.map((c) => (
            <div key={c.id || `${toolkit.slug}-${c.account_email}`} className="set-account">
              <div className="set-head">
                <div className="set-head__top">
                  <span>{connectionTitle(c)}</span>
                  <StatusPill status={c.status} />
                </div>
                <div className="set-facts">
                  {c.account_email && c.account_email !== connectionTitle(c) && <span>{c.account_email}</span>}
                  {c.id && <span>{c.id}</span>}
                </div>
              </div>
              {c.id && (
                <div className="set-actions">
                  <Button size="sm" variant="ghost" onClick={() => onRename(c)}>Rename</Button>
                  <Button size="sm" variant="danger" onClick={() => onDisconnect(c)}>Disconnect</Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
