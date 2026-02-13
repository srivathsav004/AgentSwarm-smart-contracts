import { ethers } from 'ethers';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../.env') });

const RPC_URL = process.env.SKALE_RPC_URL;
const PRIVATE_KEY = process.env.SKALE_PRIVATE_KEY;
const AGENT_TOKEN = process.env.AGENT_TOKEN_ADDRESS || "0xEC307d7ae333C32b70889F0Fd61ce6f02Ee31Cf8";
const TASK_ESCROW = process.env.TASK_ESCROW_ADDRESS || "0x7448471429d6b31A25809deffB1C6e4Ea209C4F6";
const AGENT_REGISTRY = process.env.AGENT_REGISTRY_ADDRESS || "0x5dB6615Be918c7d12c1342C7580BeA4a7726d6b1";

const provider = new ethers.JsonRpcProvider(RPC_URL);
const serverWallet = new ethers.Wallet(PRIVATE_KEY, provider);

const taskEscrowAbi = [
    "function createTaskWithBudget(uint256 coordinatorAgentId, uint256 totalBudget, string taskHash) returns (uint256)",
    "function allocateBudgetToAgent(uint256 taskId, uint256 toAgentId, uint256 amount) returns (uint256)",
    "function completeAgentRequest(uint256 requestId, bool success)",
    "function completeTask(uint256 taskId, bool success)",
    "function cancelTask(uint256 taskId)",
    "function withdrawAfterTimeout(uint256 taskId)",
    "function owner() view returns (address)",
    "function tasks(uint256) view returns (tuple(uint256 id, address client, uint256 coordinatorAgentId, uint256 totalBudget, uint256 remainingBudget, uint256 pendingAllocations, uint256 coordinatorFee, uint8 status, uint256 createdAt, uint256 deadline))",
    "event TaskCreated(uint256 indexed taskId, address indexed client, uint256 totalBudget, uint256 coordinatorFee)",
    "event AgentRequestCreated(uint256 indexed requestId, uint256 fromAgent, uint256 toAgent, uint256 amount)"
];

const tokenAbi = [
    "function approve(address spender, uint256 amount) returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)"
];

const registryAbi = [
    "function setAuthorizedCaller(address caller, bool authorized)"
];

const escrowContract = new ethers.Contract(TASK_ESCROW, taskEscrowAbi, serverWallet);
const tokenContract = new ethers.Contract(AGENT_TOKEN, tokenAbi, serverWallet);
const registryContract = new ethers.Contract(AGENT_REGISTRY, registryAbi, serverWallet);

export async function approveTokens(userPrivateKey, amount) {
    const userWallet = new ethers.Wallet(userPrivateKey, provider);
    const userTokenContract = tokenContract.connect(userWallet);
    
    const tx = await userTokenContract.approve(TASK_ESCROW, amount);
    const receipt = await tx.wait();
    
    return {
        success: true,
        txHash: receipt.hash,
        gasUsed: receipt.gasUsed.toString()
    };
}

export async function createTaskWithBudget(userPrivateKey, coordinatorAgentId, totalBudget, taskHash = "ipfs://TaskWorkflow") {
    const userWallet = new ethers.Wallet(userPrivateKey, provider);
    const userEscrowContract = escrowContract.connect(userWallet);
    
    const tx = await userEscrowContract.createTaskWithBudget(
        coordinatorAgentId,
        totalBudget,
        taskHash
    );
    const receipt = await tx.wait();
    
    let taskId = null;
    for (const log of receipt.logs) {
        try {
            const parsed = escrowContract.interface.parseLog(log);
            if (parsed && parsed.name === 'TaskCreated') {
                taskId = parsed.args[0].toString();
                break;
            }
        } catch {}
    }
    
    return {
        success: true,
        taskId,
        txHash: receipt.hash,
        gasUsed: receipt.gasUsed.toString()
    };
}

// Mock agent outputs based on type
function generateAgentOutput(agentType, input) {
    switch(agentType) {
        case 'Research':
            return `Research findings on "${input.substring(0, 30)}...":
• Market size: $45B growing 35% YoY
• Key players: OpenAI, Anthropic, Google
• Trends: Multi-agent systems, budget-based payments
• Opportunity: x402 escrow for agent payments`;
        case 'Analyst':
            return `Analysis of research data:
• Strengths: Growing market, clear use case
• Weaknesses: Complex coordination needed
• Opportunities: SKALE low-cost transactions
• Threats: Traditional payment rails

Recommendation: Proceed with x402 implementation`;
        case 'Content':
            return `Strategic Content Brief:

Title: "The Future of AI Agent Payments: x402 & Budget-Based Escrow"

Key Points:
1. Traditional APIs charge per-request
2. Budget-based payments offer cost control
3. x402 enables trustless agent coordination
4. SKALE provides zero-gas execution

Tone: Technical, forward-thinking, authoritative`;
        case 'Code':
            return `// Smart Contract Architecture
// TaskEscrow.sol - Budget-based payment flow

contract TaskEscrow {
  function createTaskWithBudget(coordinatorId, totalBudget, taskHash) {
    // 1. Transfer budget from client
    // 2. Reserve coordinator fee
    // 3. Allocate remaining to agents
  }
  
  function allocateBudgetToAgent(taskId, agentId, amount) onlyOwner {
    // Server allocates budget slice to agent
  }
  
  function completeAgentRequest(requestId, success) onlyOwner {
    // Pay agent on successful completion
  }
}`;
        default:
            return `Processed: ${input}
Result: Optimized and enhanced output for next stage.`;
    }
}

export async function allocateBudgetToAgent(taskId, toAgentId, amount, agentInput = '') {
    const tx = await escrowContract.allocateBudgetToAgent(
        BigInt(taskId),
        BigInt(toAgentId),
        amount
    );
    const receipt = await tx.wait();
    
    let requestId = null;
    let agentType = null;
    
    for (const log of receipt.logs) {
        try {
            const parsed = escrowContract.interface.parseLog(log);
            if (parsed && parsed.name === 'AgentRequestCreated') {
                requestId = parsed.args[0].toString();
                // Determine agent type from agentId (you may need to fetch from registry)
                break;
            }
        } catch {}
    }
    
    return {
        success: true,
        requestId,
        txHash: receipt.hash,
        gasUsed: receipt.gasUsed.toString(),
        input: agentInput,  // Echo back the input
        agentId: toAgentId
    };
}

export async function completeAgentRequest(requestId, success, agentType = '') {
    // Check if server is owner first
    const owner = await escrowContract.owner();
    console.log('Server wallet:', serverWallet.address);
    console.log('Contract owner:', owner);
    console.log('Is owner:', owner.toLowerCase() === serverWallet.address.toLowerCase());
    
    if (owner.toLowerCase() !== serverWallet.address.toLowerCase()) {
        throw new Error(`Server wallet ${serverWallet.address} is not contract owner ${owner}`);
    }
    
    const tx = await escrowContract.completeAgentRequest(BigInt(requestId), success);
    console.log('CompleteAgentRequest TX:', tx.hash);
    const receipt = await tx.wait();
    console.log('CompleteAgentRequest receipt:', receipt.status === 1 ? 'SUCCESS' : 'FAILED');
    
    // Generate mock output based on agent type
    // In production, this would come from actual agent execution
    const output = success ? generateAgentOutput(agentType, 'input data') : 'Task failed - no output generated';
    
    return {
        success: true,
        txHash: receipt.hash,
        gasUsed: receipt.gasUsed.toString(),
        output: output  // Return the generated output
    };
}

export async function completeTask(taskId, success) {
    // Verify server is the owner
    const owner = await escrowContract.owner();
    if (owner.toLowerCase() !== serverWallet.address.toLowerCase()) {
        throw new Error(`Server wallet ${serverWallet.address} is not contract owner ${owner}`);
    }
    
    // Check task state before attempting completion
    const task = await escrowContract.tasks(BigInt(taskId));
    if (Number(task.status) !== 1) { // 1 = InProgress
        throw new Error(`Task not in progress. Status: ${task.status}`);
    }
    if (task.pendingAllocations > 0n) {
        throw new Error(`Pending allocations exist: ${task.pendingAllocations.toString()}`);
    }
    
    const tx = await escrowContract.completeTask(BigInt(taskId), success);
    const receipt = await tx.wait();
    
    return {
        success: true,
        txHash: receipt.hash,
        gasUsed: receipt.gasUsed.toString()
    };
}

export async function cancelTask(taskId) {
    const tx = await escrowContract.cancelTask(BigInt(taskId));
    const receipt = await tx.wait();
    
    return {
        success: true,
        txHash: receipt.hash,
        gasUsed: receipt.gasUsed.toString()
    };
}

export async function getServerAddress() {
    return serverWallet.address;
}

export async function authorizeEscrowInRegistry() {
    const tx = await registryContract.setAuthorizedCaller(TASK_ESCROW, true);
    const receipt = await tx.wait();
    
    return {
        success: true,
        txHash: receipt.hash
    };
}
