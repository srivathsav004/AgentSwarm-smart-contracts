// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";

contract AgentRegistry is Ownable {
    enum AgentType { Coordinator, Research, Analyst, Content, Code }
    
    struct Agent {
        address walletAddress;
        AgentType agentType;
        uint256 pricePerTask;    // Price in wei (or token units)
        uint16 reputation;       // 0-1000 reputation score
        bool active;
    }
    
    mapping(uint256 => Agent) public agents;
    mapping(address => uint256) public walletToAgentId;
    mapping(AgentType => uint256[]) public agentsByType;
    uint256 public nextAgentId = 1;

    // Contracts/addresses that are allowed to update reputation (e.g., TaskEscrow)
    mapping(address => bool) public authorizedCallers;
    
    event AgentRegistered(uint256 indexed agentId, address wallet, AgentType agentType, uint256 price);
    event ReputationUpdated(uint256 indexed agentId, uint16 newReputation);
    event AgentStatusChanged(uint256 indexed agentId, bool active);
    event PriceUpdated(uint256 indexed agentId, uint256 newPrice);
    event AuthorizedCallerSet(address indexed caller, bool allowed);
    
    constructor() Ownable(msg.sender) {}

    modifier onlyOwnerOrAuthorized() {
        require(msg.sender == owner() || authorizedCallers[msg.sender], "Not authorized");
        _;
    }

    function setAuthorizedCaller(address caller, bool allowed) external onlyOwner {
        authorizedCallers[caller] = allowed;
        emit AuthorizedCallerSet(caller, allowed);
    }
    
    function registerAgent(
        address walletAddress,
        AgentType agentType,
        uint256 pricePerTask
    ) external onlyOwner returns (uint256) {
        require(walletToAgentId[walletAddress] == 0, "Wallet already registered");
        require(pricePerTask > 0, "Price must be > 0");
        
        uint256 agentId = nextAgentId++;
        
        agents[agentId] = Agent({
            walletAddress: walletAddress,
            agentType: agentType,
            pricePerTask: pricePerTask,
            reputation: 500, // Start with neutral reputation
            active: true
        });
        
        walletToAgentId[walletAddress] = agentId;
        agentsByType[agentType].push(agentId);
        
        emit AgentRegistered(agentId, walletAddress, agentType, pricePerTask);
        return agentId;
    }
    
    function updateReputation(uint256 agentId, bool success) external onlyOwnerOrAuthorized {
        require(agents[agentId].walletAddress != address(0), "Agent not found");
        
        Agent storage agent = agents[agentId];
        
        if (success) {
            // Increase reputation (max 1000)
            agent.reputation = agent.reputation + 10 > 1000 ? 1000 : agent.reputation + 10;
        } else {
            // Decrease reputation (min 0)
            agent.reputation = agent.reputation > 20 ? agent.reputation - 20 : 0;
        }
        
        emit ReputationUpdated(agentId, agent.reputation);
    }
    
    function updatePrice(uint256 agentId, uint256 newPrice) external onlyOwner {
        require(agents[agentId].walletAddress != address(0), "Agent not found");
        require(newPrice > 0, "Price must be > 0");
        
        agents[agentId].pricePerTask = newPrice;
        emit PriceUpdated(agentId, newPrice);
    }
    
    function setAgentStatus(uint256 agentId, bool active) external onlyOwner {
        require(agents[agentId].walletAddress != address(0), "Agent not found");
        agents[agentId].active = active;
        emit AgentStatusChanged(agentId, active);
    }
    
    function getAgent(uint256 agentId) external view returns (Agent memory) {
        return agents[agentId];
    }
    
    function getAgentByWallet(address wallet) external view returns (uint256, Agent memory) {
        uint256 agentId = walletToAgentId[wallet];
        return (agentId, agents[agentId]);
    }
    
    function getAgentsByType(AgentType agentType) external view returns (uint256[] memory) {
        return agentsByType[agentType];
    }
    
    function getBestAgentByType(AgentType agentType) external view returns (uint256) {
        uint256[] memory typeAgents = agentsByType[agentType];
        require(typeAgents.length > 0, "No agents of this type");
        
        uint256 bestAgentId = 0;
        uint16 bestReputation = 0;
        
        for (uint256 i = 0; i < typeAgents.length; i++) {
            uint256 agentId = typeAgents[i];
            if (agents[agentId].active && agents[agentId].reputation > bestReputation) {
                bestReputation = agents[agentId].reputation;
                bestAgentId = agentId;
            }
        }
        
        require(bestAgentId != 0, "No active agents of this type");
        return bestAgentId;
    }
    
    function getAllActiveAgents() external view returns (uint256[] memory) {
        uint256[] memory activeIds = new uint256[](nextAgentId - 1);
        uint256 count = 0;
        
        for (uint256 i = 1; i < nextAgentId; i++) {
            if (agents[i].active) {
                activeIds[count] = i;
                count++;
            }
        }
        
        uint256[] memory result = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = activeIds[i];
        }
        
        return result;
    }
    
    function getAgentCount() external view returns (uint256) {
        return nextAgentId - 1;
    }
}