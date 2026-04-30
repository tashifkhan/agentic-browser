import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Conversation, type ChatMessage } from "../lib/api";
import { MessageSquare, Plus, Send, User, Bot, Clock, ChevronRight, XCircle, Check, Loader2, ChevronDown, MessageCircle, Search, Youtube, Mail, Calendar, Globe, Paperclip, Mic, MicOff, Upload, X, FileText } from "lucide-react";
import { useNavigate, useParams } from "@tanstack/react-router";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

interface AgentLoopEvent {
  id: string;
  label: string;
  type: string;
  timestamp: string;
}

export function ChatPanel() {
  const { conversationId } = useParams({ strict: false }) as { conversationId?: string };
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamedResponse, setStreamedResponse] = useState("");
  const [loopEvents, setLoopEvents] = useState<AgentLoopEvent[]>([]);
  const [expandedEvents, setExpandedEvents] = useState<Record<string, boolean>>({});
  
  // File and Voice
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachedFile, setAttachedFile] = useState<{ name: string; path: string; size: number } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Slash commands
  const [slashSuggestions, setSlashSuggestions] = useState<string[]>([]);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const MIN_TEXTAREA_HEIGHT = 50;

  // Queries
  const { data: conversations, refetch: refetchConversations } = useQuery({
    queryKey: ["conversations"],
    queryFn: api.conversations,
  });

  const { data: history, isLoading: isHistoryLoading } = useQuery({
    queryKey: ["conversation", conversationId],
    queryFn: () => (conversationId ? api.conversationHistory(conversationId) : Promise.resolve([])),
    enabled: !!conversationId,
  });

  // Scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history, streamedResponse, loopEvents]);

  const resizeTextarea = (element?: HTMLTextAreaElement | null) => {
    const textarea = element || textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.max(MIN_TEXTAREA_HEIGHT, Math.min(textarea.scrollHeight, 200))}px`;
  };

  const pushLoopEvent = (type: string, label: string) => {
    setLoopEvents((prev) => [
      ...prev,
      { id: crypto.randomUUID(), type, label, timestamp: new Date().toISOString() }
    ]);
  };

  const handleSend = async (commandOverride?: string) => {
    const finalInput = commandOverride || input;
    if (!finalInput.trim() || isStreaming) return;

    let currentConvId = conversationId || crypto.randomUUID();
    
    setInput("");
    setIsStreaming(true);
    setStreamedResponse("");
    setLoopEvents([]);
    setAttachedFile(null);
    if (textareaRef.current) textareaRef.current.style.height = `${MIN_TEXTAREA_HEIGHT}px`;

    try {
      const parts = finalInput.trim().split(" ");
      const cmd = parts[0];
      
      let endpoint = "/api/genai/react";
      let isStream = true;
      let payload: any = {
        question: finalInput,
        conversation_id: currentConvId,
        chat_history: []
      };

      if (cmd === "/youtube-ask") {
        endpoint = "/api/genai/youtube";
        isStream = false;
        const url = parts[1] || "";
        const question = parts.slice(2).join(" ");
        payload = { url, question, chat_history: [] };
      } else if (cmd === "/google-search") {
        endpoint = "/api/google-search";
        isStream = false;
        payload = { query: parts.slice(1).join(" ") || finalInput, question: parts.slice(1).join(" "), chat_history: [] };
      } else if (cmd === "/gmail-unread") {
        endpoint = "/api/gmail/unread";
        isStream = false;
      } else if (cmd === "/calendar-events") {
        endpoint = "/api/calendar/events";
        isStream = false;
      } else if (cmd === "/react-ask") {
        endpoint = "/api/genai/react";
        isStream = true;
        payload.question = parts.slice(1).join(" ") || finalInput;
      }

      if (isStream) {
        await api.chatStream(payload.question, currentConvId, (data) => {
          if (data.event === "answer_delta" && data.delta) {
            setStreamedResponse((prev) => prev + data.delta);
          } else if (data.event === "automation_started") {
            pushLoopEvent("automation", "Starting browser automation");
          } else if (data.event === "supervisor_iteration") {
            pushLoopEvent("supervisor", `Supervisor loop: ${data.action || "delegate"}`);
          } else if (data.event === "subagent_started") {
            pushLoopEvent("subagent", `${data.subagent} started`);
          } else if (data.event === "subagent_tool_call") {
            pushLoopEvent("tool", `${data.subagent} calling ${data.tool}`);
          } else if (data.event === "subagent_tool_result") {
            pushLoopEvent("tool_result", `${data.tool} completed`);
          } else if (data.event === "subagent_completed") {
            pushLoopEvent("subagent_done", `${data.subagent} completed`);
          } else if (data.event === "quality_check") {
            pushLoopEvent("quality", `Quality check: ${data.satisfactory ? "satisfactory" : "needs work"}`);
          } else if (data.event === "final") {
            pushLoopEvent("final", `Finished`);
          } else if (data.event === "error") {
            pushLoopEvent("error", `Error: ${data.message || "unknown"}`);
          }
        });
      } else {
        // For non-streaming, we must manually create conversation and save messages
        if (!conversationId) {
          const newConv = await api.createConversation(finalInput.slice(0, 50));
          currentConvId = newConv.conversation_id;
        }
        await api.addMessage(currentConvId, "user", finalInput);

        pushLoopEvent("tool", `Calling ${cmd} API...`);
        const queryParams = payload.url ? `?url=${encodeURIComponent(payload.url)}` : "";
        const res = await fetch(`http://localhost:5454${endpoint}${queryParams}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        
        pushLoopEvent("tool_result", `Received response`);
        pushLoopEvent("final", `Finished`);
        
        // Convert JSON to string for display if it's an object, or use answer field
        let textResponse = data.answer || data.summary || (typeof data === "string" ? data : JSON.stringify(data, null, 2));
        setStreamedResponse(textResponse);

        // Save the assistant's response
        await api.addMessage(currentConvId, "assistant", textResponse);
      }

      await queryClient.invalidateQueries({ queryKey: ["conversation", currentConvId] });
      await refetchConversations();
      
      if (!conversationId) {
        navigate({ to: `/chat/${currentConvId}` });
      }
    } catch (error) {
      console.error("Chat error:", error);
      pushLoopEvent("error", "Failed to communicate with agent backend");
      setStreamedResponse((prev) => prev + "\n\n**[Error: Failed to get response from agent]**");
    } finally {
      setIsStreaming(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const baseUrl = "http://localhost:5454";
      const formData = new FormData();
      formData.append("file", file);
      const resp = await fetch(`${baseUrl}/api/upload/`, {
        method: "POST",
        body: formData,
      });
      if (!resp.ok) throw new Error(`Upload failed: ${await resp.text()}`);
      const data = await resp.json();
      setAttachedFile({ name: data.filename, path: data.path, size: data.size });
      // We could automatically inject this into input if we want
      setInput((prev) => prev + ` [Attached file: ${data.filename}]`);
    } catch (err: any) {
      console.error(err);
      alert("Upload failed");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const toggleVoiceInput = async () => {
    if (isListening) {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      setIsListening(false);
      return;
    }

    setIsListening(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        stream.getTracks().forEach(track => track.stop());

        if (audioBlob.size === 0) {
          setIsListening(false);
          return;
        }

        try {
          const baseUrl = "http://localhost:5454";
          const formData = new FormData();
          formData.append("file", audioBlob, "recording.webm");

          const resp = await fetch(`${baseUrl}/api/voice/transcribe`, {
            method: "POST",
            body: formData,
          });

          if (!resp.ok) throw new Error(`Transcription failed: ${await resp.text()}`);
          
          const data = await resp.json();
          if (data.ok && data.text) {
            setInput((prev) => prev + (prev ? " " : "") + data.text);
            if (textareaRef.current) {
              textareaRef.current.focus();
              setTimeout(() => resizeTextarea(), 0);
            }
          }
        } catch (err: any) {
          console.error("Transcription error:", err);
          alert("Voice transcription failed");
        } finally {
          setIsListening(false);
        }
      };

      mediaRecorder.start();
    } catch (err) {
      console.error("Mic error:", err);
      alert("Microphone access denied or unavailable.");
      setIsListening(false);
    }
  };

  const checkSlashCommands = (val: string) => {
    if (val.startsWith("/")) {
      const cmds = ["/react-ask", "/google-search", "/youtube-ask", "/gmail-unread", "/calendar-events"];
      const match = cmds.filter(c => c.startsWith(val));
      setSlashSuggestions(match);
    } else {
      setSlashSuggestions([]);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    checkSlashCommands(e.target.value);
    resizeTextarea(e.target);
  };

  return (
    <div style={{ display: "flex", height: "100%", background: "var(--bg-color)" }}>
      {/* Sidebar: Chat History */}
      <div
        style={{
          width: 280,
          borderRight: "1px solid var(--border-color)",
          display: "flex",
          flexDirection: "column",
          background: "rgba(0,0,0,0.05)",
        }}
      >
        <div style={{ padding: 16 }}>
          <button
            onClick={() => navigate({ to: "/chat" })}
            style={{
              width: "100%",
              padding: "10px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              background: "var(--button-bg)",
              border: "1px solid var(--border-color)",
              borderRadius: 8,
              color: "var(--accent-color)",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            <Plus size={16} /> New Chat
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "0 8px 16px" }}>
          <div className="section-label" style={{ padding: "0 8px 8px", fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>Recent Conversations</div>
          {Array.isArray(conversations) && conversations?.map((conv) => (
            <div
              key={conv.conversation_id}
              onClick={() => navigate({ to: `/chat/${conv.conversation_id}` })}
              style={{
                padding: "10px 12px",
                borderRadius: 8,
                cursor: "pointer",
                background: conversationId === conv.conversation_id ? "var(--input-bg)" : "transparent",
                border: "1px solid",
                borderColor: conversationId === conv.conversation_id ? "var(--border-color)" : "transparent",
                marginBottom: 4,
                transition: "all 0.2s",
              }}
            >
              <div style={{ 
                fontSize: 13, 
                fontWeight: 500, 
                color: conversationId === conv.conversation_id ? "var(--text-primary)" : "var(--text-secondary)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis"
              }}>
                {conv.title || "Untitled Chat"}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}>
                <Clock size={10} />
                {new Date(conv.created_at).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Main Chat Area */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", position: "relative" }}>
        <div
          ref={scrollRef}
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "24px 40px",
            display: "flex",
            flexDirection: "column",
            gap: 24,
          }}
        >
          {!conversationId && !isStreaming && (
            <div style={{ 
              height: "100%", 
              display: "flex", 
              flexDirection: "column", 
              alignItems: "center", 
              justifyContent: "center",
              color: "var(--text-muted)",
              textAlign: "center"
            }}>
              <MessageSquare size={48} style={{ marginBottom: 16, opacity: 0.2 }} />
              <h2 style={{ color: "var(--text-primary)", marginBottom: 8 }}>What can I help you with?</h2>
              <p style={{ maxWidth: 400, fontSize: 14, marginBottom: 32 }}>
                Choose a quick action or type your message below. The Agent has access to your memory, search tools, and APIs.
              </p>
              
              <div style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
                maxWidth: 600,
                width: "100%"
              }}>
                {[
                  { icon: <MessageCircle size={18} />, label: "React Agent", cmd: "/react-ask " },
                  { icon: <Search size={18} />, label: "Search Google", cmd: "/google-search " },
                  { icon: <Youtube size={18} />, label: "Ask about a video", cmd: "/youtube-ask " },
                  { icon: <Mail size={18} />, label: "Check unread emails", cmd: "/gmail-unread" },
                  { icon: <Calendar size={18} />, label: "View calendar", cmd: "/calendar-events" },
                ].map((action, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      if (action.cmd.endsWith(" ")) {
                        setInput(action.cmd);
                        textareaRef.current?.focus();
                      } else {
                        handleSend(action.cmd);
                      }
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "16px",
                      background: "var(--input-bg)",
                      border: "1px solid var(--border-color)",
                      borderRadius: 12,
                      color: "var(--text-primary)",
                      cursor: "pointer",
                      textAlign: "left",
                      transition: "all 0.2s"
                    }}
                    onMouseOver={(e) => (e.currentTarget.style.borderColor = "var(--accent-color)")}
                    onMouseOut={(e) => (e.currentTarget.style.borderColor = "var(--border-color)")}
                  >
                    <div style={{ color: "var(--accent-color)" }}>{action.icon}</div>
                    <span style={{ fontSize: 14, fontWeight: 500 }}>{action.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {Array.isArray(history) && history.map((msg) => (
            <MessageBubble key={msg.message_id} message={msg} />
          ))}

          {isStreaming && (
            <MessageBubble 
              message={{ 
                message_id: "streaming", 
                role: "assistant", 
                content: streamedResponse, 
                created_at: new Date().toISOString() 
              }} 
              events={loopEvents}
              isStreaming={true}
            />
          )}
        </div>

        {/* Input Area */}
        <div style={{ padding: "20px 40px", background: "var(--bg-color)", borderTop: "1px solid var(--border-color)" }}>
          <div style={{ position: "relative", maxWidth: 800, margin: "0 auto" }}>
            
            {slashSuggestions.length > 0 && (
              <div style={{
                position: "absolute",
                bottom: "100%",
                left: 0,
                marginBottom: 8,
                background: "var(--bg-color)",
                border: "1px solid var(--border-color)",
                borderRadius: 8,
                padding: 8,
                boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                zIndex: 10,
                width: 250
              }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 8, padding: "0 8px" }}>COMMANDS</div>
                {slashSuggestions.map((s, idx) => (
                  <div
                    key={idx}
                    onClick={() => {
                      setInput(s + " ");
                      setSlashSuggestions([]);
                      textareaRef.current?.focus();
                    }}
                    style={{
                      padding: "8px",
                      borderRadius: 6,
                      cursor: "pointer",
                      fontSize: 13,
                      background: idx === selectedSuggestionIndex ? "var(--input-bg)" : "transparent",
                    }}
                    onMouseOver={(e) => (e.currentTarget.style.background = "var(--input-bg)")}
                    onMouseOut={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    {s}
                  </div>
                ))}
              </div>
            )}

            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              style={{ display: "none" }}
            />

            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={isListening ? "Listening..." : "Type your message..."}
              style={{
                width: "100%",
                padding: "14px 100px 14px 16px",
                background: "var(--input-bg)",
                border: "1px solid var(--border-color)",
                borderRadius: 12,
                color: "var(--text-primary)",
                fontSize: 14,
                resize: "none",
                minHeight: MIN_TEXTAREA_HEIGHT,
                outline: "none",
              }}
            />
            
            <div style={{ position: "absolute", right: 8, bottom: 8, display: "flex", gap: 4 }}>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading || isStreaming}
                style={{
                  width: 34, height: 34,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: "transparent", border: "none", borderRadius: 8,
                  color: isUploading ? "var(--accent-color)" : "var(--text-muted)",
                  cursor: "pointer"
                }}
              >
                {isUploading ? <Loader2 size={16} className="spin" /> : <Paperclip size={16} />}
              </button>
              
              <button
                onClick={toggleVoiceInput}
                disabled={isStreaming}
                style={{
                  width: 34, height: 34,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: isListening ? "rgba(239, 68, 68, 0.1)" : "transparent", 
                  border: "none", borderRadius: 8,
                  color: isListening ? "#ef4444" : "var(--text-muted)",
                  cursor: "pointer"
                }}
              >
                {isListening ? <MicOff size={16} /> : <Mic size={16} />}
              </button>

              <button
                onClick={() => handleSend()}
                disabled={!input.trim() || isStreaming}
                style={{
                  width: 34, height: 34,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: input.trim() && !isStreaming ? "var(--accent-color)" : "transparent",
                  border: "none", borderRadius: 8,
                  color: input.trim() && !isStreaming ? "white" : "var(--text-muted)",
                  cursor: "pointer",
                }}
              >
                <Send size={16} />
              </button>
            </div>
            
            {attachedFile && (
              <div style={{
                position: "absolute", top: -30, left: 10,
                background: "var(--input-bg)", border: "1px solid var(--border-color)",
                padding: "4px 8px", borderRadius: 6, fontSize: 11, display: "flex", alignItems: "center", gap: 6
              }}>
                <FileText size={12} />
                {attachedFile.name}
                <button onClick={() => setAttachedFile(null)} style={{ background:"none", border:"none", cursor:"pointer", color:"var(--text-muted)" }}>
                  <X size={10} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message, events, isStreaming }: { message: ChatMessage | any, events?: AgentLoopEvent[], isStreaming?: boolean }) {
  const isUser = message.role === "user";
  const [expanded, setExpanded] = useState(true);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: isUser ? "flex-end" : "flex-start",
        width: "100%",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, color: "var(--text-muted)" }}>
        {isUser ? (
          <>
            <span style={{ fontSize: 11, fontWeight: 600 }}>YOU</span>
            <User size={14} />
          </>
        ) : (
          <>
            <Bot size={14} style={{ color: "var(--accent-color)" }} />
            <span style={{ fontSize: 11, fontWeight: 600 }}>AGENT</span>
          </>
        )}
      </div>
      <div
        style={{
          maxWidth: "80%",
          padding: "16px",
          borderRadius: 12,
          borderTopRightRadius: isUser ? 2 : 12,
          borderTopLeftRadius: isUser ? 12 : 2,
          background: isUser ? "var(--accent-color)" : "var(--bg-color)",
          color: isUser ? "white" : "var(--text-primary)",
          fontSize: 14,
          lineHeight: 1.6,
          border: isUser ? "none" : "1px solid var(--border-color)",
          boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
        }}
      >
        {events && events.length > 0 && (
          <div style={{ marginBottom: message.content ? 16 : 0 }}>
            <div 
              onClick={() => setExpanded(!expanded)}
              style={{
                display: "flex", alignItems: "center", gap: 8, padding: "8px 12px",
                background: "var(--input-bg)", borderRadius: 8, cursor: "pointer",
                border: "1px solid var(--border-color)",
                fontSize: 12, fontWeight: 500
              }}
            >
              {isStreaming ? <Loader2 size={14} className="spin" style={{ color: "var(--accent-color)" }} /> : <Check size={14} style={{ color: "#10b981" }}/>}
              <span style={{ flex: 1 }}>{events[events.length - 1].label}</span>
              {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </div>
            
            {expanded && (
              <div style={{
                marginTop: 8, marginLeft: 6, paddingLeft: 12, borderLeft: "2px solid var(--border-color)",
                display: "flex", flexDirection: "column", gap: 6
              }}>
                {events.map((evt) => (
                  <div key={evt.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "var(--text-secondary)" }}>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: evt.type === "error" ? "#ef4444" : "var(--accent-color)" }} />
                    {evt.label}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="markdown-body" style={{ color: isUser ? "white" : "inherit" }}>
          {message.content ? (
            <ReactMarkdown
              remarkPlugins={[remarkMath]}
              rehypePlugins={[rehypeKatex]}
              components={{
                p: ({ children }) => <p style={{ margin: "0 0 8px 0", lastChild: { margin: 0 } }}>{children}</p>,
                code({ node, inline, className, children, ...props }: any) {
                  return inline ? (
                    <code style={{ background: isUser ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.05)", padding: "2px 4px", borderRadius: 4, fontFamily: "monospace" }} {...props}>{children}</code>
                  ) : (
                    <pre style={{ background: "rgba(0,0,0,0.05)", padding: 12, borderRadius: 8, overflowX: "auto", margin: "8px 0" }}>
                      <code {...props}>{children}</code>
                    </pre>
                  );
                }
              }}
            >
              {message.content}
            </ReactMarkdown>
          ) : isStreaming && !events?.length ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-muted)" }}>
              <Loader2 size={16} className="spin" /> Thinking...
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
