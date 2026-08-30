import {MapContainer, TileLayer, CircleMarker, Popup, Tooltip, Polyline, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { useState, useEffect } from 'react';
import type { Substation } from '../constants';

interface MapProps{
    gridData: any[];
    color: string;
    lineStatuses: boolean[];
    stations: Substation[];
    lines: any[];
    center: [number, number];
}


const assignMarkColor = (load: number, status: boolean) => {
    if (!status) return 'grey';
    if (load > 1.0) return "red";
    if (load > 0.9) return "orange"
    if (load > 0.7) return "#FFEA00"
    return 'green'

}

function MapUpdater({center}: {center: [number, number]}){
        const map = useMap();

        useEffect(()=>{
            if (center) {
                map.flyTo(center, 10, {duration: 1.5});
            }
        }, [center, map]);

        return null;
    }
export default function GridMap({gridData, color, lineStatuses, stations, lines, center}: MapProps){
    
    return(
        <MapContainer 
        center={center}
        zoom={10}
        style={{ height: '100%'}}
        >
            <MapUpdater center={center}/>
            <TileLayer 
            url={`https://{s}.basemaps.cartocdn.com/${color}_all/{z}/{x}/{y}{r}.png`}
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
            />

            {lines.map((line)=> {
                const fromStation = stations.find(s => s.id === line.from);
                const toStation = stations.find(s => s.id === line.to);


                if (!fromStation || !toStation) {
                    console.log(line, stations)

                    return null;

                }

                const color = assignMarkColor(line.load, line.status);
                const weight = line.status ? 4 : 2;
                const dashArray = line.status ? undefined : '10, 10';

                return (
                    <Polyline 
                    key={`line-${line.id}`}
                    positions={[[fromStation.lat, fromStation.lng],[toStation.lat, toStation.lng]]}
                    pathOptions={{color, weight, dashArray, opacity: 0.8}}
                    >
                        <Tooltip> Line {line.id} - {(line.load * 100).toFixed(1)} %</Tooltip>
                    </Polyline>
                )
            })}

            {
                stations.map((station) => {
                    const currLoad = gridData[station.id] ? gridData[station.id] : 0;
                    const lineStatus = lineStatuses[station.id];
                    const color = assignMarkColor(currLoad, true);
                    let styling;
                    if (currLoad === 0 && !lineStatus){
                        styling = {
                            color: '#ff0000',
                            weight: 4,
                            fillColor: 'transparent',
                            fillOpacity: 0,
                            dashArray: '5, 5'
                        };
                    } else {
                        styling = {
                            color: color, 
                            weight: 2, 
                            fillColor: color, 
                            fillOpacity: 0.6 
                        };

                    }
                            

                    return(
                        <CircleMarker
                        key={station.id}
                        center={[station.lat, station.lng]}
                        radius={15}
                        pathOptions={styling}
                        >
                            <Tooltip>{station.name}</Tooltip>
                            <Popup >
                                <div style={{ textAlign: 'center'}}>
                                    <h3>{station.name}</h3>
                                    <p>Type: {station.type.toUpperCase()}</p>
                                    <p>Load: <b style={{color: color}}> {(currLoad * 100).toFixed(1)}%</b></p>
                                </div>
                            </Popup>
                        </CircleMarker>
                    )
                })
            }

        </MapContainer>
        
    )
}