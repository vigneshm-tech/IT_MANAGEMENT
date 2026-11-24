/**
 * The PowerShell collector, generated rather than pasted.
 *
 * The script is the other half of `/api/v1/iis/applications`: it reads the eight
 * fields off a Windows server and posts them back. Generating it in code means
 * the URL and the host name a person sees are the ones that will actually work,
 * and that the download always matches the parser in `lib/iis/automation.ts`.
 *
 * Pure and client-safe — the button builds the text in the browser, so the
 * download never depends on a second request.
 */

export const DEFAULT_COLLECTOR_API_URL = "https://tasktornado.vercel.app/api/v1/iis/applications";

export const COLLECTOR_FILE_NAME = "tasktornado-iis-collector.ps1";

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

  Per IIS application it reports:
    1. Server Host Name        this machine (-ServerHostName overrides it)
    2. Application Name        the site, plus the path for a nested application
    3. Binding Host Name       the binding's host header
    4. Binding Port            the binding's port
    5. SSL Mapped              the binding's protocol is https
    6. Application Pool
    7. Directory Browsing      enabled or disabled
    8. Application Root Path   the physical path on disk

  The key must belong to the IT manager or the super admin: only those two roles
  may write the register from a script.

  Run it on the IIS server, in an elevated PowerShell window:

      .${"\\" + COLLECTOR_FILE_NAME} -ApiKey 'tt_...'

${keyNote}
  Useful switches:
      -ListOnly        show what was found, send nothing
      -AllBindings     one row per binding instead of one per application
      -Environment     production, staging, development or dr (default production)
#>
[CmdletBinding()]
param(
${keyDefault}

  [string]$ApiUrl = ${ps(apiUrl)},

${serverDefault}

  [ValidateSet('production', 'staging', 'development', 'dr')]
  [string]$Environment = 'production',

  [switch]$AllBindings,

  [switch]$ListOnly
)

$ErrorActionPreference = 'Stop'

if ($PSVersionTable.PSVersion.Major -lt 5) {
  throw 'PowerShell 5.1 or newer is required.'
}

try {
  Import-Module WebAdministration -ErrorAction Stop
}
catch {
  throw 'The WebAdministration module is not available. Run this on the IIS server itself, from an elevated PowerShell window.'
}

function Get-BindingParts {
  param([string]$Information)

  # bindingInformation looks like "*:443:portal.example.com"; the host is optional.
  $parts = $Information.Split(':')
  $port = 0
  $hostName = ''
  if ($parts.Length -ge 2) { [void][int]::TryParse($parts[1], [ref]$port) }
  if ($parts.Length -ge 3) { $hostName = $parts[2] }

  [pscustomobject]@{
    HostName = $hostName
    Port = $(if ($port -gt 0) { $port } else { $null })
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

$records = New-Object System.Collections.Generic.List[object]

foreach ($site in @(Get-Website)) {
  $siteName = $site.Name
  $siteLocation = 'IIS:\Sites\' + $siteName

  $applications = New-Object System.Collections.Generic.List[object]
  $applications.Add([pscustomobject]@{
    Name = $siteName
    Path = '/'
    AppPool = $site.applicationPool
    RootPath = Get-RootPath -Location ($siteLocation + '/')
  })

  foreach ($application in @(Get-WebApplication -Site $siteName)) {
    $path = $application.path
    if (-not $path) { continue }
    $applications.Add([pscustomobject]@{
      Name = $siteName + '/' + $path.Trim('/')
      Path = $path
      AppPool = $application.applicationPool
      RootPath = Get-RootPath -Location ($siteLocation + $path)
    })
  }

  $bindings = @($site.Bindings.Collection)

  foreach ($application in $applications) {
    $browsing = Get-DirectoryBrowsing -Location ($siteLocation + $application.Path)

    $chosen = $bindings
    if (-not $AllBindings) {
      # One row per application: the https binding if there is one, else the first.
      $primary = $bindings | Where-Object { $_.protocol -eq 'https' } | Select-Object -First 1
      if (-not $primary) { $primary = $bindings | Select-Object -First 1 }
      $chosen = @($primary)
    }

    foreach ($binding in $chosen) {
      if (-not $binding) { continue }
      $parts = Get-BindingParts -Information $binding.bindingInformation

      $name = $application.Name
      if ($AllBindings -and $bindings.Count -gt 1) {
        $name = $name + ' (' + $parts.HostName + ':' + $parts.Port + ')'
      }

      $records.Add([pscustomobject]@{
        name = $name
        bindingHost = $parts.HostName
        bindingPort = $parts.Port
        sslMapped = ($binding.protocol -eq 'https')
        appPool = [string]$application.AppPool
        directoryBrowsing = $browsing
        appRoot = [string]$application.RootPath
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
  Write-Warning 'No IIS applications were found on this server. Is IIS installed on it?'
  return
}

Write-Host ('Found {0} IIS application(s) on {1}.' -f $records.Count, $ServerHostName) -ForegroundColor Cyan
$records | Format-Table -AutoSize name, bindingHost, bindingPort, sslMapped, appPool, directoryBrowsing, appRoot

if ($ListOnly) {
  Write-Host 'List only - nothing was sent.' -ForegroundColor Yellow
  return
}

$payload = @{
  server = $ServerHostName
  environment = $Environment
  applications = @($records)
} | ConvertTo-Json -Depth 6

Write-Host ('Posting to {0} ...' -f $ApiUrl) -ForegroundColor Cyan

$request = @{
  Method = 'Post'
  Uri = $ApiUrl
  Headers = @{ Authorization = ('Bearer ' + $ApiKey) }
  ContentType = 'application/json; charset=utf-8'
  Body = [System.Text.Encoding]::UTF8.GetBytes($payload)
  TimeoutSec = 90
}

try {
  $response = Invoke-RestMethod @request
}
catch {
  $status = 0
  if ($_.Exception.Response -ne $null) { $status = [int]$_.Exception.Response.StatusCode }

  switch ($status) {
    401 { Write-Host '401 - the API key was not accepted. Issue a new one in Settings > Developers.' -ForegroundColor Red }
    403 { Write-Host '403 - this key may not write the IIS register. Use an IT manager or super admin key.' -ForegroundColor Red }
    400 { Write-Host ('400 - the payload was rejected: ' + $_.ErrorDetails.Message) -ForegroundColor Red }
    default { Write-Host ('The upload failed: ' + $_.Exception.Message) -ForegroundColor Red }
  }
  exit 1
}

if ($response -and $response.data) {
  Write-Host ('Done - {0} created, {1} updated on {2}.' -f $response.data.created, $response.data.updated, $response.data.server) -ForegroundColor Green
}
else {
  Write-Host 'Uploaded, but the response carried no summary.' -ForegroundColor Green
}
`;
}
