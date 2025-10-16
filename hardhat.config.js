require("@nomicfoundation/hardhat-toolbox");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  networks: {
    sepolia: {
      url: [process.env.NETWORK_URL],
      accounts: [process.env.PRIVATE_KEY],
    },
  },
  solidity: "0.8.20",
};
