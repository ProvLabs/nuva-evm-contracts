const { ethers } = require("hardhat");

// --- CONFIGURATION ---
// !! Replace these values with your contract's details !!

// 1. The name of your compiled contract (e.g., "MyToken", "YourERC20")
// This must match the contract name in your /contracts folder.
const CONTRACT_NAME = "CustomToken";

// 2. The address of your deployed ERC20 contract
const CONTRACT_ADDRESS = "0xD4DFbBf2d276AbBDE3d3604881523d4A8a3081Dd";

// 3. The string name of the role you want to transfer (e.g., "MINTER_ROLE", "PAUSER_ROLE")
// This MUST match the string used in your contract (e.g., bytes32 MINTER_ROLE = keccak256("MINTER_ROLE"))
const ROLE_NAME = "MINTER_ROLE";

// 4. The address currently holding the role
const OLD_ADDRESS = "0xEB1a7CdaC304E08731a35cc0336dC3D612662468";

// 5. The address that will receive the role
const NEW_ADDRESS = "0xD6084C316d8c43f9695517B0961a9bDb6A1E2294";

// --- END CONFIGURATION ---

async function main() {
    console.log("Starting role transfer script...");

    // Get the signer account (assumed to be the admin)
    const [adminSigner] = await ethers.getSigners();
    console.log(`Using admin account: ${adminSigner.address}`);

    if (!ethers.isAddress(CONTRACT_ADDRESS) || !ethers.isAddress(OLD_ADDRESS) || !ethers.isAddress(NEW_ADDRESS)) {
        console.error("Invalid address found in configuration. Please check your addresses.");
        process.exit(1);
    }

    // Get the contract instance
    const token = await ethers.getContractAt(CONTRACT_NAME, CONTRACT_ADDRESS, adminSigner);
    console.log(`Attached to contract at: ${token.address}`);

    // 1. Get the bytes32 value for the role
    // This uses ethers.utils.id() which computes the keccak256 hash of the string,
    // which is how OpenZeppelin AccessControl defines roles.
    let roleBytes;
    if (ROLE_NAME === "DEFAULT_ADMIN_ROLE") {
        // The DEFAULT_ADMIN_ROLE is special, its value is 0x00
        roleBytes = ethers.HashZero;
        console.log(`Role: DEFAULT_ADMIN_ROLE (${roleBytes})`);
    } else {
        roleBytes = ethers.id(ROLE_NAME);
        console.log(`Role: ${ROLE_NAME} (${roleBytes})`);
    }

    console.log(`\nAttempting to transfer role from ${OLD_ADDRESS} to ${NEW_ADDRESS}...`);

    // 2. Grant the role to the new address
    try {
        // Check if new address already has the role
        const hasRoleNew = await token.hasRole(roleBytes, NEW_ADDRESS);
        if (hasRoleNew) {
            console.log(`Skipping grant: ${NEW_ADDRESS} already has the role.`);
        } else {
            console.log(`Granting role to ${NEW_ADDRESS}...`);
            const grantTx = await token.grantRole(roleBytes, NEW_ADDRESS);
            await grantTx.wait();
            console.log(`✅ Role GRANTED to ${NEW_ADDRESS} (Tx: ${grantTx.hash})`);
        }
    } catch (error) {
        console.error(`❌ Error granting role: ${error.message}`);
        console.log("Aborting script. The old address still has the role.");
        process.exit(1);
    }

    // 3. Revoke the role from the old address
    try {
        // Check if old address actually has the role
        const hasRoleOld = await token.hasRole(roleBytes, OLD_ADDRESS);
        if (!hasRoleOld) {
            console.log(`Skipping revoke: ${OLD_ADDRESS} does not have the role.`);
        } else {
            console.log(`Revoking role from ${OLD_ADDRESS}...`);
            const revokeTx = await token.revokeRole(roleBytes, OLD_ADDRESS);
            await revokeTx.wait();
            console.log(`✅ Role REVOKED from ${OLD_ADDRESS} (Tx: ${revokeTx.hash})`);
        }
    } catch (error) {
        console.error(`❌ Error revoking role: ${error.message}`);
        console.log("Warning: Role was granted to new address but could not be revoked from old address.");
        process.exit(1);
    }

    console.log("\n🎉 Role transfer complete!");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
