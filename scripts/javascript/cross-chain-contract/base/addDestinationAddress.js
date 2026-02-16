const { ethers } = require("hardhat");

async function main() {
    const PROXY_ADDRESS = process.env.CROSS_CHAIN_MANAGER_PROXY_BASE;
    if (!PROXY_ADDRESS) {
        throw new Error("CROSS_CHAIN_MANAGER_PROXY_BASE is not set.");
    }

    const NEW_DESTINATION = process.env.PUBLIC_KEY;
    if (!NEW_DESTINATION) {
        throw new Error("PUBLIC_KEY is not set.");
    }

    const [signer] = await ethers.getSigners();
    const manager = await ethers.getContractAt("CrossChainManager", PROXY_ADDRESS);

    // 1. Define the Role Constants
    const MANAGER_ROLE = await manager.DESTINATION_MANAGER_ROLE();

    // 2. Check if you already have the role
    const hasRole = await manager.hasRole(MANAGER_ROLE, signer.address);

    if (!hasRole) {
        console.log("Manager role not found. Attempting to grant role using Admin powers...");
        const grantTx = await manager.grantRole(MANAGER_ROLE, signer.address);
        await grantTx.wait();
        console.log("Role granted successfully.");
    }

    // 3. Now add the destination
    console.log(`Adding ${NEW_DESTINATION} to allowlist...`);
    const tx = await manager.addDestinationAddress(NEW_DESTINATION);
    await tx.wait();

    console.log("Success: Destination added.");
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
