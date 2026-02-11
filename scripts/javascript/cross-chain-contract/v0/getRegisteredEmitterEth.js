const hre = require("hardhat");

async function main() {
    const vaultCrossChain = process.env.VAULT_CROSS_CHAIN_ETH;
    if (!vaultCrossChain) {
        throw new Error("VAULT_CROSS_CHAIN_ETH is not set.");
    }
    console.log("Using vault:", vaultCrossChain);

    const vault = await hre.ethers.getContractAt("CrossChainVaultV0", vaultCrossChain);

    const targetChain = 10004;

    const emitter = await vault.getRegisteredEmitter(targetChain);

    console.log("Emitter:", emitter);
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
