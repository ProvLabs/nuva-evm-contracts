const { ethers, upgrades } = require("hardhat");

/**
 * @notice Script to update an existing DedicatedVaultRouter deployment.
 * Can be used to:
 * 1. Upgrade the implementation contract.
 * 2. Set the RedemptionProxy master copy implementation.
 * 3. Grant/Revoke roles (KEEPER_ROLE).
 */
async function main() {
    const [signer] = await ethers.getSigners();
    console.log("Updating contracts with the account:", signer.address);

    const proxyAddress = process.env.ROUTER_PROXY_ADDRESS;
    if (!proxyAddress) {
        throw new Error("Missing ROUTER_PROXY_ADDRESS environment variable");
    }

    const DedicatedVaultRouter = await ethers.getContractFactory("DedicatedVaultRouter");
    const router = DedicatedVaultRouter.attach(proxyAddress);

    // --- 1. Upgrade Implementation (Optional) ---
    if (process.env.UPGRADE_ROUTER === "true") {
        console.log("Upgrading DedicatedVaultRouter implementation...");
        const upgraded = await upgrades.upgradeProxy(proxyAddress, DedicatedVaultRouter);
        await upgraded.waitForDeployment();
        console.log("✅ Implementation upgraded.");
    }

    // --- 2. Set RedemptionProxy Implementation (Optional) ---
    const redemptionImpl = process.env.REDEMPTION_PROXY_IMPLEMENTATION;
    if (redemptionImpl) {
        console.log("Setting RedemptionProxy implementation to:", redemptionImpl);
        const tx = await router.setRedemptionProxyImplementation(redemptionImpl);
        await tx.wait();
        console.log("✅ RedemptionProxy implementation set.");
    }

    // --- 3. Grant KEEPER_ROLE (Optional) ---
    const grantKeeper = process.env.GRANT_KEEPER_ADDRESS;
    if (grantKeeper) {
        console.log("Granting KEEPER_ROLE to:", grantKeeper);
        const KEEPER_ROLE = await router.KEEPER_ROLE();
        const tx = await router.grantRole(KEEPER_ROLE, grantKeeper);
        await tx.wait();
        console.log("✅ KEEPER_ROLE granted.");
    }

    // --- 4. Revoke KEEPER_ROLE (Optional) ---
    const revokeKeeper = process.env.REVOKE_KEEPER_ADDRESS;
    if (revokeKeeper) {
        console.log("Revoking KEEPER_ROLE from:", revokeKeeper);
        const KEEPER_ROLE = await router.KEEPER_ROLE();
        const tx = await router.revokeRole(KEEPER_ROLE, revokeKeeper);
        await tx.wait();
        console.log("✅ KEEPER_ROLE revoked.");
    }

    // Output current state
    const implementationAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);
    const amlSigner = await router.amlSigner();
    const owner = await router.owner();

    console.log("\n--- Current Status ---");
    console.log("Proxy Address:         ", proxyAddress);
    console.log("Implementation Address:", implementationAddress);
    console.log("AML Signer:            ", amlSigner);
    console.log("Owner:                 ", owner);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
