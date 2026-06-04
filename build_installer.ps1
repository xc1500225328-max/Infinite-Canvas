param(
    [switch]$SkipDesktopBuild,
    [string]$IsccPath = $env:INNO_SETUP_ISCC,
    [string]$SetupUrl = $env:INFINITE_CANVAS_SETUP_URL,
    [string]$ReleaseNotes = ""
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$DesktopBuildScript = Join-Path $Root "build_desktop_exe.ps1"
$DistDir = Join-Path $Root "dist\InfiniteCanvasDesktop"
$InstallerScript = Join-Path $Root "installer\InfiniteCanvasDesktop.iss"
$InstallerOutDir = Join-Path $Root "dist\installer"
$VersionFile = Join-Path $Root "VERSION"

function Resolve-InnoCompiler {
    param([string]$PreferredPath)

    $candidates = @()
    if ($PreferredPath) {
        $candidates += $PreferredPath
    }
    $candidates += @(
        "C:\Program Files (x86)\Inno Setup 6\ISCC.exe",
        "C:\Program Files\Inno Setup 6\ISCC.exe"
    )

    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path -LiteralPath $candidate)) {
            return [System.IO.Path]::GetFullPath($candidate)
        }
    }

    throw @"
Inno Setup compiler was not found.

Install Inno Setup 6, then run this script again:
  https://jrsoftware.org/isdl.php

Or pass the compiler path explicitly:
  powershell -ExecutionPolicy Bypass -File .\build_installer.ps1 -IsccPath "C:\Path\To\ISCC.exe"

The desktop EXE can still be used directly from:
  $DistDir
"@
}

if (!(Test-Path -LiteralPath $InstallerScript)) {
    throw "Installer script not found: $InstallerScript"
}

Push-Location $Root
try {
    if (!$SkipDesktopBuild) {
        & $DesktopBuildScript
    }

    if (!(Test-Path -LiteralPath (Join-Path $DistDir "InfiniteCanvasDesktop.exe"))) {
        throw "Desktop EXE was not found. Run build_desktop_exe.ps1 first or omit -SkipDesktopBuild."
    }

    $version = "0.0.0"
    if (Test-Path -LiteralPath $VersionFile) {
        $version = (Get-Content -LiteralPath $VersionFile -TotalCount 1).Trim()
        if (!$version) {
            $version = "0.0.0"
        }
    }

    New-Item -ItemType Directory -Force -Path $InstallerOutDir | Out-Null
    $iscc = Resolve-InnoCompiler -PreferredPath $IsccPath

    & $iscc `
        "/DSourceDir=$DistDir" `
        "/DOutputDir=$InstallerOutDir" `
        "/DAppVersion=$version" `
        $InstallerScript

    $setupPath = Join-Path $InstallerOutDir "InfiniteCanvasDesktopSetup.exe"
    if (!(Test-Path -LiteralPath $setupPath)) {
        throw "Installer output was not found: $setupPath"
    }

    if (!$SetupUrl) {
        $SetupUrl = "https://github.com/xc1500225328-max/Infinite-Canvas/releases/download/v$version/InfiniteCanvasDesktopSetup.exe"
    }

    $hash = (Get-FileHash -LiteralPath $setupPath -Algorithm SHA256).Hash.ToLowerInvariant()
    $manifest = [ordered]@{
        version = $version
        setup_url = $SetupUrl
        sha256 = $hash
        notes = $ReleaseNotes
    }
    $manifestPath = Join-Path $InstallerOutDir "update.json"
    $manifestJson = $manifest | ConvertTo-Json -Depth 5
    [System.IO.File]::WriteAllText(
        $manifestPath,
        $manifestJson + [Environment]::NewLine,
        [System.Text.UTF8Encoding]::new($false)
    )

    Write-Host "Installer built: $setupPath"
    Write-Host "Update manifest built: $manifestPath"
    Write-Host "Publish both files to your GitHub Release. The app reads:"
    Write-Host "  https://github.com/xc1500225328-max/Infinite-Canvas/releases/latest/download/update.json"
}
finally {
    Pop-Location
}
