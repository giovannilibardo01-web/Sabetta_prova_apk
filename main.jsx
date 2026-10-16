import React from "react";
import { createRoot } from "react-dom/client";
import SabettaApp from "./sabetta-app.jsx";

/* Il prototipo salva i dati con window.storage, che esiste solo dentro Claude.
   Sul telefono lo sostituiamo con la memoria del browser integrato nell'app. */
if (typeof window !== "undefined" && !window.storage) {
  const P = "sab:";
  window.storage = {
    async get(k) {
      const v = localStorage.getItem(P + k);
      if (v === null) throw new Error("nessun dato");
      return { key: k, value: v, shared: false };
    },
    async set(k, v) {
      localStorage.setItem(P + k, v);
      return { key: k, value: v, shared: false };
    },
    async delete(k) {
      localStorage.removeItem(P + k);
      return { key: k, deleted: true, shared: false };
    },
    async list(prefix = "") {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const n = localStorage.key(i);
        if (n && n.startsWith(P + prefix)) keys.push(n.slice(P.length));
      }
      return { keys, prefix, shared: false };
    },
  };
}

createRoot(document.getElementById("root")).render(<SabettaApp />);
