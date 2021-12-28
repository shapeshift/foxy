import { ethers, deployments, getNamedAccounts } from "hardhat";
import { expect } from "chai";
import { SFox } from "../typechain-types/SFox";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { BigNumber, Signer } from "ethers";

describe("sFox", function () {
  let accounts: SignerWithAddress[];
  let sFOXDeployment;
  let sFOX: SFox;

  beforeEach(async () => {
    await deployments.fixture(["sFox"]);
    accounts = await ethers.getSigners();
    sFOXDeployment = await deployments.get("sFox");
    sFOX = new ethers.Contract(
      sFOXDeployment.address,
      sFOXDeployment.abi,
      accounts[0]
    ) as SFox;
    // initialize sFOX
    const { stakingContract } = await getNamedAccounts();
    await sFOX.initialize(stakingContract);
  });

  describe("initialize", function () {
    it("Should assign the total supply of tokens to the stakingContract", async () => {
      const { stakingContract } = await getNamedAccounts();
      let stakingContractBalance = await sFOX.balanceOf(stakingContract);
      const supply = await sFOX.totalSupply();
      stakingContractBalance = await sFOX.balanceOf(stakingContract);
      expect(stakingContractBalance.eq(supply)).true;
    });
  });

  describe("rebase", function () {
    it("Should distribute profits with one token holder", async () => {
      const { staker1, stakingContract } = await getNamedAccounts();
      const stakingContractSigner = accounts.find(
        (account) => account.address === stakingContract
      );

      const initialHoldings = BigNumber.from("1000000");
      const sFOXStakingContractSigner = sFOX.connect(
        stakingContractSigner as Signer
      );

      await sFOXStakingContractSigner.transfer(staker1, initialHoldings);
      const staker1InitialBalance = await sFOX.balanceOf(staker1);
      expect(staker1InitialBalance.eq(initialHoldings)).true;

      const profit = BigNumber.from("1000");
      await sFOXStakingContractSigner.rebase(profit, BigNumber.from(1));

      const staker1BalanceAfterRebase = await sFOX.balanceOf(staker1);
      expect(staker1BalanceAfterRebase.eq(initialHoldings.add(profit))).true;
    });

    it("Should distribute profits with two token holders", async () => {
      const { staker1, staker2, stakingContract } = await getNamedAccounts();
      const stakingContractSigner = accounts.find(
        (account) => account.address === stakingContract
      );

      const initialHoldings = BigNumber.from("1000000");
      const sFOXStakingContractSigner = sFOX.connect(
        stakingContractSigner as Signer
      );

      await sFOXStakingContractSigner.transfer(staker1, initialHoldings);
      await sFOXStakingContractSigner.transfer(staker2, initialHoldings);

      const staker1InitialBalance = await sFOX.balanceOf(staker1);
      const staker2InitialBalance = await sFOX.balanceOf(staker2);

      expect(staker1InitialBalance.eq(initialHoldings)).true;
      expect(staker2InitialBalance.eq(initialHoldings)).true;

      const profit = BigNumber.from("1000");
      await sFOXStakingContractSigner.rebase(profit, BigNumber.from(1));

      const staker1BalanceAfterRebase = await sFOX.balanceOf(staker1);
      const staker2BalanceAfterRebase = await sFOX.balanceOf(staker2);

      expect(staker1BalanceAfterRebase.eq(initialHoldings.add(profit.div(2))))
        .true;
      expect(staker2BalanceAfterRebase.eq(initialHoldings.add(profit.div(2))))
        .true;
    });
  });
});
