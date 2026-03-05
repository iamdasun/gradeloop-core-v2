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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ivasApi } from "@/lib/ivas-api";
import { useAuthStore } from "@/lib/stores/authStore";
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

// ── Message bubble ─────────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: ChatMessage }) {
    if (msg.role === "system") {
        return (
            <div className="flex justify-center">
                <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
                    {msg.content}
                </span>
            </div>
        );
    }

    if (msg.role === "user") {
        return (
            <div className="flex justify-end">
                <div className="max-w-[75%] rounded-2xl rounded-tr-sm bg-primary text-primary-foreground px-4 py-2.5">
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                </div>
            </div>
        );
    }

    // assistant
    const meta = msg.metadata;
    const isQuestion = !meta?.isFeedback && meta?.questionType !== undefined;
    const isFeedback = meta?.isFeedback === true;

    if (isFeedback) {
        // Check if it's a teaching message (teach_and_skip classification — indicated by Info style)
        return (
            <div className="flex gap-3">
                <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Info className="h-3.5 w-3.5 text-primary" />
                </div>
                <div className="flex-1 max-w-[80%] rounded-2xl rounded-tl-sm bg-muted/50 px-4 py-3 space-y-2">
                    {meta?.score !== undefined && (
                        <ScoreBadge score={meta.score} />
                    )}
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    {meta?.misconceptions && meta.misconceptions.length > 0 && (
                        <div className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/40 px-3 py-2">
                            <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
                            <p className="text-xs text-amber-700 dark:text-amber-400">
                                <span className="font-medium">Misconceptions: </span>
                                {meta.misconceptions.join(", ")}
                            </p>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    if (isQuestion) {
        return (
            <div className="flex gap-3">
                <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Mic2 className="h-3.5 w-3.5 text-primary" />
                </div>
                <div className="flex-1 max-w-[80%] rounded-2xl rounded-tl-sm bg-card border border-border/60 px-4 py-3 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                        {meta?.competency && (
                            <Badge variant="secondary" className="text-xs">{meta.competency}</Badge>
                        )}
                        {meta?.difficulty !== undefined && (
                            <span className="text-xs text-muted-foreground">Difficulty {meta.difficulty}</span>
                        )}
                        {meta?.questionType === "follow_up" && (
                            <span className="inline-flex items-center gap-1 text-xs text-primary/70">
                                <CornerDownRight className="h-3 w-3" />
                                Follow-up
                            </span>
                        )}
                        {meta?.questionType === "re_ask" && (
                            <span className="text-xs text-muted-foreground italic">Let&apos;s try this again</span>
                        )}
                    </div>
                    <p className="text-sm font-medium whitespace-pre-wrap">{msg.content}</p>
                </div>
            </div>
        );
    }

    // Plain assistant message
    return (
        <div className="flex gap-3">
            <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                <Mic2 className="h-3.5 w-3.5 text-primary" />
            </div>
            <div className="max-w-[80%] rounded-2xl rounded-tl-sm bg-muted/50 px-4 py-3">
                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
            </div>
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

    const bottomRef = React.useRef<HTMLDivElement>(null);
    const textareaRef = React.useRef<HTMLTextAreaElement>(null);

    const scrollToBottom = () => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    React.useEffect(() => {
        scrollToBottom();
    }, [messages]);

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

    const handleSubmit = async () => {
        if (!inputValue.trim() || !currentQuestion || sending || isComplete) return;

        const responseText = inputValue.trim();
        setInputValue("");
        setSending(true);

        // Optimistically add user message
        addMessage({ role: "user", content: responseText });

        try {
            const result = await ivasApi.submitResponse(sessionId, {
                question_instance_id: currentQuestion.question_instance_id,
                response_text: responseText,
            });

            // Add feedback message
            if (result.feedback_text) {
                addMessage({
                    role: "assistant",
                    content: result.feedback_text,
                    metadata: {
                        isFeedback: true,
                        score: result.evaluation_score ?? undefined,
                        misconceptions: result.detected_misconceptions ?? undefined,
                    },
                });
            }

            // System message if present
            if (result.message) {
                addMessage({ role: "system", content: result.message });
            }

            if (result.is_complete) {
                setIsComplete(true);
                setFinalData({
                    final_score: result.final_score,
                    max_score: result.max_score,
                    competency_summary: result.competency_summary,
                });
                setCurrentQuestion(null);
            } else if (result.next_question) {
                setCurrentQuestion(result.next_question);
                addMessage({
                    role: "assistant",
                    content: result.next_question.question_text,
                    metadata: {
                        competency: result.next_question.competency,
                        difficulty: result.next_question.difficulty,
                        questionType: result.next_question.question_type,
                    },
                });
            }
        } catch (err) {
            const message =
                err instanceof Error ? err.message : "Failed to submit response.";
            if (message.toLowerCase().includes("already")) {
                addMessage({ role: "system", content: "Response already submitted." });
            } else if (message.toLowerCase().includes("not active") || message.toLowerCase().includes("400")) {
                addMessage({ role: "system", content: "Session has ended." });
                setIsComplete(true);
            } else {
                addMessage({ role: "system", content: `Error: ${message}` });
            }
        } finally {
            setSending(false);
            textareaRef.current?.focus();
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
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
        <div className="flex flex-col h-[calc(100dvh-120px)] max-h-[900px]">
            {/* Session Header */}
            <div className="flex items-center justify-between gap-3 border-b border-border/40 pb-4 mb-4 shrink-0">
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                            <Mic2 className="h-5 w-5 text-primary" />
                        </div>
                        {!isComplete && (
                            <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-500 border-2 border-background animate-pulse" />
                        )}
                    </div>
                    <div>
                        <h1 className="text-lg font-bold leading-tight">Viva Assessment</h1>
                        <p className="text-xs text-muted-foreground">
                            {isComplete ? (
                                <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                                    <CheckCircle2 className="h-3 w-3" /> Completed
                                </span>
                            ) : (
                                `Question ${questionIndex} of ${session?.total_questions ?? "?"}`
                            )}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {!isComplete && (
                        <>
                            {abandonConfirm ? (
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-muted-foreground">Abandon this session?</span>
                                    <Button
                                        size="sm"
                                        variant="destructive"
                                        onClick={handleAbandon}
                                        disabled={abandoning}
                                    >
                                        {abandoning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Yes, abandon"}
                                    </Button>
                                    <Button size="sm" variant="ghost" onClick={() => setAbandonConfirm(false)}>
                                        Cancel
                                    </Button>
                                </div>
                            ) : (
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-muted-foreground"
                                    onClick={() => setAbandonConfirm(true)}
                                >
                                    <XCircle className="h-3.5 w-3.5 mr-1" />
                                    Abandon
                                </Button>
                            )}
                        </>
                    )}
                    {isComplete && (
                        <Button asChild size="sm" variant="outline">
                            <Link href={`/student/assessments/results/${sessionId}`}>
                                <BarChart3 className="h-3.5 w-3.5 mr-1" />
                                View Results
                            </Link>
                        </Button>
                    )}
                </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                {messages.map((msg) => (
                    <MessageBubble key={msg.id} msg={msg} />
                ))}

                {/* Typing indicator */}
                {sending && (
                    <div className="flex gap-3">
                        <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                            <Loader2 className="h-3.5 w-3.5 text-primary animate-spin" />
                        </div>
                        <div className="rounded-2xl rounded-tl-sm bg-muted/50 px-4 py-3">
                            <p className="text-sm text-muted-foreground italic">AI is evaluating your response…</p>
                        </div>
                    </div>
                )}

                {/* Completion card */}
                {isComplete && finalData && (
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-900/20 p-5 space-y-4">
                        <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 font-semibold">
                            <CheckCircle2 className="h-5 w-5" />
                            Assessment Complete!
                        </div>
                        {finalData.final_score !== null && finalData.max_score !== null && (
                            <div>
                                <p className="text-3xl font-black text-emerald-700 dark:text-emerald-400">
                                    {finalData.final_score}/{finalData.max_score}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                    {Math.round((finalData.final_score / finalData.max_score) * 100)}% overall
                                </p>
                            </div>
                        )}
                        {finalData.competency_summary && finalData.competency_summary.length > 0 && (
                            <div className="space-y-2">
                                {finalData.competency_summary.map((item) => (
                                    <CompetencyBar key={item.competency} item={item} />
                                ))}
                            </div>
                        )}
                        <Button asChild className="w-full">
                            <Link href={`/student/assessments/results/${sessionId}`}>
                                <BarChart3 className="h-4 w-4 mr-2" />
                                View Full Results
                            </Link>
                        </Button>
                    </div>
                )}

                <div ref={bottomRef} />
            </div>

            {/* Input Area */}
            <div className="shrink-0 mt-4 border-t border-border/40 pt-4">
                {isComplete ? (
                    <div className="rounded-xl border border-dashed border-border/60 p-4 text-center text-sm text-muted-foreground">
                        This session has ended.
                    </div>
                ) : (
                    <div className="flex gap-3 items-end">
                        <Textarea
                            ref={textareaRef}
                            rows={3}
                            placeholder="Type your answer… (Enter to send, Shift+Enter for new line)"
                            className="flex-1 resize-none"
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onKeyDown={handleKeyDown}
                            disabled={sending || isComplete}
                        />
                        <Button
                            size="icon"
                            className="h-[72px] w-12 shrink-0"
                            onClick={handleSubmit}
                            disabled={!inputValue.trim() || sending || isComplete}
                        >
                            {sending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <Send className="h-4 w-4" />
                            )}
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}
