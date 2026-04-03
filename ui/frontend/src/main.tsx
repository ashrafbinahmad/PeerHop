import axios from "axios";

// MUST be set FIRST to set axios headers before any other code uses axios
axios.defaults.headers.common["X-Client-Type"] = "desktop";

import React from "react";
import { createRoot } from "react-dom/client";
import "./style.css";
import App from "./App";

const container = document.getElementById("root");

const root = createRoot(container!);

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
