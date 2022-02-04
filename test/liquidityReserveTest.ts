import { ethers, deployments, getNamedAccounts, network } from "hardhat";
import { expect } from "chai";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { BigNumber, Contract, Signer } from "ethers";
import { LiquidityReserve, Staking } from "../typechain-types";
import ERC20 from "@openzeppelin/contracts/build/contracts/ERC20.json";

describe("Liquidity Reserve", function () {
  let accounts: SignerWithAddress[];
  let liquidityReserve: LiquidityReserve;
  let stakingToken: Contract;
  let stakingContract: Staking;
  let foxy: Contract;

  const STAKING_TOKEN_WHALE = "0xF152a54068c8eDDF5D537770985cA8c06ad78aBB"; // FOX Whale
  const STAKING_TOKEN = "0xc770EEfAd204B5180dF6a14Ee197D99d808ee52d"; // FOX Address

  beforeEach(async () => {
    const { admin } = await getNamedAccounts();

    await network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            jsonRpcUrl: process.env.MAINNET_URL,
            blockNumber: 14101169,
          },
        },
      ],
    });

    await deployments.fixture();
    accounts = await ethers.getSigners();

    const liquidityReserveDeployment = await deployments.get(
      "LiquidityReserve"
    );
    liquidityReserve = new ethers.Contract(
      liquidityReserveDeployment.address,
      liquidityReserveDeployment.abi,
      accounts[0]
    ) as LiquidityReserve;

    const foxyDeployment = await deployments.get("Foxy");
    foxy = new ethers.Contract(
      foxyDeployment.address,
      foxyDeployment.abi,
      accounts[0]
    ) as LiquidityReserve;

    const stakingDeployment = await deployments.get("Staking");
    stakingContract = new ethers.Contract(
      stakingDeployment.address,
      stakingDeployment.abi,
      accounts[0]
    ) as Staking;

    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [STAKING_TOKEN_WHALE],
    });

    stakingToken = new ethers.Contract(STAKING_TOKEN, ERC20.abi, accounts[0]);

    const transferAmount = BigNumber.from("1000000000");
    const whaleSigner = await ethers.getSigner(STAKING_TOKEN_WHALE);
    const stakingTokenWhale = stakingToken.connect(whaleSigner);
    await stakingTokenWhale.transfer(admin, transferAmount);
    const stakingTokenBalance = await stakingToken.balanceOf(admin);

    expect(BigNumber.from(stakingTokenBalance).toNumber()).gte(
      transferAmount.toNumber()
    );

    await liquidityReserve.setFee(20);
    await foxy.initialize(stakingContract.address);
    await liquidityReserve.initialize(stakingContract.address);
  });

  describe("initialize", function () {
    it("Should assign the total supply of reward tokens to the stakingContract", async () => {
      const supply = await foxy.totalSupply();
      const stakingContractBalance = await foxy.balanceOf(
        stakingContract.address
      );
      expect(stakingContractBalance.eq(supply)).true;
    });
  });

  describe("deposit & withdraw", function () {
    it("Should calculate the correct value of lrFOX", async () => {
      const { daoTreasury, staker1, liquidityProvider } =
        await getNamedAccounts();

      const transferAmount = BigNumber.from("100000");
      const stakingAmount = transferAmount.div(4);

      // deposit stakingToken with daoTreasury
      await stakingToken.transfer(daoTreasury, transferAmount);

      let daoTreasuryStakingBalance = await stakingToken.balanceOf(daoTreasury);
      expect(daoTreasuryStakingBalance).eq(transferAmount);

      let liquidityReserveBalance = await liquidityReserve.balanceOf(
        daoTreasury
      );
      expect(liquidityReserveBalance).eq(0);

      const daoTreasurySigner = accounts.find(
        (account) => account.address === daoTreasury
      );
      const liquidityReserveDao = liquidityReserve.connect(
        daoTreasurySigner as Signer
      );
      const stakingTokenDao = stakingToken.connect(daoTreasurySigner as Signer);

      await stakingTokenDao.approve(liquidityReserve.address, transferAmount);
      await liquidityReserveDao.deposit(transferAmount);

      daoTreasuryStakingBalance = await stakingToken.balanceOf(daoTreasury);
      expect(daoTreasuryStakingBalance).eq(0);

      liquidityReserveBalance = await liquidityReserve.balanceOf(daoTreasury);
      expect(liquidityReserveBalance).eq(transferAmount);

      // get stakingToken at staker1
      await stakingToken.transfer(staker1, stakingAmount);

      const staking1Signer = accounts.find(
        (account) => account.address === staker1
      );

      // stake stakingToken to get rewardToken
      const stakingContractStaker1 = stakingContract.connect(
        staking1Signer as Signer
      );
      const stakingTokenStaker1 = stakingToken.connect(
        staking1Signer as Signer
      );

      await stakingTokenStaker1.approve(
        stakingContract.address,
        transferAmount
      );
      await stakingContractStaker1.functions["stake(uint256)"](stakingAmount);

      await stakingContractStaker1.claim(staker1);

      let staker1RewardBalance = await foxy.balanceOf(staker1);
      expect(staker1RewardBalance).eq(stakingAmount);

      const fee = await liquidityReserve.fee();

      // instant unstake with staker1
      const liquidityReserveStaker1 = liquidityReserve.connect(
        staking1Signer as Signer
      );

      const rewardTokenStaker1 = foxy.connect(staking1Signer as Signer);
      await rewardTokenStaker1.approve(liquidityReserve.address, stakingAmount);

      await liquidityReserveStaker1.instantUnstake(stakingAmount);

      const feeAmount = stakingAmount.mul(fee).div(100);
      const amountMinusFee = stakingAmount.sub(feeAmount);

      staker1RewardBalance = await foxy.balanceOf(staker1);
      expect(staker1RewardBalance).eq(0);

      let staker1StakingBalance = await stakingToken.balanceOf(staker1);
      expect(staker1StakingBalance).eq(amountMinusFee);

      // deposit with liquidityProvider
      await stakingToken.transfer(liquidityProvider, stakingAmount);

      let liquidityProviderStakingBalance = await stakingToken.balanceOf(
        liquidityProvider
      );
      expect(liquidityProviderStakingBalance).eq(stakingAmount);

      liquidityReserveBalance = await liquidityReserve.balanceOf(
        liquidityProvider
      );
      expect(liquidityReserveBalance).eq(0);

      const liquidityProviderSigner = accounts.find(
        (account) => account.address === liquidityProvider
      );
      const liquidityReserveLiquidityProvider = liquidityReserve.connect(
        liquidityProviderSigner as Signer
      );
      const stakingTokenLiquidityProvider = stakingToken.connect(
        liquidityProviderSigner as Signer
      );

      await stakingTokenLiquidityProvider.approve(
        liquidityReserve.address,
        stakingAmount
      );
      await liquidityReserveLiquidityProvider.deposit(stakingAmount);

      liquidityProviderStakingBalance = await stakingToken.balanceOf(
        liquidityProvider
      );
      expect(liquidityProviderStakingBalance).eq(0);

      liquidityReserveBalance = await liquidityReserve.balanceOf(
        liquidityProvider
      );
      expect(liquidityReserveBalance).eq(24047); // 24047 is the new balance based on new liquidity

      // withdraw with liquidityProvider
      await liquidityReserveLiquidityProvider.withdraw(liquidityReserveBalance)

      liquidityProviderStakingBalance = await stakingToken.balanceOf(
        liquidityProvider
      );
      expect(liquidityProviderStakingBalance).eq(24999); // receive 24999 stakingTokens back

    });
  });
});
