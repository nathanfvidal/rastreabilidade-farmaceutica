# Sequência completa de testes e apresentação

Este roteiro usa as contas do Hardhat importadas na MetaMask. Troque a conta pelo botão **Trocar carteira** da DApp ou diretamente na MetaMask.

> Todas as organizações e pessoas abaixo são fictícias e existem apenas para a demonstração acadêmica.

## 0. Preparação das contas na MetaMask

Renomeie as contas para facilitar a apresentação:

| Conta Hardhat | Nome recomendado na MetaMask | Papel |
|---|---|---|
| #0 | `01 - Regulador` | Regulador |
| #1 | `02 - Fabricante` | Fabricante |
| #2 | `03 - Distribuidor Campina` | Distribuidor |
| #3 | `04 - Farmácia Açude Velho` | Dispensador |
| #4 | `05 - Transportadora Campina` | Transportador |
| #5 | `06 - Distribuidor Patos` | Distribuidor |
| #6 | `07 - Farmácia Queimadas` | Dispensador |
| #7 | `08 - Farmácia Esperança` | Dispensador |
| #8 | `09 - Transportadora Boqueirão` | Transportador |
| #9 | `10 - Reserva` | Sem operador inicialmente |

O seed já cria duas amostras:

```text
LOTE-CG-DIP-001 — Dipirona Sódica 500 mg — 5000 unidades
LOTE-CG-PAR-002 — Paracetamol 750 mg — 2500 unidades
```

---

# CENÁRIO 1 — Administração

## 1. Dashboard

**Carteira:** #0 — Regulador

1. Abra a aba **Dashboard**.
2. Confirme que aparecem organizações, operadores, lotes e registros de auditoria.
3. Confirme que o sistema está `Ativo`.

**Objetivo demonstrado:** leitura do estado do contrato sem alterar a blockchain.

---

## 2. Criar uma nova organização

**Carteira:** #0 — Regulador

Aba **Organizações** → cadastrar organização.

Use:

```text
ID: FARM-CG-TESTE-010
Nome: Farmácia Parque do Povo - Campina Grande/PB
Papel: Dispensador
Documento/hash: DOC-FARM-CG-TESTE-010
```

Depois:

1. confirme a transação na MetaMask;
2. consulte a organização criada;
3. desative com um motivo;
4. reative novamente.

**Resultado esperado:** o histórico administrativo deve mostrar quem criou e quem alterou o status.

---

## 3. Criar um novo operador para a organização

**Carteira:** #0 — Regulador

Aba **Operadores**.

Use a **Conta Hardhat #9** como carteira do novo operador:

```text
ID: OP-FARM-CG-TESTE-010
Nome: Paulo Henrique Costa
Cargo: Farmacêutico Responsável
Organização: FARM-CG-TESTE-010
Carteira: endereço da conta #9
Administrador: sim
```

Depois:

1. consulte o operador;
2. desative;
3. reative.

**Resultado esperado:** o operador deve ficar vinculado à organização criada e todas as alterações devem indicar o Regulador responsável.

---

# CENÁRIO 2 — Cadeia principal do medicamento

## 4. Registrar um novo lote

**Carteira:** #1 — Fabricante

Aba **Lotes e Custódia** → registrar lote.

Use:

```text
Identificador: LOTE-APRESENTACAO-001
Código: AMOX-500
Descrição: Amoxicilina 500 mg - lote de apresentação
Quantidade inicial: 1000
Laudo/hash: LAUDO-AMOX-APRESENTACAO-001
Metadados/hash: META-AMOX-APRESENTACAO-001
Localização: Unidade de Produção - Distrito Industrial de Campina Grande/PB
Observação: Lote criado durante a demonstração acadêmica
```

Data de fabricação: hoje ou ontem.

Data de validade: uma data futura.

Depois consulte o lote.

**Resultado esperado:**

```text
Criado por: Camila Nunes
Operador: OP-FAB-CG-001
Organização: Laboratório Borborema Saúde
Saldo do fabricante: 1000
Status: Ativo
```

---

## 5. Criar transferência Fabricante → Distribuidor com transportadora

**Carteira:** #1 — Fabricante

Aba **Transferências** → criar transferência.

Selecione:

```text
Lote: LOTE-APRESENTACAO-001
Destino: DIST-CG-001 — Distribuidora Campina Farma
Quantidade: 600
Tipo: Comercial
Transportadora: TRANS-CG-001 — TransBorborema Logística
Local de origem: Doca de expedição - Distrito Industrial de Campina Grande/PB
Documento/hash: NF-AMOX-001
Observação: Envio para centro de distribuição de Campina Grande
```

Confirme na MetaMask.

**Resultado esperado:**

- transferência criada;
- 600 unidades ficam reservadas no fabricante;
- a transferência fica aguardando coleta da transportadora.

---

## 6. Coleta pela transportadora

**Carteira:** #4 — Transportador Campina

Aba **Transporte**.

Selecione a transferência recém-criada e confirme a coleta.

```text
Local: Distrito Industrial - Campina Grande/PB
Documento/hash: COLETA-AMOX-001
Observação: Carga coletada e lacrada
```

**Resultado esperado:** status `Em trânsito` e Marcos Vinicius Lima registrado como responsável pela coleta.

---

## 7. Registrar checkpoint de transporte

**Carteira:** #4 — Transportador Campina

Na mesma aba **Transporte**, registre uma atualização/checkpoint:

```text
Local: Centro Logístico - Campina Grande/PB
Documento/hash: CHECKPOINT-AMOX-001
Observação: Temperatura e lacre conferidos
```

**Resultado esperado:** novo registro de auditoria vinculado ao transportador.

---

## 8. Confirmar entrega da transportadora

**Carteira:** #4 — Transportador Campina

Selecione a mesma transferência e confirme a entrega:

```text
Local: Centro de Distribuição Campina Farma - Campina Grande/PB
Documento/hash: ENTREGA-AMOX-001
Observação: Mercadoria entregue ao centro de distribuição
```

**Resultado esperado:** transferência passa para `Aguardando recebimento`.

---

## 9. Distribuidor confirma recebimento

**Carteira:** #2 — Distribuidor Campina

Aba **Transferências** → confirmar recebimento.

```text
Local: Centro de Distribuição Campina Farma - Campina Grande/PB
Documento/hash: RECEBIMENTO-DIST-AMOX-001
Observação: Quantidade, lote e embalagem conferidos
```

**Resultado esperado:**

```text
Fabricante: 400 unidades
Distribuidor Campina: 600 unidades
Transferência: Confirmada
```

Volte em **Lotes e Custódia** e confira a cadeia de custódia. Devem aparecer Camila, Marcos e Rafael no histórico do lote.

---

## 10. Distribuidor transfere para a Farmácia Açude Velho

**Carteira:** #2 — Distribuidor Campina

Aba **Transferências**.

Crie uma nova transferência:

```text
Lote: LOTE-APRESENTACAO-001
Destino: FARM-CG-001 — Farmácia Açude Velho
Quantidade: 200
Tipo: Comercial
Transportadora: Sem transportadora
Local de origem: Centro de Distribuição Campina Farma
Documento/hash: NF-DIST-FARM-AMOX-001
Observação: Reposição de estoque da farmácia
```

Depois, ainda com a conta #2, confirme **Expedição sem transportadora**.

**Resultado esperado:** transferência fica `Em trânsito`/pronta para recebimento conforme o fluxo do contrato.

---

## 11. Farmácia confirma recebimento

**Carteira:** #3 — Farmácia Açude Velho

Aba **Transferências** → confirmar recebimento.

```text
Local: Farmácia Açude Velho - Campina Grande/PB
Documento/hash: RECEBIMENTO-FARM-AMOX-001
Observação: Recebimento conferido pelo farmacêutico responsável
```

**Resultado esperado:**

```text
Fabricante: 400
Distribuidor Campina: 400
Farmácia Açude Velho: 200
```

---

## 12. Dispensação ao paciente

**Carteira:** #3 — Farmácia Açude Velho

Aba **Rastreabilidade** → dispensar.

```text
Lote: LOTE-APRESENTACAO-001
Quantidade: 20
Local: Farmácia Açude Velho - Campina Grande/PB
Documento/hash: DISPENSACAO-AMOX-001
Observação: Dispensação registrada na demonstração
```

**Resultado esperado:**

```text
Saldo da farmácia: 180
Quantidade dispensada do lote: +20
Quantidade em circulação: -20
```

---

# CENÁRIO 3 — Ocorrências, bloqueio e recall

## 13. Registrar ocorrência

**Carteira:** #3 — Farmácia Açude Velho

Aba **Rastreabilidade** → ocorrência.

```text
Lote: LOTE-APRESENTACAO-001
Local: Farmácia Açude Velho - Campina Grande/PB
Documento/hash: OCORRENCIA-AMOX-001
Observação: Embalagem de uma unidade apresentou avaria visual
```

**Resultado esperado:** ocorrência registrada com Juliana Alves como responsável.

---

## 14. Bloquear o lote

**Carteira:** #0 — Regulador

Aba **Rastreabilidade** → bloquear lote.

```text
Lote: LOTE-APRESENTACAO-001
Motivo: Investigação de ocorrência reportada na cadeia
Documento/hash: BLOQUEIO-AMOX-001
Observação: Bloqueio preventivo para auditoria
```

**Resultado esperado:** status do lote `Bloqueado`.

Tente criar uma transferência comercial com o lote bloqueado. A interface deve impedir ou o contrato deve rejeitar mostrando o motivo real.

---

## 15. Desbloquear o lote

**Carteira:** #0 — Regulador

Depois de demonstrar o bloqueio, use **Desbloquear**:

```text
Motivo: Verificação concluída sem risco sistêmico
Documento/hash: DESBLOQUEIO-AMOX-001
Observação: Comercialização liberada novamente
```

**Resultado esperado:** lote volta para `Ativo`.

---

## 16. Recall / recolhimento

**Carteira:** #0 — Regulador

Use **Recolher lote / Recall**:

```text
Lote: LOTE-APRESENTACAO-001
Motivo: Recall acadêmico para demonstrar rastreabilidade reversa
Documento/hash: RECALL-AMOX-001
Observação: Recolhimento simulado
```

**Resultado esperado:** status `Recolhido` e comercialização normal bloqueada.

---

## 17. Transferência de recolhimento da Farmácia para o Distribuidor

**Carteira:** #3 — Farmácia Açude Velho

Aba **Transferências**.

Crie:

```text
Lote: LOTE-APRESENTACAO-001
Destino: DIST-CG-001 — Distribuidora Campina Farma
Quantidade: 50
Tipo: Recolhimento
Transportadora: opcional
Local: Farmácia Açude Velho
Documento/hash: DEVOLUCAO-RECALL-AMOX-001
Observação: Unidades devolvidas após recall
```

Siga o fluxo de expedição/coleta e recebimento conforme a transportadora escolhida.

**Resultado esperado:** parte do estoque retorna pela cadeia reversa e cada responsável fica registrado.

---

## 18. Destruição de unidades recolhidas

**Carteira:** organização que possuir o saldo que será destruído. Para a demonstração, use #2 Distribuidor depois de receber o recolhimento.

Aba **Rastreabilidade** → destruição.

```text
Lote: LOTE-APRESENTACAO-001
Quantidade: 10
Local: Área de segregação - Distribuidora Campina Farma
Comprovante/hash: DESTRUICAO-AMOX-001
Observação: Destruição simulada de unidades recolhidas
```

**Resultado esperado:** quantidade destruída aumenta e o saldo da organização diminui.

---

# CENÁRIO 4 — Fluxos de erro e controles

## 19. Cancelar uma transferência antes da expedição

**Carteira:** #1 Fabricante ou #2 Distribuidor, conforme a origem.

1. crie uma transferência pequena, por exemplo 10 unidades;
2. não faça expedição/coleta;
3. use **Cancelar transferência**.

**Resultado esperado:** status `Cancelada` e quantidade reservada liberada.

---

## 20. Recusar recebimento

**Carteira de origem:** #2 Distribuidor Campina.

1. crie transferência de 10 unidades para a Farmácia Açude Velho;
2. confirme expedição.

**Carteira de destino:** #3 Farmácia Açude Velho.

Use **Recusar recebimento**:

```text
Local: Farmácia Açude Velho
Motivo: Divergência na embalagem durante conferência
Documento/hash: RECUSA-AMOX-001
```

**Resultado esperado:** status `Recusada` e reserva liberada para a origem.

---

## 21. Pausa de emergência

**Carteira:** #0 — Regulador

Aba **Rastreabilidade** ou área de governança.

1. pause o sistema com um motivo;
2. troque para #1 Fabricante e tente registrar/transferir algo;
3. a operação deve ser rejeitada;
4. volte para #0 Regulador e retire a pausa.

**Objetivo demonstrado:** governança de emergência.

---

# CENÁRIO 5 — Auditoria final

## 22. Conferir todo o histórico do lote

**Carteira:** qualquer conta; recomendamos #0 Regulador.

Aba **Auditoria**.

Selecione `LOTE-APRESENTACAO-001` e carregue o histórico.

Confira em cada evento:

- tipo da operação;
- nome do operador;
- ID do operador;
- cargo;
- organização;
- wallet usada;
- origem e destino;
- quantidade;
- data/hora;
- localização;
- hash de documento;
- observação;
- `hashAnterior`;
- `hashRegistro`.

Use também **Verificar integridade** em alguns registros.

**Resultado esperado:** todos devem aparecer como íntegros.

---

# Ordem resumida para apresentação

Se o tempo for curto, demonstre somente esta sequência:

```text
#0 Regulador       → mostrar organizações/operadores
#1 Fabricante      → criar LOTE-APRESENTACAO-001
#1 Fabricante      → criar transferência de 600 para distribuidor com transportadora
#4 Transportador   → coletar + checkpoint + entregar
#2 Distribuidor    → confirmar recebimento
#2 Distribuidor    → enviar 200 para Farmácia Açude Velho
#3 Farmácia        → confirmar recebimento + dispensar 20
#0 Regulador       → bloquear lote / desbloquear / recall
#0 Regulador       → abrir Auditoria e mostrar todos os responsáveis + hashes
```

Essa sequência demonstra leitura, escrita, MetaMask, Hardhat, mudança de custódia, permissões por papel e rastreabilidade de pessoas de ponta a ponta.
