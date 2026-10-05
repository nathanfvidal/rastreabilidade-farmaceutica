const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function existeOrganizacao(contract, id) {
  try { await contract.consultarOrganizacao(id); return true; } catch { return false; }
}
async function existeOperador(contract, id) {
  try { await contract.consultarOperador(id); return true; } catch { return false; }
}
async function existeLote(contract, id) {
  try { await contract.consultarLote(id); return true; } catch { return false; }
}

async function main() {
  const { ethers } = hre;
  const deploymentPath = path.join(__dirname, "..", "deployment.json");
  if (!fs.existsSync(deploymentPath)) throw new Error("deployment.json nao encontrado. Execute o deploy primeiro.");

  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  const signers = await ethers.getSigners();
  const [
    regulador,
    fabricante,
    distribuidorCampina,
    farmaciaCampina,
    transportadorCampina,
    distribuidorPatos,
    farmaciaQueimadas,
    farmaciaEsperanca,
    transportadorBoqueirao,
    contaReserva
  ] = signers;

  const contrato = await ethers.getContractAt("RastreabilidadeFarmaceuticaV2", deployment.address, regulador);

  // Nomes FICTICIOS inspirados em Campina Grande e regiao, apenas para demonstracao academica.
  const organizacoes = [
    ["FAB-CG-001", "Laboratorio Borborema Saude - Campina Grande/PB", ethers.id("DOC-FAB-CG-001"), 1],
    ["DIST-CG-001", "Distribuidora Campina Farma - Campina Grande/PB", ethers.id("DOC-DIST-CG-001"), 2],
    ["FARM-CG-001", "Farmacia Acude Velho - Campina Grande/PB", ethers.id("DOC-FARM-CG-001"), 3],
    ["TRANS-CG-001", "TransBorborema Logistica - Campina Grande/PB", ethers.id("DOC-TRANS-CG-001"), 4],
    ["DIST-PATOS-001", "Distribuidora Sertao Farma - Patos/PB", ethers.id("DOC-DIST-PATOS-001"), 2],
    ["FARM-QUEIMADAS-001", "Farmacia Serra Saude - Queimadas/PB", ethers.id("DOC-FARM-QUEIMADAS-001"), 3],
    ["FARM-ESPERANCA-001", "Farmacia Brejo Saude - Esperanca/PB", ethers.id("DOC-FARM-ESPERANCA-001"), 3],
    ["TRANS-BOQUEIRAO-001", "Rota Cariri Logistica - Boqueirao/PB", ethers.id("DOC-TRANS-BOQUEIRAO-001"), 4]
  ];

  for (const dados of organizacoes) {
    if (!(await existeOrganizacao(contrato, dados[0]))) {
      await (await contrato.cadastrarOrganizacao(dados)).wait();
      console.log("Organizacao cadastrada:", dados[0], "-", dados[1]);
    }
  }

  const operadores = [
    ["OP-FAB-CG-001", "Camila Nunes", "Responsavel Tecnica de Producao", fabricante.address, "FAB-CG-001", true],
    ["OP-DIST-CG-001", "Rafael Diniz", "Coordenador de Distribuicao", distribuidorCampina.address, "DIST-CG-001", true],
    ["OP-FARM-CG-001", "Juliana Alves", "Farmaceutica Responsavel", farmaciaCampina.address, "FARM-CG-001", true],
    ["OP-TRANS-CG-001", "Marcos Vinicius Lima", "Coordenador de Transporte", transportadorCampina.address, "TRANS-CG-001", true],
    ["OP-DIST-PATOS-001", "Andre Souza", "Supervisor Logistico", distribuidorPatos.address, "DIST-PATOS-001", true],
    ["OP-FARM-QUEIMADAS-001", "Larissa Medeiros", "Farmaceutica Responsavel", farmaciaQueimadas.address, "FARM-QUEIMADAS-001", true],
    ["OP-FARM-ESPERANCA-001", "Beatriz Monteiro", "Farmaceutica Responsavel", farmaciaEsperanca.address, "FARM-ESPERANCA-001", true],
    ["OP-TRANS-BOQUEIRAO-001", "Diego Ferreira", "Supervisor de Rota", transportadorBoqueirao.address, "TRANS-BOQUEIRAO-001", true]
  ];

  for (const dados of operadores) {
    if (!(await existeOperador(contrato, dados[0]))) {
      await (await contrato.cadastrarOperador(dados)).wait();
      console.log("Operador cadastrado:", dados[0], "-", dados[1]);
    }
  }

  const contratoFabricante = contrato.connect(fabricante);
  const bloco = await ethers.provider.getBlock("latest");
  const agora = Number(bloco.timestamp);
  const umAno = 365 * 24 * 60 * 60;

  const lotes = [
    [
      "LOTE-CG-DIP-001",
      "DIP-500",
      "Dipirona Sodica 500 mg - lote demonstrativo",
      agora - 2 * 86400,
      agora + umAno,
      5000,
      ethers.id("LAUDO-LOTE-CG-DIP-001"),
      ethers.id("METADADOS-LOTE-CG-DIP-001"),
      "Unidade de Producao - Distrito Industrial de Campina Grande/PB",
      "Lote ficticio criado automaticamente para demonstracao academica"
    ],
    [
      "LOTE-CG-PAR-002",
      "PAR-750",
      "Paracetamol 750 mg - lote demonstrativo",
      agora - 86400,
      agora + umAno,
      2500,
      ethers.id("LAUDO-LOTE-CG-PAR-002"),
      ethers.id("METADADOS-LOTE-CG-PAR-002"),
      "Unidade de Producao - Campina Grande/PB",
      "Segundo lote ficticio para testes de bloqueio, recall e destruicao"
    ]
  ];

  for (const lote of lotes) {
    if (!(await existeLote(contratoFabricante, lote[0]))) {
      await (await contratoFabricante.registrarLote(lote)).wait();
      console.log("Lote demonstrativo criado:", lote[0]);
    }
  }

  const contas = {
    regulador: regulador.address,
    fabricante: fabricante.address,
    distribuidorCampina: distribuidorCampina.address,
    farmaciaCampina: farmaciaCampina.address,
    transportadorCampina: transportadorCampina.address,
    distribuidorPatos: distribuidorPatos.address,
    farmaciaQueimadas: farmaciaQueimadas.address,
    farmaciaEsperanca: farmaciaEsperanca.address,
    transportadorBoqueirao: transportadorBoqueirao.address,
    reserva: contaReserva.address
  };

  fs.writeFileSync(
    path.join(__dirname, "..", "frontend", "src", "demo-accounts.json"),
    JSON.stringify(contas, null, 2)
  );

  console.log("\nSeed concluido. Nomes e empresas sao ficticios e usados apenas no ambiente academico.");
  console.table(contas);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
