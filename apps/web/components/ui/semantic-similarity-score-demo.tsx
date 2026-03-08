"use client";

import { SemanticSimilarityScore, SemanticSimilarityBar, SemanticSimilarityGauge } from "./semantic-similarity-score";

/**
 * Example usage of the SemanticSimilarityScore components
 * This demonstrates all variants and use cases
 */
export function SemanticSimilarityScoreDemo() {
  return (
    <div className="space-y-8 p-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-4">
          Semantic Similarity Score Components
        </h2>

        {/* Size Variants */}
        <div className="space-y-4 mb-8">
          <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Size Variants
          </h3>
          <div className="flex flex-wrap items-center gap-6">
            <SemanticSimilarityScore score={94} change={2.4} size="sm" />
            <SemanticSimilarityScore score={94} change={2.4} size="md" />
            <SemanticSimilarityScore score={94} change={2.4} size="lg" />
          </div>
        </div>

        {/* Score Variants */}
        <div className="space-y-4 mb-8">
          <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Score Variants (Different Scores)
          </h3>
          <div className="flex flex-wrap items-center gap-6">
            <SemanticSimilarityScore score={95} change={3.2} />
            <SemanticSimilarityScore score={82} change={-1.5} />
            <SemanticSimilarityScore score={65} change={0.8} />
            <SemanticSimilarityScore score={35} change={-2.1} />
          </div>
        </div>

        {/* Display Modes */}
        <div className="space-y-4 mb-8">
          <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Display Modes
          </h3>
          <div className="flex flex-wrap items-center gap-6">
            <SemanticSimilarityScore score={94} change={2.4} badgeOnly />
            <SemanticSimilarityScore score={94} change={2.4} compact />
            <SemanticSimilarityScore score={94} change={2.4} showTrend={false} />
          </div>
        </div>

        {/* Card Mode */}
        <div className="space-y-4 mb-8">
          <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Card Mode (for stats grids)
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <SemanticSimilarityScore score={94} change={2.4} showCard label="Semantic Score" />
            <SemanticSimilarityScore score={87} change={-1.2} showCard label="Code Overlap" />
            <SemanticSimilarityScore score={72} change={0.5} showCard label="Logic Match" />
          </div>
        </div>

        {/* Bar Visualization */}
        <div className="space-y-4 mb-8">
          <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Bar Visualization
          </h3>
          <div className="space-y-4 max-w-md">
            <SemanticSimilarityBar score={94} height="sm" />
            <SemanticSimilarityBar score={82} height="md" />
            <SemanticSimilarityBar score={65} height="lg" />
          </div>
        </div>

        {/* Gauge Visualization */}
        <div className="space-y-4 mb-8">
          <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Gauge Visualization
          </h3>
          <div className="flex flex-wrap items-end gap-6">
            <div className="text-center">
              <SemanticSimilarityGauge score={94} size="sm" />
              <p className="text-xs text-slate-500 mt-2">Small</p>
            </div>
            <div className="text-center">
              <SemanticSimilarityGauge score={82} size="md" />
              <p className="text-xs text-slate-500 mt-2">Medium</p>
            </div>
            <div className="text-center">
              <SemanticSimilarityGauge score={65} size="lg" />
              <p className="text-xs text-slate-500 mt-2">Large</p>
            </div>
          </div>
        </div>

        {/* Interactive Mode */}
        <div className="space-y-4 mb-8">
          <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Interactive (with onClick)
          </h3>
          <div className="flex flex-wrap items-center gap-6">
            <SemanticSimilarityScore
              score={94}
              change={2.4}
              onClick={() => console.log("Score clicked!")}
            />
            <SemanticSimilarityScore
              score={94}
              badgeOnly
              onClick={() => console.log("Badge clicked!")}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default SemanticSimilarityScoreDemo;
