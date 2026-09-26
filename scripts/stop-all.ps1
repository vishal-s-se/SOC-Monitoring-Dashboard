# Stop All SOC Monitor Services
$ports = @(3000, 5000, 8000)

foreach ($port in $ports) {
    $connections = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    if ($connections) {
        $pids = $connections | Select-Object -ExpandProperty OwningProcess -Unique
        foreach ($procId in $pids) {
            try {
                Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
                Write-Host "Stopped process $procId running on port $port" -ForegroundColor Green
            } catch {
                Write-Warning "Could not stop process $procId on port $port: $_"
            }
        }
    } else {
        Write-Host "No service running on port $port" -ForegroundColor Gray
    }
}
Write-Host "All SOC Monitor services stopped." -ForegroundColor Cyan
