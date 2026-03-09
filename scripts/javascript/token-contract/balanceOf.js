const hre = require("hardhat");

async function main() {
  const tokenAddr = process.env.TOKEN_ADDRESS;
  if (!tokenAddr) {
    throw new Error("TOKEN_ADDRESS is not set.");
  }
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
