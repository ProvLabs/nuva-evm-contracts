const { ethers } = require("hardhat");

async function deployDepositor() {
  const Depositor = await ethers.getContractFactory("Depositor");
  const depositor = await Depositor.deploy();
  await depositor.waitForDeployment();
  return depositor;
}

async function deployWithdrawal() {
  const Withdrawal = await ethers.getContractFactory("Withdrawal");
  const withdrawal = await Withdrawal.deploy();
  await withdrawal.waitForDeployment();
  return withdrawal;
}

module.exports = {
  deployDepositor,
  deployWithdrawal,
};
