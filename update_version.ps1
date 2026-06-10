<#
.SYNOPSIS
Updates the project version in the VERSION file and static assets.

.DESCRIPTION
This script reads the current version from the VERSION file, generates a new version 
(or uses the provided one), and replaces all occurrences of the old version in HTML, 
CSS, and JS files under the static directory.

.PARAMETER NewVersion
(Optional) The new version string to use. If not provided, it will auto-generate based on today's date (yyyy.MM.dd.rev).
#>
param (
    [string]$NewVersion
)

$ErrorActionPreference = "Stop"

# Set working directory to the script's directory
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location -Path $scriptDir

$VersionFile = "VERSION"
if (-not (Test-Path $VersionFile)) {
    Write-Error "VERSION file not found in $scriptDir."
    exit 1
}

$old_v = (Get-Content $VersionFile -Raw).Trim()

if ([string]::IsNullOrWhiteSpace($NewVersion)) {
    $today = Get-Date -Format "yyyy.MM.dd"
    $parts = $old_v -split "\."
    if ($parts.Count -ge 4 -and "$($parts[0]).$($parts[1]).$($parts[2])" -eq $today) {
        $rev = [int]$parts[3] + 1
        $NewVersion = "$today.$rev"
    } else {
        $NewVersion = "$today.1"
    }
}

Write-Host "Updating version from '$old_v' to '$NewVersion'..." -ForegroundColor Cyan

# Update VERSION file
Set-Content -Path $VersionFile -Value $NewVersion -Encoding UTF8
Write-Host "Updated VERSION"

# Update static files
$files = Get-ChildItem -Path static -Recurse -Include *.html,*.css,*.js | Select-Object -ExpandProperty FullName
$updatedCount = 0

foreach ($f in $files) {
    if (Test-Path $f -PathType Leaf) {
        $content = Get-Content $f -Raw -Encoding UTF8
        if ($content -match [regex]::Escape($old_v)) {
            $content = $content -replace [regex]::Escape($old_v), $NewVersion
            Set-Content $f -Value $content -Encoding UTF8
            $relativePath = Resolve-Path -Relative $f
            Write-Host "Updated $relativePath"
            $updatedCount++
        }
    }
}

Write-Host "Done. Updated $updatedCount static files." -ForegroundColor Green
