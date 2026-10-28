import {
  CategoryBadge,
  PriorityBadge,
  SentimentBadge,
} from "./badges.jsx";
import { Spinner } from "./ui.jsx";
import { resolveUserLabel } from "../utils.js";

export default function AiInsights({
  analysis,
  staffMap = {},
  session,
  note,
  loading = false,
  onReanalyze,
  reanalyzing = false,
}) {
  if (loading) {
    return (
      <section className="ai-panel">
        <h3>AI Insights</h3>
        <Spinner label="Analyzing complaint..." />
      </section>
    );
  }

  if (!analysis) {
    return (
      <section className="ai-panel">
        <h3>AI Insights</h3>
        <p className="ai-empty">No analysis available yet.</p>
      </section>
    );
  }

  const suggested = resolveUserLabel(
    analysis.suggested_staff_id,
    session,
    staffMap
  );

  return (
    <section className="ai-panel">
      <div className="ai-panel-head">
        <h3>AI Insights</h3>
        {analysis.provider_used && (
          <span className="ai-provider">
            {analysis.provider_used === "rule_engine_fallback"
              ? "Rule engine"
              : analysis.provider_used}
          </span>
        )}
        {onReanalyze && (
          <button
            type="button"
            className="secondary-button"
            onClick={onReanalyze}
            disabled={reanalyzing}
          >
            {reanalyzing ? "Analyzing..." : "Re-run analysis"}
          </button>
        )}
      </div>

      <div className="ai-badges">
        <CategoryBadge category={analysis.category} />
        <PriorityBadge priority={analysis.priority} />
        <SentimentBadge sentiment={analysis.sentiment} />
      </div>

      <dl className="ai-details">
        <dt>Summary</dt>
        <dd>{analysis.ai_summary || "\u2014"}</dd>

        <dt>Suggested staff</dt>
        <dd>{analysis.suggested_staff_id ? suggested : "No suggestion available"}</dd>
      </dl>

      {note && <p className="ai-note">{note}</p>}
    </section>
  );
}
