import { useEffect, useRef, useState } from 'react';
import { MessageCircle, X, Send, WifiOff } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { api, errorMessage } from '../lib/api';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  /** how the backend produced the answer: agent (tools) | rag | offline (no LLM) */
  mode?: 'agent' | 'rag' | 'offline';
  sources?: Array<{ source: string; page: number | null }>;
}

interface ChatResponse {
  response: string;
  mode: 'agent' | 'rag' | 'offline';
  sources: Array<{ source: string; page: number | null }>;
  tools_used: string[];
}

const GREETING: Record<'urban' | 'rural', string> = {
  urban: 'Hello! I am INDRA. Ask me about rainwater harvesting, flood-proofing your plot, or what summer will do to your water.',
  rural: 'Namaste! Main INDRA hoon. Kheti, paani, baarish aur garmi - kuch bhi poochhiye.',
};

export function AIChatbot() {
  const { colors, mode } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([{ role: 'assistant', content: GREETING.urban }]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // The greeting follows the active mode until the conversation starts.
  useEffect(() => {
    setMessages((prev) => (prev.length === 1 ? [{ role: 'assistant', content: GREETING[mode] }] : prev));
  }, [mode]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading, isOpen]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    const history = messages.slice(1).map(({ role, content }) => ({ role, content })).slice(-8);
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    setIsLoading(true);

    try {
      const data = await api<ChatResponse>(`/api/chatbot/${mode === 'urban' ? 'standard' : 'rural'}`, {
        method: 'POST',
        body: { message: text, history },
      });
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: data.response, mode: data.mode, sources: data.sources.slice(0, 2) },
      ]);
    } catch (error) {
      setMessages((prev) => [...prev, { role: 'assistant', content: errorMessage(error, 'Sorry, I could not answer that. Please try again.') }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          aria-label="Open INDRA assistant"
          className="rounded-full p-4 text-white shadow-lg hover:scale-110 transition-transform"
          style={{ backgroundColor: colors.primary }}
        >
          <MessageCircle className="w-6 h-6" />
        </button>
      )}

      {isOpen && (
        <div
          className="bg-white rounded-lg shadow-2xl w-[calc(100vw-3rem)] sm:w-96 flex flex-col overflow-hidden"
          role="dialog"
          aria-label="INDRA assistant"
        >
          <div className="p-4 text-white flex items-center justify-between" style={{ backgroundColor: colors.primary }}>
            <div className="flex items-center space-x-2">
              <MessageCircle className="w-5 h-5" />
              <span className="font-semibold">INDRA Assistant</span>
            </div>
            <button onClick={() => setIsOpen(false)} aria-label="Close" className="hover:opacity-80 transition-opacity">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="h-96 overflow-y-auto p-4 space-y-4 bg-gray-50">
            {messages.map((message, index) => (
              <div key={index} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] p-3 rounded-lg ${message.role === 'user' ? 'text-white' : 'bg-white border border-gray-200'}`}
                  style={message.role === 'user' ? { backgroundColor: colors.primary } : {}}
                >
                  <p className="text-sm whitespace-pre-line" style={{ color: message.role === 'user' ? '#ffffff' : '#000000' }}>
                    {message.content}
                  </p>
                  {message.mode === 'offline' && (
                    <p className="mt-2 flex items-center gap-1 text-[11px] text-amber-700">
                      <WifiOff className="w-3 h-3" /> AI model offline - answered from the knowledge base
                    </p>
                  )}
                  {message.sources && message.sources.length > 0 && (
                    <p className="mt-1 text-[11px] text-gray-500">
                      Sources: {message.sources.map((s) => `${s.source}${s.page ? ` p.${s.page}` : ''}`).join(', ')}
                    </p>
                  )}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start" aria-live="polite" aria-label="INDRA is typing">
                <div className="bg-white border border-gray-200 p-3 rounded-lg">
                  <div className="flex space-x-2">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]" />
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]" />
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <form
            className="p-4 border-t border-gray-200"
            onSubmit={(e) => {
              e.preventDefault();
              void handleSend();
            }}
          >
            <div className="flex space-x-2">
              <input
                type="text"
                value={input}
                maxLength={1500}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask me anything..."
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2"
              />
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                aria-label="Send"
                className="p-2 text-white rounded-lg disabled:opacity-50 hover:opacity-90 transition-opacity"
                style={{ backgroundColor: colors.primary }}
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
