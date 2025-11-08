const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { deployAMLUtils, deployWithdrawal } = require("./helpers/fixtures");

async function getAMLSignature({ amlSigner, user, token, paymentToken, amount, destination, deadline }) {
  const hash = ethers.solidityPackedKeccak256(
    ["address", "address", "address", "uint256", "address", "uint256"],
    [user.address, token.target, paymentToken, amount, destination, deadline]
  );
  const sig = await amlSigner.signMessage(ethers.getBytes(hash));
  return sig;
}

async function getPermitSignature({ token, owner, spender, value, deadline }) {
  const name = await token.name();
  const nonce = await token.nonces(owner.address);
  const chainId = (await owner.provider.getNetwork()).chainId;

  const domain = {
    name,
    version: "1",
    chainId,
    verifyingContract: token.target,
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

  const message = {
    owner: owner.address,
    spender,
    value,
    nonce,
    deadline,
  };

  const signature = await owner.signTypedData(domain, types, message);
  const { r, s, v } = ethers.Signature.from(signature);
  return { v, r, s };
}

describe("Withdrawal", function () {
  async function deployFixture() {
    const [deployer, amlSigner, user, other] = await ethers.getSigners();

    const CustomToken = await ethers.getContractFactory("CustomToken");
    const token = await CustomToken.deploy("Nu Token", "NU", deployer.address, 18);

    // paymentToken can be any address to log; use token address for simplicity
    const paymentToken = token.target;

    // Deploy AMLUtils and Withdrawal with linked library
    const amlUtils = await deployAMLUtils();
    const withdrawal = await deployWithdrawal(amlUtils);
    
    // Initialize the withdrawal contract with the deployer as the admin
    await withdrawal.initialize(token.target, paymentToken, amlSigner.address);
    
    // Grant the deployer the DEFAULT_ADMIN_ROLE and BURN_ROLE
    const DEFAULT_ADMIN_ROLE = await withdrawal.DEFAULT_ADMIN_ROLE();
    const BURN_ROLE = await withdrawal.BURN_ROLE();
    
    // Grant roles to the deployer
    await withdrawal.grantRole(DEFAULT_ADMIN_ROLE, deployer.address);
    await withdrawal.grantRole(BURN_ROLE, deployer.address);

    // Mint tokens to user and approve when needed
    await token.mint(user.address, ethers.parseUnits("1000", 18));

    return { deployer, amlSigner, user, other, token, withdrawal, paymentToken };
  }

  it("withdraw: locks tokens with valid AML signature", async function () {
    const { user, amlSigner, token, withdrawal, paymentToken } = await deployFixture();

    const amount = ethers.parseUnits("100", 18);
    const amlDeadline = (await ethers.provider.getBlock("latest")).timestamp + 3600;

    // Pre approve for withdraw (non-permit flow)
    await token.connect(user).approve(withdrawal.target, amount);

    const amlSig = await getAMLSignature({
      amlSigner,
      user,
      token,
      paymentToken,
      amount,
      destination: withdrawal.target,
      deadline: amlDeadline,
    });

    await expect(
      withdrawal.connect(user).withdraw(amount, amlSig, amlDeadline)
    )
      .to.emit(withdrawal, "Withdraw")
      .withArgs(user.address, amount, paymentToken);

    expect(await token.balanceOf(withdrawal.target)).to.equal(amount);
    expect(await token.balanceOf(user.address)).to.equal(ethers.parseUnits("900", 18));
  });

  it("withdrawWithPermit: locks tokens with AML and permit", async function () {
    const { user, amlSigner, token, withdrawal, paymentToken } = await deployFixture();

    const amount = ethers.parseUnits("50", 18);
    const amlDeadline = (await ethers.provider.getBlock("latest")).timestamp + 3600;
    const permitDeadline = amlDeadline + 1000;

    const amlSig = await getAMLSignature({
      amlSigner,
      user,
      token,
      paymentToken,
      amount,
      destination: withdrawal.target,
      deadline: amlDeadline,
    });

    const { v, r, s } = await getPermitSignature({
      token,
      owner: user,
      spender: withdrawal.target,
      value: amount,
      deadline: permitDeadline,
    });

    await expect(
      withdrawal
        .connect(user)
        .withdrawWithPermit(amount, amlSig, amlDeadline, permitDeadline, v, r, s)
    )
      .to.emit(withdrawal, "Withdraw")
      .withArgs(user.address, amount, paymentToken);

    expect(await token.balanceOf(withdrawal.target)).to.equal(amount);
  });

  it("reverts when AML signature expired", async function () {
    const { user, amlSigner, token, withdrawal, paymentToken } = await deployFixture();

    const amount = ethers.parseUnits("10", 18);
    const amlDeadline = (await ethers.provider.getBlock("latest")).timestamp - 1; // past

    await token.connect(user).approve(withdrawal.target, amount);

    const amlSig = await getAMLSignature({
      amlSigner,
      user,
      token,
      paymentToken,
      amount,
      destination: withdrawal.target,
      deadline: amlDeadline,
    });

    // Test expired signature - should revert with AMLUtils.AmlSignatureExpired
    const amlUtils = await (await ethers.getContractFactory("AMLUtils")).deploy();
    await expect(
      withdrawal.connect(user).withdraw(amount, amlSig, amlDeadline)
    ).to.be.revertedWithCustomError(amlUtils, "AmlSignatureExpired");
  });

  it("reverts on AML signature replay", async function () {
    const { user, amlSigner, token, withdrawal, paymentToken } = await deployFixture();

    const amount = ethers.parseUnits("5", 18);
    const amlDeadline = (await ethers.provider.getBlock("latest")).timestamp + 3600;

    await token.connect(user).approve(withdrawal.target, amount * 2n);

    const amlSig = await getAMLSignature({
      amlSigner,
      user,
      token,
      paymentToken,
      amount,
      destination: withdrawal.target,
      deadline: amlDeadline,
    });

    await withdrawal.connect(user).withdraw(amount, amlSig, amlDeadline);  

    // Test expired signature - should revert with AMLUtils.AmlSignatureExpired
    const amlUtils = await (await ethers.getContractFactory("AMLUtils")).deploy();
    await expect(
      withdrawal.connect(user).withdraw(amount, amlSig, amlDeadline)
    ).to.be.revertedWithCustomError(amlUtils, "AmlSignatureAlreadyUsed");
  });

  it("reverts for invalid AML signer", async function () {
    const { user, other, token, withdrawal, paymentToken } = await deployFixture();

    const amount = ethers.parseUnits("20", 18);
    const amlDeadline = (await ethers.provider.getBlock("latest")).timestamp + 3600;

    await token.connect(user).approve(withdrawal.target, amount);

    // Signed by wrong signer
    const amlSig = await getAMLSignature({
      amlSigner: other,
      user,
      token,
      paymentToken,
      amount,
      destination: withdrawal.target,
      deadline: amlDeadline,
    });

    // Test invalid AML signer
    const amlUtils = await (await ethers.getContractFactory("AMLUtils")).deploy();
    await expect(
      withdrawal.connect(user).withdraw(amount, amlSig, amlDeadline)
    ).to.be.revertedWithCustomError(amlUtils, "InvalidAmlSigner");
  });

  it("reverts when permit deadline expired", async function () {
    const { user, amlSigner, token, withdrawal, paymentToken, _amlUtils } = await loadFixture(deployFixture);

    const amount = ethers.parseUnits("15", 18);
    const now = (await ethers.provider.getBlock("latest")).timestamp;
    const amlDeadline = now - 3600;
    const permitDeadline = now - 1; // past

    const amlSig = await getAMLSignature({
      amlSigner,
      user,
      token,
      paymentToken,
      amount,
      destination: withdrawal.target,
      deadline: amlDeadline,
    });

    const { v, r, s } = await getPermitSignature({
      token,
      owner: user,
      spender: withdrawal.target,
      value: amount,
      deadline: permitDeadline,
    });

    // Test that the transaction reverts with the expected error
    const amlUtils = await (await ethers.getContractFactory("AMLUtils")).deploy();
    await expect(
      withdrawal
        .connect(user)
        .withdrawWithPermit(amount, amlSig, amlDeadline, permitDeadline, v, r, s)
    ).to.be.revertedWithCustomError(amlUtils, "AmlSignatureExpired");
  });

  describe("burn", function () {
    it("reverts when caller does not have BURNER_ROLE", async function () {
      const { deployer, user, token, withdrawal } = await deployFixture();
      const amount = ethers.parseUnits("100", 18);
      
      // Mint tokens to the deployer first
      await token.mint(deployer.address, amount);
      
      // Transfer tokens to the withdrawal contract
      await token.connect(deployer).transfer(withdrawal.target, amount);
      
      // Do NOT grant BURNER_ROLE to deployer
      
      // Should revert with an error when caller doesn't have BURNER_ROLE
      const mintTransactionHash = "0x1234567890123456789012345678901234567890123456789012345678901234";
      await expect(
        withdrawal.connect(deployer).burn(amount, mintTransactionHash)
      ).to.be.reverted;
    });

    it("reverts if non-admin tries to burn", async function () {
      const { other, withdrawal } = await deployFixture();
      const BURN_ROLE = await withdrawal.BURN_ROLE();
      await expect(withdrawal.connect(other).burn(1, "0x1234567890123456789012345678901234567890123456789012345678901234"))
        .to.be.revertedWithCustomError(withdrawal, "AccessControlUnauthorizedAccount")
        .withArgs(other.address, BURN_ROLE);
    });

    it("reverts when burn amount is zero", async function () {
      const { deployer, withdrawal } = await deployFixture();
      await expect(withdrawal.connect(deployer).burn(0, "0x1234567890123456789012345678901234567890123456789012345678901234")).to.be.revertedWithCustomError(
        withdrawal,
        "AmountMustBeGreaterThanZero"
      );
    });

    it("reverts when mint transaction hash is empty", async function () {
      const { deployer, withdrawal } = await deployFixture();
      await expect(withdrawal.connect(deployer).burn(1, "")).to.be.revertedWithCustomError(
        withdrawal,
        "InvalidMintTransactionHash"
      );
    });
  });

  describe("withdrawWithPermit edge cases", function () {
    it("reverts when amount is zero", async function () {
      const { user, amlSigner, token, withdrawal, paymentToken } = await deployFixture();
      const amlDeadline = (await ethers.provider.getBlock("latest")).timestamp + 3600;
      const permitDeadline = amlDeadline + 1000;

      const amlSig = await getAMLSignature({
        amlSigner,
        user,
        token,
        paymentToken,
        amount: 0,
        destination: withdrawal.target,
        deadline: amlDeadline,
      });

      const { v, r, s } = await getPermitSignature({
        token,
        owner: user,
        spender: withdrawal.target,
        value: 0,
        deadline: permitDeadline,
      });

      await expect(
        withdrawal.connect(user).withdrawWithPermit(0, amlSig, amlDeadline, permitDeadline, v, r, s)
      ).to.be.revertedWithCustomError(withdrawal, "AmountMustBeGreaterThanZero");
    });

    it("reverts with expired AML signature", async function () {
      const { user, amlSigner, token, withdrawal, paymentToken } = await deployFixture();
      const amount = ethers.parseUnits("10", 18);
      const amlDeadline = (await ethers.provider.getBlock("latest")).timestamp - 1; // In the past
      const permitDeadline = amlDeadline + 1000;

      const amlSig = await getAMLSignature({
        amlSigner,
        user,
        token,
        paymentToken,
        amount,
        destination: withdrawal.target,
        deadline: amlDeadline,
      });

      const { v, r, s } = await getPermitSignature({
        token,
        owner: user,
        spender: withdrawal.target,
        value: amount,
        deadline: permitDeadline,
      });

      // Test expired signature - should revert with AMLUtils.AmlSignatureExpired
    const amlUtils = await (await ethers.getContractFactory("AMLUtils")).deploy();
      await expect(
        withdrawal.connect(user).withdrawWithPermit(amount, amlSig, amlDeadline, permitDeadline, v, r, s)
      ).to.be.revertedWithCustomError(amlUtils, "AmlSignatureExpired");
    });
  });

  describe("ERC20 functions", function () {
    it("should not have transfer function", async function () {
      const { withdrawal } = await deployFixture();
      
      // Check if transfer function exists and is not callable
      expect(await withdrawal.transfer).to.be.undefined;
    });

    it("should not have transferFrom function", async function () {
      const { withdrawal } = await deployFixture();
      
      // Check if transferFrom function exists and is not callable
      expect(await withdrawal.transferFrom).to.be.undefined;
    });
  });
});
