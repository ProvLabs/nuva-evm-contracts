const { ethers } = require("hardhat");

/**
 * @notice Script to request a redemption from the DedicatedVaultRouter using ERC20 Permit.
 * This script handles:
 * 1. Generating a Permit signature for the Nuva Vault shares.
 * 2. Calling requestRedeemWithPermit on the router.
 * 
 * Required Env Vars:
 * - ROUTER_PROXY_ADDRESS: Address of the deployed router proxy.
 * - NUVA_VAULT_ADDRESS: Address of the Nuva Vault.
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
    const nuvaVault = await ethers.getContractAt(
        "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol:IERC20Permit",
        nuvaVaultAddress
    );
    const nuvaERC20 = await ethers.getContractAt("ERC20", nuvaVaultAddress);

    const amount = ethers.parseUnits(redeemAmountStr, 18); // Assuming 18 decimals for vault shares
    const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

    console.log(`Preparing redemption with Permit for ${redeemAmountStr} Nuva shares for ${user.address}...`);

    // 1. Generate Permit Signature
    const nonce = await nuvaVault.nonces(user.address);
    const vaultName = await nuvaERC20.name();
    const chainId = (await ethers.provider.getNetwork()).chainId;

    const domain = {
        name: vaultName,
        version: "1",
        chainId: chainId,
        verifyingContract: nuvaVaultAddress
    };

    const types = {
        Permit: [
            { name: "owner", type: "address" },
            { name: "spender", type: "address" },
            { name: "value", type: "uint256" },
            { name: "nonce", type: "uint256" },
            { name: "deadline", type: "uint256" }
        ]
    };

    const value = {
        owner: user.address,
        spender: routerAddress,
        value: amount,
        nonce: nonce,
        deadline: deadline
    };

    console.log("Requesting Permit signature from user...");
    const permitSignature = await user.signTypedData(domain, types, value);
    const sig = ethers.Signature.from(permitSignature);
    console.log("✅ Permit signature generated.");

    // 2. Request Redeem with Permit
    console.log("Calling requestRedeemWithPermit...");
    const tx = await router.connect(user).requestRedeemWithPermit(
        amount,
        deadline,
        sig.v,
        sig.r,
        sig.s
    );
    const receipt = await tx.wait();

    // Find the event to get the proxy address
    const event = receipt.logs.find(log => log.fragment && log.fragment.name === "RedemptionRequested");
    const proxyAddress = event.args[1];

    console.log(`
🚀 Success! Redemption requested with Permit.`);
    console.log(`Redemption Proxy Address: ${proxyAddress}`);
    console.log(`Transaction Hash:         ${receipt.hash}`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
