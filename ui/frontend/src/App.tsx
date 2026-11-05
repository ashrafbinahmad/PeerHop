import { useEffect, useState } from "react";
import "./App.css";
import { getMetaData, MetaData } from "./api";
import { MobileUnified } from "./views/MobileUnified";

import { MobileUpload } from "./views/MobileUpload";
import { MobileDownload } from "./views/MobileDownload";

function App() {
  const [loading, setLoading] = useState(true);
  const [mobileState, setMobileState] = useState<MetaData | null>(null);

  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // If click is not inside a selectable element, clear selection
      if (!target.closest(".text-selectable")) {
        const selection = window.getSelection();
        if (selection && selection.toString().length > 0) {
          selection.removeAllRanges();
        }
      }
    };
    window.addEventListener("mousedown", handleGlobalClick);
    return () => window.removeEventListener("mousedown", handleGlobalClick);
  }, []);

  useEffect(() => {
    const checkMode = async () => {
      // Check if we are in environment where /api/meta works (mobile/web)
      const meta = await getMetaData();
      if (meta) {
        setMobileState(meta);
      }
      setLoading(false);
    };
    checkMode();
  }, []);

  if (loading)
    return (
      <div className="loading-screen">
        <div className="spinner"></div>
      </div>
    );

  // CLI sessions get the single-purpose views; the desktop app gets the unified view.
  if (mobileState?.app === "cli") {
    if (mobileState.mode === "upload") return <MobileUpload />;
    return (
      <MobileDownload
        filename={mobileState.filename || "file"}
        size={mobileState.size || 0}
      />
    );
  }
  return (
    <MobileUnified
      downloadFilename={mobileState?.filename}
      downloadSize={mobileState?.size}
    />
  );
}

export default App;
