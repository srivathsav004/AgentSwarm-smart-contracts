import axios from 'axios';

class CodeAgent {
    constructor() {
        this.agentId = 5; // On-chain agent ID
        this.model = "qwen/qwen3-coder:free"; // 123B coding specialist
        // Prefer dedicated key, fall back to shared key if needed
        this.apiKey = process.env.OPENROUTER_API_KEY1;
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

        this.systemPrompt = `You are an expert frontend engineer who ONLY returns small, production-ready front-end snippets with clean UX and UI.

TECHNICAL EXPERTISE (FOCUS FOR THIS DEMO):
- HTML structure
- Modern, clean UI layouts
- Component-level CSS (via <style> tag scoped to a wrapper)
- Small, focused JavaScript interactions (via <script> tag)

CODING STANDARDS:
- Write clean, maintainable, well-documented code
- Follow language-specific best practices and conventions
- Implement proper error handling and logging
- Consider security implications and vulnerabilities
- Optimize for performance and scalability
- Include comprehensive testing strategies

FRONTEND DELIVERABLES (DEMO MODE - KEEP OUTPUT TINY):
1. A self-contained HTML block suitable for embedding in a page
2. Inline <style> with a small, neat CSS subset for layout and state
3. Inline <script> with minimal JS to enhance UX (e.g. hover, active state, small interactions)
4. Clean UX: clear hierarchy, spacing, and readable typography
5. No explanations, markdown fences, or prose

CONSTRAINTS:
- Output MUST be raw HTML only (no backticks, no \`\`\`, no markdown)
- Keep it relatively short (roughly 30–80 lines total)
- Do not include <html>, <head>, or <body> tags
- Do NOT repeat the natural language requirements in the HTML
- The HTML must include the main markup, then a <style> block, then a <script> block

Always produce a self-contained snippet that can be dropped into a page as-is, with HTML + CSS + JS in one block.`;
    }

    async generateCode(requirements, language = 'html', framework = null) {
        try {
            const codePrompt = `EMBEDDABLE FRONTEND SNIPPET REQUEST:

REQUIREMENTS (DESCRIBE THE UI YOU WANT; do NOT restate these in the HTML):
${requirements}

LANGUAGE: ${language}
FRAMEWORK: ${framework || 'None - plain HTML + CSS + JS snippet'}

OUTPUT FORMAT:
1. A single wrapper element (e.g. <section> or <div>) containing the UI
2. Immediately after it, a <style> tag with only the CSS needed for this snippet
3. Immediately after that, a <script> tag with only the JS needed for this snippet
4. No comments, no markdown fences, no explanations
5. Clean layout, good spacing, and readable typography
6. Classes may look like Tailwind (e.g. "bg-slate-900 text-slate-100 p-6 rounded-xl") OR regular CSS class names

Remember: output must be HTML only (including the <style> and <script> tags).`;

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