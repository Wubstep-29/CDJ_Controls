# Usage: .\yt-to-catbox.ps1 "https://youtu.be/..."  [-UserHash xxxx] [-Keep]
param(
    [Parameter(Mandatory=$true, Position=0)]
    [string]$Url,
    [string]$UserHash = "",
    [switch]$Keep
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $PSCommandPath
$ytdlp     = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($scriptDir, "..", "yt-dlp.exe"))

if (-not (Test-Path -LiteralPath $ytdlp)) {
    Write-Host "ERROR: yt-dlp.exe not found at $ytdlp" -ForegroundColor Red
    exit 1
}

$tempDir = [System.IO.Path]::Combine($env:TEMP, "yt2catbox_" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $tempDir -Force | Out-Null

try {
    Write-Host "-> Downloading best audio..." -ForegroundColor Cyan
    $outTmpl = Join-Path $tempDir "%(title).150s.%(ext)s"

    $filePath = & $ytdlp `
        -f "bestaudio[ext=m4a]/bestaudio" `
        --no-playlist `
        --restrict-filenames `
        --no-warnings `
        --quiet `
        --print "after_move:filepath" `
        -o $outTmpl `
        $Url

    if ($LASTEXITCODE -ne 0 -or -not $filePath -or -not (Test-Path -LiteralPath $filePath)) {
        throw "yt-dlp failed (exit $LASTEXITCODE). Track may be age-gated, region-locked, or private."
    }

    $fileName = [System.IO.Path]::GetFileName($filePath)
    $sizeMB   = [math]::Round((Get-Item -LiteralPath $filePath).Length / 1MB, 2)

    if ($sizeMB -gt 200) {
        throw "File is $sizeMB MB - Catbox limit is 200 MB. Consider splitting the track."
    }
    Write-Host "   Got: $fileName ($sizeMB MB)" -ForegroundColor DarkGray

    Write-Host "-> Uploading to Catbox..." -ForegroundColor Cyan

    $tempOut = Join-Path $tempDir "response.txt"
    $curlArgs = @(
        "-s", "--show-error",
        "-w", "`n%{http_code}",
        "-F", "reqtype=fileupload",
        "-F", "fileToUpload=@`"$filePath`"",
        "-o", $tempOut,
        "--max-time", "120"
    )
    if ($UserHash) { $curlArgs += @("-F", "userhash=$UserHash") }
    $curlArgs += "https://catbox.moe/user/api.php"

    $httpCode = (& curl.exe @curlArgs) -join ""
    $response = if (Test-Path -LiteralPath $tempOut) { (Get-Content -LiteralPath $tempOut -Raw).Trim() } else { "" }

    if ($LASTEXITCODE -ne 0 -or $httpCode -notmatch '200' -or $response -notmatch '^https?://') {
        throw "Catbox upload failed (HTTP $httpCode / curl exit $LASTEXITCODE): $response"
    }

    $catboxUrl = $response.Trim()
    Write-Host ""
    Write-Host "[OK] Paste this into the DJ deck:" -ForegroundColor Green
    Write-Host "     $catboxUrl" -ForegroundColor White
    Write-Host ""

    try {
        Set-Clipboard -Value $catboxUrl
        Write-Host "     (copied to clipboard)" -ForegroundColor DarkGray
    } catch {}
}
finally {
    if (-not $Keep) {
        Remove-Item -LiteralPath $tempDir -Recurse -Force -ErrorAction SilentlyContinue
    } else {
        Write-Host "   Downloaded file kept at: $tempDir" -ForegroundColor DarkGray
    }
}
