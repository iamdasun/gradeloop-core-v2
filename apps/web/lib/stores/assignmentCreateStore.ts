import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

// ─── Stepper ──────────────────────────────────────────────────────────────────

export interface StepperStep {
    id: string;
    title: string;
    description?: string;
}

// ─── Data shapes ──────────────────────────────────────────────────────────────

export interface AssignmentDraft {
    name: string;
    type: "lab" | "exam";
    description: string;
    /** Used by the LLM evaluation engine — not shown to students */
    objective: string;
}

export interface SettingsDraft {
    /** Judge0 language ID for the assignment */
    language_id: number;
    release_date: string;
    due_date: string;
    allow_late_submission: boolean;
    late_due_date: string;
    time_limit_enabled: boolean;
    time_limit_minutes: number | null;
    group_submission: boolean;
    multiple_submissions: boolean;
}

export interface RubricBand {
    description: string;
    mark_range: { min: number; max: number };
}

export interface RubricCriterion {
    id: string;
    name: string;
    description: string;
    grading_mode: "deterministic" | "llm" | "llm_ast";
    weight: number;
    bands: {
        excellent: RubricBand;
        good: RubricBand;
        satisfactory: RubricBand;
        unsatisfactory: RubricBand;
    };
}

export interface TestCase {
    test_case_id: number;
    description: string;
    test_case_input: string;
    expected_output: string;
}

export interface SampleAnswerDraft {
    language_id: number;
    code: string;
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_ASSIGNMENT: AssignmentDraft = {
    name: "",
    type: "lab",
    description: "",
    objective: "",
};

const DEFAULT_SETTINGS: SettingsDraft = {
    language_id: 71, // Python 3.8.1
    release_date: "",
    due_date: "",
    allow_late_submission: false,
    late_due_date: "",
    time_limit_enabled: false,
    time_limit_minutes: 90,
    group_submission: false,
    multiple_submissions: false,
};

export const DEFAULT_SAMPLE_ANSWER: SampleAnswerDraft = {
    language_id: 71,
    code: "",
};

export const DEFAULT_CRITERIA: RubricCriterion[] = [
    {
        id: "default-1",
        name: "Code Correctness",
        description: "Solution produces correct output for all given test cases.",
        grading_mode: "llm",
        weight: 60,
        bands: {
            excellent:      { description: "All edge cases handled, optimal solution",          mark_range: { min: 85, max: 100 } },
            good:           { description: "Most cases correct, minor issues only",             mark_range: { min: 70, max: 84 } },
            satisfactory:   { description: "Basic cases pass, significant gaps remain",         mark_range: { min: 50, max: 69 } },
            unsatisfactory: { description: "Fails most test cases",                             mark_range: { min: 0,  max: 49 } },
        },
    },
    {
        id: "default-2",
        name: "Code Quality",
        description: "Readability, naming conventions, and overall code structure.",
        grading_mode: "llm",
        weight: 40,
        bands: {
            excellent:      { description: "Clean, well-documented, follows best practices",   mark_range: { min: 85, max: 100 } },
            good:           { description: "Mostly readable with minor style issues",          mark_range: { min: 70, max: 84 } },
            satisfactory:   { description: "Functional but hard to follow",                   mark_range: { min: 50, max: 69 } },
            unsatisfactory: { description: "Poor structure, undocumented code",               mark_range: { min: 0,  max: 49 } },
        },
    },
];

const DEFAULT_STEPS: StepperStep[] = [
    { id: "create",   title: "Create Assignment",   description: "Name, type & description"  },
    { id: "settings", title: "Assignment Settings", description: "Dates & submission rules"  },
    { id: "rubric",   title: "Rubric",              description: "Grading criteria & bands"  },
    { id: "tests",    title: "Test Cases",          description: "Automated test cases"      },
    { id: "sample",   title: "Sample Answer",       description: "Reference solution"        },
    { id: "review",   title: "Review & Publish",    description: "Final review"              },
];

// ─── Store ────────────────────────────────────────────────────────────────────

interface AssignmentCreateState {
    // Navigation (NOT persisted — always start at step 1)
    currentStep: number;
    highestStepVisited: number;
    steps: StepperStep[];

    // Form data (persisted to localStorage as a draft)
    assignment: AssignmentDraft;
    settings: SettingsDraft;
    criteria: RubricCriterion[];
    testCases: TestCase[];
    sampleAnswer: SampleAnswerDraft;

    // Actions
    setStep: (step: number) => void;
    setHighestStepVisited: (step: number) => void;
    updateAssignment: (data: Partial<AssignmentDraft>) => void;
    updateSettings: (data: Partial<SettingsDraft>) => void;
    setCriteria: (criteria: RubricCriterion[]) => void;
    setTestCases: (cases: TestCase[]) => void;
    updateSampleAnswer: (data: Partial<SampleAnswerDraft>) => void;
    reset: () => void;
}

export const useAssignmentCreateStore = create<AssignmentCreateState>()(
    persist(
        (set) => ({
            currentStep: 1,
            highestStepVisited: 1,
            steps: DEFAULT_STEPS,

            assignment: DEFAULT_ASSIGNMENT,
            settings: DEFAULT_SETTINGS,
            criteria: DEFAULT_CRITERIA,
            testCases: [],
            sampleAnswer: DEFAULT_SAMPLE_ANSWER,

            setStep: (step) =>
                set((state) => ({
                    currentStep: step,
                    highestStepVisited: Math.max(state.highestStepVisited, step),
                })),
            setHighestStepVisited: (step) =>
                set((state) => ({ highestStepVisited: Math.max(state.highestStepVisited, step) })),
            updateAssignment: (data) =>
                set((state) => ({ assignment: { ...state.assignment, ...data } })),
            updateSettings: (data) =>
                set((state) => ({ settings: { ...state.settings, ...data } })),
            setCriteria: (criteria) => set({ criteria }),
            setTestCases: (testCases) => set({ testCases }),
            updateSampleAnswer: (data) =>
                set((state) => ({ sampleAnswer: { ...state.sampleAnswer, ...data } })),
            reset: () =>
                set({
                    currentStep: 1,
                    highestStepVisited: 1,
                    assignment: DEFAULT_ASSIGNMENT,
                    settings: DEFAULT_SETTINGS,
                    criteria: DEFAULT_CRITERIA,
                    testCases: [],
                    sampleAnswer: DEFAULT_SAMPLE_ANSWER,
                }),
        }),
        {
            name: "gradeloop-assignment-draft",
            storage: createJSONStorage(() => localStorage),
            // Only persist form data — navigation resets on page load
            partialize: (state) => ({
                assignment: state.assignment,
                settings: state.settings,
                criteria: state.criteria,
                testCases: state.testCases,
                sampleAnswer: state.sampleAnswer,
            }),
        },
    ),
);
