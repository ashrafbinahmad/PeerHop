import React, { useState, useRef } from 'react';
import axios from 'axios';
import { ProgressCard } from '../components/ProgressCard';

interface Props {
    filename: string;
    size?: number;
}

export const MobileDownload: React.FC<Props> = ({ filename, size }) => {
    const [started, setStarted] = useState(false);
    const [progress, setProgress] = useState(0);
    const [speed, setSpeed] = useState("0 KB/s");
    const [finished, setFinished] = useState(false);

    const lastLoaded = useRef(0);
    const lastTime = useRef(Date.now());

    const formatSize = (bytes?: number) => {
        if (!bytes) return 'Unknown size';
        const units = ['B', 'KB', 'MB', 'GB'];
        let i = 0;
        while (bytes >= 1024 && i < units.length - 1) {
            bytes /= 1024;
            i++;
        }
        return `${bytes.toFixed(1)} ${units[i]}`;
    };

    const handleDownload = async () => {
        setStarted(true);
        lastLoaded.current = 0;
        lastTime.current = Date.now();

        try {
            const response = await axios.get(`/api/download`, {
                responseType: 'blob',
                onDownloadProgress: (progressEvent) => {
                    if (!progressEvent.total) return;
                    
                    const now = Date.now();
                    const timeDiff = (now - lastTime.current) / 1000; // seconds

                    if (timeDiff >= 0.5) { // Update speed every 500ms
                         const loadedDiff = progressEvent.loaded - lastLoaded.current;
                         const speedBytes = loadedDiff / timeDiff; // B/s
                         setSpeed(`${formatSize(speedBytes)}/s`);
                         
                         lastLoaded.current = progressEvent.loaded;
                         lastTime.current = now;
                    }

                    const percent = (progressEvent.loaded / progressEvent.total) * 100;
                    setProgress(percent);
                }
            });

            // Trigger save
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', filename);
            document.body.appendChild(link);
            link.click();
            link.remove();
            setFinished(true);

        } catch (err) {
            console.error(err);
            alert("Download failed. Please try again.");
            setStarted(false);
        }
    };

    if (finished) {
        return (
            <div className="center-container">
                <div className="card">
                    <div className="icon success-icon">✅</div>
                    <h2>Download Complete</h2>
                    <p>{filename}</p>
                    <button className="btn" onClick={() => window.location.reload()}>Download Again</button>
                </div>
            </div>
        );
    }

    if (started) {
        return (
            <div className="center-container">
                <ProgressCard 
                    type="Download" 
                    progress={progress} 
                    speed={speed} 
                    fileName={filename} 
                />
            </div>
        );
    }

    return (
        <div className="center-container">
            <div className="card">
                <div className="icon file-icon">📄</div>
                <h2 className="file-name">{filename}</h2>
                <p className="file-size">{formatSize(size)}</p>
                <button className="btn btn-primary" onClick={handleDownload}>
                    Download File
                </button>
            </div>
        </div>
    );
};
