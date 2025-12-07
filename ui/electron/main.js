const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;
let transferProcess;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    // In production, load the built index.html
    // In development, load from localhost
    const isDev = !app.isPackaged;
    if (isDev) {
        mainWindow.loadURL('http://localhost:5173');
        mainWindow.webContents.openDevTools();
    } else {
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
        if (transferProcess) {
            transferProcess.kill();
        }
    });
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
    if (transferProcess) {
        transferProcess.kill();
    }
});

ipcMain.handle('select-file', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile', 'multiSelections']
    });
    if (result.canceled || result.filePaths.length === 0) {
        return null;
    }
    return result.filePaths; // Return array
});

ipcMain.handle('start-transfer', (event, filePaths) => {
    if (transferProcess) {
        transferProcess.kill();
    }

    const isDev = !app.isPackaged;
    const binaryName = process.platform === 'win32' ? 'transfer.exe' : 'transfer-linux';
    const binaryPath = isDev
        ? path.join(__dirname, '../../', binaryName)
        : path.join(process.resourcesPath, binaryName);

    console.log("Spawning binary at:", binaryPath);
    console.log("Files:", filePaths);

    // Ensure filePaths is array
    const paths = Array.isArray(filePaths) ? filePaths : [filePaths];
    const args = ['-json', ...paths];

    transferProcess = spawn(binaryPath, args);

    transferProcess.stdout.on('data', (data) => {
        const str = data.toString();
        console.log("Go Output:", str);
        // Try to parse JSON lines
        try {
            const lines = str.split('\n');
            for (const line of lines) {
                if (!line.trim()) continue;
                const json = JSON.parse(line);
                mainWindow.webContents.send('transfer-status', json);
            }
        } catch (e) {
            console.error("Parse error:", e);
        }
    });

    transferProcess.stderr.on('data', (data) => {
        console.error(`Go Error: ${data}`);
    });

    transferProcess.on('close', (code) => {
        console.log(`child process exited with code ${code}`);
    });
});
