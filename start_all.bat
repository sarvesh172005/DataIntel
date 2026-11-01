@echo off
echo ====================================================
echo Starting DataIntel Full-Stack Services...
echo ====================================================

start "DataIntel - AI Service (Port 8001)" cmd /k "cd ai_service && set PYTHONIOENCODING=utf-8 && venv\Scripts\python.exe -m uvicorn app:app --port 8001"
start "DataIntel - Backend API (Port 5000)" cmd /k "cd backend && node server.js"
start "DataIntel - Frontend UI (Port 5173)" cmd /k "cd frontend && npm.cmd run dev"

echo All services launched in separate windows!
echo - Frontend:   http://localhost:5173
echo - Backend:    http://localhost:5000
echo - AI Service: http://localhost:8001
pause

