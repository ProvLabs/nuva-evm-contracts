const hre = require("hardhat");
const { zeroPadValue, getAddress } = require("ethers");

async function main() {
    const vaultCrossChain = process.env.VAULT_CROSS_CHAIN_ETH;
    if (!vaultCrossChain) {
        throw new Error("VAULT_CROSS_CHAIN_ETH is not set.");
    }
    console.log("Using vault:", vaultCrossChain);

    const vault = await hre.ethers.getContractAt("CrossChainVault", vaultCrossChain);

    const decimals = 6;
    const amount = hre.ethers.parseUnits("1", decimals);
    // Eth USDC Token Address
    const token = "0x1c7d4b196cb0c7b01d743fbc6116a902379c7238";
    const erc20ABI = [
        "function approve(address spender, uint256 amount) public returns (bool)",
        "function allowance(address owner, address spender) public view returns (uint256)",
    ];
    const tokenContract = new hre.ethers.Contract(token, erc20ABI, (await hre.ethers.getSigners())[0]);

    // Check current allowance
    const currentAllowance = await tokenContract.allowance(process.env.PUBLIC_KEY, vaultCrossChain);

    if (currentAllowance < amount) {
        console.log("Allowance too low. Sending approval transaction...");
        // Approve the Vault to spend your tokens
        const approveTx = await tokenContract.approve(vaultCrossChain, amount);
        await approveTx.wait();
        console.log("Approval confirmed!");
    } else {
        console.log("Sufficient allowance already exists.");
    }

    const wormholeAddress = await vault.wormhole();
    const wormhole = await hre.ethers.getContractAt("IWormhole", wormholeAddress);
    const fee = await wormhole.messageFee();
    console.log(`Current Wormhole Fee: ${fee.toString()} wei`);

    const targetChain = 10004;
    const batchId = 1;

    const rawAddress = process.env.PUBLIC_KEY;
    if (!rawAddress) {
        throw new Error("PUBLIC_KEY is not set.");
    }
    const targetRecipient = zeroPadValue(getAddress(rawAddress), 32);

    try {
        const tx = await vault.sendTokensWithPayload(token, amount, targetChain, batchId, targetRecipient, {
            value: fee,
            gasLimit: 500000,
        });
        const receipt = await tx.wait();

        console.log("send tx:", receipt.hash);
    } catch (error) {
        console.log("Actual Revert Reason:", error);
    }
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
