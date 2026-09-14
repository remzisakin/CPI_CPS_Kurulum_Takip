$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'index.html'))) {
  $projectRoot = Split-Path -Parent $PSScriptRoot
}
$sources = [ordered]@{
  'NotoSans-Regular.ttf' = 'assets\report-templates\NotoSans-Regular.ttf'
  'NotoSans-Bold.ttf' = 'assets\report-templates\NotoSans-Bold.ttf'
  'desoutter-logo.png' = 'assets\report-templates\desoutter-logo.png'
  'screw-feeding-cover-product.png' = 'assets\report-templates\screw-feeding-cover-product.png'
  'screw-feeding-cover-product-cutout.png' = 'assets\report-templates\screw-feeding-cover-product-cutout.png'
  'maintenance-daily.png' = 'assets\report-templates\maintenance-daily.png'
  'maintenance-weekly.png' = 'assets\report-templates\maintenance-weekly.png'
  'maintenance-feed-unit.png' = 'assets\report-templates\maintenance-feed-unit.png'
}
$entries = foreach ($item in $sources.GetEnumerator()) {
  $path = Join-Path $projectRoot $item.Value
  if (-not (Test-Path -LiteralPath $path)) { throw "Missing report asset: $path" }
  $base64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($path))
  "  '$($item.Key)': '$base64'"
}
$content = "window.CPS_REPORT_ASSETS={`r`n$($entries -join ",`r`n")`r`n};`r`n"
[IO.File]::WriteAllText((Join-Path $projectRoot 'demodata\report-template-data.js'), $content, [Text.UTF8Encoding]::new($false))
