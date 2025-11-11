const { ethers } = require("hardhat");

async function deployAMLUtils() {
  const AMLUtils = await ethers.getContractFactory("AMLUtils");
  const amlUtils = await AMLUtils.deploy();
  await amlUtils.waitForDeployment();
  return amlUtils;
}

async function deployDepositor(amlUtils) {
  const Depositor = await ethers.getContractFactory("Depositor", {
    libraries: {
      AMLUtils: await amlUtils.getAddress()
    }
  });
  const depositor = await Depositor.deploy();
  await depositor.waitForDeployment();
  return depositor;
}

async function deployWithdrawal(amlUtils) {
  const Withdrawal = await ethers.getContractFactory("Withdrawal", {
    libraries: {
      AMLUtils: await amlUtils.getAddress()
    }
  });
  const withdrawal = await Withdrawal.deploy();
  await withdrawal.waitForDeployment();
  return withdrawal;
}

module.exports = {
  deployAMLUtils,
  deployDepositor,
  deployWithdrawal
};
