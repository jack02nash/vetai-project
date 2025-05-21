// OpenAI.js

// Main function to call OpenAI chat completion API
export const getOpenAIResponse = async (messagesOrUserMessage, systemPrompt = '', model = 'gpt-4') => {
  let messages = [];

  if (Array.isArray(messagesOrUserMessage)) {
    messages = messagesOrUserMessage;
  } else {
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: messagesOrUserMessage });
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.REACT_APP_OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,          // Dynamic model selection
      messages,
    }),
  });

  if (!res.ok) {
    const error = await res.text();
    console.error('OpenAI Error:', error);
    throw new Error('OpenAI API call failed');
  }

  const data = await res.json();

  return data.choices[0].message.content;
};

// Separate function to generate conversation titles using a faster model
export async function generateConversationTitle(messages) {
  const prompt = `
You are a helpful assistant. Given this conversation, generate a short title (3–6 words) that summarizes it clearly and professionally. Do not include quotes or punctuation marks.

Conversation:
${messages.map(m => `${m.role === 'user' ? 'User' : 'VetAI'}: ${m.content}`).join('\n')}

Title:
`;

  const response = await getOpenAIResponse([
    { role: 'system', content: 'You are an expert title generator for chat threads.' },
    { role: 'user', content: prompt }
  ], '', 'gpt-3.5-turbo');  // Use gpt-3.5-turbo for faster title generation

  return response.replace(/[".]/g, '').trim();
}
export async function* getOpenAIStream(messages) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.REACT_APP_OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini', // or 'gpt-4-0613' or whichever you want
      messages,
      stream: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.statusText}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Split the buffer by newlines because streaming data comes in lines
    const lines = buffer.split('\n');

    // Keep incomplete line in the buffer
    buffer = lines.pop();

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data: ')) continue;

      const jsonStr = trimmed.replace(/^data: /, '');
      if (jsonStr === '[DONE]') {
        return;
      }

      try {
        const parsed = JSON.parse(jsonStr);
        const content = parsed.choices[0].delta?.content;
        if (content) {
          yield content;
        }
      } catch (e) {
        console.error('Error parsing JSON chunk:', e);
      }
    }
  }
}
