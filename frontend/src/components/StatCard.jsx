export default function StatCard({ label, value, accent, icon }) {
  // Infer accent if not explicitly passed
  let tone = accent;
  if (!tone && label) {
    const l = label.toLowerCase();
    if (l.includes("open")) tone = "open";
    else if (l.includes("progress")) tone = "progress";
    else if (l.includes("resolve") || l.includes("complete")) tone = "resolved";
    else tone = "total";
  }

  return (
    <article className={`stat-card stat-card-${tone || "default"}`}>
      {icon && <div className="stat-card-icon">{icon}</div>}
      <div className="stat-card-content">
        <h2 className="stat-card-value">{value}</h2>
        <p className="stat-card-label">{label}</p>
      </div>
    </article>
  );
}
