const hre = require("hardhat");

async function buildPermit(owner, token, spender, value, deadline) {
  const ownerAddr = await owner.getAddress();
  const chainId = (await hre.ethers.provider.getNetwork()).chainId;
  const nonce = await token.nonces(ownerAddr);

  const domain = {
    name: await token.name(),
    version: "1",
    chainId,
    verifyingContract: await token.getAddress(),
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
    owner: ownerAddr,
    spender,
    value,
    nonce,
    deadline,
  };

  const signature = await owner.signTypedData(domain, types, values);
  const sig = hre.ethers.Signature.from(signature);
  return { v: sig.v, r: sig.r, s: sig.s };
}

async function main() {
  const factoryAddr = process.env.FACTORY_ADDRESS;
  if (!factoryAddr) throw new Error("FACTORY_ADDRESS is not set.");

  const factory = await hre.ethers.getContractAt("TokenFactory", factoryAddr);
  const tokens = await factory.getAllTokens();
  if (!tokens.length) throw new Error("No tokens created by factory.");

  const tokenAddr = tokens[tokens.length - 1];
  console.log("Using token:", tokenAddr);

  const token = await hre.ethers.getContractAt("CustomToken", tokenAddr);
  const decimals = await token.decimals();
  console.log("decimals:", decimals);

  // Signers: owner authorizes, spender executes approve
  const ownerSigner = new hre.ethers.Wallet(process.env.PRIVATE_KEY);
  if (!ownerSigner) throw new Error("PRIVATE_KEY is not set.");

  const spenderSigner = new hre.ethers.Wallet(process.env.PRIVATE_KEY_1);
  if (!spenderSigner) throw new Error("PRIVATE_KEY_1 is not set.");

  const ownerAddr = await ownerSigner.getAddress();
  const spenderAddr = await spenderSigner.getAddress();

  // Ensure the token supports ERC20Permit (nonces must be callable)
  try {
    await token.nonces(ownerAddr);
  } catch (e) {
    throw new Error(
      `Selected token ${tokenAddr} does not appear to support ERC20Permit (nonces() reverted). ` +
        `Deploy a new token with permit enabled via the factory, or set TOKEN_ADDRESS/FACTORY_ADDRESS to a permit-enabled token.`,
    );
  }

  const amountRaw = "1000";
  const deadlineSec = Math.floor(Date.now() / 1000) + 3600;
  const amount = hre.ethers.parseUnits(amountRaw, decimals);

  console.log(
    `Building permit for owner=${ownerAddr}, spender=${spenderAddr}, amount=${amountRaw}`,
  );
  const { v, r, s } = await buildPermit(
    ownerSigner,
    token,
    spenderAddr,
    amount,
    deadlineSec,
  );

  console.log("Submitting permit...");
  const tx = await token.permit(
    ownerAddr,
    spenderAddr,
    amount,
    deadlineSec,
    v,
    r,
    s,
  );
  const receipt = await tx.wait();
  console.log("permit tx:", receipt.hash);

  const allowance = await token.allowance(ownerAddr, spenderAddr);
  console.log("New allowance:", hre.ethers.formatUnits(allowance, decimals));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
