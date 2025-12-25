Import-Module Microsoft.PowerShell.Security -ErrorAction SilentlyContinue
Import-Module PKI -ErrorAction SilentlyContinue

$certName = "CN=CBE90A45-8594-4076-AEDB-BD3B88F1C249"
$certPassword = ConvertTo-SecureString -String "PeerHop123" -Force -AsPlainText
$outPath = Join-Path $PSScriptRoot "PeerHop_SelfSigned.pfx"

Write-Host "Generating Self-Signed Certificate with Subject '$certName'..." -ForegroundColor Cyan

# Create Cert
$cert = New-SelfSignedCertificate -CertStoreLocation Cert:\CurrentUser\My -Type CodeSigningCert -Subject $certName

# Export to PFX
Export-PfxCertificate -Cert $cert -FilePath $outPath -Password $certPassword

Write-Host "Certificate exported to: $outPath" -ForegroundColor Green
Write-Host "Password: PeerHop123" -ForegroundColor Green
Write-Host "IMPORTANT: You must install this to 'Trusted Root Certification Authorities' to test the MSIX locally." -ForegroundColor Yellow
