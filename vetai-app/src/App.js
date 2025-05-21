import React, { useState, useEffect, useRef } from 'react';
import { generateConversationTitle } from './OpenAI';
import { getOpenAIStream } from './OpenAI';
import { auth } from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import AuthForm from './components/AuthForm';
import Sidebar from './components/Sidebar';
import './App.css';
import { db } from './firebase';
import { collection, doc, setDoc, getDoc } from 'firebase/firestore';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Chart } from "react-google-charts";

// Utility function: Extract JSON object at the end of AI response string
const extractMemoryFromResponse = (text) => {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}$/); // match JSON at end
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    console.error("Failed to parse JSON memory from AI response", e);
  }
  return {};
};


function App() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [memory, setMemory] = useState({});
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [sending, setSending] = useState(false);
  const [typingAIMessage, setTypingAIMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [globalMemory, setGlobalMemory] = useState({});
  const handleLogout = async () => {
  try {
    await signOut(auth);
    setUser(null);
  } catch (error) {
    console.error("Logout failed:", error);
  }
};
  const stripTrailingJSON = (text) => {
  const jsonMatch = text.match(/\{[\s\S]*\}$/);
  if (jsonMatch) {
    return text.slice(0, jsonMatch.index).trim();
  }
  return text;
};



  const inputRef = useRef(null);
  const chatEndRef = useRef(null);
  // Try to parse chart JSON from message content
const parseChartFromContent = (content) => {
  const jsonMatch = content.match(/\{[\s\S]*\}$/);
  if (!jsonMatch) return null;

  try {
    const chartData = JSON.parse(jsonMatch[0]);
    if (chartData.type && Array.isArray(chartData.data)) {
      return chartData;
    }
  } catch {
    return null;
  }
  return null;
};


  useEffect(() => {
  if (chatEndRef.current) {
    chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }
}, [messages, typingAIMessage]);


  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, [user, messages]);

  const createNewConversation = async (uid) => {
    const convCol = collection(db, 'users', uid, 'conversations');
    const newConvDoc = doc(convCol);
    const newConv = {
      messages: [],
      memory: {},
      createdAt: new Date(),
      updatedAt: new Date(),
      title: "New Conversation"
    };
    await setDoc(newConvDoc, newConv);
    setConversations(prev => [{ id: newConvDoc.id, ...newConv }, ...prev]);
    setActiveConversationId(newConvDoc.id);
    setMessages([]);
    setMemory({});
  };

useEffect(() => {
  setLoading(true);
  // Set up Firebase auth listener
  const unsubscribe = auth.onAuthStateChanged(async (firebaseUser) => {
    if (firebaseUser) {
      setUser(firebaseUser);
      
      try {
        // Load user's conversations
        const convCol = collection(db, 'users', firebaseUser.uid, 'conversations');
        const convSnap = await getDoc(doc(convCol));
        
        if (convSnap.exists()) {
          const convs = convSnap.data();
          setConversations(Object.entries(convs).map(([id, data]) => ({
            id,
            ...data
          })));
        } else {
          // Create initial conversation
          const newConv = {
            id: 'default-conversation',
            messages: [],
            memory: {},
            createdAt: new Date(),
            updatedAt: new Date(),
            title: "New Conversation"
          };
          setConversations([newConv]);
        }
        
        setActiveConversationId('default-conversation');
        setMessages([]);
        setMemory({});
        setGlobalMemory({});
      } catch (e) {
        console.error("Error loading conversations:", e);
      }
    } else {
      setUser(null);
      setConversations([]);
      setActiveConversationId(null);
    }
    setLoading(false);
  });

  return () => unsubscribe();
}, []);

  useEffect(() => {
    const saveConversation = async () => {
      if (auth.currentUser && activeConversationId && messages.length > 0) {
        const convRef = doc(db, 'users', auth.currentUser.uid, 'conversations', activeConversationId);
        await setDoc(convRef, { messages, memory, updatedAt: new Date() }, { merge: true });
      }
    };

    window.addEventListener('beforeunload', saveConversation);
    return () => window.removeEventListener('beforeunload', saveConversation);
  }, [messages, memory, activeConversationId]);


  const loadConversation = async (convId) => {
    if (!user || convId === activeConversationId) return;

    const convRef = doc(db, 'users', user.uid, 'conversations', convId);
    const convSnap = await getDoc(convRef);

    if (convSnap.exists()) {
      const data = convSnap.data();
      setActiveConversationId(convId);
      setMessages(data.messages || []);
      setMemory(data.memory || {});
    } else {
      const conv = conversations.find(c => c.id === convId);
      if (conv) {
        setActiveConversationId(convId);
        setMessages(conv.messages || []);
        setMemory(conv.memory || {});
      }
    }
  };

  const detectMemory = async (text) => {
    const updatedMemory = { ...memory };

    if (text.toLowerCase().includes("my name is")) {
      const name = text.split("my name is")[1].trim().split(" ")[0];
      updatedMemory.name = name;
    }

    if (JSON.stringify(updatedMemory) !== JSON.stringify(memory)) {
      setMemory(updatedMemory);
      if (activeConversationId && user) {
        await setDoc(doc(db, 'users', user.uid, 'conversations', activeConversationId), {
          memory: updatedMemory,
          updatedAt: new Date()
        }, { merge: true });
      }
    }
  };

const detectGlobalMemory = async (text) => {
  try {
    const prompt = `
You are a memory extraction agent. The following message was written by a user.
Extract any useful long-term memory facts (like name, birthday, rank, financial goals, interests, family, location, etc) as a flat JSON object. Only include facts that are clearly stated. Do not make up anything.

Message:
"""
${text}
"""

Return only a valid JSON object.
    `.trim();

    const messagesForMemory = [
      { role: "system", content: prompt },
    ];

    let result = "";
    for await (const chunk of getOpenAIStream(messagesForMemory)) {
      result += chunk;
    }

    // Remove markdown code block markers if they exist
    const cleanJsonString = result.trim().replace(/^```json\s*/, '').replace(/\s*```$/, '');

    const extracted = JSON.parse(cleanJsonString);

    const updatedGlobalMemory = { ...globalMemory, ...extracted };
    setGlobalMemory(updatedGlobalMemory);
    console.log("🧠 Updated Global Memory:", updatedGlobalMemory);

    if (user) {
      const profileRef = doc(db, 'users', user.uid, 'profile', 'memory');
      await setDoc(profileRef, updatedGlobalMemory, { merge: true });
    }
  } catch (err) {
    console.error("Error extracting global memory:", err);
  }
};

const sendMessage = async () => {
  if (!input.trim() || sending) return;

  setSending(true);
  try {
    const newMessage = { role: "user", content: input };
    const updatedMessages = [...messages, newMessage];
    setMessages(updatedMessages);
    setInput("");

    // Your AI prompt including memory (local + global)
    const systemPrompt = `
You are VetAI, a smart, kind, funny, and deeply knowledgeable assistant for U.S. military personnel.

Use the following memory about the user to personalize your answers:

Long-term memory:
${JSON.stringify(globalMemory, null, 2)}

Conversation-specific memory:
${JSON.stringify(memory, null, 2)}

When you answer, always format your response to be **clear and easy to read**. Use:
- Headings (like "## Summary", "### Steps", etc.)
- Bullet points, numbered lists, and exmples where appropriate
- Short paragraphs with explanations
- Examples if it helps clarify

If a visual (chart, graph, etc.) would help, append ONLY a raw JSON object **after all your text**, on a new line.

DO NOT explain, describe, or preface the JSON in any way. DO NOT say "Here's a chart…" or "Below is JSON…". Just end with the JSON like this:

{
  "type": "BarChart",
  "data": [
    ["Category", "Amount"],
    ["Rent", 1200],
    ["Food", 600],
    ["Savings", 300]
  ],
  "options": {
    "title": "Monthly Expenses Breakdown"
  }
}

✅ Final notes:
- NO explanations before or after the JSON.
- End your reply with the JSON only.

After answering the user, check if any personal facts about the user have changed or new facts were shared (like age, location, marital status, goals, etc.).
If so, return a JSON object with only those updated facts.
If nothing new, return an empty JSON object "{}".

First provide your structured and clear answer, then **append** the JSON object of updated facts at the end.

Be concise but thorough. Help the user with financial, military, or life advice using their memory where relevant.
`.trim();

    const messagesForOpenAI = [
      { role: "system", content: systemPrompt },
      ...updatedMessages,
    ];

    setIsTyping(true);
    setTypingAIMessage("");

    let streamedMessage = "";

    for await (const chunk of getOpenAIStream(messagesForOpenAI)) {
      streamedMessage += chunk;
      setTypingAIMessage(streamedMessage);
    }

    setIsTyping(false);
    setTypingAIMessage("");

    // Extract updated memory facts from AI response
    const updatedFacts = extractMemoryFromResponse(streamedMessage);

    if (Object.keys(updatedFacts).length > 0) {
      console.log("📥 New Memory Detected:", updatedFacts);

      // Merge updated facts into local conversation memory
      const newMemory = { ...memory, ...updatedFacts };
      setMemory(newMemory);

      // Merge updated facts into global memory
      const newGlobalMemory = { ...globalMemory, ...updatedFacts };
      setGlobalMemory(newGlobalMemory);

      // Save updated global memory to Firestore user profile
      if (user) {
        const profileRef = doc(db, 'users', user.uid, 'profile', 'memory');
        await setDoc(profileRef, newGlobalMemory, { merge: true });
        console.log("🧠 Firebase global memory updated");
      }
    }

    // Remove JSON memory from AI message before showing it in chat UI
    const cleanedResponse = streamedMessage.replace(/\{[\s\S]*\}$/, '').trim();

    // Add AI message without memory JSON appended to messages
    const allMessages = [...updatedMessages, { role: "assistant", content: cleanedResponse }];
    setMessages(allMessages);

    // Save conversation with updated messages and updated local memory
    if (user && activeConversationId) {
      const convRef = doc(db, "users", user.uid, "conversations", activeConversationId);
      await setDoc(
        convRef,
        {
          messages: allMessages,
          memory: { ...memory, ...updatedFacts },
          updatedAt: new Date(),
        },
        { merge: true }
      );
    }

    // Update conversation title if needed (your existing code)
    const currentConv = conversations.find((c) => c.id === activeConversationId);
    const needsTitle = !currentConv?.title || currentConv.title === "New Conversation" || currentConv.title === "Untitled";

    if (needsTitle && updatedMessages.length >= 2) {
      const newTitle = await generateConversationTitle(updatedMessages);
      await setDoc(doc(db, "users", user.uid, "conversations", activeConversationId), { title: newTitle }, { merge: true });

      setConversations((prev) =>
        prev.map((conv) =>
          conv.id === activeConversationId ? { ...conv, title: newTitle } : conv
        )
      );
    }

    // Also update conversation memory state after merging
    setMemory((prevMemory) => ({ ...prevMemory, ...updatedFacts }));

    // Optionally detect any quick memory in the AI message (your existing function)
    await detectMemory(streamedMessage);
    detectGlobalMemory(input);

  } catch (e) {
    console.error(e);
  } finally {
    setSending(false);
    if (inputRef.current) inputRef.current.focus();
  }
};

  if (loading) {
    return (
      <div className="App">
        <h1>VetAI 💬</h1>
        <p>Loading your data...</p>
        <div className="spinner"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="App">
        <h1>VetAI 💬</h1>
        <AuthForm onAuthSuccess={() => setUser(auth.currentUser)} />
      </div>
    );
  }

return (
  <div className="app">
    {!user ? (
      <AuthForm />
    ) : (
      <div className="app-container">
        <Sidebar
          conversations={conversations}
          onSelectConversation={loadConversation}
          onNewChat={() => createNewConversation(user.uid)}
          selectedId={activeConversationId}
          isLoading={loading}
          onLogout={handleLogout}
        />
        <div className="main-content">
          <div className="chat-container">
            {messages.map((message, index) => {
              const chartData = parseChartFromContent(message.content);
              const cleanedContent = message.role === 'assistant'
                ? stripTrailingJSON(message.content)
                : message.content;

              return (
                <div
                  key={index}
                  className={`message ${message.role}`}
                >
                  <strong>{message.role === 'user' ? 'You' : 'VetAI'}:</strong>
                  <div className="message-content">
                    {message.role === 'assistant' ? (
                      <>
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {cleanedContent || ''}
                        </ReactMarkdown>
                        {chartData && (
                          <div className="chart-container">
                            <Chart
                              chartType={chartData.type}
                              data={chartData.data}
                              options={chartData.options || {}}
                              width="100%"
                              height="300px"
                            />
                          </div>
                        )}
                      </>
                    ) : (
                      cleanedContent
                    )}
                  </div>
                </div>
              );
            })}
            {isTyping && (
              <div className="message ai">
                <div className="message-content">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {typingAIMessage || ''}
                  </ReactMarkdown>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
          <div className="input-container">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && !sending && input.trim() && sendMessage()}
              placeholder="Type your message..."
              disabled={sending}
            />
            <button 
              onClick={sendMessage} 
              disabled={sending || !input.trim()}
            >
              {sending ? 'Sending...' : 'Send'}
            </button>
          </div>
        </div>
      </div>
    )}
  </div>
);
}

export default App;