<#
.SYNOPSIS
    Registers the published API Mapping Catalogue app as a Windows Service -
    an alternative to iis/New-ApiMappingSite.ps1. Same published app, same
    api/Program.cs (api/Program.cs:12 wires in UseWindowsService() so one
    codebase runs under either hosting model), just a different host.

.DESCRIPTION
    Kestrel binds directly to -Port (no IIS in front), so the service is
    reachable at http://<server>:<port>/ as soon as it starts.

    Deliberately creates the service running as LocalSystem, not a specific
    account - that always works with no credential/rights setup, and gets
    you a reachable site immediately to confirm hosting itself is fine. The
    static frontend will work right away; /api/* calls will 500 until you
    switch the Log On As account (LocalSystem has no SQL Server access).

    To run it as a specific account (e.g. HIVEDOME\dtuskin, or a service
    account once you have its password):
      1. services.msc
      2. Find the service, Properties -> Log On tab
      3. "This account" -> enter the username/password -> OK
      4. Restart the service

    That dialog grants the account the "Log on as a service" right
    automatically as part of saving it - this is the thing that caused all
    the grief with the IIS app pool (which needs "Log on as a batch job"
    instead, granted separately, nothing like this automatic). Going through
    services.msc for this step rather than scripting it blind avoids
    repeating that whole saga for a second right.

.PARAMETER ServiceName
    Windows service name. Default: "ITAS API Mapping".

.PARAMETER PublishPath
    Folder containing the `dotnet publish` output (where
    ApiMappingCatalogue.Api.exe lives). Required.

.PARAMETER Port
    Port Kestrel binds to directly. Default: 5068.

.EXAMPLE
    .\New-ApiMappingService.ps1 -PublishPath 'C:\inetpub\ITAS-API-Mapping'
#>

#Requires -RunAsAdministrator

[CmdletBinding()]
param(
    [string]$ServiceName = 'ITAS API Mapping',

    [Parameter(Mandatory = $true)]
    [string]$PublishPath,

    [int]$Port = 5068
)

$ErrorActionPreference = 'Stop'

$exePath = Join-Path $PublishPath 'ApiMappingCatalogue.Api.exe'
if (-not (Test-Path $exePath)) {
    throw "Couldn't find $exePath - check -PublishPath points at a `dotnet publish` output folder " +
          "(dotnet publish api -c Release -o `"$PublishPath`"), and that it's been rebuilt since " +
          "UseWindowsService() was added (api/Program.cs)."
}

$binaryPathName = "`"$exePath`" --urls http://0.0.0.0:$Port"

if (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue) {
    Write-Host "Service '$ServiceName' already exists - removing it so it can be recreated with the current settings." -ForegroundColor Yellow
    Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
    sc.exe delete $ServiceName | Out-Null
    Start-Sleep -Seconds 1
}

Write-Host "Creating service '$ServiceName' (as LocalSystem for now)..." -ForegroundColor Cyan
New-Service -Name $ServiceName `
    -BinaryPathName $binaryPathName `
    -DisplayName $ServiceName `
    -Description 'API Mapping Catalogue - ASP.NET Core app serving the frontend and /api/* endpoints.' `
    -StartupType Automatic | Out-Null

New-NetFirewallRule -DisplayName "$ServiceName (HTTP $Port)" `
    -Direction Inbound -Protocol TCP -LocalPort $Port -Action Allow `
    -ErrorAction SilentlyContinue | Out-Null

Start-Service -Name $ServiceName

Write-Host ""
Write-Host "Done. '$ServiceName' is running as LocalSystem, listening on http://*:$Port/" -ForegroundColor Green
Write-Host "http://<this-server>:$Port/ should load the grid UI now. /api/* calls will 500 until" -ForegroundColor Yellow
Write-Host "you switch the Log On As account - see the .DESCRIPTION above (services.msc -> '$ServiceName' -> Properties -> Log On)." -ForegroundColor Yellow
