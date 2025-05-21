export async function getOpenAIStream(payload, onToken) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.REACT_APP_OPENAI_API_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let fullText = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split("\n").filter(line => line.trim().startsWith("data:"));

    for (const line of lines) {
      const jsonStr = line.replace("data: ", "").trim();

      if (jsonStr === "[DONE]") return fullText;

      try {
        const parsed = JSON.parse(jsonStr);
        const content = parsed.choices?.[0]?.delta?.content || "";
        if (content) {
          fullText += content;
          if (onToken) onToken(content); // Send token to frontend immediately
        }
      } catch (err) {
        console.error("❌ Error parsing OpenAI stream", err);
      }
    }
  }

  return fullText;
}
