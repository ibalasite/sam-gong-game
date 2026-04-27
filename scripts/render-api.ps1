# Render API helper — Just-In-Time secret retrieval from Windows Credential Manager.
# Key is never written to $env:, files, or logs. Read on-demand, cleared after use.
#
# One-time setup:
#   Install-Module CredentialManager -Scope CurrentUser
#   New-StoredCredential -Target RENDER_API_KEY -UserName render `
#       -Password 'rnd_xxxxx' -Persist LocalMachine
#
# Usage:
#   . .\scripts\render-api.ps1
#   Invoke-Render -Method GET -Path '/services'
#   Invoke-Render -Method POST -Path '/services' -Body @{ name = 'sam-gong' }

function Invoke-Render {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)] [string] $Path,
        [string] $Method = 'GET',
        [object] $Body = $null
    )

    $cred = Get-StoredCredential -Target 'RENDER_API_KEY' -ErrorAction Stop
    if (-not $cred) { throw "RENDER_API_KEY not found in Credential Manager." }

    $key = $cred.GetNetworkCredential().Password
    try {
        $headers = @{
            Authorization = "Bearer $key"
            Accept        = 'application/json'
        }
        $uri = "https://api.render.com/v1$Path"
        if ($Body) {
            Invoke-RestMethod -Uri $uri -Method $Method -Headers $headers `
                -ContentType 'application/json' `
                -Body ($Body | ConvertTo-Json -Depth 10 -Compress)
        } else {
            Invoke-RestMethod -Uri $uri -Method $Method -Headers $headers
        }
    }
    finally {
        Remove-Variable key -ErrorAction SilentlyContinue
        Remove-Variable cred -ErrorAction SilentlyContinue
        [System.GC]::Collect()
    }
}
