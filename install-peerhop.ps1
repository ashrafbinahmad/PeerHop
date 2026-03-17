try {
    $ErrorActionPreference = "Stop"

    # Ensure admin
    $isAdmin = ([Security.Principal.WindowsPrincipal] `
        [Security.Principal.WindowsIdentity]::GetCurrent()
    ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

    if (-not $isAdmin) {
        Write-Host "Requesting administrator privileges..."
        Start-Process powershell -ArgumentList "-NoExit -ExecutionPolicy Bypass -File `"$PSCommandPath`"" -Verb RunAs
        exit
    }

    Write-Host "Installing PeerHop..."

    $scriptDir = $PSScriptRoot
    $msixPath = Join-Path $scriptDir "builds\peerhop_store.msix"
    $certPath = Join-Path $scriptDir "builds\peerhop.cer"

    if (!(Test-Path $msixPath)) {
        throw "MSIX file not found"
    }

    # Extract cert
    Write-Host "Extracting certificate..."
    $cert = (Get-AuthenticodeSignature $msixPath).SignerCertificate

    if (-not $cert) {
        throw "Certificate extraction failed"
    }

    Export-Certificate -Cert $cert -FilePath $certPath -Force | Out-Null

    # Install cert
    Write-Host "Installing certificate..."
    Import-Certificate -FilePath $certPath -CertStoreLocation Cert:\LocalMachine\Root | Out-Null
    Import-Certificate -FilePath $certPath -CertStoreLocation Cert:\LocalMachine\TrustedPublisher | Out-Null

    # Remove old
    Write-Host "Removing existing installation..."
    $packageName = "Transender.PeerHop"
    $existing = Get-AppxPackage -Name $packageName -AllUsers

    if ($existing) {
        foreach ($pkg in $existing) {
            Remove-AppxPackage -Package $pkg.PackageFullName -AllUsers -ErrorAction SilentlyContinue
        }
    }

    # Install
    Write-Host "Installing MSIX..."
    Add-AppxPackage -Path $msixPath

    # 🚀 Launch app
    Write-Host "Launching PeerHop..."

    $app = Get-AppxPackage -Name $packageName

    if ($app) {
        $appId = ($app.PackageFamilyName + "!App")
        Start-Process "explorer.exe" "shell:AppsFolder\$appId"
    } else {
        Write-Host "App installed but not found for launch."
    }

    Write-Host ""
    Write-Host "SUCCESS!"
}
catch {
    Write-Host ""
    Write-Host "ERROR:"
    Write-Host $_
}
finally {
    Write-Host ""
    Read-Host 'Press ENTER to exit'
}