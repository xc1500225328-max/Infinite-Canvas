param(
    [string]$OwnerRepo = "xc1500225328-max/Infinite-Canvas",
    [string]$Version = "",
    [string]$Tag = "",
    [string]$ReleaseName = "",
    [string]$ReleaseNotes = "",
    [string]$SetupUrl = "",
    [switch]$SkipBuild,
    [switch]$SkipUpload
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$VersionFile = Join-Path $Root "VERSION"
$DesktopBuildScript = Join-Path $Root "build_desktop_exe.ps1"
$InstallerBuildScript = Join-Path $Root "build_installer.ps1"
$SetupPath = Join-Path $Root "dist\installer\InfiniteCanvasDesktopSetup.exe"
$ManifestPath = Join-Path $Root "dist\installer\update.json"

function Require-File {
    param([string]$Path, [string]$Description)
    if (!(Test-Path -LiteralPath $Path)) {
        throw "$Description not found: $Path"
    }
}

function Get-GitHubToken {
    if ($env:GITHUB_TOKEN) {
        return $env:GITHUB_TOKEN
    }

    $credentialInput = "protocol=https`nhost=github.com`n`n"
    $credential = $credentialInput | git credential fill
    $tokenLine = ($credential | Select-String '^password=').Line
    if ($tokenLine) {
        return ($tokenLine -replace '^password=', '')
    }

    throw "GitHub token not found. Set GITHUB_TOKEN or sign in through Git credential manager."
}

function Invoke-GitHubJson {
    param(
        [string]$Method = "Get",
        [string]$Uri,
        [hashtable]$Headers,
        $Body = $null
    )

    if ($null -eq $Body) {
        return Invoke-RestMethod -Method $Method -Headers $Headers -Uri $Uri
    }

    $json = $Body | ConvertTo-Json -Depth 10
    return Invoke-RestMethod -Method $Method -Headers $Headers -Uri $Uri -ContentType "application/json" -Body $json
}

function Get-OrCreate-Release {
    param(
        [string]$Repo,
        [string]$ReleaseTag,
        [string]$Name,
        [string]$Notes,
        [hashtable]$Headers
    )

    $releaseUri = "https://api.github.com/repos/$Repo/releases/tags/$ReleaseTag"
    try {
        return Invoke-GitHubJson -Headers $Headers -Uri $releaseUri
    }
    catch {
        $statusCode = $_.Exception.Response.StatusCode.value__
        if ($statusCode -ne 404) {
            throw
        }
    }

    $branch = (git -C $Root branch --show-current).Trim()
    if (!$branch) {
        $branch = "main"
    }

    $body = [ordered]@{
        tag_name = $ReleaseTag
        target_commitish = $branch
        name = $Name
        body = $Notes
        draft = $false
        prerelease = $false
    }

    return Invoke-GitHubJson -Method Post -Headers $Headers -Uri "https://api.github.com/repos/$Repo/releases" -Body $body
}

function Remove-ExistingAsset {
    param(
        $Release,
        [string]$Repo,
        [string]$Name,
        [hashtable]$Headers
    )

    $assets = Invoke-GitHubJson -Headers $Headers -Uri $Release.assets_url
    $matches = @($assets | Where-Object { $_.name -eq $Name })
    foreach ($asset in $matches) {
        Invoke-RestMethod -Method Delete -Headers $Headers -Uri "https://api.github.com/repos/$Repo/releases/assets/$($asset.id)" | Out-Null
    }
}

function Upload-ReleaseAsset {
    param(
        $Release,
        [string]$Path,
        [string]$Name,
        [string]$ContentType,
        [hashtable]$Headers
    )

    $uploadBase = ($Release.upload_url -split '\{')[0]
    $uri = "${uploadBase}?name=$([System.Uri]::EscapeDataString($Name))"
    $bytes = [System.IO.File]::ReadAllBytes((Resolve-Path -LiteralPath $Path))
    return Invoke-RestMethod -Method Post -Headers $Headers -ContentType $ContentType -Body $bytes -Uri $uri
}

Push-Location $Root
try {
    Require-File $VersionFile "Version file"
    Require-File $DesktopBuildScript "Desktop build script"
    Require-File $InstallerBuildScript "Installer build script"

    if (!$Version) {
        $Version = (Get-Content -LiteralPath $VersionFile -TotalCount 1).Trim()
    }
    if (!$Version) {
        throw "VERSION is empty."
    }
    if (!$Tag) {
        $Tag = "v$Version"
    }
    if (!$ReleaseName) {
        $ReleaseName = $Tag
    }
    if (!$SetupUrl) {
        $SetupUrl = "https://github.com/$OwnerRepo/releases/download/$Tag/InfiniteCanvasDesktopSetup.exe"
    }

    Write-Host "Release: $OwnerRepo $Tag"

    if (!$SkipBuild) {
        Write-Host "Building desktop EXE..."
        & $DesktopBuildScript

        Write-Host "Building installer..."
        & $InstallerBuildScript -SkipDesktopBuild -SetupUrl $SetupUrl -ReleaseNotes $ReleaseNotes
    }

    Require-File $SetupPath "Installer"
    Require-File $ManifestPath "Update manifest"

    $setupHash = (Get-FileHash -LiteralPath $SetupPath -Algorithm SHA256).Hash.ToLowerInvariant()
    Write-Host "Installer: $SetupPath"
    Write-Host "Update manifest: $ManifestPath"
    Write-Host "SHA256: $setupHash"

    if ($SkipUpload) {
        Write-Host "SkipUpload was set. Build finished without GitHub upload."
        return
    }

    $token = Get-GitHubToken
    $headers = @{
        Authorization = "Bearer $token"
        "User-Agent" = "InfiniteCanvas-Release-Uploader"
        Accept = "application/vnd.github+json"
        "X-GitHub-Api-Version" = "2022-11-28"
    }

    Write-Host "Ensuring GitHub Release exists..."
    $release = Get-OrCreate-Release -Repo $OwnerRepo -ReleaseTag $Tag -Name $ReleaseName -Notes $ReleaseNotes -Headers $headers

    Write-Host "Replacing release assets..."
    Remove-ExistingAsset -Release $release -Repo $OwnerRepo -Name "InfiniteCanvasDesktopSetup.exe" -Headers $headers
    Remove-ExistingAsset -Release $release -Repo $OwnerRepo -Name "update.json" -Headers $headers

    $uploadedSetup = Upload-ReleaseAsset -Release $release -Path $SetupPath -Name "InfiniteCanvasDesktopSetup.exe" -ContentType "application/octet-stream" -Headers $headers
    $uploadedManifest = Upload-ReleaseAsset -Release $release -Path $ManifestPath -Name "update.json" -ContentType "application/json" -Headers $headers

    Write-Host "Uploaded:"
    Write-Host "  $($uploadedSetup.browser_download_url)"
    Write-Host "  $($uploadedManifest.browser_download_url)"
}
finally {
    Pop-Location
}
