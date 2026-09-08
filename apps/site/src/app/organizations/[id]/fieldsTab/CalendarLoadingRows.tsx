import type { FacilityResourceCalendarResource } from './FacilityResourceCalendarGrid';

export default function CalendarLoadingRows({ resources }: { resources: FacilityResourceCalendarResource[] }) {
  return <>{Array.from({ length: resources.length || 3 }, (_, index) => (
    <div key={resources[index]?.id ?? index} className="facility-resource-calendar__resource-row" role="row">
      <div className="facility-resource-calendar__resource-label" role="rowheader">
        {resources[index]?.label ?? <span className="org-skeleton org-loading-cell__line" aria-hidden="true" />}
      </div>
      <div className="facility-resource-calendar__timeline-row org-calendar-loading-row" role="gridcell">
        {index === 0 && <span className="sr-only" role="status">Loading resources</span>}
        <span className="org-skeleton" aria-hidden="true" />
        <span className="org-skeleton" aria-hidden="true" />
      </div>
    </div>
  ))}</>;
}
