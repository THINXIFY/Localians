"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Dialog } from "@/components/app/Dialog";
import { Field, FormError, inputClasses, TextInput } from "@/components/app/Field";
import { Button } from "@/components/ui/Button";
import { adminUpdateUserAction, deleteUserAction, reactivateUserAction, suspendUserAction } from "@/server/actions/admin";
import { Panel } from "./Ui";

type U = { id: string; publicId: string; name: string; username: string; status: "ACTIVE" | "SUSPENDED" | "DELETED" };

/** Edit profile, suspend / reactivate, and the safe delete (deactivate + anonymise) with a typed confirmation. */
export function UserAdminActions({ user }: { user: U }) {
  const router = useRouter();
  const [name, setName] = useState(user.name);
  const [username, setUsername] = useState(user.username);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"suspend" | "delete" | null>(null);
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState("");
  const deleted = user.status === "DELETED";

  async function run(key: string, action: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    setBusy(key);
    setMessage(null);
    const result = await action().catch(() => ({ ok: false, error: "Something went wrong." }));
    setBusy(null);
    setMessage(result.ok ? { ok: true, text: success } : { ok: false, text: result.error ?? "Failed." });
    if (result.ok) {
      setDialog(null);
      router.refresh();
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Panel title="Edit profile">
        <form
          className="flex flex-col gap-3 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            void run("save", () => adminUpdateUserAction(user.id, { name, username }), "Profile saved.");
          }}
        >
          <Field label="Full name">{(p) => <TextInput {...p} value={name} onChange={(e) => setName(e.target.value)} disabled={deleted} />}</Field>
          <Field label="Username">{(p) => <TextInput {...p} value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} disabled={deleted} />}</Field>
          <Button type="submit" size="sm" className="h-10 w-fit" loading={busy === "save"} disabled={deleted}>
            Save
          </Button>
        </form>
      </Panel>

      <Panel title="Account">
        <div className="flex flex-col gap-3 p-5 text-[13px] text-fg-2">
          {message ? (
            <p role="status" className={message.ok ? "text-accent-ink" : "text-danger"}>
              {message.text}
            </p>
          ) : null}
          {user.status === "ACTIVE" ? (
            <Button variant="secondary" size="sm" className="h-10" onClick={() => setDialog("suspend")}>
              Suspend account
            </Button>
          ) : null}
          {user.status === "SUSPENDED" ? (
            <Button variant="secondary" size="sm" className="h-10" loading={busy === "reactivate"} onClick={() => run("reactivate", () => reactivateUserAction(user.id), "Account reactivated.")}>
              Reactivate account
            </Button>
          ) : null}
          {!deleted ? (
            <Button variant="ghost" size="sm" className="h-10 text-danger" onClick={() => setDialog("delete")}>
              Delete account…
            </Button>
          ) : (
            <p>This account was deleted (deactivated and anonymised). Payment and audit records are kept.</p>
          )}
        </div>
      </Panel>

      <Dialog open={dialog === "suspend"} onClose={() => setDialog(null)} title="Suspend this account?" busy={busy !== null} className="max-w-[460px]">
        <div className="flex flex-col gap-4 text-[13.5px] text-fg-2">
          <p>They are signed out everywhere, their CLI logins are revoked and live previews stop. You can reactivate later.</p>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-fg">Reason (kept in the audit log)</span>
            <input value={reason} onChange={(e) => setReason(e.target.value)} className={`${inputClasses} h-10`} maxLength={200} />
          </label>
          <FormError message={message && !message.ok ? message.text : null} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" loading={busy === "suspend"} onClick={() => run("suspend", () => suspendUserAction(user.id, reason), "Account suspended.")}>
              Suspend
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={dialog === "delete"} onClose={() => setDialog(null)} title="Delete this account?" busy={busy !== null} className="max-w-[460px]">
        <div className="flex flex-col gap-4 text-[13.5px] text-fg-2">
          <p>
            The account is deactivated and anonymised: name, email, username and sign-in methods are removed, access is cut, and projects are archived. Payment and
            audit records stay. This can&apos;t be undone.
          </p>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-fg">
              Type <span className="font-mono">{user.publicId}</span> to confirm
            </span>
            <input value={confirm} onChange={(e) => setConfirm(e.target.value)} className={`${inputClasses} h-10 font-mono`} autoComplete="off" data-autofocus />
          </label>
          <FormError message={message && !message.ok ? message.text : null} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              loading={busy === "delete"}
              disabled={confirm.trim().toUpperCase() !== user.publicId}
              onClick={() => run("delete", () => deleteUserAction(user.id, confirm), "Account deleted.")}
            >
              Delete account
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
