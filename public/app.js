// Agent Swarm - x402 Escrow Application

// Contract ABIs
const TOKEN_ABI = [
    "function balanceOf(address) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)",
    "function approve(address,uint256) returns (bool)",
    "function allowance(address,address) view returns (uint256)",
    "function transfer(address,uint256) returns (bool)"
];

const REGISTRY_ABI = [
    "function getAgent(uint256) view returns (tuple(address walletAddress, uint8 agentType, uint256 pricePerTask, uint16 reputation, bool active))",
    "function getAllActiveAgents() view returns (uint256[])"
];

const ESCROW_ABI = [
    "function createTaskWithBudget(uint256,uint256,string) returns (uint256)",
    "function tasks(uint256) view returns (tuple(uint256 id, address client, uint256 coordinatorAgentId, uint256 totalBudget, uint256 remainingBudget, uint256 pendingAllocations, uint256 coordinatorFee, uint8 status, uint256 createdAt, uint256 deadline))",
    "function clientTasks(address,uint256) view returns (uint256)",
    "function getTaskRequests(uint256) view returns (uint256[])",
    "function agentRequests(uint256) view returns (tuple(uint256 id, uint256 fromAgentId, uint256 toAgentId, uint256 amount, uint256 parentTaskId, uint8 status, uint256 createdAt))",
    "event TaskCreated(uint256 indexed, address indexed, uint256, uint256)"
];

const CONTRACTS = {
    AGENT_TOKEN: "0xEC307d7ae333C32b70889F0Fd61ce6f02Ee31Cf8",
    TASK_ESCROW: "0x167395Fba49094c4Dde9696849457474A54E361D",
    AGENT_REGISTRY: "0x5dB6615Be918c7d12c1342C7580BeA4a7726d6b1"
};

const SKALE_NETWORK = {
    chainId: '0x135a9d92',
    chainName: 'SKALE on Base Testnet',
    rpcUrls: ['https://base-sepolia-testnet.skalenodes.com/v1/base-testnet'],
    nativeCurrency: { name: 'CREDIT', symbol: 'CREDIT', decimals: 18 }
};

const AGENT_TYPES = ['Coordinator', 'Research', 'Analyst', 'Content', 'Code'];
const TaskStatus = ['Created', 'InProgress', 'Completed', 'Failed', 'Cancelled', 'Disputed'];
const RequestStatus = ['Pending', 'Completed', 'Failed', 'Cancelled'];

let provider, signer, userAddress;
let tokenContract, registryContract, escrowContract;
let selectedAgents = {};
let createdTaskId = null;

// Logging with tx hashes
function log(message, type = 'info', txHash = null) {
    const container = document.getElementById('logsContainer');
    if (container.children[0]?.classList.contains('italic')) container.innerHTML = '';
    
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    
    const icon = type === 'tx' ? '<span class="text-green-400">[TX]</span>' :
                type === 'api' ? '<span class="text-orange-400">[API]</span>' :
                type === 'error' ? '<span class="text-red-400">[ERR]</span>' :
                '<span class="text-blue-400">[INFO]</span>';
    
    let html = `${icon} <span class="text-gray-300">${new Date().toLocaleTimeString()}</span> ${message}`;
    if (txHash) {
        html += ` <a href="https://explorer.skale.network/tx/${txHash}" target="_blank" class="text-blue-400 hover:underline">${txHash.slice(0, 20)}...</a>`;
    }
    entry.innerHTML = html;
    container.appendChild(entry);
    container.scrollTop = container.scrollHeight;
}

// Update step UI
function updateStep(step, status, message = '') {
    const el = document.getElementById(`step${step}`);
    const statusEl = document.getElementById(`step${step}Status`);
    const badge = el.querySelector('span:first-child');
    
    el.className = 'step-box ' + (status === 'done' ? 'step-done' : status === 'active' ? 'step-active' : status === 'error' ? 'step-error' : 'step-pending');
    
    if (status === 'done') {
        badge.className = 'w-6 h-6 rounded-full bg-green-500 text-white text-xs flex items-center justify-center';
        badge.innerHTML = '<i class="fas fa-check"></i>';
    } else if (status === 'active') {
        badge.className = 'w-6 h-6 rounded-full bg-blue-500 text-white text-xs flex items-center justify-center';
        badge.innerHTML = step;
    } else {
        badge.className = 'w-6 h-6 rounded-full bg-gray-300 text-xs flex items-center justify-center font-bold';
        badge.innerHTML = step;
    }
    
    if (message) statusEl.textContent = message;
}

// Connect Wallet - check network only, no auto-switch
document.getElementById('connectBtn').addEventListener('click', async () => {
    if (!window.ethereum) { alert('Install MetaMask'); return; }
    
    try {
        await window.ethereum.request({ method: 'eth_requestAccounts' });
        
        // Check current network
        provider = new ethers.BrowserProvider(window.ethereum);
        const network = await provider.getNetwork();
        
        if (network.chainId !== 324705682n) {
            log(`Wrong network: ${network.chainId}. Expected 324705682 (SKALE)`, 'error');
            // Use fallback RPC for reads, MetaMask only for writes
            provider = new ethers.JsonRpcProvider(SKALE_NETWORK.rpcUrls[0]);
            log('Using fallback RPC for reads', 'info');
        } else {
            log(`Connected to SKALE network ${network.chainId}`, 'info');
        }
        
        signer = await (new ethers.BrowserProvider(window.ethereum)).getSigner();
        userAddress = await signer.getAddress();

        tokenContract = new ethers.Contract(CONTRACTS.AGENT_TOKEN, TOKEN_ABI, signer);
        registryContract = new ethers.Contract(CONTRACTS.AGENT_REGISTRY, REGISTRY_ABI, provider);
        escrowContract = new ethers.Contract(CONTRACTS.TASK_ESCROW, ESCROW_ABI, signer);

        document.getElementById('walletAddress').textContent = userAddress;
        document.getElementById('infoPanel').classList.remove('hidden');
        document.getElementById('connectBtn').innerHTML = '<i class="fas fa-check-circle mr-2"></i>Connected';
        document.getElementById('connectBtn').classList.remove('bg-blue-600');
        document.getElementById('connectBtn').classList.add('bg-green-600');

        log(`Wallet connected: ${userAddress}`);
        await loadAllData();
    } catch (e) {
        log(`Connection failed: ${e.message}`, 'error');
    }
});

// Load all data
async function loadAllData() {
    await loadBalances();
    await loadAgents();
    await loadTasks();
}

// Load balances with better error handling
async function loadBalances() {
    try {
        const readTokenContract = tokenContract.connect(provider);
        
        const [tokenBal, ethBal, allowance] = await Promise.all([
            readTokenContract.balanceOf(userAddress).catch(e => {
                log(`Token balance failed: ${e.message}`, 'error');
                return 0n;
            }),
            provider.getBalance(userAddress).catch(e => {
                log(`ETH balance failed: ${e.message}`, 'error');
                return 0n;
            }),
            readTokenContract.allowance(userAddress, CONTRACTS.TASK_ESCROW).catch(e => 0n)
        ]);

        const decimals = 18;
        const symbol = 'AGENT';

        const formattedToken = ethers.formatUnits(tokenBal, decimals);
        const formattedEth = ethers.formatEther(ethBal);
        const formattedAllowance = ethers.formatUnits(allowance, decimals);

        document.getElementById('walletBalance').textContent = `${formattedToken} ${symbol}`;
        document.getElementById('walletBalanceEth').textContent = `${parseFloat(formattedEth).toFixed(4)} CREDIT`;
        document.getElementById('escrowBalance').textContent = `${formattedAllowance} ${symbol}`;
        document.getElementById('totalAvailable').textContent = `${formattedToken} ${symbol}`;

        log(`Wallet: ${formattedToken} ${symbol} | Approved: ${formattedAllowance} ${symbol}`, 'info');
    } catch (e) {
        log(`Failed to load balances: ${e.message}`, 'error');
    }
}

// Load escrow balance
document.getElementById('refreshEscrowBtn').addEventListener('click', async () => {
    await loadBalances();
    log('Balances refreshed');
});

// Load agents with fallback provider
async function loadAgents() {
    try {
        const readRegistry = registryContract.connect(provider);
        const agentIds = await readRegistry.getAllActiveAgents();
        document.getElementById('agentsCount').textContent = `(${agentIds.length} found)`;

        const agents = await Promise.all(
            agentIds.map(async (id) => {
                const a = await readRegistry.getAgent(id);
                return { id: Number(id), type: Number(a.agentType), price: a.pricePerTask, rep: Number(a.reputation), active: a.active, wallet: a.walletAddress };
            })
        );

        renderAgents(agents.filter(a => a.active));
        log(`Loaded ${agentIds.length} agents from chain`);
    } catch (e) {
        log(`Failed to load agents: ${e.message}`, 'error');
    }
}

function renderAgents(agents) {
    const byType = {};
    AGENT_TYPES.forEach((t, i) => byType[i] = agents.filter(a => a.type === i).sort((a, b) => b.rep - a.rep));

    const container = document.getElementById('agentsList');
    container.innerHTML = '';

    AGENT_TYPES.forEach((typeName, typeIdx) => {
        const typeAgents = byType[typeIdx];
        if (!typeAgents?.length) return;

        const div = document.createElement('div');
        div.className = 'border rounded p-2';
        div.innerHTML = `<p class="text-xs font-bold mb-1">${typeName}</p>`;

        typeAgents.forEach((agent, idx) => {
            const isSelected = selectedAgents[typeName]?.id === agent.id;
            const row = document.createElement('div');
            row.className = `flex justify-between items-center p-2 rounded cursor-pointer ${isSelected ? 'bg-blue-100 border border-blue-300' : 'hover:bg-gray-50'}`;
            row.innerHTML = `
                <div class="flex items-center gap-2">
                    <span class="text-xs">#${agent.id}</span>
                    ${idx === 0 ? '<span class="text-xs bg-yellow-200 px-1 rounded">best</span>' : ''}
                    <span class="text-xs text-gray-500">rep: ${agent.rep}</span>
                </div>
                <div class="flex items-center gap-2">
                    <span class="text-sm font-bold">${ethers.formatEther(agent.price)} AGENT</span>
                    <button class="text-xs ${isSelected ? 'text-blue-600 font-bold' : 'text-gray-400'}">
                        ${isSelected ? 'Selected' : 'Select'}
                    </button>
                </div>
            `;
            row.onclick = () => selectAgent(typeName, agent);
            div.appendChild(row);
        });

        container.appendChild(div);
    });
}

function selectAgent(type, agent) {
    selectedAgents[type] = agent;
    renderAgentsFromCache();
    updateStep(1, 'done', `${type}: Agent #${agent.id}`);
    updateBudget();
    checkCanCreateTask();
}

function renderAgentsFromCache() {
    // Re-render with current selection
}

function updateBudget() {
    let total = 0n;
    let html = '';
    
    AGENT_TYPES.forEach(type => {
        const a = selectedAgents[type];
        if (a) {
            total += a.price;
            html += `<div class="flex justify-between text-sm"><span>${type}:</span><span>${ethers.formatEther(a.price)} AGENT</span></div>`;
        }
    });

    document.getElementById('selectedAgentsList').innerHTML = html || 'No agents selected';
    document.getElementById('totalBudget').textContent = `${ethers.formatEther(total)} AGENT`;

    if (selectedAgents['Coordinator']) {
        updateStep(2, 'active', 'Ready to create task');
        document.getElementById('createTaskBtn').disabled = false;
    }
}

function checkCanCreateTask() {
    // Check balance logic here
}

// Create Task
document.getElementById('createTaskBtn').addEventListener('click', async () => {
    if (!selectedAgents['Coordinator']) {
        log('Select a Coordinator agent first', 'error');
        return;
    }

    const coordinator = selectedAgents['Coordinator'];
    let total = coordinator.price;
    
    AGENT_TYPES.slice(1).forEach(t => {
        if (selectedAgents[t]) total += selectedAgents[t].price;
    });

    try {
        updateStep(3, 'active', 'Sending transaction...');
        log('Creating task on blockchain...');

        const tx = await escrowContract.createTaskWithBudget(coordinator.id, total, 'ipfs://task');
        log(`Transaction sent: ${tx.hash}`, 'tx', tx.hash);

        document.getElementById('createTaskTx').classList.remove('hidden');
        document.getElementById('createTaskTx').textContent = `Tx: ${tx.hash}`;

        const receipt = await tx.wait();
        
        for (const logEntry of receipt.logs) {
            try {
                const parsed = escrowContract.interface.parseLog(logEntry);
                if (parsed?.name === 'TaskCreated') {
                    createdTaskId = parsed.args[0].toString();
                    break;
                }
            } catch {}
        }

        updateStep(3, 'done', `Task #${createdTaskId} created`);
        log(`Task created: #${createdTaskId}`, 'success');

        await processX402(createdTaskId);

    } catch (e) {
        updateStep(3, 'error', e.message);
        log(`Task creation failed: ${e.message}`, 'error');
    }
});

// x402 Processing with workflow data passing
async function processX402(taskId) {
    updateStep(4, 'active', 'Processing via API...');
    document.getElementById('step4Progress').classList.remove('hidden');
    
    const progressBar = document.getElementById('step4Bar');
    const progressText = document.getElementById('step4Text');
    const agentsDiv = document.getElementById('step4Agents');
    
    // Get initial input
    let currentInput = document.getElementById('workflowInput').value || 'Process task data';
    
    let progress = 0;
    const updateProgress = (pct, msg) => {
        progress = pct;
        progressBar.style.width = `${pct}%`;
        progressText.textContent = msg;
        log(`[API] ${msg}`, 'api');
    };

    log(`[Workflow] Starting with input: ${currentInput.substring(0, 50)}...`, 'info');

    try {
        for (const type of AGENT_TYPES.slice(1)) {
            const agent = selectedAgents[type];
            if (!agent) continue;

            updateProgress(progress + 10, `${type}: Allocating budget...`);
            
            // Allocate with input data
            const allocRes = await fetch('/api/escrow/allocate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    taskId, 
                    toAgentId: agent.id, 
                    amount: agent.price.toString(),
                    input: currentInput  // Pass input to agent
                })
            });
            
            if (!allocRes.ok) {
                const errorText = await allocRes.text();
                throw new Error(`Allocate API failed: ${allocRes.status} - ${errorText}`);
            }
            
            const allocData = await allocRes.json();
            log(`[API] ${type} allocated: ${allocData.requestId}`);

            if (allocData.requestId) {
                const div = document.createElement('div');
                div.className = 'text-xs flex justify-between';
                div.innerHTML = `<span>${type} allocated</span><span class="text-green-600">Req #${allocData.requestId}</span>`;
                agentsDiv.appendChild(div);

                updateProgress(progress + 15, `${type}: Processing...`);
                
                // Complete with agent type to get output
                const completeRes = await fetch('/api/escrow/complete-request', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        requestId: allocData.requestId, 
                        success: true,
                        agentType: type  // Tell server what type for output generation
                    })
                });
                
                if (!completeRes.ok) {
                    const errorText = await completeRes.text();
                    throw new Error(`Complete API failed: ${completeRes.status} - ${errorText}`);
                }
                
                const completeData = await completeRes.json();
                log(`[API] ${type} completed: ${completeData.output?.substring(0, 50)}...`);

                div.innerHTML += ' <span class="text-green-600"><i class="fas fa-check"></i></span>';
                
                // Chain output to next agent
                if (completeData.output) {
                    currentInput = completeData.output;
                    log(`[Workflow] ${type} output → next agent`, 'info');
                }
            }
        }

        updateProgress(90, 'Finalizing task...');
        const completeTaskRes = await fetch('/api/escrow/complete-task', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ taskId, success: true })
        });
        
        if (!completeTaskRes.ok) {
            const errorText = await completeTaskRes.text();
            throw new Error(`Complete task API failed: ${completeTaskRes.status} - ${errorText}`);
        }

        updateProgress(100, 'Complete!');
        updateStep(4, 'done', 'All agents paid');
        log(`[Workflow] Final output: ${currentInput.substring(0, 100)}...`, 'success');
        log('x402 processing complete', 'success');

        await loadBalances();
        await loadTasks();

    } catch (e) {
        updateStep(4, 'error', e.message);
        log(`x402 failed: ${e.message}`, 'error');
    }
}

// Load tasks with fallback provider
async function loadTasks() {
    try {
        const readEscrow = escrowContract.connect(provider);
        
        const taskIds = [];
        let i = 0;
        while (true) {
            try {
                const taskId = await readEscrow.clientTasks(userAddress, i);
                taskIds.push(taskId);
                i++;
            } catch (e) {
                break;
            }
        }
        
        const tasks = await Promise.all(
            taskIds.map(async (id) => {
                const t = await readEscrow.tasks(id);
                return {
                    id: Number(t.id),
                    status: TaskStatus[t.status],
                    total: ethers.formatEther(t.totalBudget),
                    remaining: ethers.formatEther(t.remainingBudget),
                    coordinator: Number(t.coordinatorAgentId)
                };
            })
        );

        renderTasks(tasks);
        log(`Loaded ${tasks.length} tasks`);
    } catch (e) {
        log(`Failed to load tasks: ${e.message}`, 'error');
    }
}

function renderTasks(tasks) {
    const container = document.getElementById('tasksList');
    if (!tasks.length) {
        container.innerHTML = '<p class="text-sm text-gray-500">No tasks found</p>';
        return;
    }

    container.innerHTML = '';
    tasks.reverse().forEach(t => {
        const statusColor = t.status === 'Completed' ? 'text-green-600' : t.status === 'InProgress' ? 'text-blue-600' : 'text-gray-600';
        const div = document.createElement('div');
        div.className = 'border rounded p-2 text-sm';
        div.innerHTML = `
            <div class="flex justify-between items-center">
                <span class="font-bold">Task #${t.id}</span>
                <span class="${statusColor}">${t.status}</span>
            </div>
            <div class="text-xs text-gray-500 mt-1">
                Coordinator: #${t.coordinator} | Total: ${t.total} AGENT | Remaining: ${t.remaining} AGENT
            </div>
        `;
        container.appendChild(div);
    });
}

document.getElementById('refreshTasksBtn').addEventListener('click', () => {
    loadTasks();
    log('Tasks refreshed');
});

// Max deposit
document.getElementById('maxDepositBtn').addEventListener('click', async () => {
    try {
        const readToken = tokenContract.connect(provider);
        const bal = await readToken.balanceOf(userAddress);
        document.getElementById('depositAmount').value = ethers.formatUnits(bal, 18);
    } catch (e) {
        log('Failed to get max balance', 'error');
    }
});

// Agent Workflow Simulation
document.getElementById('simulateWorkflowBtn').addEventListener('click', async () => {
    const input = document.getElementById('workflowInput').value;
    if (!input.trim()) {
        log('Enter workflow input first', 'error');
        return;
    }

    // Show workflow output section
    document.getElementById('workflowOutput').classList.remove('hidden');
    document.getElementById('coordinatorOutput').textContent = input;
    
    const agentOutputs = document.getElementById('agentOutputs');
    agentOutputs.innerHTML = '';
    
    let currentInput = input;
    const selectedTypes = AGENT_TYPES.filter(type => selectedAgents[type]);
    
    log(`[Workflow] Starting with ${selectedTypes.length - 1} agents`, 'info');

    // Process through each non-coordinator agent
    for (let i = 1; i < selectedTypes.length; i++) {
        const type = selectedTypes[i];
        const agent = selectedAgents[type];
        
        // Simulate agent processing with delay
        const div = document.createElement('div');
        div.className = 'border-l-4 border-indigo-400 pl-3 py-2 bg-indigo-50 rounded';
        div.innerHTML = `
            <p class="text-xs font-bold text-indigo-700">${type} Agent #${agent.id} (Processing...)</p>
            <p class="text-xs text-gray-500 mt-1">Input: ${currentInput.substring(0, 50)}${currentInput.length > 50 ? '...' : ''}</p>
        `;
        agentOutputs.appendChild(div);
        
        // Simulate work time
        await new Promise(r => setTimeout(r, 1500));
        
        // Generate mock output based on agent type
        let output = '';
        switch(type) {
            case 'Research':
                output = `Research findings on "${currentInput.substring(0, 30)}...":\n• Market size: $45B growing 35% YoY\n• Key players: OpenAI, Anthropic, Google\n• Trends: Multi-agent systems, budget-based payments\n• Opportunity: x402 escrow for agent payments`;
                break;
            case 'Analyst':
                output = `Analysis of research data:\n• Strengths: Growing market, clear use case\n• Weaknesses: Complex coordination needed\n• Opportunities: SKALE low-cost transactions\n• Threats: Traditional payment rails\n\nRecommendation: Proceed with x402 implementation`;
                break;
            case 'Content':
                output = `Strategic Content Brief:\n\nTitle: "The Future of AI Agent Payments: x402 & Budget-Based Escrow"\n\nKey Points:\n1. Traditional APIs charge per-request\n2. Budget-based payments offer cost control\n3. x402 enables trustless agent coordination\n4. SKALE provides zero-gas execution\n\nTone: Technical, forward-thinking, authoritative`;
                break;
            case 'Code':
                output = `// Smart Contract Architecture\n// TaskEscrow.sol - Budget-based payment flow\n\ncontract TaskEscrow {\n  function createTaskWithBudget(coordinatorId, totalBudget, taskHash) {\n    // 1. Transfer budget from client\n    // 2. Reserve coordinator fee\n    // 3. Allocate remaining to agents\n  }\n  \n  function allocateBudgetToAgent(taskId, agentId, amount) onlyOwner {\n    // Server allocates budget slice to agent\n  }\n  \n  function completeAgentRequest(requestId, success) onlyOwner {\n    // Pay agent on successful completion\n  }\n}`;
                break;
            default:
                output = `Processed: ${currentInput}\nResult: Optimized and enhanced output for next stage.`;
        }
        
        // Update UI with output
        div.innerHTML = `
            <p class="text-xs font-bold text-indigo-700">${type} Agent #${agent.id} <i class="fas fa-check text-green-600"></i></p>
            <p class="text-xs text-gray-500 mt-1">Input: ${currentInput.substring(0, 50)}${currentInput.length > 50 ? '...' : ''}</p>
            <div class="mt-2 p-2 bg-white rounded text-xs text-gray-700 whitespace-pre-wrap font-mono">${output}</div>
        `;
        
        log(`[Workflow] ${type} agent completed`, 'success');
        currentInput = output; // Pass to next agent
    }
    
    // Show final output
    document.getElementById('finalOutput').classList.remove('hidden');
    document.getElementById('finalOutputText').textContent = currentInput;
    
    log('[Workflow] All agents completed, final output ready', 'success');
});

// Enable workflow button when agents selected
function checkCanCreateTask() {
    const hasCoordinator = selectedAgents['Coordinator'];
    document.getElementById('createTaskBtn').disabled = !hasCoordinator;
    document.getElementById('simulateWorkflowBtn').disabled = !hasCoordinator;
}

// Approve tokens for escrow to spend (single step)
document.getElementById('depositBtn').addEventListener('click', async () => {
    const amount = document.getElementById('depositAmount').value;
    if (!amount || amount <= 0) {
        log('Enter valid amount', 'error');
        return;
    }

    const statusEl = document.getElementById('depositStatus');
    statusEl.classList.remove('hidden');

    try {
        const value = ethers.parseUnits(amount, 18);

        statusEl.innerHTML = '<span class="text-blue-600"><i class="fas fa-circle-notch fa-spin"></i> Approving escrow to spend tokens...</span>';
        const approveTx = await tokenContract.approve(CONTRACTS.TASK_ESCROW, value);
        log(`Approval tx: ${approveTx.hash}`, 'tx', approveTx.hash);
        await approveTx.wait();
        
        statusEl.innerHTML = '<span class="text-green-600"><i class="fas fa-check"></i> Approved! Escrow can now spend up to ' + amount + ' AGENT for tasks.</span>';
        log(`Approved ${amount} AGENT for escrow`, 'success');

        await loadBalances();

    } catch (e) {
        statusEl.innerHTML = `<span class="text-red-600">Error: ${e.message}</span>`;
        log(`Approval failed: ${e.message}`, 'error');
    }
});
