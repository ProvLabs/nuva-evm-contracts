const hre = require("hardhat");

async function main() {
  const Factory = await hre.ethers.getContractFactory("TokenFactory");
  const factory = await Factory.deploy();
  await factory.waitForDeployment();

  console.log(`✅ TokenFactory deployed at: ${factory.target}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
