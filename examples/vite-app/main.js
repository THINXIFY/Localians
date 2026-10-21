import { message } from "./message.js";

document.querySelector("#message").textContent = message;

// Accept updates to message.js without a full reload (Vite HMR over WebSocket).
if (import.meta.hot) {
  import.meta.hot.accept("./message.js", (mod) => {
    document.querySelector("#message").textContent = mod.message;
  });
}
