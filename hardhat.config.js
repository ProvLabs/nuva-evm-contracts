require("dotenv").config();
require("@nomicfoundation/hardhat-toolbox");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  networks: {
    sepolia: {
      url: process.env.RPC_URL || "http://localhost:8545",
      accounts: [
        process.env.PRIVATE_KEY,
      ],
      chainId: 11155111,
    },
  },
  solidity: {
    compilers: [
      {
        version: "0.8.28",
        settings: {
          viaIR: true,
          optimizer: {
            enabled: true,
            runs: 200
          },
          metadata: {
            bytecodeHash: "none"
          }
        }
      },
      { 
        version: "0.8.20",
        settings: {
          viaIR: true,
          optimizer: {
            enabled: true,
            runs: 200
          },
          metadata: {
            bytecodeHash: "none"
          }
        }
      },
    ],
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  },
  defaultNetwork: "hardhat",
};
