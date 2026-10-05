const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

const { ethers } = hre;

function errText(error) {
  return String(
    error?.shortMessage ||
    error?.reason ||
    error?.info?.error?.message ||
    error?.error?.message ||
    error?.message ||
    error
  );
}

async function expectRevert(action, expected) {
  let failed = false;
  try {
    await action();
  } catch (error) {
    failed = true;
    const text = errText(error);
    assert.ok(
      text.toLowerCase().includes(expected.toLowerCase()),
      `Esperava erro contendo "${expected}", recebido: ${text}`
    );
  }
  assert.equal(failed, true, `A operacao deveria reverter com: ${expected}`);
}

async function deployBase() {
  const signers = await ethers.getSigners();
  const [regulador, fabricante, distribuidor, farmacia, transportador, extra1, extra2, extra3, extra4, extra5] = signers;

  const Factory = await ethers.getContractFactory("RastreabilidadeFarmaceuticaV2");
  const contrato = await Factory.deploy(
    "REG-CG-001",
    "Autoridade Sanitaria da Borborema - Ambiente Academico",
    ethers.id("REGULADOR-TESTE"),
    "OP-REG-CG-001",
    "Helena Moura"
  );
  await contrato.waitForDeployment();

  const orgs = [
    ["FAB-CG-001", "Laboratorio Borborema Saude - Campina Grande/PB", ethers.id("DOC-FAB"), 1],
    ["DIST-CG-001", "Distribuidora Campina Farma - Campina Grande/PB", ethers.id("DOC-DIST"), 2],
    ["FARM-CG-001", "Farmacia Acude Velho - Campina Grande/PB", ethers.id("DOC-FARM"), 3],
    ["TRANS-CG-001", "TransBorborema Logistica - Campina Grande/PB", ethers.id("DOC-TRANS"), 4]
  ];
  for (const org of orgs) await (await contrato.connect(regulador).cadastrarOrganizacao(org)).wait();

  const ops = [
    ["OP-FAB-CG-001", "Camila Nunes", "Responsavel Tecnica de Producao", fabricante.address, "FAB-CG-001", true],
    ["OP-DIST-CG-001", "Rafael Diniz", "Coordenador de Distribuicao", distribuidor.address, "DIST-CG-001", true],
    ["OP-FARM-CG-001", "Juliana Alves", "Farmaceutica Responsavel", farmacia.address, "FARM-CG-001", true],
    ["OP-TRANS-CG-001", "Marcos Vinicius Lima", "Coordenador de Transporte", transportador.address, "TRANS-CG-001", true]
  ];
  for (const op of ops) await (await contrato.connect(regulador).cadastrarOperador(op)).wait();

  return { contrato, signers, regulador, fabricante, distribuidor, farmacia, transportador, extra1, extra2, extra3, extra4, extra5 };
}

async function registerLot(contrato, fabricante, id = "LOTE-TESTE-001", quantity = 1000) {
  const block = await ethers.provider.getBlock("latest");
  const now = Number(block.timestamp);
  await (await contrato.connect(fabricante).registrarLote([
    id,
    "MED-TESTE",
    "Medicamento de teste automatizado",
    now - 3600,
    now + 365 * 24 * 60 * 60,
    quantity,
    ethers.id(`LAUDO-${id}`),
    ethers.id(`META-${id}`),
    "Campina Grande/PB",
    "Criado pelo teste automatizado"
  ])).wait();
  return id;
}

async function createTransfer(contrato, signer, {
  lot = "LOTE-TESTE-001",
  destination = "DIST-CG-001",
  transporter = "",
  type = 0,
  quantity = 100,
  origin = "Campina Grande/PB"
} = {}) {
  await (await contrato.connect(signer).criarTransferencia([
    lot,
    destination,
    transporter,
    type,
    quantity,
    origin,
    ethers.id(`DOC-SAIDA-${lot}-${destination}-${quantity}-${Date.now()}`),
    "Transferencia criada por teste automatizado"
  ])).wait();
  const ids = await contrato.listarTransferencias(0, 100);
  return ids[ids.length - 1];
}

async function sendWithoutTransport(contrato, originSigner, destinationSigner, transferId, destinationLocal = "Campina Grande/PB") {
  await (await contrato.connect(originSigner).confirmarExpedicao(
    transferId,
    "Doca de expedicao - Campina Grande/PB",
    ethers.id(`EXP-${transferId}`),
    "Expedicao automatizada"
  )).wait();
  await (await contrato.connect(destinationSigner).confirmarRecebimento(
    transferId,
    destinationLocal,
    ethers.id(`REC-${transferId}`),
    "Recebimento automatizado"
  )).wait();
}

describe("RastreabilidadeFarmaceuticaV2 - testes por aba da DApp", function () {
  this.timeout(180000);

  describe("Aba Dashboard e Utilitarios", function () {
    let ctx;
    before(async () => { ctx = await deployBase(); });

    it("mostra os totais iniciais e estado do sistema", async function () {
      assert.equal(Number(await ctx.contrato.totalOrganizacoes()), 5);
      assert.equal(Number(await ctx.contrato.totalOperadores()), 5);
      assert.equal(Number(await ctx.contrato.totalLotes()), 0);
      assert.equal(Number(await ctx.contrato.totalTransferencias()), 0);
      assert.equal(await ctx.contrato.sistemaPausado(), false);
    });

    it("calcula ID e hash pelo proprio contrato", async function () {
      assert.equal(await ctx.contrato.calcularId("FAB-CG-001"), ethers.id("FAB-CG-001"));
      assert.equal(await ctx.contrato.gerarHash("documento.pdf"), ethers.id("documento.pdf"));
    });
  });

  describe("Aba Organizacoes", function () {
    let ctx;
    before(async () => { ctx = await deployBase(); });

    it("consulta, cadastra, lista, desativa e reativa organizacao", async function () {
      const inicial = await ctx.contrato.consultarOrganizacao("DIST-CG-001");
      assert.equal(inicial.nome.includes("Campina Farma"), true);
      assert.equal(Number(inicial.papel), 2);

      await (await ctx.contrato.connect(ctx.regulador).cadastrarOrganizacao([
        "DIST-PATOS-TEST",
        "Distribuidora Sertao Farma - Patos/PB",
        ethers.id("DOC-PATOS"),
        2
      ])).wait();

      const ids = await ctx.contrato.listarOrganizacoes(0, 100);
      assert.equal(ids.length, 6);
      assert.equal((await ctx.contrato.consultarOrganizacao("DIST-PATOS-TEST")).ativa, true);

      await (await ctx.contrato.connect(ctx.regulador).alterarStatusOrganizacao("DIST-PATOS-TEST", false, "Teste de desativacao")).wait();
      assert.equal((await ctx.contrato.consultarOrganizacao("DIST-PATOS-TEST")).ativa, false);
      await (await ctx.contrato.connect(ctx.regulador).alterarStatusOrganizacao("DIST-PATOS-TEST", true, "Teste de reativacao")).wait();
      assert.equal((await ctx.contrato.consultarOrganizacao("DIST-PATOS-TEST")).ativa, true);
    });

    it("protege a organizacao reguladora inicial", async function () {
      await expectRevert(
        async () => { await (await ctx.contrato.connect(ctx.regulador).alterarStatusOrganizacao("REG-CG-001", false, "Nao deve permitir")).wait(); },
        "nao pode ser desativada"
      );
    });
  });

  describe("Aba Operadores", function () {
    let ctx;
    before(async () => { ctx = await deployBase(); });

    it("cadastra, consulta, lista, altera status e troca carteira", async function () {
      await (await ctx.contrato.connect(ctx.regulador).cadastrarOperador([
        "OP-DIST-CG-002",
        "Bruno Araujo",
        "Assistente de Logistica",
        ctx.extra1.address,
        "DIST-CG-001",
        false
      ])).wait();

      let op = await ctx.contrato.consultarOperador("OP-DIST-CG-002");
      assert.equal(op.nome, "Bruno Araujo");
      assert.equal((await ctx.contrato.consultarOperadorPorCarteira(ctx.extra1.address)).idExterno, "OP-DIST-CG-002");

      const opIds = await ctx.contrato.listarOperadoresOrganizacao("DIST-CG-001", 0, 100);
      assert.ok(opIds.length >= 2);

      await (await ctx.contrato.connect(ctx.regulador).alterarStatusOperador("OP-DIST-CG-002", false, "Ferias")).wait();
      assert.equal((await ctx.contrato.consultarOperador("OP-DIST-CG-002")).ativo, false);
      await (await ctx.contrato.connect(ctx.regulador).alterarStatusOperador("OP-DIST-CG-002", true, "Retorno")).wait();

      await (await ctx.contrato.connect(ctx.regulador).alterarCarteiraOperador("OP-DIST-CG-002", ctx.extra2.address, "Troca controlada de carteira")).wait();
      op = await ctx.contrato.consultarOperadorPorId(ethers.id("OP-DIST-CG-002"));
      assert.equal(op.carteira.toLowerCase(), ctx.extra2.address.toLowerCase());
      assert.equal((await ctx.contrato.consultarOperadorPorCarteira(ctx.extra2.address)).idExterno, "OP-DIST-CG-002");
    });
  });

  describe("Aba Lotes e Custodia", function () {
    let ctx;
    before(async () => { ctx = await deployBase(); });

    it("registra, consulta, verifica, lista e calcula saldo/custodia", async function () {
      await registerLot(ctx.contrato, ctx.fabricante, "LOTE-CG-AUTO-001", 1200);

      const lote = await ctx.contrato.consultarLote("LOTE-CG-AUTO-001");
      assert.equal(lote.codigoProduto, "MED-TESTE");
      assert.equal(Number(lote.quantidadeInicial), 1200);

      const porId = await ctx.contrato.consultarLotePorId(ethers.id("LOTE-CG-AUTO-001"));
      assert.equal(porId.identificador, "LOTE-CG-AUTO-001");

      const check = await ctx.contrato.verificarLote("LOTE-CG-AUTO-001");
      assert.equal(check.registrado, true);
      assert.equal(check.dentroDaValidade, true);
      assert.equal(Number(check.status), 1);

      const saldo = await ctx.contrato.consultarSaldoLote("LOTE-CG-AUTO-001", "FAB-CG-001");
      assert.equal(Number(saldo.saldoTotal), 1200);
      assert.equal(Number(saldo.saldoReservado), 0);
      assert.equal(Number(await ctx.contrato.saldoDisponivelPorIds(ethers.id("LOTE-CG-AUTO-001"), ethers.id("FAB-CG-001"))), 1200);

      const custody = await ctx.contrato.listarOrganizacoesComCustodiaLote("LOTE-CG-AUTO-001", 0, 100);
      assert.equal(custody.length, 1);
      assert.equal(custody[0], ethers.id("FAB-CG-001"));
      assert.equal((await ctx.contrato.listarLotes(0, 100)).length, 1);
    });

    it("impede distribuidor de registrar lote", async function () {
      const block = await ethers.provider.getBlock("latest");
      await expectRevert(async () => {
        await (await ctx.contrato.connect(ctx.distribuidor).registrarLote([
          "LOTE-ILEGAL", "X", "Nao permitido", Number(block.timestamp) - 10, Number(block.timestamp) + 1000,
          10, ethers.id("L"), ethers.ZeroHash, "Campina Grande/PB", "teste"
        ])).wait();
      }, "Somente fabricante");
    });
  });

  describe("Aba Transferencias", function () {
    let ctx;
    before(async () => { ctx = await deployBase(); await registerLot(ctx.contrato, ctx.fabricante); });

    it("fluxo comercial sem transportadora: criar, reservar, expedir e receber", async function () {
      const id = await createTransfer(ctx.contrato, ctx.fabricante, { quantity: 200 });
      let t = await ctx.contrato.consultarTransferencia(id);
      assert.equal(Number(t.status), 1);
      assert.equal(t.criadaPorOperadorId, ethers.id("OP-FAB-CG-001"));

      let saldo = await ctx.contrato.consultarSaldoLote("LOTE-TESTE-001", "FAB-CG-001");
      assert.equal(Number(saldo.saldoTotal), 1000);
      assert.equal(Number(saldo.saldoReservado), 200);
      assert.equal(Number(saldo.saldoDisponivel), 800);

      await sendWithoutTransport(ctx.contrato, ctx.fabricante, ctx.distribuidor, id);
      t = await ctx.contrato.consultarTransferencia(id);
      assert.equal(Number(t.status), 4);
      assert.equal(t.finalizadaPorOperadorId, ethers.id("OP-DIST-CG-001"));

      saldo = await ctx.contrato.consultarSaldoLote("LOTE-TESTE-001", "FAB-CG-001");
      assert.equal(Number(saldo.saldoTotal), 800);
      const distSaldo = await ctx.contrato.consultarSaldoLote("LOTE-TESTE-001", "DIST-CG-001");
      assert.equal(Number(distSaldo.saldoTotal), 200);
      assert.equal(Number(await ctx.contrato.quantidadeTransferenciasLote("LOTE-TESTE-001")), 1);
      assert.equal((await ctx.contrato.listarTransferenciasLote("LOTE-TESTE-001", 0, 100))[0], id);
    });

    it("cancela transferencia antes da expedicao e libera reserva", async function () {
      const id = await createTransfer(ctx.contrato, ctx.fabricante, { quantity: 50 });
      await (await ctx.contrato.connect(ctx.fabricante).cancelarTransferencia(id, "Pedido cancelado")).wait();
      assert.equal(Number((await ctx.contrato.consultarTransferencia(id)).status), 6);
      const saldo = await ctx.contrato.consultarSaldoLote("LOTE-TESTE-001", "FAB-CG-001");
      assert.equal(Number(saldo.saldoReservado), 0);
    });

    it("permite recusa pelo destino e libera reserva", async function () {
      const id = await createTransfer(ctx.contrato, ctx.fabricante, { quantity: 60 });
      await (await ctx.contrato.connect(ctx.fabricante).confirmarExpedicao(id, "Campina Grande/PB", ethers.id("EXP-RECUSA"), "Saiu")).wait();
      await (await ctx.contrato.connect(ctx.distribuidor).recusarRecebimento(id, "Campina Grande/PB", ethers.id("RECUSA"), "Avaria na embalagem")).wait();
      assert.equal(Number((await ctx.contrato.consultarTransferencia(id)).status), 5);
      const saldo = await ctx.contrato.consultarSaldoLote("LOTE-TESTE-001", "FAB-CG-001");
      assert.equal(Number(saldo.saldoReservado), 0);
    });

    it("executa devolucao do distribuidor para fabricante", async function () {
      // Primeiro abastece o distribuidor.
      const ida = await createTransfer(ctx.contrato, ctx.fabricante, { quantity: 100 });
      await sendWithoutTransport(ctx.contrato, ctx.fabricante, ctx.distribuidor, ida);

      const volta = await createTransfer(ctx.contrato, ctx.distribuidor, {
        destination: "FAB-CG-001",
        type: 1,
        quantity: 20,
        origin: "Distribuidora Campina Farma"
      });
      await sendWithoutTransport(ctx.contrato, ctx.distribuidor, ctx.fabricante, volta, "Laboratorio Borborema Saude");
      assert.equal(Number((await ctx.contrato.consultarTransferencia(volta)).status), 4);
    });
  });

  describe("Aba Transporte", function () {
    let ctx;
    before(async () => { ctx = await deployBase(); await registerLot(ctx.contrato, ctx.fabricante); });

    it("coleta, registra checkpoint, entrega e permite recebimento", async function () {
      const id = await createTransfer(ctx.contrato, ctx.fabricante, {
        transporter: "TRANS-CG-001",
        quantity: 150
      });

      await (await ctx.contrato.connect(ctx.transportador).confirmarColetaTransportador(
        id, "Distrito Industrial - Campina Grande/PB", ethers.id("COLETA"), "Carga lacrada"
      )).wait();
      assert.equal(Number((await ctx.contrato.consultarTransferencia(id)).status), 2);

      await (await ctx.contrato.connect(ctx.transportador).registrarAtualizacaoTransporte(
        id, "BR-230 - Paraiba", ethers.id("CHECKPOINT"), "Temperatura conferida"
      )).wait();

      await (await ctx.contrato.connect(ctx.transportador).confirmarEntregaTransportador(
        id, "Distribuidora Campina Farma", ethers.id("ENTREGA"), "Entregue na doca"
      )).wait();
      let t = await ctx.contrato.consultarTransferencia(id);
      assert.equal(Number(t.status), 3);
      assert.equal(t.entreguePorOperadorId, ethers.id("OP-TRANS-CG-001"));

      await (await ctx.contrato.connect(ctx.distribuidor).confirmarRecebimento(
        id, "Distribuidora Campina Farma", ethers.id("RECEBIMENTO"), "Conferido"
      )).wait();
      t = await ctx.contrato.consultarTransferencia(id);
      assert.equal(Number(t.status), 4);
    });
  });

  describe("Aba Rastreabilidade", function () {
    let ctx;
    before(async () => {
      ctx = await deployBase();
      await registerLot(ctx.contrato, ctx.fabricante, "LOTE-RAS-001", 1000);
      const fabDist = await createTransfer(ctx.contrato, ctx.fabricante, { lot: "LOTE-RAS-001", quantity: 300 });
      await sendWithoutTransport(ctx.contrato, ctx.fabricante, ctx.distribuidor, fabDist);
      const distFarm = await createTransfer(ctx.contrato, ctx.distribuidor, {
        lot: "LOTE-RAS-001", destination: "FARM-CG-001", quantity: 120, origin: "Distribuidora Campina Farma"
      });
      await sendWithoutTransport(ctx.contrato, ctx.distribuidor, ctx.farmacia, distFarm, "Farmacia Acude Velho");
    });

    it("registra dispensacao e ocorrencia", async function () {
      await (await ctx.contrato.connect(ctx.farmacia).dispensar(
        "LOTE-RAS-001", 10, "Farmacia Acude Velho", ethers.id("CUPOM-DISP"), "Dispensacao teste"
      )).wait();
      const saldo = await ctx.contrato.consultarSaldoLote("LOTE-RAS-001", "FARM-CG-001");
      assert.equal(Number(saldo.saldoTotal), 110);
      const lote = await ctx.contrato.consultarLote("LOTE-RAS-001");
      assert.equal(Number(lote.quantidadeDispensada), 10);

      await (await ctx.contrato.connect(ctx.regulador).registrarOcorrencia(
        "LOTE-RAS-001", "Campina Grande/PB", ethers.id("INSPECAO"), "Inspecao regulatoria de teste"
      )).wait();
    });

    it("bloqueia, destrói, desbloqueia e recolhe", async function () {
      await (await ctx.contrato.connect(ctx.regulador).bloquearLote(
        "LOTE-RAS-001", "Campina Grande/PB", ethers.id("BLOQUEIO"), "Investigacao de qualidade"
      )).wait();
      assert.equal(Number((await ctx.contrato.consultarLote("LOTE-RAS-001")).status), 2);

      await (await ctx.contrato.connect(ctx.fabricante).registrarDestruicao(
        "LOTE-RAS-001", 5, "Laboratorio Borborema", ethers.id("DESTRUICAO"), "Amostras destruidas"
      )).wait();

      await (await ctx.contrato.connect(ctx.regulador).desbloquearLote(
        "LOTE-RAS-001", "Campina Grande/PB", ethers.id("DESBLOQUEIO"), "Investigacao concluida"
      )).wait();
      assert.equal(Number((await ctx.contrato.consultarLote("LOTE-RAS-001")).status), 1);

      await (await ctx.contrato.connect(ctx.regulador).recolherLote(
        "LOTE-RAS-001", "Paraiba", ethers.id("RECALL"), "Recall academico"
      )).wait();
      assert.equal(Number((await ctx.contrato.consultarLote("LOTE-RAS-001")).status), 3);
    });

    it("permite transferencia de recolhimento e testa pausa de emergencia", async function () {
      const recallTransfer = await createTransfer(ctx.contrato, ctx.farmacia, {
        lot: "LOTE-RAS-001", destination: "DIST-CG-001", type: 2, quantity: 20, origin: "Farmacia Acude Velho"
      });
      await sendWithoutTransport(ctx.contrato, ctx.farmacia, ctx.distribuidor, recallTransfer, "Distribuidora Campina Farma");
      assert.equal(Number((await ctx.contrato.consultarTransferencia(recallTransfer)).status), 4);

      await (await ctx.contrato.connect(ctx.regulador).alterarPausaSistema(true, "Teste de emergencia")).wait();
      assert.equal(await ctx.contrato.sistemaPausado(), true);
      await expectRevert(async () => {
        await (await ctx.contrato.connect(ctx.regulador).registrarOcorrencia(
          "LOTE-RAS-001", "Campina Grande/PB", ethers.ZeroHash, "Nao deve registrar durante pausa"
        )).wait();
      }, "Sistema pausado");
      await (await ctx.contrato.connect(ctx.regulador).alterarPausaSistema(false, "Fim do teste de emergencia")).wait();
      assert.equal(await ctx.contrato.sistemaPausado(), false);
    });
  });

  describe("Aba Auditoria", function () {
    let ctx;
    before(async () => {
      ctx = await deployBase();
      await registerLot(ctx.contrato, ctx.fabricante, "LOTE-AUD-001", 500);
      await (await ctx.contrato.connect(ctx.fabricante).registrarOcorrencia(
        "LOTE-AUD-001", "Campina Grande/PB", ethers.id("OCORRENCIA"), "Conferencia interna"
      )).wait();
    });

    it("consulta historico completo, registro individual e verifica integridade", async function () {
      const total = Number(await ctx.contrato.quantidadeRegistrosHistorico("LOTE-AUD-001"));
      assert.equal(total, 2);
      const pagina = await ctx.contrato.consultarHistorico("LOTE-AUD-001", 0, 100);
      assert.equal(pagina.length, 2);
      assert.equal(pagina[0].operadorId, ethers.id("OP-FAB-CG-001"));
      assert.notEqual(pagina[1].hashAnterior, ethers.ZeroHash);

      const registro = await ctx.contrato.consultarRegistroHistorico("LOTE-AUD-001", 1);
      assert.equal(Number(registro.tipoEvento), 14);
      assert.equal(await ctx.contrato.verificarIntegridadeRegistro("LOTE-AUD-001", 0), true);
      assert.equal(await ctx.contrato.verificarIntegridadeRegistro("LOTE-AUD-001", 1), true);
    });
  });

  describe("Cobertura da interface web", function () {
    it("mantem todas as abas e funcoes principais ligadas no main.js", async function () {
      const mainPath = path.join(__dirname, "..", "frontend", "src", "main.js");
      const source = fs.readFileSync(mainPath, "utf8");
      const tabs = ["dashboard", "organizacoes", "operadores", "lotes", "transferencias", "transporte", "rastreabilidade", "auditoria", "utilitarios"];
      for (const tab of tabs) assert.ok(source.includes(`data-panel=\"${tab}\"`) || source.includes(`id=\"${tab}\"`), `Aba ${tab} ausente`);

      const writes = [
        "cadastrarOrganizacao", "alterarStatusOrganizacao", "cadastrarOperador", "alterarStatusOperador", "alterarCarteiraOperador",
        "registrarLote", "criarTransferencia", "confirmarExpedicao", "confirmarRecebimento", "recusarRecebimento", "cancelarTransferencia",
        "confirmarColetaTransportador", "registrarAtualizacaoTransporte", "confirmarEntregaTransportador", "alterarPausaSistema",
        "bloquearLote", "desbloquearLote", "recolherLote", "dispensar", "registrarDestruicao", "registrarOcorrencia"
      ];
      for (const fn of writes) assert.ok(source.includes(`\"${fn}\"`) || source.includes(`.${fn}(`), `Funcao de escrita ${fn} nao ligada no frontend`);

      const reads = [
        "consultarOrganizacao", "consultarOperador", "consultarLote", "verificarLote", "consultarSaldoLote",
        "consultarTransferencia", "consultarHistorico", "verificarIntegridadeRegistro", "calcularId", "gerarHash"
      ];
      for (const fn of reads) assert.ok(source.includes(fn), `Funcao de leitura ${fn} nao ligada no frontend`);

      assert.ok(source.includes("data-ref=\"lot-transfer\""), "Select dinamico de lote nao encontrado");
      assert.ok(source.includes("data-ref=\"transfer-destination\""), "Select dinamico de destino nao encontrado");
      assert.ok(source.includes("executeContractTx"), "Camada robusta de escrita/nonce nao encontrada");
    });
  });
});
