// scripts/withdrawWithPermit.js
const { ethers } = require("hardhat");

// --- START: Configuration ---
const CLONE_ADDRESS = "0x8aAef1A980Da6B5a26FD8ee9Ebd13c5e60055188"; // Replace with your Withdrawal clone address
const WITHDRAWAL_TOKEN_ADDRESS = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238"; // The token being withdrawn (must be an ERC20Permit token)
const SHARE_TOKEN_ADDRESS = "0x792949BA096871c6411634b53183A7764f2244f8";  // The corresponding share token (for event logging)

// NOTE: Change '18' if your token has different decimals
const AMOUNT_TO_WITHDRAW = ethers.parseUnits("10.0", 18);
// --- END: Configuration ---

// --- Helper: Load AML Signer ---
function getAmlSigner() {
  const amlPrivateKey = process.env.AML_SIGNER_KEY;
  if (!amlPrivateKey || amlPrivateKey.length !== 66) { // 0x + 64 hex chars
    throw new Error(
      "Invalid or missing AML_SIGNER_KEY in .env file. " +
      "It should be a 66-character hex string (starting with 0x)."
    );
  }
  return new ethers.Wallet(amlPrivateKey, ethers.provider);
}

async function main() {
  // 1. Get signers
  const [_, user] = await ethers.getSigners();
  const amlSigner = getAmlSigner();

  console.log(`Simulating withdrawWithPermit as user: ${user.address}`);
  console.log(`AML Signer (server): ${amlSigner.address}`);
  console.log(`Targeting clone: ${CLONE_ADDRESS}`);

  // 2. Get contract instances
  // Note: We use a more complete ABI (IFullERC20) to get `name()` and `nonces()` for the permit
  const withdrawal = await ethers.getContractAt("Withdrawal", CLONE_ADDRESS);
  const withdrawalToken = await ethers.getContractAt("IFullERC20", WITHDRAWAL_TOKEN_ADDRESS);

  // 3. Check user's balance
  const balance = await withdrawalToken.balanceOf(user.address);
  if (balance < AMOUNT_TO_WITHDRAW) {
    console.error("❌ Error: User does not have enough tokens.");
    return;
  }
  console.log(`User balance is: ${ethers.formatUnits(balance, 18)} tokens. Proceeding...`);

  // --- STEP 1: Generate AML Signature (Server-side) ---
  console.log("\n1. Generating AML Signature (as server)...");
  const amlDeadline = Math.floor(Date.now() / 1000) + (20 * 60); // 20 minutes
  const amlMessageHash = ethers.solidityPackedKeccak256(
    ["address", "address", "address", "uint256", "address", "uint256"],
    [user.address, WITHDRAWAL_TOKEN_ADDRESS, SHARE_TOKEN_ADDRESS, AMOUNT_TO_WITHDRAW, CLONE_ADDRESS, amlDeadline]
  );
  const amlSignature = await amlSigner.signMessage(ethers.getBytes(amlMessageHash));
  console.log("   ✅ AML Signature created.");

  // --- STEP 2: Generate Permit Signature (Client-side) ---
  console.log("\n2. Generating EIP-2612 Permit Signature (as user)...");
  const permitDeadline = Math.floor(Date.now() / 1000) + (20 * 60); // 20 minutes
  const nonce = await withdrawalToken.nonces(user.address);
  const tokenName = await withdrawalToken.name();
  const { chainId } = await ethers.provider.getNetwork();

  const domain = {
    name: tokenName,
    version: '1',
    chainId: chainId,
    verifyingContract: withdrawalToken.target
  };

  const types = {
    Permit: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
  };

  const values = {
    owner: user.address,
    spender: withdrawal.target,
    value: AMOUNT_TO_WITHDRAW,
    nonce: nonce,
    deadline: permitDeadline,
  };

  const permitSignature = await user.signTypedData(domain, types, values);
  const { v, r, s } = ethers.Signature.from(permitSignature);
  console.log("   ✅ Permit Signature created.");

  // --- STEP 3: WITHDRAW WITH PERMIT ---
  console.log("\n3. Calling withdrawWithPermit() on the clone contract...");

  const tx = await withdrawal.connect(user).withdrawWithPermit(
    AMOUNT_TO_WITHDRAW,
    amlSignature,
    amlDeadline,
    permitDeadline,
    v, r, s
  );
  const receipt = await tx.wait();
  console.log("   ✅ withdrawWithPermit successful! Transaction hash:", receipt.hash);

  // 4. Final verification
  const finalContractBalance = await withdrawalToken.balanceOf(CLONE_ADDRESS);
  console.log("-----------------------------------------");
  console.log("🎉 Verification Complete 🎉");
  console.log(`Contract's final token balance: ${ethers.formatUnits(finalContractBalance, 18)} tokens.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
