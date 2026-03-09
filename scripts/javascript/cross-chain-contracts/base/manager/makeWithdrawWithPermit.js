// scripts/makeWithdraw.js
const { ethers } = require("hardhat");
const {
  buildPermit,
  getAmlSigner,
  getAmlSignature,
} = require("../../utils/helper");

// --- START: Configuration ---
const CROSS_CHAIN_MANAGER_ADDRESS = process.env.CROSS_CHAIN_MANAGER_PROXY_BASE;
if (!CROSS_CHAIN_MANAGER_ADDRESS) {
  throw new Error("CROSS_CHAIN_MANAGER_PROXY_BASE is not set.");
}

const SHARE_TOKEN_ADDRESS = process.env.SHARE_TOKEN_ADDRESS;
if (!SHARE_TOKEN_ADDRESS) {
  throw new Error("SHARE_TOKEN_ADDRESS is not set.");
}

// Wallet to receive tokens
const DESTINATION_ADDRESS = process.env.PUBLIC_KEY;
if (!DESTINATION_ADDRESS) {
  throw new Error("PUBLIC_KEY is not set.");
}

// NOTE: Change '6' if your token has different decimals (e.g., 6 for USDC)
const AMOUNT_TO_WITHDRAW = ethers.parseUnits("0.15", 6);

// Token Address
const TOKEN_ADDRESS = process.env.USDC_BASE;
if (!TOKEN_ADDRESS) {
  throw new Error("USDC_BASE is not set.");
}

// --- END: Configuration ---

async function main() {
  // 1. Get our "user" (signer 1)
  const [user] = await ethers.getSigners();
  const amlSigner = getAmlSigner();

  console.log(`Simulating withdraw as user: ${user.address}`);
  console.log(`AML Signer (server): ${amlSigner.address}`);
  console.log(`Sending tokens to destination: ${DESTINATION_ADDRESS}`);

  // 2. Get contract instances
  // We need the "Withdrawal" ABI to talk to the proxy
  const crossChainManager = await ethers.getContractAt(
    "CrossChainManager",
    CROSS_CHAIN_MANAGER_ADDRESS,
  );

  const PERMIT_ABI = [
    "function name() view returns (string)",
    "function nonces(address owner) view returns (uint256)",
    "function balanceOf(address account) view returns (uint256)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)",
  ];

  // We need the "IERC20" ABI to talk to the token
  const shareToken = await ethers.getContractAt(
    PERMIT_ABI,
    SHARE_TOKEN_ADDRESS,
  );

  // 3. Check if the user has enough tokens
  const balance = await shareToken.balanceOf(user.address);
  if (balance < AMOUNT_TO_WITHDRAW) {
    console.error("❌ Error: User does not have enough tokens.");
    console.error(`  User Balance: ${ethers.formatUnits(balance, 6)}`);
    console.error(
      `  Amount to Withdraw: ${ethers.formatUnits(AMOUNT_TO_WITHDRAW, 6)}`,
    );
    console.log("Please get tokens from a faucet before running again.");
    return;
  }
  console.log(
    `User balance is: ${ethers.formatUnits(balance, 6)} tokens. Proceeding...`,
  );

  // --- STEP 1: Generate AML Signature (Server-side) ---
  console.log("\n1. Generating AML Signature (as server)...");

  const amlDeadline = Math.floor(Date.now() / 1000) + 60 * 60;

  // Sign using signTypedData (No manual hashing required!)
  const amlSignature = await getAmlSignature({
    name: "Withdrawal",
    amlSigner,
    sender: user.address,
    amount: AMOUNT_TO_WITHDRAW,
    deadline: amlDeadline,
    destinationAddress: DESTINATION_ADDRESS,
    verifyingContract: CROSS_CHAIN_MANAGER_ADDRESS,
  });
  console.log("   ✅ AML Signature created successfully.");

  // --- STEP 1: APPROVE ---
  // The user approves the proxy contract to spend their tokens
  const currentAllowance = await shareToken.allowance(
    user.address,
    crossChainManager,
  );

  if (currentAllowance < AMOUNT_TO_WITHDRAW) {
    console.log("Allowance too low. Sending approval transaction...");
    // Approve the Vault to spend your tokens
    const approveTx = await shareToken
      .connect(user)
      .approve(crossChainManager.target, AMOUNT_TO_WITHDRAW);
    await approveTx.wait();
    console.log("Approval confirmed!");
  } else {
    console.log("Sufficient allowance already exists.");
  }

  // Get the token's current nonce for the user
  const permitNonce = await shareToken.nonces(user.address);

  // This deadline is for the permit signature
  const permitDeadline = Math.floor(Date.now() / 1000) + 20 * 60; // 20 minutes

  // Sign the typed data
  const permitSignature = await buildPermit({
    tokenName: await shareToken.name(),
    user,
    amount: AMOUNT_TO_WITHDRAW,
    permitNonce,
    permitDeadline,
    destinationAddress: crossChainManager.target,
    verifyingContract: SHARE_TOKEN_ADDRESS,
    version: "1",
  });
  const { v, r, s } = ethers.Signature.from(permitSignature);
  console.log("   ✅ Permit Signature created.");

  // --- STEP 2: WITHDRAW ---
  // The user calls the withdraw function on the proxy
  console.log("2. Calling withdraw() on the proxy contract...");

  // connect the `user` to the `crossChainManager` contract
  try {
    const withdrawTx = await crossChainManager
      .connect(user)
      .withdrawWithPermit(
        AMOUNT_TO_WITHDRAW,
        DESTINATION_ADDRESS,
        amlSignature,
        amlDeadline,
        permitDeadline,
        v,
        r,
        s,
      );
    const receipt = await withdrawTx.wait();

    console.log("   ✅ Withdraw successful! Transaction hash:", receipt.hash);
  } catch (error) {
    console.log("Actual Revert Reason:", error);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
