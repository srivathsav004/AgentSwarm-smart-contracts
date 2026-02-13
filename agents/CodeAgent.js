import axios from 'axios';

class CodeAgent {
    constructor() {
        this.agentId = 5; // On-chain agent ID
        this.model = "qwen/qwen3-coder:free"; // 123B coding specialist
        // Prefer dedicated key, fall back to shared key if needed
        this.apiKey = process.env.Code_API_KEY || process.env.CODE_API_KEY || process.env.OPENROUTER_API_KEY;
        this.baseURL = 'https://openrouter.ai/api/v1';
        
        this.client = axios.create({
            baseURL: this.baseURL,
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': process.env.YOUR_SITE_URL || 'http://localhost:3000',
                'X-Title': 'Agent Swarm - Code'
            }
        });

        this.systemPrompt = `You are an expert frontend engineer who ONLY returns minimal HTML UI snippets with clean UX and UI.

TECHNICAL EXPERTISE (FOCUS FOR THIS DEMO):
- HTML structure
- Modern, clean UI layouts
- Minimal, readable inline styles or Tailwind-like classnames

CODING STANDARDS:
- Write clean, maintainable, well-documented code
- Follow language-specific best practices and conventions
- Implement proper error handling and logging
- Consider security implications and vulnerabilities
- Optimize for performance and scalability
- Include comprehensive testing strategies

HTML UI DELIVERABLES (DEMO MODE - KEEP OUTPUT TINY):
1. **Single HTML Snippet** - e.g. a small card, panel, or layout
2. **Clean UX** - clear hierarchy, readable spacing
3. **No Explanations** - do NOT include comments, markdown fences, or prose

CONSTRAINTS:
- Output MUST be raw HTML only (no backticks, no \`\`\`)
- Keep it relatively short (e.g. 20–40 lines)
- Do not include <html>, <head>, or <body> tags
- Do NOT repeat the natural language requirements in the HTML

Always produce a self-contained snippet that can be dropped into a page as-is.`;
    }

    async generateCode(requirements, language = 'html', framework = null) {
        try {
            const codePrompt = `HTML UI SNIPPET REQUEST:

REQUIREMENTS (DESCRIBE THE UI YOU WANT; do NOT restate these in the HTML):
${requirements}

LANGUAGE: ${language}
FRAMEWORK: ${framework || 'None - plain HTML snippet with optional utility classes'}

OUTPUT FORMAT:
- A single, minimal HTML snippet representing the UI for a landing page / component
- No comments, no markdown, no explanations
- Clean layout, good spacing, and readable typography
- Classes may look like Tailwind (e.g. "bg-slate-900 text-slate-100 p-6 rounded-xl")

Remember: output must be HTML only.`;

            const messages = [
                { role: 'system', content: this.systemPrompt },
                { role: 'user', content: codePrompt }
            ];

            console.log(`💻 Code Agent ${this.agentId} generating code...`);

            const response = await this.client.post('/chat/completions', {
                model: this.model,
                messages: messages,
                max_tokens: 512,
                temperature: 0.2
            });

            const result = response.data.choices[0].message.content;

            return {
                success: true,
                agentId: this.agentId,
                agentType: 'Code',
                model: this.model,
                response: result,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            console.error(`❌ Code Agent ${this.agentId} error:`, error.message);
            return {
                success: false,
                agentId: this.agentId,
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    async reviewCode(codeToReview, language = 'javascript') {
        const reviewPrompt = `CODE REVIEW REQUEST:

CODE TO REVIEW:
\`\`\`${language}
${codeToReview}
\`\`\`

Please provide comprehensive code review including:
1. **Overall Assessment** - Code quality rating (1-10)
2. **Security Issues** - Vulnerabilities and fixes
3. **Performance** - Optimization opportunities
4. **Bug Detection** - Potential issues and solutions
5. **Best Practices** - Style and convention improvements
6. **Architecture** - Design and structure feedback
7. **Testing** - Test coverage recommendations
8. **Documentation** - Comment and documentation needs
9. **Maintainability** - Long-term code health
10. **Specific Fixes** - Line-by-line improvement suggestions

Provide actionable, specific feedback with examples.`;

        return await this.generateCode(reviewPrompt, language, 'Code Review');
    }

    async debugCode(buggyCode, errorDescription, language = 'javascript') {
        const debugPrompt = `DEBUGGING REQUEST:

BUGGY CODE:
\`\`\`${language}
${buggyCode}
\`\`\`

ERROR DESCRIPTION:
${errorDescription}

Please provide:
1. **Root Cause Analysis** - What's causing the issue
2. **Step-by-Step Debug Process** - How to identify the problem
3. **Fixed Code** - Corrected version with explanations
4. **Prevention Strategy** - How to avoid similar issues
5. **Testing Approach** - How to verify the fix works
6. **Related Issues** - Other potential problems to check
7. **Monitoring** - How to catch similar issues in production

Explain your debugging methodology clearly.`;

        return await this.generateCode(debugPrompt, language, 'Debugging');
    }
}

export default CodeAgent;