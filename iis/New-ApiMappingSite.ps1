<#
.SYNOPSIS
    Creates (or updates) the IIS app pool and site for the API Mapping
    Catalogue - a single ASP.NET Core app that serves both the static
    frontend and the /api/* endpoints (see api/Program.cs).

.DESCRIPTION
    Idempotent, like the db/*.sql scripts: safe to re-run. Re-running with a
    different -AppPoolIdentity is how you switch which service account runs
    the app pool (e.g. to roll back from HIVEDOME\HdmngSvc to the
    original HIVEDOME\dev02_itas_svc) - db/002_create_app_login.sql already
    grants both accounts database access, so switching here needs no SQL
    change, just re-run this script with the other -AppPoolIdentity /
    -AppPoolPassword and it updates the existing app pool in place.

    Also opens the chosen -Port inbound in Windows Firewall (skipped if a
    rule with the same name already exists) - without this, the site is only
    reachable from the server itself, not over the network.

    Prerequisites this script does NOT install for you:
      - IIS with the "Web Server (IIS)" role and ASP.NET Core Module V2
        (install the .NET 10 "Hosting Bundle" from
        https://dotnet.microsoft.com/download/dotnet/10.0 - the ASP.NET Core
        Runtime alone is not enough, you need the Hosting Bundle specifically)
      - The published app already sitting at -PhysicalPath (run
        `npm run build:iis` then `dotnet publish api -c Release -o <PhysicalPath>`
        from the repo root first)

.PARAMETER SiteName
    IIS site name. Default: "ITAS API Mapping".

.PARAMETER AppPoolName
    IIS application pool name. Default: "ITAS_API_Mapping".

.PARAMETER PhysicalPath
    Folder containing the published app (dotnet publish output, which
    includes wwwroot with the frontend already copied in). Required.

.PARAMETER Port
    HTTP binding port. Default: 80.

.PARAMETER HostName
    Optional host header (e.g. "itas-api.hivedome.net"). Leave blank to bind
    on the port across all hostnames.

.PARAMETER AppPoolIdentity
    Windows account the app pool runs as. Default: HIVEDOME\HdmngSvc.
    Pass -AppPoolIdentity 'HIVEDOME\dev02_itas_svc' to use the original
    account instead - both already have database access.

.PARAMETER AppPoolPassword
    SecureString password for -AppPoolIdentity. If omitted, you're prompted
    (so it's never sitting in shell history or a saved script parameter).

.EXAMPLE
    .\New-ApiMappingSite.ps1 -PhysicalPath 'C:\inetpub\ITAS-API-Mapping'

.EXAMPLE
    # Roll back to the original service account on an existing site:
    .\New-ApiMappingSite.ps1 -PhysicalPath 'C:\inetpub\ITAS-API-Mapping' `
        -AppPoolIdentity 'HIVEDOME\dev02_itas_svc'
#>

#Requires -RunAsAdministrator

[CmdletBinding()]
param(
    [string]$SiteName = 'ITAS API Mapping',
    [string]$AppPoolName = 'ITAS_API_Mapping',

    [Parameter(Mandatory = $true)]
    [string]$PhysicalPath,

    [int]$Port = 80,
    [string]$HostName = '',

    [string]$AppPoolIdentity = 'HIVEDOME\HdmngSvc',
    [System.Security.SecureString]$AppPoolPassword
)

$ErrorActionPreference = 'Stop'

Import-Module WebAdministration -ErrorAction Stop

# --- Sanity checks -----------------------------------------------------------

if (-not (Test-Path $PhysicalPath)) {
    throw "PhysicalPath '$PhysicalPath' does not exist. Publish the app there first (dotnet publish api -c Release -o `"$PhysicalPath`")."
}

$ancmPresent = Get-WebGlobalModule -Name 'AspNetCoreModuleV2' -ErrorAction SilentlyContinue
if (-not $ancmPresent) {
    throw "ASP.NET Core Module V2 is not registered in IIS. Install the .NET 10 Hosting Bundle " +
          "(https://dotnet.microsoft.com/download/dotnet/10.0), which registers it, then re-run this script."
}

if (-not $AppPoolPassword) {
    $AppPoolPassword = Read-Host -Prompt "Password for $AppPoolIdentity" -AsSecureString
}
$plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($AppPoolPassword)
)

# --- Application pool ---------------------------------------------------------

if (Test-Path "IIS:\AppPools\$AppPoolName") {
    Write-Host "App pool '$AppPoolName' already exists - updating it." -ForegroundColor Yellow
} else {
    Write-Host "Creating app pool '$AppPoolName'..." -ForegroundColor Cyan
    New-WebAppPool -Name $AppPoolName | Out-Null
}

# "No Managed Code" - ASP.NET Core doesn't run in the IIS-hosted CLR like
# classic ASP.NET did; the CLR version setting is irrelevant to it.
Set-ItemProperty "IIS:\AppPools\$AppPoolName" -Name managedRuntimeVersion -Value ''
Set-ItemProperty "IIS:\AppPools\$AppPoolName" -Name startMode -Value 'AlwaysRunning'

Set-ItemProperty "IIS:\AppPools\$AppPoolName" -Name processModel.identityType -Value 3 # SpecificUser
Set-ItemProperty "IIS:\AppPools\$AppPoolName" -Name processModel.userName -Value $AppPoolIdentity
Set-ItemProperty "IIS:\AppPools\$AppPoolName" -Name processModel.password -Value $plainPassword

# A custom-identity app pool (unlike the built-in ApplicationPoolIdentity
# virtual account) isn't automatically in IIS_IUSRS - add it so it gets the
# usual IIS runtime permissions.
try {
    Add-LocalGroupMember -Group 'IIS_IUSRS' -Member $AppPoolIdentity -ErrorAction Stop
    Write-Host "Added $AppPoolIdentity to local group IIS_IUSRS." -ForegroundColor Cyan
} catch [Microsoft.PowerShell.Commands.MemberExistsException] {
    Write-Host "$AppPoolIdentity is already in IIS_IUSRS." -ForegroundColor DarkGray
}

# --- Site + NTFS permissions --------------------------------------------------

$bindingInfo = if ($HostName) { "*:${Port}:${HostName}" } else { "*:${Port}:" }

if (Test-Path "IIS:\Sites\$SiteName") {
    Write-Host "Site '$SiteName' already exists - updating physical path, binding and app pool." -ForegroundColor Yellow
    Set-ItemProperty "IIS:\Sites\$SiteName" -Name physicalPath -Value $PhysicalPath
    Set-ItemProperty "IIS:\Sites\$SiteName" -Name applicationPool -Value $AppPoolName
    Clear-ItemProperty "IIS:\Sites\$SiteName" -Name bindings
    New-ItemProperty "IIS:\Sites\$SiteName" -Name bindings -Value @{ protocol = 'http'; bindingInformation = $bindingInfo } | Out-Null
} else {
    Write-Host "Creating site '$SiteName'..." -ForegroundColor Cyan
    New-Website -Name $SiteName -PhysicalPath $PhysicalPath -ApplicationPool $AppPoolName `
        -Port $Port -HostHeader $HostName | Out-Null
}

# Grant the app pool identity read/execute on the published app so it can
# actually serve the static files and load the .NET assemblies.
icacls $PhysicalPath /grant "${AppPoolIdentity}:(OI)(CI)RX" /T | Out-Null

# --- Firewall ------------------------------------------------------------------

$firewallRuleName = "$SiteName (HTTP $Port)"
if (Get-NetFirewallRule -DisplayName $firewallRuleName -ErrorAction SilentlyContinue) {
    Write-Host "Firewall rule '$firewallRuleName' already exists." -ForegroundColor DarkGray
} else {
    New-NetFirewallRule -DisplayName $firewallRuleName -Direction Inbound -Protocol TCP -LocalPort $Port -Action Allow | Out-Null
    Write-Host "Opened inbound TCP port $Port in Windows Firewall." -ForegroundColor Cyan
}

Write-Host ""
Write-Host "Done. Site: http://$(if ($HostName) { $HostName } else { 'localhost' }):$Port/" -ForegroundColor Green
Write-Host "App pool '$AppPoolName' running as $AppPoolIdentity." -ForegroundColor Green
Write-Host "If this is a repeat run switching identities, remember the *previous* account's" -ForegroundColor DarkGray
Write-Host "database grant is untouched (db/002_create_app_login.sql already covers both)." -ForegroundColor DarkGray
