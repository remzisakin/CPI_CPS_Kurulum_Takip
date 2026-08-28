param(
  [string]$Source = "",
  [string]$Output = "demodata\contact-data.js"
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

function Get-TurkishPhone([string]$value, [bool]$mobile) {
  if ([string]::IsNullOrWhiteSpace($value) -or $value.Trim() -match '^-+$') { return '' }
  $digits = $value -replace '\D', ''
  if ($digits.StartsWith('0090')) { $digits = $digits.Substring(2) }
  if ($digits.StartsWith('90') -and $digits.Length -eq 12) { $digits = '0' + $digits.Substring(2) }
  if ($digits.Length -eq 10) { $digits = '0' + $digits }
  if ($mobile) {
    if ($digits -notmatch '^05\d{9}$') { return '' }
  } elseif ($digits -notmatch '^0[234]\d{9}$') { return '' }
  return $digits
}

function Get-Email([string]$value) {
  $email = $value.Trim()
  if ($email -notmatch '^[^\s@]+@[^\s@]+\.[^\s@]+$') { return '' }
  return $email
}

if ([string]::IsNullOrWhiteSpace($Source)) {
  $match = Get-ChildItem -LiteralPath 'demodata' -File | Where-Object Name -Like 'Contacts w Accounts Report*.xlsx' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if (-not $match) { throw 'Kontak raporu bulunamadi.' }
  $sourcePath = $match.FullName
} else { $sourcePath = (Resolve-Path -LiteralPath $Source).Path }

$zip = [IO.Compression.ZipFile]::OpenRead($sourcePath)
try {
  $sharedStrings = @()
  $sharedEntry = $zip.GetEntry('xl/sharedStrings.xml')
  if ($sharedEntry) {
    $reader = [IO.StreamReader]::new($sharedEntry.Open())
    try { [xml]$sharedXml = $reader.ReadToEnd() } finally { $reader.Dispose() }
    foreach ($item in $sharedXml.sst.si) {
      $parts = @()
      if ($item.t) { $parts += [string]$item.t }
      foreach ($run in $item.r) { $parts += [string]$run.t }
      $sharedStrings += ($parts -join '')
    }
  }
  $entry = $zip.GetEntry('xl/worksheets/sheet1.xml')
  if (-not $entry) { throw 'Excel icinde ilk calisma sayfasi bulunamadi.' }
  $reader = [IO.StreamReader]::new($entry.Open())
  try { [xml]$xml = $reader.ReadToEnd() } finally { $reader.Dispose() }
} finally { $zip.Dispose() }

$contacts = foreach ($row in @($xml.worksheet.sheetData.row) | Where-Object { [int]$_.r -gt 10 }) {
  $values = @{}
  foreach ($cell in $row.c) {
    $column = ([string]$cell.r -replace '\d', '')
    $values[$column] = (Get-CellValue $cell $sharedStrings).Trim()
  }
  $account = $values['F']; $firstName = $values['B']; $lastName = $values['D']
  if (-not [string]::IsNullOrWhiteSpace($account) -and (-not [string]::IsNullOrWhiteSpace($firstName) -or -not [string]::IsNullOrWhiteSpace($lastName))) {
    $mobile = Get-TurkishPhone $values['H'] $true
    $phone = Get-TurkishPhone $values['I'] $false
    [ordered]@{ accountName=$account; firstName=$firstName; lastName=$lastName; email=(Get-Email $values['J']); mobile=$mobile; phone=$phone }
  }
}

$json = @($contacts) | ConvertTo-Json -Compress -Depth 3
[IO.File]::WriteAllText((Join-Path (Get-Location) $Output), "window.CPS_CONTACT_DATA=$json;", [Text.UTF8Encoding]::new($false))
$emailMissing = @($contacts | Where-Object { [string]::IsNullOrWhiteSpace($_.email) }).Count
$phoneMissing = @($contacts | Where-Object { [string]::IsNullOrWhiteSpace($_.mobile) -and [string]::IsNullOrWhiteSpace($_.phone) }).Count
Write-Output "$($contacts.Count) kontak olusturuldu. E-posta eksik: $emailMissing, gecerli telefon eksik: $phoneMissing"

