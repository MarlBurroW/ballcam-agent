<#
.SYNOPSIS
    Release script for BallCam Agent
.DESCRIPTION
    Updates version in all config files, commits, tags, and pushes to trigger CI/CD
.PARAMETER Version
    The version to release (e.g., "1.0.0", "1.2.3")
.EXAMPLE
    .\scripts\release.ps1 -Version 1.0.0
    .\scripts\release.ps1 1.2.0
#>

param(
    [Parameter(Mandatory=$true, Position=0)]
    [ValidatePattern('^\d+\.\d+\.\d+$')]
    [string]$Version
)

$ErrorActionPreference = "Stop"

# Colors for output
function Write-Step { param($msg) Write-Host "`n>> $msg" -ForegroundColor Cyan }
function Write-Success { param($msg) Write-Host "   $msg" -ForegroundColor Green }
function Write-Info { param($msg) Write-Host "   $msg" -ForegroundColor Gray }

$rootDir = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if (-not (Test-Path "$rootDir\package.json")) {
    $rootDir = Split-Path -Parent $PSScriptRoot
}

Write-Host "`n========================================" -ForegroundColor Magenta
Write-Host "  BallCam Agent Release v$Version" -ForegroundColor Magenta
Write-Host "========================================" -ForegroundColor Magenta

# Check we're on main branch
Write-Step "Checking git status..."
$branch = git rev-parse --abbrev-ref HEAD
if ($branch -ne "main") {
    Write-Warning "Not on main branch (currently on '$branch'). Continue? (y/N)"
    $response = Read-Host
    if ($response -ne "y") {
        Write-Host "Aborted." -ForegroundColor Red
        exit 1
    }
}

# Check for uncommitted changes
$status = git status --porcelain
if ($status) {
    Write-Host "Uncommitted changes detected:" -ForegroundColor Yellow
    Write-Host $status
    Write-Warning "Continue anyway? (y/N)"
    $response = Read-Host
    if ($response -ne "y") {
        Write-Host "Aborted." -ForegroundColor Red
        exit 1
    }
}
Write-Success "Git status OK"

# Check if tag already exists
$existingTag = git tag -l "v$Version"
if ($existingTag) {
    Write-Warning "Tag v$Version already exists. Delete and recreate? (y/N)"
    $response = Read-Host
    if ($response -ne "y") {
        Write-Host "Aborted." -ForegroundColor Red
        exit 1
    }
    Write-Info "Will delete existing tag..."
    git tag -d "v$Version" 2>$null
    git push origin ":refs/tags/v$Version" 2>$null
    Write-Success "Existing tag deleted"
}

# Update package.json
Write-Step "Updating package.json..."
$packageJson = Get-Content "$rootDir\package.json" -Raw | ConvertFrom-Json
$oldVersion = $packageJson.version
$packageJson.version = $Version
$packageJson | ConvertTo-Json -Depth 100 | Set-Content "$rootDir\package.json" -NoNewline
Write-Success "package.json: $oldVersion -> $Version"

# Update Cargo.toml
Write-Step "Updating Cargo.toml..."
$cargoPath = "$rootDir\src-tauri\Cargo.toml"
$cargoContent = Get-Content $cargoPath -Raw
$cargoContent = $cargoContent -replace '(?m)^version = "[^"]*"', "version = `"$Version`""
Set-Content $cargoPath $cargoContent -NoNewline
Write-Success "Cargo.toml updated"

# Update tauri.conf.json
Write-Step "Updating tauri.conf.json..."
$tauriPath = "$rootDir\src-tauri\tauri.conf.json"
$tauriJson = Get-Content $tauriPath -Raw | ConvertFrom-Json
$tauriJson.version = $Version
$tauriJson | ConvertTo-Json -Depth 100 | Set-Content $tauriPath -NoNewline
Write-Success "tauri.conf.json updated"

# Update Cargo.lock
Write-Step "Updating Cargo.lock..."
Push-Location "$rootDir\src-tauri"
$ErrorActionPreference = "Continue"
cargo update -p ballcam-agent 2>&1 | Out-Null
$ErrorActionPreference = "Stop"
Pop-Location
Write-Success "Cargo.lock updated"

# Git operations
Write-Step "Committing changes..."
git add -A
git commit -m "chore: bump version to $Version"
Write-Success "Changes committed"

Write-Step "Pushing to origin..."
git push origin $branch
Write-Success "Pushed to origin/$branch"

Write-Step "Creating tag v$Version..."
git tag -a "v$Version" -m "Release v$Version"
Write-Success "Tag created"

Write-Step "Pushing tag..."
git push origin "v$Version"
Write-Success "Tag pushed"

Write-Host "`n========================================" -ForegroundColor Green
Write-Host "  Release v$Version initiated!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host "`nCI/CD will now build and publish the release."
Write-Host "Monitor progress at: https://github.com/MarlBurroW/ballcam-agent/actions"
Write-Host ""
