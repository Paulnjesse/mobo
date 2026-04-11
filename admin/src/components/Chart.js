import React from 'react';
import { Box, Typography, Skeleton } from '@mui/material';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

const COLORS = ['#000000', '#E31837', '#FF6B35', '#4CAF50', '#2196F3', '#9C27B0'];

function formatXAF(value) {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(0)}k`;
  return value;
}

const CustomTooltip = ({ active, payload, label, currency }) => {
  if (active && payload && payload.length) {
    return (
      <Box
        sx={{
          backgroundColor: '#000000',
          border: 'none',
          borderRadius: '8px',
          p: 1.5,
          boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
        }}
      >
        <Typography sx={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.72rem', mb: 0.5 }}>
          {label}
        </Typography>
        {payload.map((entry, i) => (
          <Typography key={i} sx={{ color: entry.color || '#fff', fontSize: '0.82rem', fontWeight: 600 }}>
            {entry.name}: {currency ? `${Number(entry.value).toLocaleString()} XAF` : entry.value}
          </Typography>
        ))}
      </Box>
    );
  }
  return null;
};

const PieCustomTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    return (
      <Box
        sx={{
          backgroundColor: '#000000',
          borderRadius: '8px',
          p: 1.5,
          boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
        }}
      >
        <Typography sx={{ color: '#fff', fontSize: '0.82rem', fontWeight: 600 }}>
          {payload[0].name}: {payload[0].value}%
        </Typography>
      </Box>
    );
  }
  return null;
};

export function RevenueLineChart({ data = [], loading = false, height = 300 }) {
  if (loading) {
    return <Skeleton variant="rounded" width="100%" height={height} />;
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: 'rgba(0,0,0,0.5)' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={formatXAF}
          tick={{ fontSize: 11, fill: 'rgba(0,0,0,0.5)' }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip content={<CustomTooltip currency />} />
        <Line
          type="monotone"
          dataKey="revenue"
          name="Revenue"
          stroke="#E31837"
          strokeWidth={2.5}
          dot={{ fill: '#E31837', r: 4, strokeWidth: 0 }}
          activeDot={{ r: 6, fill: '#E31837' }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function RidesBarChart({ data = [], loading = false, height = 300 }) {
  if (loading) {
    return <Skeleton variant="rounded" width="100%" height={height} />;
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: 'rgba(0,0,0,0.5)' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: 'rgba(0,0,0,0.5)' }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip content={<CustomTooltip />} />
        <Bar dataKey="rides" name="Rides" fill="#000000" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function PaymentPieChart({ data = [], loading = false, height = 300 }) {
  if (loading) {
    return <Skeleton variant="rounded" width="100%" height={height} />;
  }

  const RADIAN = Math.PI / 180;
  const renderCustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    if (percent < 0.05) return null;
    return (
      <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={600}>
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          labelLine={false}
          label={renderCustomLabel}
          outerRadius={Math.min(height / 2 - 40, 110)}
          innerRadius={Math.min(height / 2 - 80, 60)}
          dataKey="value"
        >
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip content={<PieCustomTooltip />} />
        <Legend
          iconType="circle"
          iconSize={8}
          formatter={(value) => (
            <span style={{ fontSize: '0.78rem', color: '#000000', fontWeight: 500 }}>{value}</span>
          )}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function RevenueAreaChart({ data = [], loading = false, height = 260 }) {
  if (loading) {
    return <Skeleton variant="rounded" width="100%" height={height} />;
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <defs>
          <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#E31837" stopOpacity={0.15} />
            <stop offset="95%" stopColor="#E31837" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 10, fill: 'rgba(0,0,0,0.5)' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={formatXAF}
          tick={{ fontSize: 10, fill: 'rgba(0,0,0,0.5)' }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip content={<CustomTooltip currency />} />
        <Line
          type="monotone"
          dataKey="revenue"
          name="Revenue"
          stroke="#E31837"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 5, fill: '#E31837' }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
