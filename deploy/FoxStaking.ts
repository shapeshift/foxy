import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import "@nomiclabs/hardhat-ethers";
import "hardhat-deploy";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, ethers } = hre;
  const { deploy } = deployments;

  const { admin } = await getNamedAccounts();
  const yieldToken = "0xc770EEfAd204B5180dF6a14Ee197D99d808ee52d";
  const tokePool = "0x808D3E6b23516967ceAE4f17a5F9038383ED5311";
  const foxy = await deployments.get("Foxy");

  const epochLength = 100;
  const firstEpochNumber = 1;
  const currentBlock = await ethers.provider.getBlockNumber();
  const firstEpochBlock = currentBlock + epochLength;

  await deploy("FoxStaking", {
    from: admin,
    args: [
      yieldToken,
      foxy.address,
      tokePool,
      epochLength,
      firstEpochNumber,
      firstEpochBlock,
    ],
    log: true,
  });
};
export default func;
func.tags = ["FoxStaking"];
func.dependencies = ["Foxy", "Fox"];
