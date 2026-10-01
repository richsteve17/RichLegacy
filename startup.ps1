# Drum Pad Learning App - Windows PowerShell Dev Launcher
# Starts FastAPI backend (port 8000) and Vite frontend (port 5173).

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackendDir = Join-Path $ScriptDir "backend"
$FrontendDir = Join-Path $ScriptDir "frontend"
$VenvPython = Join-Path $BackendDir ".venv\Scripts\python.exe"

Write-Host "Starting Drum Pad Learning App..." -ForegroundColor Cyan

# Check backend venv
if (-not (Test-Path $VenvPython)) {
    Write-Host "Virtual environment not found. Setting up backend..." -ForegroundColor Yellow
    python -m venv (Join-Path $BackendDir ".venv")
    & $VenvPython -m pip install -r (Join-Path $BackendDir "requirements.txt")
}

# Check frontend node_modules
if (-not (Test-Path (Join-Path $FrontendDir "node_modules"))) {
    Write-Host "node_modules not found. Installing frontend dependencies..." -ForegroundColor Yellow
    Push-Location $FrontendDir
    npm install
    Pop-Location
}

# Start backend in a new process / job
Write-Host "Starting backend on http://localhost:8000..." -ForegroundColor Green
$backendProc = Start-Process -FilePath $VenvPython -ArgumentList "-m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000" -WorkingDirectory $BackendDir -PassThru

# Start frontend
Write-Host "Starting frontend on http://localhost:5173..." -ForegroundColor Green
$frontendProc = Start-Process -FilePath "npm.cmd" -ArgumentList "run dev -- --host" -WorkingDirectory $FrontendDir -PassThru

Write-Host @"

Drum Pad Trainer is running:
  - Frontend: http://localhost:5173
  - Backend:  http://localhost:8000 (docs: http://localhost:8000/docs)

Press Enter to stop both servers...
"@ -ForegroundColor Cyan

Read-Host
Write-Host "Stopping servers..." -ForegroundColor Yellow
Stop-Process -Id $backendProc.Id -Force -ErrorAction SilentlyContinue
Stop-Process -Id $frontendProc.Id -Force -ErrorAction SilentlyContinue
Write-Host "Done." -ForegroundColor Green
