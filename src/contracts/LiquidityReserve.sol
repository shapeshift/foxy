// SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity 0.8.9;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../libraries/ERC20.sol";
import "../libraries/Ownable.sol";
import "../interfaces/IStaking.sol";

contract LiquidityReserve is ERC20, Ownable {
    using SafeERC20 for IERC20;

    address public stakingToken;
    address public rewardToken;
    address public stakingContract;
    uint256 public fee;
    address public initializer;
    uint256 public constant MINIMUM_LIQUIDITY = 10**15; // lock .001 stakingTokens for initial liquidity
    uint256 public constant BASIS_POINTS = 10000;

    constructor(address _stakingToken) ERC20("Liquidity Reserve FOX", "lrFOX") {
        require(_stakingToken != address(0));
        initializer = msg.sender;
        stakingToken = _stakingToken;
    }

    /**
        @notice initialize by setting stakingContract & setting initial liquidity
        @param _stakingContract address
     */
    function initialize(address _stakingContract, address _rewardToken)
        external
        onlyOwner
    {
        uint256 stakingTokenBalance = IERC20(stakingToken).balanceOf(
            msg.sender
        );
        require(_stakingContract != address(0) && _rewardToken != address(0));
        require(stakingTokenBalance >= MINIMUM_LIQUIDITY);
        stakingContract = _stakingContract;
        rewardToken = _rewardToken;

        // permanently lock the first MINIMUM_LIQUIDITY of lrTokens & stakingTokens
        IERC20(stakingToken).transferFrom(
            msg.sender,
            address(this),
            MINIMUM_LIQUIDITY
        );
        _mint(address(this), MINIMUM_LIQUIDITY);

        IERC20(rewardToken).approve(stakingContract, type(uint256).max);
    }

    /**
        @notice sets Fee (in basis points eg. 100 bps = 1%) for instant unstaking
        @param _fee uint
     */
    function setFee(uint256 _fee) external onlyOwner {
        require(
            _fee <= BASIS_POINTS,
            "Must be within range of 0 and 10000 bps"
        );
        fee = _fee;
    }

    /**
        @notice addLiquidity for the stakingToken and receive lrToken in exchange
        @param _amount uint
     */
    function addLiquidity(uint256 _amount) external {
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
        uint256 amountToMint = (_amount * lrFoxSupply) / totalLockedValue;

        IERC20(stakingToken).safeTransferFrom(
            msg.sender,
            address(this),
            _amount
        );
        _mint(msg.sender, amountToMint);
    }

    /**
        @notice calculate current lrToken withdraw value
        @param _amount uint
        @return uint
     */
    function _calculateReserveTokenValue(uint256 _amount)
        internal
        view
        returns (uint256)
    {
        uint256 lrFoxSupply = totalSupply();
        uint256 stakingTokenBalance = IERC20(stakingToken).balanceOf(
            address(this)
        );
        uint256 rewardTokenBalance = IERC20(rewardToken).balanceOf(
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

    /**
        @notice removeLiquidity by swapping your lrToken for stakingTokens
        @param _amount uint
     */
    function removeLiquidity(uint256 _amount) external {
        require(
            _amount <= balanceOf(msg.sender),
            "Not enough liquidity reserve tokens"
        );
        // claim the stakingToken from previous unstakes
        IStaking(stakingContract).claimWithdraw(address(this));

        uint256 amountToWithdraw = _calculateReserveTokenValue(_amount);
        require(
            IERC20(stakingToken).balanceOf(address(this)) >= amountToWithdraw,
            "Not enough funds in contract to cover withdraw"
        );

        _burn(msg.sender, _amount);
        IERC20(stakingToken).safeTransfer(msg.sender, amountToWithdraw);
    }

    /**
        @notice allow instant unstake their stakingToken for a fee paid to the liquidity providers
        @param _amount uint
        @param _recipient address
     */
    function instantUnstake(uint256 _amount, address _recipient) external {
        require(
            _amount <= IERC20(stakingToken).balanceOf(address(this)),
            "Not enough funds in contract to cover instant unstake"
        );
        uint256 rewardBalance = IERC20(rewardToken).balanceOf(msg.sender);
        require(rewardBalance >= _amount, "Not enough reward tokens in wallet");

        // claim the stakingToken from previous unstakes
        IStaking(stakingContract).claimWithdraw(address(this));
        uint256 amountMinusFee = _amount - ((_amount * fee) / BASIS_POINTS);

        // transfer from msg.sender (staking contract) due to not knowing if the funds are in warmup or not
        IERC20(rewardToken).safeTransferFrom(
            msg.sender,
            address(this),
            _amount
        );

        IERC20(stakingToken).safeTransfer(_recipient, amountMinusFee);

        IStaking(stakingContract).unstake(_amount, false);
    }
}
