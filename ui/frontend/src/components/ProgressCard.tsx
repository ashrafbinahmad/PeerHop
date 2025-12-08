import React from 'react';

interface ProgressCardProps {
    type: 'Download' | 'Upload';
    progress: number; // 0-100
    speed: string; // e.g. "2.5 MB/s"
    fileName?: string;
}

export const ProgressCard: React.FC<ProgressCardProps> = ({ type, progress, speed, fileName }) => {
    return (
        <div className="progress-card">
            <div className="progress-header">
                <span className="progress-title">{type}ing...</span>
                <span className="progress-percent">{Math.round(progress)}%</span>
            </div>
            {fileName && <div className="progress-filename">{fileName}</div>}
            
            <div className="progress-track">
                <div 
                    className="progress-fill" 
                    style={{ width: `${progress}%` }}
                />
            </div>
            
            <div className="progress-footer">
                <span className="progress-speed">{speed}</span>
            </div>
        </div>
    );
};
