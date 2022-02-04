// SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity 0.8.9;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../libraries/ERC20.sol";
import "../libraries/Ownable.sol";
import "../interfaces/IStaking.sol";
import "hardhat/console.sol";

contract LiquidityReserve is ERC20, Ownable {
    using SafeERC20 for IERC20;

    address public stakingToken;
    address public rewardToken;
    address public stakingContract;
    uint256 public fee;
    uint256 public constant MINIMUM_LIQUIDITY = 10**3; // using same amount of minimum liquidity as uni

    constructor(
        address _stakingToken,
        address _rewardToken,
        address _stakingContract
    ) ERC20("Liquidity Reserve FOX", "lrFOX", 18) {
        require(_stakingToken != address(0) && _rewardToken != address(0));
        stakingToken = _stakingToken;
        rewardToken = _rewardToken;
        stakingContract = _stakingContract;
        _mint(address(this), MINIMUM_LIQUIDITY); // permanently lock the first MINIMUM_LIQUIDITY tokens
        IERC20(rewardToken).approve(stakingContract, type(uint256).max);
    }

    function setFee(uint256 _fee) external onlyOwner {
        require(_fee >= 0 && fee <= 100, "Must be within range of 0 and 1");
        fee = _fee;
    }

    function deposit(uint256 _amount) external {
        uint256 stakingTokenBalance = IERC20(stakingToken).balanceOf(
            address(this)
        );
        uint256 rewardTokenBalance = IERC20(rewardToken).balanceOf(
            address(this)
        );
        uint256 lrFoxSupply = totalSupply();
        uint256 coolDownAmount = IStaking(stakingContract)
            .coolDownInfo(address(this))
            .amount;
        uint256 totalLockedValue = stakingTokenBalance +
            rewardTokenBalance +
            coolDownAmount;
        uint256 amountToMint = totalLockedValue == 0
            ? _amount
            : (_amount * lrFoxSupply) / totalLockedValue;

        IERC20(stakingToken).safeTransferFrom(
            msg.sender,
            address(this),
            _amount
        );
        _mint(msg.sender, amountToMint);
    }

    function calculateReserveTokenValue(uint256 _amount)
        internal
        view
        returns (uint256)
    {
        uint256 lrFoxSupply = totalSupply();
        uint256 stakingTokenBalance = IERC20(stakingToken).balanceOf(
            address(this)
        );
        uint256 rewardTokenBalance = IERC20(rewardToken).balanceOf( // needed?
            address(this)
        );
        uint256 coolDownAmount = IStaking(stakingContract)
            .coolDownInfo(address(this))
            .amount;
        uint256 totalLockedValue = stakingTokenBalance +
            rewardTokenBalance +
            coolDownAmount;
        uint256 convertedAmount = (_amount * totalLockedValue) / lrFoxSupply;

        return convertedAmount;
    }

    function withdraw(uint256 _amount) external {
        require(
            _amount <= balanceOf(msg.sender),
            "Not enough funds to cover instant unstake"
        );
        // IStaking(stakingContract).claimWithdraw(address(this));
        console.log("amount", _amount);
        uint256 amountToWithdraw = calculateReserveTokenValue(_amount);
        console.log("amountToWithdraw", amountToWithdraw);

        _burn(msg.sender, _amount);
        IERC20(stakingToken).safeTransfer(msg.sender, amountToWithdraw);
    }

    function instantUnstake(uint256 _amount, address _recipient) external {
        require(
            _amount <= IERC20(stakingToken).balanceOf(address(this)),
            "Not enough funds in contract to cover instant unstake"
        );

        // IStaking(stakingContract).claimWithdraw(address(this));

        uint256 amountMinusFee = _amount - ((_amount * fee) / 100);

        // transfer from msg.sender due to not knowing if the funds are in warmup or not
        IERC20(rewardToken).safeTransferFrom(
            msg.sender,
            address(this),
            _amount
        );
        IERC20(stakingToken).safeTransfer(_recipient, amountMinusFee);
        console.log("staking", stakingContract);
        IStaking(stakingContract).unstake(_amount, false);
    }
}
