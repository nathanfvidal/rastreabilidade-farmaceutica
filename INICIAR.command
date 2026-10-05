#!/bin/bash
set -eEuo pipefail

export HARDHAT_DISABLE_TELEMETRY_PROMPT=true
ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

LOG_DIR="$ROOT_DIR/logs"
mkdir -p "$LOG_DIR"
HARDHAT_PID=""
VITE_PID=""
STARTED_HARDHAT=0
STARTED_VITE=0

cleanup() {
  echo ""
  echo "Encerrando processos iniciados por esta janela..."
  if [[ "$STARTED_VITE" == "1" && -n "${VITE_PID:-}" ]] && kill -0 "$VITE_PID" 2>/dev/null; then
    kill "$VITE_PID" 2>/dev/null || true
  fi
  if [[ "$STARTED_HARDHAT" == "1" && -n "${HARDHAT_PID:-}" ]] && kill -0 "$HARDHAT_PID" 2>/dev/null; then
    kill "$HARDHAT_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

on_error() {
  STATUS=$?
  echo ""
  echo "=================================================="
  echo " ERRO AO INICIAR O AMBIENTE (codigo $STATUS)"
  echo "=================================================="
  echo "Consulte a mensagem acima e os arquivos em logs/."
  echo "Pressione ENTER para fechar."
  read -r || true
  exit "$STATUS"
}
trap on_error ERR

rpc_call() {
  local method="$1"
  local params="${2:-[]}" 
  curl -sS --max-time 2 -X POST http://127.0.0.1:8545 \
    -H 'Content-Type: application/json' \
    --data "{\"jsonrpc\":\"2.0\",\"method\":\"$method\",\"params\":$params,\"id\":1}"
}

hardhat_online() {
  rpc_call eth_chainId '[]' 2>/dev/null | grep -q '0x7a69'
}

frontend_online() {
  curl -sS --max-time 2 http://127.0.0.1:5173 >/dev/null 2>&1
}

contract_exists() {
  [[ -f deployment.json ]] || return 1
  local address
  address=$(node -e 'try{console.log(require("./deployment.json").address||"")}catch(e){}')
  [[ -n "$address" ]] || return 1
  local response
  response=$(rpc_call eth_getCode "[\"$address\",\"latest\"]" 2>/dev/null || true)
  [[ "$response" != *'"result":"0x"'* && "$response" == *'"result":"0x'* ]]
}

echo "=========================================================="
echo " RASTREABILIDADE FARMACEUTICA - CAMPINA GRANDE/PB"
echo " Hardhat local + DApp + testes automatizados"
echo "=========================================================="

echo "[1/8] Verificando Node.js e npm..."
command -v node >/dev/null 2>&1 || { echo "ERRO: Node.js nao encontrado."; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "ERRO: npm nao encontrado."; exit 1; }
echo "Node: $(node -v) | npm: $(npm -v)"
NODE_MAJOR=$(node -p "Number(process.versions.node.split('.')[0])")
if [[ "$NODE_MAJOR" -gt 24 ]]; then
  echo "AVISO: Node $(node -v) e mais novo que o recomendado para Hardhat 2. Se houver incompatibilidade, use Node 22 LTS."
fi

echo "[2/8] Verificando dependencias..."
if [[ ! -d node_modules ]]; then
  npm install
else
  echo "node_modules encontrado; mantendo dependencias instaladas."
fi

echo "[3/8] Compilando contrato V2..."
npm run compile

echo "[4/8] Executando testes automatizados de TODAS as abas..."
: > "$LOG_DIR/tests.log"
npm run test:all 2>&1 | tee "$LOG_DIR/tests.log"
echo "Testes automatizados: OK"

echo "[5/8] Preparando blockchain Hardhat local..."
if hardhat_online; then
  echo "Hardhat ja esta rodando em 127.0.0.1:8545. Vou reutiliza-lo para NAO apagar o estado atual."
else
  : > "$LOG_DIR/hardhat.log"
  npm run node > "$LOG_DIR/hardhat.log" 2>&1 &
  HARDHAT_PID=$!
  STARTED_HARDHAT=1
  RPC_OK=0
  for _ in {1..80}; do
    if hardhat_online; then RPC_OK=1; break; fi
    if ! kill -0 "$HARDHAT_PID" 2>/dev/null; then
      echo "ERRO: Hardhat encerrou durante a inicializacao. Veja logs/hardhat.log"
      exit 1
    fi
    sleep 0.5
  done
  [[ "$RPC_OK" == "1" ]] || { echo "ERRO: Hardhat nao respondeu."; exit 1; }
fi

echo "[6/8] Verificando deploy e dados de demonstracao..."
if contract_exists; then
  echo "Contrato existente detectado. Estado atual PRESERVADO; deploy/seed nao serao repetidos."
else
  echo "Nenhum contrato valido neste estado. Fazendo deploy + seed regional..."
  npm run deploy
  npm run seed
fi

echo "[7/8] Iniciando interface web..."
if frontend_online; then
  echo "Frontend ja esta rodando em 127.0.0.1:5173; reutilizando."
else
  : > "$LOG_DIR/frontend.log"
  npm run dev > "$LOG_DIR/frontend.log" 2>&1 &
  VITE_PID=$!
  STARTED_VITE=1
  FRONT_OK=0
  for _ in {1..60}; do
    if frontend_online; then FRONT_OK=1; break; fi
    if ! kill -0 "$VITE_PID" 2>/dev/null; then
      echo "ERRO: Frontend encerrou. Veja logs/frontend.log"
      exit 1
    fi
    sleep 0.5
  done
  [[ "$FRONT_OK" == "1" ]] || { echo "ERRO: Frontend nao respondeu."; exit 1; }
fi

echo "[8/8] Abrindo navegador..."
if command -v open >/dev/null 2>&1; then
  open "http://127.0.0.1:5173" >/dev/null 2>&1 || true
fi

echo ""
echo "=========================================================="
echo " AMBIENTE PRONTO"
echo "=========================================================="
echo "DApp:       http://127.0.0.1:5173"
echo "Hardhat:    http://127.0.0.1:8545"
echo "Chain ID:   31337"
echo "Testes:     logs/tests.log"
echo ""
echo "Contas principais do seed:"
echo "  #0 Regulador"
echo "  #1 Fabricante - Laboratorio Borborema Saude"
echo "  #2 Distribuidor - Distribuidora Campina Farma"
echo "  #3 Farmacia - Farmacia Acude Velho"
echo "  #4 Transportador - TransBorborema Logistica"
echo "  #5 Distribuidor - Distribuidora Sertao Farma (Patos)"
echo "  #6 Farmacia - Farmacia Serra Saude (Queimadas)"
echo "  #7 Farmacia - Farmacia Brejo Saude (Esperanca)"
echo "  #8 Transportador - Rota Cariri Logistica (Boqueirao)"
echo "  #9 Reserva para testes de novos operadores"
echo ""
echo "IMPORTANTE: o estado manual existe enquanto o processo Hardhat que o criou estiver vivo."
echo "Se este script encontrar um Hardhat ja rodando, ele o reutiliza e preserva os dados."
echo ""
echo "Deixe esta janela aberta durante a apresentacao. Ctrl+C encerra os processos iniciados por ela."
echo "=========================================================="

while true; do
  if [[ "$STARTED_HARDHAT" == "1" ]] && ! kill -0 "$HARDHAT_PID" 2>/dev/null; then
    echo "Hardhat foi encerrado inesperadamente. Veja logs/hardhat.log"
    exit 1
  fi
  if [[ "$STARTED_VITE" == "1" ]] && ! kill -0 "$VITE_PID" 2>/dev/null; then
    echo "Frontend foi encerrado inesperadamente. Veja logs/frontend.log"
    exit 1
  fi
  sleep 2
done
