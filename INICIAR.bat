@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"
set HARDHAT_DISABLE_TELEMETRY_PROMPT=true

if /I "%~1"=="__hardhat" goto :run_hardhat
if /I "%~1"=="__frontend" goto :run_frontend

if not exist logs mkdir logs

echo ==========================================================
echo  RASTREABILIDADE FARMACEUTICA - CAMPINA GRANDE/PB
echo  Hardhat local + DApp + testes automatizados
echo ==========================================================

echo [1/8] Verificando Node.js e npm...
where node >nul 2>nul || (
  echo ERRO: Node.js nao encontrado. Instale o Node.js antes de continuar.
  pause
  exit /b 1
)
where npm >nul 2>nul || (
  echo ERRO: npm nao encontrado.
  pause
  exit /b 1
)
for /f "delims=" %%i in ('node -v') do set NODE_VERSION=%%i
for /f "delims=" %%i in ('npm -v') do set NPM_VERSION=%%i
echo Node: !NODE_VERSION! ^| npm: !NPM_VERSION!

echo [2/8] Verificando dependencias...
if not exist node_modules (
  call npm install || goto :erro
) else (
  echo node_modules encontrado; mantendo dependencias instaladas.
)

echo [3/8] Compilando contrato V2...
call npm run compile || goto :erro

echo [4/8] Executando testes automatizados de TODAS as abas...
call npm run test:all > logs\tests.log 2>&1
if errorlevel 1 (
  type logs\tests.log
  goto :erro
)
type logs\tests.log
echo Testes automatizados: OK

echo [5/8] Preparando blockchain Hardhat local...
call :hardhat_online
if "!HH_ONLINE!"=="1" goto :hardhat_pronto

echo Iniciando Hardhat em uma nova janela...
start "Hardhat Local - Rastreabilidade" /min cmd /c call "%~f0" __hardhat
for /L %%I in (1,1,60) do (
  timeout /t 1 /nobreak >nul
  call :hardhat_online
  if "!HH_ONLINE!"=="1" goto :hardhat_pronto
)
echo ERRO: Hardhat nao respondeu. Veja logs\hardhat.log
goto :erro

:hardhat_pronto
if "!HH_ONLINE!"=="1" echo Hardhat pronto em 127.0.0.1:8545.

echo [6/8] Verificando deploy e dados de demonstracao...
call :contract_exists
if "!CONTRACT_OK!"=="1" (
  echo Contrato existente detectado. Estado atual PRESERVADO.
) else (
  echo Nenhum contrato valido neste estado. Fazendo deploy + seed regional...
  call npm run deploy || goto :erro
  call npm run seed || goto :erro
)

echo [7/8] Iniciando interface web...
call :frontend_online
if "!FRONT_ONLINE!"=="1" goto :frontend_pronto

start "DApp - Rastreabilidade" /min cmd /c call "%~f0" __frontend
for /L %%I in (1,1,45) do (
  timeout /t 1 /nobreak >nul
  call :frontend_online
  if "!FRONT_ONLINE!"=="1" goto :frontend_pronto
)
echo ERRO: Frontend nao respondeu. Veja logs\frontend.log
goto :erro

:frontend_pronto
echo Frontend pronto em 127.0.0.1:5173.

echo [8/8] Abrindo navegador...
start "" http://127.0.0.1:5173

echo.
echo ==========================================================
echo  AMBIENTE PRONTO
echo ==========================================================
echo DApp:       http://127.0.0.1:5173
echo Hardhat:    http://127.0.0.1:8545
echo Chain ID:   31337
echo Testes:     logs\tests.log
echo.
echo Leia SEQUENCIA-DE-TESTES.md para o roteiro completo.
echo As janelas do Hardhat e da DApp podem ficar minimizadas.
echo ==========================================================
pause
exit /b 0

:hardhat_online
set HH_ONLINE=0
node -e "fetch('http://127.0.0.1:8545',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',method:'eth_chainId',params:[],id:1})}).then(r=>r.json()).then(j=>process.exit(j.result==='0x7a69'?0:1)).catch(()=>process.exit(1))" >nul 2>nul
if not errorlevel 1 set HH_ONLINE=1
exit /b 0

:frontend_online
set FRONT_ONLINE=0
node -e "fetch('http://127.0.0.1:5173').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >nul 2>nul
if not errorlevel 1 set FRONT_ONLINE=1
exit /b 0

:contract_exists
set CONTRACT_OK=0
if not exist deployment.json exit /b 0
node -e "const fs=require('fs');let d;try{d=JSON.parse(fs.readFileSync('deployment.json','utf8'))}catch(e){process.exit(1)};if(!d.address)process.exit(1);fetch('http://127.0.0.1:8545',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',method:'eth_getCode',params:[d.address,'latest'],id:1})}).then(r=>r.json()).then(j=>process.exit(j.result&&j.result!=='0x'?0:1)).catch(()=>process.exit(1))" >nul 2>nul
if not errorlevel 1 set CONTRACT_OK=1
exit /b 0

:run_hardhat
cd /d "%~dp0"
set HARDHAT_DISABLE_TELEMETRY_PROMPT=true
if not exist logs mkdir logs
call npm run node > logs\hardhat.log 2>&1
exit /b %errorlevel%

:run_frontend
cd /d "%~dp0"
if not exist logs mkdir logs
call npm run dev > logs\frontend.log 2>&1
exit /b %errorlevel%

:erro
echo.
echo ==========================================================
echo  ERRO AO INICIAR O AMBIENTE
echo ==========================================================
echo Consulte a mensagem acima e a pasta logs\.
pause
exit /b 1
