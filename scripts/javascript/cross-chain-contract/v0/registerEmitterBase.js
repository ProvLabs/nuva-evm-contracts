const hre = require("hardhat");
const { zeroPadValue, getAddress } = require("ethers");

async function main() {
    const vaultCrossChain = process.env.VAULT_CROSS_CHAIN_BASE_V0;
    if (!vaultCrossChain) {
        throw new Error("VAULT_CROSS_CHAIN_BASE_V0 is not set.");
    }
    console.log("Using vault:", vaultCrossChain);

    const vault = await hre.ethers.getContractAt("CrossChainVaultV0", vaultCrossChain);

    const emitterChainId = 10002;

    const rawAddress = process.env.VAULT_CROSS_CHAIN_ETH_V0;
    if (!rawAddress) {
        throw new Error("VAULT_CROSS_CHAIN_ETH_V0 is not set.");
    }
    const emitterAddress = zeroPadValue(getAddress(rawAddress), 32);

    const tx = await vault.registerEmitter(emitterChainId, emitterAddress);

    const receipt = await tx.wait();

    console.log("register tx:", receipt.hash);
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
