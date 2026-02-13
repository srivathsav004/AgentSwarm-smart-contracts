import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import {
    allocateBudgetToAgent,
    completeAgentRequest,
    completeTask,
    cancelTask,
    getServerAddress,
    createTaskForClient,
} from './apis/escrow.js';
import { runAgent } from './apis/agents.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Server info
app.get('/api/server', async (req, res) => {
    try {
        const address = await getServerAddress();
        res.json({ address });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Escrow APIs - x402 payment processing only
// Note: Balances, agents, tasks, and task creation are now handled directly from blockchain by the client
// These endpoints are used by the server to handle allocations after task creation

// Create task for a client using their deposited funds
app.post('/api/escrow/create-task', async (req, res) => {
    try {
        const { client, coordinatorAgentId, totalBudget, taskHash } = req.body;

        if (!client || !coordinatorAgentId || !totalBudget) {
            return res.status(400).json({ error: 'Missing required fields: client, coordinatorAgentId, totalBudget' });
        }

        const result = await createTaskForClient(
            client,
            Number(coordinatorAgentId),
            BigInt(totalBudget),
            taskHash || 'ipfs://TaskWorkflow'
        );

        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/escrow/allocate', async (req, res) => {
    try {
        const { taskId, toAgentId, amount, input } = req.body;
        
        if (!taskId || !toAgentId || !amount) {
            return res.status(400).json({ error: 'Missing required fields: taskId, toAgentId, amount' });
        }
        
        const result = await allocateBudgetToAgent(taskId, toAgentId, amount, input || '');
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/escrow/complete-request', async (req, res) => {
    try {
        const { requestId, success, agentType } = req.body;
        
        if (!requestId) {
            return res.status(400).json({ error: 'Missing required field: requestId' });
        }
        
        const result = await completeAgentRequest(requestId, success !== false, agentType || '');
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/escrow/complete-task', async (req, res) => {
    try {
        const { taskId, success } = req.body;
        
        if (!taskId) {
            return res.status(400).json({ error: 'Missing required field: taskId' });
        }
        
        const result = await completeTask(taskId, success !== false);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/escrow/cancel-task', async (req, res) => {
    try {
        const { taskId } = req.body;
        
        if (!taskId) {
            return res.status(400).json({ error: 'Missing required field: taskId' });
        }
        
        const result = await cancelTask(taskId);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Agent execution API - runs real OpenRouter-backed agents
app.post('/api/agents/run', async (req, res) => {
    try {
        const { agentType, input, options } = req.body || {};

        if (!agentType || !input) {
            return res.status(400).json({ error: 'Missing required fields: agentType, input' });
        }

        const result = await runAgent(agentType, input, options || {});
        if (!result.success) {
            return res.status(500).json(result);
        }

        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message || 'Agent execution failed' });
    }
});

// Static files - serve AFTER API routes
app.use(express.static('public'));

app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📖 API endpoints available at /api/*`);
});
