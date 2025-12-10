import { useEffect, useState } from 'react';
import './App.css';
import { getMetaData, MetaData } from './api';
import { DesktopView } from './views/DesktopView';
import { MobileUnified } from './views/MobileUnified';

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

    // Mobile view - unified for both upload and download
    if (mobileState) {
        return <MobileUnified
            downloadFilename={mobileState.filename}
            downloadSize={mobileState.size}
        />;
    }

    // Desktop view
    return <DesktopView />;
}

export default App;
