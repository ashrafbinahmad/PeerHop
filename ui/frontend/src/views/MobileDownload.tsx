import React from 'react';

interface Props {
    filename: string;
    size?: number;
}

export const MobileDownload: React.FC<Props> = ({ filename, size }) => {
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

    const handleDownload = () => {
        window.location.href = '/api/download';
    };

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
