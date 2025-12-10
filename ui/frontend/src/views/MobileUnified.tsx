import React, { useState, useRef } from 'react';
import axios from 'axios';
import { ProgressCard } from '../components/ProgressCard';

interface Props {
    downloadFilename?: string;
    downloadSize?: number;
}

export const MobileUnified: React.FC<Props> = ({ downloadFilename, downloadSize }) => {
    const [mode, setMode] = useState<'send' | 'receive' | null>(null);
    const [files, setFiles] = useState<FileList | null>(null);
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
        let value = bytes;
        while (value >= 1024 && i < units.length - 1) {
            value /= 1024;
            i++;
        }
        return `${value.toFixed(1)} ${units[i]}`;
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
            formData.append('file', files[i]);
        }

        try {
            await axios.post('/api/upload', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data'
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
                }
            });

            setFinished(true);
        } catch (err) {
            console.error(err);
            alert("Upload failed.");
            setStarted(false);
        }
    };

    const handleDownload = () => {
        window.location.href = '/api/download';
    };

    // Success screen
    if (finished) {
        return (
            <div className="center-container">
                <div className="card">
                    <div className="icon success-icon">🚀</div>
                    <h2>Sent Successfully!</h2>
                    <p>{files?.length} file(s) sent to computer.</p>
                    <button className="btn" onClick={() => window.location.reload()}>Done</button>
                </div>
            </div>
        );
    }

    // Progress screen
    if (started) {
        return (
            <div className="center-container">
                <ProgressCard
                    type="Upload"
                    progress={progress}
                    speed={speed}
                />
            </div>
        );
    }

    // Mode selection or action screen
    if (!mode) {
        return (
            <div className="center-container">
                <div className="card">
                    <div className="icon">💫</div>
                    <h2>Transend</h2>
                    <p style={{ marginBottom: '2rem', color: '#666' }}>Choose an action</p>

                    {downloadFilename && (
                        <button
                            className="btn btn-primary"
                            onClick={() => setMode('receive')}
                            style={{ marginBottom: '1rem', width: '100%' }}
                        >
                            📥 Receive from Computer
                        </button>
                    )}

                    <button
                        className="btn btn-secondary"
                        onClick={() => setMode('send')}
                        style={{ width: '100%' }}
                    >
                        📤 Send to Computer
                    </button>
                </div>
            </div>
        );
    }

    // Receive mode
    if (mode === 'receive' && downloadFilename) {
        return (
            <div className="center-container">
                <div className="card">
                    <button
                        onClick={() => setMode(null)}
                        className="back-button"
                        style={{
                            position: 'absolute',
                            top: '1rem',
                            left: '1rem',
                            background: 'none',
                            border: 'none',
                            fontSize: '1.5rem',
                            cursor: 'pointer'
                        }}
                    >
                        ←
                    </button>
                    <div className="icon file-icon">📄</div>
                    <h2 className="file-name">{downloadFilename}</h2>
                    <p className="file-size">{formatSize(downloadSize)}</p>
                    <button className="btn btn-primary" onClick={handleDownload}>
                        Download File
                    </button>
                </div>
            </div>
        );
    }

    // Send mode
    if (mode === 'send') {
        return (
            <div className="center-container">
                <div className="card">
                    <button
                        onClick={() => setMode(null)}
                        className="back-button"
                        style={{
                            position: 'absolute',
                            top: '1rem',
                            left: '1rem',
                            background: 'none',
                            border: 'none',
                            fontSize: '1.5rem',
                            cursor: 'pointer'
                        }}
                    >
                        ←
                    </button>
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
                                : "Tap to select files"
                            }
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
    }

    return null;
};
