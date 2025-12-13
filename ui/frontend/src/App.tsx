import { useEffect, useState } from 'react';
import './App.css';
import { getMetaData, MetaData } from './api';
import { DesktopView } from './views/DesktopView';
import { MobileUnified } from './views/MobileUnified';

import { MobileUpload } from './views/MobileUpload';
import { MobileDownload } from './views/MobileDownload';

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

    // Mobile/Web view
    if (mobileState) {
        // UI App (Unified View)
        if (mobileState.app === 'ui') {
            return <MobileUnified
                downloadFilename={mobileState.filename}
                downloadSize={mobileState.size}
            />;
        }

        // CLI App (Split Views)
        if (mobileState.mode === 'upload') {
            return <MobileUpload />;
        } else {
            return <MobileDownload
                filename={mobileState.filename || 'file'}
                size={mobileState.size || 0}
            />;
        }
    }

    // Desktop view
    return <DesktopView />;
}

export default App;
