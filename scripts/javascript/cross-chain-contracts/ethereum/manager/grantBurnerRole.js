// scripts/burn.js
const { ethers } = require("hardhat");

// --- START: Configuration ---
const CROSS_CHAIN_MANAGER_ADDRESS = process.env.CROSS_CHAIN_MANAGER_PROXY_ETH;
if (!CROSS_CHAIN_MANAGER_ADDRESS) {
  throw new Error("CROSS_CHAIN_MANAGER_PROXY_ETH is not set.");
}

const SHARE_TOKEN_ADDRESS = process.env.SHARE_TOKEN_ADDRESS;
if (!SHARE_TOKEN_ADDRESS) {
  throw new Error("SHARE_TOKEN_ADDRESS is not set.");
}
// --- END: Configuration ---

async function main() {
  const [owner] = await ethers.getSigners();
  const address = "0xDd3199E196BbF9A463500d5fB442FB7f78131F7a";
  const burnRole = ethers.id("BURN_ROLE");

  console.log(`Simulating burn as admin: ${owner.address}`);
  console.log(`Targeting contract: ${CROSS_CHAIN_MANAGER_ADDRESS}`);

  // Get contract instances
  const crossChainManager = await ethers.getContractAt(
    "CrossChainManager",
    CROSS_CHAIN_MANAGER_ADDRESS,
  );

  // Note: We connect the 'owner' to the 'crossChainManager' contract
  try {
    const hasBurnRole = await crossChainManager.hasRole(burnRole, address);
    if (!hasBurnRole) {
      console.log(`Granting burner role to address: ${address}...`);
      const revokeTx = await crossChainManager
        .connect(owner)
        .grantRole(burnRole, address);
      const receipt = await revokeTx.wait();
      console.log(
        "✅ Burn role granted successfully! Transaction hash:",
        receipt.hash,
      );
    } else {
      console.log("✅ Burn role already granted!");
    }
  } catch (error) {
    console.error("❌ Grant transaction failed:", error.message);
    if (error.reason) {
      console.error("Revert reason:", error.reason);
    }
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
