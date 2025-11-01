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
  const decimals = await token.decimals();
  console.log("decimals:", decimals);

  const to = "0x69482E00b8Ab0a256E8eF99718CcD8a2C460C3f7";
  const amount = hre.ethers.parseUnits("10", decimals);

  // Call transfer(to, amount)
  const tx = await token.transfer(to, amount);
  const receipt = await tx.wait();

  console.log("transfer tx:", receipt.hash);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
