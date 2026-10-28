export default function StatCard({ label, value, accent }) {
  return (
    <article className={`stat-card${accent ? ` stat-card-${accent}` : ""}`}>
      <p>{label}</p>
      <h2>{value}</h2>
    </article>
  );
}
