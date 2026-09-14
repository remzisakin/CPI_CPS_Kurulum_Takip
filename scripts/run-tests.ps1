param(
  [ValidateSet('All', 'Chrome', 'Edge')]
  [string]$Browser = 'All'
)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$testFile = Join-Path $PSScriptRoot 'smoke-tests.mjs'
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$codeCandidates = @(
  (Join-Path $env:LOCALAPPDATA 'Programs\Microsoft VS Code\Code.exe'),
  (Join-Path $env:ProgramFiles 'Microsoft VS Code\Code.exe')
)
$codePath = $codeCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
$browserDefinitions = @(
  [pscustomobject]@{
    Name = 'Chrome'
    Paths = @(
      (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),
      (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe'),
      (Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe')
    )
  },
  [pscustomobject]@{
    Name = 'Edge'
    Paths = @(
      (Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'),
      (Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe')
    )
  }
)
$browsers = @($browserDefinitions | Where-Object { $Browser -eq 'All' -or $_.Name -eq $Browser } | ForEach-Object {
  $path = $_.Paths | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
  if ($path) { [pscustomobject]@{ Name = $_.Name; Path = $path } }
})
if (-not $browsers.Count) { throw "$Browser tarayıcısı bulunamadı; testler çalıştırılamıyor." }
if ($Browser -eq 'All' -and $browsers.Count -lt $browserDefinitions.Count) {
  Write-Warning 'Kurulu olmayan tarayıcı atlandı. Her iki tarayıcıyı doğrulamak için Chrome ve Edge kurulu olmalıdır.'
}
$nodeHasWebSocket = $false
if ($nodeCommand) {
  try { $nodeHasWebSocket = ((& $nodeCommand.Source -p 'typeof WebSocket') -eq 'function') } catch {}
}
if ($nodeHasWebSocket) {
  $runtime = $nodeCommand.Source
  $useElectron = $false
} elseif ($codePath) {
  $runtime = $codePath
  $useElectron = $true
} else {
  throw 'WebSocket destekli Node.js veya VS Code çalışma zamanı bulunamadı.'
}

$priorBrowserPath = [Environment]::GetEnvironmentVariable('CPS_TEST_BROWSER_PATH', 'Process')
$priorBrowserName = [Environment]::GetEnvironmentVariable('CPS_TEST_BROWSER_NAME', 'Process')
$priorElectronMode = [Environment]::GetEnvironmentVariable('ELECTRON_RUN_AS_NODE', 'Process')
$testExitCode = 0
try {
  if ($useElectron) { [Environment]::SetEnvironmentVariable('ELECTRON_RUN_AS_NODE', '1', 'Process') }
  foreach ($targetBrowser in $browsers) {
    $outputPath = Join-Path $env:TEMP ('cps-smoke-output-' + [guid]::NewGuid().ToString('N') + '.txt')
    $errorPath = Join-Path $env:TEMP ('cps-smoke-error-' + [guid]::NewGuid().ToString('N') + '.txt')
    try {
      [Environment]::SetEnvironmentVariable('CPS_TEST_BROWSER_PATH', $targetBrowser.Path, 'Process')
      [Environment]::SetEnvironmentVariable('CPS_TEST_BROWSER_NAME', $targetBrowser.Name, 'Process')
      Write-Host ("CPS otomatik testleri ayrı bir geçici {0} profiliyle çalışıyor..." -f $targetBrowser.Name)
      $testProcess = Start-Process -FilePath $runtime -ArgumentList ('"' + $testFile + '"') -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput $outputPath -RedirectStandardError $errorPath -PassThru -Wait
      if (Test-Path -LiteralPath $outputPath) { Get-Content -LiteralPath $outputPath -Encoding UTF8 }
      if (Test-Path -LiteralPath $errorPath) { Get-Content -LiteralPath $errorPath -Encoding UTF8 }
      if ($testProcess.ExitCode -ne 0) { $testExitCode = 1 }
    } finally {
      if (Test-Path -LiteralPath $outputPath) { Remove-Item -LiteralPath $outputPath -Force }
      if (Test-Path -LiteralPath $errorPath) { Remove-Item -LiteralPath $errorPath -Force }
    }
  }
} finally {
  [Environment]::SetEnvironmentVariable('CPS_TEST_BROWSER_PATH', $priorBrowserPath, 'Process')
  [Environment]::SetEnvironmentVariable('CPS_TEST_BROWSER_NAME', $priorBrowserName, 'Process')
  [Environment]::SetEnvironmentVariable('ELECTRON_RUN_AS_NODE', $priorElectronMode, 'Process')
}
exit $testExitCode
