import {useState} from 'react';
import QRCode from "react-qr-code";
import {SelectFiles, StartTransfer} from "../../wailsjs/go/main/App";
import {main} from "../../wailsjs/go/models";

export const DesktopView = () => {
    const [filePaths, setFilePaths] = useState<string[]>([]);
    const [serverInfo, setServerInfo] = useState<main.ServerInfo | null>(null);

    const handleSelectFiles = async () => {
        try {
            const files = await SelectFiles();
            if (files && files.length > 0) {
                setFilePaths(files);
                const info = await StartTransfer(files);
                setServerInfo(info);
            }
        } catch (err) {
            console.error(err);
        }
    };

    return (
        <div id="DesktopApp">
            <div style={{padding: '2rem'}}>
                <h1>Transend</h1>
                <p>Fast Local File Transfer</p>

                <div className="card">
                    <button className="btn" onClick={handleSelectFiles}>
                        {filePaths.length > 0 ? 'Change Files' : 'Select Files to Share'}
                    </button>
                    
                    {filePaths.length > 0 && (
                        <div style={{marginTop: '1rem', textAlign: 'left'}}>
                            <p><strong>Selected:</strong> {filePaths.length} files</p>
                            <ul style={{maxHeight:'100px', overflowY:'auto', fontSize: '0.8rem'}}>
                                {filePaths.map((f,i) => <li key={i}>{f}</li>)}
                            </ul>
                        </div>
                    )}

                    {serverInfo && (
                        <div style={{marginTop: '2rem', padding: '1rem', background: 'white', borderRadius: '8px', color: 'black'}}>
                            <div style={{background: 'white', padding: '16px'}}>
                                <QRCode value={serverInfo.url} />
                            </div>
                            <p style={{marginTop: '1rem', fontWeight: 'bold'}}>{serverInfo.url}</p>
                            <p>Scan to download <strong>{serverInfo.filename}</strong></p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
