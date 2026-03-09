const { ethers } = require("hardhat");

async function main() {
  const PROXY_ADDRESS = process.env.VAULT_CROSS_CHAIN_PROXY_BASE;
  if (!PROXY_ADDRESS) {
    throw new Error("VAULT_CROSS_CHAIN_PROXY_BASE is not set.");
  }

  const WHITELISTED_ROLE = ethers.id("WHITELISTED_ROLE");

  // const addr = process.env.PUBLIC_KEY;
  // if (!addr) {
  //     throw new Error("PUBLIC_KEY is not set.");
  // };

  const addr = process.env.CROSS_CHAIN_MANAGER_PROXY_BASE;
  if (!addr) {
    throw new Error("CROSS_CHAIN_MANAGER_PROXY_BASE is not set.");
  }

  const vault = await ethers.getContractAt("CrossChainVault", PROXY_ADDRESS);

  // Now add the address
  console.log(`Adding ${addr} to allowlist...`);
  const tx = await vault.grantRole(WHITELISTED_ROLE, addr);
  const receipt = await tx.wait();

  console.log(
    "   ✅ Address added successfully! Transaction hash:",
    receipt.hash,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
