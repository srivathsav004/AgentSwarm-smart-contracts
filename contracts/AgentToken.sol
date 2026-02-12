// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract AgentToken is ERC20, Ownable {
    uint256 public constant INITIAL_SUPPLY = 1000000 * 10**18; // 1M tokens
    uint256 public constant FREE_CREDITS = 500 * 10**18; // 500 tokens per user
    uint256 public constant EXCHANGE_RATE = 500; // 1 USDC = 500 AGENT
    
    mapping(address => bool) public hasClaimedFree;
    mapping(address => uint256) public usdcTransferred;
    
    event FreeCreditsClaimed(address indexed user, uint256 amount);
    event TokensClaimed(address indexed user, uint256 usdcAmount, uint256 agentAmount);
    
    constructor() ERC20("Agent Token", "AGT") Ownable(msg.sender) {
        _mint(msg.sender, INITIAL_SUPPLY);
    }
    
    function claimFreeCredits() external {
        require(!hasClaimedFree[msg.sender], "Already claimed free credits");
        require(balanceOf(owner()) >= FREE_CREDITS, "Insufficient contract balance");
        
        hasClaimedFree[msg.sender] = true;
        _transfer(owner(), msg.sender, FREE_CREDITS);
        
        emit FreeCreditsClaimed(msg.sender, FREE_CREDITS);
    }
    
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
    
    function hasUserClaimedFree(address user) external view returns (bool) {
        return hasClaimedFree[user];
    }
    
    // New function for users to claim AGENT tokens after transferring USDC
    function claimAgentTokens(uint256 usdcAmount) external {
        require(usdcAmount > 0, "USDC amount must be > 0");
        
        // Calculate AGENT amount directly (1 USDC = 500 AGENT)
        uint256 agentAmount = usdcAmount * EXCHANGE_RATE * 10**18;
        require(balanceOf(owner()) >= agentAmount, "Insufficient AGENT balance");
        
        usdcTransferred[msg.sender] += usdcAmount;
        
        _transfer(owner(), msg.sender, agentAmount);
        
        emit TokensClaimed(msg.sender, usdcAmount, agentAmount);
    }
    
    function getUsdcTransferred(address user) external view returns (uint256) {
        return usdcTransferred[user];
    }
}