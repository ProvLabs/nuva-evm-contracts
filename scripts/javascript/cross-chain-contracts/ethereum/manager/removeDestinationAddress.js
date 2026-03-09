const { ethers } = require("hardhat");

async function main() {
  const PROXY_ADDRESS = process.env.CROSS_CHAIN_MANAGER_PROXY_ETH;
  if (!PROXY_ADDRESS) {
    throw new Error("CROSS_CHAIN_MANAGER_PROXY_ETH is not set.");
  }

  const ADDRESS_TO_REMOVE = process.env.PUBLIC_KEY;
  if (!ADDRESS_TO_REMOVE) {
    throw new Error("PUBLIC_KEY is not set.");
  }

  const manager = await ethers.getContractAt(
    "CrossChainManager",
    PROXY_ADDRESS,
  );

  // Now remove the destination
  console.log(`Removing ${ADDRESS_TO_REMOVE} from allowlist...`);
  const tx = await manager.removeDestinationAddress(ADDRESS_TO_REMOVE);
  await tx.wait();

  console.log("Success: Destination removed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
