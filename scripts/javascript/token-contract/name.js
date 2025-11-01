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
  const tokens = await factory.getAllTokens();

  const tokenAddr = tokens[tokens.length - 1];
  console.log("Using token:", tokenAddr);

  const token = await hre.ethers.getContractAt("CustomToken", tokenAddr);

  // Call name()
  const name = await token.name();
  console.log("Name:", name);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
