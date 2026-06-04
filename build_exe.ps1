$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Python = Join-Path $Root ".venv-build\Scripts\python.exe"
$DistDir = Join-Path $Root "dist\InfiniteCanvas"
$LegacyCustomWorkflowFolder = -join ([char[]](0x81ea, 0x5b9a, 0x4e49))
$DataDir = if ($env:INFINITE_CANVAS_DATA_DIR) {
    [System.IO.Path]::GetFullPath($env:INFINITE_CANVAS_DATA_DIR)
}
elseif ($env:APPDATA) {
    Join-Path $env:APPDATA "InfiniteCanvas"
}
else {
    Join-Path $env:USERPROFILE "AppData\Roaming\InfiniteCanvas"
}

if (!(Test-Path $Python)) {
    throw "Build virtualenv not found: $Python"
}

function Copy-MissingFile {
    param([string]$Source, [string]$Destination)
    if (!(Test-Path -LiteralPath $Source) -or (Test-Path -LiteralPath $Destination)) {
        return
    }
    $parent = Split-Path -Parent $Destination
    if ($parent) {
        New-Item -ItemType Directory -Force -Path $parent | Out-Null
    }
    Copy-Item -LiteralPath $Source -Destination $Destination -Force
}

function Copy-MissingTree {
    param([string]$Source, [string]$Destination)
    if (!(Test-Path -LiteralPath $Source)) {
        return
    }
    Get-ChildItem -LiteralPath $Source -Recurse -File | ForEach-Object {
        $relative = $_.FullName.Substring([System.IO.Path]::GetFullPath($Source).Length).TrimStart('\', '/')
        $target = Join-Path $Destination $relative
        if (!(Test-Path -LiteralPath $target)) {
            New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
            Copy-Item -LiteralPath $_.FullName -Destination $target -Force
        }
    }
}

function Migrate-LegacyRuntimeData {
    if (!(Test-Path -LiteralPath $DistDir)) {
        return
    }
    Copy-MissingFile (Join-Path $DistDir "history.json") (Join-Path $DataDir "history.json")
    Copy-MissingFile (Join-Path $DistDir "global_config.json") (Join-Path $DataDir "global_config.json")
    foreach ($name in @("API", "data", "assets", "output", "logs")) {
        Copy-MissingTree (Join-Path $DistDir $name) (Join-Path $DataDir $name)
    }
    foreach ($name in @("custom", $LegacyCustomWorkflowFolder)) {
        Copy-MissingTree (Join-Path $DistDir "workflows\$name") (Join-Path $DataDir "workflows\$name")
    }
}

function Assert-UnderDist {
    param([string]$Path)
    $distFull = [System.IO.Path]::GetFullPath($DistDir)
    $targetFull = [System.IO.Path]::GetFullPath($Path)
    $prefix = $distFull.TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar
    if (!$targetFull.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to remove path outside dist: $targetFull"
    }
}

function Remove-StaleRuntimeData {
    foreach ($name in @("API", "data", "assets", "output", "logs")) {
        $target = Join-Path $DistDir $name
        if (Test-Path -LiteralPath $target) {
            Assert-UnderDist $target
            Remove-Item -LiteralPath $target -Recurse -Force
        }
    }
    foreach ($name in @("history.json", "global_config.json")) {
        $target = Join-Path $DistDir $name
        if (Test-Path -LiteralPath $target) {
            Assert-UnderDist $target
            Remove-Item -LiteralPath $target -Force
        }
    }
}

Push-Location $Root
try {
    Migrate-LegacyRuntimeData

    & $Python -m PyInstaller `
        --noconfirm `
        --clean `
        --onedir `
        --name InfiniteCanvas `
        --hidden-import uvicorn.logging `
        --hidden-import uvicorn.loops `
        --hidden-import uvicorn.loops.auto `
        --hidden-import uvicorn.protocols `
        --hidden-import uvicorn.protocols.http `
        --hidden-import uvicorn.protocols.http.auto `
        --hidden-import uvicorn.protocols.websockets `
        --hidden-import uvicorn.protocols.websockets.auto `
        --hidden-import uvicorn.lifespan `
        --hidden-import uvicorn.lifespan.on `
        app_launcher.py

    foreach ($name in @("static", "workflows", "tools")) {
        $src = Join-Path $Root $name
        $dst = Join-Path $DistDir $name
        if (Test-Path $src) {
            Copy-Item -LiteralPath $src -Destination $dst -Recurse -Force
        }
    }

    foreach ($name in @("VERSION", "LICENSE", "README.md")) {
        $src = Join-Path $Root $name
        if (Test-Path $src) {
            Copy-Item -LiteralPath $src -Destination (Join-Path $DistDir $name) -Force
        }
    }

    Get-ChildItem -LiteralPath $Root -File |
        Where-Object { $_.Extension -in @(".txt", ".md", ".png") } |
        ForEach-Object {
            Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $DistDir $_.Name) -Force
        }

    Remove-StaleRuntimeData
}
finally {
    Pop-Location
}

Write-Host "EXE built: $(Join-Path $DistDir 'InfiniteCanvas.exe')"
Write-Host "Runtime data directory: $DataDir"
