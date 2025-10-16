const hre = require("hardhat");

async function main() {
  // Replace with your deployed factory address
  const factoryAddr = process.env.FACTORY_ADDRESS;
  if (!factoryAddr) {
    throw new Error(
      "FACTORY_ADDRESS is not set."
    );
  }

  const factory = await hre.ethers.getContractAt("TokenFactory", factoryAddr);

  // Call burn(amount)
  const tx = await factory.burn(100);
  const receipt = await tx.wait();

  console.log("burn tx:", receipt.hash);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
