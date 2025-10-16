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

  // Call transfer(to, amount)
  const tx = await factory.transfer("0x0", 100);
  const receipt = await tx.wait();

  console.log("transfer tx:", receipt.hash);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
