# Creates the self-signed code-signing certificate build-msix.js signs with.
# It stays in your certificate store (CurrentUser\My); nothing is written to
# the repo. The subject must match the Publisher in the MSIX manifest.
#
# To install a locally built MSIX, trust the certificate once:
#   certmgr.msc -> Trusted People -> import the .cer this script prints.
# Store uploads don't need any of this: Microsoft re-signs them.

Import-Module Microsoft.PowerShell.Security -ErrorAction SilentlyContinue
Import-Module PKI -ErrorAction SilentlyContinue

$certName = "CN=CBE90A45-8594-4076-AEDB-BD3B88F1C249"

Write-Host "Creating self-signed code-signing certificate '$certName'..." -ForegroundColor Cyan
$cert = New-SelfSignedCertificate -CertStoreLocation Cert:\CurrentUser\My -Type CodeSigningCert -Subject $certName -NotAfter (Get-Date).AddYears(3)

# Public part only (no private key), for trusting it on test machines.
$cerPath = Join-Path ([IO.Path]::GetTempPath()) "PeerHop_SelfSigned.cer"
Export-Certificate -Cert $cert -FilePath $cerPath | Out-Null

Write-Host "Created certificate $($cert.Thumbprint) in CurrentUser\My." -ForegroundColor Green
Write-Host "To install local MSIX builds, import $cerPath into 'Trusted People'." -ForegroundColor Yellow
