import React, { useState, useRef } from "react";
import axios from "axios";
import { ProgressCard } from "../components/ProgressCard";

export const MobileUpload: React.FC = () => {
  const [files, setFiles] = useState<FileList | null>(null);
  const [started, setStarted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState("0 KB/s");
  const [finished, setFinished] = useState(false);

  const lastLoaded = useRef(0);
  const lastTime = useRef(Date.now());

  const formatSize = (bytes: number) => {
    const units = ["B", "KB", "MB", "GB"];
    let i = 0;
    while (bytes >= 1024 && i < units.length - 1) {
      bytes /= 1024;
      i++;
    }
    return `${bytes.toFixed(2)} ${units[i]}`;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFiles(e.target.files);
    }
  };

  const handleUpload = async () => {
    if (!files || files.length === 0) return;

    setStarted(true);
    lastLoaded.current = 0;
    lastTime.current = Date.now();

    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append("file", files[i]);
    }

    try {
      await axios.post("/api/upload", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
        onUploadProgress: (progressEvent) => {
          if (!progressEvent.total) return;

          const now = Date.now();
          const timeDiff = (now - lastTime.current) / 1000;

          if (timeDiff >= 0.5) {
            const loadedDiff = progressEvent.loaded - lastLoaded.current;
            const speedBytes = loadedDiff / timeDiff;
            setSpeed(`${formatSize(speedBytes)}/s`);

            lastLoaded.current = progressEvent.loaded;
            lastTime.current = now;
          }

          const percent = (progressEvent.loaded / progressEvent.total) * 100;
          setProgress(percent);
        },
      });

      setFinished(true);
    } catch (err) {
      console.error(err);
      setStarted(false);
    }
  };

  if (finished) {
    return (
      <div className="center-container">
        <div className="card">
          <div className="icon success-icon">🚀</div>
          <h2>Sent Successfully!</h2>
          <p>{files?.length} file(s) sent.</p>
          <button className="btn" onClick={() => window.location.reload()}>
            Send More
          </button>
        </div>
      </div>
    );
  }

  if (started) {
    return (
      <div className="center-container">
        <ProgressCard type="Upload" progress={progress} speed={speed} />
      </div>
    );
  }

  return (
    <div className="center-container">
      <div className="card">
        <div className="icon upload-icon">📤</div>
        <h2>Send to Computer</h2>

        <div className="file-input-wrapper">
          <input
            type="file"
            multiple
            onChange={handleFileChange}
            id="file-upload"
            className="file-input-hidden"
          />
          <label htmlFor="file-upload" className="file-drop-zone">
            {files && files.length > 0
              ? `${files.length} file(s) selected`
              : "Tap to select files"}
          </label>
        </div>

        {files && files.length > 0 && (
          <button className="btn btn-primary" onClick={handleUpload}>
            Send Files
          </button>
        )}
      </div>
    </div>
  );
};
