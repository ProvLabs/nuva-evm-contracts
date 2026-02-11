const hre = require("hardhat");
const { zeroPadValue, getAddress } = require("ethers");

async function main() {
    const vaultCrossChain = process.env.VAULT_CROSS_CHAIN;
    if (!vaultCrossChain) {
        throw new Error("VAULT_CROSS_CHAIN is not set.");
    }
    console.log("Using vault:", vaultCrossChain);

    const vault = await hre.ethers.getContractAt("CrossChainVaultV0", vaultCrossChain);

    const rawAddress = process.env.PUBLIC_KEY;
    if (!rawAddress) {
        throw new Error("PUBLIC_KEY is not set.");
    }
    const targetRecipient = zeroPadValue(getAddress(rawAddress), 32);

    const encodePayload = await vault.encodePayload({
        payloadID: 1,
        targetRecipient: targetRecipient,
    });

    console.log("encodePayload:", encodePayload);
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
