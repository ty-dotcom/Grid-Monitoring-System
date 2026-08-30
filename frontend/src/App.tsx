import { useEffect, useRef, useState } from 'react';
import  GridMap  from './components/GridMap';
import TimeChart from './components/TimeChart';
import './App.css';
import axios from 'axios';
import LoadBar from './components/LoadBar';
import type { Substation } from './constants';

interface Alert{
  id: number;
  time: string;
  severity: string;
  message: string;
}




export default function App() {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars

  const [stations, setStations] = useState<Substation[]>([]);
  const [gridStatus, setGridStatus] = useState<number[]>(Array(10).fill(0));
  const [lines, setLines] = useState<any[]>([]);
  const [lineStatuses, setLineStatuses] = useState<boolean[]>(Array(10).fill(true));
  const [usage, setUsage] = useState({consumption: 0, renewable_production: 0, thermal_production: 0});
  const [mapCenter, setMapCenter] = useState<[number, number]>([40.2, 116.5]);
  const [predictions, setPredictions] = useState<any[]>([]);

  const [topLineIds, setTopLineIds] = useState<number[]>([]);
  const [currentStep, setCurrentStep] = useState<number>(0);
  
  const [activeTab, setActiveTab] = useState<'overview' | 'history' | 'analytics'>('overview');
  const [alertHistory, setAlertHistory] = useState<Alert[]>([]);
  const [isBlackout, setIsBlackout] = useState(false);
  const [chartData, setChartData] = useState<any[]>([]);

  const linesRef = useRef<any[]>([]); 
  const alertRef = useRef<Alert[]>([]); 

  const [mode, setMode] = useState('dark');
  const isDark = mode === 'dark';

  const [loading, setLoading] = useState(true);
  const [humanOverrideActive, setHumanOverrideActive] = useState(false);

  const apiUrl = import.meta.env.VITE_API_URL;


  const getTopActiveLines = (currentLines: any[]) => {
    if (currentLines.length === 0) return [];
    return [...currentLines].sort((a, b) => b.load - a.load).slice(0, 5).map(l => l.id);
  };

  const getLineName = (lineId: number) => {
    const line = lines.find(l => l.id === lineId);
    if (!line) return `Line ${lineId}`;
    
    const fromNode = stations.find(s => s.id === line.from);
    const toNode = stations.find(s => s.id === line.to);

    
    const fromName = fromNode ? fromNode.name.split('(')[0] : `Station ${line.from}`;
    const toName = toNode ? toNode.name.split('(')[0] : `Station ${line.to}`;
    
    return `${fromName} ➔ ${toName}`;
  };

  function switchModes(){
    if (mode == 'dark'){
      setMode('light');
    }else{
      setMode('dark')
    }
  };


  const fetchGridData = async () =>{
    try {
      
      const response = await axios.post(`${apiUrl}/grid/step`);
      const data = response.data;

      if (data.status === "BLACKOUT_RESET") {
        setIsBlackout(true);
        setChartData([]); 
        
        const blackoutLog = {
          id: Date.now(),
          time: new Date().toLocaleTimeString(),
          message: "Blackout, physical grid collapsed. Rebooting.",
          severity: 'CRITICAL'
        };
        
        setAlertHistory(prev => [blackoutLog, ...prev].slice(0, 100));

        setTimeout(() => setIsBlackout(false), 5000);

        return; 
      }

      if (data.predictions){
        setPredictions(data.predictions);
      }
      setGridStatus(data.line_loads);
      setCurrentStep(data.timestamp);
      setLineStatuses(data.line_statuses);
      setLines(data.live_lines);
      setUsage(data.usage);


      if (loading){
        setLoading(false);
      }

      if (data.anomalies && data.num_anomalies > 0){
        const timeString = new Date().toLocaleTimeString();

        const recentLogs = alertRef.current.slice(0, 5);
        
        const uniqueAnomalies = data.anomalies.filter((a: any) => {
          const eventSignature = `Line ${a.id} - ${a.reason}`;
          return !recentLogs.some((oldLog: any) => oldLog.message.includes(eventSignature));
        });

        if (uniqueAnomalies.length > 0){

          const newAlerts: Alert[] = uniqueAnomalies.map((a: any, idx: number) => ({
            id: Date.now() + idx,
            time: timeString,
            message: `Line ${a.id} - ${a.reason} (${(a.load * 100).toFixed(1)}%)`,
            severity: a.severity.includes('CRITICAL') || a.severity.includes('DISCONNECTED') ? 'critical' : 'warning'
          }));
          setAlertHistory(prev => [...newAlerts, ...prev].slice(0, 100));
        }
      } 
    } catch (error){
      console.log("Error fetching grid data: ", error)
    }
  };

  const fetchChartData = async () => {
    if (linesRef.current.length === 0) return;
    try {
      const response = await axios.get(`${apiUrl}/grid/history`);
      const data = response.data;
      const activeIds = getTopActiveLines(linesRef.current);
      
      if (activeIds.length === 0) return;

      const formattedData: any = {};
      
      data.forEach((row: any) => {
        if (!activeIds.includes(row.line_id)) return;

        const timeStr = new Date(row.time).toLocaleTimeString();
        if (!formattedData[timeStr]) {
          const timeBucket: any = { time: timeStr };
          activeIds.forEach(id => {
            timeBucket[`line_${id}`] = null;
          });
          formattedData[timeStr] = timeBucket;
        }
        
        formattedData[timeStr][`line_${row.line_id}`] = row.avg_load;
      });

      const chartArray = Object.values(formattedData)
        .filter((item: any) => Object.values(item).some(val => val !== null))
        .reverse();

      setChartData(chartArray);
      setTopLineIds(activeIds);
      
    } catch (error) {
      console.error("Error fetching chart data", error);
    }
  };



  const triggerEvent = async () => {
    try {
      await axios.post(`${apiUrl}/grid/force_event`);
      
      setHumanOverrideActive(true);
      setTimeout(() => setHumanOverrideActive(false), 4000);
      
    } catch (err) {
      console.error(err);
    }
  };
  
  useEffect(() => {
    const setLayout = async (lat: number, lng: number) =>{
      try{
        const response = await axios.get(`${apiUrl}/grid/layout?lat=${lat}&lng=${lng}`);
        const data = response.data;

        setStations(data.stations);
        setLines(data.line_data);
        setMapCenter([lat, lng]);

      } catch (error){
        console.error("Failed to get layout", error);
      }
    };

    if (navigator.geolocation){
      navigator.geolocation.getCurrentPosition(
        (pos) => setLayout(pos.coords.latitude, pos.coords.longitude),
        () => setLayout(18.1096, -77.2975)
      )

    } else{
      setLayout(18.1096, -77.2975)
    }

  }, [])

  useEffect(()=>{
    const gridInterval = setInterval(fetchGridData, 2000);
    const chartInterval = setInterval(fetchChartData, 5000);

    
    return () =>{
      clearInterval(gridInterval);
      clearInterval(chartInterval);
    };
  }, [])

  useEffect(() => {
    linesRef.current = lines;
  }, [lines]);

    useEffect(() => {
    alertRef.current = alertHistory;
  }, [alertHistory]);


  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-title" style={{fontFamily: 'fantasy'}}>National Power Grid Monitoring System</div>
        <div className="loading-subtitle">Establishing secure connection to Grid Operations Backend</div>
        
        <div className="loading-bar-container">
          <div className="loading-bar"></div>
        </div>
        
        <div style={{ marginTop: '20px', fontSize: '0.8rem', color: '#555' }}>
          Initializing Grid2Op Environment
        </div>
      </div>
    );
  }
  return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100%', backgroundColor: '#0a0a0a', color: 'white'}}>
      
      <header style={{ padding: '10px 20px', backgroundColor: '#1a1a1a', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ margin: 0, fontSize: '1.2rem', fontFamily: 'fantasy'}}>
          National Power Grid Monitoring System
        </div>
        <div style={{fontFamily: 'fantasy'}}>
          Status : <span style={{color: '#1eff00'}}> ONLINE </span>
        </div>

        <button 
              onClick={() => window.open(`${apiUrl}/report/download`, '_blank')}
              style={{ 
                padding: '8px 15px', 
                borderRadius: '8px', 
                backgroundColor: '#d32f2f', 
                color: 'white', 
                border: 'none', 
                cursor: 'pointer', 
                marginRight: '10px',
                fontWeight: 'bold'
              }}
            >
            Download PDF Report
        </button>
        <button 
              onClick={triggerEvent}
              disabled={humanOverrideActive}
              style={{ 
                padding: '8px 15px', 
                borderRadius: '8px', 
                backgroundColor: humanOverrideActive ? '#666' : '#ff9900', 
                color: 'black', 
                border: 'none', 
                cursor: humanOverrideActive ? 'not-allowed' : 'pointer', 
                marginRight: '10px',
                fontWeight: 'bold'
              }}
            >
              {humanOverrideActive ? "Executing" : "Disconnect A Line"}
        </button>
        <button 
            onClick={switchModes} 
            style={{
              padding: '10px 15px', 
              borderRadius:'8px',
              backgroundColor: '#333', 
              color: 'white',
              border: '1px solid white',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            Switch to {isDark ? 'Light' : 'Dark'} Map
          </button>
      </header>

      {isBlackout ? (
        <div className="loading-screen">
        <h3 style={{fontSize: '1.3rem', marginBottom: '40px'}}>Blackout Triggered. Attempting Reset</h3>
        <div className="loading-bar-container">
          <div className="loading-bar"></div>
        </div>
      </div>
      ) : (

        <div style={{display: 'flex', flex:1, minHeight: 0}}>

        <div style={{flex: 7, borderRight: '1px solid #333'}}>
          <GridMap gridData={gridStatus} color={mode} lineStatuses={lineStatuses} stations={stations} lines={lines} center={mapCenter}/>
        </div>
        
        <div style={{ flex: 3, display: 'flex', flexDirection: 'column', minHeight: 0, backgroundColor: '#111'}}>

          <div style={{ display: 'flex', borderBottom: '1px solid #333' }}>
            <button onClick={() => setActiveTab('overview')} style={{ flex: 1, padding: '15px', background: activeTab === 'overview' ? '#222' : 'transparent', border: 'none', color: activeTab === 'overview' ? '#1eff00' : '#888', cursor: 'pointer', fontWeight: 'bold' }}>
              Live Overview
            </button>
            <button onClick={() => setActiveTab('analytics')} style={{ flex: 1, padding: '15px', background: activeTab === 'analytics' ? '#222' : 'transparent', border: 'none', color: activeTab === 'analytics' ? '#1eff00' : '#888', cursor: 'pointer', fontWeight: 'bold' }}>
              Analytics
            </button>
            <button onClick={() => setActiveTab('history')} style={{ flex: 1, padding: '15px', background: activeTab === 'history' ? '#222' : 'transparent', border: 'none', color: activeTab === 'history' ? '#1eff00' : '#888', cursor: 'pointer', fontWeight: 'bold' }}>
              Alert History
            </button>
          </div>

            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '20px' }}>
              {activeTab === 'overview' ? (
                <>

                  <div style={{ padding: '15px', backgroundColor: 'rgba(0,0,0,0.3)', border: '1px solid #333', borderRadius: '8px', marginBottom: '20px' }}>
                    <h4 style={{margin: '0 0 10px 0', fontSize: '0.9rem'}}>Grid Consumption and Production</h4>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ fontSize:'0.8rem', fontWeight: 'bold'}}>Total Consumption:</span>
                      <span style={{color:'white', fontSize:'0.85rem', fontWeight:'bold'}}>{usage.consumption.toLocaleString('en-US')} MW</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ fontSize:'0.8rem', fontWeight: 'bold'}}>Total Renewable Production:</span>
                      <span style={{color:'white', fontSize:'0.85rem', fontWeight:'bold'}}>{usage.renewable_production.toLocaleString('en-US')} MW</span>
                    </div>
                     <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ fontSize:'0.8rem', fontWeight: 'bold'}}>Total Thermal Production:</span>
                      <span style={{color:'white', fontSize:'0.85rem', fontWeight:'bold'}}>{usage.thermal_production.toLocaleString('en-US')} MW</span>
                    </div>
                  </div>

                  {predictions.length > 0 && predictions[0].trend && (
                    <div style={{ padding: '15px', backgroundColor: isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.05)', border: `1px solid #333`, borderRadius: '8px', marginBottom: '20px' }}>
                      <h4 style={{margin: '0 0 10px 0', color: '#1eff00', fontSize: '0.9rem'}}> Peak Line Forecast (30 min)</h4>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <span style={{ fontSize:'0.8rem', fontWeight: 'bold'}}>Current Peak Utilization:</span>
                        <span style={{color:'white', fontSize:'0.85rem', fontWeight:'bold'}}>{(predictions[0].current_rho * 100).toFixed(1)}%</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px'}}>
                        <span style={{fontSize:'0.8rem', fontWeight: 'bold', marginBottom: '8px'}}>Predicted Peak in 30 min:</span>
                        <span style={{color: predictions[0].predicted_rho > 0.95 ? '#ff4444' : '#1eff00', fontSize:'0.85rem', fontWeight:'bold'}}>
                          {(predictions[0].predicted_rho * 100).toFixed(1)}%
                          {predictions[0].predicted_rho > 0.95 ? " HIGH STRESS" : ""}
                        </span>
                      </div>
                      <LoadBar load={predictions[0].predicted_rho} />
                    </div>
                  )}

                  <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '10px'}}>
                    <h4 style={{margin: 0, color: '#1eff00', fontSize: '0.9rem'}}>Top 5 Stressed Lines</h4>
                    <h4 style={{margin: 0, fontSize: '0.8rem'}}>Step: {currentStep}</h4>
                  </div>
                  
                    {[...lines]
                    .sort((a, b) => b.load - a.load)
                    .slice(0, 5)
                    .map((line) => {
                      const systemPrediction = predictions.length > 0 ? predictions[0] : null;
                      
                      const isTopLine = line === [...lines].sort((a, b) => b.load - a.load)[0];
                      const predictedLoad = isTopLine && systemPrediction ? systemPrediction.predicted_rho : null;
                      
                      const isTrendingCritical = predictedLoad !== null && predictedLoad > 0.95;

                      return (
                        <div key={line.id} style={{ marginBottom: '15px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                            <span style={{ fontSize: '0.8rem', color: line.status ? 'white' : '#ff0000' }}>
                              Line {line.id} {isTopLine ? '(Peak)' : `(${line.from} ➔ ${line.to})`}
                            </span>
                            <span style={{ fontSize: '0.8rem', color: !line.status ? '#ff0000' : (line.load > 0.9 ? '#ffaa00' : 'white') }}>
                              {!line.status ? 'CUT' : `${(line.load * 100).toFixed(1)}%`}
                            </span>
                          </div>
                          <LoadBar load={line.status ? line.load : 0} />
                          
                          {isTopLine && predictedLoad !== null && (
                            <div style={{ marginTop: '5px', fontSize: '0.75rem', display: 'flex', justifyContent: 'space-between', color: isTrendingCritical ? '#ff4444' : 'white' }}>
                              <span> 30 min Peak Forecast:</span>
                              <span style={{fontWeight: 'bold'}}>
                                {(predictedLoad * 100).toFixed(1)}%
                                {isTrendingCritical && " CRITICAL TREND"}
                              </span>
                            </div>
                          )}
                        </div>
                      )
                    })
                  }
                </>
              ) : activeTab === 'analytics' ? (
                <>
                  <h3 style={{ marginTop: 0 }}>Grid Load Trends (TimescaleDB)</h3>
                  <TimeChart data={chartData} activeLineIds={topLineIds} getLineName={getLineName}/>
                  <div style={{ marginTop: '20px', fontSize: '0.8rem', color: '#888' }}>
                    Dynamically displaying the 5 most stressed transmission lines.
                  </div>
                </>
              ) : (
                <div>
                  <h3 style={{ marginTop: 0 }}>System Logs ({alertHistory.length})</h3>
                  {alertHistory.length === 0 ? <p style={{color:'#888'}}>No alerts recorded yet.</p> : (
                    alertHistory.map((log) => (
                      <div key={log.id} style={{ 
                        marginBottom: '10px', padding: '10px', 
                        borderLeft: `4px solid ${log.severity === 'critical' ? '#ff0000' : '#ff9900'}`,
                        backgroundColor: 'rgba(255,255,255,0.05)',
                        fontSize: '0.8rem',
                      }}>
                        <p style={{color: '#888', marginBottom: '4px'}}>{log.time}</p>
                        <p style={{ color: log.severity === 'critical' ? '#ff4444' : '#ffaa00' }}>{log.message}</p>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

        </div>
        
      </div>
      )}
    </div>

  )
}

