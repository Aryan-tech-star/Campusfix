"use client";
import {
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from "recharts";
import {
  Complaint,
  categories,
  complaintCost,
  money,
} from "@/lib/manager/domain";
export const palette = [
  "#386bf6",
  "#a594f9",
  "#42bdba",
  "#f6b755",
  "#f18f97",
  "#73a0e9",
  "#b4bfd0",
];
export function CategoryChart({ complaints }: { complaints: Complaint[] }) {
  const data = categories
    .map((name, i) => ({
      name,
      value: complaints.filter((c) => c.category === name).length,
      color: palette[i],
    }))
    .filter((x) => x.value);
  return (
    <div className="category-chart">
      <div className="donut">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              innerRadius={58}
              outerRadius={77}
              paddingAngle={3}
              stroke="none"
            >
              {data.map((x) => (
                <Cell key={x.name} fill={x.color} />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
        <div className="donut-center">
          <strong>{complaints.length}</strong>
          <span>complaints</span>
        </div>
      </div>
      <div className="category-legend">
        {data.map((x) => (
          <div key={x.name}>
            <span className="legend-dot" style={{ background: x.color }} />
            <span>{x.name}</span>
            <strong>{x.value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}
export function CostChart({ complaints }: { complaints: Complaint[] }) {
  const data = Array.from({ length: 6 }, (_, i) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 5 + i);
    return {
      name: new Intl.DateTimeFormat("en-IN", { month: "short" }).format(d),
      Cost: complaints.reduce(
        (total, c) =>
          total +
          c.repairs
            .filter(
              (r) =>
                r.verifiedAt &&
                new Date(r.verifiedAt).getMonth() === d.getMonth() &&
                new Date(r.verifiedAt).getFullYear() === d.getFullYear(),
            )
            .reduce(
              (s, r) =>
                s +
                r.labour +
                r.parts.reduce((n, p) => n + p.quantity * p.unitCost, 0),
              0,
            ),
        0,
      ),
    };
  });
  return (
    <div
      className="chart-box"
      role="img"
      aria-label={`Monthly approved repair expenditure. Total: ${money(complaints.reduce((s, c) => s + complaintCost(c), 0))}`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: -15, right: 15 }}>
          <CartesianGrid vertical={false} stroke="#edf0f6" />
          <XAxis
            dataKey="name"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 11, fill: "#8992a3" }}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 11, fill: "#8992a3" }}
            tickFormatter={(n) => `${n / 1000}k`}
          />
          <Tooltip formatter={(value) => money(Number(value))} />
          <Bar
            dataKey="Cost"
            fill="#547bf0"
            radius={[6, 6, 0, 0]}
            maxBarSize={36}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
