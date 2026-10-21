"use client";

import { Archive, ArchiveRestore, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import type { ProjectFormValues } from "@/lib/validation/project";
import { archiveProjectAction, deleteProjectAction, restoreProjectAction, updateProjectAction } from "@/server/actions/projects";
import { Dialog } from "./Dialog";
import { inputClasses } from "./Field";
import { ProjectForm } from "./ProjectForm";
import { useToast } from "./Toast";

type ProjectRef = { id: string; name: string; status: "ACTIVE" | "ARCHIVED" };

/** Header actions: edit (dialog) and archive/restore. */
export function ProjectActions({ project, formValues }: { project: ProjectRef; formValues: ProjectFormValues }) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const archived = project.status === "ARCHIVED";

  async function toggleArchive() {
    setArchiving(true);
    const result = archived ? await restoreProjectAction(project.id) : await archiveProjectAction(project.id);
    setArchiving(false);
    if (!result.ok) return toast.error(result.error);
    toast.success(archived ? "Project restored." : "Project archived.");
    router.refresh();
  }

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
        <Pencil className="size-3.5" aria-hidden="true" />
        Edit
      </Button>
      <Button variant="secondary" size="sm" onClick={toggleArchive} loading={archiving}>
        {archiving ? null : archived ? <ArchiveRestore className="size-3.5" aria-hidden="true" /> : <Archive className="size-3.5" aria-hidden="true" />}
        {archived ? "Restore" : "Archive"}
      </Button>

      <Dialog open={editing} onClose={() => setEditing(false)} title="Edit project" className="max-w-[560px]">
        <ProjectForm
          initialValues={formValues}
          submitLabel="Save changes"
          onCancel={() => setEditing(false)}
          onSubmit={async (values) => {
            const result = await updateProjectAction(project.id, values);
            if (!result.ok) return result;
            setEditing(false);
            toast.success("Project updated.");
            router.refresh();
            return { ok: true };
          }}
        />
      </Dialog>
    </>
  );
}

/** Permanent deletion, guarded by typing the project name. Rendered only for workspace owners. */
export function DeleteProjectSection({ project }: { project: ProjectRef }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const confirmId = useId();
  const matches = confirmText === project.name;

  function close() {
    setOpen(false);
    setConfirmText("");
  }

  async function confirmDelete() {
    setDeleting(true);
    const result = await deleteProjectAction(project.id, confirmText);
    if (!result.ok) {
      setDeleting(false);
      return toast.error(result.error);
    }
    toast.success(`"${project.name}" was permanently deleted.`);
    router.replace("/dashboard/projects");
    router.refresh();
  }

  return (
    <section aria-labelledby="danger-title" className="rounded-[var(--radius-card)] border border-danger/30 bg-card p-5 sm:p-6">
      <h2 id="danger-title" className="text-[15px] font-semibold text-fg">
        Delete project
      </h2>
      <p className="mt-1 max-w-[60ch] text-[13.5px] leading-relaxed text-fg-2">
        Permanently removes this project and its settings. This can&apos;t be undone — archive it instead if you might need it later.
      </p>
      <Button variant="danger" size="sm" className="mt-4" onClick={() => setOpen(true)}>
        <Trash2 className="size-3.5" aria-hidden="true" />
        Delete project…
      </Button>

      <Dialog
        open={open}
        busy={deleting}
        onClose={close}
        title="Delete this project permanently?"
        description={
          <>
            <strong className="font-medium text-fg">{project.name}</strong> will be deleted forever. This action cannot be undone.
          </>
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (matches) void confirmDelete();
          }}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-1.5">
            <label htmlFor={confirmId} className="text-[13.5px] text-fg-2">
              Type <strong className="font-mono font-medium text-fg">{project.name}</strong> to confirm.
            </label>
            <input
              id={confirmId}
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              className={`${inputClasses} h-11 font-mono`}
            />
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" disabled={deleting} onClick={close}>
              Cancel
            </Button>
            <Button type="submit" variant="danger" loading={deleting} disabled={!matches}>
              Delete permanently
            </Button>
          </div>
        </form>
      </Dialog>
    </section>
  );
}
