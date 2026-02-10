const { ethers } = require("hardhat");

/**
 * @notice Script to request a redemption from the DedicatedVaultRouter using ERC20 Permit.
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
    const nuvaERC20 = await ethers.getContractAt("ERC20", nuvaVaultAddress);
    const nuvaPermit = await ethers.getContractAt(
        "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol:IERC20Permit",
        nuvaVaultAddress,
    );

    // 1. Check User Balance
    const decimals = await nuvaERC20.decimals();
    const balance = await nuvaERC20.balanceOf(user.address);
    const amount = ethers.parseUnits(redeemAmountStr, decimals);

    console.log(`--- Status Check ---`);
    console.log(`User Address:    `, user.address);
    console.log(`User Balance:    `, ethers.formatUnits(balance, decimals));
    console.log(`Requested Amount:`, redeemAmountStr);

    if (balance < amount) {
        throw new Error(
            `Insufficient balance! You have ${ethers.formatUnits(balance, decimals)} but requested ${redeemAmountStr}`,
        );
    }

    const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

    // --- STEP A: GENERATE AML SIGNATURE ---
    const amlSignerKey = process.env.AML_PRIVATE_KEY;
    if (!amlSignerKey) {
        throw new Error("Missing AML_PRIVATE_KEY environment variable");
    }
    const amlWallet = new ethers.Wallet(amlSignerKey, ethers.provider);
    const contractAmlSigner = await router.amlSigner();

    console.log(`\n--- AML Verification ---`);
    console.log(`Contract AML Signer:`, contractAmlSigner);
    console.log(`Script AML Signer:  `, amlWallet.address);

    if (contractAmlSigner.toLowerCase() !== amlWallet.address.toLowerCase()) {
        console.warn("⚠️ WARNING: AML Signer mismatch! Transaction WILL revert.");
    }

    const amlDomain = {
        name: "DedicatedVaultRouter",
        version: "1",
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: routerAddress,
    };

    const amlTypes = {
        Redeem: [
            { name: "sender", type: "address" },
            { name: "amountNuvaShares", type: "uint256" },
            { name: "deadline", type: "uint256" },
        ],
    };

    const amlValue = {
        sender: user.address,
        amountNuvaShares: amount,
        deadline: deadline,
    };

    const amlSignature = await amlWallet.signTypedData(amlDomain, amlTypes, amlValue);
    console.log("✅ AML Signature generated");

    // --- STEP B: GENERATE PERMIT SIGNATURE ---
    const nonce = await nuvaPermit.nonces(user.address);
    const vaultName = await nuvaERC20.name();
    const chainId = (await ethers.provider.getNetwork()).chainId;

    const permitDomain = {
        name: vaultName,
        version: "1",
        chainId: chainId,
        verifyingContract: nuvaVaultAddress,
    };

    const permitTypes = {
        Permit: [
            { name: "owner", type: "address" },
            { name: "spender", type: "address" },
            { name: "value", type: "uint256" },
            { name: "nonce", type: "uint256" },
            { name: "deadline", type: "uint256" },
        ],
    };

    const permitValue = {
        owner: user.address,
        spender: routerAddress,
        value: amount,
        nonce: nonce,
        deadline: deadline,
    };

    console.log("Requesting Permit signature from user...");
    const permitSignature = await user.signTypedData(permitDomain, permitTypes, permitValue);
    const sig = ethers.Signature.from(permitSignature);
    console.log("✅ Permit signature generated.");

    // --- STEP C: EXECUTE ---
    console.log("\nSending requestRedeemWithPermit transaction...");
    try {
        const tx = await router
            .connect(user)
            .requestRedeemWithPermit(amount, amlSignature, deadline, deadline, sig.v, sig.r, sig.s);
        const receipt = await tx.wait();

        const event = receipt.logs.find((log) => log.fragment && log.fragment.name === "RedemptionRequested");
        const proxyAddress = event.args[1];

        console.log(`\n🚀 Success! Redemption requested.`);
        console.log(`Redemption Proxy Address: ${proxyAddress}`);
        console.log(`Transaction Hash:         ${receipt.hash}`);
    } catch (error) {
        if (error.data) {
            try {
                const decodedError = router.interface.parseError(error.data);
                console.error(`\n❌ Transaction Reverted with: ${decodedError ? decodedError.name : error.data}`);
            } catch (parseError) {
                console.error(`\n❌ Transaction Reverted (Raw Data):`, error.data);
            }
        } else {
            console.error(`\n❌ Error:`, error.message);
        }
        process.exit(1);
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
