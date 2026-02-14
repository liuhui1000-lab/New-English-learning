
$maxRetries = 3
$retryCount = 0
$success = $false

while (-not $success -and $retryCount -lt $maxRetries) {
    try {
        Write-Host "Attempting git push (Attempt $($retryCount + 1))..."
        git push origin test
        if ($LASTEXITCODE -eq 0) {
            Write-Host "Git push passed!" -ForegroundColor Green
            $success = $true
        } else {
            throw "Git push exited with code $LASTEXITCODE"
        }
    } catch {
        Write-Host "Git push failed: $_" -ForegroundColor Red
        $retryCount++
        if ($retryCount -lt $maxRetries) {
            Write-Host "Retrying in 5 seconds..."
            Start-Sleep -Seconds 5
        } else {
            Write-Host "Max retries reached. Push failed." -ForegroundColor Red
            exit 1
        }
    }
}
