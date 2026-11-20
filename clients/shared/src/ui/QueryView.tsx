import type { ReactNode } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { RotateCw, ServerCrash } from "../icons";
import { StateView, describeError } from "./StateView";
import { Button } from "./Button";

/**
 * Renders a TanStack query's four states in one consistent way:
 * loading (your skeleton), error (with retry), empty, and data.
 */
export function QueryView<T>({
  query,
  skeleton,
  empty,
  isEmpty = (d: T) => Array.isArray(d) && d.length === 0,
  errorHint,
  children,
}: {
  query: UseQueryResult<T>;
  skeleton: ReactNode;
  empty?: ReactNode;
  isEmpty?: (data: T) => boolean;
  errorHint?: ReactNode;
  children: (data: T) => ReactNode;
}) {
  if (query.isPending) return <>{skeleton}</>;
  if (query.isError) {
    const info = describeError(query.error);
    return (
      <StateView
        kind="error"
        icon={<ServerCrash size={18} />}
        title={info.title}
        body={errorHint ? <>{info.body} {errorHint}</> : info.body}
        detail={info.detail}
        action={
          <Button size="sm" icon={<RotateCw size={13} />} loading={query.isFetching} onClick={() => query.refetch()}>
            Retry
          </Button>
        }
      />
    );
  }
  if (empty && isEmpty(query.data)) return <>{empty}</>;
  return <>{children(query.data)}</>;
}
