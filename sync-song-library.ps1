[CmdletBinding()]
param(
    [string]$Server = "64.176.60.176",
    [string]$User = "root",
    [switch]$DryRun,
    [switch]$Yes,
    [switch]$ForgetPassword
)

$ErrorActionPreference = "Stop"
$python = Join-Path $PSScriptRoot ".venv\Scripts\python.exe"
$script = Join-Path $PSScriptRoot "sync-song-library.py"
$credentialDirectory = Join-Path ([Environment]::GetFolderPath('ApplicationData')) "nuru-karaoke"
$credentialFile = Join-Path $credentialDirectory "song-sync-password.xml"

if ($ForgetPassword) {
    if (Test-Path -LiteralPath $credentialFile) {
        Remove-Item -LiteralPath $credentialFile -Force
        Write-Host "Saved song-sync password removed."
    } else {
        Write-Host "No saved song-sync password was found."
    }
    exit 0
}

if (-not (Test-Path -LiteralPath $python)) {
    throw "Python virtual environment was not found: $python"
}

$arguments = @($script, "--host", $Server, "--user", $User)
if ($DryRun) { $arguments += "--dry-run" }
if ($Yes) { $arguments += "--yes" }

if (-not $DryRun) {
    if (Test-Path -LiteralPath $credentialFile) {
        try {
            $securePassword = Import-Clixml -LiteralPath $credentialFile
            if ($securePassword -isnot [System.Security.SecureString]) {
                throw "Unexpected credential format."
            }
            Write-Host "Using the password encrypted for this Windows user."
        } catch {
            throw "The saved song-sync password cannot be decrypted. Run .\sync-song-library.ps1 -ForgetPassword and try again."
        }
    } else {
        $securePassword = Read-Host "SSH password for $User@$Server (saved encrypted for this Windows user)" -AsSecureString
        New-Item -ItemType Directory -Path $credentialDirectory -Force | Out-Null
        $securePassword | Export-Clixml -LiteralPath $credentialFile
        Write-Host "Encrypted password saved to: $credentialFile"
    }

    $passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
    try {
        $env:NURU_KARAOKE_SSH_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
        & $python @arguments
        $syncExitCode = $LASTEXITCODE
    } finally {
        Remove-Item Env:NURU_KARAOKE_SSH_PASSWORD -ErrorAction SilentlyContinue
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
    }
} else {
    & $python @arguments
    $syncExitCode = $LASTEXITCODE
}

if ($syncExitCode -ne 0) {
    throw "Song-library synchronization failed (exit code $syncExitCode)."
}
