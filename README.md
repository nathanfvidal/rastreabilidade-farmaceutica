# Rastreabilidade Farmacêutica V2 — Como iniciar

Projeto acadêmico com **Hardhat local + Solidity + MetaMask + interface web**.

> Os nomes de empresas e pessoas do ambiente de demonstração são fictícios e usados somente para fins acadêmicos.

## macOS

Dê dois cliques em:

```text
INICIAR.command
```

Se o macOS bloquear o arquivo, abra o Terminal dentro da pasta e execute:

```bash
chmod +x INICIAR.command
xattr -d com.apple.quarantine INICIAR.command 2>/dev/null || true
./INICIAR.command
```

## Windows

Dê dois cliques em:

```text
INICIAR.bat
```

## O que o inicializador faz

Os dois atalhos executam automaticamente:

1. verificam Node.js e npm;
2. instalam dependências se necessário;
3. compilam o contrato V2;
4. executam os testes automatizados;
5. iniciam ou reutilizam o Hardhat em `127.0.0.1:8545`;
6. fazem deploy + seed quando ainda não existe contrato válido;
7. iniciam a interface em `127.0.0.1:5173`;
8. abrem a DApp no navegador.

## Endereços locais

```text
DApp:     http://127.0.0.1:5173
Hardhat:  http://127.0.0.1:8545
Chain ID: 31337
```

## Testes automatizados

Eles já são executados pelo inicializador. Para rodar manualmente:

```bash
npm run test:all
```

O resultado também fica em:

```text
logs/tests.log
```

## Contas Hardhat usadas no cenário

| Conta | Papel | Identidade / organização fictícia |
|---|---|---|
| #0 | Regulador | Helena Moura — Autoridade Sanitária da Borborema |
| #1 | Fabricante | Camila Nunes — Laboratório Borborema Saúde |
| #2 | Distribuidor | Rafael Diniz — Distribuidora Campina Farma |
| #3 | Farmácia | Juliana Alves — Farmácia Açude Velho |
| #4 | Transportador | Marcos Vinicius Lima — TransBorborema Logística |
| #5 | Distribuidor | André Souza — Distribuidora Sertão Farma — Patos/PB |
| #6 | Farmácia | Larissa Medeiros — Farmácia Serra Saúde — Queimadas/PB |
| #7 | Farmácia | Beatriz Monteiro — Farmácia Brejo Saúde — Esperança/PB |
| #8 | Transportador | Diego Ferreira — Rota Cariri Logística — Boqueirão/PB |
| #9 | Reserva | Conta livre para testes de novo operador |

Para o roteiro completo de apresentação e testes manuais, abra:

```text
SEQUENCIA-DE-TESTES.md
```

## Importante sobre o estado local

O estado manual da blockchain existe enquanto o processo do Hardhat estiver vivo. Se o inicializador encontrar um Hardhat já aberto, ele o reutiliza e preserva lotes e transferências existentes. Se o Hardhat for encerrado e iniciado novamente, uma nova blockchain local é criada e o seed reconstrói apenas o cenário inicial.
# rastreabilidade-farmaceutica
