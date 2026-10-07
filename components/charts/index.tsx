'use client';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from 'recharts';
import { fmtCompactMoney, fmtMoney } from '@/lib/format';

const C = ['hsl(217 86% 48%)', 'hsl(172 66% 36%)', 'hsl(38 92% 50%)', 'hsl(262 60% 56%)', 'hsl(346 72% 54%)', 'hsl(200 80% 45%)', 'hsl(220 10% 60%)'];
const tip = { contentStyle: { borderRadius: 8, border: '1px solid hsl(220 16% 89%)', fontSize: 12 } };

export function SalesAreaChart({ data, x = 'day', y = 'sales', height = 240 }: { data: any[]; x?: string; y?: string; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
        <defs><linearGradient id="g1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C[0]} stopOpacity={0.25} /><stop offset="100%" stopColor={C[0]} stopOpacity={0} /></linearGradient></defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(220 16% 91%)" />
        <XAxis dataKey={x} tickLine={false} axisLine={false} fontSize={11} interval="preserveStartEnd" minTickGap={24} />
        <YAxis tickFormatter={fmtCompactMoney} tickLine={false} axisLine={false} fontSize={11} width={56} />
        <Tooltip formatter={(v: number) => fmtMoney(v)} {...tip} />
        <Area type="monotone" dataKey={y} stroke={C[0]} strokeWidth={2} fill="url(#g1)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function TargetBarChart({ data, height = 240 }: { data: { month: string; sales: number; target: number }[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(220 16% 91%)" />
        <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={11} />
        <YAxis tickFormatter={fmtCompactMoney} tickLine={false} axisLine={false} fontSize={11} width={56} />
        <Tooltip formatter={(v: number) => fmtMoney(v)} {...tip} />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="sales" name="Sales" fill={C[0]} radius={[4, 4, 0, 0]} />
        <Bar dataKey="target" name="Target" fill="hsl(220 16% 86%)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function HBarChart({ data, x, y, height = 240 }: { data: any[]; x: string; y: string; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey={x} width={110} tickLine={false} axisLine={false} fontSize={11} />
        <Tooltip formatter={(v: number) => fmtMoney(v)} {...tip} />
        <Bar dataKey={y} radius={[0, 4, 4, 0]}>{data.map((_, i) => <Cell key={i} fill={C[i % C.length]} />)}</Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function DonutChart({ data, name, value, height = 220, labelFor }: { data: any[]; name: string; value: string; height?: number; labelFor?: (s: string) => string }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={data} dataKey={value} nameKey={name} innerRadius="58%" outerRadius="85%" paddingAngle={2}>{data.map((_, i) => <Cell key={i} fill={C[i % C.length]} />)}</Pie>
        <Tooltip {...tip} formatter={(v: number, n: string) => [v, labelFor ? labelFor(n) : n]} />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} formatter={(v) => (labelFor ? labelFor(v) : v)} />
      </PieChart>
    </ResponsiveContainer>
  );
}
