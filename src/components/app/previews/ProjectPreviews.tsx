import { ArrowRight, Radio } from "lucide-react";
import Link from "next/link";
import { shareCommand } from "@/lib/previews";
import { Card } from "../Primitives";
import { Command } from "../share/Command";
import { PreviewList, type PreviewListItem } from "./PreviewList";

/** "Project Previews" on a project page: live tunnels first, then recent history. */
export function ProjectPreviews({
  project,
  active,
  history,
  total,
  now,
  run = "localians",
}: {
  project: { id: string; defaultPort: number | null; archived: boolean };
  active: PreviewListItem[];
  history: PreviewListItem[];
  total: number;
  now: number;
  run?: string;
}) {
  const command = shareCommand(project.defaultPort, project.id, run);
  return (
    <section aria-labelledby="project-previews-title" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="project-previews-title" className="flex items-center gap-2 text-[18px] font-semibold tracking-[-0.02em] text-fg">
          <Radio className="size-4 text-fg-3" aria-hidden="true" />
          Project Previews
        </h2>
        {total > 0 ? (
          <Link href={`/dashboard/previews?project=${project.id}`} className="inline-flex items-center gap-1 text-[13.5px] text-fg-2 transition-colors hover:text-fg">
            All {total} session{total === 1 ? "" : "s"}
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        ) : null}
      </div>

      {total === 0 ? (
        <Card className="flex flex-col gap-4 p-5 sm:p-6">
          <div>
            <h3 className="text-[16px] font-semibold text-fg">No previews yet.</h3>
            <p className="mt-1 text-[14px] leading-relaxed text-fg-2">Start your local app, then share it with Localians to create your first preview.</p>
          </div>
          {project.archived ? (
            <p className="text-[13.5px] text-fg-2">Restore this project to share it.</p>
          ) : (
            <>
              <Command value={command} label="Copy share command" />
              <Link href={`/dashboard/share${project.defaultPort ? `?port=${project.defaultPort}` : ""}`} className="w-fit text-[13px] font-medium text-accent-ink underline underline-offset-4">
                Walk me through it step by step
              </Link>
              {project.defaultPort ? null : (
                <p className="text-[12.5px] leading-relaxed text-fg-3">
                  This project has no saved port. Replace <code className="font-mono">&lt;port&gt;</code> with the port your dev server prints, or add it under Edit →
                  Default local port.
                </p>
              )}
            </>
          )}
        </Card>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <h3 className="text-[12px] font-medium uppercase tracking-[0.12em] text-fg-3">Active</h3>
            {active.length ? (
              <PreviewList items={active} now={now} showProject={false} run={run} />
            ) : (
              <Card className="flex flex-col gap-3 p-5">
                <p className="text-[13.5px] text-fg-2">
                  {project.archived ? "Not shared. Restore this project to share it again." : "Not shared right now. Start your dev server, then run:"}
                </p>
                {project.archived ? null : <Command value={command} label="Copy share command" />}
              </Card>
            )}
          </div>
          {history.length ? (
            <div className="flex flex-col gap-2">
              <h3 className="text-[12px] font-medium uppercase tracking-[0.12em] text-fg-3">History</h3>
              <PreviewList items={history.slice(0, 3)} now={now} showProject={false} run={run} />
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
