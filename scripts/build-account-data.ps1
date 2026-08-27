param(
  [string]$Source = "demodata\Accounts Report-2026-08-27-11-21-15.xlsx",
  [string]$Output = "demodata\accounts-data.js"
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$sourcePath = (Resolve-Path -LiteralPath $Source).Path
$zip = [System.IO.Compression.ZipFile]::OpenRead($sourcePath)
try {
  $entry = $zip.GetEntry('xl/worksheets/sheet1.xml')
  if (-not $entry) { throw 'Excel içinde ilk çalışma sayfası bulunamadı.' }
  $reader = [System.IO.StreamReader]::new($entry.Open())
  try { [xml]$xml = $reader.ReadToEnd() } finally { $reader.Dispose() }
} finally { $zip.Dispose() }

$ns = [System.Xml.XmlNamespaceManager]::new($xml.NameTable)
$ns.AddNamespace('x', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main')
$header = $xml.SelectSingleNode('//x:c[x:is/x:t="Account Name"]', $ns)
if (-not $header) { throw 'Account Name başlığı bulunamadı.' }
$headerRow = [int]$header.ParentNode.r
$accounts = foreach ($row in $xml.SelectNodes("//x:sheetData/x:row[number(@r)>$headerRow]", $ns)) {
  $nameCell = $row.SelectSingleNode('x:c[starts-with(@r,"B")]', $ns)
  $addressCell = $row.SelectSingleNode('x:c[starts-with(@r,"D")]', $ns)
  $name = [string]$nameCell.is.t
  if (-not [string]::IsNullOrWhiteSpace($name)) {
    [ordered]@{ name = $name.Trim(); address = ([string]$addressCell.is.t).Trim() }
  }
}

$json = @($accounts) | ConvertTo-Json -Compress -Depth 3
$content = "window.CPS_ACCOUNT_DATA=$json;"
$outputPath = Join-Path (Get-Location) $Output
[System.IO.File]::WriteAllText($outputPath, $content, [System.Text.UTF8Encoding]::new($false))
Write-Output "$($accounts.Count) müşteri kaydı oluşturuldu: $Output"

