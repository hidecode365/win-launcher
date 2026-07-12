<#
.SYNOPSIS
  Tauri Updater 用の latest.json を生成する。

.DESCRIPTION
  `npm run tauri build`（tauri.conf.json の bundle.createUpdaterArtifacts=true、
  TAURI_SIGNING_PRIVATE_KEY / TAURI_SIGNING_PRIVATE_KEY_PASSWORD を設定した状態で実行）
  が生成した .sig ファイルとバージョン・リリースノートから latest.json を組み立てる。
  現行の tauri-cli は Windows 向け updater アーティファクトとして zip ラッピングを行わず、
  インストーラー本体（NSIS の .exe / MSI の .msi）に直接 .sig を付与するため、
  src-tauri/target/release/bundle/nsis の *.exe.sig を優先し、無ければ msi の *.msi.sig にフォールバックする。

.PARAMETER NotesPath
  リリースノート本文のファイルパス（リポジトリルートからの相対パス）。

.PARAMETER RepoSlug
  GitHub の "owner/repo"。ダウンロード URL の組み立てに使う。

.PARAMETER OutFile
  出力先パス。省略時は bundle ディレクトリ直下の latest.json。
#>

param(
    [string]$NotesPath = "last-release-notes.md",
    [string]$RepoSlug = "hidecode365/win-launcher",
    [string]$OutFile
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$confPath = Join-Path $repoRoot "src-tauri/tauri.conf.json"
$conf = Get-Content $confPath -Raw | ConvertFrom-Json
$version = $conf.version

$bundleRoot = Join-Path $repoRoot "src-tauri/target/release/bundle"
$candidateDirs = @(
    @{ Dir = (Join-Path $bundleRoot "nsis"); Filter = "*.exe.sig" },
    @{ Dir = (Join-Path $bundleRoot "msi"); Filter = "*.msi.sig" }
)

$sigFile = $null
foreach ($candidate in $candidateDirs) {
    if (Test-Path $candidate.Dir) {
        $found = Get-ChildItem -Path $candidate.Dir -Filter $candidate.Filter -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($found) {
            $sigFile = $found
            break
        }
    }
}

if (-not $sigFile) {
    throw "アップデーター用の .sig（*.exe.sig / *.msi.sig）が見つかりません。tauri.conf.json の bundle.createUpdaterArtifacts が true か、TAURI_SIGNING_PRIVATE_KEY / TAURI_SIGNING_PRIVATE_KEY_PASSWORD を設定した状態で npm run tauri build を実行したか確認してください。"
}

$artifactName = $sigFile.Name -replace '\.sig$', ''
$signature = (Get-Content $sigFile.FullName -Raw).Trim()

$notesFullPath = Join-Path $repoRoot $NotesPath
$notes = if (Test-Path $notesFullPath) { (Get-Content $notesFullPath -Raw).Trim() } else { "" }

$pubDate = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$downloadUrl = "https://github.com/$RepoSlug/releases/download/v$version/$artifactName"

$latest = [ordered]@{
    version   = "v$version"
    notes     = $notes
    pub_date  = $pubDate
    platforms = [ordered]@{
        "windows-x86_64" = [ordered]@{
            signature = $signature
            url       = $downloadUrl
        }
    }
}

if (-not $OutFile) {
    $OutFile = Join-Path $bundleRoot "latest.json"
}

$latest | ConvertTo-Json -Depth 5 | Set-Content -Path $OutFile -Encoding utf8NoBOM

Write-Host "Generated $OutFile"
Write-Host "  version:  v$version"
Write-Host "  artifact: $artifactName"
Write-Host "  url:      $downloadUrl"
Write-Host "  signature source: $($sigFile.FullName)"
