import type * as vscode from "vscode";
import { Controller } from "./controller";

let controller: Controller | undefined;

/** Activates after startup (status bar entry). Nothing is shared or scanned until the user asks. */
export async function activate(context: vscode.ExtensionContext) {
  controller = new Controller(context);
  context.subscriptions.push(controller);
  await controller.activate();
  return { controller };
}

/** Closing the window stops this window's previews, so their links stop working right away. */
export async function deactivate() {
  await controller?.shutdown();
  controller = undefined;
}
