// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IAgentRegistry {
    struct Agent {
        address walletAddress;
        uint8 agentType;
        uint256 pricePerTask;
        uint16 reputation;
        bool active;
    }
    
    function getAgent(uint256 agentId) external view returns (Agent memory);
    function updateReputation(uint256 agentId, bool success) external;
    function getBestAgentByType(uint8 agentType) external view returns (uint256);
    function getAllActiveAgents() external view returns (uint256[] memory);
}

contract TaskEscrow is ReentrancyGuard {
    IERC20 public immutable agentToken;
    IAgentRegistry public immutable registry;
    address public owner;
    
    enum TaskStatus { Created, InProgress, Completed, Failed, Cancelled, Disputed }
    enum RequestStatus { Pending, Completed, Failed, Cancelled }
    
    struct Task {
        uint256 id;
        address client;
        uint256 coordinatorAgentId;
        uint256 totalBudget;        // Total budget allocated by user
        uint256 remainingBudget;    // Remaining budget for coordinator to allocate
        uint256 pendingAllocations; // Sum of allocations to requests that are still pending
        uint256 coordinatorFee;     // Coordinator's fee
        TaskStatus status;
        uint256 createdAt;
        uint256 deadline;
        // Note: we intentionally do NOT store any string/bytes metadata on-chain
        // to keep gas costs low and avoid dynamic type issues on some L2s.
    }
    
    struct AgentRequest {
        uint256 id;
        uint256 fromAgentId;
        uint256 toAgentId;
        uint256 amount;
        uint256 parentTaskId;
        RequestStatus status;
        uint256 createdAt;
        // No on-chain request hash; keep metadata off-chain.
    }
    
    mapping(uint256 => Task) public tasks;
    mapping(uint256 => AgentRequest) public agentRequests;
    mapping(uint256 => uint256[]) public taskRequests; // taskId -> requestIds
    mapping(address => uint256[]) public clientTasks;
    mapping(uint256 => uint256[]) public agentTasks;
    mapping(address => uint256) public userDeposits; // Track user deposits to escrow
    
    uint256 public nextTaskId = 1;
    uint256 public nextRequestId = 1;
    uint256 public constant TASK_TIMEOUT = 10 minutes;
    
    event TaskCreated(uint256 indexed taskId, address indexed client, uint256 totalBudget, uint256 coordinatorFee);
    event AgentRequestCreated(uint256 indexed requestId, uint256 fromAgent, uint256 toAgent, uint256 amount);
    event AgentRequestCompleted(uint256 indexed requestId, bool success);
    event AgentRequestCancelled(uint256 indexed requestId, uint256 indexed taskId);
    event TaskCompleted(uint256 indexed taskId, bool success);
    event TaskCancelled(uint256 indexed taskId, address indexed client, uint256 refundAmount);
    event TaskFailed(uint256 indexed taskId, address indexed client, uint256 refundAmount, string reason);
    event PaymentReleased(uint256 indexed taskId, address indexed recipient, uint256 amount);
    event BudgetAllocated(uint256 indexed taskId, uint256 amount, string purpose);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event Deposit(address indexed user, uint256 amount);
    event Withdraw(address indexed user, uint256 amount);
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }
    
    constructor(address _agentToken, address _registry) {
        agentToken = IERC20(_agentToken);
        registry = IAgentRegistry(_registry);
        owner = msg.sender;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Zero owner");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function _cancelPendingRequestsAndReleaseBudget(uint256 taskId) internal {
        Task storage task = tasks[taskId];
        uint256[] storage reqIds = taskRequests[taskId];

        for (uint256 i = 0; i < reqIds.length; i++) {
            uint256 requestId = reqIds[i];
            AgentRequest storage req = agentRequests[requestId];
            if (req.status == RequestStatus.Pending) {
                req.status = RequestStatus.Cancelled;
                // Move the still-held funds back into remainingBudget so they can be refunded.
                task.pendingAllocations -= req.amount;
                task.remainingBudget += req.amount;
                emit AgentRequestCancelled(requestId, taskId);
            }
        }
    }

    function _refundUnpaidAndFailTask(uint256 taskId, string memory reason) internal {
        Task storage task = tasks[taskId];
        require(task.status == TaskStatus.InProgress, "Task not in progress");

        // Ensure any pending allocations are released back into remainingBudget before refunding.
        _cancelPendingRequestsAndReleaseBudget(taskId);

        uint256 refundAmount = task.coordinatorFee + task.remainingBudget;

        // Effects first (prevent double-refund)
        task.coordinatorFee = 0;
        task.remainingBudget = 0;
        task.pendingAllocations = 0;
        task.status = TaskStatus.Failed;

        require(agentToken.transfer(task.client, refundAmount), "Refund failed");

        // Coordinator gets a negative reputation update on overall task failure.
        registry.updateReputation(task.coordinatorAgentId, false);

        emit TaskFailed(taskId, task.client, refundAmount, reason);
        emit TaskCompleted(taskId, false);
    }
    
    // ═══════════════════════════════════════════════════════════════════════════════════════
    // DEPOSIT FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════════════════
    
    // User deposits tokens to escrow (pre-deposit for future tasks)
    function deposit(uint256 amount) external nonReentrant {
        require(amount > 0, "Amount must be > 0");
        require(agentToken.transferFrom(msg.sender, address(this), amount), "Transfer failed");
        userDeposits[msg.sender] += amount;
        emit Deposit(msg.sender, amount);
    }
    
    // User withdraws unused deposited tokens
    function withdrawDeposit(uint256 amount) external nonReentrant {
        require(userDeposits[msg.sender] >= amount, "Insufficient deposit");
        userDeposits[msg.sender] -= amount;
        require(agentToken.transfer(msg.sender, amount), "Transfer failed");
        emit Withdraw(msg.sender, amount);
    }
    
    // Get user's deposit balance
    function getUserDeposit(address user) external view returns (uint256) {
        return userDeposits[user];
    }
    
    // ═══════════════════════════════════════════════════════════════════════════════════════
    // MAIN FUNCTIONS (defined first so legacy functions can call them)
    // ═══════════════════════════════════════════════════════════════════════════════════════
    
    // User creates a task with total budget (direct-from-wallet flow)
    function createTaskWithBudget(
        uint256 coordinatorAgentId,
        uint256 totalBudget,
        string memory /* taskHash */ // kept for legacy compatibility, ignored on-chain
    ) public nonReentrant returns (uint256) {
        IAgentRegistry.Agent memory coordinator = registry.getAgent(coordinatorAgentId);
        require(coordinator.active, "Coordinator not active");
        require(coordinator.agentType == 0, "Must be coordinator agent");
        require(totalBudget >= coordinator.pricePerTask, "Budget too low for coordinator");
        
        // Use deposited tokens first, then pull from wallet if needed
        uint256 fromDeposit = userDeposits[msg.sender] >= totalBudget ? totalBudget : userDeposits[msg.sender];
        uint256 fromWallet = totalBudget - fromDeposit;
        
        if (fromDeposit > 0) {
            userDeposits[msg.sender] -= fromDeposit;
        }
        
        if (fromWallet > 0) {
            require(agentToken.transferFrom(msg.sender, address(this), fromWallet), "Transfer failed");
        }
        
        return _createTaskInternal(msg.sender, coordinatorAgentId, totalBudget, coordinator.pricePerTask);
    }

    // Server/owner creates a task using a client's pre-deposited funds.
    // This is used by the x402 server wallet so the user only needs to
    // approve + deposit once; all subsequent task creation gas is paid
    // by the server wallet.
    function createTaskFromDeposit(
        address client,
        uint256 coordinatorAgentId,
        uint256 totalBudget,
        string memory /* taskHash */ // kept for legacy compatibility, ignored on-chain
    ) external onlyOwner nonReentrant returns (uint256) {
        IAgentRegistry.Agent memory coordinator = registry.getAgent(coordinatorAgentId);
        require(coordinator.active, "Coordinator not active");
        require(coordinator.agentType == 0, "Must be coordinator agent");
        require(totalBudget >= coordinator.pricePerTask, "Budget too low for coordinator");
        require(userDeposits[client] >= totalBudget, "Insufficient deposit");

        // Funds are already held by this contract from previous deposits.
        // Just deduct from the user's deposit accounting and create the task.
        userDeposits[client] -= totalBudget;

        return _createTaskInternal(client, coordinatorAgentId, totalBudget, coordinator.pricePerTask);
    }

    // Internal helper shared by both creation flows
    function _createTaskInternal(
        address client,
        uint256 coordinatorAgentId,
        uint256 totalBudget,
        uint256 coordinatorFee
    ) internal returns (uint256) {
        uint256 taskId = nextTaskId++;
        
        tasks[taskId] = Task({
            id: taskId,
            client: client,
            coordinatorAgentId: coordinatorAgentId,
            totalBudget: totalBudget,
            remainingBudget: totalBudget - coordinatorFee, // Reserve coordinator fee
            pendingAllocations: 0,
            coordinatorFee: coordinatorFee,
            status: TaskStatus.InProgress,
            createdAt: block.timestamp,
            deadline: block.timestamp + TASK_TIMEOUT
        });
        
        clientTasks[client].push(taskId);
        agentTasks[coordinatorAgentId].push(taskId);
        
        emit TaskCreated(taskId, client, totalBudget, coordinatorFee);
        return taskId;
    }

    // Client can cancel ONLY if nothing has been allocated yet.
    function cancelTask(uint256 taskId) external nonReentrant {
        Task storage task = tasks[taskId];
        require(task.client == msg.sender, "Not client");
        require(task.status == TaskStatus.InProgress, "Task not in progress");
        require(taskRequests[taskId].length == 0, "Already allocated");

        uint256 refundAmount = task.coordinatorFee + task.remainingBudget;

        task.coordinatorFee = 0;
        task.remainingBudget = 0;
        task.pendingAllocations = 0;
        task.status = TaskStatus.Cancelled;

        require(agentToken.transfer(task.client, refundAmount), "Refund failed");
        emit TaskCancelled(taskId, task.client, refundAmount);
        emit TaskCompleted(taskId, false);
    }

    // Client safety valve: if server disappears, client can recover unpaid funds after deadline.
    function withdrawAfterTimeout(uint256 taskId) external nonReentrant {
        Task storage task = tasks[taskId];
        require(task.client == msg.sender, "Not client");
        require(task.status == TaskStatus.InProgress, "Task not in progress");
        require(block.timestamp > task.deadline, "Not expired");

        _refundUnpaidAndFailTask(taskId, "Task expired");
    }
    
    // Server allocates budget to agents (called by owner/server).
    // Note: we deliberately keep this signature free of dynamic types to
    // avoid issues on certain L2s and keep gas usage very predictable.
    function allocateBudgetToAgent(
        uint256 taskId,
        uint256 toAgentId,
        uint256 amount
    ) public onlyOwner nonReentrant returns (uint256) {
        Task storage task = tasks[taskId];
        require(task.status == TaskStatus.InProgress, "Task not in progress");
        require(block.timestamp <= task.deadline, "Task expired");
        require(amount > 0, "Amount must be > 0");
        require(task.remainingBudget >= amount, "Insufficient budget");
        
        IAgentRegistry.Agent memory toAgent = registry.getAgent(toAgentId);
        require(toAgent.active, "Target agent not active");
        
        // Deduct from remaining budget
        task.remainingBudget -= amount;
        task.pendingAllocations += amount;
        
        uint256 requestId = nextRequestId++;
        
        agentRequests[requestId] = AgentRequest({
            id: requestId,
            fromAgentId: task.coordinatorAgentId,
            toAgentId: toAgentId,
            amount: amount,
            parentTaskId: taskId,
            status: RequestStatus.Pending,
            createdAt: block.timestamp
        });
        taskRequests[taskId].push(requestId);
        
        emit AgentRequestCreated(requestId, task.coordinatorAgentId, toAgentId, amount);
        emit BudgetAllocated(taskId, amount, ""); // metadata kept off-chain
        return requestId;
    }
    
    // Complete agent request (server pays agent)
    function completeAgentRequest(uint256 requestId, bool success) external onlyOwner nonReentrant {
        AgentRequest storage request = agentRequests[requestId];
        require(request.status == RequestStatus.Pending, "Request not pending");

        Task storage task = tasks[request.parentTaskId];
        require(task.status == TaskStatus.InProgress, "Task not in progress");
        
        IAgentRegistry.Agent memory toAgent = registry.getAgent(request.toAgentId);
        
        if (success) {
            // Pay agent from escrow
            task.pendingAllocations -= request.amount;
            require(agentToken.transfer(toAgent.walletAddress, request.amount), "Payment failed");
            request.status = RequestStatus.Completed;
            registry.updateReputation(request.toAgentId, true);
        } else {
            // Any agent failure halts the overall task and refunds ALL unpaid funds to the client.
            task.pendingAllocations -= request.amount;
            task.remainingBudget += request.amount;
            request.status = RequestStatus.Failed;
            registry.updateReputation(request.toAgentId, false);

            _refundUnpaidAndFailTask(request.parentTaskId, "Agent request failed");
        }
        
        emit AgentRequestCompleted(requestId, success);
    }
    
    // Complete main task and pay coordinator
    function completeTask(uint256 taskId, bool success) external onlyOwner nonReentrant {
        Task storage task = tasks[taskId];
        require(task.status == TaskStatus.InProgress, "Task not in progress");
        require(task.pendingAllocations == 0, "Pending requests exist");
        
        IAgentRegistry.Agent memory coordinator = registry.getAgent(task.coordinatorAgentId);
        
        if (success) {
            // Pay coordinator their fee
            uint256 coordinatorFee = task.coordinatorFee;
            require(agentToken.transfer(coordinator.walletAddress, task.coordinatorFee), "Coordinator payment failed");
            
            // Refund any remaining budget to client
            if (task.remainingBudget > 0) {
                require(agentToken.transfer(task.client, task.remainingBudget), "Refund failed");
            }
            
            task.coordinatorFee = 0;
            task.remainingBudget = 0;
            task.pendingAllocations = 0;
            task.status = TaskStatus.Completed;
            registry.updateReputation(task.coordinatorAgentId, true);
            
            emit PaymentReleased(taskId, coordinator.walletAddress, coordinatorFee);
            emit TaskCompleted(taskId, true);
        } else {
            _refundUnpaidAndFailTask(taskId, "Task marked failed");
        }
    }
    
    // ═══════════════════════════════════════════════════════════════════════════════════════
    // LEGACY FUNCTIONS (for backward compatibility)
    // ═══════════════════════════════════════════════════════════════════════════════════════
    
    // Legacy function for backward compatibility
    function createTask(uint256 agentId, string memory taskHash) external nonReentrant returns (uint256) {
        IAgentRegistry.Agent memory agent = registry.getAgent(agentId);
        require(agent.active, "Agent not active");
        
        // For legacy calls, use agent's price as total budget
        return createTaskWithBudget(agentId, agent.pricePerTask, taskHash);
    }
    
    // Legacy function for backward compatibility  
    function requestAgentService(
        uint256 fromAgentId,
        uint256 toAgentId,
        uint256 parentTaskId,
        string memory requestHash
    ) external nonReentrant returns (uint256) {
        // Only allow if caller is the coordinator of the parent task
        IAgentRegistry.Agent memory fromAgent = registry.getAgent(fromAgentId);
        require(msg.sender == fromAgent.walletAddress, "Not authorized");
        
        IAgentRegistry.Agent memory toAgent = registry.getAgent(toAgentId);
        // requestHash is ignored on-chain; metadata stays off-chain.
        return allocateBudgetToAgent(parentTaskId, toAgentId, toAgent.pricePerTask);
    }
    
    // ═══════════════════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════════════════
    
    function getTask(uint256 taskId) external view returns (Task memory) {
        return tasks[taskId];
    }
    
    function getTaskBudgetInfo(uint256 taskId) external view returns (uint256 total, uint256 remaining, uint256 coordinatorFee) {
        Task memory task = tasks[taskId];
        return (task.totalBudget, task.remainingBudget, task.coordinatorFee);
    }

    function getTaskRequests(uint256 taskId) external view returns (uint256[] memory) {
        return taskRequests[taskId];
    }
    
    function getAgentRequest(uint256 requestId) external view returns (AgentRequest memory) {
        return agentRequests[requestId];
    }
    
    // Get user's total deposit balance
    function getUserDepositBalance(address user) external view returns (uint256) {
        return userDeposits[user];
    }
}