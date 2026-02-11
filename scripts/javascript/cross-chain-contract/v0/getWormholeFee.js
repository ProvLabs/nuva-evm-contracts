const hre = require("hardhat");

async function main() {
    const vaultCrossChain = process.env.VAULT_CROSS_CHAIN;
    if (!vaultCrossChain) {
        throw new Error("VAULT_CROSS_CHAIN is not set.");
    }
    console.log("Using vault:", vaultCrossChain);

    const vault = await hre.ethers.getContractAt("CrossChainVaultV0", vaultCrossChain);

    const wormholeFee = await vault
        .wormhole()
        .then((w) => hre.ethers.getContractAt("IWormhole", w))
        .then((c) => c.messageFee());

    console.log("Fee:", wormholeFee);
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
