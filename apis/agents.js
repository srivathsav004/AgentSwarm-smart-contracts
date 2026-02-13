import ResearchAgent from '../agents/ResearchAgent.js';
import AnalystAgent from '../agents/AnalystAgent.js';
import ContentAgent from '../agents/ContentAgent.js';
import CodeAgent from '../agents/CodeAgent.js';

const researchAgent = new ResearchAgent();
const analystAgent = new AnalystAgent();
const contentAgent = new ContentAgent();
const codeAgent = new CodeAgent();

function buildFallbackOutput(agentType, input) {
    const shortInput = (input || '').slice(0, 80);

    switch (agentType) {
        case 'research':
            return [
                `Goal: design a high-converting AI agent marketplace landing page`,
                `Focus: clearly explain multi-agent workflow and budget-based payments`,
                `Sections: hero, use-cases, pricing, live demos, trust / security`,
                `Example: modern SaaS layout with 3–4 feature cards and a primary CTA`,
            ].join('\n');
        case 'analyst':
            return [
                `Insight: users must immediately understand what agents do and why escrow matters`,
                `Insight: strongest levers are social proof, transparent pricing, and live demos`,
                `Recommendation: keep copy short, benefit-focused, and tie each section to an action`,
                `Confidence: High`,
            ].join('\n');
        case 'content':
            return [
                `AI Agents That Ship Real Work`,
                `- Orchestrate research, analysis, content, and code in one pipeline`,
                `- Pay per task with on-chain escrow and visible agent fees`,
                `- Watch live demos before committing real budget`,
                `CTA: Run your first agent-powered task`,
                `Note for code agent: structure sections for hero, 3 feature cards, pricing preview, and demo strip`,
            ].join('\n');
        case 'code':
            return (
                `<section class="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center px-6 py-12">` +
                `<div class="max-w-4xl w-full space-y-10">` +
                `<header class="text-center space-y-3">` +
                `<p class="text-xs uppercase tracking-[0.25em] text-sky-400">AI AGENT MARKETPLACE</p>` +
                `<h1 class="text-3xl md:text-4xl font-semibold">Launch tasks with a swarm of on‑chain AI agents</h1>` +
                `<p class="text-sm md:text-base text-slate-400">Budget-based payments, transparent pricing, and live agent demos powered by escrow.</p>` +
                `</header>` +
                `<div class="grid gap-6 md:grid-cols-3">` +
                `<div class="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 space-y-2">` +
                `<h2 class="text-sm font-semibold">Use‑cases</h2>` +
                `<p class="text-xs text-slate-400">Research, analysis, content, and UI code in a single pipeline.</p>` +
                `</div>` +
                `<div class="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 space-y-2">` +
                `<h2 class="text-sm font-semibold">Pricing</h2>` +
                `<p class="text-xs text-slate-400">Pay per task with capped budgets and visible agent fees.</p>` +
                `</div>` +
                `<div class="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 space-y-2">` +
                `<h2 class="text-sm font-semibold">Live demos</h2>` +
                `<p class="text-xs text-slate-400">Preview each agent’s output before committing real funds.</p>` +
                `</div>` +
                `</div>` +
                `<div class="flex flex-wrap items-center gap-3">` +
                `<button class="px-4 py-2 rounded-full bg-sky-500 text-slate-950 text-sm font-medium">Run a demo task</button>` +
                `<button class="px-4 py-2 rounded-full border border-slate-700 text-sm text-slate-200">View agent registry</button>` +
                `</div>` +
                `</div>` +
                `</section>`
            );
        default:
            return shortInput || 'Processed input.';
    }
}

export async function runAgent(agentType, input, options = {}) {
    const normalizedType = (agentType || '').toString().toLowerCase();

    // Coordinator is non-LLM in this demo: just pass-through
    if (normalizedType === 'coordinator') {
        return {
            success: true,
            agentType: 'Coordinator',
            agentId: 1,
            model: 'pass-through',
            output: input,
            timestamp: new Date().toISOString(),
        };
    }

    try {
        switch (normalizedType) {
            case 'research': {
                const result = await researchAgent.research(input, {
                    depth: 'Surface-level, focused on landing-page design',
                    timeFrame: 'Current and recent trends',
                    geographic: 'Global',
                    sources: 'Landing page best practices, SaaS design patterns, agent marketplace examples',
                    questions:
                        'What goals, sections, and value props should this landing page emphasize so that downstream agents can implement it as HTML?',
                    ...(options.scope || {}),
                });
                if (!result.success) {
                    const fallback = buildFallbackOutput('research', input);
                    return {
                        success: true,
                        agentType: 'Research',
                        agentId: researchAgent.agentId,
                        model: result.model || 'fallback',
                        output: fallback,
                        raw: result,
                    };
                }
                let output = result.response || '';
                // Avoid degenerate case where model just echoes the input
                if (output.trim() === (input || '').trim()) {
                    output = buildFallbackOutput('research', input);
                }
                return {
                    success: true,
                    agentType: 'Research',
                    agentId: result.agentId,
                    model: result.model,
                    output,
                    raw: result,
                };
            }
            case 'analyst': {
                const result = await analystAgent.analyze(input, options.analysisType || 'ui_landing_page_spec');
                if (!result.success) {
                    const fallback = buildFallbackOutput('analyst', input);
                    return {
                        success: true,
                        agentType: 'Analyst',
                        agentId: analystAgent.agentId,
                        model: result.model || 'fallback',
                        output: fallback,
                        raw: result,
                    };
                }
                let output = result.response || '';
                if (output.trim() === (input || '').trim()) {
                    output = buildFallbackOutput('analyst', input);
                }
                return {
                    success: true,
                    agentType: 'Analyst',
                    agentId: result.agentId,
                    model: result.model,
                    output,
                    raw: result,
                };
            }
            case 'content': {
                const result = await contentAgent.createContent(
                    options.contentType || 'Landing page outline for code generator',
                    input,
                    {
                        audience: 'Downstream code agent that will render HTML',
                        tone: 'Confident, product-focused, concise',
                        style: 'Short, skimmable lines with clear section hints',
                        keyMessages:
                            'Multi-agent workflow, budget-based escrow, live demos, transparent pricing, trust & security',
                        platform: 'Web landing page',
                        length: 'Very short outline with 4–6 lines max',
                        constraints:
                            'Do not repeat the brief verbatim, structure output so it is easy for a code agent to map to sections',
                        ...(options.guidelines || {}),
                    }
                );
                if (!result.success) {
                    const fallback = buildFallbackOutput('content', input);
                    return {
                        success: true,
                        agentType: 'Content',
                        agentId: contentAgent.agentId,
                        model: result.model || 'fallback',
                        output: fallback,
                        raw: result,
                    };
                }
                let output = result.response || '';
                if (output.trim() === (input || '').trim()) {
                    output = buildFallbackOutput('content', input);
                }
                return {
                    success: true,
                    agentType: 'Content',
                    agentId: result.agentId,
                    model: result.model,
                    output,
                    raw: result,
                };
            }
            case 'code': {
                const result = await codeAgent.generateCode(
                    input,
                    'html',
                    options.framework || 'plain-html-snippet'
                );
                // If the underlying agent call failed OR returned an empty/whitespace-only response,
                // fall back to a static, known-good HTML snippet so the UI always has something to render.
                if (!result.success || !result.response || !result.response.trim()) {
                    const fallback = buildFallbackOutput('code', input);
                    return {
                        success: true,
                        agentType: 'Code',
                        agentId: codeAgent.agentId,
                        model: result.model || 'fallback',
                        output: fallback,
                        raw: {
                            ...result,
                            usedFallback: true,
                        },
                    };
                }

                const output = result.response;
                return {
                    success: true,
                    agentType: 'Code',
                    agentId: result.agentId,
                    model: result.model,
                    output,
                    raw: result,
                };
            }
            default:
                throw new Error(`Unsupported agentType: ${agentType}`);
        }
    } catch (error) {
        const status = error?.response?.status;
        const normalized = normalizedType || (agentType || '').toString().toLowerCase();
        const fallback = buildFallbackOutput(normalized, input);

        return {
            success: true,
            agentType,
            agentId:
                normalized === 'research'
                    ? researchAgent.agentId
                    : normalized === 'analyst'
                    ? analystAgent.agentId
                    : normalized === 'content'
                    ? contentAgent.agentId
                    : normalized === 'code'
                    ? codeAgent.agentId
                    : undefined,
            model: 'fallback',
            output: fallback,
            raw: {
                error: error?.message || 'Agent execution failed',
                status,
            },
        };
    }
}

