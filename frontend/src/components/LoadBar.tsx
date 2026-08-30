interface LoadBarProps {
  load: number;
}

const getColor = (load: number) => {
  if (load > 1.0) return "#ff0000";
  if (load > 0.9) return "#ff9900";
  if (load > 0.7) return "#ffff00";
  return "#00ff00";
};

export default function LoadBar({ load }: LoadBarProps) {
  const widthPercent = Math.min(load * 100, 100); 
  const color = getColor(load);

  return (
    <div style={{ 
      width: '100%', 
      height: '10px', 
      backgroundColor: '#333', 
      borderRadius: '5px', 
      overflow: 'hidden',
      border: '1px solid #555'
    }}>
      <div style={{
        width: `${widthPercent}%`,
        height: '100%',
        backgroundColor: color,
        transition: 'width 0.5s ease, background-color 0.5s ease',
      }} />
    </div>
  );
}