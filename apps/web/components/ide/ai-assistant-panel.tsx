"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Sparkles, Send, RotateCcw, Copy, Check, Bot, User } from "lucide-react";
import { cn } from "@/lib/utils";

type Role = "user" | "assistant";

interface Message {
  id: string;
  role: Role;
  content: string;
  timestamp: Date;
}

const WELCOME_MESSAGE: Message = {
  id: "welcome",
  role: "assistant",
  content:
    "Hi! I'm your AI coding assistant. Ask me anything about your code — I can help you debug, explain concepts, suggest improvements, or answer programming questions.",
  timestamp: new Date(),
};

function TypingIndicator() {
  return (
    <div className="flex items-end gap-2">
      <Avatar className="h-7 w-7 shrink-0 ring-1 ring-border">
        <AvatarFallback className="bg-primary/10 text-primary text-xs">
          <Bot className="h-3.5 w-3.5" />
        </AvatarFallback>
      </Avatar>
      <div className="rounded-2xl rounded-bl-sm bg-muted px-4 py-3">
        <div className="flex gap-1 items-center h-4">
          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:0ms]" />
          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:150ms]" />
          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:300ms]" />
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === "user";

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div
      className={cn(
        "group flex items-end gap-2",
        isUser ? "flex-row-reverse" : "flex-row",
      )}
    >
      <Avatar className="h-7 w-7 shrink-0 ring-1 ring-border">
        <AvatarFallback
          className={cn(
            "text-xs",
            isUser
              ? "bg-primary text-primary-foreground"
              : "bg-primary/10 text-primary",
          )}
        >
          {isUser ? (
            <User className="h-3.5 w-3.5" />
          ) : (
            <Bot className="h-3.5 w-3.5" />
          )}
        </AvatarFallback>
      </Avatar>

      <div
        className={cn(
          "relative max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
          isUser
            ? "rounded-br-sm bg-primary text-primary-foreground"
            : "rounded-bl-sm bg-muted text-foreground",
        )}
      >
        <p className="whitespace-pre-wrap break-words">{message.content}</p>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleCopy}
          className={cn(
            "absolute -top-2 h-6 w-6 rounded-full border bg-background shadow-sm opacity-0 group-hover:opacity-100 transition-opacity",
            isUser ? "-left-3" : "-right-3",
          )}
        >
          {copied ? (
            <Check className="h-3 w-3 text-green-500" />
          ) : (
            <Copy className="h-3 w-3 text-muted-foreground" />
          )}
        </Button>
      </div>
    </div>
  );
}

interface AIAssistantPanelProps {
  assignmentId?: string | null;
  assignmentTitle?: string | null;
  assignmentDescription?: string | null;
  userId?: string | null;
  studentCode?: string | null;
}

export function AIAssistantPanel({ assignmentId, assignmentTitle, assignmentDescription, userId, studentCode }: AIAssistantPanelProps) {
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load chat history for the assignment+user when available.
  // Calls /api/acafs/chat/... which Next.js proxies server-side → avoids CORS.
  useEffect(() => {
    let mounted = true;
    async function loadHistory() {
      if (!assignmentId) return;
      const uid = userId ?? "anonymous";
      try {
        const resp = await fetch(
          `/api/acafs/chat/${encodeURIComponent(assignmentId)}/${encodeURIComponent(uid)}`
        );
        if (!mounted) return;
        if (!resp.ok) return;
        const data = await resp.json();
        const msgs = (data.messages ?? []).map((m: any) => ({
          id: m.id ? String(m.id) : crypto.randomUUID(),
          role: m.role as Role,
          content: m.content ?? "",
          timestamp: m.created_at ? new Date(m.created_at) : new Date(),
        }));
        if (msgs.length > 0) setMessages([WELCOME_MESSAGE, ...msgs]);
      } catch (e) {
        // ignore history load errors silently
      }
    }
    loadHistory();
    return () => {
      mounted = false;
    };
  }, [assignmentId, userId]);

  // Scroll to bottom whenever messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const handleClear = () => {
    setMessages([WELCOME_MESSAGE]);
    setInput("");
  };

  const sendMessage = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    // Call ACAFS Socratic chat via Next.js proxy → no CORS issues.
    try {
      const aid = assignmentId ?? "unknown-assignment";
      const uid = userId ?? "anonymous";
      const body: Record<string, unknown> = { content: trimmed };
      if (studentCode) body.student_code = studentCode;
      if (assignmentTitle) body.assignment_title = assignmentTitle;
      if (assignmentDescription) body.assignment_description = assignmentDescription;

      const resp = await fetch(
        `/api/acafs/chat/${encodeURIComponent(aid)}/${encodeURIComponent(uid)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );

      if (!resp.ok) {
        const text = await resp.text();
        const assistantMsg: Message = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `Tutor is unavailable (status ${resp.status}). ${text}`,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, assistantMsg]);
      } else {
        const data = await resp.json();
        const reply = data.reply ?? data?.messages?.[data.messages.length - 1]?.content ?? "";
        const assistantMsg: Message = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: reply || "Tutor did not return a reply.",
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, assistantMsg]);
      }
    } catch (err: any) {
      const assistantMsg: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `Tutor error: ${err?.message ?? String(err)}`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } finally {
      setIsLoading(false);
      textareaRef.current?.focus();
    }
  }, [input, isLoading]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex h-full flex-col bg-background">
      {/* ── Header ── */}
      <div className="flex items-center justify-between border-b px-4 py-2.5 bg-muted/30 shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-sm">AI Assistant</h3>
        </div>

        <div className="flex items-center gap-1">
          {/* Clear conversation */}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={handleClear}
            title="Clear conversation"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* ── Message list ── */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="flex flex-col gap-4 px-4 py-4">
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
          {isLoading && <TypingIndicator />}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {/* ── Input area ── */}
      <div className="shrink-0 border-t bg-muted/20 px-4 py-3">
        <div className="flex items-end gap-2 rounded-xl border bg-background px-3 py-2 shadow-sm focus-within:ring-2 focus-within:ring-primary/30 transition-shadow">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything about your code… (Enter to send)"
            rows={1}
            className="flex-1 resize-none border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0 placeholder:text-muted-foreground/60 max-h-36 overflow-y-auto"
            disabled={isLoading}
          />
          <Button
            size="icon"
            className="h-8 w-8 shrink-0 rounded-lg"
            onClick={sendMessage}
            disabled={!input.trim() || isLoading}
            title="Send message"
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
        <p className="mt-1.5 text-center text-[10px] text-muted-foreground/50">
          Shift+Enter for new line · Enter to send
        </p>
      </div>
    </div>
  );
}
