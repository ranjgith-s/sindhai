import React from "react";
import { Home } from "./presentation/pages/Home";
import { ToastProvider } from "./presentation/components/ui/Toast";

export function App() {
  return (
    <ToastProvider>
      <Home />
    </ToastProvider>
  );
}
