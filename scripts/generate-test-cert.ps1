Import-Module Microsoft.PowerShell.Security -ErrorAction SilentlyContinue
Import-Module PKI -ErrorAction SilentlyContinue

$certName = "PeerHop"
$certPassword = ConvertTo-SecureString -String "PeerHop123" -Force -AsPlainText
$outPath = Join-Path $PSScriptRoot "PeerHop_SelfSigned.pfx"

Write-Host "Generating Self-Signed Certificate for '$certName'..." -ForegroundColor Cyan

# Create Cert
$cert = New-SelfSignedCertificate -CertStoreLocation Cert:\CurrentUser\My -Type CodeSigningCert -Subject "CN=$certName"

# Export to PFX
Export-PfxCertificate -Cert $cert -FilePath $outPath -Password $certPassword

Write-Host "Certificate exported to: $outPath" -ForegroundColor Green
Write-Host "Password: PeerHop123" -ForegroundColor Green
Write-Host "IMPORTANT: You must install this to 'Trusted Root Certification Authorities' to test the MSIX locally." -ForegroundColor Yellow
