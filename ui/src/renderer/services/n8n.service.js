/**
 * n8n service — calls the local n8n webhook to trigger AI code generation.
 *
 * The request body is forwarded through n8n which:
 *  1. fetches the Jira issue (server-side, no CORS)
 *  2. routes to the selected AI provider (OpenAI / Claude / Gemini)
 *  3. returns { summary, files, patch }
 */
import axios from 'axios';

/**
 * @param {string} n8nUrl   Base URL of the local n8n instance
 * @param {string} issueKey Jira issue key, e.g. "PROJ-123"
 * @param {object} settings App settings
 * @returns {Promise<{ summary: string, files: Array<{name:string,content:string}>, patch: string }>}
 */
export async function generateCode(n8nUrl, issueKey, settings) {
  const response = await axios.post(
    `${n8nUrl}/webhook/generate`,
    {
      issueKey,
      jiraUrl:   settings.jiraUrl,
      jiraEmail: settings.jiraEmail,
      jiraToken: settings.jiraToken,
      // Multi-provider fields — n8n workflow uses these to route to the right API
      provider:  settings.aiProvider  || 'openai',
      model:     settings.aiModel     || null,
      openaiKey: settings.openaiKey   || '',
      claudeKey: settings.claudeKey   || '',
      geminiKey: settings.geminiKey   || '',
    },
    {
      timeout: 180_000, // 3 min — AI generation can be slow
      headers: { 'Content-Type': 'application/json' },
    }
  );

  const data = response.data;

  // Normalise: n8n workflows sometimes wrap the response in an array
  const result = Array.isArray(data) ? data[0] : data;

  if (!result || typeof result !== 'object') {
    throw new Error('Unexpected response format from n8n');
  }

  return {
    summary: result.summary ?? '',
    files: Array.isArray(result.files) ? result.files : [],
    patch: result.patch ?? '',
  };
}
