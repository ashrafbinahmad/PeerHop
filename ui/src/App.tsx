import { useState, useEffect } from 'react'
import QRCode from "react-qr-code";
import './App.css'

interface ServerInfo {
  url: string;
  filename: string;
  size: number;
}

// Type definition for the exposed Electron API
declare global {
  interface Window {
    electronAPI: {
      selectFile: () => Promise<string[] | null>;
      startTransfer: (paths: string[]) => Promise<void>;
      onStatus: (callback: (info: ServerInfo) => void) => void;
    }
  }
}

function App() {
  const [filePaths, setFilePaths] = useState<string[] | null>(null);
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);

  useEffect(() => {
    // Listen for status updates from Main process
    window.electronAPI.onStatus((info) => {
      console.log("Received info:", info);
      setServerInfo(info);
    });
  }, []);

  const handleSelectFile = async () => {
    const paths = await window.electronAPI.selectFile();
    if (paths && paths.length > 0) {
      setFilePaths(paths);
      // Reset previous info
      setServerInfo(null);
      // Start transfer immediately
      window.electronAPI.startTransfer(paths);
    }
  };

  return (
    <div className="container">
      <h1>Local File Transfer</h1>
      
      <div className="card">
        <button onClick={handleSelectFile}>
          {filePaths ? 'Change Files' : 'Select Files to Share'}
        </button>
        
        {filePaths && (
          <div className="path">
            <p>{filePaths.length} file(s) selected:</p>
            <ul style={{textAlign:'left', fontSize:'0.8em'}}>
                {filePaths.map((p, i) => <li key={i}>{p}</li>)}
            </ul>
          </div>
        )}
      </div>

      {serverInfo && (
        <div className="qr-container">
          <h2>Scan to Download</h2>
          <div style={{ background: 'white', padding: '16px', borderRadius: '8px' }}>
            <QRCode value={serverInfo.url} />
          </div>
          <p className="url-text">{serverInfo.url}</p>
          <p className="file-info">{serverInfo.filename} ({formatBytes(serverInfo.size)})</p>
        </div>
      )}
    </div>
  )
}

function formatBytes(bytes: number, decimals = 2) {
    if (!+bytes) return '0 Bytes'
    const k = 1024
    const dm = decimals < 0 ? 0 : decimals
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`
}

export default App
