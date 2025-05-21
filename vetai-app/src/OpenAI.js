// OpenAI.js

// Main function to call OpenAI chat completion API through our backend
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

  const res = await fetch('https://vetai-project.onrender.com/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
    }),
  });

  if (!res.ok) {
    const error = await res.text();
    console.error('API Error:', error);
    throw new Error('Chat API call failed');
  }

  const data = await res.json();
  return data.response;
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
  ], '', 'gpt-3.5-turbo');

  return response.replace(/[".]/g, '').trim();
}

export async function* getOpenAIStream(messages) {
  const response = await fetch('https://vetai-project.onrender.com/api/chat/stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4',
      messages,
      stream: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.statusText}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
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
