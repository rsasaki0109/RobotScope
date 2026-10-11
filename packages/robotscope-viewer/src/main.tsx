import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Buffer } from "buffer";

import { App } from "./App";
import "./styles/global.css";

// The upstream MCAP WebAssembly codecs copy bytes through the Buffer API.
globalThis.Buffer ??= Buffer as unknown as typeof globalThis.Buffer;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
