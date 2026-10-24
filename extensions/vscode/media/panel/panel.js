// @ts-check
// The Localians sidebar panel. Renders the state the extension posts, and sends back only the messages its controls
// stand for (the extension validates every one). Builds the page with DOM APIs (textContent, never parsed markup), so
// nothing from the server can become markup. Holds no tokens or passwords.
(function () {
  const vscode = acquireVsCodeApi();
  const root = /** @type {HTMLElement} */ (document.getElementById("app"));
  /** Form choices survive re-renders and the panel being hidden (VS Code keeps this per view). */
  const form = Object.assign(
    { port: /** @type {number|null} */ (null), manual: false, manualPort: "", projectId: /** @type {string|null|undefined} */ (undefined), newName: "", access: /** @type {"public"|"password"|null} */ (null), duration: /** @type {number|null} */ (null), options: false },
    (vscode.getState() || {}).form || {},
  );
  /** @type {any} */
  let state = null;

  const save = () => vscode.setState({ form });
  /** @param {any} message */
  const send = (message) => vscode.postMessage(message);

  window.addEventListener("message", (event) => {
    const data = event.data;
    if (data && data.type === "state" && data.state) {
      state = data.state;
      render();
    }
  });
  send({ type: "ready" });
  setInterval(updateCountdowns, 15000);

  // ---------------------------------------------------------------- DOM helpers

  /**
   * @param {string} tag
   * @param {Record<string, any>} [attrs]
   * @param {...any} kids
   */
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === false || v == null) continue;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
      else if (k in el && (k === "value" || k === "checked" || k === "disabled" || k === "open" || k === "selected")) /** @type {any} */ (el)[k] = v;
      else el.setAttribute(k, v === true ? "" : String(v));
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    return el;
  }

  const ICONS = {
    copy: "M4 4h7v1H5v7H4V4zm3 3h7v7H7V7zm1 1v5h5V8H8z",
    open: "M9 2h5v5h-1V3.7L7.4 9.3l-.7-.7L12.3 3H9V2zM3 4h4v1H4v7h7V9h1v4H3V4z",
    stop: "M4 4h8v8H4V4z",
    refresh: "M13.5 2v4h-4V5h2.1A5 5 0 1 0 13 8h1a6 6 0 1 1-1.5-4V2h1z",
    plus: "M7.5 3h1v4.5H13v1H8.5V13h-1V8.5H3v-1h4.5V3z",
    terminal: "M2 3h12v10H2V3zm1 1v8h10V4H3zm1.6 1.6L7 8l-2.4 2.4-.7-.7L5.6 8 3.9 6.3l.7-.7zM8 10h3v1H8v-1z",
    check: "M6.2 11.2 3 8l.7-.7 2.5 2.5 6.1-6.1.7.7-6.8 6.8z",
    lock: "M5 7V5a3 3 0 0 1 6 0v2h1v7H4V7h1zm1 0h4V5a2 2 0 0 0-4 0v2zM5 8v5h6V8H5z",
    globe: "M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zm4.9 6H11a10 10 0 0 0-.7-3.6 5.5 5.5 0 0 1 2.6 3.6zM8 2.6c.6.8 1.3 2.4 1.5 4.9h-3C6.7 5 7.4 3.4 8 2.6zM5.7 3.9A10 10 0 0 0 5 7.5H3.1a5.5 5.5 0 0 1 2.6-3.6zM3.1 8.5H5c.1 1.4.3 2.6.7 3.6a5.5 5.5 0 0 1-2.6-3.6zM8 13.4c-.6-.8-1.3-2.4-1.5-4.9h3c-.2 2.5-.9 4.1-1.5 4.9zm2.3-1.3c.4-1 .6-2.2.7-3.6h1.9a5.5 5.5 0 0 1-2.6 3.6z",
  };
  /** @param {keyof typeof ICONS} name */
  function icon(name) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 16 16");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("class", "icon");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", ICONS[name]);
    path.setAttribute("fill", "currentColor");
    svg.append(path);
    return svg;
  }

  /**
   * @param {string} label
   * @param {() => void} onclick
   * @param {{ kind?: "primary"|"secondary"|"ghost"|"danger", icon?: keyof typeof ICONS, key?: string, disabled?: boolean, title?: string, wide?: boolean }} [o]
   */
  function button(label, onclick, o = {}) {
    return h(
      "button",
      { type: "button", class: `btn ${o.kind || "secondary"}${o.wide ? " wide" : ""}`, "data-key": o.key || null, disabled: Boolean(o.disabled), title: o.title || null, onclick },
      o.icon ? icon(o.icon) : null,
      h("span", { text: label }),
    );
  }

  /** @param {number} ms */
  function remaining(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const d = Math.floor(s / 86400);
    const hr = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (d) return `${d}d ${hr}h`;
    if (hr) return `${hr}h ${String(m).padStart(2, "0")}m`;
    if (m) return `${m}m`;
    return "under a minute";
  }
  /** @param {string|null} iso */
  const until = (iso) => (iso ? new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "");

  function updateCountdowns() {
    for (const el of root.querySelectorAll("[data-expires]")) {
      const at = Number(/** @type {HTMLElement} */ (el).dataset.expires);
      el.textContent = `${remaining(at - Date.now())} left`;
    }
  }

  // ---------------------------------------------------------------- render

  function render() {
    const active = /** @type {HTMLElement|null} */ (document.activeElement);
    const key = active && active.dataset ? active.dataset.key : undefined;
    const caret = active && "selectionStart" in active ? /** @type {HTMLInputElement} */ (active).selectionStart : null;
    root.replaceChildren(...view().filter(Boolean));
    root.setAttribute("aria-busy", "false");
    if (key) {
      const again = /** @type {HTMLElement|null} */ (root.querySelector(`[data-key="${CSS.escape(key)}"]`));
      if (again) {
        again.focus();
        if (caret != null && "setSelectionRange" in again) {
          try {
            /** @type {HTMLInputElement} */ (again).setSelectionRange(caret, caret);
          } catch {
            /* number inputs */
          }
        }
      }
    }
  }

  function view() {
    if (!state) return [h("p", { class: "muted loading", text: "Loading Localians…" })];
    if (state.phase === "signingIn") return [waiting(), notice(), links()];
    if (state.phase === "signedOut") return [welcome(), notice(), guide(true), links()];
    return [account(), notice(), state.trusted ? null : trust(), shareSection(), previews(), guide(false), links()];
  }

  function welcome() {
    return h(
      "section",
      { class: "welcome", "aria-labelledby": "welcome-title" },
      h("div", { class: "mark", "aria-hidden": "true" }, icon("globe")),
      h("h1", { id: "welcome-title", text: "Welcome to Localians" }),
      h("p", { class: "lead", text: "Share your localhost apps securely in seconds." }),
      button("Sign In to Localians", () => send({ type: "signIn" }), { kind: "primary", wide: true, key: "sign-in" }),
      h("p", { class: "muted small", text: "Your browser opens once to approve VS Code. No tokens or passwords to copy." }),
    );
  }

  function waiting() {
    const s = state.signIn;
    return h(
      "section",
      { class: "waiting", "aria-labelledby": "waiting-title", role: "status" },
      h("h1", { id: "waiting-title" }, h("span", { class: "spinner", "aria-hidden": "true" }), "Waiting for sign in…"),
      h("p", { text: "Approve VS Code in your browser. Check that the page shows this code:" }),
      s ? h("p", { class: "code", "aria-label": `Code ${s.code.split("").join(" ")}`, text: s.code }) : null,
      h(
        "div",
        { class: "actions" },
        button("Copy Code", () => send({ type: "copyCode" }), { icon: "copy", key: "copy-code" }),
        button("Open Browser Again", () => send({ type: "openApproval" }), { icon: "open", key: "open-approval" }),
      ),
      button("Cancel", () => send({ type: "cancelSignIn" }), { kind: "ghost", key: "cancel-sign-in" }),
    );
  }

  function account() {
    const a = state.account;
    const live = state.previews.filter((/** @type {any} */ p) => p.status !== "ended" && p.status !== "offline").length;
    return h(
      "header",
      { class: "account" },
      h(
        "div",
        { class: "who" },
        h("span", { class: "dot on", "aria-hidden": "true" }),
        h(
          "div",
          { class: "who-text" },
          h("div", { class: "name", title: a.email, text: a.username ? `@${a.username}` : a.email }),
          h("div", { class: "muted small", "data-testid": "account-status", text: `Connected${live ? ` · ${live} live` : ""} · ${a.workspace}` }),
        ),
      ),
      h(
        "div",
        { class: "account-actions" },
        h("button", { type: "button", class: "text-btn", "data-key": "switch", onclick: () => send({ type: "switchAccount" }), text: "Switch Account" }),
        h("button", { type: "button", class: "text-btn", "data-key": "sign-out", onclick: () => send({ type: "signOut" }), text: "Sign Out" }),
      ),
    );
  }

  function notice() {
    const n = state.notice;
    if (!n) return null;
    return h(
      "div",
      { class: `notice ${n.tone}`, role: n.tone === "error" || n.tone === "warning" ? "alert" : "status", "data-testid": "notice" },
      h("p", { text: n.text }),
      h(
        "div",
        { class: "actions" },
        ...n.actions.map((/** @type {any} */ a, /** @type {number} */ i) => button(a.label, () => send(a.message), { kind: i === 0 ? "secondary" : "ghost", key: `notice-${i}` })),
        h("button", { type: "button", class: "text-btn", "aria-label": "Dismiss message", onclick: () => send({ type: "dismissNotice" }), text: "Dismiss" }),
      ),
    );
  }

  function trust() {
    return h(
      "div",
      { class: "notice warning", role: "status" },
      h("p", { text: "Sharing is off in Restricted Mode. Trust this workspace to share its apps." }),
      h("div", { class: "actions" }, button("Manage Workspace Trust", () => send({ type: "link", target: "trust" }))),
    );
  }

  /** The app the form is about: chosen, remembered, or the first one found. */
  function currentApp() {
    if (form.manual) return null;
    const apps = state.apps;
    return apps.find((/** @type {any} */ a) => a.port === form.port) || apps.find((/** @type {any} */ a) => a.port === state.last.port) || apps[0] || null;
  }

  function shareSection() {
    const apps = state.apps;
    const app = currentApp();
    const manual = form.manual || (!apps.length && form.manualPort !== "");
    const port = manual ? Number(form.manualPort) : app ? app.port : null;
    const portOk = Number.isInteger(port) && /** @type {number} */ (port) >= 1 && /** @type {number} */ (port) <= 65535;
    const shared = portOk && state.previews.find((/** @type {any} */ p) => p.port === port && p.source === "local" && p.status !== "ended");

    const body = [];
    if (apps.length) {
      body.push(
        h(
          "label",
          { class: "field" },
          h("span", { class: "label", text: "Running app" }),
          h(
            "div",
            { class: "with-button" },
            h(
              "select",
              {
                "data-key": "app",
                "aria-label": "Running app",
                onchange: (/** @type {Event} */ e) => {
                  const v = /** @type {HTMLSelectElement} */ (e.target).value;
                  form.manual = v === "manual";
                  if (!form.manual) form.port = Number(v);
                  form.projectId = undefined;
                  save();
                  render();
                },
              },
              ...apps.map((/** @type {any} */ a) => h("option", { value: String(a.port), selected: !form.manual && app && a.port === app.port, text: `${a.label} · :${a.port}` })),
              h("option", { value: "manual", selected: form.manual, text: "Enter a port…" }),
            ),
            iconButton("refresh", "Retry detection", () => send({ type: "detect" }), "detect", state.scanning),
          ),
        ),
      );
    } else {
      body.push(
        h(
          "div",
          { class: "empty", "data-testid": "no-apps" },
          h("p", { text: state.scanning ? "Looking for running apps…" : "No running local application found." }),
          state.scanning ? null : h("p", { class: "muted small", text: "Start your app as usual, for example npm run dev." }),
          h(
            "div",
            { class: "actions" },
            button("Enter Port Manually", () => {
              form.manual = true;
              save();
              render();
              /** @type {HTMLElement|null} */ (root.querySelector('[data-key="manual-port"]'))?.focus();
            }, { key: "enter-port" }),
            button("Retry Detection", () => send({ type: "detect" }), { icon: "refresh", key: "retry-detect", disabled: state.scanning }),
          ),
        ),
      );
    }
    if (manual || form.manual) {
      body.push(
        h(
          "label",
          { class: "field" },
          h("span", { class: "label", text: "Local port" }),
          h("input", {
            type: "text",
            inputmode: "numeric",
            "data-key": "manual-port",
            placeholder: "e.g. 3000",
            value: form.manualPort,
            "aria-label": "Local port",
            oninput: (/** @type {Event} */ e) => {
              form.manualPort = /** @type {HTMLInputElement} */ (e.target).value.replace(/[^0-9]/g, "").slice(0, 5);
              save();
            },
            onchange: () => render(),
          }),
        ),
      );
    }

    if (!portOk && !apps.length && !form.manual) return section("Your Local App", "app-title", body);
    if (shared) {
      // Already live: keep the form out of the way so the preview below stays in view.
      body.push(h("p", { class: "muted small", "data-testid": "already-shared", text: "This app is already being shared. Open its active preview below." }));
      return section("Your Local App", "app-title", body);
    }

    // Project
    const suggested = app ? app.suggestedName : state.workspaceName;
    const matched = app ? app.projectId : state.projects.find((/** @type {any} */ p) => p.defaultPort === port)?.id ?? null;
    const projectId = form.projectId === undefined ? matched : form.projectId;
    const project = projectId ? state.projects.find((/** @type {any} */ p) => p.id === projectId) || null : null;
    body.push(
      h(
        "label",
        { class: "field" },
        h("span", { class: "label", text: "Project" }),
        h(
          "select",
          {
            "data-key": "project",
            "aria-label": "Project",
            onchange: (/** @type {Event} */ e) => {
              const v = /** @type {HTMLSelectElement} */ (e.target).value;
              form.projectId = v === "__new" ? null : v;
              form.duration = null;
              save();
              render();
            },
          },
          ...state.projects.map((/** @type {any} */ p) => h("option", { value: p.id, selected: project && p.id === project.id, text: `${p.name}${p.defaultPort ? ` · :${p.defaultPort}` : ""}` })),
          h("option", { value: "__new", selected: !project, text: "Create new project…" }),
        ),
      ),
    );
    if (!project) {
      body.push(
        h(
          "label",
          { class: "field" },
          h("span", { class: "label", text: "New project name" }),
          h("input", {
            type: "text",
            "data-key": "new-name",
            maxlength: 80,
            value: form.newName || suggested,
            "aria-label": "New project name",
            oninput: (/** @type {Event} */ e) => {
              form.newName = /** @type {HTMLInputElement} */ (e.target).value;
              save();
            },
          }),
        ),
      );
    }
    body.push(planLine(project));

    // Options (collapsed): access, duration, custom URL
    const allowed = durations(project);
    const duration = allowed.some((d) => d.minutes === form.duration) ? /** @type {number} */ (form.duration) : allowed.some((d) => d.minutes === state.last.durationMinutes) ? state.last.durationMinutes : 0;
    const access = form.access || (project && project.access === "password" ? "password" : "public");
    const summary = `${access === "password" ? "Password protected" : "Public"} · ${allowed.find((d) => d.minutes === duration)?.label}`;
    body.push(
      h(
        "details",
        {
          class: "options",
          open: form.options,
          ontoggle: (/** @type {Event} */ e) => {
            form.options = /** @type {HTMLDetailsElement} */ (e.target).open;
            save();
          },
        },
        h("summary", { "data-key": "options" }, h("span", { text: "Options" }), h("span", { class: "muted small summary-value", text: summary })),
        h(
          "fieldset",
          { class: "field" },
          h("legend", { class: "label", text: "Who can open it" }),
          radio("access", "public", "Public", "Anyone with the link", access === "public", project && project.access === "password", "globe"),
          radio("access", "password", "Password protected", project && project.access === "password" ? "Keeps the project's password" : "You'll choose a password next", access === "password", false, "lock"),
          project && project.access === "password" ? h("p", { class: "muted small", text: "Protected projects are made public in the dashboard only." }) : null,
        ),
        h(
          "label",
          { class: "field" },
          h("span", { class: "label", text: "Link works for" }),
          h(
            "select",
            {
              "data-key": "duration",
              "aria-label": "Link works for",
              onchange: (/** @type {Event} */ e) => {
                form.duration = Number(/** @type {HTMLSelectElement} */ (e.target).value);
                save();
                render();
              },
            },
            ...allowed.map((d) => h("option", { value: String(d.minutes), selected: d.minutes === duration, text: d.label })),
          ),
        ),
        project && project.customUrl
          ? h("p", { class: "muted small custom-url" }, "Custom URL: ", h("span", { class: "mono", text: project.customUrl.replace(/^https?:\/\//, "") }))
          : project && project.plan && project.plan.pass
            ? h("p", { class: "muted small", text: "No custom URL yet. Reserve one in the dashboard." })
            : null,
      ),
    );

    // The main action
    const blocked = project && project.plan && !project.plan.canShare;
    if (blocked) {
      body.push(button(project.plan.free === "limit_reached" ? "Get a Preview Pass" : "Renew Preview Pass", () => send({ type: "upgrade", projectId: project.id }), { kind: "primary", wide: true, key: "upgrade" }));
    } else {
      body.push(
        button(state.busy ? "Sharing…" : "Share App", () => {
          const name = (form.newName || suggested || "").trim();
          send({ type: "share", port, projectId: project ? project.id : null, newProjectName: project ? null : name, access, durationMinutes: duration });
        }, { kind: "primary", wide: true, key: "share", icon: "globe", disabled: !portOk || state.busy || !state.trusted || (!project && !(form.newName || suggested || "").trim()) }),
      );
    }
    return section("Your Local App", "app-title", body);
  }

  /**
   * @param {string} name @param {string} value @param {string} label @param {string} hint
   * @param {boolean} checked @param {boolean|null} disabled @param {keyof typeof ICONS} ic
   */
  function radio(name, value, label, hint, checked, disabled, ic) {
    return h(
      "label",
      { class: `choice${disabled ? " disabled" : ""}` },
      h("input", {
        type: "radio",
        name,
        value,
        checked,
        disabled: Boolean(disabled),
        "data-key": `${name}-${value}`,
        onchange: () => {
          form.access = /** @type {"public"|"password"} */ (value);
          save();
          render();
        },
      }),
      icon(ic),
      h("span", { class: "choice-text" }, h("span", { text: label }), h("span", { class: "muted small", text: hint })),
    );
  }

  /** @param {any} project */
  function durations(project) {
    const pass = Boolean(project && project.plan && project.plan.pass);
    const first = { minutes: 0, label: pass ? "Until the Preview Pass ends" : "Until the free preview ends" };
    return [first, ...state.durations.filter((/** @type {any} */ d) => d.plan === "free" || pass).map((/** @type {any} */ d) => ({ minutes: d.minutes, label: d.label }))];
  }

  /** @param {any} project */
  function planLine(project) {
    let text = "New project · free 24-hour preview";
    let tone = "";
    if (project && project.plan) {
      const p = project.plan;
      if (p.pass) [text, tone] = [`Preview Pass · until ${until(p.passEndsAt)}`, "pass"];
      else if (p.free === "active") text = `Free preview · ends ${until(p.freeEndsAt)}`;
      else if (p.free === "available") text = "Free 24-hour preview available";
      else if (p.free === "used") [text, tone] = ["Free preview used. Renew your Preview Pass to share again.", "warn"];
      else [text, tone] = ["Free preview allowance used for now. A Preview Pass lets you share now.", "warn"];
    } else if (project) text = "Plan: checked when you share";
    return h("p", { class: `plan ${tone}`, "data-testid": "plan-line", text });
  }

  /** A detected app that isn't shared yet (from this window or a terminal). */
  function nextUnshared() {
    const used = new Set(state.previews.filter((/** @type {any} */ p) => p.status !== "ended").map((/** @type {any} */ p) => p.port));
    return state.apps.find((/** @type {any} */ a) => !used.has(a.port)) || null;
  }

  /** Points the form at the next app to share (or a port to type) and moves focus there. */
  function shareAnother() {
    const next = nextUnshared();
    form.manual = !next;
    form.port = next ? next.port : null;
    form.projectId = undefined;
    form.newName = "";
    form.access = null;
    save();
    render();
    const target = /** @type {HTMLElement|null} */ (root.querySelector(next ? '[data-key="app"]' : '[data-key="manual-port"]'));
    target?.scrollIntoView({ block: "center" });
    target?.focus();
  }

  function previews() {
    const list = state.previews;
    const live = list.filter((/** @type {any} */ p) => p.status !== "ended");
    const body = [];
    if (!list.length) body.push(h("p", { class: "muted small", text: "Nothing shared yet. Your previews appear here." }));
    else body.push(h("ul", { class: "previews", "aria-label": "Previews" }, ...list.map(previewItem)));
    if (list.length) body.push(button("Share Another App", shareAnother, { kind: "ghost", icon: "plus", key: "share-another" }));
    const title = `Active Previews${live.length ? ` (${live.length})` : ""}`;
    return section(title, "previews-title", body, state.limit && live.length >= state.limit ? `Limit: ${state.limit} at once` : null);
  }

  /** @param {any} p */
  function previewItem(p) {
    const labels = {
      connecting: "Connecting…",
      connected: "Live",
      reconnecting: "Connection interrupted. Reconnecting…",
      ended: "Stopped",
      offline: "Offline",
    };
    const ended = p.status === "ended";
    const meta = [h("span", { class: `status ${p.status}` }, h("span", { class: "dot", "aria-hidden": "true" }), /** @type {any} */ (labels)[p.status]), h("span", { text: `Port ${p.port}` })];
    if (p.plan) meta.push(h("span", { class: `tag ${p.plan}`, text: p.plan === "pass" ? "Pass" : "Free" }));
    if (p.access) meta.push(h("span", { class: "tag", title: p.access === "password" ? "Visitors enter the project password" : "Anyone with the link" }, icon(p.access === "password" ? "lock" : "globe"), p.access === "password" ? "Protected" : "Public"));
    if (p.source === "remote") meta.push(h("span", { class: "muted small", text: "from a terminal" }));
    if (!ended && p.expiresAt) meta.push(h("span", { class: "muted small", "data-expires": String(p.expiresAt), text: `${remaining(p.expiresAt - Date.now())} left` }));
    const actions = ended
      ? [
          p.source === "local" ? button("Share Again", () => send({ type: "preview", action: "reshare", id: p.id }), { icon: "refresh", key: `reshare-${p.id}` }) : null,
          button("Dismiss", () => send({ type: "preview", action: "dismiss", id: p.id }), { kind: "ghost", key: `dismiss-${p.id}` }),
        ]
      : [
          button("Copy Link", () => send({ type: "preview", action: "copy", id: p.id }), { icon: "copy", key: `copy-${p.id}`, disabled: !p.url }),
          button("Open", () => send({ type: "preview", action: "open", id: p.id }), { icon: "open", key: `open-${p.id}`, disabled: !p.url }),
          button("Stop", () => send({ type: "preview", action: "stop", id: p.id }), { kind: "danger", icon: "stop", key: `stop-${p.id}` }),
        ];
    return h(
      "li",
      { class: `preview ${p.status}`, "data-testid": "preview", "data-port": String(p.port) },
      h("div", { class: "preview-name", text: p.project }),
      h("div", { class: "meta" }, ...meta),
      p.url ? h("div", { class: `url mono${ended ? " struck" : ""}`, title: p.url, text: p.url.replace(/^https?:\/\//, "") }) : null,
      ended && p.endMessage ? h("p", { class: "muted small", text: p.endMessage }) : null,
      h("div", { class: "actions" }, ...actions),
    );
  }

  /** @param {boolean} signedOut */
  function guide(signedOut) {
    const steps = [
      ["Sign In", "Connect your Localians account."],
      ["Run Your App", "Start your development server normally, for example npm run dev."],
      ["Share", "Choose your running port and click Share App."],
      ["Copy Link", "Send the HTTPS preview link to anyone."],
    ];
    return h(
      "details",
      {
        class: "guide",
        open: signedOut || state.guideOpen,
        ontoggle: (/** @type {Event} */ e) => {
          if (!signedOut) send({ type: "guide", open: /** @type {HTMLDetailsElement} */ (e.target).open });
        },
      },
      h("summary", { "data-key": "guide" }, h("span", { text: "Getting started" })),
      h(
        "ol",
        { class: "steps" },
        ...steps.map(([title, text], i) => h("li", {}, h("span", { class: "step-n", "aria-hidden": "true", text: String(i + 1) }), h("span", {}, h("strong", { text: title }), h("span", { class: "muted small", text: ` ${text}` })))),
      ),
    );
  }

  function links() {
    const items = [
      ["Dashboard", "dashboard"],
      ["Documentation", "docs"],
      ["Troubleshooting", "troubleshooting"],
      ["Settings", "settings"],
    ];
    return h(
      "nav",
      { class: "links", "aria-label": "Localians links" },
      ...items.map(([label, target]) => h("button", { type: "button", class: "text-btn", "data-key": `link-${target}`, onclick: () => send({ type: "link", target }), text: label })),
    );
  }

  /** @param {keyof typeof ICONS} ic @param {string} label @param {() => void} onclick @param {string} key @param {boolean} busy */
  function iconButton(ic, label, onclick, key, busy) {
    return h("button", { type: "button", class: `icon-btn${busy ? " spinning" : ""}`, "aria-label": label, title: label, "data-key": key, disabled: busy, onclick }, icon(ic));
  }

  /** @param {string} title @param {string} id @param {any[]} body @param {string|null} [aside] */
  function section(title, id, body, aside) {
    return h("section", { class: "section", "aria-labelledby": id }, h("h2", { id }, h("span", { text: title }), aside ? h("span", { class: "muted small", text: aside }) : null), ...body);
  }
})();
