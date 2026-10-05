require("@nomicfoundation/hardhat-ethers");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      },
      // O contrato V2 possui funcoes grandes e bate em "Stack too deep"
      // no pipeline tradicional do solc. viaIR resolve isso mantendo o
      // optimizer habilitado.
      viaIR: true
    }
  },
  networks: {
    hardhat: {
      chainId: 31337,
      // Apenas para a blockchain LOCAL da disciplina. O V2 e grande e pode
      // ultrapassar o limite EIP-170 de tamanho de bytecode. Em rede real,
      // o ideal seria modularizar o contrato em contratos menores.
      allowUnlimitedContractSize: true
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337
    }
  }
};
