import { useEffect, useState } from 'react';
import './App.css';
import { getMetaData, MetaData } from './api';
import { DesktopView } from './views/DesktopView';
import { MobileDownload } from './views/MobileDownload';
import { MobileUpload } from './views/MobileUpload';

function App() {
    const [loading, setLoading] = useState(true);
    const [mobileState, setMobileState] = useState<MetaData | null>(null);

    useEffect(() => {
        const checkMode = async () => {
            // Check if we are in environment where /api/meta works
            const meta = await getMetaData();
            if (meta) {
                setMobileState(meta);
            }
            setLoading(false);
        };
        checkMode();
    }, []);

    if (loading) return <div className="loading-screen"><div className="spinner"></div></div>;

    if (mobileState) {
        if (mobileState.mode === 'download') {
            return <MobileDownload filename={mobileState.filename!} size={mobileState.size} />;
        } else if (mobileState.mode === 'upload') {
            return <MobileUpload />;
        }
    }

    return <DesktopView />;
}

export default App;
