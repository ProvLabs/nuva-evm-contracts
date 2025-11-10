const hre = require("hardhat");

async function main() {
  const tokenAddr = process.env.TOKEN_ADDRESS;
  if (!tokenAddr) {
    throw new Error(
      "TOKEN_ADDRESS is not set."
    );
  }
  console.log("Using token:", tokenAddr);

  const token = await hre.ethers.getContractAt("CustomToken", tokenAddr);
  const decimals = await token.decimals();
  console.log("decimals:", decimals);

  const to = "0xDd3199E196BbF9A463500d5fB442FB7f78131F7a";
  const amount = hre.ethers.parseUnits("100000000000000", decimals);

  // Call mint(to, amount)
  const tx = await token.mint(to, amount);
  const receipt = await tx.wait();

  console.log("mint tx:", receipt.hash);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
