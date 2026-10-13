import { useState, useRef, useEffect } from "react";
import toast from "react-hot-toast";
import axios from "axios";
import { askQuestion, getHistory, getDatasets, deleteSession } from "../services/api";
import ResultCard from "./ResultCard";
import UploadDataset from "./UploadDataset";
import { Bot, Database, Square, Send, Loader2, Menu, FileText, Mic, MicOff } from "lucide-react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

export default function ChatLayout({ projectId, sessionId, setSessionId, datasetId, setDatasetId, datasetRefreshKey, token, onSessionDeleted, setIsSidebarOpen }) {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [datasets, setDatasets] = useState([]);
  const [failedQuestion, setFailedQuestion] = useState(null); // for retry

  const [isExporting, setIsExporting] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef(null);

  const bottomRef = useRef(null);
  const chatRef = useRef(null);
  const abortControllerRef = useRef(null);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        setQuestion(transcript);
        setIsListening(false);
      };

      recognitionRef.current.onerror = (event) => {
        console.error("Speech recognition error:", event.error);
        setIsListening(false);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    }
  }, []);

  const toggleListen = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.start();
          setIsListening(true);
        } catch (e) {
          console.error("Failed to start recognition:", e);
        }
      } else {
        toast.error("Speech Recognition is not supported in this browser.");
      }
    }
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Refresh datasets when a dataset is deleted from the sidebar
  useEffect(() => {
    if (projectId) fetchDatasets();
  }, [datasetRefreshKey]);

  // Load datasets when project changes
  useEffect(() => {
    if (projectId) {
      fetchDatasets();
    } else {
      setDatasets([]);
      setDatasetId(null);
    }
  }, [projectId]);

  // Load history + refresh datasets when session changes
  useEffect(() => {
    if (sessionId && token) {
      loadHistory();
      if (projectId) fetchDatasets(); // refresh dropdown so new uploads are visible
    } else {
      setMessages([]);
    }
  }, [sessionId, token]);

  const fetchDatasets = async () => {
    if (!projectId) return;
    try {
      const res = await getDatasets(projectId);
      setDatasets(res.data);
      // Auto select first dataset if none selected
      if (res.data.length > 0 && !datasetId) {
        setDatasetId(res.data[0].id);
      }
    } catch (err) {
      console.error("Failed to fetch datasets for chat", err);
    }
  };

  const loadHistory = async () => {
    try {
      const res = await getHistory(sessionId, token);

      const formattedHistory = [];
      res.data.forEach(item => {
        formattedHistory.push({ type: "user", text: item.question });

        let aiData;
        try {
          const parsed = JSON.parse(item.aiResponse);
          if (!parsed.answer && !parsed.explanation) {
            aiData = { answer: item.aiResponse, sql: item.sqlGenerated, data: item.queryData || [] };
          } else {
            aiData = {
              answer: parsed,
              sql: item.sqlGenerated,
              data: item.queryData || []
            };
          }
        } catch (e) {
          aiData = { answer: item.aiResponse, sql: item.sqlGenerated, data: item.queryData || [] };
        }

        formattedHistory.push({ type: "ai", data: aiData });
      });

      setMessages(formattedHistory);
    } catch (err) {
      console.error("Failed to load history", err);
    }
  };

  const askWithQuestion = async (questionText) => {
    if (loading) return;
    if (!sessionId || !datasetId || !questionText.trim()) return;

    // Was this the first message in the chat?
    const isFirstMessage = messages.length === 0;

    setMessages((prev) => [...prev, { type: "user", text: questionText }]);
    setLoading(true);
    setFailedQuestion(null);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const res = await axios.post(
        "http://localhost:5000/ask",
        { datasetId, question: questionText, sessionId },
        { headers: { "x-auth-token": token }, signal: controller.signal }
      );
      setMessages((prev) => [...prev, { type: "ai", data: res.data }]);
    } catch (err) {
      if (axios.isCancel(err) || err.name === "CanceledError" || err.code === "ERR_CANCELED") {
        setMessages((prev) => prev.slice(0, -1));
        // If this was the first ever message, auto-delete the empty chat
        if (isFirstMessage) {
          try {
            await deleteSession(sessionId, token);
          } catch { /* ignore */ }
          if (onSessionDeleted) onSessionDeleted();
        }
      } else {
        console.error(err);
        setFailedQuestion(questionText);
        setMessages((prev) => [...prev, {
          type: "error",
          text: "AI service failed to respond. You can retry the same question."
        }]);
      }
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleAsk = () => {
    const q = question.trim();
    if (!q) return;
    setQuestion("");
    askWithQuestion(q);
  };

  const handleRetry = () => {
    if (!failedQuestion) return;
    const q = failedQuestion;
    setFailedQuestion(null);
    // Strip the last error card + user message before retrying
    setMessages((prev) => prev.slice(0, -2));
    askWithQuestion(q);
  };

  const handleStop = () => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
  };

  const exportFullChatToPDF = async () => {
    if (!chatRef.current || messages.length === 0) return;
    setIsExporting(true);

    try {
      // Small delay to ensure any UI states settle
      await new Promise(resolve => setTimeout(resolve, 100));

      const canvas = await html2canvas(chatRef.current, {
        scale: 2, // High resolution
        useCORS: true,
        backgroundColor: "#020617",
        // Temporarily expand height to capture overflowing content
        windowHeight: chatRef.current.scrollHeight
      });

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4"
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

      let heightLeft = pdfHeight;
      let position = 0;
      const pageHeight = pdf.internal.pageSize.getHeight();

      // First page
      pdf.addImage(imgData, "PNG", 0, position, pdfWidth, pdfHeight);
      heightLeft -= pageHeight;

      // Add new pages if content is taller than one A4 page
      while (heightLeft > 0) {
        position = heightLeft - pdfHeight;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, position, pdfWidth, pdfHeight);
        heightLeft -= pageHeight;
      }

      pdf.save(`DataIntel_Chat_${Date.now()}.pdf`);
    } catch (err) {
      console.error("Failed to export full chat to PDF", err);
    } finally {
      setIsExporting(false);
    }
  };

  // If no project/session selected, show a placeholder
  if (!projectId || !sessionId) {
    return (
      <div className="flex-1 flex flex-col bg-[#020617] text-white items-center justify-center p-10 relative">
        {/* Mobile Hamburger Header (Visible even when empty) */}
        <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center bg-transparent z-10 pointer-events-none md:hidden">
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="pointer-events-auto bg-[#0f172a]/80 backdrop-blur-md border border-[#1e293b] p-2.5 rounded-xl shadow-lg text-gray-400 hover:text-white transition"
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>

        <Bot className="w-16 h-16 text-[#334155] mb-4" />
        <h2 className="text-xl font-bold text-gray-500">Welcome to DataIntel</h2>
        <p className="text-gray-600 mt-2 text-center max-w-md">
          Select a project and create a chat session from the sidebar to start analyzing your data.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-[#020617] text-white relative w-full min-w-0">

      {/* Top Bar for Dataset Selection */}
      <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center bg-gradient-to-b from-[#020617] to-transparent z-10 pointer-events-none">

        {/* Mobile Hamburger */}
        <button
          onClick={() => setIsSidebarOpen(true)}
          className="md:hidden pointer-events-auto bg-[#0f172a]/80 backdrop-blur-md border border-[#1e293b] p-2.5 rounded-xl shadow-lg text-gray-400 hover:text-white transition"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="pointer-events-auto flex items-center gap-2">
          {messages.length > 0 && (
            <button
              onClick={exportFullChatToPDF}
              disabled={isExporting}
              className="flex items-center gap-2 bg-[#0f172a]/80 hover:bg-[#1e293b]/90 backdrop-blur-md border border-[#1e293b] px-3 md:px-4 py-2 rounded-xl shadow-lg text-rose-400 font-semibold text-xs transition disabled:opacity-50"
              title="Export ENTIRE Chat to PDF"
            >
              {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
              <span className="hidden sm:inline">Export Chat</span>
            </button>
          )}

          <div className="flex items-center gap-3 bg-[#0f172a]/80 backdrop-blur-md border border-[#1e293b] px-4 py-2 rounded-xl shadow-lg max-w-full overflow-hidden">
            <Database className="w-4 h-4 text-cyan-400 flex-shrink-0" />
            <span className="hidden sm:inline text-xs text-gray-400 font-medium uppercase tracking-wider">Targeting:</span>
            <select
              value={datasetId || ""}
              onChange={(e) => setDatasetId(e.target.value)}
              className="bg-transparent text-sm font-semibold text-white focus:outline-none cursor-pointer truncate"
            >
              {datasets.length === 0 && <option value="">No Datasets Available</option>}
              {datasets.map(d => (
                <option key={d.id} value={d.id} className="bg-[#0f172a]">{d.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Messages Area */}
      <div id="capture-chat-area" ref={chatRef} className="flex-1 overflow-y-auto overflow-x-hidden p-4 pt-24 md:p-10 md:pt-24 space-y-10 bg-[#020617] w-full min-w-0">

        {messages.map((msg, i) => {
          if (msg.type === "user") {
            const queryIndex = Math.floor(i / 2) + 1;
            const totalQueries = Math.ceil(messages.filter(m => m.type === "user").length);
            return (
              <div key={i} className="mb-6 flex flex-col items-end w-full">
                <div className="text-[#334155] font-mono font-semibold text-xs uppercase tracking-widest mb-3 w-full text-right">
                  QUERY {queryIndex.toString().padStart(2, '0')} / {totalQueries.toString().padStart(2, '0')} - {msg.text.slice(0, 20)}{msg.text.length > 20 ? '...' : ''}
                </div>
                <div className="bg-[#4338ca] text-[#e0e7ff] font-medium px-5 py-3 rounded-2xl rounded-tr-sm shadow-md text-sm max-w-[85vw] md:max-w-xl break-words">
                  {msg.text}
                </div>
              </div>
            );
          } else if (msg.type === "error") {
            return (
              <div key={i} className="flex flex-col md:flex-row gap-2 md:gap-4 mb-6 w-full">
                <div className="w-9 h-9 rounded-full bg-red-500/20 border border-red-500/30 flex items-center justify-center flex-shrink-0 mt-1">
                  <span className="text-red-400 text-sm">✕</span>
                </div>
                <div className="flex-1 w-full min-w-0">
                  <div className="bg-red-950/40 border border-red-500/20 rounded-2xl px-5 py-4 text-sm text-red-300">
                    <p className="mb-3">{msg.text}</p>
                    {failedQuestion && (
                      <button
                        onClick={handleRetry}
                        className="flex items-center gap-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-300 hover:text-red-200 px-4 py-2 rounded-lg text-xs font-semibold transition"
                      >
                        ↺ Regenerate response
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          } else {
            return (
              <div key={i} className="flex flex-col md:flex-row gap-2 md:gap-4 mb-10 w-full min-w-0">
                <div className="w-9 h-9 rounded-full bg-gradient-to-r from-indigo-400 to-blue-500 flex items-center justify-center flex-shrink-0 mt-2 shadow-lg shadow-blue-500/20">
                  <Bot className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 w-full min-w-0">
                  <ResultCard data={msg.data} />
                </div>
              </div>
            );
          }
        })}

        {loading && (
          <div className="text-indigo-400 animate-pulse">
            AI is analyzing your data...
          </div>
        )}

        {messages.length === 0 && !loading && (
          <div className="h-full flex flex-col items-center justify-center text-center max-w-lg mx-auto pb-20">
            <div className="w-16 h-16 rounded-2xl bg-[#0f172a] border border-[#1e293b] flex items-center justify-center mb-6 shadow-xl">
              <Database className="w-8 h-8 text-cyan-400" />
            </div>
            <h2 className="text-2xl font-bold mb-3">What do you want to know?</h2>
            <p className="text-gray-400 text-sm mb-8 leading-relaxed">
              Select a dataset from the top left corner, or upload a new one specifically for this chat below. Then ask any question in plain English.
            </p>

            <div className="w-full max-w-sm">
              <UploadDataset
                projectId={projectId}
                chatId={sessionId}
                token={token}
                onUploadComplete={(newDatasetId) => {
                  fetchDatasets();
                  setDatasetId(newDatasetId);
                }}
              />
            </div>
          </div>
        )}

        <div ref={bottomRef} className="h-4" />
      </div>

      {/* Input Section */}
      <div className="p-4 md:p-6 border-t border-[#1e293b] bg-[#0f172a] relative z-20 shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
        <div className="flex items-center bg-[#1e293b] rounded-2xl overflow-hidden border border-[#334155] focus-within:border-indigo-500/50 transition duration-300">

          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !loading && handleAsk()}
            placeholder={datasetId ? "Ask something about your data..." : "Select a dataset to ask a question..."}
            disabled={!datasetId}
            className="flex-1 bg-transparent p-3 md:p-4 focus:outline-none text-gray-200 disabled:opacity-50 text-sm md:text-base"
          />

          {!loading && (
            <button
              onClick={toggleListen}
              disabled={!datasetId}
              className={`p-3 md:p-4 transition flex items-center justify-center border-l border-[#334155] ${isListening ? 'text-rose-500 animate-pulse bg-rose-500/10' : 'text-gray-400 hover:text-white'
                }`}
              title={isListening ? "Stop listening" : "Start voice command"}
            >
              {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>
          )}

          {loading ? (
            <button
              onClick={handleStop}
              className="px-4 md:px-6 py-3 md:py-4 bg-red-500/20 hover:bg-red-500/30 text-red-400 transition font-semibold tracking-wide flex items-center gap-2 border-l border-red-500/20 text-sm md:text-base"
              title="Stop generating"
            >
              <Loader2 className="w-4 h-4 animate-spin" />
              Stop
              <Square className="w-3 h-3 fill-current" />
            </button>
          ) : (
            <button
              onClick={handleAsk}
              disabled={!datasetId || !question.trim()}
              className="px-4 md:px-6 py-3 md:py-4 bg-gradient-to-r from-indigo-500 to-cyan-400 hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed font-semibold tracking-wide flex items-center gap-2 text-sm md:text-base"
            >
              <Send className="w-4 h-4" />
              Ask
            </button>
          )}

        </div>
      </div>

    </div>
  );
}