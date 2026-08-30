import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
interface ChartData {
  time: string;
  [key: string]: string | number | null;
}


const LINE_COLORS = ['#00ffcc', '#ff9900', '#ff00ff', '#ffff00', '#00ffff'];

interface ChartProps {
  data: ChartData[];
  activeLineIds: number[];
  getLineName: (id: number) => string;
}

export default function TimeChart({ data, activeLineIds, getLineName }: ChartProps) {
  if (data.length === 0 || activeLineIds.length === 0) return <div style={{color:'#888'}}>Waiting for chart data...</div>;

  return (
    <div style={{ width: '100%', height: 300 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#333" />
          <XAxis 
            dataKey="time" 
            stroke="#888" 
            tick={{ fontSize: 10 }} 
            interval="preserveStartEnd"
          />
          <YAxis 
            stroke="#888" 
            tick={{ fontSize: 10 }}
            domain={[0, 1.2]}
            tickFormatter={(val) => `${(val * 100).toFixed(0)}%`}
          />
          <Tooltip 
            contentStyle={{ fontSize:'11px', backgroundColor: '#222', border: '1px solid #555', color: 'white' }}
            formatter={(value: number, name: string) => {
              // Extract the ID from the name (e.g., "line_3" -> 3)
              const id = parseInt(name.split('_')[1]);
              return [(value * 100).toFixed(1) + '%', getLineName(id)];
            }}
          />
          <Legend 
            wrapperStyle={{ fontSize: '10px' }} 
            formatter={(value) => {
              const id = parseInt(value.split('_')[1]);
              return getLineName(id);
            }}
          />
          
          {activeLineIds.map((id, index) => (
            <Line 
              key={`line-${id}`}
              type="monotone" 
              dataKey={`line_${id}`} 
              stroke={LINE_COLORS[index % LINE_COLORS.length]} 
              dot={false} 
              strokeWidth={2}
              connectNulls // Draws a line even if there are null gaps
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}