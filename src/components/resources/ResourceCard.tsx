import { Card, CardBody } from "@/components/ui/Card";
import { SaveResourceButton } from "./ResourceActions";
import {
  UNVERIFIED_NOTICE,
  VERIFIED_NOTICE,
  resourceKindLabel,
} from "@/config/resources";
import type { Resource } from "@/lib/queries/resources";

/**
 * One catalogue entry.
 *
 * The verification badge is not decoration. This portal links out to the
 * wider internet, and PRD 5.9 requires an entry nobody has checked to say so
 * — so the unverified state gets the louder treatment, and the link itself
 * carries `rel="noopener noreferrer"` because these destinations are not
 * ours.
 */
export function ResourceCard({
  resource,
  reasons,
  saved,
  canSave,
}: {
  resource: Resource;
  /** Why this was recommended, when it was (PRD 5.9). */
  reasons?: string[];
  saved?: boolean;
  canSave?: boolean;
}) {
  return (
    <Card as="article">
      <CardBody className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-brass-600">
              {resourceKindLabel(resource.kind)}
              {resource.provider ? ` · ${resource.provider}` : ""}
            </p>
            <h3 className="mt-1 text-base text-indigo-950">
              <a
                href={resource.url}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded hover:underline"
              >
                {resource.title}
              </a>
            </h3>
          </div>

          <span
            title={resource.isVerified ? VERIFIED_NOTICE : UNVERIFIED_NOTICE}
            className={[
              "shrink-0 rounded-md border px-2 py-1 text-xs font-medium",
              resource.isVerified
                ? "border-success/30 bg-success/5 text-success"
                : "border-warning/40 bg-warning/5 text-warning",
            ].join(" ")}
          >
            {resource.isVerified ? "Checked" : "Not checked"}
          </span>
        </div>

        {resource.description && (
          <p className="text-sm leading-relaxed text-ink-muted">
            {resource.description}
          </p>
        )}

        <p className="break-all text-xs text-ink-faint">{resource.url}</p>

        <dl className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-faint">
          {resource.estimatedHours !== null && (
            <div>
              <dt className="inline">Effort: </dt>
              <dd className="inline text-ink-muted">
                about {resource.estimatedHours} hours
              </dd>
            </div>
          )}
          {resource.isFree !== null && (
            <div>
              <dt className="inline">Cost: </dt>
              <dd className="inline text-ink-muted">
                {resource.isFree ? "Free" : "Paid"}
              </dd>
            </div>
          )}
          {resource.departmentCode && (
            <div>
              <dt className="inline">For: </dt>
              <dd className="inline text-ink-muted">
                {resource.departmentCode}
              </dd>
            </div>
          )}
        </dl>

        {!resource.isVerified && (
          <p className="rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-warning">
            {UNVERIFIED_NOTICE}
          </p>
        )}

        {reasons && reasons.length > 0 && (
          <div className="rounded-lg border border-indigo-100 bg-indigo-50/60 px-3 py-2">
            <p className="text-xs font-medium text-indigo-900">
              Why you are seeing this
            </p>
            <ul className="mt-1 space-y-0.5">
              {reasons.map((reason) => (
                <li key={reason} className="text-xs text-indigo-800">
                  {reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        {canSave && (
          <SaveResourceButton resourceId={resource.id} saved={saved ?? false} />
        )}
      </CardBody>
    </Card>
  );
}
