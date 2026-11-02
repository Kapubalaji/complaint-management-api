import { useId } from "react";

/**
 * Empty state container for chart components when data is unavailable or zero.
 */
function ChartEmptyState({
  title = "No data available",
  hint = "Data will appear once complaints are recorded.",
}) {
  return (
    <div className="chart-empty-state" role="status">
      <p className="empty-title">{title}</p>
      {hint && <p className="empty-hint">{hint}</p>}
    </div>
  );
}

/**
 * Responsive SVG Line & Area chart for Trends (Screen 07)
 * Displays actual trend data from /reports/analytics API.
 */
export function ComplaintsOverviewChart({
  data = [],
  height = 220,
  strokeColor = "#4f46e5",
}) {
  const gradientId = useId();

  // Validate that data exists and has at least one non-zero value
  const hasValues =
    Array.isArray(data) &&
    data.length > 0 &&
    data.some((p) => (p.value || 0) > 0);

  if (!hasValues) {
    return (
      <ChartEmptyState
        title="No activity recorded yet"
        hint="Trend lines will appear as complaints are submitted."
      />
    );
  }

  const maxVal = Math.max(1, ...data.map((p) => p.value || 0));
  const width = 500;
  const paddingX = 40;
  const paddingY = 30;
  const chartW = width - paddingX * 2;
  const chartH = height - paddingY * 2;

  const coords = data.map((p, idx) => {
    const x = paddingX + (idx / Math.max(1, data.length - 1)) * chartW;
    const y = paddingY + chartH - ((p.value || 0) / maxVal) * chartH;
    return { x, y, label: p.label, value: p.value };
  });

  // Build smooth bezier path
  let pathD = "";
  if (coords.length > 0) {
    pathD = `M ${coords[0].x} ${coords[0].y}`;
    for (let i = 0; i < coords.length - 1; i++) {
      const p0 = coords[i];
      const p1 = coords[i + 1];
      const cx1 = p0.x + (p1.x - p0.x) / 2;
      const cy1 = p0.y;
      const cx2 = p0.x + (p1.x - p0.x) / 2;
      const cy2 = p1.y;
      pathD += ` C ${cx1} ${cy1}, ${cx2} ${cy2}, ${p1.x} ${p1.y}`;
    }
  }

  const areaD =
    coords.length > 0
      ? `${pathD} L ${coords[coords.length - 1].x} ${paddingY + chartH} L ${coords[0].x} ${paddingY + chartH} Z`
      : "";

  return (
    <div className="svg-chart-container" style={{ width: "100%", overflowX: "auto" }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: "100%", height: "auto", display: "block" }}
        role="img"
        aria-label="Complaints Overview Chart"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={strokeColor} stopOpacity="0.25" />
            <stop offset="100%" stopColor={strokeColor} stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Horizontal grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => {
          const y = paddingY + chartH * (1 - pct);
          const gridVal = Math.round(maxVal * pct);
          return (
            <g key={i}>
              <line
                x1={paddingX}
                y1={y}
                x2={width - paddingX}
                y2={y}
                stroke="#f1f5f9"
                strokeWidth="1"
                strokeDasharray="4 4"
              />
              <text
                x={paddingX - 10}
                y={y + 4}
                textAnchor="end"
                fontSize="11"
                fill="#94a3b8"
                fontFamily="inherit"
              >
                {gridVal}
              </text>
            </g>
          );
        })}

        {/* Area fill */}
        {areaD && <path d={areaD} fill={`url(#${gradientId})`} />}

        {/* Line curve */}
        {pathD && (
          <path
            d={pathD}
            fill="none"
            stroke={strokeColor}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Data points & X Labels */}
        {coords.map((p, i) => (
          <g key={i}>
            <circle
              cx={p.x}
              cy={p.y}
              r="4.5"
              fill="#ffffff"
              stroke={strokeColor}
              strokeWidth="2"
            />
            <text
              x={p.x}
              y={height - 8}
              textAnchor="middle"
              fontSize="11"
              fill="#64748b"
              fontFamily="inherit"
            >
              {p.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

/**
 * Responsive SVG Donut Chart with percentage legend (Screen 07)
 * Displays actual complaint category counts without demo fallback data.
 */
export function TopCategoriesDonutChart({
  data = [],
  size = 180,
  innerRadius = 55,
  outerRadius = 80,
}) {
  const validSlices = (data || []).filter((d) => (d.value || 0) > 0);

  if (validSlices.length === 0) {
    return (
      <ChartEmptyState
        title="No category data yet"
        hint="Distribution will appear once complaints are categorized."
      />
    );
  }

  const total = validSlices.reduce((acc, d) => acc + d.value, 0);
  const center = size / 2;

  let currentAngle = -Math.PI / 2;

  const slices = validSlices.map((d) => {
    const fraction = d.value / total;
    const angle = fraction * 2 * Math.PI;
    const startAngle = currentAngle;
    const endAngle = currentAngle + angle;
    currentAngle = endAngle;

    const x1 = center + outerRadius * Math.cos(startAngle);
    const y1 = center + outerRadius * Math.sin(startAngle);
    const x2 = center + outerRadius * Math.cos(endAngle);
    const y2 = center + outerRadius * Math.sin(endAngle);

    const x3 = center + innerRadius * Math.cos(endAngle);
    const y3 = center + innerRadius * Math.sin(endAngle);
    const x4 = center + innerRadius * Math.cos(startAngle);
    const y4 = center + innerRadius * Math.sin(startAngle);

    const largeArc = angle > Math.PI ? 1 : 0;

    const pathData = `
      M ${x1} ${y1}
      A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${x2} ${y2}
      L ${x3} ${y3}
      A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${x4} ${y4}
      Z
    `;

    return {
      ...d,
      pct: Math.round(fraction * 100),
      pathData,
    };
  });

  return (
    <div
      className="donut-chart-wrapper"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "24px",
        flexWrap: "wrap",
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label="Categories Donut Chart"
      >
        {slices.map((slice, i) => (
          <path
            key={i}
            d={slice.pathData}
            fill={slice.color || "#4f46e5"}
            stroke="#ffffff"
            strokeWidth="2"
          />
        ))}
      </svg>

      <ul
        className="donut-legend"
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "flex",
          flexDirection: "column",
          gap: "8px",
        }}
      >
        {slices.map((slice, i) => (
          <li
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              fontSize: "13px",
            }}
          >
            <span
              style={{
                width: "10px",
                height: "10px",
                borderRadius: "50%",
                backgroundColor: slice.color || "#4f46e5",
                display: "inline-block",
              }}
            />
            <span style={{ color: "#334155", minWidth: "85px" }}>
              {slice.label}
            </span>
            <strong style={{ color: "#0f172a", marginLeft: "auto" }}>
              {slice.pct}%
            </strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Responsive SVG Vertical Bar Chart for Complaints by Category (Screen 11)
 * Displays actual complaint counts without demo fallback data.
 */
export function ComplaintsByCategoryBarChart({
  data = [],
  height = 220,
}) {
  const validBars = (data || []).filter((d) => (d.value || 0) > 0);

  if (validBars.length === 0) {
    return (
      <ChartEmptyState
        title="No complaints by category"
        hint="Category volume will appear once complaints are filed."
      />
    );
  }

  const maxVal = Math.max(1, ...validBars.map((d) => d.value || 0));
  const width = 450;
  const paddingX = 35;
  const paddingY = 25;
  const chartW = width - paddingX * 2;
  const chartH = height - paddingY * 2;
  const barWidth = Math.min(32, (chartW / (validBars.length || 1)) * 0.55);

  return (
    <div className="svg-chart-container" style={{ width: "100%", overflowX: "auto" }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: "100%", height: "auto", display: "block" }}
        role="img"
        aria-label="Complaints By Category Chart"
      >
        {/* Horizontal grid lines */}
        {[0, 0.5, 1].map((pct, i) => {
          const y = paddingY + chartH * (1 - pct);
          const gridVal = Math.round(maxVal * pct);
          return (
            <g key={i}>
              <line
                x1={paddingX}
                y1={y}
                x2={width - paddingX}
                y2={y}
                stroke="#f1f5f9"
                strokeWidth="1"
                strokeDasharray="4 4"
              />
              <text
                x={paddingX - 8}
                y={y + 4}
                textAnchor="end"
                fontSize="11"
                fill="#94a3b8"
                fontFamily="inherit"
              >
                {gridVal}
              </text>
            </g>
          );
        })}

        {/* Vertical bars */}
        {validBars.map((d, idx) => {
          const colW = chartW / validBars.length;
          const x = paddingX + idx * colW + (colW - barWidth) / 2;
          const barH = ((d.value || 0) / maxVal) * chartH;
          const y = paddingY + chartH - barH;

          return (
            <g key={idx}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={barH}
                rx="4"
                fill={d.color || "#4f46e5"}
              />
              <text
                x={x + barWidth / 2}
                y={y - 6}
                textAnchor="middle"
                fontSize="11"
                fontWeight="600"
                fill="#475569"
                fontFamily="inherit"
              >
                {d.value}
              </text>
              <text
                x={x + barWidth / 2}
                y={height - 8}
                textAnchor="middle"
                fontSize="11"
                fill="#64748b"
                fontFamily="inherit"
              >
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
