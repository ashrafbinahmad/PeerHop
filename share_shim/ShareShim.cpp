#include <winrt/Windows.ApplicationModel.h>
#include <winrt/Windows.ApplicationModel.DataTransfer.h>
#pragma comment(linker, "/SUBSYSTEM:windows /ENTRY:wWinMainCRTStartup")
#include <winrt/Windows.ApplicationModel.DataTransfer.ShareTarget.h>
#include <winrt/Windows.ApplicationModel.Activation.h>
#include <winrt/Windows.Storage.h>
#include <winrt/Windows.Foundation.Collections.h>
#include <winrt/Windows.Foundation.h>
#include <iostream>
#include <fstream>
#include <string>
#include <vector>
#include <windows.h>
#include <shlwapi.h>

using namespace winrt;
using namespace Windows::ApplicationModel;
using namespace Windows::ApplicationModel::DataTransfer;
using namespace Windows::ApplicationModel::DataTransfer::ShareTarget;
using namespace Windows::ApplicationModel::Activation;
using namespace Windows::Storage;
using namespace Windows::Foundation;

// Simple JSON-like serializer for the shared data
std::string EscapeJsonString(const std::string& input) {
    std::string output = "";
    for (auto c : input) {
        if (c == '"') output += "\\\"";
        else if (c == '\\') output += "\\\\";
        else if (c == '\b') output += "\\b";
        else if (c == '\f') output += "\\f";
        else if (c == '\n') output += "\\n";
        else if (c == '\r') output += "\\r";
        else if (c == '\t') output += "\\t";
        else output += c;
    }
    return output;
}

std::string WideToUtf8(const std::wstring& wstr) {
    if (wstr.empty()) return "";
    int size_needed = WideCharToMultiByte(CP_UTF8, 0, &wstr[0], (int)wstr.size(), NULL, 0, NULL, NULL);
    std::string strTo(size_needed, 0);
    WideCharToMultiByte(CP_UTF8, 0, &wstr[0], (int)wstr.size(), &strTo[0], size_needed, NULL, NULL);
    return strTo;
}

void LaunchMainApp() {
    // Get path to PeerHop.exe in the same directory
    WCHAR szPath[MAX_PATH];
    GetModuleFileNameW(NULL, szPath, MAX_PATH);
    PathRemoveFileSpecW(szPath);
    PathAppendW(szPath, L"PeerHop.exe");

    ShellExecuteW(NULL, L"open", szPath, NULL, NULL, SW_SHOWNORMAL);
}

int __stdcall wWinMain(HINSTANCE, HINSTANCE, LPWSTR, int) {
    init_apartment();

    try {
        std::string json = "";

        // Check if activated via WinRT Share Target
        auto args = AppInstance::GetActivatedEventArgs();
        if (args && args.Kind() == ActivationKind::ShareTarget) {
            auto shareArgs = args.as<IShareTargetActivatedEventArgs>();
            auto shareOperation = shareArgs.ShareOperation();
            auto data = shareOperation.Data();

            json = "{";
            json += "\"title\":\"" + EscapeJsonString(WideToUtf8(data.Properties().Title().c_str())) + "\",";

            // Extract Text
            if (data.Contains(StandardDataFormats::Text())) {
                auto text = data.GetTextAsync().get();
                json += "\"text\":\"" + EscapeJsonString(WideToUtf8(text.c_str())) + "\",";
            }

            // Extract URI
            if (data.Contains(StandardDataFormats::Uri())) {
                auto uri = data.GetUriAsync().get();
                json += "\"url\":\"" + EscapeJsonString(WideToUtf8(uri.AbsoluteUri().c_str())) + "\",";
            }

            // Extract Files
            json += "\"files\":[";
            if (data.Contains(StandardDataFormats::StorageItems())) {
                auto items = data.GetStorageItemsAsync().get();
                bool first = true;
                for (auto item : items) {
                    if (!first) json += ",";
                    json += "\"" + EscapeJsonString(WideToUtf8(item.Path().c_str())) + "\"";
                    first = false;
                }
            }
            json += "]}";
            
            // Send data and complete WinRT operation
            bool sent = false;
            // 1. Try Named Pipe
            HANDLE hPipe = CreateFileW(L"\\\\.\\pipe\\peerhop-share", GENERIC_WRITE, 0, NULL, OPEN_EXISTING, 0, NULL);
            if (hPipe != INVALID_HANDLE_VALUE) {
                DWORD bytesWritten;
                if (WriteFile(hPipe, json.c_str(), (DWORD)json.length(), &bytesWritten, NULL)) {
                    sent = true;
                }
                CloseHandle(hPipe);
            }

            // 2. Fallback to Temp File
            if (!sent) {
                WCHAR tempPath[MAX_PATH];
                GetTempPathW(MAX_PATH, tempPath);
                PathAppendW(tempPath, L"peerhop_share.json");
                std::ofstream f(tempPath);
                f << json;
                f.close();
            }

            LaunchMainApp();
            shareOperation.ReportCompleted();
            return 0;
        }

        // Fallback: Check command line arguments (for Explorer Context Menu)
        int argc;
        LPWSTR* argv = CommandLineToArgvW(GetCommandLineW(), &argc);
        if (argv && argc > 1) {
            json = "{\"title\":\"Shared from Context Menu\",\"files\":[";
            for (int i = 1; i < argc; i++) {
                if (i > 1) json += ",";
                json += "\"" + EscapeJsonString(WideToUtf8(argv[i])) + "\"";
            }
            json += "]}";
            LocalFree(argv);

            // Send data
            bool sent = false;
            HANDLE hPipe = CreateFileW(L"\\\\.\\pipe\\peerhop-share", GENERIC_WRITE, 0, NULL, OPEN_EXISTING, 0, NULL);
            if (hPipe != INVALID_HANDLE_VALUE) {
                DWORD bytesWritten;
                if (WriteFile(hPipe, json.c_str(), (DWORD)json.length(), &bytesWritten, NULL)) {
                    sent = true;
                }
                CloseHandle(hPipe);
            }

            if (!sent) {
                WCHAR tempPath[MAX_PATH];
                GetTempPathW(MAX_PATH, tempPath);
                PathAppendW(tempPath, L"peerhop_share.json");
                std::ofstream f(tempPath);
                f << json;
                f.close();
            }

            LaunchMainApp();
        }
    }
    catch (...) {
        // Silent fail
    }

    return 0;
}
