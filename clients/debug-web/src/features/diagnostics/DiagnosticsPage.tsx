import { useMaintenance } from "@agentic-browser/shared/query";
import { QueryView } from "@agentic-browser/shared/ui";
import { Stethoscope } from "@agentic-browser/shared/icons";
import { PageEmpty } from "../common/PageState";
import { MaintenanceTable, MaintenanceTableSkeleton } from "./MaintenanceTable";
import { ScheduleBar } from "./ScheduleBar";
import "../common/panels.css";

export function MaintenancePanel() {
  const q = useMaintenance();
  return (
    <div className="pn">
      <div className="pn-toolbar">
        <ScheduleBar />
        <div className="pn-toolbar__end">{q.data && <span className="pn-count">{q.data.length} runs</span>}</div>
      </div>
      <QueryView
        query={q}
        skeleton={<MaintenanceTableSkeleton />}
        empty={
          <PageEmpty
            icon={<Stethoscope size={18} />}
            title="No maintenance runs yet"
            body="The backend consolidates memory hourly, nightly at 03:00 and weekly on Sundays. The first run appears after the backend has been up for an hour."
          />
        }
      >
        {(runs) => <MaintenanceTable runs={runs} />}
      </QueryView>
    </div>
  );
}
