"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Mic2, Play, BookOpen, Code2, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toaster";
import { ivasApi } from "@/lib/ivas-api";
import { useAuthStore } from "@/lib/stores/authStore";
import type { IvasAssignment } from "@/types/ivas";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

export default function StartAssessmentPage() {
    const router = useRouter();
    const { addToast } = useToast();
    const user = useAuthStore((s) => s.user);
    
    const [assignments, setAssignments] = React.useState<IvasAssignment[]>([]);
    const [selectedAssignment, setSelectedAssignment] = React.useState<string>("");
    const [codeContext, setCodeContext] = React.useState("");
    const [loading, setLoading] = React.useState(true);
    const [starting, setStarting] = React.useState(false);

    React.useEffect(() => {
        async function loadAssignments() {
            try {
                setLoading(true);
                const data = await ivasApi.getAssignments();
                setAssignments(data);
                if (data.length > 0 && !selectedAssignment) {
                    setSelectedAssignment(data[0].assignment_id);
                }
            } catch (error) {
                addToast({ 
                    title: "Failed to load assignments", 
                    variant: "error",
                    description: error instanceof Error ? error.message : "Unknown error"
                });
            } finally {
                setLoading(false);
            }
        }
        loadAssignments();
    }, [addToast, selectedAssignment]);

    const handleStartAssessment = async () => {
        if (!selectedAssignment || !user?.id) {
            addToast({ 
                title: "Missing information", 
                variant: "warning",
                description: "Please select an assignment and ensure you're logged in."
            });
            return;
        }

        try {
            setStarting(true);
            const result = await ivasApi.startAssessment({
                student_id: user.id,
                assignment_id: selectedAssignment,
                code_context: codeContext.trim() || undefined,
            });

            addToast({
                title: "Assessment started!",
                variant: "success",
                description: "Redirecting to your viva session..."
            });

            router.push(`/student/assessments/viva/${result.session_id}`);
        } catch (error) {
            addToast({ 
                title: "Failed to start assessment", 
                variant: "error",
                description: error instanceof Error ? error.message : "Please try again."
            });
        } finally {
            setStarting(false);
        }
    };

    if (!user?.id) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <Card className="max-w-md">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <AlertCircle className="h-5 w-5 text-amber-500" />
                            Authentication Required
                        </CardTitle>
                        <CardDescription>
                            Please log in to start a viva assessment.
                        </CardDescription>
                    </CardHeader>
                </Card>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-8 pb-8 max-w-4xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border/40 pb-6">
                <div>
                    <h1 className="text-2xl font-black tracking-tight">Start Viva Assessment</h1>
                    <p className="text-sm text-muted-foreground">
                        Select an assignment and begin your oral assessment.
                    </p>
                </div>
            </div>

            <div className="grid gap-6">
                {/* Assignment Selection */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <BookOpen className="h-5 w-5" />
                            Select Assignment
                        </CardTitle>
                        <CardDescription>
                            Choose the assignment you want to be assessed on.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {loading ? (
                            <div className="flex items-center justify-center py-8">
                                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                            </div>
                        ) : assignments.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground">
                                <AlertCircle className="h-12 w-12 mx-auto mb-2 opacity-50" />
                                <p>No assignments available.</p>
                                <p className="text-xs">Contact your instructor to create assignments.</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <Label htmlFor="assignment-select">Assignment</Label>
                                <Select 
                                    value={selectedAssignment} 
                                    onValueChange={setSelectedAssignment}
                                >
                                    <SelectTrigger id="assignment-select" className="w-full">
                                        <SelectValue placeholder="Select an assignment" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {assignments.map((assignment) => (
                                            <SelectItem 
                                                key={assignment.assignment_id} 
                                                value={assignment.assignment_id}
                                            >
                                                {assignment.title}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {selectedAssignment && (
                                    <div className="mt-3 p-3 rounded-lg bg-muted/50 border border-border/60">
                                        <p className="text-xs text-muted-foreground mb-2 font-medium">Selected Assignment:</p>
                                        <p className="text-sm font-semibold">{assignments.find(a => a.assignment_id === selectedAssignment)?.title}</p>
                                        <div className="mt-2 flex flex-wrap gap-1">
                                            {assignments.find(a => a.assignment_id === selectedAssignment)?.competencies.map((c) => (
                                                <span key={c} className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                                                    {c}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Code Context (Optional) */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Code2 className="h-5 w-5" />
                            Code Context (Optional)
                        </CardTitle>
                        <CardDescription>
                            Provide your code for context-based questions. This helps the AI understand your implementation.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="code-context">Your Code</Label>
                            <Textarea
                                id="code-context"
                                rows={10}
                                placeholder="// Paste your code here...&#10;public class Solution {&#10;    public static void main(String[] args) {&#10;        // Your implementation&#10;    }&#10;}"
                                value={codeContext}
                                onChange={(e) => setCodeContext(e.target.value)}
                                className="font-mono text-sm resize-none"
                            />
                            <p className="text-xs text-muted-foreground">
                                The AI will analyze your code to ask relevant questions about your implementation choices.
                            </p>
                        </div>
                    </CardContent>
                </Card>

                {/* Start Button */}
                <div className="flex justify-end gap-3">
                    <Button 
                        variant="outline" 
                        onClick={() => router.back()}
                        disabled={starting}
                    >
                        Cancel
                    </Button>
                    <Button 
                        onClick={handleStartAssessment}
                        disabled={starting || !selectedAssignment || assignments.length === 0}
                        className="gap-2"
                    >
                        {starting ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Starting...
                            </>
                        ) : (
                            <>
                                <Play className="h-4 w-4" />
                                Start Viva Assessment
                            </>
                        )}
                    </Button>
                </div>
            </div>

            {/* Instructions */}
            <Card className="bg-muted/50 border-dashed">
                <CardHeader>
                    <CardTitle className="text-base">How It Works</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                    <div className="flex gap-3">
                        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                            1
                        </div>
                        <p className="text-muted-foreground">
                            Select an assignment from the list above. Make sure you've completed the required work.
                        </p>
                    </div>
                    <div className="flex gap-3">
                        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                            2
                        </div>
                        <p className="text-muted-foreground">
                            Optionally paste your code in the code context box. This allows the AI to ask specific questions about your implementation.
                        </p>
                    </div>
                    <div className="flex gap-3">
                        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                            3
                        </div>
                        <p className="text-muted-foreground">
                            Click &quot;Start Viva Assessment&quot; to begin. You'll be presented with a series of questions about your understanding.
                        </p>
                    </div>
                    <div className="flex gap-3">
                        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                            4
                        </div>
                        <p className="text-muted-foreground">
                            Answer questions using voice or text. The AI will evaluate your responses and provide immediate feedback.
                        </p>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
