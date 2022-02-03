// SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity 0.8.9;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../libraries/ERC20.sol";
import "../libraries/Ownable.sol";
import "hardhat/console.sol";

contract LiquidityReserve is ERC20, Ownable {
    using SafeERC20 for IERC20;

    address public stakingToken;
    address public rewardToken;
    address public stakingContract;
    address public initializer;
    uint256 public fee;
    uint256 public constant MINIMUM_LIQUIDITY = 10**3; // using same amount of minimum liquidity as uni

    constructor(address _stakingToken, address _rewardToken)
        ERC20("Liquidity Reserve FOX", "lrFOX", 18)
    {
        require(_stakingToken != address(0) && _rewardToken != address(0));
        stakingToken = _stakingToken;
        rewardToken = _rewardToken;
        initializer = msg.sender;
    }

    function initialize(address stakingContract_) external returns (bool) {
        require(msg.sender == initializer);
        require(stakingContract_ != address(0));
        require(
            IERC20(stakingToken).balanceOf(msg.sender) >= MINIMUM_LIQUIDITY
        );
        stakingContract = stakingContract_;
        initializer = address(0);
        _mint(address(this), MINIMUM_LIQUIDITY); // permanently lock the first MINIMUM_LIQUIDITY tokens

        return true;
    }

    function deposit(uint256 _amount) external {
        uint256 stakingTokenBalance = IERC20(stakingToken).balanceOf(
            address(this)
        );
        uint256 rewardTokenBalance = IERC20(rewardToken).balanceOf(
            address(this)
        );
        uint256 lrFoxSupply = totalSupply();
        uint256 reserveSupply = stakingTokenBalance + rewardTokenBalance; // TODO: will need to update this to handle FOXy that's being withdrawn from tokemak
        uint256 amountToMint = reserveSupply == 0
            ? _amount
            : (_amount * lrFoxSupply) / reserveSupply;

        console.log("lrFoxSupply", lrFoxSupply);
        console.log("reserveSupply", reserveSupply);
        console.log("amountToMint", amountToMint);

        IERC20(stakingToken).safeTransferFrom(
            msg.sender,
            address(this),
            _amount
        );
        _mint(msg.sender, amountToMint);
    }

    function calculateReserveTokenValue() public view returns (uint256) {
        uint256 lrFoxSupply = totalSupply();
        uint256 stakingTokenBalance = IERC20(stakingToken).balanceOf(
            address(this)
        );
        uint256 rewardTokenBalance = IERC20(rewardToken).balanceOf(
            address(this)
        );
        uint256 totalLockedValue = stakingTokenBalance + rewardTokenBalance; // TODO: will need to update this to handle FOXy that's being withdrawn from tokemak
        uint256 convertedAmount = totalLockedValue / lrFoxSupply; // TODO: make work with integers
        return convertedAmount;
    }

    // TODO: pull FOX from claimWithdrawal
    function withdraw(uint256 _amount) external {
        uint256 amountToWithdraw = calculateReserveTokenValue() * _amount;
        _burn(msg.sender, _amount);
        IERC20(stakingToken).safeTransfer(msg.sender, amountToWithdraw);
    }

    // TODO: pull FOX from claimWithdrawal
    function instantUnstake(uint256 _amount) external {
        uint256 amountMinusFee = _amount - ((_amount * fee) / 100);
        require(
            _amount <= IERC20(stakingToken).balanceOf(address(this)),
            "Not enough funds to cover instant unstake"
        );
        IERC20(rewardToken).safeTransferFrom(
            msg.sender,
            address(this),
            _amount
        );
        IERC20(stakingToken).safeTransfer(msg.sender, amountMinusFee);
    }

    function setFee(uint256 _fee) external onlyOwner {
        require(_fee >= 0 && fee <= 100, "Must be within range of 0 and 1");
        fee = _fee;
    }
}
