param(
  [string]$Source = "",
  [string]$Output = "demodata\user-data.js",
  [string]$TemporaryPassword = "Cps2026!"
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Get-CellValue($cell, $sharedStrings) {
  if (-not $cell) { return '' }
  if ($cell.t -eq 's') { return [string]$sharedStrings[[int]$cell.v] }
  if ($cell.t -eq 'inlineStr') {
    $parts = @()
    if ($cell.is.t) { $parts += [string]$cell.is.t }
    foreach ($run in $cell.is.r) { $parts += [string]$run.t }
    return ($parts -join '')
  }
  return [string]$cell.v
}

function Convert-ToUsername([string]$name) {
  $value = $name.Normalize([Text.NormalizationForm]::FormD)
  $value = $value -replace '\p{Mn}', ''
  $value = $value.Replace([string][char]0x0131, 'i').ToLowerInvariant()
  return (($value -replace '[^a-z0-9 ]', '' -replace '\s+', '.').Trim('.'))
}

function Convert-ToRole([string]$permission) {
  $normalized = $permission.ToLowerInvariant().Normalize([Text.NormalizationForm]::FormD) -replace '\p{Mn}', ''
  $normalized = $normalized.Replace([string][char]0x0131, 'i')
  if ($normalized -match 'yonetici') { return 'admin' }
  if ($normalized -match 'supervisor|supervisor') { return 'supervisor' }
  if ($normalized -match 'teknisyen') { return 'technician' }
  if ($normalized -match 'satis') { return 'sales' }
  throw "Bilinmeyen yetki: $permission"
}

if ([string]::IsNullOrWhiteSpace($Source)) {
  $match = Get-ChildItem -LiteralPath 'demodata' -File | Where-Object Name -Like '*yetkileri.xlsx' | Select-Object -First 1
  if (-not $match) { throw 'Kullanici yetkileri Excel dosyasi bulunamadi.' }
  $sourcePath = $match.FullName
} else { $sourcePath = (Resolve-Path -LiteralPath $Source).Path }
$zip = [System.IO.Compression.ZipFile]::OpenRead($sourcePath)
try {
  $sharedStrings = @()
  $sharedEntry = $zip.GetEntry('xl/sharedStrings.xml')
  if ($sharedEntry) {
    $reader = [System.IO.StreamReader]::new($sharedEntry.Open())
    try { [xml]$sharedXml = $reader.ReadToEnd() } finally { $reader.Dispose() }
    foreach ($item in $sharedXml.sst.si) {
      $parts = @()
      if ($item.t) { $parts += [string]$item.t }
      foreach ($run in $item.r) { $parts += [string]$run.t }
      $sharedStrings += ($parts -join '')
    }
  }

  $entry = $zip.GetEntry('xl/worksheets/sheet1.xml')
  if (-not $entry) { throw 'Excel içinde ilk çalışma sayfası bulunamadı.' }
  $reader = [System.IO.StreamReader]::new($entry.Open())
  try { [xml]$xml = $reader.ReadToEnd() } finally { $reader.Dispose() }
} finally { $zip.Dispose() }

$rows = @($xml.worksheet.sheetData.row)
if ($rows.Count -lt 2) { throw 'Kullanıcı listesi boş.' }
$nameColumn = 'A'
$titleColumn = 'B'
$permissionColumn = 'C'

$users = foreach ($row in $rows | Select-Object -Skip 1) {
  $values = @{}
  foreach ($cell in $row.c) {
    $column = ([string]$cell.r -replace '\d', '')
    $values[$column] = (Get-CellValue $cell $sharedStrings).Trim()
  }
  $name = $values[$nameColumn]
  if (-not [string]::IsNullOrWhiteSpace($name)) {
    $roleLabel = $values[$permissionColumn]
    [ordered]@{
      name = $name
      title = $values[$titleColumn]
      roleLabel = $roleLabel
      role = Convert-ToRole $roleLabel
      username = Convert-ToUsername $name
      password = $TemporaryPassword
      active = $true
    }
  }
}

$json = @($users) | ConvertTo-Json -Compress -Depth 3
$content = "window.CPS_USER_DATA=$json;"
$outputPath = Join-Path (Get-Location) $Output
[System.IO.File]::WriteAllText($outputPath, $content, [System.Text.UTF8Encoding]::new($false))
Write-Output "$($users.Count) kullanıcı kaydı oluşturuldu: $Output"

