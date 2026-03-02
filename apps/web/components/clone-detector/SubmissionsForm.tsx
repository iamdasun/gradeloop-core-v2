"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import type { AssignmentClusterRequest, SubmissionItem } from "@/types/cipas";

const SUPPORTED_LANGUAGES = [
  "java",
  "python",
  "cpp",
  "c",
  "javascript",
  "typescript",
  "go",
  "rust",
] as const;

interface Props {
  onSubmit: (req: AssignmentClusterRequest) => void;
  isLoading: boolean;
}

const makeSubmission = (): SubmissionItem => ({
  submission_id: `sub-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  student_id: "",
  source_code: "",
});

export function SubmissionsForm({ onSubmit, isLoading }: Props) {
  const [assignmentId, setAssignmentId] = useState("assignment-01");
  const [language, setLanguage] = useState<string>("java");
  const [lshThreshold, setLshThreshold] = useState("0.3");
  const [minConfidence, setMinConfidence] = useState("0.0");
  const [instructorTemplate, setInstructorTemplate] = useState("");
  const [submissions, setSubmissions] = useState<SubmissionItem[]>([
    { ...makeSubmission(), submission_id: "sub-001", student_id: "student-A" },
    { ...makeSubmission(), submission_id: "sub-002", student_id: "student-B" },
  ]);

  const addSubmission = () => {
    setSubmissions((prev) => [...prev, makeSubmission()]);
  };

  const removeSubmission = (idx: number) => {
    setSubmissions((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateSubmission = (
    idx: number,
    field: keyof SubmissionItem,
    value: string
  ) => {
    setSubmissions((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, [field]: value } : s))
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      assignment_id: assignmentId.trim(),
      language: language.trim(),
      submissions,
      instructor_template: instructorTemplate.trim() || undefined,
      lsh_threshold: parseFloat(lshThreshold) || 0.3,
      min_confidence: parseFloat(minConfidence) || 0.0,
    });
  };

  const isValid =
    assignmentId.trim() &&
    language.trim() &&
    submissions.length >= 2 &&
    submissions.every((s) => s.student_id.trim() && s.source_code.trim());

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Assignment metadata */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="assignment-id">Assignment ID</Label>
          <Input
            id="assignment-id"
            value={assignmentId}
            onChange={(e) => setAssignmentId(e.target.value)}
            placeholder="assignment-01"
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="language">Language</Label>
          <select
            id="language"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="flex h-9 w-full rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
          >
            {SUPPORTED_LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="lsh-threshold">LSH Threshold</Label>
          <Input
            id="lsh-threshold"
            type="number"
            step="0.05"
            min="0"
            max="1"
            value={lshThreshold}
            onChange={(e) => setLshThreshold(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="min-confidence">Min Confidence</Label>
          <Input
            id="min-confidence"
            type="number"
            step="0.05"
            min="0"
            max="1"
            value={minConfidence}
            onChange={(e) => setMinConfidence(e.target.value)}
          />
        </div>
      </div>

      {/* Optional instructor template */}
      <div className="space-y-1.5">
        <Label htmlFor="instructor-template">
          Instructor Template{" "}
          <span className="text-zinc-400 font-normal">(optional — used to filter boilerplate)</span>
        </Label>
        <textarea
          id="instructor-template"
          value={instructorTemplate}
          onChange={(e) => setInstructorTemplate(e.target.value)}
          rows={4}
          placeholder="Paste instructor starter code here…"
          className="flex w-full rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm font-mono shadow-sm focus:outline-none focus:ring-2 focus:ring-zinc-400 resize-y"
        />
      </div>

      {/* Submissions */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>
            Student Submissions{" "}
            <span className="text-zinc-400 font-normal">({submissions.length})</span>
          </Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addSubmission}
          >
            <Plus className="h-4 w-4 mr-1" />
            Add
          </Button>
        </div>

        <div className="space-y-3">
          {submissions.map((sub, idx) => (
            <Card key={idx} className="border-zinc-200 dark:border-zinc-700">
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="grid grid-cols-2 gap-3 flex-1">
                    <div className="space-y-1">
                      <Label className="text-xs text-zinc-500">Submission ID</Label>
                      <Input
                        value={sub.submission_id}
                        onChange={(e) =>
                          updateSubmission(idx, "submission_id", e.target.value)
                        }
                        placeholder="sub-001"
                        className="h-8 text-xs font-mono"
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-zinc-500">Student ID</Label>
                      <Input
                        value={sub.student_id}
                        onChange={(e) =>
                          updateSubmission(idx, "student_id", e.target.value)
                        }
                        placeholder="student-001"
                        className="h-8 text-xs"
                        required
                      />
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-zinc-400 hover:text-red-500"
                    onClick={() => removeSubmission(idx)}
                    disabled={submissions.length <= 2}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-zinc-500">Source Code</Label>
                  <textarea
                    value={sub.source_code}
                    onChange={(e) =>
                      updateSubmission(idx, "source_code", e.target.value)
                    }
                    rows={6}
                    placeholder="Paste source code here…"
                    className="flex w-full rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-xs font-mono shadow-sm focus:outline-none focus:ring-2 focus:ring-zinc-400 resize-y"
                    required
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <Button
        type="submit"
        disabled={!isValid || isLoading}
        className="w-full"
      >
        {isLoading ? "Analysing…" : "Detect Collusion"}
      </Button>
    </form>
  );
}
