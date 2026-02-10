const { ethers } = require("hardhat");

/**
 * @notice Script to request a redemption from the DedicatedVaultRouter.
 * This script handles:
 * 1. Approving the router to pull Nuva Vault shares from the user.
 * 2. Calling requestRedeem on the router.
 *
 * Required Env Vars:
 * - ROUTER_PROXY_ADDRESS: Address of the deployed router proxy.
 * - NUVA_VAULT_ADDRESS: Address of the Nuva Vault (to approve).
 * - REDEEM_AMOUNT: Amount of Nuva shares to redeem (in standard units, e.g., "100").
 */
async function main() {
    const routerAddress = process.env.ROUTER_PROXY_ADDRESS;
    const nuvaVaultAddress = process.env.NUVA_VAULT_ADDRESS;
    const redeemAmountStr = process.env.REDEEM_AMOUNT;

    if (!routerAddress || !nuvaVaultAddress || !redeemAmountStr) {
        throw new Error("Missing ROUTER_PROXY_ADDRESS, NUVA_VAULT_ADDRESS, or REDEEM_AMOUNT environment variables");
    }

    const [user] = await ethers.getSigners();
    const router = await ethers.getContractAt("DedicatedVaultRouter", routerAddress);
    const nuvaVault = await ethers.getContractAt("IERC20", nuvaVaultAddress);

    const amount = ethers.parseUnits(redeemAmountStr, 18); // Assuming 18 decimals for vault shares
    const amlDeadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

    console.log(`Requesting redemption of ${redeemAmountStr} Nuva shares for ${user.address}...`);

    // --- STEP A: GENERATE AML SIGNATURE (Simulating your backend) ---
    const amlSignerKey = process.env.AML_PRIVATE_KEY;
    if (!amlSignerKey) {
        throw new Error("Missing AML_PRIVATE_KEY environment variable");
    }
    const amlWallet = new ethers.Wallet(amlSignerKey, ethers.provider);

    const domain = {
        name: "DedicatedVaultRouter",
        version: "1",
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: routerAddress,
    };

    const types = {
        Redeem: [
            { name: "sender", type: "address" },
            { name: "amountNuvaShares", type: "uint256" },
            { name: "deadline", type: "uint256" },
        ],
    };

    const amlValue = {
        sender: user.address,
        amountNuvaShares: amount,
        deadline: amlDeadline,
    };

    const amlSignature = await amlWallet.signTypedData(domain, types, amlValue);
    console.log("✅ AML Signature generated");

    // 1. Approve Router
    console.log("Approving router to pull Nuva shares...");
    const approveTx = await nuvaVault.connect(user).approve(routerAddress, amount);
    await approveTx.wait();
    console.log("✅ Approval confirmed.");

    // 2. Request Redeem
    console.log("Calling requestRedeem...");
    const tx = await router.connect(user).requestRedeem(amount, amlSignature, amlDeadline);
    const receipt = await tx.wait();

    // Find the event to get the proxy address
    const event = receipt.logs.find((log) => log.fragment && log.fragment.name === "RedemptionRequested");
    const proxyAddress = event.args[1];

    console.log(`
🚀 Success! Redemption requested.`);
    console.log(`Redemption Proxy Address: ${proxyAddress}`);
    console.log(`Transaction Hash:         ${receipt.hash}`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
