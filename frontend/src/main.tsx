import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { registerSW } from "virtual:pwa-register";
import "@fontsource-variable/inter";
import "@fontsource-variable/space-grotesk";
import App from "./App";
import "./styles.css";

registerSW({ immediate: true });

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 5000, retry: 1, refetchOnWindowFocus: true } },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
