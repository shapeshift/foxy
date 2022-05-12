// SPDX-License-Identifier: AGPL-3.0-or-later
pragma solidity 0.8.9;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./YieldyStorage.sol";
import "../libraries/ERC20PermitUpgradeable.sol";

contract Yieldy is
    YieldyStorage,
    ERC20PermitUpgradeable,
    AccessControlUpgradeable
{
    event LogSupply(
        uint256 indexed epoch,
        uint256 timestamp,
        uint256 totalSupply
    );

    event LogRebase(uint256 indexed epoch, uint256 rebase, uint256 index);

    /**
        @notice initialize function
        @param _tokenName erc20 token name
        @param _tokenSymbol erc20 token symbol
        @param _decimal decimal amount
        @param _initialFragments initial fragments to set as total supply
     */
    function initialize(
        string memory _tokenName,
        string memory _tokenSymbol,
        uint8 _decimal,
        uint256 _initialFragments
    ) external initializer {
        ERC20Upgradeable.__ERC20_init(_tokenName, _tokenSymbol);
        ERC20PermitUpgradeable.__ERC20Permit_init(_tokenName);
        AccessControlUpgradeable.__AccessControl_init();

        _setupRole(ADMIN_ROLE, msg.sender);
        _setRoleAdmin(ADMIN_ROLE, ADMIN_ROLE);
        _setRoleAdmin(MINTER_BURNER_ROLE, ADMIN_ROLE);
        _setRoleAdmin(REBASE_ROLE, ADMIN_ROLE);

        decimal = _decimal;
        WAD = 10**decimal;
        rebasingCreditsPerToken = WAD;
        _setIndex(WAD);
    }

    /**
        @notice called by the admin role address to set the staking contract. Can only be called
        once. 
        @param _stakingContract address of the staking contract
     */
    function initializeStakingContract(address _stakingContract)
        external
        onlyRole(ADMIN_ROLE)
    {
        require(stakingContract == address(0), "Already Initialized");
        require(_stakingContract != address(0), "Invalid address");
        _setupRole(MINTER_BURNER_ROLE, stakingContract);
        _setupRole(REBASE_ROLE, stakingContract);
        stakingContract = _stakingContract;
    }

    /**
        @notice sets index to get the value of rebases from the beginning of the contract
        @param _index uint - initial index
     */
    function _setIndex(uint256 _index) internal {
        index = creditsForTokenBalance(_index);
    }

    /**
        @notice increases Yieldy supply to increase staking balances relative to profit_
        @param _profit uint256 - amount of rewards to distribute
        @param _epoch uint256 - epoch number
     */
    function rebase(uint256 _profit, uint256 _epoch)
        public
        onlyRole(REBASE_ROLE)
    {
        uint256 currentTotalSupply = _totalSupply;
        require(_totalSupply > 0, "Can't rebase if not circulating");

        if (_profit == 0) {
            emit LogSupply(_epoch, block.timestamp, currentTotalSupply);
            emit LogRebase(_epoch, 0, getIndex());
        } else {
            uint256 updatedTotalSupply = currentTotalSupply + _profit;

            if (updatedTotalSupply > MAX_SUPPLY) {
                updatedTotalSupply = MAX_SUPPLY;
            }

            rebasingCreditsPerToken = rebasingCredits / updatedTotalSupply;          
            require(rebasingCreditsPerToken > 0, "Invalid change in supply");

            _totalSupply = updatedTotalSupply;

            _storeRebase(updatedTotalSupply, _profit, _epoch);
        }
    }

    /**
        @notice emits event with data about rebase
        @param _previousCirculating uint
        @param _profit uint
        @param _epoch uint
     */
    function _storeRebase(
        uint256 _previousCirculating,
        uint256 _profit,
        uint256 _epoch
    ) internal {
        uint256 rebasePercent = (_profit * WAD) / _previousCirculating;

        rebases.push(
            Rebase({
                epoch: _epoch,
                rebase: rebasePercent,
                totalStakedBefore: _previousCirculating,
                totalStakedAfter: _totalSupply,
                amountRebased: _profit,
                index: getIndex(),
                blockNumberOccurred: block.number
            })
        );

        emit LogSupply(_epoch, block.timestamp, _totalSupply);
        emit LogRebase(_epoch, rebasePercent, getIndex());
    }

    /**
        @notice gets balanceOf Yieldy
        @param _wallet address
        @return uint
     */
    function balanceOf(address _wallet) public view override returns (uint256) {
        return creditBalances[_wallet] / rebasingCreditsPerToken;
    }

    /**
        @notice calculate credits based on balance amount
        @param _amount uint
        @return uint
     */
    function creditsForTokenBalance(uint256 _amount) public view returns (uint256) {
        return _amount * rebasingCreditsPerToken;
    }

    /**
        @notice calculate balance based on _credits amount
        @param _credits uint
        @return uint
     */
    function tokenBalanceForCredits(uint256 _credits) public view returns (uint256) {
        return _credits / rebasingCreditsPerToken;
    }

    /**
        @notice get current index to show what how much Yieldy the user would have gained if staked from the beginning
        @return uint - current index
     */
    function getIndex() public view returns (uint256) {
        return tokenBalanceForCredits(index);
    }

    /**
        @notice transfers to _to address with an amount of _value
        @param _to address
        @param _value uint
        @return bool - transfer succeeded
     */
    function transfer(address _to, uint256 _value)
        public
        override
        returns (bool)
    {
        require(_to != address(0), "Invalid address");

        uint256 creditValue = _value * rebasingCreditsPerToken;
        require(creditValue <= creditBalances[msg.sender], "Not enough funds");

        creditBalances[msg.sender] = creditBalances[msg.sender] - creditValue;
        creditBalances[_to] = creditBalances[_to] + creditValue;
        emit Transfer(msg.sender, _to, _value);
        return true;
    }

    /**
        @notice transfer from address to address with amount
        @param _from address
        @param _to address
        @param _value uint
        @return bool
     */
    function transferFrom(
        address _from,
        address _to,
        uint256 _value
    ) public override returns (bool) {
        require(_allowances[_from][msg.sender] >= _value, "Allowance too low");

        uint256 newValue = _allowances[_from][msg.sender] - _value;
        _allowances[_from][msg.sender] = newValue;
        emit Approval(_from, msg.sender, newValue);

        uint256 creditValue = creditsForTokenBalance(_value);
        creditBalances[_from] = creditBalances[_from] - creditValue;
        creditBalances[_to] = creditBalances[_to] + creditValue;
        emit Transfer(_from, _to, _value);

        return true;
    }

    /**
        @notice should be same as yield decimal
     */
    function decimals() public view override returns (uint8) {
        return decimal;
    }
}
