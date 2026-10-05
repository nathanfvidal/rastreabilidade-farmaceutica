import { ethers } from "ethers";
import { CONTRACT_ADDRESS, CONTRACT_ABI, CHAIN_ID } from "./contract-config.js";
import demoAccounts from "./demo-accounts.json";
import "./styles.css";

const PAPEL = ["Nenhum", "Fabricante", "Distribuidor", "Dispensador", "Transportador", "Regulador"];
const STATUS_LOTE = ["Inexistente", "Ativo", "Bloqueado", "Recolhido", "Encerrado"];
const TIPO_TRANSFERENCIA = ["Comercial", "Devolução", "Recolhimento"];
const STATUS_TRANSFERENCIA = ["Inexistente", "Criada", "Em trânsito", "Aguardando recebimento", "Confirmada", "Recusada", "Cancelada"];
const TIPO_EVENTO = [
  "Registro do lote",
  "Transferência criada",
  "Expedição confirmada",
  "Coleta da transportadora",
  "Atualização de transporte",
  "Entrega da transportadora",
  "Recebimento confirmado",
  "Recebimento recusado",
  "Transferência cancelada",
  "Bloqueio do lote",
  "Desbloqueio do lote",
  "Recolhimento do lote",
  "Dispensação",
  "Destruição",
  "Ocorrência"
];

let provider = null; // RPC direto do Hardhat para todas as leituras
let walletProvider = null; // MetaMask apenas para assinatura
let signer = null;
let contract = null; // contrato somente-leitura (Hardhat RPC)
let writeContract = null; // contrato de escrita (MetaMask signer)
let currentAccount = null;
let currentOperator = null;
let currentOrganization = null;
let connectionBusy = false;
let connectionGeneration = 0;
let txHistory = [];
const CONSULT_HISTORY_KEY = `rf_consultas_${CONTRACT_ADDRESS || "sem-contrato"}`;
let consultationHistory = [];
const orgCache = new Map();
const operatorCache = new Map();
let liveEventContract = null;
let liveRefreshTimer = null;
let liveRefreshInProgress = false;
let lastSeenBlock = null;
let livePollTimer = null;
let referenceCatalog = { organizations: [], operators: [], lots: [], transfers: [], balancesByLot: new Map() };

const app = document.querySelector("#app");

app.innerHTML = `
<div class="shell">
  <header class="topbar">
    <div class="brand">
      <div class="brand-mark">RF</div>
      <div>
        <h1>Rastreabilidade Farmacêutica</h1>
        <p>Contrato V2 · Hardhat local · Interface completa</p>
      </div>
    </div>
    <div class="actions">
      <button id="btnNetwork" class="btn btn-secondary">Adicionar rede Hardhat</button>
      <button id="btnSwitchAccount" class="btn btn-secondary">Trocar carteira</button>
      <button id="btnConnect" class="btn btn-primary">Conectar MetaMask</button>
    </div>
  </header>

  <main class="container">
    <section class="hero">
      <div class="card hero-main">
        <span class="pill"><span class="dot ok"></span> Projeto acadêmico local</span>
        <h2>Interface completa para o contrato de rastreabilidade V2.</h2>
        <p>Leituras consultam diretamente o estado do contrato. Escritas são assinadas na MetaMask e mineradas pela blockchain local do Hardhat.</p>
      </div>
      <div class="card status-line">
        <div><span class="label">Contrato</span><span id="contractAddress" class="value mono">${CONTRACT_ADDRESS || "Ainda não implantado"}</span></div>
        <div><span class="label">Rede esperada</span><span class="value">Hardhat Localhost (${CHAIN_ID})</span></div>
        <div><span class="label">Conexão</span><span id="connectionState" class="pill"><span class="dot warn"></span> Desconectado</span></div>
        <div><span class="label">Sistema</span><span id="systemState" class="pill"><span class="dot"></span> —</span></div>
      </div>
    </section>

    <div id="deploymentWarning" class="notice" style="${CONTRACT_ADDRESS ? "display:none" : ""}">
      O contrato ainda não foi implantado. Inicie o Hardhat e execute <b>npm run deploy</b> e <b>npm run seed</b>.
    </div>

    <section class="card identity-card">
      <div class="section-heading">
        <div><h3 class="section-title">Identidade conectada</h3><p class="help">A wallet determina qual operador e organização assinam cada ação.</p></div>
        <span id="roleBadge" class="badge">Sem operador</span>
      </div>
      <div class="identity">
        <div class="identity-item"><span class="label">Carteira</span><span id="accountValue" class="value mono">—</span></div>
        <div class="identity-item"><span class="label">Operador</span><span id="operatorValue" class="value">—</span></div>
        <div class="identity-item"><span class="label">Organização / Papel</span><span id="orgValue" class="value">—</span></div>
      </div>
      <p id="identityHelp" class="help">Conecte uma conta do Hardhat importada na MetaMask.</p>
    </section>

    <nav class="tabs" id="tabs">
      <button class="tab active" data-panel="dashboard">Dashboard</button>
      <button class="tab" data-panel="organizacoes">Organizações</button>
      <button class="tab" data-panel="operadores">Operadores</button>
      <button class="tab" data-panel="lotes">Lotes e Custódia</button>
      <button class="tab" data-panel="transferencias">Transferências</button>
      <button class="tab" data-panel="transporte">Transporte</button>
      <button class="tab" data-panel="rastreabilidade">Rastreabilidade</button>
      <button class="tab" data-panel="auditoria">Auditoria</button>
      <button class="tab" data-panel="utilitarios">Utilitários</button>
    </nav>

    <section id="dashboard" class="panel active">
      <div class="grid-5">
        <div class="card stat"><span class="label">Organizações</span><strong id="statOrgs">—</strong></div>
        <div class="card stat"><span class="label">Operadores</span><strong id="statOps">—</strong></div>
        <div class="card stat"><span class="label">Lotes</span><strong id="statLotes">—</strong></div>
        <div class="card stat"><span class="label">Transferências</span><strong id="statTransfers">—</strong></div>
        <div class="card stat"><span class="label">Registros de auditoria</span><strong id="statAudit">—</strong></div>
      </div>

      <div class="grid dashboard-grid">
        <div class="card">
          <div class="section-heading">
            <div><h3 class="section-title">Contas da demonstração</h3><p class="help">Endereços preenchidos automaticamente pelo seed.</p></div>
          </div>
          <div id="demoAccounts" class="result"></div>
          <p class="help">As chaves privadas aparecem somente no terminal do <code>npm run node</code>. Use-as apenas na rede local.</p>
        </div>
        <div class="card">
          <h3 class="section-title">Governança inicial</h3>
          <div id="governanceInfo" class="result"><span class="help">Conecte a carteira para carregar.</span></div>
        </div>
      </div>

      <div class="card tx-history-card">
        <div class="section-heading">
          <div><h3 class="section-title">Estados das transações</h3><p class="help">Histórico local da sessão: assinatura, envio, confirmação, bloco e erros.</p></div>
          <button id="btnClearTx" class="btn btn-ghost" type="button">Limpar</button>
        </div>
        <div id="txHistory" class="tx-history"><p class="help">Nenhuma transação nesta sessão.</p></div>
      </div>
    </section>

    <section id="organizacoes" class="panel">
      <div class="grid">
        <div class="card">
          <div class="section-heading"><div><h3 class="section-title">Organizações cadastradas</h3><p class="help">Leitura paginada do índice on-chain.</p></div><button id="btnLoadOrgs" class="btn btn-secondary" type="button">Atualizar lista</button></div>
          <div id="listaOrganizacoes" class="result"></div>
        </div>
        <div class="card">
          <h3 class="section-title">Consultar organização</h3>
          <form id="formConsultarOrganizacao">
            <div class="field"><label>Organização</label><select name="id" required data-ref="organization-all"><option value="">Conecte a carteira para carregar...</option></select></div>
            <button class="btn btn-secondary" type="submit">Consultar</button>
          </form>
          <div id="resultadoOrganizacao" class="result"></div>
        </div>
        <div class="card">
          <h3 class="section-title">Cadastrar organização</h3>
          <p class="help">Somente Regulador.</p>
          <form id="formOrganizacao">
            <div class="field"><label>ID externo</label><input name="id" required placeholder="FAB-002"></div>
            <div class="field"><label>Nome</label><input name="nome" required placeholder="Laboratório Novo"></div>
            <div class="field"><label>Papel</label><select name="papel"><option value="1">Fabricante</option><option value="2">Distribuidor</option><option value="3">Dispensador</option><option value="4">Transportador</option><option value="5">Regulador</option></select></div>
            <div class="field"><label>Documento / hash</label><input name="documento" value="documento-organizacao"></div>
            <button class="btn btn-primary" type="submit">Cadastrar organização</button>
          </form>
        </div>
        <div class="card">
          <h3 class="section-title">Ativar / desativar organização</h3>
          <p class="help">Somente Regulador. O motivo é gravado no evento administrativo.</p>
          <form id="formStatusOrganizacao">
            <div class="field"><label>Organização</label><select name="id" required data-ref="organization-all"><option value="">Conecte a carteira para carregar...</option></select></div>
            <div class="field"><label>Novo status</label><select name="ativa"><option value="true">Ativa</option><option value="false">Inativa</option></select></div>
            <div class="field"><label>Motivo</label><textarea name="motivo" required>Alteração administrativa pela interface.</textarea></div>
            <button class="btn btn-primary" type="submit">Alterar status</button>
          </form>
        </div>
      </div>
    </section>

    <section id="operadores" class="panel">
      <div class="grid">
        <div class="card">
          <div class="section-heading"><div><h3 class="section-title">Operadores cadastrados</h3><p class="help">Mostra ID, organização, cargo, wallet e status.</p></div><button id="btnLoadOps" class="btn btn-secondary" type="button">Atualizar lista</button></div>
          <div id="listaOperadores" class="result"></div>
        </div>
        <div class="card">
          <h3 class="section-title">Consultar operador</h3>
          <form id="formConsultarOperador">
            <div class="field"><label>Operador</label><select name="id" required data-ref="operator-all"><option value="">Conecte a carteira para carregar...</option></select></div>
            <button class="btn btn-secondary" type="submit">Consultar</button>
          </form>
          <div id="resultadoOperador" class="result"></div>
        </div>
        <div class="card">
          <h3 class="section-title">Cadastrar operador</h3>
          <p class="help">Regulador ou administrador da própria organização.</p>
          <form id="formOperador">
            <div class="field"><label>ID externo</label><input name="id" required placeholder="OP-FAB-002"></div>
            <div class="field"><label>Nome</label><input name="nome" required placeholder="Nome do operador"></div>
            <div class="field"><label>Cargo</label><input name="cargo" placeholder="Responsável"></div>
            <div class="field"><label>Carteira</label><input name="carteira" required placeholder="0x..."></div>
            <div class="field"><label>Organização</label><select name="organizacao" required data-ref="organization-active"><option value="">Conecte a carteira para carregar...</option></select></div>
            <label class="checkbox"><input type="checkbox" name="administrador"> Administrador da organização</label>
            <button class="btn btn-primary" type="submit">Cadastrar operador</button>
          </form>
        </div>
        <div class="card">
          <h3 class="section-title">Ativar / desativar operador</h3>
          <form id="formStatusOperador">
            <div class="field"><label>Operador</label><select name="id" required data-ref="operator-all"><option value="">Conecte a carteira para carregar...</option></select></div>
            <div class="field"><label>Novo status</label><select name="ativo"><option value="true">Ativo</option><option value="false">Inativo</option></select></div>
            <div class="field"><label>Motivo</label><textarea name="motivo" required>Alteração administrativa pela interface.</textarea></div>
            <button class="btn btn-primary" type="submit">Alterar status</button>
          </form>
        </div>
        <div class="card">
          <h3 class="section-title">Alterar carteira do operador</h3>
          <form id="formCarteiraOperador">
            <div class="field"><label>Operador</label><select name="id" required data-ref="operator-all"><option value="">Conecte a carteira para carregar...</option></select></div>
            <div class="field"><label>Nova carteira</label><input name="carteira" required placeholder="0x..."></div>
            <div class="field"><label>Motivo</label><textarea name="motivo" required>Troca de carteira corporativa.</textarea></div>
            <button class="btn btn-primary" type="submit">Alterar carteira</button>
          </form>
        </div>
        <div class="card">
          <h3 class="section-title">Operadores de uma organização</h3>
          <form id="formOpsOrganizacao">
            <div class="field"><label>Organização</label><select name="organizacao" required data-ref="organization-all"><option value="">Conecte a carteira para carregar...</option></select></div>
            <button class="btn btn-secondary" type="submit">Listar operadores</button>
          </form>
          <div id="resultadoOpsOrganizacao" class="result"></div>
        </div>
      </div>
    </section>

    <section id="lotes" class="panel">
      <div class="grid">
        <div class="card">
          <div class="section-heading"><div><h3 class="section-title">Lotes cadastrados</h3><p class="help">Enumeração do índice do contrato.</p></div><button id="btnLoadLotes" class="btn btn-secondary" type="button">Atualizar lista</button></div>
          <div id="listaLotes" class="result"></div>
        </div>
        <div class="card">
          <h3 class="section-title">Registrar lote</h3>
          <p class="help">Somente Fabricante. Gera o primeiro registro da cadeia de auditoria.</p>
          <form id="formLote">
            <div class="form-grid">
              <div class="field"><label>Identificador</label><input name="identificador" required placeholder="LOTE-2026-001"></div>
              <div class="field"><label>Código do produto</label><input name="codigoProduto" required placeholder="MED-001"></div>
              <div class="field full"><label>Descrição</label><input name="descricaoProduto" placeholder="Medicamento demonstrativo"></div>
              <div class="field"><label>Data de fabricação</label><input name="dataFabricacao" type="date" required></div>
              <div class="field"><label>Data de validade</label><input name="dataValidade" type="date" required></div>
              <div class="field"><label>Quantidade inicial</label><input name="quantidadeInicial" type="number" min="1" required value="1000"></div>
              <div class="field"><label>Laudo / hash</label><input name="laudo" required value="laudo-demo.pdf"></div>
              <div class="field"><label>Metadados / hash</label><input name="metadados" value="metadados-demo"></div>
              <div class="field"><label>Localização inicial</label><input name="localizacao" required value="Unidade de Producao - Campina Grande/PB"></div>
              <div class="field full"><label>Observação</label><textarea name="observacao">Registro feito pela interface web.</textarea></div>
            </div>
            <button class="btn btn-primary" type="submit">Registrar lote</button>
          </form>
        </div>
        <div class="card">
          <h3 class="section-title">Consultar lote</h3>
          <form id="formConsultarLote">
            <div class="field"><label>Lote</label><select name="identificador" required data-ref="lot-all"><option value="">Conecte a carteira para carregar...</option></select></div>
            <button class="btn btn-secondary" type="submit">Consultar</button>
          </form>
          <div id="resultadoLote" class="result"></div>
        </div>
        <div class="card">
          <h3 class="section-title">Verificar lote</h3>
          <p class="help">Leitura resumida: registro, validade, status, circulação e último hash de auditoria.</p>
          <form id="formVerificarLote">
            <div class="field"><label>Lote</label><select name="identificador" required data-ref="lot-all"><option value="">Conecte a carteira para carregar...</option></select></div>
            <button class="btn btn-secondary" type="submit">Verificar</button>
          </form>
          <div id="resultadoVerificarLote" class="result"></div>
        </div>
        <div class="card">
          <h3 class="section-title">Saldo por organização</h3>
          <form id="formSaldoLote">
            <div class="field"><label>Lote</label><select name="lote" required data-ref="lot-all"><option value="">Conecte a carteira para carregar...</option></select></div>
            <div class="field"><label>Organização</label><select name="organizacao" required data-ref="organization-all"><option value="">Conecte a carteira para carregar...</option></select></div>
            <button class="btn btn-secondary" type="submit">Consultar saldo</button>
          </form>
          <div id="resultadoSaldoLote" class="result"></div>
        </div>
        <div class="card">
          <h3 class="section-title">Cadeia de custódia atual</h3>
          <p class="help">Lista as organizações que já entraram no índice de custódia do lote e seus saldos atuais.</p>
          <form id="formCustodiaLote">
            <div class="field"><label>Lote</label><select name="lote" required data-ref="lot-all"><option value="">Conecte a carteira para carregar...</option></select></div>
            <button class="btn btn-secondary" type="submit">Carregar custódia</button>
          </form>
          <div id="resultadoCustodiaLote" class="result"></div>
        </div>
      </div>
    </section>

    <section id="transferencias" class="panel">
      <div class="grid">
        <div class="card">
          <div class="section-heading"><div><h3 class="section-title">Todas as transferências</h3><p class="help">Índice global do contrato.</p></div><button id="btnLoadTransfers" class="btn btn-secondary" type="button">Atualizar lista</button></div>
          <div id="listaTransferencias" class="result"></div>
        </div>
        <div class="card">
          <h3 class="section-title">Criar transferência</h3>
          <form id="formTransferencia">
            <div class="form-grid">
              <div class="field"><label>Lote com saldo disponível</label><select name="lote" required data-ref="lot-transfer"><option value="">Nenhum lote disponível</option></select></div>
              <div class="field"><label>Organização destino</label><select name="destino" required data-ref="transfer-destination"><option value="">Selecione um destino válido...</option></select></div>
              <div class="field"><label>Quantidade</label><input name="quantidade" type="number" min="1" required value="100"></div>
              <div class="field"><label>Tipo</label><select name="tipo"><option value="0">Comercial</option><option value="1">Devolução</option><option value="2">Recolhimento</option></select></div>
              <div class="field"><label>Transportadora (opcional)</label><select name="transportadora" data-ref="transport-organization"><option value="">Sem transportadora</option></select></div>
              <div class="field"><label>Local de origem</label><input name="localOrigem" required value="Doca de expedicao - Campina Grande/PB"></div>
              <div class="field"><label>Documento de saída / hash</label><input name="documento" value="NF-DEMO-001"></div>
              <div class="field full"><label>Observação</label><textarea name="observacao">Transferência criada pela interface.</textarea></div>
            </div>
            <button class="btn btn-primary" type="submit">Criar transferência</button>
          </form>
          <div id="transferenciaCriada" class="result"></div>
        </div>
        <div class="card">
          <h3 class="section-title">Consultar transferência</h3>
          <form id="formConsultarTransferencia">
            <div class="field"><label>Transferência</label><select name="id" required data-ref="transfer-all"><option value="">Nenhuma transferência disponível</option></select></div>
            <button class="btn btn-secondary" type="submit">Consultar</button>
          </form>
          <div id="resultadoTransferencia" class="result"></div>
        </div>
        <div class="card">
          <h3 class="section-title">Transferências de um lote</h3>
          <form id="formTransferenciasLote">
            <div class="field"><label>Lote</label><select name="lote" required data-ref="lot-all"><option value="">Conecte a carteira para carregar...</option></select></div>
            <button class="btn btn-secondary" type="submit">Listar</button>
          </form>
          <div id="resultadoTransferenciasLote" class="result"></div>
        </div>
        <div class="card">
          <h3 class="section-title">Confirmar expedição sem transportadora</h3>
          <p class="help">Operador da organização de origem. A transferência precisa ter sido criada sem transportadora cadastrada.</p>
          <form id="formExpedicao">
            <div class="field"><label>Transferência pronta para expedição</label><select name="id" required data-ref="transfer-expedition"><option value="">Nenhuma transferência disponível</option></select></div>
            <div class="field"><label>Local</label><input name="local" required value="Doca de expedicao - Campina Grande/PB"></div>
            <div class="field"><label>Documento / hash</label><input name="documento" value="COMPROVANTE-EXPEDICAO"></div>
            <div class="field"><label>Observação</label><textarea name="observacao">Expedição confirmada.</textarea></div>
            <button class="btn btn-success" type="submit">Confirmar expedição</button>
          </form>
        </div>
        <div class="card">
          <h3 class="section-title">Confirmar recebimento</h3>
          <p class="help">Operador da organização destinatária. A custódia muda somente nesta etapa.</p>
          <form id="formRecebimento">
            <div class="field"><label>Transferência a receber</label><select name="id" required data-ref="transfer-receive"><option value="">Nenhuma transferência disponível</option></select></div>
            <div class="field"><label>Local</label><input name="local" required value="Area de recebimento - Campina Grande/PB"></div>
            <div class="field"><label>Documento / hash</label><input name="documento" value="COMPROVANTE-RECEBIMENTO"></div>
            <div class="field"><label>Observação</label><textarea name="observacao">Recebimento conferido e confirmado.</textarea></div>
            <button class="btn btn-success" type="submit">Confirmar recebimento</button>
          </form>
        </div>
        <div class="card">
          <h3 class="section-title">Recusar recebimento</h3>
          <form id="formRecusarRecebimento">
            <div class="field"><label>Transferência a recusar</label><select name="id" required data-ref="transfer-reject"><option value="">Nenhuma transferência disponível</option></select></div>
            <div class="field"><label>Local</label><input name="local" required value="Area de recebimento - Campina Grande/PB"></div>
            <div class="field"><label>Documento / hash</label><input name="documento" value="RELATORIO-RECUSA"></div>
            <div class="field"><label>Motivo</label><textarea name="motivo" required>Divergência identificada no recebimento.</textarea></div>
            <button class="btn btn-danger" type="submit">Recusar recebimento</button>
          </form>
        </div>
        <div class="card">
          <h3 class="section-title">Cancelar transferência</h3>
          <form id="formCancelarTransferencia">
            <div class="field"><label>Transferência cancelável</label><select name="id" required data-ref="transfer-cancel"><option value="">Nenhuma transferência disponível</option></select></div>
            <div class="field"><label>Motivo</label><textarea name="motivo" required>Cancelamento operacional.</textarea></div>
            <button class="btn btn-danger" type="submit">Cancelar transferência</button>
          </form>
        </div>
      </div>
    </section>

    <section id="transporte" class="panel">
      <div class="intro-card card">
        <h3 class="section-title">Fluxo com transportadora</h3>
        <p class="help">Quando uma transferência informa uma organização Transportador, a origem não usa “Confirmar expedição”. A transportadora confirma a coleta, registra checkpoints e confirma a entrega.</p>
      </div>
      <div class="grid">
        <div class="card">
          <h3 class="section-title">Confirmar coleta</h3>
          <form id="formColeta">
            <div class="field"><label>Transferência para coleta</label><select name="id" required data-ref="transfer-collect"><option value="">Nenhuma transferência disponível</option></select></div>
            <div class="field"><label>Local</label><input name="local" required value="Coleta na origem - Campina Grande/PB"></div>
            <div class="field"><label>Documento / hash</label><input name="documento" value="COMPROVANTE-COLETA"></div>
            <div class="field"><label>Observação</label><textarea name="observacao">Carga coletada e conferida.</textarea></div>
            <button class="btn btn-success" type="submit">Confirmar coleta</button>
          </form>
        </div>
        <div class="card">
          <h3 class="section-title">Registrar checkpoint de transporte</h3>
          <form id="formAtualizacaoTransporte">
            <div class="field"><label>Transferência em trânsito</label><select name="id" required data-ref="transfer-checkpoint"><option value="">Nenhuma transferência disponível</option></select></div>
            <div class="field"><label>Local</label><input name="local" required value="Hub logistico - Campina Grande/PB"></div>
            <div class="field"><label>Documento / hash</label><input name="documento" value="CHECKPOINT-001"></div>
            <div class="field"><label>Observação</label><textarea name="observacao">Checkpoint logístico registrado.</textarea></div>
            <button class="btn btn-primary" type="submit">Registrar atualização</button>
          </form>
        </div>
        <div class="card">
          <h3 class="section-title">Confirmar entrega da transportadora</h3>
          <form id="formEntregaTransportador">
            <div class="field"><label>Transferência para entrega</label><select name="id" required data-ref="transfer-deliver"><option value="">Nenhuma transferência disponível</option></select></div>
            <div class="field"><label>Local</label><input name="local" required value="Destino da entrega"></div>
            <div class="field"><label>Documento / hash</label><input name="documento" value="COMPROVANTE-ENTREGA"></div>
            <div class="field"><label>Observação</label><textarea name="observacao">Entrega física realizada. Aguardando aceite do destinatário.</textarea></div>
            <button class="btn btn-success" type="submit">Confirmar entrega</button>
          </form>
        </div>
      </div>
    </section>

    <section id="rastreabilidade" class="panel">
      <div class="grid">
        <div class="card">
          <h3 class="section-title">Pausa de emergência</h3>
          <p class="help">Somente Regulador. A pausa bloqueia as funções operacionais marcadas pelo contrato.</p>
          <form id="formPausaSistema">
            <div class="field"><label>Novo estado</label><select name="pausado"><option value="true">Pausar sistema</option><option value="false">Retomar sistema</option></select></div>
            <div class="field"><label>Motivo</label><textarea name="motivo" required>Controle emergencial pelo regulador.</textarea></div>
            <button class="btn btn-danger" type="submit">Alterar pausa</button>
          </form>
        </div>
        <div class="card">
          <h3 class="section-title">Bloquear lote</h3>
          <form id="formBloquearLote">
            <div class="field"><label>Lote ativo</label><select name="lote" required data-ref="lot-block"><option value="">Nenhum lote disponível</option></select></div>
            <div class="field"><label>Local</label><input name="local" value="Autoridade reguladora"></div>
            <div class="field"><label>Documento / hash</label><input name="documento" value="DECISAO-BLOQUEIO"></div>
            <div class="field"><label>Motivo</label><textarea name="motivo" required>Bloqueio preventivo.</textarea></div>
            <button class="btn btn-danger" type="submit">Bloquear lote</button>
          </form>
        </div>
        <div class="card">
          <h3 class="section-title">Desbloquear lote</h3>
          <form id="formDesbloquearLote">
            <div class="field"><label>Lote bloqueado</label><select name="lote" required data-ref="lot-unblock"><option value="">Nenhum lote disponível</option></select></div>
            <div class="field"><label>Local</label><input name="local" value="Autoridade reguladora"></div>
            <div class="field"><label>Documento / hash</label><input name="documento" value="DECISAO-DESBLOQUEIO"></div>
            <div class="field"><label>Motivo</label><textarea name="motivo" required>Liberação após análise.</textarea></div>
            <button class="btn btn-success" type="submit">Desbloquear lote</button>
          </form>
        </div>
        <div class="card">
          <h3 class="section-title">Recolher lote / Recall</h3>
          <form id="formRecolherLote">
            <div class="field"><label>Lote elegível para recolhimento</label><select name="lote" required data-ref="lot-recall"><option value="">Nenhum lote disponível</option></select></div>
            <div class="field"><label>Local</label><input name="local" value="Autoridade reguladora"></div>
            <div class="field"><label>Documento / hash</label><input name="documento" value="COMUNICADO-RECALL"></div>
            <div class="field"><label>Motivo</label><textarea name="motivo" required>Recolhimento determinado.</textarea></div>
            <button class="btn btn-danger" type="submit">Recolher lote</button>
          </form>
        </div>
        <div class="card">
          <h3 class="section-title">Dispensar unidades</h3>
          <p class="help">Somente Dispensador com saldo disponível e lote ativo/válido.</p>
          <form id="formDispensar">
            <div class="field"><label>Lote disponível para dispensação</label><select name="lote" required data-ref="lot-dispense"><option value="">Nenhum lote disponível</option></select></div>
            <div class="field"><label>Quantidade</label><input name="quantidade" type="number" min="1" required value="1"></div>
            <div class="field"><label>Local</label><input name="local" required value="Balcão da farmácia"></div>
            <div class="field"><label>Comprovante / hash</label><input name="documento" value="COMPROVANTE-DISPENSACAO"></div>
            <div class="field"><label>Observação</label><textarea name="observacao">Dispensação registrada sem dados pessoais do paciente.</textarea></div>
            <button class="btn btn-primary" type="submit">Registrar dispensação</button>
          </form>
        </div>
        <div class="card">
          <h3 class="section-title">Registrar destruição</h3>
          <p class="help">Permitida pelo V2 para lote recolhido, bloqueado ou vencido e apenas sobre saldo disponível da organização.</p>
          <form id="formDestruicao">
            <div class="field"><label>Lote elegível para destruição</label><select name="lote" required data-ref="lot-destroy"><option value="">Nenhum lote disponível</option></select></div>
            <div class="field"><label>Quantidade</label><input name="quantidade" type="number" min="1" required value="1"></div>
            <div class="field"><label>Local</label><input name="local" required value="Área de descarte controlado"></div>
            <div class="field"><label>Comprovante / hash</label><input name="documento" required value="CERTIFICADO-DESTRUICAO"></div>
            <div class="field"><label>Observação</label><textarea name="observacao">Destruição controlada registrada.</textarea></div>
            <button class="btn btn-danger" type="submit">Registrar destruição</button>
          </form>
        </div>
        <div class="card">
          <h3 class="section-title">Registrar ocorrência</h3>
          <p class="help">Inspeção, avaria, desvio de temperatura, conferência ou outra ocorrência. Regulador pode registrar em qualquer lote; outras organizações precisam ter custódia.</p>
          <form id="formOcorrencia">
            <div class="field"><label>Lote para ocorrência</label><select name="lote" required data-ref="lot-occurrence"><option value="">Nenhum lote disponível</option></select></div>
            <div class="field"><label>Local</label><input name="local" value="Armazém"></div>
            <div class="field"><label>Documento / hash</label><input name="documento" value="RELATORIO-OCORRENCIA"></div>
            <div class="field"><label>Observação</label><textarea name="observacao">Inspeção visual realizada sem não conformidades.</textarea></div>
            <button class="btn btn-primary" type="submit">Registrar ocorrência</button>
          </form>
        </div>
      </div>
    </section>

    <section id="auditoria" class="panel">
      <div class="grid">
        <div class="card full-card">
          <div class="section-heading"><div><h3 class="section-title">Histórico completo do lote</h3><p class="help">Mostra operador, organização, origem/destino, quantidade, documento, hashes encadeados e verifica a integridade de cada registro.</p></div></div>
          <form id="formAuditoria" class="inline-form">
            <div class="field grow"><label>Lote</label><select name="lote" required data-ref="lot-all"><option value="">Conecte a carteira para carregar...</option></select></div>
            <button class="btn btn-secondary" type="submit">Carregar histórico</button>
          </form>
          <div id="resultadoAuditoria" class="timeline"></div>
        </div>
        <div class="card">
          <h3 class="section-title">Consultar registro por índice</h3>
          <form id="formRegistroAuditoria">
            <div class="field"><label>Lote</label><select name="lote" required data-ref="lot-all"><option value="">Conecte a carteira para carregar...</option></select></div>
            <div class="field"><label>Índice</label><input name="indice" type="number" min="0" required value="0"></div>
            <button class="btn btn-secondary" type="submit">Consultar registro</button>
          </form>
          <div id="resultadoRegistroAuditoria" class="result"></div>
        </div>
        <div class="card">
          <h3 class="section-title">Verificar integridade de registro</h3>
          <form id="formIntegridade">
            <div class="field"><label>Lote</label><select name="lote" required data-ref="lot-all"><option value="">Conecte a carteira para carregar...</option></select></div>
            <div class="field"><label>Índice</label><input name="indice" type="number" min="0" required value="0"></div>
            <button class="btn btn-secondary" type="submit">Recalcular e verificar</button>
          </form>
          <div id="resultadoIntegridade" class="result"></div>
        </div>
        <div class="card full-card">
          <div class="section-heading">
            <div><h3 class="section-title">Histórico de consultas da interface</h3><p class="help">Registra localmente quem consultou, o quê e quando. Não altera o contrato nem exige nova implantação.</p></div>
            <button id="btnClearConsultas" class="btn btn-ghost" type="button">Limpar histórico local</button>
          </div>
          <div id="consultaHistory" class="tx-history"><p class="help">Nenhuma consulta registrada neste navegador.</p></div>
        </div>
      </div>
    </section>

    <section id="utilitarios" class="panel">
      <div class="grid">
        <div class="card">
          <h3 class="section-title">Calcular ID bytes32</h3>
          <p class="help">Executa a função <code>calcularId</code> do próprio contrato.</p>
          <form id="formCalcularId">
            <div class="field"><label>Valor</label><input name="valor" required value="FAB-CG-001"></div>
            <button class="btn btn-secondary" type="submit">Calcular ID</button>
          </form>
          <div id="resultadoCalcularId" class="result"></div>
        </div>
        <div class="card">
          <h3 class="section-title">Gerar hash</h3>
          <p class="help">Executa <code>gerarHash</code> no contrato. Documentos reais ficam off-chain; o contrato recebe o hash.</p>
          <form id="formGerarHash">
            <div class="field"><label>Texto / referência</label><input name="valor" required value="documento-demo.pdf"></div>
            <button class="btn btn-secondary" type="submit">Gerar hash</button>
          </form>
          <div id="resultadoGerarHash" class="result"></div>
        </div>
        <div class="card">
          <h3 class="section-title">Saldo disponível por IDs on-chain</h3>
          <p class="help">Acesso direto à função pública <code>saldoDisponivelPorIds</code>. Use os IDs bytes32 calculados pelo contrato.</p>
          <form id="formSaldoPorIds">
            <div class="field"><label>Lote</label><select name="loteId" required data-ref="lot-id"><option value="">Selecione um lote...</option></select></div>
            <div class="field"><label>Organização</label><select name="organizacaoId" required data-ref="organization-id"><option value="">Selecione uma organização...</option></select></div>
            <button class="btn btn-secondary" type="submit">Consultar saldo disponível</button>
          </form>
          <div id="resultadoSaldoPorIds" class="result"></div>
        </div>
      </div>
    </section>
  </main>

  <div id="txBox" class="txbox"><strong id="txTitle"></strong><p id="txMessage"></p><p id="txHash"></p></div>
</div>`;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const dataOf = (form) => Object.fromEntries(new FormData(form).entries());

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function shortHex(value) {
  const s = String(value || "");
  if (!s) return "—";
  return s.length > 18 ? `${s.slice(0, 10)}…${s.slice(-8)}` : s;
}

function copyable(value, label = "Copiar") {
  const safe = esc(value);
  return `<span class="copy-wrap"><span class="mono break">${safe}</span><button class="copy-btn" type="button" data-copy="${safe}" title="${esc(label)}">Copiar</button></span>`;
}

function formatDate(unix) {
  const n = Number(unix);
  if (!n) return "—";
  return new Date(n * 1000).toLocaleString("pt-BR");
}

function formatBool(value) {
  return value ? "Sim" : "Não";
}

function toHash(value, required = false) {
  const clean = String(value || "").trim();
  if (!clean) {
    if (required) throw new Error("Preencha o documento/hash obrigatório.");
    return ethers.ZeroHash;
  }
  if (/^0x[0-9a-fA-F]{64}$/.test(clean)) return clean;
  return ethers.id(clean);
}

function unixFromDate(dateValue) {
  if (!dateValue) throw new Error("Data obrigatória.");
  const time = new Date(`${dateValue}T00:00:00`).getTime();
  if (!Number.isFinite(time)) throw new Error("Data inválida.");
  return Math.floor(time / 1000);
}

function requireContract() {
  if (!contract) throw new Error("Conecte a MetaMask primeiro.");
}


function sameHex(a, b) {
  return String(a || "").toLowerCase() === String(b || "").toLowerCase();
}

function setDynamicSelectOptions(ref, options, { placeholder = "Selecione...", allowEmpty = false, emptyLabel = "Nenhum" } = {}) {
  const selects = $$(`select[data-ref="${ref}"]`);
  for (const select of selects) {
    const previous = select.value;
    const normalized = options.map((item) => typeof item === "string" ? { value: item, label: item } : item);
    let html = "";
    if (allowEmpty) html += `<option value="">${esc(emptyLabel)}</option>`;
    else if (!normalized.length) html += `<option value="">${esc(placeholder)}</option>`;
    for (const item of normalized) {
      html += `<option value="${esc(item.value)}"${item.disabled ? " disabled" : ""}>${esc(item.label)}</option>`;
    }
    select.innerHTML = html;
    if (previous && normalized.some((item) => String(item.value) === String(previous))) {
      select.value = previous;
    } else if (!allowEmpty && normalized.length) {
      select.value = String(normalized[0].value);
    } else {
      select.value = "";
    }
    select.disabled = !normalized.length && !allowEmpty;
  }
}

function organizationOption(org) {
  return {
    value: org.idExterno,
    label: `${org.idExterno} — ${org.nome} — ${PAPEL[Number(org.papel)]}${org.ativa ? "" : " — INATIVA"}`
  };
}

function operatorOption(op) {
  return {
    value: op.idExterno,
    label: `${op.idExterno} — ${op.nome}${op.cargo ? ` — ${op.cargo}` : ""}${op.ativo ? "" : " — INATIVO"}`
  };
}

function lotOption(lot) {
  return {
    value: lot.identificador,
    label: `${lot.identificador} — ${lot.codigoProduto}${lot.descricaoProduto ? ` — ${lot.descricaoProduto}` : ""} — ${STATUS_LOTE[Number(lot.status)]}`
  };
}

function transferOption(transfer, lotById, orgById) {
  const lot = lotById.get(String(transfer.loteId).toLowerCase());
  const origem = orgById.get(String(transfer.organizacaoOrigemId).toLowerCase());
  const destino = orgById.get(String(transfer.organizacaoDestinoId).toLowerCase());
  return {
    value: transfer.id,
    label: `${shortHex(transfer.id)} — ${lot?.identificador || shortHex(transfer.loteId)} — ${origem?.idExterno || "?"} → ${destino?.idExterno || "?"} — ${STATUS_TRANSFERENCIA[Number(transfer.status)]} — ${transfer.quantidade} un.`
  };
}

function transferLotAllowed(lot, type, available) {
  if (!currentOrganization || available <= 0n) return false;
  const role = Number(currentOrganization.papel);
  const status = Number(lot.status);
  const valid = Number(lot.dataValidade) >= Math.floor(Date.now() / 1000);
  if (![1, 2, 3].includes(role)) return false;
  if (type === 0) return [1, 2].includes(role) && status === 1 && valid;
  if (type === 1) return [2, 3].includes(role) && status !== 4;
  if (type === 2) return status === 2 || status === 3;
  return false;
}

function destinationAllowed(org, type) {
  if (!currentOrganization || !org.ativa || sameHex(org.id, currentOrganization.id)) return false;
  const originRole = Number(currentOrganization.papel);
  const destRole = Number(org.papel);
  if (type === 0) {
    return (originRole === 1 && destRole === 2) || (originRole === 2 && (destRole === 2 || destRole === 3));
  }
  if (type === 1) {
    return (originRole === 3 && (destRole === 2 || destRole === 1)) || (originRole === 2 && (destRole === 2 || destRole === 1));
  }
  if (type === 2) return destRole === 1 || destRole === 2;
  return false;
}

async function loadReferenceCatalog() {
  requireContract();
  const [orgIds, operatorIds, lotIds, transferIds] = await Promise.all([
    contract.listarOrganizacoes(0, 100),
    contract.listarOperadores(0, 100),
    contract.listarLotes(0, 100),
    contract.listarTransferencias(0, 100)
  ]);

  const [organizations, operators, lots, transfers] = await Promise.all([
    Promise.all(orgIds.map((id) => getOrg(id))),
    Promise.all(operatorIds.map((id) => getOperator(id))),
    Promise.all(lotIds.map((id) => contract.consultarLotePorId(id))),
    Promise.all(transferIds.map((id) => contract.consultarTransferencia(id)))
  ]);

  const balancesByLot = new Map();
  if (currentOrganization?.idExterno) {
    await Promise.all(lots.map(async (lot) => {
      try {
        const balance = await contract.consultarSaldoLote(lot.identificador, currentOrganization.idExterno);
        balancesByLot.set(String(lot.id).toLowerCase(), balance);
      } catch {}
    }));
  }

  referenceCatalog = {
    organizations: organizations.filter(Boolean),
    operators: operators.filter(Boolean),
    lots,
    transfers,
    balancesByLot
  };
}

function renderReferenceSelects() {
  const { organizations, operators, lots, transfers, balancesByLot } = referenceCatalog;
  const orgById = new Map(organizations.map((org) => [String(org.id).toLowerCase(), org]));
  const lotById = new Map(lots.map((lot) => [String(lot.id).toLowerCase(), lot]));
  const currentOrgId = currentOrganization?.id ? String(currentOrganization.id).toLowerCase() : "";
  const currentRole = Number(currentOrganization?.papel || 0);
  const typeField = document.getElementById("formTransferencia")?.elements?.tipo;
  const transferType = Number(typeField?.value || 0);

  const orgAll = organizations.map(organizationOption);
  const orgActive = organizations.filter((org) => org.ativa).map(organizationOption);
  const operatorAll = operators.map(operatorOption);
  const lotAll = lots.map(lotOption);
  const transferAll = transfers.map((t) => transferOption(t, lotById, orgById));

  setDynamicSelectOptions("organization-all", orgAll, { placeholder: "Nenhuma organização cadastrada" });
  setDynamicSelectOptions("organization-active", orgActive, { placeholder: "Nenhuma organização ativa" });
  setDynamicSelectOptions("organization-id", organizations.map((org) => ({ value: org.id, label: organizationOption(org).label })), { placeholder: "Nenhuma organização cadastrada" });
  setDynamicSelectOptions("operator-all", operatorAll, { placeholder: "Nenhum operador cadastrado" });
  setDynamicSelectOptions("lot-all", lotAll, { placeholder: "Nenhum lote cadastrado" });
  setDynamicSelectOptions("lot-id", lots.map((lot) => ({ value: lot.id, label: lotOption(lot).label })), { placeholder: "Nenhum lote cadastrado" });
  setDynamicSelectOptions("transfer-all", transferAll, { placeholder: "Nenhuma transferência cadastrada" });

  const transferLots = lots.filter((lot) => {
    const balance = balancesByLot.get(String(lot.id).toLowerCase());
    const available = balance ? BigInt(balance.saldoDisponivel) : 0n;
    return transferLotAllowed(lot, transferType, available);
  }).map((lot) => {
    const balance = balancesByLot.get(String(lot.id).toLowerCase());
    const available = balance ? balance.saldoDisponivel : 0n;
    return { value: lot.identificador, label: `${lotOption(lot).label} — disponível: ${available}` };
  });
  setDynamicSelectOptions("lot-transfer", transferLots, { placeholder: "Nenhum lote com saldo compatível" });

  const validDestinations = organizations.filter((org) => destinationAllowed(org, transferType)).map(organizationOption);
  setDynamicSelectOptions("transfer-destination", validDestinations, { placeholder: "Nenhum destino permitido para este fluxo" });

  const transporters = organizations.filter((org) => org.ativa && Number(org.papel) === 4).map(organizationOption);
  setDynamicSelectOptions("transport-organization", transporters, { allowEmpty: true, emptyLabel: "Sem transportadora" });

  const isAssignedTransporter = (t) => currentOrgId && sameHex(t.organizacaoTransportadoraId, currentOrgId);
  const isOrigin = (t) => currentOrgId && sameHex(t.organizacaoOrigemId, currentOrgId);
  const isDestination = (t) => currentOrgId && sameHex(t.organizacaoDestinoId, currentOrgId);
  const hasTransporter = (t) => !sameHex(t.organizacaoTransportadoraId, ethers.ZeroHash);
  const transferOpts = (filter) => transfers.filter(filter).map((t) => transferOption(t, lotById, orgById));

  setDynamicSelectOptions("transfer-expedition", transferOpts((t) => Number(t.status) === 1 && !hasTransporter(t) && isOrigin(t)), { placeholder: "Nenhuma transferência pronta para expedição" });
  setDynamicSelectOptions("transfer-receive", transferOpts((t) => [2, 3].includes(Number(t.status)) && isDestination(t)), { placeholder: "Nenhuma transferência aguardando seu recebimento" });
  setDynamicSelectOptions("transfer-reject", transferOpts((t) => [2, 3].includes(Number(t.status)) && isDestination(t)), { placeholder: "Nenhuma transferência pode ser recusada" });
  setDynamicSelectOptions("transfer-cancel", transferOpts((t) => Number(t.status) === 1 && (isOrigin(t) || currentRole === 5)), { placeholder: "Nenhuma transferência cancelável" });
  setDynamicSelectOptions("transfer-collect", transferOpts((t) => Number(t.status) === 1 && hasTransporter(t) && isAssignedTransporter(t)), { placeholder: "Nenhuma coleta atribuída à transportadora atual" });
  setDynamicSelectOptions("transfer-checkpoint", transferOpts((t) => Number(t.status) === 2 && hasTransporter(t) && isAssignedTransporter(t)), { placeholder: "Nenhuma transferência em trânsito atribuída" });
  setDynamicSelectOptions("transfer-deliver", transferOpts((t) => Number(t.status) === 2 && hasTransporter(t) && isAssignedTransporter(t)), { placeholder: "Nenhuma transferência pronta para entrega" });

  const roleIsRegulator = currentRole === 5;
  setDynamicSelectOptions("lot-block", (roleIsRegulator ? lots.filter((lot) => Number(lot.status) === 1) : []).map(lotOption), { placeholder: "Nenhum lote ativo disponível para bloqueio" });
  setDynamicSelectOptions("lot-unblock", (roleIsRegulator ? lots.filter((lot) => Number(lot.status) === 2) : []).map(lotOption), { placeholder: "Nenhum lote bloqueado" });
  setDynamicSelectOptions("lot-recall", (roleIsRegulator ? lots.filter((lot) => [1, 2].includes(Number(lot.status))) : []).map(lotOption), { placeholder: "Nenhum lote elegível para recolhimento" });

  const now = Math.floor(Date.now() / 1000);
  const availableBalance = (lot) => {
    const b = balancesByLot.get(String(lot.id).toLowerCase());
    return b ? BigInt(b.saldoDisponivel) : 0n;
  };
  const dispenseLots = currentRole === 3
    ? lots.filter((lot) => Number(lot.status) === 1 && Number(lot.dataValidade) >= now && availableBalance(lot) > 0n)
    : [];
  setDynamicSelectOptions("lot-dispense", dispenseLots.map((lot) => ({ value: lot.identificador, label: `${lotOption(lot).label} — disponível: ${availableBalance(lot)}` })), { placeholder: "Nenhum lote disponível para dispensação" });

  const destroyLots = currentOrganization
    ? lots.filter((lot) => availableBalance(lot) > 0n && ([2, 3].includes(Number(lot.status)) || Number(lot.dataValidade) < now))
    : [];
  setDynamicSelectOptions("lot-destroy", destroyLots.map((lot) => ({ value: lot.identificador, label: `${lotOption(lot).label} — disponível: ${availableBalance(lot)}` })), { placeholder: "Nenhum lote elegível para destruição" });

  const occurrenceLots = currentRole === 5 ? lots : lots.filter((lot) => availableBalance(lot) > 0n);
  setDynamicSelectOptions("lot-occurrence", occurrenceLots.map(lotOption), { placeholder: "Nenhum lote permitido para ocorrência" });

  const transferLotSelect = document.querySelector('select[data-ref="lot-transfer"]');
  const quantity = document.getElementById("formTransferencia")?.elements?.quantidade;
  if (transferLotSelect && quantity) {
    const selected = lots.find((lot) => lot.identificador === transferLotSelect.value);
    const balance = selected ? balancesByLot.get(String(selected.id).toLowerCase()) : null;
    if (balance) quantity.max = String(balance.saldoDisponivel);
    else quantity.removeAttribute("max");
  }
}

async function refreshReferenceSelects() {
  if (!contract) return;
  try {
    await loadReferenceCatalog();
    renderReferenceSelects();
  } catch (error) {
    console.warn("Selects dinâmicos:", error);
  }
}

function friendlyError(error) {
  const candidates = [
    error?.shortMessage,
    error?.reason,
    error?.info?.error?.data?.message,
    error?.info?.error?.message,
    error?.error?.data?.message,
    error?.error?.message,
    error?.data?.message,
    error?.message
  ].filter(Boolean);

  let text = String(candidates[0] || "Erro desconhecido");

  // O Ethers usa esta mensagem genérica quando não consegue normalizar uma resposta
  // do provider. Se houver uma mensagem RPC interna, ela é mais útil para o usuário.
  if (/could not coalesce error/i.test(text)) {
    const nested = candidates.find((item) => item && !/could not coalesce error/i.test(String(item)));
    if (nested) text = String(nested);
    else text = "A MetaMask/RPC ainda estava atualizando a conexão. Tente novamente em um instante.";
  }

  return text
    .replace("execution reverted: ", "")
    .replace("Error: VM Exception while processing transaction: reverted with reason string ", "");
}

function showTx(type, title, message, hash = "") {
  const box = $("#txBox");
  box.className = `txbox show ${type || ""}`;
  $("#txTitle").textContent = title;
  $("#txMessage").textContent = message;
  $("#txHash").textContent = hash ? `Hash: ${hash}` : "";
  clearTimeout(showTx.timer);
  showTx.timer = setTimeout(() => box.classList.remove("show"), type === "error" ? 9000 : 6500);
}

function addTxHistory(entry) {
  txHistory.unshift({ time: new Date(), ...entry });
  txHistory = txHistory.slice(0, 30);
  renderTxHistory();
}

function renderTxHistory() {
  const container = $("#txHistory");
  if (!txHistory.length) {
    container.innerHTML = `<p class="help">Nenhuma transação nesta sessão.</p>`;
    return;
  }
  container.innerHTML = txHistory.map((item) => `
    <article class="tx-row ${esc(item.status || "")}">
      <div>
        <strong>${esc(item.label)}</strong>
        <span>${esc(item.message || item.status || "")}</span>
      </div>
      <div class="tx-meta">
        <span>${item.time.toLocaleTimeString("pt-BR")}</span>
        ${item.block ? `<span>Bloco #${esc(item.block)}</span>` : ""}
        ${item.hash ? `<span class="mono">${esc(shortHex(item.hash))}</span>` : ""}
      </div>
    </article>`).join("");
}

function loadConsultationHistory() {
  try {
    const raw = localStorage.getItem(CONSULT_HISTORY_KEY);
    consultationHistory = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(consultationHistory)) consultationHistory = [];
  } catch {
    consultationHistory = [];
  }
}

function saveConsultationHistory() {
  try { localStorage.setItem(CONSULT_HISTORY_KEY, JSON.stringify(consultationHistory.slice(0, 300))); } catch {}
}

function identitySnapshot() {
  return {
    account: currentAccount || "",
    operatorId: currentOperator?.idExterno || "",
    operatorName: currentOperator?.nome || (currentAccount ? "Carteira sem operador cadastrado" : "Consulta sem carteira conectada"),
    cargo: currentOperator?.cargo || "",
    organizationId: currentOrganization?.idExterno || "",
    organizationName: currentOrganization?.nome || "",
    role: currentOrganization ? PAPEL[Number(currentOrganization.papel)] : "Não identificado"
  };
}

function recordConsultation(action, target, details = "") {
  const who = identitySnapshot();
  const entry = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    timestamp: new Date().toISOString(),
    action: String(action || "Consulta"),
    target: String(target || "—"),
    details: String(details || ""),
    ...who
  };
  consultationHistory.unshift(entry);
  consultationHistory = consultationHistory.slice(0, 300);
  saveConsultationHistory();
  renderConsultationHistory();
  return entry;
}

function consultationContext(entry) {
  if (!entry) return "";
  return `
    <article class="mini-record">
      <div class="list-card-head"><strong>Consulta registrada</strong><span class="badge">${esc(new Date(entry.timestamp).toLocaleString("pt-BR"))}</span></div>
      <div class="kv"><b>Consultado por</b><span>${esc(entry.operatorName)}${entry.operatorId ? ` (${esc(entry.operatorId)})` : ""}</span></div>
      <div class="kv"><b>Cargo</b><span>${esc(entry.cargo || "—")}</span></div>
      <div class="kv"><b>Organização / papel</b><span>${esc(entry.organizationName || "—")}${entry.organizationId ? ` (${esc(entry.organizationId)})` : ""}${entry.role ? ` · ${esc(entry.role)}` : ""}</span></div>
      <div class="kv"><b>Carteira</b><span>${entry.account ? copyable(entry.account) : "—"}</span></div>
      <div class="kv"><b>Consulta</b><span>${esc(entry.action)}</span></div>
      <div class="kv"><b>Alvo</b><span>${esc(entry.target)}</span></div>
    </article>`;
}

function renderConsultationHistory() {
  const container = $("#consultaHistory");
  if (!container) return;
  if (!consultationHistory.length) {
    container.innerHTML = `<p class="help">Nenhuma consulta registrada neste navegador.</p>`;
    return;
  }
  container.innerHTML = consultationHistory.map((item) => `
    <article class="tx-row">
      <div>
        <strong>${esc(item.action)}</strong>
        <span>${esc(item.target)}${item.details ? ` · ${esc(item.details)}` : ""}</span>
        <span>${esc(item.operatorName)}${item.operatorId ? ` (${esc(item.operatorId)})` : ""}${item.organizationName ? ` · ${esc(item.organizationName)}` : ""}</span>
      </div>
      <div class="tx-meta">
        <span>${esc(new Date(item.timestamp).toLocaleString("pt-BR"))}</span>
        ${item.role ? `<span>${esc(item.role)}</span>` : ""}
        ${item.account ? `<span class="mono">${esc(shortHex(item.account))}</span>` : ""}
      </div>
    </article>`).join("");
}

async function operatorSummary(opId) {
  const op = await getOperator(opId);
  if (!op) return { text: opId && opId !== ethers.ZeroHash ? shortHex(opId) : "—", op: null, org: null };
  const org = await getOrg(op.organizacaoId);
  return {
    text: `${op.nome} (${op.idExterno}) · ${op.cargo || "Sem cargo"}${org ? ` · ${org.nome} (${org.idExterno})` : ""} · ${shortHex(op.carteira)}`,
    op,
    org
  };
}

async function lotPeopleSummary(identificador) {
  try {
    const registros = await contract.consultarHistorico(identificador, 0, 100);
    const unique = [];
    const seen = new Set();
    for (const r of registros) {
      const key = String(r.operadorId);
      if (!key || key === ethers.ZeroHash || seen.has(key)) continue;
      seen.add(key);
      const info = await operatorSummary(r.operadorId);
      unique.push(info.text);
    }
    return { registros, people: unique };
  } catch {
    return { registros: [], people: [] };
  }
}

async function eventActorHistoryForOrganization(org) {
  const items = [];
  try {
    const created = await contract.queryFilter(contract.filters.OrganizacaoCadastrada(org.id), 0, "latest");
    for (const log of created) {
      const actor = await operatorSummary(log.args.executadoPorOperadorId);
      const block = await provider.getBlock(log.blockNumber);
      items.push({ when: block?.timestamp || 0, label: "Organização cadastrada por", actor: actor.text });
    }
    const statuses = await contract.queryFilter(contract.filters.StatusOrganizacaoAlterado(org.id), 0, "latest");
    for (const log of statuses) {
      const actor = await operatorSummary(log.args.executadoPorOperadorId);
      const block = await provider.getBlock(log.blockNumber);
      items.push({ when: block?.timestamp || 0, label: `Status alterado para ${log.args.ativa ? "ativa" : "inativa"} por`, actor: actor.text, reason: log.args.motivo });
    }
  } catch {}
  return items.sort((a,b) => Number(a.when)-Number(b.when));
}

async function eventActorHistoryForOperator(op) {
  const items = [];
  try {
    const created = await contract.queryFilter(contract.filters.OperadorCadastrado(op.id), 0, "latest");
    for (const log of created) {
      const actor = await operatorSummary(log.args.executadoPorOperadorId);
      const block = await provider.getBlock(log.blockNumber);
      items.push({ when: block?.timestamp || 0, label: "Operador cadastrado por", actor: actor.text });
    }
    const statuses = await contract.queryFilter(contract.filters.StatusOperadorAlterado(op.id), 0, "latest");
    for (const log of statuses) {
      const actor = await operatorSummary(log.args.executadoPorOperadorId);
      const block = await provider.getBlock(log.blockNumber);
      items.push({ when: block?.timestamp || 0, label: `Status alterado para ${log.args.ativo ? "ativo" : "inativo"} por`, actor: actor.text, reason: log.args.motivo });
    }
    const wallets = await contract.queryFilter(contract.filters.CarteiraOperadorAlterada(op.id), 0, "latest");
    for (const log of wallets) {
      const actor = await operatorSummary(log.args.executadoPorOperadorId);
      const block = await provider.getBlock(log.blockNumber);
      items.push({ when: block?.timestamp || 0, label: "Carteira alterada por", actor: actor.text, reason: log.args.motivo });
    }
  } catch {}
  return items.sort((a,b) => Number(a.when)-Number(b.when));
}

function renderAdminHistory(items) {
  if (!items?.length) return `<div class="kv"><b>Histórico administrativo</b><span>Sem eventos administrativos localizados.</span></div>`;
  return `<div class="audit-hashes"><b>Pessoas envolvidas no histórico administrativo</b>${items.map((item) => `<div><span>${esc(formatDate(item.when))} · ${esc(item.label)} <strong>${esc(item.actor)}</strong>${item.reason ? ` · ${esc(item.reason)}` : ""}</span></div>`).join("")}</div>`;
}

async function executeTx(label, action) {
  try {
    requireContract();
    if (!signer || !writeContract) throw new Error("Conecte uma conta assinante da MetaMask.");
    showTx("", label, "Aguardando assinatura na MetaMask...");
    addTxHistory({ label, status: "pending", message: "Aguardando assinatura" });
    const tx = await action();
    showTx("", label, "Transação enviada. Aguardando confirmação do Hardhat...", tx.hash);
    addTxHistory({ label, status: "sent", message: "Enviada; aguardando mineração", hash: tx.hash });
    const receipt = await tx.wait();
    if (!receipt || Number(receipt.status) !== 1) throw new Error("A transação foi minerada, mas revertida pelo contrato.");
    showTx("success", label, `Transação confirmada no bloco ${receipt.blockNumber}.`, tx.hash);
    addTxHistory({ label, status: "success", message: "Confirmada", hash: tx.hash, block: receipt.blockNumber.toString() });
    lastSeenBlock = Number(receipt.blockNumber);
    pendingStableBlock = null;
    pendingStableCount = 0;
    orgCache.clear();
    operatorCache.clear();
    await refreshLiveViews("transação confirmada");
    return receipt;
  } catch (error) {
    const msg = friendlyError(error);
    showTx("error", label, msg);
    addTxHistory({ label, status: "error", message: msg });
    throw error;
  }
}

async function prepareContractWrite(methodName, args) {
  requireContract();
  if (!currentAccount || !writeContract) throw new Error("Conecte uma conta assinante da MetaMask.");

  const readFn = contract.getFunction(methodName);

  // 1) Simula a operação diretamente no Hardhat antes de abrir a MetaMask.
  // Se alguma regra do Solidity for violada, exibimos a mensagem real do require.
  try {
    await readFn.staticCall(...args, { from: currentAccount });
  } catch (error) {
    const reason = friendlyError(error);
    throw new Error(reason || `A validação de ${methodName} foi recusada pelo contrato.`);
  }

  // 2) Obtém nonce diretamente do Hardhat. Isso evita o cache de nonce da MetaMask
  // quando a blockchain local foi reiniciada usando o mesmo chainId 31337.
  const nonce = await provider.getTransactionCount(currentAccount, "pending");

  // 3) Estima gas no próprio Hardhat e envia gasLimit explícito. Assim a MetaMask
  // não precisa estimar a transação e evita o genérico "Internal JSON-RPC error".
  let gasLimit = 8_000_000n;
  try {
    const estimated = await readFn.estimateGas(...args, { from: currentAccount });
    gasLimit = (estimated * 135n) / 100n + 50_000n;
  } catch (error) {
    console.warn(`Estimativa de gas para ${methodName} falhou; usando limite seguro.`, friendlyError(error));
  }

  return { nonce, gasLimit };
}

async function executeContractTx(label, methodName, args) {
  const overrides = await prepareContractWrite(methodName, args);
  return executeTx(label, () => writeContract.getFunction(methodName)(...args, overrides));
}


async function addHardhatNetwork() {
  if (!window.ethereum) return showTx("error", "MetaMask", "MetaMask não encontrada no navegador.");
  try {
    await window.ethereum.request({
      method: "wallet_addEthereumChain",
      params: [{
        chainId: `0x${Number(CHAIN_ID).toString(16)}`,
        chainName: "Hardhat Localhost",
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
        rpcUrls: ["http://127.0.0.1:8545"]
      }]
    });
    showTx("success", "Rede Hardhat", "Rede local adicionada/selecionada na MetaMask.");
  } catch (error) {
    showTx("error", "Rede Hardhat", friendlyError(error));
  }
}

function setDisconnectedUi(message = "Desconectado") {
  signer = null;
  walletProvider = null;
  writeContract = null;
  contract = null;
  provider = null;
  currentAccount = null;
  currentOperator = null;
  currentOrganization = null;
  $("#accountValue").textContent = "—";
  $("#operatorValue").textContent = "—";
  $("#orgValue").textContent = "—";
  $("#roleBadge").textContent = "Sem operador";
  $("#identityHelp").textContent = "Conecte uma conta do Hardhat importada na MetaMask.";
  $("#btnConnect").textContent = "Conectar MetaMask";
  $("#connectionState").innerHTML = `<span class="dot warn"></span> ${esc(message)}`;
}

async function setupConnection(account = null, { toast = false } = {}) {
  if (!window.ethereum) throw new Error("MetaMask não encontrada no navegador.");
  if (!CONTRACT_ADDRESS || !CONTRACT_ABI?.length) throw new Error("Execute npm run deploy antes de conectar a interface.");

  const generation = ++connectionGeneration;

  // Consulta a rede diretamente no provider EIP-1193. Isso evita erros genéricos
  // do BrowserProvider durante trocas rápidas de conta/rede no MetaMask.
  const chainHex = await window.ethereum.request({ method: "eth_chainId" });
  const chainId = Number(BigInt(chainHex));
  if (chainId !== Number(CHAIN_ID)) {
    setDisconnectedUi(`Rede incorreta (${chainId})`);
    throw new Error(`Selecione a rede Hardhat Localhost (${CHAIN_ID}).`);
  }

  const accounts = account ? [account] : await window.ethereum.request({ method: "eth_accounts" });
  if (!accounts?.length) {
    setDisconnectedUi();
    return false;
  }

  const requestedAccount = ethers.getAddress(accounts[0]);

  // MetaMask fica responsável SOMENTE por assinatura/escrita.
  walletProvider = new ethers.BrowserProvider(window.ethereum, "any");
  try {
    signer = await walletProvider.getSigner(requestedAccount);
  } catch (error) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    walletProvider = new ethers.BrowserProvider(window.ethereum, "any");
    signer = await walletProvider.getSigner(requestedAccount);
  }

  currentAccount = await signer.getAddress();
  if (generation !== connectionGeneration) return false;

  // Leituras usam diretamente o nó Hardhat. Assim MetaMask nunca fornece block tags
  // adiantadas para consultas, evitando "invalid block tag N / latest N-1".
  provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
  const hardhatNetwork = await provider.getNetwork();
  if (Number(hardhatNetwork.chainId) !== Number(CHAIN_ID)) {
    throw new Error(`RPC Hardhat respondeu chainId ${hardhatNetwork.chainId}, esperado ${CHAIN_ID}.`);
  }

  const code = await provider.getCode(CONTRACT_ADDRESS);
  if (!code || code === "0x") {
    throw new Error("Não há contrato neste endereço no Hardhat local. Reinicie o ambiente ou rode deploy/seed novamente.");
  }

  contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
  writeContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
  orgCache.clear();
  operatorCache.clear();
  $("#accountValue").textContent = currentAccount;
  $("#btnConnect").textContent = `${currentAccount.slice(0, 6)}…${currentAccount.slice(-4)}`;
  $("#connectionState").innerHTML = `<span class="dot ok"></span> Conectado`;

  // Primeiro conclui a identidade/conexão. Os selects e listas pesadas são atualizados
  // logo depois, sem bloquear nem derrubar a conexão caso alguma leitura falhe.
  await Promise.allSettled([loadIdentity(), refreshDashboard()]);
  await setupContractLiveListeners();
  startLiveBlockPolling();
  scheduleLiveRefresh("conexão");

  if (toast) showTx("success", "MetaMask", "Carteira conectada ao contrato local.");
  return true;
}

async function connectWallet() {
  if (!window.ethereum) return showTx("error", "MetaMask", "Instale ou habilite a MetaMask no navegador.");
  if (connectionBusy) return;

  connectionBusy = true;
  try {
    const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
    const chainHex = await window.ethereum.request({ method: "eth_chainId" });
    if (Number(BigInt(chainHex)) !== Number(CHAIN_ID)) {
      await addHardhatNetwork();
    }

    // Uma tentativa extra é útil quando MetaMask está terminando uma troca de conta.
    try {
      await setupConnection(accounts?.[0] || null, { toast: true });
    } catch (firstError) {
      const msg = friendlyError(firstError);
      if (!/coalesce|unknown error|json-rpc|rpc/i.test(msg)) throw firstError;
      await new Promise((resolve) => setTimeout(resolve, 250));
      const freshAccounts = await window.ethereum.request({ method: "eth_accounts" });
      await setupConnection(freshAccounts?.[0] || null, { toast: true });
    }
  } catch (error) {
    showTx("error", "Conexão", friendlyError(error));
  } finally {
    connectionBusy = false;
  }
}

async function switchWalletFromSite() {
  if (!window.ethereum) return showTx("error", "MetaMask", "MetaMask não encontrada no navegador.");
  try {
    // MetaMask abre o seletor de contas/permissões. A troca final continua sob controle do usuário.
    try {
      await window.ethereum.request({
        method: "wallet_requestPermissions",
        params: [{ eth_accounts: {} }]
      });
    } catch (permissionError) {
      // Algumas versões/carteiras podem não expor wallet_requestPermissions.
      await window.ethereum.request({ method: "eth_requestAccounts" });
    }
    const accounts = await window.ethereum.request({ method: "eth_accounts" });
    if (!accounts?.length) throw new Error("Nenhuma conta foi selecionada na MetaMask.");
    await setupConnection(accounts[0]);
    showTx("success", "Carteira", "Conta atualizada sem recarregar a página.");
  } catch (error) {
    showTx("error", "Trocar carteira", friendlyError(error));
  }
}

async function handleAccountsChanged(accounts) {
  if (connectionBusy) return;
  connectionBusy = true;
  try {
    if (!accounts?.length) {
      setDisconnectedUi("MetaMask desconectada");
      return;
    }
    await setupConnection(accounts[0]);
    showTx("success", "Carteira alterada", "Identidade e dados atualizados em tempo real.");
  } catch (error) {
    showTx("error", "Carteira alterada", friendlyError(error));
  } finally {
    connectionBusy = false;
  }
}

async function handleChainChanged() {
  if (connectionBusy) return;
  connectionBusy = true;
  try {
    const accounts = await window.ethereum.request({ method: "eth_accounts" });
    await setupConnection(accounts?.[0] || null);
    showTx("success", "Rede alterada", "Conexão atualizada sem F5.");
  } catch (error) {
    setDisconnectedUi("Rede incorreta");
    showTx("error", "Rede alterada", friendlyError(error));
  } finally {
    connectionBusy = false;
  }
}

async function loadIdentity() {
  currentOperator = null;
  currentOrganization = null;
  if (!contract || !currentAccount) return;
  $("#operatorValue").textContent = "—";
  $("#orgValue").textContent = "—";
  $("#roleBadge").textContent = "Sem operador";
  try {
    currentOperator = await contract.consultarOperadorPorCarteira(currentAccount);
    currentOrganization = await contract.consultarOrganizacaoPorId(currentOperator.organizacaoId);
    operatorCache.set(currentOperator.id, currentOperator);
    orgCache.set(currentOrganization.id, currentOrganization);
    $("#operatorValue").textContent = `${currentOperator.nome} (${currentOperator.idExterno})`;
    $("#orgValue").textContent = `${currentOrganization.nome} · ${PAPEL[Number(currentOrganization.papel)]}`;
    $("#roleBadge").textContent = PAPEL[Number(currentOrganization.papel)];
    $("#identityHelp").textContent = `Cargo: ${currentOperator.cargo || "—"} · Administrador: ${currentOperator.administrador ? "sim" : "não"} · Operador ativo: ${currentOperator.ativo ? "sim" : "não"}`;
  } catch {
    $("#identityHelp").textContent = "Esta carteira não possui operador cadastrado no contrato. Leituras públicas continuam possíveis, mas escritas protegidas serão recusadas.";
  }
}

async function refreshDashboard() {
  if (!contract) return;
  try {
    const [orgs, ops, lotes, transfers, audit, paused, regOrg, regOp] = await Promise.all([
      contract.totalOrganizacoes(),
      contract.totalOperadores(),
      contract.totalLotes(),
      contract.totalTransferencias(),
      contract.totalRegistrosAuditoria(),
      contract.sistemaPausado(),
      contract.organizacaoReguladoraInicialId(),
      contract.operadorReguladorInicialId()
    ]);
    $("#statOrgs").textContent = orgs.toString();
    $("#statOps").textContent = ops.toString();
    $("#statLotes").textContent = lotes.toString();
    $("#statTransfers").textContent = transfers.toString();
    $("#statAudit").textContent = audit.toString();
    $("#systemState").innerHTML = paused ? `<span class="dot danger"></span> Pausado` : `<span class="dot ok"></span> Ativo`;
    $("#governanceInfo").innerHTML = `
      <div class="kv"><b>Organização reguladora inicial</b><span>${copyable(regOrg)}</span></div>
      <div class="kv"><b>Operador regulador inicial</b><span>${copyable(regOp)}</span></div>
      <div class="kv"><b>Sistema pausado</b><span>${paused ? "Sim" : "Não"}</span></div>`;
  } catch (error) {
    console.warn("Dashboard:", error);
  }
}

function renderDemoAccounts() {
  const labels = {
    regulador: "#0 Regulador - Autoridade Sanitaria da Borborema",
    fabricante: "#1 Fabricante - Laboratorio Borborema Saude",
    distribuidorCampina: "#2 Distribuidor - Campina Farma",
    farmaciaCampina: "#3 Farmacia - Acude Velho",
    transportadorCampina: "#4 Transportador - TransBorborema",
    distribuidorPatos: "#5 Distribuidor - Sertao Farma (Patos)",
    farmaciaQueimadas: "#6 Farmacia - Serra Saude (Queimadas)",
    farmaciaEsperanca: "#7 Farmacia - Brejo Saude (Esperanca)",
    transportadorBoqueirao: "#8 Transportador - Rota Cariri (Boqueirao)",
    reserva: "#9 Conta reserva para testes"
  };
  const entries = Object.entries(demoAccounts || {});
  $("#demoAccounts").innerHTML = entries.length
    ? entries.map(([key, value]) => `<div class="kv"><b>${esc(labels[key] || key)}</b><span>${copyable(value)}</span></div>`).join("")
    : `<span class="help">Execute <b>npm run seed</b> para gerar as contas de demonstração.</span>`;
}

async function getOrg(id) {
  if (!id || id === ethers.ZeroHash) return null;
  if (orgCache.has(id)) return orgCache.get(id);
  try {
    const org = await contract.consultarOrganizacaoPorId(id);
    orgCache.set(id, org);
    return org;
  } catch {
    return null;
  }
}

async function getOperator(id) {
  if (!id || id === ethers.ZeroHash) return null;
  if (operatorCache.has(id)) return operatorCache.get(id);
  try {
    const op = await contract.consultarOperadorPorId(id);
    operatorCache.set(id, op);
    return op;
  } catch {
    return null;
  }
}

async function renderOrganization(org) {
  const history = await eventActorHistoryForOrganization(org);
  return `
    <div class="kv"><b>ID externo</b><span>${esc(org.idExterno)}</span></div>
    <div class="kv"><b>ID on-chain</b><span>${copyable(org.id)}</span></div>
    <div class="kv"><b>Nome</b><span>${esc(org.nome)}</span></div>
    <div class="kv"><b>Papel</b><span><span class="badge">${esc(PAPEL[Number(org.papel)])}</span></span></div>
    <div class="kv"><b>Ativa</b><span>${formatBool(org.ativa)}</span></div>
    <div class="kv"><b>Hash do documento</b><span>${copyable(org.documentoHash)}</span></div>
    <div class="kv"><b>Cadastrada em</b><span>${esc(formatDate(org.cadastradaEm))}</span></div>
    ${renderAdminHistory(history)}`;
}

async function renderOperator(op) {
  const org = await getOrg(op.organizacaoId);
  const history = await eventActorHistoryForOperator(op);
  return `
    <div class="kv"><b>ID externo</b><span>${esc(op.idExterno)}</span></div>
    <div class="kv"><b>ID on-chain</b><span>${copyable(op.id)}</span></div>
    <div class="kv"><b>Nome</b><span>${esc(op.nome)}</span></div>
    <div class="kv"><b>Cargo</b><span>${esc(op.cargo || "—")}</span></div>
    <div class="kv"><b>Carteira</b><span>${copyable(op.carteira)}</span></div>
    <div class="kv"><b>Organização</b><span>${esc(org ? `${org.nome} (${org.idExterno})` : op.organizacaoId)}</span></div>
    <div class="kv"><b>Ativo</b><span>${formatBool(op.ativo)}</span></div>
    <div class="kv"><b>Administrador</b><span>${formatBool(op.administrador)}</span></div>
    <div class="kv"><b>Cadastrado em</b><span>${esc(formatDate(op.cadastradoEm))}</span></div>
    ${renderAdminHistory(history)}`;
}

async function renderLote(lote) {
  const fabricante = await getOrg(lote.fabricanteOrganizacaoId);
  const audit = await lotPeopleSummary(lote.identificador);
  const first = audit.registros[0] || null;
  const last = audit.registros.length ? audit.registros[audit.registros.length - 1] : null;
  const creator = first ? await operatorSummary(first.operadorId) : null;
  const lastActor = last ? await operatorSummary(last.operadorId) : null;
  return `
    <div class="kv"><b>Identificador</b><span>${esc(lote.identificador)}</span></div>
    <div class="kv"><b>ID on-chain</b><span>${copyable(lote.id)}</span></div>
    <div class="kv"><b>Produto</b><span>${esc(lote.codigoProduto)} · ${esc(lote.descricaoProduto || "—")}</span></div>
    <div class="kv"><b>Status</b><span><span class="badge status-${Number(lote.status)}">${esc(STATUS_LOTE[Number(lote.status)])}</span></span></div>
    <div class="kv"><b>Fabricante</b><span>${esc(fabricante ? `${fabricante.nome} (${fabricante.idExterno})` : lote.fabricanteOrganizacaoId)}</span></div>
    <div class="kv"><b>Registrado/criado por</b><span>${esc(creator?.text || "—")}</span></div>
    <div class="kv"><b>Última ação por</b><span>${esc(lastActor?.text || "—")}</span></div>
    <div class="kv"><b>Pessoas envolvidas</b><span>${audit.people.length ? esc(audit.people.join(" | ")) : "—"}</span></div>
    <div class="kv"><b>Fabricação</b><span>${esc(formatDate(lote.dataFabricacao))}</span></div>
    <div class="kv"><b>Validade</b><span>${esc(formatDate(lote.dataValidade))}</span></div>
    <div class="kv"><b>Quantidade inicial</b><span>${esc(lote.quantidadeInicial)}</span></div>
    <div class="kv"><b>Em circulação</b><span>${esc(lote.quantidadeEmCirculacao)}</span></div>
    <div class="kv"><b>Dispensada</b><span>${esc(lote.quantidadeDispensada)}</span></div>
    <div class="kv"><b>Destruída</b><span>${esc(lote.quantidadeDestruida)}</span></div>
    <div class="kv"><b>Hash do laudo</b><span>${copyable(lote.hashLaudo)}</span></div>
    <div class="kv"><b>Hash de metadados</b><span>${copyable(lote.hashMetadados)}</span></div>
    <div class="kv"><b>Último hash de auditoria</b><span>${copyable(lote.ultimoHashAuditoria)}</span></div>
    <div class="kv"><b>Criado em</b><span>${esc(formatDate(lote.criadoEm))}</span></div>`;
}

async function renderTransfer(t) {
  const [origem, destino, transportadora, criador, expedidor, entregador, finalizador] = await Promise.all([
    getOrg(t.organizacaoOrigemId), getOrg(t.organizacaoDestinoId), getOrg(t.organizacaoTransportadoraId),
    getOperator(t.criadaPorOperadorId), getOperator(t.expedidaPorOperadorId), getOperator(t.entreguePorOperadorId), getOperator(t.finalizadaPorOperadorId)
  ]);
  const [criadorOrg, expedidorOrg, entregadorOrg, finalizadorOrg] = await Promise.all([
    criador ? getOrg(criador.organizacaoId) : null, expedidor ? getOrg(expedidor.organizacaoId) : null,
    entregador ? getOrg(entregador.organizacaoId) : null, finalizador ? getOrg(finalizador.organizacaoId) : null
  ]);
  const actor = (op, org) => op ? `${op.nome} (${op.idExterno}) · ${op.cargo || "Sem cargo"}${org ? ` · ${org.nome} (${org.idExterno})` : ""} · ${shortHex(op.carteira)}` : "—";
  return `
    <div class="kv"><b>ID</b><span>${copyable(t.id)}</span></div>
    <div class="kv"><b>Lote ID</b><span>${copyable(t.loteId)}</span></div>
    <div class="kv"><b>Tipo</b><span>${esc(TIPO_TRANSFERENCIA[Number(t.tipo)])}</span></div>
    <div class="kv"><b>Status</b><span><span class="badge transfer-${Number(t.status)}">${esc(STATUS_TRANSFERENCIA[Number(t.status)])}</span></span></div>
    <div class="kv"><b>Quantidade</b><span>${esc(t.quantidade)}</span></div>
    <div class="kv"><b>Origem</b><span>${esc(origem ? `${origem.nome} (${origem.idExterno})` : t.organizacaoOrigemId)}</span></div>
    <div class="kv"><b>Destino</b><span>${esc(destino ? `${destino.nome} (${destino.idExterno})` : t.organizacaoDestinoId)}</span></div>
    <div class="kv"><b>Transportadora</b><span>${esc(transportadora ? `${transportadora.nome} (${transportadora.idExterno})` : "Sem transportadora cadastrada")}</span></div>
    <div class="kv"><b>Criada por</b><span>${esc(actor(criador, criadorOrg))}</span></div>
    <div class="kv"><b>Expedida/coletada por</b><span>${esc(actor(expedidor, expedidorOrg))}</span></div>
    <div class="kv"><b>Entregue por</b><span>${esc(actor(entregador, entregadorOrg))}</span></div>
    <div class="kv"><b>Finalizada por</b><span>${esc(actor(finalizador, finalizadorOrg))}</span></div>
    <div class="kv"><b>Criada em</b><span>${esc(formatDate(t.criadaEm))}</span></div>
    <div class="kv"><b>Expedida/coletada em</b><span>${esc(formatDate(t.expedidaEm))}</span></div>
    <div class="kv"><b>Entregue em</b><span>${esc(formatDate(t.entregueEm))}</span></div>
    <div class="kv"><b>Finalizada em</b><span>${esc(formatDate(t.finalizadaEm))}</span></div>
    <div class="kv"><b>Local origem</b><span>${esc(t.localOrigem || "—")}</span></div>
    <div class="kv"><b>Local destino</b><span>${esc(t.localDestino || "—")}</span></div>
    <div class="kv"><b>Documento saída</b><span>${copyable(t.hashDocumentoSaida)}</span></div>
    <div class="kv"><b>Documento final</b><span>${copyable(t.hashDocumentoFinal)}</span></div>
    <div class="kv"><b>Observação</b><span>${esc(t.observacao || "—")}</span></div>`;
}

async function renderAuditRecord(registro, withIntegrity = false, lote = "") {
  const [op, orgOp, orgOrigem, orgDestino] = await Promise.all([
    getOperator(registro.operadorId),
    getOrg(registro.organizacaoOperadorId),
    getOrg(registro.organizacaoOrigemId),
    getOrg(registro.organizacaoDestinoId)
  ]);
  let integrity = null;
  if (withIntegrity && lote) {
    try { integrity = await contract.verificarIntegridadeRegistro(lote, registro.indiceNoLote); } catch { integrity = null; }
  }
  return `
    <article class="timeline-item">
      <div class="timeline-head">
        <div><span class="event-index">#${esc(registro.indiceNoLote)}</span><h4>${esc(TIPO_EVENTO[Number(registro.tipoEvento)] || `Evento ${registro.tipoEvento}`)}</h4></div>
        ${integrity === null ? "" : `<span class="integrity ${integrity ? "ok" : "bad"}">${integrity ? "Integridade OK" : "Integridade inválida"}</span>`}
      </div>
      <div class="audit-grid">
        <div><b>Operador</b><span>${esc(op ? `${op.nome} (${op.idExterno})` : shortHex(registro.operadorId))}</span></div>
        <div><b>Carteira que assinou</b><span class="mono break">${esc(registro.carteiraOperador)}</span></div>
        <div><b>Organização do operador</b><span>${esc(orgOp ? `${orgOp.nome} (${orgOp.idExterno})` : shortHex(registro.organizacaoOperadorId))}</span></div>
        <div><b>Data/hora</b><span>${esc(formatDate(registro.dataHora))}</span></div>
        <div><b>Origem</b><span>${esc(orgOrigem ? `${orgOrigem.nome} (${orgOrigem.idExterno})` : registro.organizacaoOrigemId === ethers.ZeroHash ? "—" : shortHex(registro.organizacaoOrigemId))}</span></div>
        <div><b>Destino</b><span>${esc(orgDestino ? `${orgDestino.nome} (${orgDestino.idExterno})` : registro.organizacaoDestinoId === ethers.ZeroHash ? "—" : shortHex(registro.organizacaoDestinoId))}</span></div>
        <div><b>Quantidade</b><span>${esc(registro.quantidade)}</span></div>
        <div><b>Localização</b><span>${esc(registro.localizacao || "—")}</span></div>
        <div><b>Transferência</b><span class="mono break">${esc(registro.transferenciaId === ethers.ZeroHash ? "—" : registro.transferenciaId)}</span></div>
        <div><b>Sequência global</b><span>${esc(registro.sequenciaGlobal)}</span></div>
      </div>
      <div class="audit-hashes">
        <div><b>Hash do documento</b>${copyable(registro.hashDocumento)}</div>
        <div><b>Hash anterior</b>${copyable(registro.hashAnterior)}</div>
        <div><b>Hash deste registro</b>${copyable(registro.hashRegistro)}</div>
      </div>
      ${registro.observacao ? `<p class="audit-note"><b>Observação:</b> ${esc(registro.observacao)}</p>` : ""}
    </article>`;
}

async function loadOrganizations(track = true) {
  requireContract();
  const container = $("#listaOrganizacoes");
  const preservedConsultation = !track ? preservedConsultationHtml(container) : "";
  container.innerHTML = `<p class="help">Carregando...</p>`;
  try {
    const ids = await contract.listarOrganizacoes(0, 100);
    const orgs = await Promise.all(ids.map((id) => getOrg(id)));
    const cards = [];
    for (const org of orgs.filter(Boolean)) {
      const history = await eventActorHistoryForOrganization(org);
      const created = history.find((h) => h.label === "Organização cadastrada por");
      cards.push(`<article class="list-card"><div class="list-card-head"><strong>${esc(org.nome)}</strong><span class="badge">${esc(PAPEL[Number(org.papel)])}</span></div><p>${esc(org.idExterno)} · ${org.ativa ? "Ativa" : "Inativa"}</p><p><b>Cadastrada por:</b> ${esc(created?.actor || "—")}</p><span class="mono">${esc(shortHex(org.id))}</span></article>`);
    }
    const entry = track ? recordConsultation("Listar organizações", "Todas as organizações", `${cards.length} resultado(s)`) : null;
    container.innerHTML = `${entry ? consultationContext(entry) : preservedConsultation}${cards.length ? cards.join("") : `<p class="help">Nenhuma organização.</p>`}`;
  } catch (error) { container.innerHTML = `<p class="error-text">${esc(friendlyError(error))}</p>`; }
}

async function loadOperators(track = true) {
  requireContract();
  const container = $("#listaOperadores");
  const preservedConsultation = !track ? preservedConsultationHtml(container) : "";
  container.innerHTML = `<p class="help">Carregando...</p>`;
  try {
    const ids = await contract.listarOperadores(0, 100);
    const ops = await Promise.all(ids.map((id) => getOperator(id)));
    const cards = [];
    for (const op of ops.filter(Boolean)) {
      const org = await getOrg(op.organizacaoId);
      const history = await eventActorHistoryForOperator(op);
      const created = history.find((h) => h.label === "Operador cadastrado por");
      cards.push(`<article class="list-card"><div class="list-card-head"><strong>${esc(op.nome)}</strong><span class="badge">${op.ativo ? "Ativo" : "Inativo"}</span></div><p>${esc(op.idExterno)} · ${esc(op.cargo || "Sem cargo")}</p><p>${esc(org ? `${org.nome} · ${PAPEL[Number(org.papel)]}` : shortHex(op.organizacaoId))}</p><p><b>Cadastrado por:</b> ${esc(created?.actor || "—")}</p><span class="mono">${esc(shortHex(op.carteira))}</span></article>`);
    }
    const entry = track ? recordConsultation("Listar operadores", "Todos os operadores", `${cards.length} resultado(s)`) : null;
    container.innerHTML = `${entry ? consultationContext(entry) : preservedConsultation}${cards.length ? cards.join("") : `<p class="help">Nenhum operador.</p>`}`;
  } catch (error) { container.innerHTML = `<p class="error-text">${esc(friendlyError(error))}</p>`; }
}

async function loadLots(track = true) {
  requireContract();
  const container = $("#listaLotes");
  const preservedConsultation = !track ? preservedConsultationHtml(container) : "";
  container.innerHTML = `<p class="help">Carregando...</p>`;
  try {
    const ids = await contract.listarLotes(0, 100);
    const lots = await Promise.all(ids.map((id) => contract.consultarLotePorId(id)));
    const lotCards = [];
    for (const l of lots) {
      const people = await lotPeopleSummary(l.identificador);
      lotCards.push(`<article class="list-card"><div class="list-card-head"><strong>${esc(l.identificador)}</strong><span class="badge status-${Number(l.status)}">${esc(STATUS_LOTE[Number(l.status)])}</span></div><p>${esc(l.codigoProduto)} · ${esc(l.descricaoProduto || "—")}</p><p>Circulação: <b>${esc(l.quantidadeEmCirculacao)}</b> / inicial ${esc(l.quantidadeInicial)}</p><p><b>Pessoas envolvidas:</b> ${people.people.length ? esc(people.people.join(" | ")) : "—"}</p></article>`);
    }
    const entry = track ? recordConsultation("Listar lotes", "Todos os lotes", `${lots.length} resultado(s)`) : null;
    container.innerHTML = `${entry ? consultationContext(entry) : preservedConsultation}${lotCards.length ? lotCards.join("") : `<p class="help">Nenhum lote.</p>`}`;
  } catch (error) { container.innerHTML = `<p class="error-text">${esc(friendlyError(error))}</p>`; }
}

async function loadTransfers(track = true) {
  requireContract();
  const container = $("#listaTransferencias");
  const preservedConsultation = !track ? preservedConsultationHtml(container) : "";
  container.innerHTML = `<p class="help">Carregando...</p>`;
  try {
    const ids = await contract.listarTransferencias(0, 100);
    const transfers = await Promise.all(ids.map((id) => contract.consultarTransferencia(id)));
    const cards = [];
    for (const t of transfers) {
      const [origem, destino, criador, expedidor, entregador, finalizador] = await Promise.all([
        getOrg(t.organizacaoOrigemId), getOrg(t.organizacaoDestinoId),
        operatorSummary(t.criadaPorOperadorId), operatorSummary(t.expedidaPorOperadorId),
        operatorSummary(t.entreguePorOperadorId), operatorSummary(t.finalizadaPorOperadorId)
      ]);
      const people = [criador.text, expedidor.text, entregador.text, finalizador.text].filter((x, i, a) => x && x !== "—" && a.indexOf(x) === i);
      cards.push(`<article class="list-card"><div class="list-card-head"><strong>${esc(TIPO_TRANSFERENCIA[Number(t.tipo)])}</strong><span class="badge transfer-${Number(t.status)}">${esc(STATUS_TRANSFERENCIA[Number(t.status)])}</span></div><p>${esc(origem?.idExterno || shortHex(t.organizacaoOrigemId))} → ${esc(destino?.idExterno || shortHex(t.organizacaoDestinoId))} · ${esc(t.quantidade)} un.</p><p><b>Pessoas envolvidas:</b> ${people.length ? esc(people.join(" | ")) : "—"}</p><span class="mono">${esc(shortHex(t.id))}</span></article>`);
    }
    const entry = track ? recordConsultation("Listar transferências", "Todas as transferências", `${cards.length} resultado(s)`) : null;
    container.innerHTML = `${entry ? consultationContext(entry) : preservedConsultation}${cards.length ? cards.join("") : `<p class="help">Nenhuma transferência.</p>`}`;
  } catch (error) { container.innerHTML = `<p class="error-text">${esc(friendlyError(error))}</p>`; }
}

function preservedConsultationHtml(container) {
  if (!container) return "";
  const first = container.firstElementChild;
  if (!first?.classList?.contains("mini-record")) return "";
  const title = first.querySelector(".list-card-head strong")?.textContent?.trim();
  return title === "Consulta registrada" ? first.outerHTML : "";
}

function resultHasContent(selector) {
  const el = $(selector);
  return Boolean(el && el.innerHTML.trim());
}

function formValue(formId, name) {
  const form = document.getElementById(formId);
  const field = form?.elements?.[name];
  return String(field?.value || "").trim();
}

function setResultPreservingConsultation(selector, body) {
  const container = $(selector);
  if (!container) return;
  const preserved = preservedConsultationHtml(container);
  container.innerHTML = preserved + body;
}

async function refreshLoadedQueryResults() {
  if (!contract) return;

  // Organização consultada
  if (resultHasContent("#resultadoOrganizacao")) {
    const id = formValue("formConsultarOrganizacao", "id");
    if (id) {
      try { setResultPreservingConsultation("#resultadoOrganizacao", await renderOrganization(await contract.consultarOrganizacao(id))); } catch {}
    }
  }

  // Operador consultado
  if (resultHasContent("#resultadoOperador")) {
    const id = formValue("formConsultarOperador", "id");
    if (id) {
      try { setResultPreservingConsultation("#resultadoOperador", await renderOperator(await contract.consultarOperador(id))); } catch {}
    }
  }

  // Operadores da organização
  if (resultHasContent("#resultadoOpsOrganizacao")) {
    const organizacao = formValue("formOpsOrganizacao", "organizacao");
    if (organizacao) {
      try {
        const ids = await contract.listarOperadoresOrganizacao(organizacao, 0, 100);
        const ops = await Promise.all(ids.map((id) => getOperator(id)));
        const html = [];
        for (const op of ops.filter(Boolean)) html.push(`<article class="mini-record">${await renderOperator(op)}</article>`);
        setResultPreservingConsultation("#resultadoOpsOrganizacao", html.length ? html.join("") : `<p class="help">Nenhum operador nesta organização.</p>`);
      } catch {}
    }
  }

  // Lote consultado
  if (resultHasContent("#resultadoLote")) {
    const identificador = formValue("formConsultarLote", "identificador");
    if (identificador) {
      try { setResultPreservingConsultation("#resultadoLote", await renderLote(await contract.consultarLote(identificador))); } catch {}
    }
  }

  // Verificação resumida de lote
  if (resultHasContent("#resultadoVerificarLote")) {
    const identificador = formValue("formVerificarLote", "identificador");
    if (identificador) {
      try {
        const r = await contract.verificarLote(identificador);
        const people = r.registrado ? await lotPeopleSummary(identificador) : { people: [] };
        setResultPreservingConsultation("#resultadoVerificarLote", `
          <div class="kv"><b>Registrado</b><span>${formatBool(r.registrado)}</span></div>
          <div class="kv"><b>Pessoas envolvidas</b><span>${people.people.length ? esc(people.people.join(" | ")) : "—"}</span></div>
          <div class="kv"><b>Dentro da validade</b><span>${formatBool(r.dentroDaValidade)}</span></div>
          <div class="kv"><b>Status</b><span>${esc(STATUS_LOTE[Number(r.status)])}</span></div>
          <div class="kv"><b>Quantidade em circulação</b><span>${esc(r.quantidadeEmCirculacao)}</span></div>
          <div class="kv"><b>Último hash de auditoria</b><span>${copyable(r.ultimoHashAuditoria)}</span></div>`);
      } catch {}
    }
  }

  // Saldo por organização
  if (resultHasContent("#resultadoSaldoLote")) {
    const lote = formValue("formSaldoLote", "lote");
    const organizacao = formValue("formSaldoLote", "organizacao");
    if (lote && organizacao) {
      try {
        const r = await contract.consultarSaldoLote(lote, organizacao);
        setResultPreservingConsultation("#resultadoSaldoLote", `<div class="kv"><b>Saldo total</b><span>${esc(r.saldoTotal)}</span></div><div class="kv"><b>Reservado em transferências</b><span>${esc(r.saldoReservado)}</span></div><div class="kv"><b>Disponível</b><span>${esc(r.saldoDisponivel)}</span></div>`);
      } catch {}
    }
  }

  // Cadeia de custódia
  if (resultHasContent("#resultadoCustodiaLote")) {
    const lote = formValue("formCustodiaLote", "lote");
    if (lote) {
      try {
        const ids = await contract.listarOrganizacoesComCustodiaLote(lote, 0, 100);
        const rows = [];
        for (const id of ids) {
          const org = await getOrg(id);
          if (!org) continue;
          const saldo = await contract.consultarSaldoLote(lote, org.idExterno);
          rows.push(`<tr><td>${esc(org.nome)}</td><td>${esc(org.idExterno)}</td><td>${esc(PAPEL[Number(org.papel)])}</td><td>${esc(saldo.saldoTotal)}</td><td>${esc(saldo.saldoReservado)}</td><td><b>${esc(saldo.saldoDisponivel)}</b></td></tr>`);
        }
        const people = await lotPeopleSummary(lote);
        const body = `<div class="kv"><b>Pessoas envolvidas no histórico</b><span>${people.people.length ? esc(people.people.join(" | ")) : "—"}</span></div>` + (rows.length ? `<div class="table-wrap"><table><thead><tr><th>Organização</th><th>ID</th><th>Papel</th><th>Total</th><th>Reservado</th><th>Disponível</th></tr></thead><tbody>${rows.join("")}</tbody></table></div>` : `<p class="help">Nenhuma organização indexada para o lote.</p>`);
        setResultPreservingConsultation("#resultadoCustodiaLote", body);
      } catch {}
    }
  }

  // Transferência consultada
  if (resultHasContent("#resultadoTransferencia")) {
    const id = formValue("formConsultarTransferencia", "id");
    if (id) {
      try { setResultPreservingConsultation("#resultadoTransferencia", await renderTransfer(await contract.consultarTransferencia(id))); } catch {}
    }
  }

  // Transferências do lote
  if (resultHasContent("#resultadoTransferenciasLote")) {
    const lote = formValue("formTransferenciasLote", "lote");
    if (lote) {
      try {
        const total = await contract.quantidadeTransferenciasLote(lote);
        const ids = await contract.listarTransferenciasLote(lote, 0, 100);
        const html = [];
        for (const id of ids) html.push(`<article class="mini-record">${await renderTransfer(await contract.consultarTransferencia(id))}</article>`);
        setResultPreservingConsultation("#resultadoTransferenciasLote", `<p class="help">Total no lote: ${esc(total)}</p>${html.length ? html.join("") : `<p class="help">Nenhuma transferência.</p>`}`);
      } catch {}
    }
  }

  // Auditoria completa
  if (resultHasContent("#resultadoAuditoria")) {
    const lote = formValue("formAuditoria", "lote");
    if (lote) {
      try {
        const total = await contract.quantidadeRegistrosHistorico(lote);
        const registros = await contract.consultarHistorico(lote, 0, 100);
        const cards = [];
        for (const registro of registros) cards.push(await renderAuditRecord(registro, true, lote));
        setResultPreservingConsultation("#resultadoAuditoria", `<p class="help">${esc(total)} registro(s) no histórico.</p>${cards.length ? cards.join("") : `<p class="help">Nenhum registro.</p>`}`);
      } catch {}
    }
  }

  // Registro individual de auditoria
  if (resultHasContent("#resultadoRegistroAuditoria")) {
    const lote = formValue("formRegistroAuditoria", "lote");
    const indice = formValue("formRegistroAuditoria", "indice");
    if (lote && indice !== "") {
      try { setResultPreservingConsultation("#resultadoRegistroAuditoria", await renderAuditRecord(await contract.consultarRegistroHistorico(lote, BigInt(indice)), true, lote)); } catch {}
    }
  }

  // Integridade
  if (resultHasContent("#resultadoIntegridade")) {
    const lote = formValue("formIntegridade", "lote");
    const indice = formValue("formIntegridade", "indice");
    if (lote && indice !== "") {
      try {
        const ok = await contract.verificarIntegridadeRegistro(lote, BigInt(indice));
        setResultPreservingConsultation("#resultadoIntegridade", `<div class="integrity-result ${ok ? "ok" : "bad"}">${ok ? "✓ Registro íntegro: o hash recalculado coincide com o hash armazenado." : "✕ Falha de integridade: o hash não coincide."}</div>`);
      } catch {}
    }
  }

  // Saldo por IDs on-chain
  if (resultHasContent("#resultadoSaldoPorIds")) {
    const loteId = formValue("formSaldoPorIds", "loteId");
    const organizacaoId = formValue("formSaldoPorIds", "organizacaoId");
    if (loteId && organizacaoId) {
      try {
        const saldo = await contract.saldoDisponivelPorIds(loteId, organizacaoId);
        setResultPreservingConsultation("#resultadoSaldoPorIds", `<div class="kv"><b>Saldo disponível</b><span>${esc(saldo)}</span></div>`);
      } catch {}
    }
  }
}

async function refreshLiveViews(reason = "atualização") {
  if (!contract || liveRefreshInProgress) return;
  liveRefreshInProgress = true;
  try {
    orgCache.clear();
    operatorCache.clear();
    await Promise.allSettled([refreshDashboard(), loadIdentity()]);
    await refreshReferenceSelects();

    const listTasks = [];
    if (resultHasContent("#listaOrganizacoes")) listTasks.push(loadOrganizations(false));
    if (resultHasContent("#listaOperadores")) listTasks.push(loadOperators(false));
    if (resultHasContent("#listaLotes")) listTasks.push(loadLots(false));
    if (resultHasContent("#listaTransferencias")) listTasks.push(loadTransfers(false));
    await Promise.allSettled(listTasks);
    await refreshLoadedQueryResults();
  } catch (error) {
    console.warn(`Atualização em tempo real (${reason}):`, error);
  } finally {
    liveRefreshInProgress = false;
  }
}

function scheduleLiveRefresh(reason = "evento") {
  clearTimeout(liveRefreshTimer);
  liveRefreshTimer = setTimeout(() => refreshLiveViews(reason), 650);
}

// Em Hardhat local, subscriptions/polling via MetaMask podem
// enxergar um bloco alguns milissegundos antes de eth_blockNumber confirmá-lo.
// Isso causa erros como "Received invalid block tag 11. Latest block number is 10".
// Portanto, o tempo real usa somente o RPC direto do Hardhat para confirmar blocos.
async function setupContractLiveListeners() {
  try { await liveEventContract?.removeAllListeners?.(); } catch {}
  liveEventContract = null;
}

let pendingStableBlock = null;
let pendingStableCount = 0;

async function rawBlockNumber() {
  if (!provider) return null;
  return await provider.getBlockNumber();
}

function startLiveBlockPolling() {
  if (livePollTimer) return;
  livePollTimer = setInterval(async () => {
    if (!provider || !contract || document.hidden || connectionBusy) return;
    try {
      const block = await rawBlockNumber();
      if (!Number.isFinite(block)) return;

      if (lastSeenBlock === null) {
        lastSeenBlock = block;
        pendingStableBlock = null;
        pendingStableCount = 0;
        return;
      }

      // Hardhat foi reiniciado/resetado: aceita imediatamente o número menor.
      if (block < lastSeenBlock) {
        lastSeenBlock = block;
        pendingStableBlock = null;
        pendingStableCount = 0;
        scheduleLiveRefresh(`rede reiniciada no bloco #${block}`);
        return;
      }

      if (block === lastSeenBlock) {
        pendingStableBlock = null;
        pendingStableCount = 0;
        return;
      }

      // Só considera um bloco novo após ele aparecer em duas consultas consecutivas.
      // Isso evita consultar logs/estado enquanto MetaMask e Hardhat ainda sincronizam.
      if (pendingStableBlock === block) pendingStableCount += 1;
      else {
        pendingStableBlock = block;
        pendingStableCount = 1;
      }

      if (pendingStableCount >= 2) {
        lastSeenBlock = block;
        pendingStableBlock = null;
        pendingStableCount = 0;
        scheduleLiveRefresh(`novo bloco confirmado #${block}`);
      }
    } catch (error) {
      // Erros transitórios do RPC local não devem desconectar nem incomodar o usuário.
      console.debug("Polling Hardhat aguardando RPC estabilizar:", friendlyError(error));
    }
  }, 2200);
}

async function restoreWalletSilently() {
  if (!window.ethereum || !CONTRACT_ADDRESS || !CONTRACT_ABI?.length || connectionBusy) return;
  connectionBusy = true;
  try {
    const accounts = await window.ethereum.request({ method: "eth_accounts" });
    if (accounts?.length) await setupConnection(accounts[0]);
  } catch (error) {
    console.warn("Restauração da carteira:", error);
  } finally {
    connectionBusy = false;
  }
}

function bindForm(id, handler) {
  const form = document.getElementById(id);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    try { await handler(event.currentTarget, dataOf(event.currentTarget)); }
    catch (error) { if (!String(error?.message || "").includes("Conecte")) console.warn(error); }
  });
}

function resultError(selector, error) {
  $(selector).innerHTML = `<p class="error-text">${esc(friendlyError(error))}</p>`;
}

// Navegação e conexão
$("#btnNetwork").addEventListener("click", addHardhatNetwork);
$("#btnSwitchAccount").addEventListener("click", switchWalletFromSite);
$("#btnConnect").addEventListener("click", connectWallet);
$("#btnClearTx").addEventListener("click", () => { txHistory = []; renderTxHistory(); });
$("#btnClearConsultas").addEventListener("click", () => { consultationHistory = []; saveConsultationHistory(); renderConsultationHistory(); });

$$('.tab').forEach((tab) => tab.addEventListener("click", () => {
  $$('.tab').forEach((t) => t.classList.remove("active"));
  $$('.panel').forEach((p) => p.classList.remove("active"));
  tab.classList.add("active");
  document.getElementById(tab.dataset.panel).classList.add("active");
}));

document.addEventListener("click", async (event) => {
  const btn = event.target.closest("[data-copy]");
  if (!btn) return;
  try {
    await navigator.clipboard.writeText(btn.dataset.copy);
    const old = btn.textContent;
    btn.textContent = "Copiado";
    setTimeout(() => { btn.textContent = old; }, 1000);
  } catch { showTx("error", "Copiar", "Não foi possível copiar automaticamente."); }
});


// Selects dinâmicos dependentes do fluxo de transferência
const transferTypeField = document.getElementById("formTransferencia")?.elements?.tipo;
const transferLotField = document.getElementById("formTransferencia")?.elements?.lote;
transferTypeField?.addEventListener("change", () => renderReferenceSelects());
transferLotField?.addEventListener("change", () => renderReferenceSelects());

// Organizações
$("#btnLoadOrgs").addEventListener("click", async () => { try { await loadOrganizations(true); } catch (e) { resultError("#listaOrganizacoes", e); } });
bindForm("formConsultarOrganizacao", async (_form, data) => {
  requireContract();
  try {
    const org = await contract.consultarOrganizacao(data.id.trim());
    const entry = recordConsultation("Consultar organização", org.idExterno, org.nome);
    $("#resultadoOrganizacao").innerHTML = consultationContext(entry) + await renderOrganization(org);
  } catch (e) { resultError("#resultadoOrganizacao", e); }
});
bindForm("formOrganizacao", async (_form, data) => {
  await executeContractTx("Cadastrar organização", "cadastrarOrganizacao", [[data.id.trim(), data.nome.trim(), toHash(data.documento), Number(data.papel)]]);
  await loadOrganizations(false);
});
bindForm("formStatusOrganizacao", async (_form, data) => {
  await executeContractTx("Alterar status da organização", "alterarStatusOrganizacao", [data.id.trim(), data.ativa === "true", data.motivo.trim()]);
  await loadOrganizations(false);
});

// Operadores
$("#btnLoadOps").addEventListener("click", async () => { try { await loadOperators(true); } catch (e) { resultError("#listaOperadores", e); } });
bindForm("formConsultarOperador", async (_form, data) => {
  requireContract();
  try {
    const op = await contract.consultarOperador(data.id.trim());
    const entry = recordConsultation("Consultar operador", op.idExterno, op.nome);
    $("#resultadoOperador").innerHTML = consultationContext(entry) + await renderOperator(op);
  } catch (e) { resultError("#resultadoOperador", e); }
});
bindForm("formOperador", async (form, data) => {
  await executeContractTx("Cadastrar operador", "cadastrarOperador", [[data.id.trim(), data.nome.trim(), data.cargo.trim(), data.carteira.trim(), data.organizacao.trim(), form.elements.administrador.checked]]);
  await loadOperators(false);
});
bindForm("formStatusOperador", async (_form, data) => {
  await executeContractTx("Alterar status do operador", "alterarStatusOperador", [data.id.trim(), data.ativo === "true", data.motivo.trim()]);
  await loadOperators(false);
});
bindForm("formCarteiraOperador", async (_form, data) => {
  await executeContractTx("Alterar carteira do operador", "alterarCarteiraOperador", [data.id.trim(), data.carteira.trim(), data.motivo.trim()]);
  await loadOperators(false);
});
bindForm("formOpsOrganizacao", async (_form, data) => {
  requireContract();
  const container = $("#resultadoOpsOrganizacao");
  try {
    const ids = await contract.listarOperadoresOrganizacao(data.organizacao.trim(), 0, 100);
    const ops = await Promise.all(ids.map((id) => getOperator(id)));
    const html = [];
    for (const op of ops.filter(Boolean)) html.push(`<article class="mini-record">${await renderOperator(op)}</article>`);
    const entry = recordConsultation("Listar operadores da organização", data.organizacao.trim(), `${html.length} operador(es)`);
    container.innerHTML = consultationContext(entry) + (html.length ? html.join("") : `<p class="help">Nenhum operador nesta organização.</p>`);
  } catch (e) { resultError("#resultadoOpsOrganizacao", e); }
});

// Lotes e custódia
$("#btnLoadLotes").addEventListener("click", async () => { try { await loadLots(true); } catch (e) { resultError("#listaLotes", e); } });
bindForm("formLote", async (_form, data) => {
  await executeContractTx("Registrar lote", "registrarLote", [[
    data.identificador.trim(), data.codigoProduto.trim(), data.descricaoProduto.trim(),
    unixFromDate(data.dataFabricacao), unixFromDate(data.dataValidade), BigInt(data.quantidadeInicial),
    toHash(data.laudo, true), toHash(data.metadados), data.localizacao.trim(), data.observacao.trim()
  ]]);
  await loadLots(false);
});
bindForm("formConsultarLote", async (_form, data) => {
  requireContract();
  try {
    const lote = await contract.consultarLote(data.identificador.trim());
    const entry = recordConsultation("Consultar lote", lote.identificador, `${lote.codigoProduto} · ${lote.descricaoProduto || ""}`);
    $("#resultadoLote").innerHTML = consultationContext(entry) + await renderLote(lote);
  } catch (e) { resultError("#resultadoLote", e); }
});
bindForm("formVerificarLote", async (_form, data) => {
  requireContract();
  try {
    const r = await contract.verificarLote(data.identificador.trim());
    const people = r.registrado ? await lotPeopleSummary(data.identificador.trim()) : { people: [] };
    const entry = recordConsultation("Verificar lote", data.identificador.trim(), `Status: ${STATUS_LOTE[Number(r.status)]}`);
    $("#resultadoVerificarLote").innerHTML = consultationContext(entry) + `
      <div class="kv"><b>Registrado</b><span>${formatBool(r.registrado)}</span></div>
      <div class="kv"><b>Pessoas envolvidas</b><span>${people.people.length ? esc(people.people.join(" | ")) : "—"}</span></div>
      <div class="kv"><b>Dentro da validade</b><span>${formatBool(r.dentroDaValidade)}</span></div>
      <div class="kv"><b>Status</b><span>${esc(STATUS_LOTE[Number(r.status)])}</span></div>
      <div class="kv"><b>Quantidade em circulação</b><span>${esc(r.quantidadeEmCirculacao)}</span></div>
      <div class="kv"><b>Último hash de auditoria</b><span>${copyable(r.ultimoHashAuditoria)}</span></div>`;
  } catch (e) { resultError("#resultadoVerificarLote", e); }
});
bindForm("formSaldoLote", async (_form, data) => {
  requireContract();
  try {
    const r = await contract.consultarSaldoLote(data.lote.trim(), data.organizacao.trim());
    const entry = recordConsultation("Consultar saldo do lote", `${data.lote.trim()} / ${data.organizacao.trim()}`, `Disponível: ${r.saldoDisponivel}`);
    $("#resultadoSaldoLote").innerHTML = consultationContext(entry) + `<div class="kv"><b>Saldo total</b><span>${esc(r.saldoTotal)}</span></div><div class="kv"><b>Reservado em transferências</b><span>${esc(r.saldoReservado)}</span></div><div class="kv"><b>Disponível</b><span>${esc(r.saldoDisponivel)}</span></div>`;
  } catch (e) { resultError("#resultadoSaldoLote", e); }
});
bindForm("formCustodiaLote", async (_form, data) => {
  requireContract();
  const container = $("#resultadoCustodiaLote");
  try {
    const ids = await contract.listarOrganizacoesComCustodiaLote(data.lote.trim(), 0, 100);
    const rows = [];
    for (const id of ids) {
      const org = await getOrg(id);
      if (!org) continue;
      const saldo = await contract.consultarSaldoLote(data.lote.trim(), org.idExterno);
      rows.push(`<tr><td>${esc(org.nome)}</td><td>${esc(org.idExterno)}</td><td>${esc(PAPEL[Number(org.papel)])}</td><td>${esc(saldo.saldoTotal)}</td><td>${esc(saldo.saldoReservado)}</td><td><b>${esc(saldo.saldoDisponivel)}</b></td></tr>`);
    }
    const people = await lotPeopleSummary(data.lote.trim());
    const entry = recordConsultation("Consultar cadeia de custódia", data.lote.trim(), `${rows.length} organização(ões) com custódia`);
    container.innerHTML = consultationContext(entry) + `<div class="kv"><b>Pessoas envolvidas no histórico</b><span>${people.people.length ? esc(people.people.join(" | ")) : "—"}</span></div>` + (rows.length ? `<div class="table-wrap"><table><thead><tr><th>Organização</th><th>ID</th><th>Papel</th><th>Total</th><th>Reservado</th><th>Disponível</th></tr></thead><tbody>${rows.join("")}</tbody></table></div>` : `<p class="help">Nenhuma organização indexada para o lote.</p>`);
  } catch (e) { resultError("#resultadoCustodiaLote", e); }
});

// Transferências
$("#btnLoadTransfers").addEventListener("click", async () => { try { await loadTransfers(true); } catch (e) { resultError("#listaTransferencias", e); } });
bindForm("formTransferencia", async (_form, data) => {
  const transferArgs = [[
    data.lote.trim(), data.destino.trim(), data.transportadora.trim(), Number(data.tipo), BigInt(data.quantidade),
    data.localOrigem.trim(), toHash(data.documento), data.observacao.trim()
  ]];
  const receipt = await executeContractTx("Criar transferência", "criarTransferencia", transferArgs);
  let id = "";
  for (const log of receipt.logs) {
    try {
      const parsed = contract.interface.parseLog(log);
      if (parsed?.name === "TransferenciaCriada") { id = parsed.args.transferenciaId; break; }
    } catch {}
  }
  $("#transferenciaCriada").innerHTML = id ? `<div class="kv"><b>ID criado</b><span>${copyable(id)}</span></div><p class="help">Use este ID nas próximas etapas do fluxo.</p>` : `<p class="help">Transferência criada; consulte a lista global para localizar o ID.</p>`;
  await loadTransfers(false);
});
bindForm("formConsultarTransferencia", async (_form, data) => {
  requireContract();
  try {
    const t = await contract.consultarTransferencia(data.id.trim());
    const entry = recordConsultation("Consultar transferência", data.id.trim(), `${TIPO_TRANSFERENCIA[Number(t.tipo)]} · ${STATUS_TRANSFERENCIA[Number(t.status)]}`);
    $("#resultadoTransferencia").innerHTML = consultationContext(entry) + await renderTransfer(t);
  } catch (e) { resultError("#resultadoTransferencia", e); }
});
bindForm("formTransferenciasLote", async (_form, data) => {
  requireContract();
  const container = $("#resultadoTransferenciasLote");
  try {
    const total = await contract.quantidadeTransferenciasLote(data.lote.trim());
    const ids = await contract.listarTransferenciasLote(data.lote.trim(), 0, 100);
    const html = [];
    for (const id of ids) html.push(`<article class="mini-record">${await renderTransfer(await contract.consultarTransferencia(id))}</article>`);
    const entry = recordConsultation("Listar transferências do lote", data.lote.trim(), `${total} transferência(ões)`);
    container.innerHTML = consultationContext(entry) + `<p class="help">Total no lote: ${esc(total)}</p>${html.length ? html.join("") : `<p class="help">Nenhuma transferência.</p>`}`;
  } catch (e) { resultError("#resultadoTransferenciasLote", e); }
});
bindForm("formExpedicao", async (_form, data) => executeContractTx("Confirmar expedição", "confirmarExpedicao", [data.id.trim(), data.local.trim(), toHash(data.documento), data.observacao.trim()]));
bindForm("formRecebimento", async (_form, data) => executeContractTx("Confirmar recebimento", "confirmarRecebimento", [data.id.trim(), data.local.trim(), toHash(data.documento), data.observacao.trim()]));
bindForm("formRecusarRecebimento", async (_form, data) => executeContractTx("Recusar recebimento", "recusarRecebimento", [data.id.trim(), data.local.trim(), toHash(data.documento), data.motivo.trim()]));
bindForm("formCancelarTransferencia", async (_form, data) => executeContractTx("Cancelar transferência", "cancelarTransferencia", [data.id.trim(), data.motivo.trim()]));

// Transporte
bindForm("formColeta", async (_form, data) => executeContractTx("Confirmar coleta da transportadora", "confirmarColetaTransportador", [data.id.trim(), data.local.trim(), toHash(data.documento), data.observacao.trim()]));
bindForm("formAtualizacaoTransporte", async (_form, data) => executeContractTx("Registrar atualização de transporte", "registrarAtualizacaoTransporte", [data.id.trim(), data.local.trim(), toHash(data.documento), data.observacao.trim()]));
bindForm("formEntregaTransportador", async (_form, data) => executeContractTx("Confirmar entrega da transportadora", "confirmarEntregaTransportador", [data.id.trim(), data.local.trim(), toHash(data.documento), data.observacao.trim()]));

// Rastreabilidade operacional e regulatória
bindForm("formPausaSistema", async (_form, data) => executeContractTx("Alterar pausa do sistema", "alterarPausaSistema", [data.pausado === "true", data.motivo.trim()]));
bindForm("formBloquearLote", async (_form, data) => executeContractTx("Bloquear lote", "bloquearLote", [data.lote.trim(), data.local.trim(), toHash(data.documento), data.motivo.trim()]));
bindForm("formDesbloquearLote", async (_form, data) => executeContractTx("Desbloquear lote", "desbloquearLote", [data.lote.trim(), data.local.trim(), toHash(data.documento), data.motivo.trim()]));
bindForm("formRecolherLote", async (_form, data) => executeContractTx("Recolher lote", "recolherLote", [data.lote.trim(), data.local.trim(), toHash(data.documento), data.motivo.trim()]));
bindForm("formDispensar", async (_form, data) => executeContractTx("Registrar dispensação", "dispensar", [data.lote.trim(), BigInt(data.quantidade), data.local.trim(), toHash(data.documento), data.observacao.trim()]));
bindForm("formDestruicao", async (_form, data) => executeContractTx("Registrar destruição", "registrarDestruicao", [data.lote.trim(), BigInt(data.quantidade), data.local.trim(), toHash(data.documento, true), data.observacao.trim()]));
bindForm("formOcorrencia", async (_form, data) => executeContractTx("Registrar ocorrência", "registrarOcorrencia", [data.lote.trim(), data.local.trim(), toHash(data.documento), data.observacao.trim()]));

// Auditoria
bindForm("formAuditoria", async (_form, data) => {
  requireContract();
  const container = $("#resultadoAuditoria");
  container.innerHTML = `<p class="help">Carregando e verificando a cadeia de auditoria...</p>`;
  try {
    const total = await contract.quantidadeRegistrosHistorico(data.lote.trim());
    const registros = await contract.consultarHistorico(data.lote.trim(), 0, 100);
    const cards = [];
    for (const registro of registros) cards.push(await renderAuditRecord(registro, true, data.lote.trim()));
    const entry = recordConsultation("Consultar histórico completo do lote", data.lote.trim(), `${total} registro(s) on-chain`);
    container.innerHTML = consultationContext(entry) + `<p class="help">${esc(total)} registro(s) no histórico.</p>${cards.length ? cards.join("") : `<p class="help">Nenhum registro.</p>`}`;
  } catch (e) { resultError("#resultadoAuditoria", e); }
});
bindForm("formRegistroAuditoria", async (_form, data) => {
  requireContract();
  try {
    const r = await contract.consultarRegistroHistorico(data.lote.trim(), BigInt(data.indice));
    const entry = recordConsultation("Consultar registro de auditoria", `${data.lote.trim()} / índice ${data.indice}`, TIPO_EVENTO[Number(r.tipoEvento)] || "Evento");
    $("#resultadoRegistroAuditoria").innerHTML = consultationContext(entry) + await renderAuditRecord(r, true, data.lote.trim());
  } catch (e) { resultError("#resultadoRegistroAuditoria", e); }
});
bindForm("formIntegridade", async (_form, data) => {
  requireContract();
  try {
    const ok = await contract.verificarIntegridadeRegistro(data.lote.trim(), BigInt(data.indice));
    const entry = recordConsultation("Verificar integridade de auditoria", `${data.lote.trim()} / índice ${data.indice}`, ok ? "Íntegro" : "Falha de integridade");
    $("#resultadoIntegridade").innerHTML = consultationContext(entry) + `<div class="integrity-result ${ok ? "ok" : "bad"}">${ok ? "✓ Registro íntegro: o hash recalculado coincide com o hash armazenado." : "✕ Falha de integridade: o hash não coincide."}</div>`;
  } catch (e) { resultError("#resultadoIntegridade", e); }
});

// Utilitários do contrato
bindForm("formCalcularId", async (_form, data) => {
  requireContract();
  try { const value = await contract.calcularId(data.valor); const entry = recordConsultation("Calcular ID bytes32", data.valor, value); $("#resultadoCalcularId").innerHTML = consultationContext(entry) + `<div class="kv"><b>ID bytes32</b><span>${copyable(value)}</span></div>`; }
  catch (e) { resultError("#resultadoCalcularId", e); }
});
bindForm("formGerarHash", async (_form, data) => {
  requireContract();
  try { const value = await contract.gerarHash(data.valor); const entry = recordConsultation("Gerar hash", data.valor, value); $("#resultadoGerarHash").innerHTML = consultationContext(entry) + `<div class="kv"><b>Hash</b><span>${copyable(value)}</span></div>`; }
  catch (e) { resultError("#resultadoGerarHash", e); }
});
bindForm("formSaldoPorIds", async (_form, data) => {
  requireContract();
  try {
    const saldo = await contract.saldoDisponivelPorIds(data.loteId.trim(), data.organizacaoId.trim());
    const entry = recordConsultation("Consultar saldo por IDs on-chain", `${shortHex(data.loteId.trim())} / ${shortHex(data.organizacaoId.trim())}`, `Disponível: ${saldo}`);
    $("#resultadoSaldoPorIds").innerHTML = consultationContext(entry) + `<div class="kv"><b>Saldo disponível</b><span>${esc(saldo)}</span></div>`;
  } catch (e) { resultError("#resultadoSaldoPorIds", e); }
});

if (window.ethereum) {
  window.ethereum.on("accountsChanged", handleAccountsChanged);
  window.ethereum.on("chainChanged", handleChainChanged);
}

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && contract) scheduleLiveRefresh("aba voltou ao foco");
});
window.addEventListener("focus", () => {
  if (contract) scheduleLiveRefresh("janela em foco");
});

const today = new Date();
const nextYear = new Date(today);
nextYear.setFullYear(today.getFullYear() + 1);
$("#formLote").elements.dataFabricacao.value = today.toISOString().slice(0, 10);
$("#formLote").elements.dataValidade.value = nextYear.toISOString().slice(0, 10);
loadConsultationHistory();
renderDemoAccounts();
renderTxHistory();
renderConsultationHistory();
restoreWalletSilently();
