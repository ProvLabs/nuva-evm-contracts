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

  // Call createToken(name, symbol, decimals)
  const tx = await factory.createToken("MyCoin", "MC", 6);
  const receipt = await tx.wait();

  console.log("createToken tx:", receipt.hash);

  const tokens = await factory.getAllTokens();
  const tokenAddr = tokens[tokens.length - 1];
  console.log("New token address:", tokenAddr);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
