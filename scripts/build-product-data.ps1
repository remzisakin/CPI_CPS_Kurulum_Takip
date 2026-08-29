param(
  [string]$Source = "demodata\Desoutter_Product.xlsm",
  [string]$Output = "demodata\product-data.js"
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$sourcePath = (Resolve-Path -LiteralPath $Source).Path
$zip = [System.IO.Compression.ZipFile]::OpenRead($sourcePath)

function Read-ZipXml([string]$name) {
  $entry = $zip.GetEntry($name)
  if (-not $entry) { throw "$name bulunamadı." }
  $reader = [System.IO.StreamReader]::new($entry.Open())
  try { return [xml]$reader.ReadToEnd() } finally { $reader.Dispose() }
}

try {
  $sharedXml = Read-ZipXml 'xl/sharedStrings.xml'
  $sharedNs = [System.Xml.XmlNamespaceManager]::new($sharedXml.NameTable)
  $sharedNs.AddNamespace('x', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main')
  $sharedStrings = @($sharedXml.SelectNodes('//x:sst/x:si', $sharedNs) | ForEach-Object {
    ($_.SelectNodes('.//x:t', $sharedNs) | ForEach-Object { $_.InnerText }) -join ''
  })

  function Get-CellText($cell, $ns) {
    if (-not $cell) { return '' }
    if ($cell.t -eq 's') {
      $valueNode = $cell.SelectSingleNode('x:v', $ns)
      if ($valueNode) { return [string]$sharedStrings[[int]$valueNode.InnerText] }
    }
    if ($cell.t -eq 'inlineStr') {
      return [string](($cell.SelectNodes('.//x:t', $ns) | ForEach-Object { $_.InnerText }) -join '')
    }
    return [string]$cell.SelectSingleNode('x:v', $ns).InnerText
  }

  $products = [System.Collections.Generic.List[object]]::new()
  foreach ($definition in @(
    @{ Sheet = 'xl/worksheets/sheet1.xml'; PartColumn = 'A'; DescriptionColumn = 'B'; ItemColumn = $null; SourceName = 'TP List' },
    @{ Sheet = 'xl/worksheets/sheet2.xml'; PartColumn = 'B'; DescriptionColumn = 'C'; ItemColumn = 'A'; SourceName = 'PRICE LIST 2026' }
  )) {
    $sheetXml = Read-ZipXml $definition.Sheet
    $ns = [System.Xml.XmlNamespaceManager]::new($sheetXml.NameTable)
    $ns.AddNamespace('x', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main')
    foreach ($row in $sheetXml.SelectNodes('//x:sheetData/x:row[number(@r)>1]', $ns)) {
      $part = (Get-CellText ($row.SelectSingleNode("x:c[starts-with(@r,'$($definition.PartColumn)')]", $ns)) $ns).Trim()
      $description = (Get-CellText ($row.SelectSingleNode("x:c[starts-with(@r,'$($definition.DescriptionColumn)')]", $ns)) $ns).Trim()
      $itemNo = if ($definition.ItemColumn) { (Get-CellText ($row.SelectSingleNode("x:c[starts-with(@r,'$($definition.ItemColumn)')]", $ns)) $ns).Trim() } else { '' }
      if ($part -and $description) {
        $products.Add([ordered]@{ partNo = $part; description = $description; itemNo = $itemNo; source = $definition.SourceName })
      }
    }
  }
} finally { $zip.Dispose() }

$json = @($products) | ConvertTo-Json -Compress -Depth 3
$content = "window.CPS_PRODUCT_DATA=$json;"
$outputPath = Join-Path (Get-Location) $Output
[System.IO.File]::WriteAllText($outputPath, $content, [System.Text.UTF8Encoding]::new($false))
Write-Output "$($products.Count) ürün kaydı oluşturuldu: $Output"

