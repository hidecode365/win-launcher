# WinLauncher リリースダウンロード数集計スクリプト
# GitHub Releasesの各バージョンについて、.exe/.msiのダウンロード数を集計して表示する
# (.sigファイル・latest.jsonはWinGet審査パイプライン等のノイズが混入するため除外)

$releases = Invoke-RestMethod https://api.github.com/repos/hidecode365/win-launcher/releases

$summary = foreach ($release in $releases) {
    $exe = ($release.assets | Where-Object { $_.name -like "*.exe" } | Measure-Object -Property download_count -Sum).Sum
    $msi = ($release.assets | Where-Object { $_.name -like "*.msi" } | Measure-Object -Property download_count -Sum).Sum

    [PSCustomObject]@{
        Version = $release.name
        Exe     = [int]($exe ?? 0)
        Msi     = [int]($msi ?? 0)
        Total   = [int]($exe ?? 0) + [int]($msi ?? 0)
    }
}

$summary | Format-Table -AutoSize

$grandExe   = ($summary | Measure-Object -Property Exe -Sum).Sum
$grandMsi   = ($summary | Measure-Object -Property Msi -Sum).Sum
$grandTotal = ($summary | Measure-Object -Property Total -Sum).Sum

Write-Host ""
Write-Host "合計 - exe: $grandExe / msi: $grandMsi / 総計: $grandTotal"
