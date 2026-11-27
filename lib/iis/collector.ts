/**
 * The PowerShell collector, generated rather than pasted.
 *
 * The script is the other half of `/api/v1/iis/applications`: it reads the eight
 * fields off a Windows server and posts them back. Generating it in code means
 * the URL and the host name a person sees are the ones that will actually work,
 * and that the download always matches the parser in `lib/iis/automation.ts`.
 *
 * Two things it deliberately does the hard way:
 *   * It reports **sites**, not every virtual directory inside them — a register
 *     of 421 rows where 380 are sub-applications of nine sites is not a register.
 *     `-IncludeApplications` asks for the detailed view when somebody wants it.
 *   * It resolves the **certificate** a binding uses (name, thumbprint, expiry)
 *     rather than answering "SSL: true". That boolean never renewed anything.
 *
 * Pure and client-safe — the button builds the text in the browser, so the
 * download never depends on a second request.
 */

export const DEFAULT_COLLECTOR_API_URL = "https://tasktornado.vercel.app/api/v1/iis/applications";

export const COLLECTOR_FILE_NAME = "tasktornado-iis-collector.ps1";

/** Rows per request: keeps the body small and a failure cheap to retry. */
export const COLLECTOR_BATCH_SIZE = 100;

/** A single-quoted PowerShell string has no escapes except a doubled quote. */
function ps(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export function collectorScript(options: {
  apiUrl?: string;
  serverHostName?: string;
  /** Filled in only when a person types one; otherwise the script asks for it. */
  apiKey?: string;
} = {}): string {
  const apiUrl = (options.apiUrl ?? DEFAULT_COLLECTOR_API_URL).trim() || DEFAULT_COLLECTOR_API_URL;
  const server = (options.serverHostName ?? "").trim();
  const serverDefault = server
    ? `  [string]$ServerHostName = ${ps(server)},`
    : "  [string]$ServerHostName = $env:COMPUTERNAME,";
  const key = (options.apiKey ?? "").trim();
  const keyDefault = key
    ? `  [string]$ApiKey = ${ps(key)},`
    : "  [Parameter(Mandatory = $true)]\n  [string]$ApiKey,";
  const keyNote = key
    ? "  The key you typed is written into this file as the default - delete the file\n  after the run, or clear the key and pass -ApiKey instead.\n"
    : "";

  return String.raw`<#
  TaskTornado - IIS application collector
  --------------------------------------
  Reads the eight fields the IIS Application register asks for, on this
  Windows server, and posts them to:

      ${apiUrl}

  Per IIS site it reports:
    1. Server Host Name        this machine (-ServerHostName overrides it)
    2. Application Name        the site name
    3. Binding Host Name       the binding's host header
    4. Binding Port            the binding's port
    5. SSL Mapped              https, plus the certificate's name, thumbprint
                               and expiry date
    6. Application Pool
    7. Directory Browsing      enabled or disabled
    8. Application Root Path   the physical path on disk

  One row per site by default. -IncludeApplications also reports every
  application and virtual directory inside each site as its own row.

  The key must belong to the IT manager or the super admin: only those two roles
  may write the register from a script.

  Run it on the IIS server, in an elevated PowerShell window:

      .${"\\" + COLLECTOR_FILE_NAME} -ApiKey 'tt_...'

${keyNote}
  Useful switches:
      -ListOnly             show what was found, send nothing
      -IncludeApplications  one row per application and virtual directory too
      -AllBindings          one row per binding instead of one per site
      -Environment          production, staging, development or dr (default production)
      -BatchSize            rows per request (default ${COLLECTOR_BATCH_SIZE})
      -DumpPath             write the JSON to this file as well as sending it
#>
[CmdletBinding()]
param(
${keyDefault}

  [string]$ApiUrl = ${ps(apiUrl)},

${serverDefault}

  [ValidateSet('production', 'staging', 'development', 'dr')]
  [string]$Environment = 'production',

  [switch]$IncludeApplications,

  [switch]$AllBindings,

  [switch]$ListOnly,

  [ValidateRange(1, 500)]
  [int]$BatchSize = ${COLLECTOR_BATCH_SIZE},

  [string]$DumpPath = ''
)

$ErrorActionPreference = 'Stop'

if ($PSVersionTable.PSVersion.Major -lt 5) {
  throw 'PowerShell 5.1 or newer is required.'
}

# Windows PowerShell 5.1 still negotiates TLS 1.0 by default on older hosts.
try {
  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
}
catch { }

try {
  Import-Module WebAdministration -ErrorAction Stop
}
catch {
  throw 'The WebAdministration module is not available. Run this on the IIS server itself, from an elevated PowerShell window.'
}

function Split-Binding {
  param([string]$Information)

  # bindingInformation looks like "*:443:portal.example.com"; the host is optional.
  $parts = $Information.Split(':')
  $port = 0
  $hostName = ''
  if ($parts.Length -ge 2 -and $parts[1] -match '^\d+$') { $port = [int]$parts[1] }
  if ($parts.Length -ge 3) { $hostName = $parts[2] }

  [pscustomobject]@{
    HostName = $hostName
    Port = $(if ($port -gt 0) { $port } else { $null })
  }
}

function Get-CertificateName {
  param([string]$Subject)

  # Subject comes as "CN=*.eshopaid.com, O=Wondersoft, ..."; the CN is the name
  # a browser shows and the name a renewal has to match.
  if ($Subject -match 'CN=("?)([^",]+)\1') { return $Matches[2] }
  return $Subject
}

# One netsh dump, keyed by host:port and by ip:port. Reading it per site would be
# a hundred extra processes for the same answer.
function Get-SslCertMap {
  $map = @{}
  $current = @{}

  try { $lines = & netsh http show sslcert 2>$null }
  catch { return $map }
  if (-not $lines) { return $map }

  foreach ($line in $lines) {
    if ($line -match '^\s*Hostname:port\s*:\s*(\S+)\s*$') { $current['host'] = $Matches[1] }
    elseif ($line -match '^\s*IP:port\s*:\s*(\S+)\s*$') { $current['ip'] = $Matches[1] }
    elseif ($line -match '^\s*Certificate Hash\s*:\s*([0-9A-Fa-f]+)\s*$') { $current['hash'] = $Matches[1] }
    elseif ($line -match '^\s*Certificate Store Name\s*:\s*(\S+)\s*$') { $current['store'] = $Matches[1] }
    elseif ($line -match '^\s*$') {
      if ($current['hash']) {
        if ($current['host']) { $map[$current['host'].ToLowerInvariant()] = $current }
        if ($current['ip']) { $map[$current['ip'].ToLowerInvariant()] = $current }
        $current = @{}
      }
    }
  }
  if ($current['hash']) {
    if ($current['host']) { $map[$current['host'].ToLowerInvariant()] = $current }
    if ($current['ip']) { $map[$current['ip'].ToLowerInvariant()] = $current }
  }

  return $map
}

function Get-SslCertificate {
  param(
    [string]$SiteName,
    [string]$Protocol,
    [string]$BindingInformation,
    [hashtable]$CertMap,
    [hashtable]$CertCache
  )

  $mapped = ($Protocol -eq 'https')
  $parts = Split-Binding -Information $BindingInformation

  if (-not $mapped) {
    return [pscustomobject]@{ Mapped = $false; Name = ''; Thumbprint = ''; ExpiresAt = $null }
  }

  $hash = ''
  $store = 'My'

  # 1. The site binding knows its own certificate for a plain https binding.
  try {
    $binding = Get-WebBinding -Name $SiteName -Protocol 'https' -ErrorAction Stop |
      Where-Object { $_.bindingInformation -eq $BindingInformation } |
      Select-Object -First 1
    if ($binding -and $binding.certificateHash) {
      $hash = ([string]$binding.certificateHash) -replace '[^0-9A-Fa-f]', ''
    }
  }
  catch { }

  # 2. SNI bindings are registered with HTTP.sys instead, keyed by host:port.
  if (-not $hash) {
    $keys = @()
    if ($parts.HostName -and $parts.Port) { $keys += ('{0}:{1}' -f $parts.HostName, $parts.Port).ToLowerInvariant() }
    if ($parts.Port) { $keys += ('0.0.0.0:{0}' -f $parts.Port).ToLowerInvariant() }
    foreach ($key in $keys) {
      if ($CertMap.ContainsKey($key)) {
        $hash = [string]$CertMap[$key]['hash']
        if ($CertMap[$key]['store'] -and $CertMap[$key]['store'] -ne '(null)') {
          $store = [string]$CertMap[$key]['store']
        }
        break
      }
    }
  }

  if (-not $hash) {
    return [pscustomobject]@{ Mapped = $true; Name = ''; Thumbprint = ''; ExpiresAt = $null }
  }

  $thumbprint = $hash.ToUpperInvariant()

  # 3. The certificate itself: the name on it and the day it lapses.
  $certificate = $null
  if ($CertCache.ContainsKey($thumbprint)) {
    $certificate = $CertCache[$thumbprint]
  }
  else {
    foreach ($location in @(('Cert:\LocalMachine\{0}\{1}' -f $store, $thumbprint), 'Cert:\LocalMachine\My')) {
      try {
        $found = Get-ChildItem -Path $location -ErrorAction SilentlyContinue |
          Where-Object { $_.Thumbprint -eq $thumbprint } |
          Select-Object -First 1
        if ($found) { $certificate = $found; break }
      }
      catch { }
    }
    $CertCache[$thumbprint] = $certificate
  }

  $name = ''
  $expiresAt = $null
  if ($certificate) {
    $name = Get-CertificateName -Subject ([string]$certificate.Subject)
    $expiresAt = $certificate.NotAfter.ToString('yyyy-MM-dd')
  }

  [pscustomobject]@{
    Mapped = $true
    Name = $name
    Thumbprint = $thumbprint
    ExpiresAt = $expiresAt
  }
}

function Get-RootPath {
  param([string]$Location)

  try { return [string](Get-Item $Location).PhysicalPath } catch { return '' }
}

function Get-DirectoryBrowsing {
  param([string]$Location)

  try {
    $enabled = (Get-WebConfigurationProperty -PSPath $Location -Filter 'system.webServer/directoryBrowse' -Name 'enabled').Value
    if ($enabled -eq $true) { return 'enabled' }
    return 'disabled'
  }
  catch {
    return 'disabled'
  }
}

Write-Host ('Collecting IIS sites on {0} ...' -f $ServerHostName) -ForegroundColor Cyan

$certMap = Get-SslCertMap
$certCache = @{}
$records = New-Object System.Collections.Generic.List[object]

foreach ($site in @(Get-Website)) {
  $siteName = $site.Name
  $siteLocation = 'IIS:\Sites\' + $siteName

  $targets = New-Object System.Collections.Generic.List[object]
  $targets.Add([pscustomobject]@{
    Name = $siteName
    Path = '/'
    AppPool = $site.applicationPool
    RootPath = Get-RootPath -Location ($siteLocation + '/')
  })

  if ($IncludeApplications) {
    foreach ($application in @(Get-WebApplication -Site $siteName)) {
      $path = $application.path
      if (-not $path -or $path -eq '/') { continue }
      $targets.Add([pscustomobject]@{
        Name = $siteName + '/' + $path.Trim('/')
        Path = $path
        AppPool = $application.applicationPool
        RootPath = Get-RootPath -Location ($siteLocation + $path)
      })
    }
  }

  $bindings = @($site.Bindings.Collection)

  foreach ($target in $targets) {
    $browsing = Get-DirectoryBrowsing -Location ($siteLocation + $target.Path)

    $chosen = $bindings
    if (-not $AllBindings) {
      # One row per site: the https binding if there is one, else the first.
      $primary = $bindings | Where-Object { $_.protocol -eq 'https' } | Select-Object -First 1
      if (-not $primary) { $primary = $bindings | Select-Object -First 1 }
      $chosen = @($primary)
    }

    foreach ($binding in $chosen) {
      if (-not $binding) { continue }
      $parts = Split-Binding -Information $binding.bindingInformation
      $certificate = Get-SslCertificate -SiteName $siteName -Protocol $binding.protocol -BindingInformation $binding.bindingInformation -CertMap $certMap -CertCache $certCache

      $name = $target.Name
      if ($AllBindings -and $bindings.Count -gt 1) {
        $name = $name + ' (' + $parts.HostName + ':' + $parts.Port + ')'
      }

      $records.Add([pscustomobject]@{
        name = $name
        bindingHost = $parts.HostName
        bindingPort = $parts.Port
        sslMapped = [bool]$certificate.Mapped
        sslCertificate = [string]$certificate.Name
        sslThumbprint = [string]$certificate.Thumbprint
        sslExpiresAt = $certificate.ExpiresAt
        appPool = [string]$target.AppPool
        directoryBrowsing = $browsing
        appRoot = [string]$target.RootPath
      })
    }
  }
}

# The register keys on the application name, so report each name once.
$seen = @{}
$unique = New-Object System.Collections.Generic.List[object]
foreach ($record in $records) {
  $key = $record.name.ToLowerInvariant()
  if ($seen.ContainsKey($key)) { continue }
  $seen[$key] = $true
  $unique.Add($record)
}
$records = $unique

if ($records.Count -eq 0) {
  Write-Warning 'No IIS sites were found on this server. Is IIS installed on it?'
  return
}

$withoutCertificate = @($records | Where-Object { $_.sslMapped -and -not $_.sslCertificate }).Count

Write-Host ('Found {0} row(s) on {1}.' -f $records.Count, $ServerHostName) -ForegroundColor Cyan
$records | Format-Table -AutoSize name, bindingHost, bindingPort, sslMapped, sslCertificate, sslExpiresAt, appPool, directoryBrowsing

if ($withoutCertificate -gt 0) {
  Write-Host ('{0} https binding(s) did not report a certificate name - the register will keep "Mapped" without a name for them.' -f $withoutCertificate) -ForegroundColor Yellow
}

if ($ListOnly) {
  Write-Host 'List only - nothing was sent.' -ForegroundColor Yellow
  return
}

$batchSize = [Math]::Max(1, [Math]::Min(500, [int]$BatchSize))
$batches = [int][Math]::Ceiling($records.Count / $batchSize)

Write-Host ('Posting to {0} in {1} batch(es) ...' -f $ApiUrl, $batches) -ForegroundColor Cyan

$totalCreated = 0
$totalUpdated = 0
$totalUnchanged = 0
$sent = 0

for ($start = 0; $start -lt $records.Count; $start += $batchSize) {
  $last = [Math]::Min($start + $batchSize - 1, $records.Count - 1)
  $slice = @($records[$start..$last])
  $number = [int][Math]::Floor($start / $batchSize) + 1

  $json = ([ordered]@{
    server = $ServerHostName
    environment = $Environment
    applications = @($slice)
  } | ConvertTo-Json -Depth 6 -Compress)

  if ($json -isnot [string]) { $json = ($json -join '') }

  if ($DumpPath) {
    try {
      [System.IO.File]::WriteAllText($DumpPath, $json, [System.Text.Encoding]::UTF8)
      Write-Host ('Batch {0} written to {1} ({2} characters).' -f $number, $DumpPath, $json.Length) -ForegroundColor DarkGray
    }
    catch {
      Write-Host ('Could not write {0}: {1}' -f $DumpPath, $_.Exception.Message) -ForegroundColor Yellow
    }
  }

  Write-Host ('Batch {0} of {1}: {2} application(s), {3} characters.' -f $number, $batches, $slice.Count, $json.Length) -ForegroundColor Cyan

  try {
    $response = Invoke-RestMethod -Method Post -Uri $ApiUrl -Headers @{ Authorization = ('Bearer ' + $ApiKey) } -ContentType 'application/json; charset=utf-8' -Body $json -TimeoutSec 180
  }
  catch {
    $status = 0
    if ($_.Exception.Response) { $status = [int]$_.Exception.Response.StatusCode }
    $detail = ''
    if ($_.ErrorDetails -and $_.ErrorDetails.Message) { $detail = $_.ErrorDetails.Message }

    Write-Host ('Batch {0} failed. HTTP {1}.' -f $number, $status) -ForegroundColor Red
    switch ($status) {
      401 { Write-Host '401 - the API key was not accepted. Issue a new one in Settings > Developers.' -ForegroundColor Red }
      403 { Write-Host '403 - this key may not write the IIS register. Use an IT manager or super admin key.' -ForegroundColor Red }
      400 { Write-Host ('400 - the server rejected the payload: ' + $detail) -ForegroundColor Red }
      default { Write-Host ($_.Exception.GetType().Name + ': ' + $_.Exception.Message) -ForegroundColor Red }
    }
    if ($detail) { Write-Host $detail -ForegroundColor DarkGray }
    Write-Host ('Nothing after batch {0} was sent. Rows already sent stay in the register.' -f $number) -ForegroundColor Yellow
    exit 1
  }

  if ($response -and $response.data) {
    $totalCreated += [int]$response.data.created
    $totalUpdated += [int]$response.data.updated
    $totalUnchanged += [int]$response.data.unchanged
    $sent += $slice.Count
    Write-Host ('  {0} created, {1} updated, {2} unchanged.' -f $response.data.created, $response.data.updated, $response.data.unchanged) -ForegroundColor Green
  }
  else {
    Write-Host '  The response carried no summary.' -ForegroundColor Yellow
  }
}

Write-Host ''
Write-Host ('Done - {0} row(s) sent to {1}: {2} created, {3} updated, {4} unchanged.' -f $sent, $ServerHostName, $totalCreated, $totalUpdated, $totalUnchanged) -ForegroundColor Green
`;
}
