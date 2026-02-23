require("dotenv").config({ quiet: true });
require("@nomicfoundation/hardhat-toolbox");
require("@openzeppelin/hardhat-upgrades");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  networks: {
    eth: {
      url: process.env.RPC_URL_ETH || "http://localhost:8545",
      accounts: [
        process.env.PRIVATE_KEY,
      ],
      chainId: 11155111,
    },
    hoodi: {
      url: process.env.HOODI_RPC_URL,
      accounts: [
        process.env.PRIVATE_KEY,
      ],
      chainId: 560048,
    },
    mainnet: {
      url: process.env.MAINNET_RPC_URL,
      accounts: [
        process.env.MAINNET_PRIVATE_KEY,
      ],
      chainId: 1,
    },
    base: {
      url: process.env.RPC_URL_BASE || "http://localhost:8545",
      accounts: [
        process.env.PRIVATE_KEY,
      ],
      chainId: 84532,
    },
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
  },
  sourcify: {
    enabled: true
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
}
