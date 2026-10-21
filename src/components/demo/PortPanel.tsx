"use client";

import { useState } from "react";
import { CopyButton } from "@/components/ui/CopyButton";
import { Window } from "@/components/ui/Window";
import { cn } from "@/lib/cn";

const servers = [
  { name: "Next.js", cmd: "next dev", port: "3000" },
  { name: "React + Vite", cmd: "vite", port: "5173" },
  { name: "Vue + Vite", cmd: "vite", port: "5173" },
  { name: "Angular", cmd: "ng serve", port: "4200" },
  { name: "Node.js", cmd: "node server.js", port: "8080" },
];

const ports = ["3000", "3001", "4200", "5173", "8000", "8080"];

export function PortPanel() {
  const [port, setPort] = useState("5173");
  const command = `npx localians share ${port}`;

  return (
    <Window title="dev servers — localians" bodyClassName="font-mono text-[12px] sm:text-[12.5px]">
      <table className="w-full table-fixed border-collapse text-left">
        <caption className="sr-only">Common development servers and their default local ports</caption>
        <thead>
          <tr className="border-b border-line text-[10.5px] uppercase tracking-[0.14em] text-fg-3">
            <th scope="col" className="px-4 py-3 font-medium sm:px-5">Server</th>
            <th scope="col" className="hidden px-4 py-3 font-medium sm:table-cell">Command</th>
            <th scope="col" className="w-[92px] px-4 py-3 text-right font-medium sm:w-[110px] sm:px-5">Port</th>
          </tr>
        </thead>
        <tbody>
          {servers.map((s) => {
            const match = s.port === port;
            return (
              <tr key={s.name} className={cn("border-b border-line transition-colors", match && "bg-accent/[0.05]")}>
                <th scope="row" className={cn("truncate px-4 py-2.5 font-normal sm:px-5", match ? "text-fg" : "text-fg-2")}>
                  {s.name}
                </th>
                <td className="hidden truncate px-4 py-2.5 text-fg-3 sm:table-cell">{s.cmd}</td>
                <td className={cn("px-4 py-2.5 text-right sm:px-5", match ? "text-accent" : "text-fg-3")}>:{s.port}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="px-4 py-4 sm:px-5">
        <fieldset>
          <legend className="text-[10.5px] uppercase tracking-[0.14em] text-fg-3">Pick a port</legend>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {ports.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPort(p)}
                aria-pressed={p === port}
                className={cn(
                  "rounded-md border px-2.5 py-1 text-[12px] transition-colors",
                  p === port
                    ? "border-accent/50 bg-accent/10 text-accent"
                    : "border-line text-fg-2 hover:border-line-strong hover:text-fg",
                )}
              >
                :{p}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-line bg-black/40 py-2 pl-3 pr-2">
          <code className="min-w-0 truncate text-fg" aria-live="polite">
            <span className="select-none text-accent">$ </span>
            {command}
          </code>
          <CopyButton value={command} label={`Copy command: ${command}`} />
        </div>
      </div>
    </Window>
  );
}
