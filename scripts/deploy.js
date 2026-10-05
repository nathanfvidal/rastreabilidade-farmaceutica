const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const { ethers, artifacts } = hre;
  const [deployer] = await ethers.getSigners();

  console.log("Deploy com a conta reguladora:", deployer.address);

  const Factory = await ethers.getContractFactory("RastreabilidadeFarmaceuticaV2");
  const contrato = await Factory.deploy(
    "REG-CG-001",
    "Autoridade Sanitaria da Borborema - Ambiente Academico",
    ethers.id("REGULADOR-CAMPINA-GRANDE-DEMO"),
    "OP-REG-CG-001",
    "Helena Moura"
  );

  await contrato.waitForDeployment();
  const address = await contrato.getAddress();
  const network = await ethers.provider.getNetwork();

  console.log("Contrato implantado em:", address);
  console.log("Chain ID:", network.chainId.toString());

  const artifact = await artifacts.readArtifact("RastreabilidadeFarmaceuticaV2");
  const frontendDir = path.join(__dirname, "..", "frontend", "src");
  fs.mkdirSync(frontendDir, { recursive: true });

  const configContent = `// GERADO AUTOMATICAMENTE POR scripts/deploy.js\nexport const CONTRACT_ADDRESS = ${JSON.stringify(address)};\nexport const CHAIN_ID = ${Number(network.chainId)};\nexport const CONTRACT_ABI = ${JSON.stringify(artifact.abi, null, 2)};\n`;
  fs.writeFileSync(path.join(frontendDir, "contract-config.js"), configContent);

  const deployment = {
    contract: "RastreabilidadeFarmaceuticaV2",
    address,
    chainId: Number(network.chainId),
    deployer: deployer.address,
    deployedAt: new Date().toISOString()
  };

  fs.writeFileSync(
    path.join(__dirname, "..", "deployment.json"),
    JSON.stringify(deployment, null, 2)
  );

  console.log("ABI e endereco enviados automaticamente para frontend/src/contract-config.js");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
