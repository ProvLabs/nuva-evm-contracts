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

  let address = "0xDd3199E196BbF9A463500d5fB442FB7f78131F7a";
  // Call balanceof(address)
  let balance = await token.balanceOf(address);
  console.log("balance of", address, "is", balance);

  address = "0x69482E00b8Ab0a256E8eF99718CcD8a2C460C3f7";
  // Call balanceof(address)
  balance = await token.balanceOf(address);
  console.log("balance of", address, "is", balance);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
