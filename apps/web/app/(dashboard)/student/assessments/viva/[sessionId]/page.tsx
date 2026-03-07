"use client";

import * as React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
    Mic2,
    Send,
    Loader2,
    CheckCircle2,
    XCircle,
    AlertTriangle,
    BarChart3,
    CornerDownRight,
    Info,
    Square,
    List,
    Activity,
    BrainCircuit,
    Mic,
    Pause,
    Play,
    Lightbulb,
    Wifi,
    WifiOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { ivasApi } from "@/lib/ivas-api";
import { useAuthStore } from "@/lib/stores/authStore";
import { useToast } from "@/components/ui/toaster";
import { motion, AnimatePresence } from "framer-motion";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "@/components/ui/sheet";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import type {
    ChatMessage,
    QuestionWithContext,
    SessionDetailsOut,
    CompetencySummary,
} from "@/types/ivas";

// ── Score helpers ─────────────────────────────────────────────────────────────

function scoreBgClass(score: number) {
    if (score >= 7) return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400";
    if (score >= 4) return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
    return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
}

function ScoreBadge({ score }: { score: number }) {
    return (
        <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold", scoreBgClass(score))}>
            {score}/10
        </span>
    );
}

// ── CompetencyBar ─────────────────────────────────────────────────────────────

function CompetencyBar({ item }: { item: CompetencySummary }) {
    const pct = item.max_score > 0 ? (item.score / item.max_score) * 100 : 0;
    const barColor = pct >= 70 ? "bg-emerald-500" : pct >= 40 ? "bg-amber-500" : "bg-red-500";
    return (
        <div className="space-y-1">
            <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{item.competency}</span>
                <span className="text-muted-foreground">{item.score}/{item.max_score}</span>
            </div>
            <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div className={cn("h-full rounded-full transition-all", barColor)} style={{ width: `${pct}%` }} />
            </div>
        </div>
    );
}

// ── Transcript Panel ──────────────────────────────────────────────────────────

function TranscriptPanel({ messages }: { messages: ChatMessage[] }) {
    return (
        <ScrollArea className="h-[calc(100vh-80px)] p-6 z-50">
            <div className="space-y-6 pb-20">
                {messages.map((msg, i) => (
                    <div key={msg.id || i} className={cn("flex flex-col", msg.role === 'user' ? "items-end" : "items-start")}>
                        <span className="text-[10px] text-zinc-500 uppercase font-semibold tracking-wider mb-1.5 ml-1">
                            {msg.role === 'user' ? 'You' : 'IVAS'}
                        </span>
                        <div className={cn(
                            "px-4 py-3 rounded-2xl max-w-[85%] text-[15px] leading-relaxed",
                            msg.role === 'user'
                                ? "bg-emerald-600/20 text-emerald-100 border border-emerald-500/20 rounded-tr-sm"
                                : "bg-zinc-800/50 text-zinc-300 border border-zinc-700/50 rounded-tl-sm"
                        )}>
                            {msg.content}
                        </div>
                    </div>
                ))}
            </div>
        </ScrollArea>
    );
}

// ── AI Core Orb ──────────────────────────────────────────────────────────────

interface AICoreOrbProps {
    state: "idle" | "ai_speaking" | "user_speaking" | "thinking";
}

function AICoreOrb({ state }: AICoreOrbProps) {
    return (
        <div className="relative flex items-center justify-center">
            {/* Outer Glow */}
            <motion.div
                animate={{
                    scale: state === "user_speaking" ? [1, 1.2, 1] : [1, 1.05, 1],
                    opacity: state === "idle" ? 0.3 : 0.6,
                }}
                transition={{
                    duration: state === "user_speaking" ? 0.8 : 3,
                    repeat: Infinity,
                    ease: "easeInOut",
                }}
                className={cn(
                    "absolute h-64 w-64 rounded-full blur-[60px]",
                    state === "user_speaking" ? "bg-emerald-500/40" :
                        state === "ai_speaking" ? "bg-teal-500/40" : "bg-emerald-500/20"
                )}
            />

            {/* Pulsing Rings */}
            {[...Array(3)].map((_, i) => (
                <motion.div
                    key={i}
                    animate={{
                        scale: state === "ai_speaking" ? [1, 1.4 + i * 0.1] : [1, 1.1 + i * 0.05],
                        opacity: state === "ai_speaking" ? [0.5, 0] : [0.2, 0],
                    }}
                    transition={{
                        duration: state === "user_speaking" ? 1 : 2,
                        repeat: Infinity,
                        delay: i * 0.4,
                        ease: "easeOut",
                    }}
                    className="absolute h-48 w-48 rounded-full border border-emerald-500/30"
                />
            ))}

            {/* Core Orb */}
            <motion.div
                animate={{
                    rotate: state === "thinking" ? 360 : 0,
                    scale: state === "user_speaking" ? 1.1 : 1,
                }}
                transition={{
                    rotate: { duration: 10, repeat: Infinity, ease: "linear" },
                    scale: { duration: 0.5 }
                }}
                className={cn(
                    "relative h-40 w-40 rounded-full flex items-center justify-center border-2 overflow-hidden shadow-[0_0_50px_rgba(16,185,129,0.2)]",
                    state === "user_speaking"
                        ? "bg-emerald-500/20 border-emerald-400/50"
                        : "bg-zinc-900 border-zinc-800"
                )}
            >
                <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 via-transparent to-teal-500/10" />
                <BrainCircuit className={cn(
                    "h-16 w-16 transition-colors duration-500 z-10",
                    state !== "idle" ? "text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.5)]" : "text-zinc-600"
                )} />
            </motion.div>
        </div>
    );
}

// ── Voice Waveform ───────────────────────────────────────────────────────────

function VoiceWaveform({ audioData }: { audioData: number[] }) {
    return (
        <div className="flex items-center gap-1.5 h-12">
            {audioData.map((h, i) => (
                <motion.div
                    key={i}
                    animate={{ height: h }}
                    transition={{ type: 'spring', bounce: 0.1, duration: 0.1 }}
                    className="w-1.5 rounded-full bg-emerald-400/80 shadow-[0_0_10px_rgba(16,185,129,0.5)]"
                />
            ))}
        </div>
    );
}


// ── Main Page ──────────────────────────────────────────────────────────────────

export default function VivaSessionPage() {
    const params = useParams<{ sessionId: string }>();
    const searchParams = useSearchParams();
    const router = useRouter();
    const sessionId = params.sessionId;
    const user = useAuthStore((s) => s.user);
    const { addToast } = useToast();

    // assignmentId passed as query param when starting new: ?assignmentId=...
    const assignmentIdFromQuery = searchParams.get("assignmentId");

    const [messages, setMessages] = React.useState<ChatMessage[]>([]);
    const [session, setSession] = React.useState<SessionDetailsOut | null>(null);
    const [currentQuestion, setCurrentQuestion] = React.useState<QuestionWithContext | null>(null);
    const [isComplete, setIsComplete] = React.useState(false);
    const [finalData, setFinalData] = React.useState<{
        final_score: number | null;
        max_score: number | null;
        competency_summary: CompetencySummary[] | null;
    } | null>(null);
    const [sending, setSending] = React.useState(false);
    const [initializing, setInitializing] = React.useState(true);
    const [initError, setInitError] = React.useState<string | null>(null);
    const [inputValue, setInputValue] = React.useState("");
    const [abandonConfirm, setAbandonConfirm] = React.useState(false);
    const [abandoning, setAbandoning] = React.useState(false);
    
    // Enhanced features state
    const [isPaused, setIsPaused] = React.useState(false);
    const [connectionStatus, setConnectionStatus] = React.useState<"connected" | "disconnected" | "reconnecting">("connected");
    const [showHintDialog, setShowHintDialog] = React.useState(false);
    const [currentHint, setCurrentHint] = React.useState<string>("");
    const [hintsUsed, setHintsUsed] = React.useState(0);
    const [reconnectAttempts, setReconnectAttempts] = React.useState(0);

    // Audio context for visualization
    const [audioData, setAudioData] = React.useState<number[]>(Array(5).fill(20));

    // Keep reference to the active websocket
    const wsRef = React.useRef<WebSocket | null>(null);
    const reconnectTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

    // Web Speech API hook logic
    const [isRecording, setIsRecording] = React.useState(false);
    const [recordingTime, setRecordingTime] = React.useState(0);
    const [interimTranscript, setInterimTranscript] = React.useState("");
    const recognitionRef = React.useRef<any>(null);
    const recordingIntervalRef = React.useRef<NodeJS.Timeout | null>(null);
    const visualizerIntervalRef = React.useRef<NodeJS.Timeout | null>(null);

    // Simulate audio volume for visuals
    React.useEffect(() => {
        if (isRecording || sending) {
            visualizerIntervalRef.current = setInterval(() => {
                setAudioData(Array.from({ length: 5 }, () => Math.random() * 40 + 10));
            }, 100);
        } else {
            if (visualizerIntervalRef.current) clearInterval(visualizerIntervalRef.current);
            setAudioData(Array(5).fill(10));
        }
        return () => {
            if (visualizerIntervalRef.current) clearInterval(visualizerIntervalRef.current);
        }
    }, [isRecording, sending]);

    // Stop recording timer when component unmounts
    React.useEffect(() => {
        return () => {
            if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
            if (recognitionRef.current) recognitionRef.current.stop();
        };
    }, []);

    const startRecording = () => {
        // Stop any ongoing TTS audio
        document.querySelectorAll('audio').forEach(audio => {
            audio.pause();
            audio.currentTime = 0;
        });

        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognition) {
            addMessage({ role: "system", content: "Error: Your browser does not support the Web Speech API. Please use Chrome or Edge." });
            return;
        }

        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        let finalTranscript = '';

        recognition.onstart = () => {
            setIsRecording(true);
            setRecordingTime(0);
            recordingIntervalRef.current = setInterval(() => {
                setRecordingTime(prev => prev + 1);
            }, 1000);
        };

        recognition.onresult = (event: any) => {
            let interim = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript;
                } else {
                    interim += event.results[i][0].transcript;
                }
            }
            setInterimTranscript(interim || finalTranscript);
        };

        recognition.onerror = (event: any) => {
            if (event.error === 'no-speech') {
                // If the user stops speaking for a while, just stop recording and submit what we have implicitly
                if (finalTranscript.trim()) {
                    handleSubmit(finalTranscript.trim());
                }
            } else if (event.error !== 'aborted') {
                addMessage({ role: "system", content: `Speech recognition error: ${event.error}` });
            }
            stopRecording(false);
        };

        recognition.onend = () => {
            if (finalTranscript.trim()) {
                // Submit the transcribed text
                handleSubmit(finalTranscript.trim());
            }
            stopRecording(false); // Make sure state is reset without double-submitting
            setInterimTranscript("");
        };

        recognitionRef.current = recognition;
        try {
            recognition.start();
        } catch (e) {
            console.error("Could not start recognition:", e);
        }
    };

    const stopRecording = (shouldSubmit: boolean = true) => {
        setIsRecording(false);
        if (recordingIntervalRef.current) {
            clearInterval(recordingIntervalRef.current);
            recordingIntervalRef.current = null;
        }
        if (recognitionRef.current) {
            // Stop speech recognition (this will trigger onend event, which handles submission if shouldSubmit is implicitly handled there. 
            // In continuous mode, calling stop() finalizes the current speech and triggers onend)
            try {
                // Prevent the onend from double firing if we manually cancelled it or if we don't want it to submit empty
                if (!shouldSubmit) {
                    recognitionRef.current.onend = null;
                }
                recognitionRef.current.stop();
            } catch (e) {
                // Ignore
            }
            recognitionRef.current = null;
        }
    };

    const bottomRef = React.useRef<HTMLDivElement>(null);

    const addMessage = (msg: Omit<ChatMessage, "id" | "timestamp">) => {
        setMessages((prev) => [
            ...prev,
            { ...msg, id: crypto.randomUUID(), timestamp: new Date() },
        ]);
    };

    const hydrateFromTranscript = React.useCallback(
        async (sessionData: SessionDetailsOut) => {
            const transcript = await ivasApi.getTranscript(sessionId);
            const hydrated: ChatMessage[] = [];

            for (const exchange of transcript.exchanges) {
                // Question
                hydrated.push({
                    id: crypto.randomUUID(),
                    role: "assistant",
                    content: exchange.question_text,
                    timestamp: new Date(exchange.asked_at),
                    metadata: {
                        competency: exchange.competency,
                        difficulty: exchange.difficulty,
                        questionType: exchange.question_type,
                    },
                });
                // Student answer
                if (exchange.student_answer) {
                    hydrated.push({
                        id: crypto.randomUUID(),
                        role: "user",
                        content: exchange.student_answer,
                        timestamp: exchange.answered_at
                            ? new Date(exchange.answered_at)
                            : new Date(),
                    });
                }
                // Feedback
                if (exchange.feedback_text) {
                    hydrated.push({
                        id: crypto.randomUUID(),
                        role: "assistant",
                        content: exchange.feedback_text,
                        timestamp: new Date(),
                        metadata: {
                            isFeedback: true,
                            score: exchange.evaluation_score ?? undefined,
                            misconceptions: exchange.detected_misconceptions ?? undefined,
                        },
                    });
                }
            }

            setMessages(hydrated);

            // Determine current unanswered question
            if (sessionData.session.status === "in_progress") {
                const answeredInstIds = new Set(
                    sessionData.responses.map((r) => r.question_instance_id)
                );
                const unanswered = sessionData.questions_asked.find(
                    (q) => !answeredInstIds.has(q.id)
                );
                if (unanswered) {
                    setCurrentQuestion({
                        question_id: unanswered.question_id,
                        question_instance_id: unanswered.id,
                        question_text:
                            unanswered.follow_up_question_text ??
                            transcript.exchanges.find((e) =>
                                e.question_text ===
                                hydrated.find(
                                    (m) =>
                                        m.role === "assistant" &&
                                        m.metadata?.questionType !== undefined
                                )?.content
                            )?.question_text ??
                            "",
                        competency: unanswered.competency,
                        difficulty: unanswered.difficulty,
                        code_context: "",
                        hint: "",
                        is_follow_up: unanswered.follow_up_depth > 0,
                        question_type: unanswered.follow_up_depth > 0 ? "follow_up" : "new",
                    });
                }
            }
        },
        [sessionId]
    );

    // Initialize session
    React.useEffect(() => {
        if (!user?.id) return;
        let mounted = true;

        async function init() {
            try {
                setInitializing(true);

                if (sessionId === "new" && assignmentIdFromQuery) {
                    // Trigger new session
                    const result = await ivasApi.triggerAssessment({
                        student_id: user!.id,
                        assignment_id: assignmentIdFromQuery,
                    });

                    if (!mounted) return;

                    // Redirect to the actual session URL
                    router.replace(`/student/assessments/viva/${result.session_id}`);
                    return;
                }

                // Load existing session
                const sessionData = await ivasApi.getSession(sessionId);
                if (!mounted) return;
                setSession(sessionData);

                if (sessionData.session.status === "completed") {
                    setIsComplete(true);
                    setFinalData({
                        final_score: sessionData.session.final_score,
                        max_score: sessionData.session.max_score,
                        competency_summary: sessionData.session.competency_summary,
                    });
                    await hydrateFromTranscript(sessionData);
                } else if (sessionData.session.status === "abandoned") {
                    setIsComplete(true);
                    await hydrateFromTranscript(sessionData);
                } else {
                    // in_progress
                    if (sessionData.questions_asked.length === 0) {
                        // Fresh session that hasn't started yet (shouldn't normally happen
                        // since trigger returns first_question, but handle defensively)
                        addMessage({
                            role: "system",
                            content: "Session is active. Waiting for the first question…",
                        });
                    } else {
                        await hydrateFromTranscript(sessionData);
                    }
                }
            } catch (err) {
                if (mounted) {
                    setInitError(
                        err instanceof Error ? err.message : "Failed to load session."
                    );
                }
            } finally {
                if (mounted) setInitializing(false);
            }
        }

        init();
        return () => { mounted = false; };
    }, [sessionId, assignmentIdFromQuery, user?.id, router, hydrateFromTranscript]);

    // Also handle the case where we just got redirected FROM "new" — the sessionId
    // is now set and we need to trigger and receive first_question
    React.useEffect(() => {
        if (sessionId === "new") return; // handled above
        if (initializing) return;
        if (!user?.id) return;
        if (session?.session.status !== "in_progress") return;
        if (messages.length > 0) return; // already hydrated
        // If session exists but no messages (shouldn't happen normally)
    }, [sessionId, initializing, session, messages.length, user?.id]);

    // --- Voice WebSocket Connection ---
    React.useEffect(() => {
        if (!user?.id || !sessionId || sessionId === "new" || isComplete || initializing) return;

        const baseUrl = process.env.NEXT_PUBLIC_IVAS_API_URL || "https://ivas.sudila.com";
        const wsBaseUrl = baseUrl.replace(/^http/, "ws");
        const wsUrl = `${wsBaseUrl}/api/v1/assessments/sessions/${encodeURIComponent(sessionId)}/voice`;

        let ws: WebSocket | null = null;

        const connect = () => {
            ws = new WebSocket(wsUrl);
            wsRef.current = ws;

            ws.onopen = () => {
                console.log("Voice WebSocket connected");
                // On open, optionally tell the backend we are here for this question (if supported check first)
                if (currentQuestion?.question_instance_id) {
                    ws?.send(JSON.stringify({
                        type: 'start_session',
                        question_instance_id: currentQuestion.question_instance_id,
                        question_text: currentQuestion.question_text,
                    }));
                }
            };

            ws.onmessage = (event) => {
                try {
                    // Try to parse as JSON first (based on the sample)
                    const msg = JSON.parse(event.data);

                    // Route WebSocket actions matching the HTML test logic
                    if (msg.type === "instructor_response") {
                        addMessage({ role: "system", content: "Instructor: " + msg.message });
                        if (msg.audio_b64) playBase64Audio(msg.audio_b64, true);
                        setSending(false);
                    } else if (msg.type === "evaluation") {
                        addMessage({
                            role: "assistant",
                            content: msg.feedback || "Evaluation complete",
                            metadata: {
                                isFeedback: true,
                                score: msg.score ?? undefined,
                                misconceptions: msg.misconceptions ?? undefined,
                            },
                        });
                        if (msg.audio_b64) playBase64Audio(msg.audio_b64, true);
                    } else if (msg.type === "next_question") {
                        setCurrentQuestion({
                            ...msg,
                            question_text: msg.question_text,
                            question_instance_id: msg.question_instance_id,
                            is_follow_up: msg.is_follow_up
                        } as any);

                        addMessage({
                            role: "assistant",
                            content: msg.question_text,
                            metadata: {
                                questionType: msg.is_follow_up ? "follow_up" : "new",
                            },
                        });
                        if (msg.audio_b64) playBase64Audio(msg.audio_b64);
                        setSending(false);
                    } else if (msg.type === "session_complete") {
                        setIsComplete(true);
                        setFinalData({
                            final_score: msg.final_score,
                            max_score: msg.max_score,
                            competency_summary: msg.competency_summary,
                        });
                        if (msg.message) addMessage({ role: "system", content: msg.message });
                        if (msg.audio_b64) playBase64Audio(msg.audio_b64, true);
                        setCurrentQuestion(null);
                        setSending(false);
                    } else if (msg.type === "error") {
                        addMessage({ role: "system", content: `Error: ${msg.message}` });
                        setSending(false);
                    }

                    // Fallbacks for direct audio property payload
                    if (msg.audio) {
                        playBase64Audio(msg.audio);
                    } else if (msg.audioContent) {
                        playBase64Audio(msg.audioContent);
                    }
                } catch {
                    // Not JSON, assume raw base64 string
                    if (typeof event.data === "string" && event.data.length > 20) {
                        playBase64Audio(event.data);
                    }
                }
            };

            // --- Voice Audio Playback Logic from Test ---
            const audioQueue: string[] = [];
            let isPlaying = false;

            const playNextInQueue = () => {
                if (audioQueue.length === 0) {
                    isPlaying = false;
                    return;
                }
                isPlaying = true;
                const url = audioQueue.shift()!;
                const audio = new window.Audio(url);
                audio.onended = () => {
                    URL.revokeObjectURL(url);
                    playNextInQueue();
                };
                audio.onerror = (e) => {
                    console.error("Error playing audio", e);
                    URL.revokeObjectURL(url);
                    playNextInQueue();
                };
                audio.play().catch(e => {
                    console.warn("Audio autoplay blocked by browser or failed", e);
                    isPlaying = false;
                });
            };

            const playBase64Audio = (base64Data: string, cancelPrevious = false) => {
                try {
                    if (!base64Data) return;

                    if (cancelPrevious) {
                        audioQueue.length = 0; // Clear array
                        document.querySelectorAll('audio').forEach(audio => {
                            audio.pause();
                            audio.currentTime = 0;
                        });
                        isPlaying = false;
                    }

                    // Convert base64 to blob URL
                    const binaryString = atob(base64Data);
                    const bytes = new Uint8Array(binaryString.length);
                    for (let i = 0; i < binaryString.length; i++) {
                        bytes[i] = binaryString.charCodeAt(i);
                    }
                    const blob = new Blob([bytes], { type: 'audio/mp3' });
                    const url = URL.createObjectURL(blob);

                    audioQueue.push(url);
                    if (!isPlaying) {
                        playNextInQueue();
                    }
                } catch (err) {
                    console.error("Error queueing audio data", err);
                }
            };

            ws.onerror = (err) => {
                console.error("Voice WebSocket error", err);
                setConnectionStatus("reconnecting");
            };

            ws.onclose = () => {
                console.log("Voice WebSocket closed");
                if (wsRef.current === ws) wsRef.current = null;
                
                // Auto-reconnect if session is still in progress and not paused
                if (session?.session.status === "in_progress" && !isPaused && !isComplete && reconnectAttempts < 5) {
                    setConnectionStatus("reconnecting");
                    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 10000);
                    reconnectTimeoutRef.current = setTimeout(() => {
                        setReconnectAttempts(prev => prev + 1);
                        connect();
                    }, delay);
                    
                    addToast({
                        title: "Reconnecting...",
                        description: `Attempting to reconnect (${reconnectAttempts + 1}/5)`,
                        variant: "warning"
                    });
                } else if (reconnectAttempts >= 5) {
                    setConnectionStatus("disconnected");
                    addToast({
                        title: "Connection Lost",
                        description: "Failed to reconnect. Please refresh the page.",
                        variant: "error"
                    });
                }
            };
        };

        connect();

        return () => {
            if (ws) {
                ws.close();
            }
        };
    }, [sessionId, isComplete, initializing, user?.id]);

    const handleSubmit = async (transcribedText?: string) => {
        if (!transcribedText || !currentQuestion || sending || isComplete) return;

        let responseText = transcribedText;

        setSending(true);

        // Optimistically add user message
        addMessage({ role: "user", content: responseText });

        try {
            // If the WebSocket is alive, send over WebSocket
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({
                    type: 'message',
                    question_instance_id: currentQuestion.question_instance_id,
                    text: responseText,
                }));
            } else {
                addMessage({ role: "system", content: "Error: WebSocket stream is disconnected. Please refresh the page." });
                setSending(false);
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to submit response.";
            addMessage({ role: "system", content: `Error: ${message}` });
            setSending(false);
        }
    };


    const handleAbandon = async () => {
        try {
            setAbandoning(true);
            await ivasApi.abandonSession(sessionId);
            setIsComplete(true);
            addMessage({ role: "system", content: "Session abandoned." });
            setAbandonConfirm(false);
        } catch {
            setAbandonConfirm(false);
        } finally {
            setAbandoning(false);
        }
    };
    
    const handlePauseResume = async () => {
        try {
            if (isPaused) {
                // Resume
                const result = await ivasApi.resumeSession(sessionId);
                setIsPaused(false);
                setCurrentQuestion(result.current_question);
                addToast({
                    title: "Session Resumed",
                    variant: "success",
                });
            } else {
                // Pause
                await ivasApi.pauseSession(sessionId, "User requested pause");
                setIsPaused(true);
                addToast({
                    title: "Session Paused",
                    description: "You can resume when you're ready.",
                    variant: "warning",
                });
            }
        } catch (error) {
            addToast({
                title: "Failed to update session",
                description: error instanceof Error ? error.message : "Please try again.",
                variant: "error",
            });
        }
    };
    
    const handleRequestHint = async () => {
        if (!currentQuestion?.question_instance_id) return;
        
        try {
            const result = await ivasApi.requestHint(sessionId, currentQuestion.question_instance_id);
            setCurrentHint(result.hint_text);
            setHintsUsed(prev => prev + 1);
            setShowHintDialog(true);
            
            addToast({
                title: "Hint Available",
                description: `Penalty: ${result.penalty_applied} points`,
                variant: "default",
            });
        } catch (error) {
            addToast({
                title: "Failed to get hint",
                description: error instanceof Error ? error.message : "Please try again.",
                variant: "error",
            });
        }
    };

    if (initError) {
        return (
            <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-900/20 px-4 py-3 text-sm text-red-700 dark:text-red-400">
                {initError}
            </div>
        );
    }

    if (initializing) {
        return (
            <div className="flex flex-col gap-4 h-[calc(100vh-160px)]">
                <Skeleton className="h-14 w-full rounded-xl" />
                <div className="flex-1 space-y-4 p-4">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <Skeleton key={i} className={cn("h-16 rounded-2xl", i % 2 === 1 ? "ml-auto w-2/3" : "w-3/4")} />
                    ))}
                </div>
                <Skeleton className="h-24 w-full rounded-xl" />
            </div>
        );
    }

    const questionIndex = session
        ? session.answered_questions + 1
        : messages.filter((m) => m.role === "assistant" && !m.metadata?.isFeedback).length;

    return (
        <div className="fixed inset-0 z-[100] w-full h-full bg-black text-emerald-50 overflow-hidden font-sans selection:bg-emerald-500/30">
            {/* Ambient Background Effects */}
            <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
                <motion.div
                    animate={{
                        opacity: sending ? 0.4 : 0.15,
                        scale: sending ? 1.2 : 1,
                        x: sending ? [0, 20, 0] : 0,
                        backgroundColor: sending ? "rgba(20, 184, 166, 0.2)" : "rgba(16, 185, 129, 0.1)"
                    }}
                    transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                    className="absolute -top-[20%] -left-[10%] w-[80vw] h-[80vw] rounded-full blur-[120px]"
                />
                <motion.div
                    animate={{
                        opacity: isRecording ? 0.5 : 0.15,
                        scale: isRecording ? 1.3 : 1,
                        x: isRecording ? [0, -20, 0] : 0,
                        backgroundColor: isRecording ? "rgba(16, 185, 129, 0.25)" : "rgba(20, 184, 166, 0.1)"
                    }}
                    transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                    className="absolute -bottom-[20%] -right-[10%] w-[70vw] h-[70vw] rounded-full blur-[100px]"
                />
                <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
                <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay"></div>
            </div>

            {/* Top Navigation / HeaderBar */}
            <div className="relative z-10 flex items-center justify-between px-6 py-5">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        {connectionStatus === "connected" ? (
                            <>
                                <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.8)]" />
                                <span className="text-sm font-semibold tracking-wider text-emerald-400/90 uppercase">IVAS Session</span>
                            </>
                        ) : connectionStatus === "reconnecting" ? (
                            <>
                                <div className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                                <span className="text-sm font-semibold tracking-wider text-amber-400/90 uppercase flex items-center gap-1">
                                    Reconnecting
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                </span>
                            </>
                        ) : (
                            <>
                                <WifiOff className="h-4 w-4 text-red-500" />
                                <span className="text-sm font-semibold tracking-wider text-red-400/90 uppercase">Disconnected</span>
                            </>
                        )}
                    </div>
                    {session && !isComplete && (
                        <div className="flex items-center gap-3 ml-4 bg-zinc-900/30 px-3 py-1 rounded-full border border-zinc-800/50">
                            <span className="text-xs font-medium text-zinc-400">
                                Q{questionIndex} / {session.total_questions}
                            </span>
                            <div className="h-3 w-[1px] bg-zinc-800" />
                            <span className="text-xs font-mono text-zinc-500">
                                {Math.floor(recordingTime / 60)}:{(recordingTime % 60).toString().padStart(2, '0')}
                            </span>
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-3">
                    {!isComplete && session?.session.status === "in_progress" && (
                        <>
                            {/* Hint Button */}
                            <Button 
                                variant="outline" 
                                size="sm" 
                                className="bg-zinc-900/40 border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:text-white backdrop-blur-md rounded-full px-4 transition-all"
                                onClick={handleRequestHint}
                            >
                                <Lightbulb className="h-4 w-4 mr-2" />
                                Hint
                            </Button>
                            
                            {/* Pause/Resume Button */}
                            <Button 
                                variant="outline" 
                                size="sm" 
                                className={cn(
                                    "backdrop-blur-md rounded-full px-4 transition-all",
                                    isPaused 
                                        ? "bg-emerald-600/20 border-emerald-500/50 text-emerald-400 hover:bg-emerald-600/30" 
                                        : "bg-zinc-900/40 border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                                )}
                                onClick={handlePauseResume}
                            >
                                {isPaused ? (
                                    <>
                                        <Play className="h-4 w-4 mr-2" />
                                        Resume
                                    </>
                                ) : (
                                    <>
                                        <Pause className="h-4 w-4 mr-2" />
                                        Pause
                                    </>
                                )}
                            </Button>
                        </>
                    )}
                    
                    <Sheet>
                        <SheetTrigger asChild>
                            <Button variant="outline" size="sm" className="bg-zinc-900/40 border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:text-white backdrop-blur-md rounded-full px-4 transition-all">
                                <List className="h-4 w-4 mr-2" /> History
                            </Button>
                        </SheetTrigger>
                        <SheetContent className="bg-zinc-950/95 border-zinc-800 text-zinc-100 p-0 sm:max-w-md w-[85vw] backdrop-blur-xl">
                            <SheetHeader className="p-6 border-b border-zinc-800/60 bg-zinc-900/20">
                                <SheetTitle className="text-zinc-100 flex items-center gap-2">
                                    <Activity className="h-4 w-4 text-emerald-500" />
                                    Session History
                                </SheetTitle>
                            </SheetHeader>
                            <TranscriptPanel messages={messages} />
                        </SheetContent>
                    </Sheet>

                    {!isComplete ? (
                        <div className="flex gap-2">
                            {abandonConfirm ? (
                                <div className="flex items-center bg-red-950/40 border border-red-900/50 rounded-full pl-3 pr-1 py-1 backdrop-blur-md">
                                    <Button size="sm" variant="destructive" className="h-7 px-3 text-xs rounded-full bg-red-600/80 hover:bg-red-600" onClick={handleAbandon} disabled={abandoning}>
                                        {abandoning ? <Loader2 className="h-3 w-3 animate-spin" /> : "Confirm End"}
                                    </Button>
                                    <Button size="icon" variant="ghost" className="h-7 w-7 text-red-300 hover:text-red-100 hover:bg-white/10 rounded-full" onClick={() => setAbandonConfirm(false)}>
                                        <XCircle className="h-4 w-4" />
                                    </Button>
                                </div>
                            ) : (
                                <Button size="sm" variant="ghost" className="text-zinc-400 hover:text-red-400 hover:bg-red-500/10 rounded-full transition-colors" onClick={() => setAbandonConfirm(true)}>
                                    <XCircle className="h-4 w-4" />
                                </Button>
                            )}
                        </div>
                    ) : (
                        <Button asChild size="sm" className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-full shadow-[0_0_15px_rgba(16,185,129,0.3)]">
                            <Link href={`/student/assessments/results/${sessionId}`}>
                                <BarChart3 className="h-4 w-4 mr-2" /> Results
                            </Link>
                        </Button>
                    )}
                </div>
            </div>

            {/* CenterStage */}
            <main className="flex-1 relative z-10 flex flex-col items-center justify-center px-6 w-full max-w-5xl mx-auto h-full overflow-y-auto pt-10 pb-32">
                <AICoreOrb state={isComplete ? "idle" : sending ? "thinking" : isRecording ? "user_speaking" : "ai_speaking"} />

                <div className="mt-16 w-full text-center space-y-8 select-none">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={currentQuestion?.question_instance_id || 'done'}
                            initial={{ opacity: 0, y: 20, filter: 'blur(10px)' }}
                            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                            exit={{ opacity: 0, y: -20, filter: 'blur(10px)' }}
                            transition={{ duration: 0.6, ease: [0.23, 1, 0.32, 1] }}
                            className="max-w-3xl mx-auto"
                        >
                            {isComplete ? (
                                <div className="space-y-6">
                                    <h2 className="text-4xl sm:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-emerald-300 to-teal-400 tracking-tight">
                                        Session Complete
                                    </h2>
                                    <p className="text-zinc-400 text-lg max-w-lg mx-auto leading-relaxed">
                                        You have successfully finished the viva assessment. View your detailed feedback in the results page.
                                    </p>
                                </div>
                            ) : (
                                <h2 className="text-2xl sm:text-3xl md:text-4xl font-medium text-zinc-100 leading-tight tracking-tight">
                                    {currentQuestion?.question_text || "I'm preparing the next sequence..."}
                                </h2>
                            )}
                        </motion.div>
                    </AnimatePresence>

                    {/* Voice Feedback Layer */}
                    <div className="min-h-[100px] flex flex-col items-center justify-center">
                        <AnimatePresence>
                            {isRecording && (
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.98 }}
                                    className="max-w-2xl px-4"
                                >
                                    <p className="text-lg sm:text-xl text-emerald-400/70 font-medium leading-normal italic text-center">
                                        {interimTranscript || "Listening..."}
                                    </p>
                                    <div className="mt-4 flex justify-center">
                                        <VoiceWaveform audioData={audioData} />
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {!isRecording && sending && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="flex flex-col items-center gap-2"
                            >
                                <div className="flex gap-1">
                                    {[0, 1, 2].map(i => (
                                        <motion.div
                                            key={i}
                                            animate={{ opacity: [0.2, 1, 0.2] }}
                                            transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                                            className="h-1.5 w-1.5 rounded-full bg-emerald-500"
                                        />
                                    ))}
                                </div>
                                <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-bold">Processing Neural Response</span>
                            </motion.div>
                        )}
                    </div>
                </div>
            </main>

            {/* VoiceControls (Bottom Dock) */}
            <div className="fixed bottom-0 left-0 right-0 z-30 pb-10 pt-10 pointer-events-none">
                <div className="max-w-md mx-auto flex flex-col items-center gap-4 pointer-events-auto">
                    {!isComplete && (
                        <div className="relative">
                            {isRecording && (
                                <motion.div
                                    animate={{ scale: [1, 2], opacity: [0.5, 0] }}
                                    transition={{ duration: 1.5, repeat: Infinity, ease: "easeOut" }}
                                    className="absolute inset-0 rounded-full bg-red-500/30 -z-10"
                                />
                            )}
                            <motion.button
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={() => isRecording ? stopRecording(true) : startRecording()}
                                disabled={sending}
                                className={cn(
                                    "flex h-20 w-20 items-center justify-center rounded-full transition-all duration-500 shadow-2xl",
                                    isRecording
                                        ? "bg-red-500 text-white"
                                        : sending
                                            ? "bg-zinc-800 text-zinc-600 cursor-not-allowed"
                                            : "bg-zinc-100 hover:bg-white text-zinc-950"
                                )}
                            >
                                {sending ? (
                                    <Loader2 className="h-8 w-8 animate-spin" />
                                ) : isRecording ? (
                                    <Square className="h-8 w-8 fill-current" />
                                ) : (
                                    <Mic className="h-9 w-9" />
                                )}
                            </motion.button>
                        </div>
                    )}

                    <AnimatePresence>
                        {!isComplete && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-500"
                            >
                                {isRecording ? "Active Capture" : sending ? "Synchronizing" : "System Ready"}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>


            {/* Hint Dialog */}
            <Dialog open={showHintDialog} onOpenChange={setShowHintDialog}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Lightbulb className="h-5 w-5 text-amber-500" />
                            Hint Available
                        </DialogTitle>
                        <DialogDescription>
                            Use this hint to help answer the current question. Note: Hints may affect your final score.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/40">
                            <p className="text-sm text-amber-800 dark:text-amber-200 leading-relaxed">
                                {currentHint}
                            </p>
                        </div>
                        <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                            <span>Hints used in this session: {hintsUsed}</span>
                            <span className="text-amber-600 dark:text-amber-400">Penalty applied</span>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button onClick={() => setShowHintDialog(false)}>
                            Got it
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Error Overlay */}
            <AnimatePresence>
                {initError && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-sm"
                    >
                        <div className="max-w-md w-full bg-red-950/90 border border-red-900/50 p-6 rounded-2xl shadow-2xl backdrop-blur-xl">
                            <div className="flex items-center gap-3 text-red-400 mb-2">
                                <AlertTriangle className="h-6 w-6" />
                                <h3 className="text-xl font-bold">Session Error</h3>
                            </div>
                            <p className="text-red-200/80 mb-6">{initError}</p>
                            <Button asChild className="w-full bg-red-600 hover:bg-red-500 text-white border-0">
                                <Link href="/student/assessments/dashboard">Return to Dashboard</Link>
                            </Button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
