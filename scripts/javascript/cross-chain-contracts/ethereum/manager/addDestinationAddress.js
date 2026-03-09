const { ethers } = require("hardhat");

async function main() {
  const PROXY_ADDRESS = process.env.CROSS_CHAIN_MANAGER_PROXY_ETH;
  if (!PROXY_ADDRESS) {
    throw new Error("CROSS_CHAIN_MANAGER_PROXY_ETH is not set.");
  }

  const NEW_DESTINATION = process.env.PUBLIC_KEY;
  if (!NEW_DESTINATION) {
    throw new Error("PUBLIC_KEY is not set.");
  }

  const manager = await ethers.getContractAt(
    "CrossChainManager",
    PROXY_ADDRESS,
  );

  // Now add the destination
  console.log(`Adding ${NEW_DESTINATION} to allowlist...`);
  const tx = await manager.addDestinationAddress(NEW_DESTINATION);
  await tx.wait();

  console.log("Success: Destination added.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
