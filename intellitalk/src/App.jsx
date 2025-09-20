import React, { useState, useRef, useEffect } from 'react'
import { URL } from './constants'
import './App.css'
import Answer from './components/Answers'

// Add this helper for image generation (mock API or your real endpoint)
async function generateImage({ prompt }) {
  // For demonstration, return a placeholder image with the main prompt
  // Replace this with your real API call for actual image generation
  return `https://placehold.co/512x512/181f2a/00ffe7?text=${encodeURIComponent(prompt || 'AI Image')}`;
}

// Helper for random chat names
const CHAT_NAMES = [
  "Curious Conversation", "Tech Talk", "Brainstorm", "Quick Q&A", "Deep Dive",
  "Fun Facts", "Learning Lane", "Problem Solver", "Idea Exchange", "Friendly Chat"
];
function getRandomChatName() {
  return CHAT_NAMES[Math.floor(Math.random() * CHAT_NAMES.length)];
}

function detectEmotion(text) {
  const lower = text.toLowerCase();
  if (/happy|great|awesome|good|fantastic|joy|excited|yay|love/.test(lower)) return 'happy';
  if (/sad|unhappy|depressed|down|cry|upset|bad|unfortunate|disappointed/.test(lower)) return 'sad';
  if (/angry|mad|furious|annoyed|irritated|hate|rage/.test(lower)) return 'angry';
  if (/confused|lost|unclear|don't understand|puzzled|stuck|help/.test(lower)) return 'confused';
  return 'neutral';
}

function getEmpatheticPrefix(emotion) {
  switch (emotion) {
    case 'happy':
      return "😊 I'm glad to hear that! ";
    case 'sad':
      return "😔 I'm here for you. ";
    case 'angry':
      return "😠 I understand your frustration. ";
    case 'confused':
      return "🤔 Let me help clarify things. ";
    default:
      return "";
  }
}

function getExplanationStyle(emotion) {
  if (emotion === 'happy') return 'fun';
  if (emotion === 'sad') return 'serious';
  if (emotion === 'angry') return 'serious';
  if (emotion === 'confused') return 'technical';
  const styles = ['serious', 'fun', 'technical'];
  return styles[Math.floor(Math.random() * styles.length)];
}

function personalizeAIResponse(base, emotion, style, username, chatHistory) {
  let intro = '';
  if (style === 'fun') {
    intro = "🎉 Let's make this fun! ";
  } else if (style === 'technical') {
    intro = "🛠️ Here's a technical breakdown: ";
  } else {
    intro = "Here's what you need to know: ";
  }
  let outro = '';
  if (emotion === 'confused') {
    outro = "\nIf anything's still unclear, just ask me again!";
  } else if (emotion === 'sad') {
    outro = "\nRemember, I'm always here to help you out.";
  } else if (emotion === 'happy') {
    outro = "\nGlad you're feeling good! Anything else I can help with?";
  } else if (emotion === 'angry') {
    outro = "\nLet's tackle this together!";
  } else {
    outro = "\nLet me know if you want a different kind of explanation.";
  }
  let memory = '';
  if (chatHistory.length > 2) {
    memory = `\n(We've talked about similar things before, like: "${chatHistory[chatHistory.length-2].content}")\n`;
  }
  return `${intro}${base}${memory}${outro}`;
}

// Summarize mentions of a keyword in a chat
function summarizeMentions(chat, keyword) {
  const mentions = chat.messages.filter(
    msg => msg.content && msg.content.toLowerCase().includes(keyword.toLowerCase())
  );
  if (mentions.length === 0) return `No mentions of "${keyword}" found in this chat.`;
  let summary = `Mentions of "${keyword}":\n`;
  mentions.forEach((msg, idx) => {
    summary += `- ${msg.role === 'user' ? 'You' : 'AI'}: ${msg.content.slice(0, 100)}${msg.content.length > 100 ? '...' : ''}\n`;
  });
  return summary;
}

// --- Voice AI: Speech-to-Text and Text-to-Speech helpers ---
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition || null;
const synth = window.speechSynthesis;

function speakText(text, emotion = 'neutral') {
  if (!synth) return;
  const utter = new window.SpeechSynthesisUtterance(text);
  // Adjust voice parameters based on emotion
  if (emotion === 'happy') {
    utter.rate = 1.1;
    utter.pitch = 1.2;
  } else if (emotion === 'sad') {
    utter.rate = 0.95;
    utter.pitch = 0.9;
  } else if (emotion === 'angry') {
    utter.rate = 1.15;
    utter.pitch = 1.05;
    utter.volume = 1;
  } else if (emotion === 'confused') {
    utter.rate = 1;
    utter.pitch = 1.1;
  }
  utter.volume = 1;
  synth.cancel(); // Stop any previous speech
  synth.speak(utter);
}

function App() {
  const [question, setQuestion] = useState('');
  const [chats, setChats] = useState([]); // [{name, messages: [{role, content, emotion}], created}]
  const [currentChatIdx, setCurrentChatIdx] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [darkMode, setDarkMode] = useState(true);
  const [username, setUsername] = useState('');
  const [showLogin, setShowLogin] = useState(true);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchSummary, setSearchSummary] = useState('');
  const [imageRequest, setImageRequest] = useState({
    prompt: '',
    style: 'realistic',
    background: '',
    mood: '',
  });
  const [showImageModal, setShowImageModal] = useState(false);
  const [generatedImage, setGeneratedImage] = useState('');
  const [imageLoading, setImageLoading] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef(null);
  const chatEndRef = useRef(null);

  // --- Theme Button Fix ---
  // Ensure darkMode is applied to both sidebar and main area
  const sidebarClass = `sidebar-glassmorph flex flex-col p-5 w-72 min-w-[220px] max-w-xs transition-all duration-300 ${darkMode ? '' : 'sidebar-light'}`;
  const mainClass = `flex-1 flex flex-col relative overflow-hidden ${darkMode ? '' : 'main-light'}`;

  // --- Voice Mode: Speech-to-Text ---
  useEffect(() => {
    if (!SpeechRecognition) return;
    if (!voiceMode) {
      if (recognitionRef.current) {
        recognitionRef.current.onresult = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
      }
      setIsListening(false);
      return;
    }
    if (!recognitionRef.current) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'en-US';
    }
    const recognition = recognitionRef.current;
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setQuestion(transcript);
      setIsListening(false);
      // Automatically send the question after speech
      setTimeout(() => {
        askQuestion(transcript, true);
      }, 300);
    };
    recognition.onend = () => {
      setIsListening(false);
    };
    recognition.onerror = () => {
      setIsListening(false);
    };
    // Start listening if in voice mode
    if (voiceMode && !isListening) {
      recognition.start();
      setIsListening(true);
    }
    // Cleanup
    return () => {
      recognition.onresult = null;
      recognition.onend = null;
      recognition.onerror = null;
      recognition.stop();
    };
    // eslint-disable-next-line
  }, [voiceMode]);

  // --- Start a new chat ---
  const startNewChat = () => {
    const name = getRandomChatName();
    setChats(prev => {
      const newChats = [...prev, { name, messages: [], created: new Date() }];
      setCurrentChatIdx(newChats.length - 1);
      return newChats;
    });
    setSearchSummary('');
    setSearchKeyword('');
  };

  // On first load, start a chat
  useEffect(() => {
    if (chats.length === 0 && !showLogin) {
      startNewChat();
    }
    // eslint-disable-next-line
  }, [showLogin]);

  // Get current chat
  const currentChat = chats[currentChatIdx] || { name: '', messages: [] };

  // --- Main askQuestion logic, now supports voice input ---
  const askQuestion = async (overrideQuestion, isVoice = false) => {
    const q = typeof overrideQuestion === 'string' ? overrideQuestion : question;
    if (!q.trim() || loading) return;
    setLoading(true);
    setError('');
    setSearchSummary('');
    setSearchKeyword('');
    const emotion = detectEmotion(q);

    // Stop any previous speech immediately when a new command is given
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }

    // Add user message
    setChats(prev => {
      const updated = [...prev];
      const chat = { ...updated[currentChatIdx] };
      if (
        chat.messages.length > 0 &&
        chat.messages[chat.messages.length - 1].role === 'user' &&
        chat.messages[chat.messages.length - 1].content === q
      ) {
        setLoading(false);
        return prev;
      }
      chat.messages = [...chat.messages, { role: 'user', content: q, emotion }];
      updated[currentChatIdx] = chat;
      return updated;
    });

    // Special: Search for mentions if user asks for it
    if (/search the past conversation for mentions of "(.+?)"/i.test(q)) {
      const match = q.match(/search the past conversation for mentions of "(.+?)"/i);
      if (match) {
        const keyword = match[1];
        setTimeout(() => {
          setSearchKeyword(keyword);
          setSearchSummary(summarizeMentions(currentChat, keyword));
          setLoading(false);
        }, 500);
        setQuestion('');
        return;
      }
    }

    // Normal AI response
    const payload = {
      "contents": [
        {
          "parts": [
            {
              "text": q
            }
          ]
        }
      ]
    }
    try {
      let response = await fetch(URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      response = await response.json();
      let datString = response.candidates[0].content.parts[0].text;
      datString = datString.split("*").map(item => item.trim()).join('\n');
      const style = getExplanationStyle(emotion);
      const personalized = personalizeAIResponse(
        getEmpatheticPrefix(emotion) + datString,
        emotion,
        style,
        username,
        currentChat.messages
      );
      setChats(prev => {
        const updated = [...prev];
        const chat = { ...updated[currentChatIdx] };
        chat.messages = [...chat.messages, { role: 'ai', content: personalized, emotion }];
        updated[currentChatIdx] = chat;
        return updated;
      });
      setQuestion('');
      setTimeout(() => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);

      // --- Text-to-Speech for AI reply in voice mode ---
      if (voiceMode || isVoice) {
        speakText(personalized, emotion);
      }
    } catch (err) {
      setError('Something went wrong. Please try again.');
    }
    setLoading(false);
  };

  const handleInputKeyDown = (e) => {
    if (e.key === 'Enter' && !loading) {
      askQuestion();
    }
  };

  // Sidebar: show all chats with names
  const handleChatClick = (idx) => {
    setCurrentChatIdx(idx);
    setSearchSummary('');
    setSearchKeyword('');
  };

  function exportChat(chat, username) {
    if (!chat || !chat.messages || !chat.messages.length) return;
    const text = chat.messages.map(
      msg => `${msg.role === 'user' ? (username || 'You') : 'AI'}: ${msg.content}`
    ).join('\n\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(chat.name || 'chat').replace(/\s+/g, '_')}_history.txt`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    }, 0);
  }

  // Add this function to handle image generation
  const handleGenerateImage = async () => {
    setImageLoading(true);
    setGeneratedImage('');
    try {
      const url = await generateImage(imageRequest);
      setGeneratedImage(url);
    } catch (e) {
      setGeneratedImage('');
      alert('Image generation failed.');
    }
    setImageLoading(false);
  };

  useEffect(() => {
    if (!showImageModal) {
      setImageRequest({
        prompt: '',
        style: 'realistic',
        background: '',
        mood: '',
      });
      setGeneratedImage('');
      setImageLoading(false);
    }
  }, [showImageModal]);

  // --- Theme Button Fix: force re-render on darkMode change for sidebar/main ---
  useEffect(() => {}, [darkMode]);

  if (showLogin) {
    return (
      <div className={`flex items-center justify-center h-screen bg-gradient-to-br from-[#0f2027] via-[#2c5364] to-[#232526]`}>
        <div className="glassmorphism-panel p-10 rounded-3xl shadow-2xl flex flex-col items-center">
          <h2 className="text-3xl font-extrabold mb-6 neon-text">Welcome to IntelliTalk</h2>
          <input
            type="text"
            placeholder="Enter your name"
            className="neumorph-input w-64 mb-6"
            value={username}
            onChange={e => setUsername(e.target.value)}
          />
          <button
            className="neumorph-btn w-64"
            onClick={() => username.trim() && setShowLogin(false)}
          >
            Start Chatting
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`zinc-bg h-screen w-screen flex overflow-hidden relative ${darkMode ? 'dark' : 'light'}`}>
      {/* Sidebar */}
      <aside className={sidebarClass}>
        <div className="flex items-center justify-between mb-6">
          <div className="font-extrabold text-xl neon-text tracking-wide flex items-center gap-2">
            <span className="holo-icon">&#128187;</span>
            IntelliTalk
          </div>
          <button
            className="neumorph-btn-small"
            onClick={startNewChat}
            title="New Chat"
          >
            <span className="holo-icon">+</span>
          </button>
        </div>
        <ul className="flex-1 overflow-y-auto mb-4">
          {chats.map((chat, idx) => (
            <li
              key={idx}
              className={`sidebar-chat-item ${idx === currentChatIdx ? 'sidebar-chat-active' : ''}`}
              onClick={() => handleChatClick(idx)}
              title={chat.name}
            >
              <span className="holo-icon mr-2">&#128172;</span>
              {chat.name}
            </li>
          ))}
        </ul>
        <button
          className="neumorph-btn-glass mb-2"
          onClick={() => exportChat(currentChat, username)}
          disabled={!currentChat || !currentChat.messages || !currentChat.messages.length}
        >
          <span className="holo-icon">&#128190;</span> Export Chat
        </button>
        {/* <button
          className="neumorph-btn-glass mb-2"
          style={{background: 'linear-gradient(90deg, #ff5e5e 0%, #c53030 100%)', color: '#fff'}}
          onClick={() => {
            setChats([]);
            startNewChat();
          }}
        >
          <span className="holo-icon">&#128465;</span> Clear All
        </button> */}
        <button
          className="neumorph-btn-glass mb-2"
          style={{background: 'linear-gradient(90deg, #38bdf8 0%, #0ea5e9 100%)', color: '#fff'}}
          onClick={() => setShowImageModal(true)}
        >
          <span className="holo-icon">&#127912;</span> Create Image
        </button>
        <button
          className={`neumorph-btn-glass mb-2 ${voiceMode ? 'neon-btn' : ''}`}
          style={{background: voiceMode ? 'linear-gradient(90deg, #38ffb3 0%, #38bdf8 100%)' : undefined, color: '#232946'}}
          onClick={() => setVoiceMode(vm => !vm)}
        >
          <span className="holo-icon">&#127908;</span> {voiceMode ? (isListening ? "Listening..." : "Voice On") : "Voice Mode"}
        </button>
      </aside>

      {/* Main chat area */}
      <main className={mainClass}>
        <div className="chat-glassmorph flex-1 overflow-y-auto p-10 flex flex-col fade-in">
          <div className="max-w-2xl mx-auto w-full">
            <div className="text-3xl font-extrabold mb-6 neon-text-glow">{currentChat.name}</div>
            {currentChat.messages.length === 0 && (
              <div className="text-zinc-400 text-center mt-20">Start a conversation!</div>
            )}
            {searchSummary && (
              <div className="glassmorphism-panel p-4 mb-4 whitespace-pre-line text-[#232946] font-semibold">
                <b>Summary for "{searchKeyword}":</b>
                <br />
                {searchSummary}
              </div>
            )}
            {currentChat.messages.map((msg, idx) => (
              <div
                key={idx}
                id={`msg-${idx}`}
                className={`flex mb-6 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`chat-bubble-3d ${msg.role === 'user' ? 'bubble-user' : 'bubble-ai'} ${darkMode ? 'bubble-dark' : 'bubble-light'}`}
                >
                  {msg.role === 'ai'
                    ? <Answer ans={msg.content} />
                    : <span className="font-bold">
                        {msg.emotion && msg.emotion !== 'neutral' ? (
                          msg.emotion === 'happy' ? '😊 ' :
                          msg.emotion === 'sad' ? '😔 ' :
                          msg.emotion === 'angry' ? '😠 ' :
                          msg.emotion === 'confused' ? '🤔 ' : ''
                        ) : ''}
                        {username || 'You'}: 
                      </span>}{msg.role === 'user' ? msg.content : null}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start mb-4">
                <div className="chat-bubble-3d bubble-ai animate-pulse">
                  <span>Thinking...</span>
                </div>
              </div>
            )}
            {error && (
              <div className="text-red-400 py-2">{error}</div>
            )}
            <div ref={chatEndRef} />
          </div>
        </div>
        {/* Input area */}
        <div className="input-glassmorph w-full px-6 py-5 flex items-center border-t border-[#232946]">
          <input
            type="text"
            value={question}
            onChange={event => {
              setQuestion(event.target.value);
              if (voiceMode) setVoiceMode(false); // Switch to text mode if typing
            }}
            onKeyDown={handleInputKeyDown}
            className="neumorph-input flex-1 mr-4"
            placeholder={voiceMode ? (isListening ? "Listening..." : "Speak or type...") : 'Ask me anything'}
            disabled={loading}
            aria-label="Ask me anything"
            style={{fontWeight: 'bold'}}
          />
          <button
            onClick={() => askQuestion()}
            disabled={loading || !question.trim()}
            className="neumorph-btn neon-btn"
          >
            {loading ? "Asking..." : "Ask"}
          </button>
          {SpeechRecognition && (
            <button
              className={`ml-3 neumorph-btn-small ${voiceMode ? 'neon-btn' : ''}`}
              style={{background: voiceMode ? 'linear-gradient(90deg, #38ffb3 0%, #38bdf8 100%)' : undefined, color: '#232946'}}
              onClick={() => setVoiceMode(vm => !vm)}
              type="button"
              title={voiceMode ? "Disable Voice Mode" : "Enable Voice Mode"}
            >
              <span className="holo-icon">&#127908;</span>
            </button>
          )}
        </div>
      </main>

      {/* Image Modal */}
      {showImageModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
          <div className="glassmorphism-panel p-8 max-w-md w-full relative shadow-2xl">
            <button
              className="absolute top-2 right-3 text-2xl font-bold text-gray-400 hover:text-red-500"
              onClick={() => {
                setShowImageModal(false);
                setGeneratedImage('');
                setImageLoading(false);
              }}
              aria-label="Close"
            >×</button>
            <h2 className="text-xl font-bold mb-4 neon-text">Create a High-Resolution Image</h2>
            <div className="mb-2">
              <label className="block font-semibold mb-1">What do you want to see?</label>
              <input
                type="text"
                className="neumorph-input w-full"
                placeholder="Describe your subject (e.g., A cat playing chess)"
                value={imageRequest.prompt}
                onChange={e => setImageRequest(r => ({ ...r, prompt: e.target.value }))}
              />
            </div>
            <div className="mb-2">
              <label className="block font-semibold mb-1">Art Style</label>
              <select
                className="neumorph-input w-full"
                value={imageRequest.style}
                onChange={e => setImageRequest(r => ({ ...r, style: e.target.value }))}
              >
                <option value="realistic">Realistic</option>
                <option value="cartoon">Cartoon</option>
                <option value="anime">Anime</option>
                <option value="digital art">Digital Art</option>
                <option value="painting">Painting</option>
                <option value="3D render">3D Render</option>
              </select>
            </div>
            <div className="mb-2">
              <label className="block font-semibold mb-1">Background Details</label>
              <input
                type="text"
                className="neumorph-input w-full"
                placeholder="Describe the background"
                value={imageRequest.background}
                onChange={e => setImageRequest(r => ({ ...r, background: e.target.value }))}
              />
            </div>
            <div className="mb-4">
              <label className="block font-semibold mb-1">Mood/Theme</label>
              <input
                type="text"
                className="neumorph-input w-full"
                placeholder="e.g., cheerful, mysterious, epic"
                value={imageRequest.mood}
                onChange={e => setImageRequest(r => ({ ...r, mood: e.target.value }))}
              />
            </div>
            <div className="mb-4">
              <span className="text-xs text-gray-500">Aspect Ratio: <b>1:1 (square)</b></span>
            </div>
            <button
              className="neumorph-btn neon-btn w-full"
              onClick={handleGenerateImage}
              disabled={imageLoading || !imageRequest.prompt}
            >
              {imageLoading ? "Generating..." : "Generate Image"}
            </button>
            {generatedImage && (
              <div className="mt-6 text-center">
                <img
                  src={generatedImage}
                  alt="Generated"
                  className="mx-auto rounded-xl shadow-2xl border-4 border-neon"
                  style={{ width: 256, height: 256, objectFit: 'cover', aspectRatio: '1/1', boxShadow: '0 0 32px #38bdf8, 0 0 8px #fff inset' }}
                />
                <a
                  href={generatedImage}
                  download="intellitalk_image.png"
                  className="neumorph-btn neon-btn mt-3 inline-block"
                >
                  Download Image
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default App
