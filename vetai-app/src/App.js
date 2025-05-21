import React, { useState, useEffect, useRef, useCallback } from 'react';
import { generateConversationTitle } from './OpenAI';
import { getOpenAIStream } from './OpenAI';
import { auth } from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import AuthForm from './components/AuthForm';
import Sidebar from './components/Sidebar';
import './App.css';
import { db } from './firebase';
import { collection, doc, getDocs, getDoc, setDoc, Timestamp, query, orderBy, onSnapshot } from 'firebase/firestore';
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

  const inputRef = useRef(null);
  const chatEndRef = useRef(null);

  // Function to load user's global memory
  const loadGlobalMemory = async (userId) => {
    try {
      const profileRef = doc(db, 'users', userId, 'profile', 'memory');
      const profileSnap = await getDoc(profileRef);
      const loadedMemory = profileSnap.exists() ? profileSnap.data() : {};
      console.log("🧠 Loaded Global Memory:", loadedMemory);
      setGlobalMemory(loadedMemory);
      return loadedMemory;
    } catch (error) {
      console.error("Error loading global memory:", error);
      return {};
    }
  };

  // Function to load user's conversations
  const loadConversations = async (userId) => {
    try {
      const convCol = collection(db, 'users', userId, 'conversations');
      const convQuery = query(convCol, orderBy('updatedAt', 'desc'));
      const convSnap = await getDocs(convQuery);
      
      const loadedConversations = convSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      console.log("📝 Loaded Conversations:", loadedConversations);
      setConversations(loadedConversations);

      // Set active conversation if none is selected
      if (!activeConversationId && loadedConversations.length > 0) {
        const mostRecent = loadedConversations[0];
        setActiveConversationId(mostRecent.id);
        setMessages(mostRecent.messages || []);
        setMemory(mostRecent.memory || {});
      }

      return loadedConversations;
    } catch (error) {
      console.error("Error loading conversations:", error);
      return [];
    }
  };

  // Effect for loading initial data
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        console.log("👤 User logged in:", firebaseUser.uid);
        setUser(firebaseUser);
        setLoading(true);

        try {
          // Set up real-time listener for global memory
          const profileRef = doc(db, 'users', firebaseUser.uid, 'profile', 'memory');
          const unsubscribeMemory = onSnapshot(profileRef, (snapshot) => {
            const loadedMemory = snapshot.exists() ? snapshot.data() : {};
            console.log("🧠 Real-time Global Memory Update:", loadedMemory);
            setGlobalMemory(loadedMemory);
          });

          // Set up real-time listener for conversations
          const convCol = collection(db, 'users', firebaseUser.uid, 'conversations');
          const convQuery = query(convCol, orderBy('updatedAt', 'desc'));
          const unsubscribeConv = onSnapshot(convQuery, (snapshot) => {
            const loadedConversations = snapshot.docs.map(doc => ({
              id: doc.id,
              ...doc.data()
            }));
            console.log("📝 Real-time Conversations Update:", loadedConversations);
            setConversations(loadedConversations);

            // Set active conversation if none is selected
            if (!activeConversationId && loadedConversations.length > 0) {
              const mostRecent = loadedConversations[0];
              setActiveConversationId(mostRecent.id);
              setMessages(mostRecent.messages || []);
              setMemory(mostRecent.memory || {});
            }
          });

          return () => {
            unsubscribeMemory();
            unsubscribeConv();
          };
        } catch (error) {
          console.error("Error in initial data load:", error);
        } finally {
          setLoading(false);
        }
      } else {
        console.log("👤 User logged out");
        // Clear all state when user logs out
        setUser(null);
        setConversations([]);
        setActiveConversationId(null);
        setGlobalMemory({});
        setMessages([]);
        setMemory({});
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // Effect for handling conversation changes
  useEffect(() => {
    if (!user?.uid || !activeConversationId) return;

    console.log("🔄 Setting up listener for conversation:", activeConversationId);
    
    const convRef = doc(db, 'users', user.uid, 'conversations', activeConversationId);
    const unsubscribe = onSnapshot(convRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        console.log("📥 Received conversation update:", data);
        
        setMessages(data.messages || []);
        setMemory(data.memory || {});
        
        setConversations(prev => 
          prev.map(conv => 
            conv.id === activeConversationId 
              ? { ...conv, ...data }
              : conv
          )
        );
      }
    });

    return () => {
      console.log("🔄 Cleaning up conversation listener");
      unsubscribe();
    };
  }, [user?.uid, activeConversationId]);

  // Function to update global memory
  const updateGlobalMemory = async (newFacts) => {
    if (!user?.uid || !newFacts || Object.keys(newFacts).length === 0) return;

    try {
      const profileRef = doc(db, 'users', user.uid, 'profile', 'memory');
      const currentMemorySnap = await getDoc(profileRef);
      const currentMemory = currentMemorySnap.exists() ? currentMemorySnap.data() : {};
      
      // Merge new facts with existing memory
      const updatedGlobalMemory = { ...currentMemory, ...newFacts };
      console.log("🧠 Updating Global Memory:", {
        current: currentMemory,
        new: newFacts,
        merged: updatedGlobalMemory
      });

      // Save to Firebase with merge option
      await setDoc(profileRef, updatedGlobalMemory, { merge: true });
      
      // Update local state
      setGlobalMemory(updatedGlobalMemory);
    } catch (error) {
      console.error("Error updating global memory:", error);
    }
  };

  const handleNewConversation = async () => {
    if (!user?.uid) return;

    try {
      const convCol = collection(db, 'users', user.uid, 'conversations');
      const newConvDoc = doc(convCol);
      const now = Timestamp.now();
      const newConv = {
        messages: [],
        memory: {},
        createdAt: now,
        updatedAt: now,
        title: "New Conversation",
        lastMessage: ''
      };

      await setDoc(newConvDoc, newConv);
      const createdConv = { id: newConvDoc.id, ...newConv };
      
      setActiveConversationId(createdConv.id);
      setMessages([]);
      setMemory({});
      setConversations(prev => [createdConv, ...prev]);

      console.log("📝 Created new conversation:", createdConv);
    } catch (error) {
      console.error("Error creating conversation:", error);
    }
  };

  const handleLoadConversation = async (convId) => {
    if (!user?.uid || convId === activeConversationId) return;

    try {
      const convRef = doc(db, 'users', user.uid, 'conversations', convId);
      const convSnap = await getDoc(convRef);

      if (convSnap.exists()) {
        const data = { id: convId, ...convSnap.data() };
        console.log("📝 Loading conversation:", data);
        
        setMessages(data.messages || []);
        setMemory(data.memory || {});
        setActiveConversationId(convId);
      }
    } catch (error) {
      console.error("Error loading conversation:", error);
    }
  };

  // Effect for auto-scrolling
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, typingAIMessage]);

  // Effect for input focus
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, [user, messages]);

  // Effect for saving on unload
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (messages.length > 0 && user?.uid && activeConversationId) {
        void saveToFirebase(messages, memory);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [messages, memory, user?.uid, activeConversationId]);

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

  const detectMemory = async (text) => {
    const updatedMemory = { ...memory };

    if (text.toLowerCase().includes("my name is")) {
      const name = text.split("my name is")[1].trim().split(" ")[0];
      updatedMemory.name = name;
    }

    if (JSON.stringify(updatedMemory) !== JSON.stringify(memory)) {
      setMemory(updatedMemory);
      await saveToFirebase(messages, updatedMemory);
    }
  };

  const detectGlobalMemory = async (text) => {
    try {
      const prompt = `
You are a memory extraction agent. Analyze the following message and extract any useful facts about the user.
Focus on these categories:
1. Personal Info: name, age, birthday, location, etc.
2. Military Info: rank, branch, unit, deployment history, etc.
3. Family: spouse, children, relatives, etc.
4. Career: job, education, skills, etc.
5. Financial: goals, income, expenses, investments, etc.
6. Health: conditions, medications, concerns, etc.
7. Preferences: interests, hobbies, likes/dislikes, etc.
8. Goals: short-term and long-term objectives

Message:
"""
${text}
"""

Return ONLY a JSON object with the extracted facts. Only include clearly stated facts, never assume or infer. If no new facts are found, return empty object {}.
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

      // Only update memory if new facts were found
      if (Object.keys(extracted).length > 0) {
        const updatedGlobalMemory = { ...globalMemory, ...extracted };
        setGlobalMemory(updatedGlobalMemory);
        console.log("🧠 Updated Global Memory:", updatedGlobalMemory);

        if (user) {
          const profileRef = doc(db, 'users', user.uid, 'profile', 'memory');
          await setDoc(profileRef, updatedGlobalMemory, { merge: true });
        }
      }
    } catch (err) {
      console.error("Error extracting global memory:", err);
    }
  };

  // Function to save conversation to Firebase
  const saveToFirebase = async (messages, memory, title = null) => {
    if (!user?.uid || !activeConversationId || !db) {
      console.error('Missing required parameters for saving to Firebase:', {
        userId: user?.uid,
        conversationId: activeConversationId,
        dbInitialized: !!db
      });
      return false;
    }

    try {
      const now = Timestamp.now();
      const convRef = doc(db, 'users', user.uid, 'conversations', activeConversationId);
      
      // If no title is provided, try to generate one for new conversations
      let updatedTitle = title;
      if (!title && messages.length > 0) {
        try {
          updatedTitle = await generateConversationTitle(messages);
        } catch (error) {
          console.error('Error generating title:', error);
          updatedTitle = "New Conversation";
        }
      }
      
      const conversationData = {
        messages: messages || [],
        memory: memory || {},
        updatedAt: now,
        title: updatedTitle || conversations.find(c => c.id === activeConversationId)?.title || "New Conversation",
        lastMessage: messages?.[messages.length - 1]?.content || ''
      };

      console.log("💾 Saving conversation data:", {
        conversationId: activeConversationId,
        messageCount: messages.length,
        memoryKeys: Object.keys(memory),
        title: conversationData.title
      });

      await setDoc(convRef, conversationData, { merge: true });
      
      // Update conversations list in state
      setConversations(prev => 
        prev.map(conv => 
          conv.id === activeConversationId 
            ? { ...conv, ...conversationData }
            : conv
        )
      );
      
      return true;
    } catch (error) {
      console.error('Error saving to Firebase:', error);
      return false;
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() || sending) return;

    const userMessage = { role: 'user', content: input.trim() };
    const updatedMessages = [...messages, userMessage];
    
    setInput('');
    setSending(true);
    setMessages(updatedMessages);

    try {
      // Save the user's message immediately
      await saveToFirebase(updatedMessages, memory);

      // Process memory updates
      await detectMemory(input);
      await detectGlobalMemory(input);

      // Prepare system prompt with memory context
      const systemPrompt = `You are VetAI, a helpful assistant focused on supporting veterans.

IMPORTANT - Memory System:
1. Global Memory (Facts known about the user across all conversations):
${JSON.stringify(globalMemory, null, 2)}

2. Current Conversation Memory (Context specific to this chat):
${JSON.stringify(memory, null, 2)}

Instructions for using memory:
1. ALWAYS reference relevant facts from memory when responding
2. If you notice any contradictions between global and conversation memory, prioritize the most recent information
3. Show you remember previous interactions by referencing relevant details
4. If the user mentions something that contradicts or updates existing memory, note it in your response

When you answer:
1. Format your response to be clear and easy to read using:
   - Headings (## Summary, ### Steps, etc.)
   - Bullet points and numbered lists
   - Short, clear paragraphs
   - Examples when helpful

2. If relevant, include a visual chart by appending a JSON object in a separate message after your main response.

Remember:
- Be personable and reference past conversations
- Use military context when appropriate
- Keep responses concise but thorough
- Help with financial, military, or life advice using their memory`.trim();

      const messagesForOpenAI = [
        { role: "system", content: systemPrompt },
        ...updatedMessages,
      ];

      setIsTyping(true);
      setTypingAIMessage("");

      let streamedMessage = "";
      let memoryUpdate = {};

      for await (const chunk of getOpenAIStream(messagesForOpenAI)) {
        // Check if the chunk contains a complete JSON object at the end
        const jsonMatch = chunk.match(/\{[\s\S]*\}$/);
        if (jsonMatch) {
          try {
            memoryUpdate = JSON.parse(jsonMatch[0]);
            // Remove the JSON from the displayed message
            streamedMessage = chunk.slice(0, jsonMatch.index).trim();
          } catch (e) {
            streamedMessage = chunk;
          }
        } else {
          streamedMessage = chunk;
        }
        setTypingAIMessage(streamedMessage);
      }

      setIsTyping(false);
      setTypingAIMessage("");

      // Update memory if new facts were found
      if (Object.keys(memoryUpdate).length > 0) {
        const newMemory = { ...memory, ...memoryUpdate };
        setMemory(newMemory);
        await updateGlobalMemory(memoryUpdate);
      }

      // Save final conversation state with AI response
      const allMessages = [...updatedMessages, { role: "assistant", content: streamedMessage }];
      await saveToFirebase(allMessages, { ...memory, ...memoryUpdate });
      setMessages(allMessages);

    } catch (error) {
      console.error('Error sending message:', error);
      const errorMessage = {
        role: "assistant",
        content: "I apologize, but I encountered an error while processing your request. Please try again."
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsTyping(false);
      setSending(false);
      setTypingAIMessage("");
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
            onSelectConversation={handleLoadConversation}
            onNewChat={handleNewConversation}
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
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !sending && input.trim()) {
                    e.preventDefault();
                    handleSendMessage(e);
                  }
                }}
                placeholder="Type your message..."
                disabled={sending}
              />
              <button 
                onClick={handleSendMessage}
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