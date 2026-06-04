$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Python = Join-Path $Root ".venv-build\Scripts\python.exe"
$DistDir = Join-Path $Root "dist\InfiniteCanvasDesktop"

if (!(Test-Path $Python)) {
    throw "Build virtualenv not found: $Python"
}

Push-Location $Root
try {
    & $Python -m PyInstaller `
        --noconfirm `
        --clean `
        --onedir `
        --windowed `
        --name InfiniteCanvasDesktop `
        --collect-submodules webview `
        --collect-submodules clr_loader `
        --collect-submodules pythonnet `
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
        --hidden-import webview.platforms.winforms `
        --hidden-import webview.platforms.edgechromium `
        desktop_launcher.py

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

    foreach ($name in @("API", "data", "assets", "output")) {
        New-Item -ItemType Directory -Force -Path (Join-Path $DistDir $name) | Out-Null
    }
}
finally {
    Pop-Location
}

Write-Host "Desktop EXE built: $(Join-Path $DistDir 'InfiniteCanvasDesktop.exe')"
