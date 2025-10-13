const hre = require("hardhat");

async function main() {
    console.log("1");
  const Factory = await hre.ethers.getContractFactory("TokenFactory");
  const factory = await Factory.deploy();
  await factory.waitForDeployment();
  console.log(`Factory deployed at: ${factory.target}`);

  // Create a new ERC20 via factory
  const tx = await factory.createToken("MyCoin", "MC", 1000000);
  const receipt = await tx.wait();
  
  console.log("Token created! Transaction hash:", receipt.hash);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
