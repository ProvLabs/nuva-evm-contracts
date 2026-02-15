const { ethers, upgrades } = require("hardhat");

const SHARE_TOKEN_ADDRESS = process.env.SHARE_TOKEN_ADDRESS;
if (!SHARE_TOKEN_ADDRESS) {
    throw new Error("SHARE_TOKEN_ADDRESS is not set.");
}

const AML_SIGNER = process.env.AML_SIGNER_KEY;
if (!AML_SIGNER) {
    throw new Error("AML_SIGNER_KEY is not set.");
}

const CROSS_CHAIN_VAULT = process.env.VAULT_CROSS_CHAIN_ETH_V1;
if (!CROSS_CHAIN_VAULT) {
    throw new Error("VAULT_CROSS_CHAIN_ETH_V1 is not set.");
}

async function main() {
    // 1. Define the addresses for the initializer arguments
    // Replace these with your actual deployed token and manager addresses
    const DEPOSIT_TOKEN = "0x1c7d4b196cb0c7b01d743fbc6116a902379c7238";
    const [user] = await ethers.getSigners();
    const DESTINATION_MANAGER = user.address;

    console.log("Deploying CrossChainManager...");

    // 2. Get the contract factory
    const CrossChainManager = await ethers.getContractFactory("CrossChainManager");

    // 3. Deploy the proxy and call the initialize function
    const proxy = await upgrades.deployProxy(
        CrossChainManager,
        [DEPOSIT_TOKEN, SHARE_TOKEN_ADDRESS, AML_SIGNER, DESTINATION_MANAGER, CROSS_CHAIN_VAULT],
        {
            initializer: "initialize", // Explicitly naming the initializer function
            kind: "uups", // Or 'transparent', depending on your inheritance
        },
    );

    await proxy.waitForDeployment();

    const proxyAddress = await proxy.getAddress();
    const implementationAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);

    console.log("----------------------------------------------");
    console.log(`Proxy deployed to: ${proxyAddress}`);
    console.log(`Implementation deployed to: ${implementationAddress}`);
    console.log("----------------------------------------------");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
