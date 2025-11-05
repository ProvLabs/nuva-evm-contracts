const { expect } = require("chai");
const { ethers } = require("hardhat");

async function getAMLSignature({ amlSigner, user, token, shareToken, amount, destination, deadline }) {
  const hash = ethers.solidityPackedKeccak256(
    ["address", "address", "address", "uint256", "address", "uint256"],
    [user.address, token.target, shareToken, amount, destination, deadline]
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

    // shareToken can be any address to log; use token address for simplicity
    const shareToken = token.target;

    const Withdrawal = await ethers.getContractFactory("Withdrawal");
    const withdrawal = await Withdrawal.deploy();
    await withdrawal.initialize(token.target, shareToken, amlSigner.address);

    // Grant BURNER_ROLE to the withdrawal contract
    const BURNER_ROLE = await token.BURNER_ROLE();
    await token.grantRole(BURNER_ROLE, withdrawal.target);

    // Mint tokens to user and approve when needed
    await token.mint(user.address, ethers.parseUnits("1000", 18));

    return { deployer, amlSigner, user, other, token, withdrawal, shareToken };
  }

  it("withdraw: locks tokens with valid AML signature", async function () {
    const { user, amlSigner, token, withdrawal, shareToken } = await deployFixture();

    const amount = ethers.parseUnits("100", 18);
    const amlDeadline = (await ethers.provider.getBlock("latest")).timestamp + 3600;

    // Pre approve for withdraw (non-permit flow)
    await token.connect(user).approve(withdrawal.target, amount);

    const amlSig = await getAMLSignature({
      amlSigner,
      user,
      token,
      shareToken,
      amount,
      destination: withdrawal.target,
      deadline: amlDeadline,
    });

    await expect(
      withdrawal.connect(user).withdraw(amount, amlSig, amlDeadline)
    )
      .to.emit(withdrawal, "Withdraw")
      .withArgs(user.address, amount, shareToken, withdrawal.target);

    expect(await token.balanceOf(withdrawal.target)).to.equal(amount);
    expect(await token.balanceOf(user.address)).to.equal(ethers.parseUnits("900", 18));
  });

  it("withdrawWithPermit: locks tokens with AML and permit", async function () {
    const { user, amlSigner, token, withdrawal, shareToken } = await deployFixture();

    const amount = ethers.parseUnits("50", 18);
    const amlDeadline = (await ethers.provider.getBlock("latest")).timestamp + 3600;
    const permitDeadline = amlDeadline + 1000;

    const amlSig = await getAMLSignature({
      amlSigner,
      user,
      token,
      shareToken,
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
      .withArgs(user.address, amount, shareToken, withdrawal.target);

    expect(await token.balanceOf(withdrawal.target)).to.equal(amount);
  });

  it("reverts when AML signature expired", async function () {
    const { user, amlSigner, token, withdrawal, shareToken } = await deployFixture();

    const amount = ethers.parseUnits("10", 18);
    const amlDeadline = (await ethers.provider.getBlock("latest")).timestamp - 1; // past

    await token.connect(user).approve(withdrawal.target, amount);

    const amlSig = await getAMLSignature({
      amlSigner,
      user,
      token,
      shareToken,
      amount,
      destination: withdrawal.target,
      deadline: amlDeadline,
    });

    await expect(
      withdrawal.connect(user).withdraw(amount, amlSig, amlDeadline)
    ).to.be.revertedWithCustomError(withdrawal, "AMLSignatureExpired");
  });

  it("reverts on AML signature replay", async function () {
    const { user, amlSigner, token, withdrawal, shareToken } = await deployFixture();

    const amount = ethers.parseUnits("5", 18);
    const amlDeadline = (await ethers.provider.getBlock("latest")).timestamp + 3600;

    await token.connect(user).approve(withdrawal.target, amount * 2n);

    const amlSig = await getAMLSignature({
      amlSigner,
      user,
      token,
      shareToken,
      amount,
      destination: withdrawal.target,
      deadline: amlDeadline,
    });

    await withdrawal.connect(user).withdraw(amount, amlSig, amlDeadline);
    await expect(
      withdrawal.connect(user).withdraw(amount, amlSig, amlDeadline)
    ).to.be.revertedWithCustomError(withdrawal, "AMLSignatureAlreadyUsed");
  });

  it("reverts for invalid AML signer", async function () {
    const { user, other, token, withdrawal, shareToken } = await deployFixture();

    const amount = ethers.parseUnits("20", 18);
    const amlDeadline = (await ethers.provider.getBlock("latest")).timestamp + 3600;

    await token.connect(user).approve(withdrawal.target, amount);

    // Signed by wrong signer
    const amlSig = await getAMLSignature({
      amlSigner: other,
      user,
      token,
      shareToken,
      amount,
      destination: withdrawal.target,
      deadline: amlDeadline,
    });

    await expect(
      withdrawal.connect(user).withdraw(amount, amlSig, amlDeadline)
    ).to.be.revertedWithCustomError(withdrawal, "InvalidAMLSigner");
  });

  it("reverts when permit deadline expired", async function () {
    const { user, amlSigner, token, withdrawal, shareToken } = await deployFixture();

    const amount = ethers.parseUnits("15", 18);
    const now = (await ethers.provider.getBlock("latest")).timestamp;
    const amlDeadline = now + 3600;
    const permitDeadline = now - 1; // past

    const amlSig = await getAMLSignature({
      amlSigner,
      user,
      token,
      shareToken,
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
    ).to.be.revertedWithCustomError(token, "ERC2612ExpiredSignature").withArgs(permitDeadline);
  });

  describe("Initialization", function () {
    it("reverts if withdrawal token is zero address", async function () {
      const { deployer, amlSigner, shareToken } = await deployFixture();
      const Withdrawal = await ethers.getContractFactory("Withdrawal");
      const withdrawal = await Withdrawal.deploy();
      await expect(
        withdrawal.initialize(ethers.ZeroAddress, shareToken, amlSigner.address)
      ).to.be.revertedWithCustomError(withdrawal, "InvalidAddress");
    });

    it("reverts if share token is zero address", async function () {
      const { deployer, amlSigner, token } = await deployFixture();
      const Withdrawal = await ethers.getContractFactory("Withdrawal");
      const withdrawal = await Withdrawal.deploy();
      await expect(
        withdrawal.initialize(token.target, ethers.ZeroAddress, amlSigner.address)
      ).to.be.revertedWithCustomError(withdrawal, "InvalidAddress");
    });

    it("reverts if AML signer is zero address", async function () {
      const { deployer, token, shareToken } = await deployFixture();
      const Withdrawal = await ethers.getContractFactory("Withdrawal");
      const withdrawal = await Withdrawal.deploy();
      await expect(
        withdrawal.initialize(token.target, shareToken, ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(withdrawal, "InvalidAddress");
    });
  });

  it("reverts when withdrawal amount is zero", async function () {
    const { user, amlSigner, withdrawal } = await deployFixture();
    const amlDeadline = (await ethers.provider.getBlock("latest")).timestamp + 3600;
    const amlSig = await getAMLSignature({
      amlSigner,
      user,
      token: { target: ethers.ZeroAddress }, // Mock as it's not used in check
      shareToken: ethers.ZeroAddress,
      amount: 0,
      destination: withdrawal.target,
      deadline: amlDeadline,
    });

    await expect(
      withdrawal.connect(user).withdraw(0, amlSig, amlDeadline)
    ).to.be.revertedWithCustomError(withdrawal, "AmountMustBeGreaterThanZero");
  });

  describe("burnLocked", function () {
    it("allows admin to burn locked tokens", async function () {
      const { deployer, user, token, withdrawal } = await deployFixture();
      const amount = ethers.parseUnits("100", 18);
      await token.mint(withdrawal.target, amount);

      await expect(withdrawal.connect(deployer).burnLocked(amount)).to.not.be.reverted;
      expect(await token.balanceOf(withdrawal.target)).to.equal(0);
    });

    it("reverts if non-admin tries to burn", async function () {
      const { other, withdrawal } = await deployFixture();
      const BURN_ROLE = await withdrawal.BURN_ROLE();
      await expect(withdrawal.connect(other).burnLocked(1))
        .to.be.revertedWithCustomError(withdrawal, "AccessControlUnauthorizedAccount")
        .withArgs(other.address, BURN_ROLE);
    });

    it("reverts when burn amount is zero", async function () {
      const { deployer, withdrawal } = await deployFixture();
      await expect(withdrawal.connect(deployer).burnLocked(0)).to.be.revertedWithCustomError(
        withdrawal,
        "AmountMustBeGreaterThanZero"
      );
    });
  });

  describe("withdrawWithPermit edge cases", function () {
    it("reverts when amount is zero", async function () {
      const { user, amlSigner, token, withdrawal, shareToken } = await deployFixture();
      const amlDeadline = (await ethers.provider.getBlock("latest")).timestamp + 3600;
      const permitDeadline = amlDeadline + 1000;

      const amlSig = await getAMLSignature({
        amlSigner,
        user,
        token,
        shareToken,
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
      const { user, amlSigner, token, withdrawal, shareToken } = await deployFixture();
      const amount = ethers.parseUnits("10", 18);
      const amlDeadline = (await ethers.provider.getBlock("latest")).timestamp - 1; // In the past
      const permitDeadline = amlDeadline + 1000;

      const amlSig = await getAMLSignature({
        amlSigner,
        user,
        token,
        shareToken,
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
        withdrawal.connect(user).withdrawWithPermit(amount, amlSig, amlDeadline, permitDeadline, v, r, s)
      ).to.be.revertedWithCustomError(withdrawal, "AMLSignatureExpired");
    });
  });
});
