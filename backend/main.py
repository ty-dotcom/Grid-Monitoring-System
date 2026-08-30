import ast
import io
import logging
import math
import random
from collections import deque
from contextlib import asynccontextmanager
from apscheduler.schedulers.asyncio import AsyncIOScheduler

import joblib
import pandas as pd
import numpy as np
import uvicorn
from fastapi import FastAPI, Depends
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from geopy import Nominatim
from geopy.distance import geodesic
from sqlalchemy import text
from sqlalchemy.orm import Session

from report_gen import create_report
from setup_env import get_env
from models import GridMetrics, Base
from database import init_db, engine


def manage_db(db: Session = Depends(init_db)):
    """ Deletes data that is two hours old from the database, to prevent congestion."""
    try:
        query = """
        DELETE FROM grid_metrics
            WHERE time > NOW() - INTERVAL '2 hours'
        """
        db.execute(text(query))
        db.commit()
        print("Database updated")
    except Exception as e:
        print("Database error: ", e)
    finally:
        db.close()

@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler = AsyncIOScheduler()
    scheduler.add_job(func=manage_db, trigger="interval", seconds=3600)
    scheduler.start()
    yield


Base.metadata.create_all(engine)

app = FastAPI(title="National Grid Anomaly Monitoring System", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)

env, obs = None,None
latitude, longitude = None, None
manual_action = None
target_stations = list(range(14))
edges = []
stations = []
line_data = []

load_history = deque(maxlen=21)
renewable_history = deque(maxlen=21)
active_redispatch_mw = 0.0
details = {}

try:
    clf_model = joblib.load('clf_model.pkl')
    reg_model = joblib.load('load_predictor.pkl')
    PREDICTIONS_ENABLED = True
    logging.info("AI Models (RF) loaded successfully.")
except Exception as e:
    PREDICTIONS_ENABLED = False
    logging.warning(f"AI Models not loaded: {e}")


def create_stations(pos):
    """ Create a list of stations based on the number of remaining stations needed
     using the latitude and longitude coordinates from the user."""
    global latitude,longitude, target_stations
    radius = 0.25

    for i in range(pos, len(target_stations)):
        angle = (2 * math.pi * i) / len(target_stations)

        offset_lat = radius * math.cos(angle)
        offset_lng = radius * math.sin(angle)

        jitter_lat = random.uniform(-0.01, 0.01)
        jitter_lng = random.uniform(-0.01, 0.01)

        final_lat = latitude + offset_lat + jitter_lat
        final_lng = longitude + offset_lng + jitter_lng

        stations.append({
            'id': i,
            'name': f"Substation {i}",
            'lat': final_lat,
            'lng': final_lng,
        })
    return stations

def get_location_details():
    """ Retrieves the user's location details to assign the stations based on their country."""
    global details
    geolocator = Nominatim(user_agent="province_locator")
    details = geolocator.reverse(f'{latitude}, {longitude}', language='en').raw['address']
    return details

def assign_real_stations():
    """ Assigns the stations using one of the substation dataset based on the user's current location."""
    global currency, stations
    country = details['country'].lower()
    options = ['belize', 'brazil', 'canada', 'china', 'egypt', 'france', 'jamaica',
               'netherlands', 'nigeria', 'papua-new-guinea', 'philippines', 'us', 'guyana']

    if country not in options:
        return []

    df = pd.read_csv(f'./earth_data/out/{country}_substation.csv')
    if 'tags.name' in df.columns:
        filtered_df = df[df['tags.name'].notna()].copy()
    else:
        filtered_df = df[df['tags.name:en'].notna()].copy()

    filtered_df['distance'] = filtered_df.apply(
        lambda row: geodesic((latitude, longitude), (ast.literal_eval(row.lonlat)[0][1],
                                                     ast.literal_eval(row.lonlat)[0][0])).kilometers, axis=1)
    closest = filtered_df.sort_values(by=['distance'], ascending=True).head(14)

    for i, (index, row) in enumerate(closest.iterrows()):
        latlon = ast.literal_eval(row['lonlat'])[0][::-1]
        station = {
            'id': i,
            'name': row['tags.name'],
            'lat': latlon[0],
            'lng': latlon[1],
        }
        stations.append(station)
    return stations

def generate_features(max_rho, total_p, total_q, total_prod_p, total_renewable_p, total_thermal_p):
    """Generates the features used for both the Anomaly Detection Model and Load Predictor."""
    global env, obs
    env, obs = get_env()

    net_load = total_p - total_renewable_p
    renewable_penetration = total_renewable_p / (total_p + 1e-5)

    load_list = list(load_history)
    load_drop = load_list[-1] - load_list[0]

    recent_window = load_list[-15:]
    load_rolling_mean = np.mean(recent_window)
    load_rolling_std = np.std(recent_window)
    generation_mismatch = total_p - total_prod_p

    renew_list = list(renewable_history)
    renewable_ramp = renew_list[-1] - renew_list[-4] if len(renew_list) >= 4 else 0.0

    features = [total_p, total_q, total_prod_p, total_renewable_p, total_thermal_p,
        net_load, renewable_penetration, renewable_ramp,
        load_drop, load_rolling_mean, load_rolling_std, generation_mismatch]

    columns = [
        "total_p_load", "total_q_load", "total_prod_p", "total_renewable_p", "total_thermal_p",
        "net_load", "renewable_penetration", "renewable_ramp",
        "load_drop", "load_rolling_mean", "load_rolling_std", "generation_mismatch"
    ]

    anomaly_features_df = pd.DataFrame([features], columns=columns)

    features.insert(0, max_rho)
    columns.insert(0, "max_rho")

    regression_features_df = pd.DataFrame([features], columns=columns)

    return anomaly_features_df, regression_features_df

def load_predict(features):
    """Returns the predicted load as well as the load trend found using the load predictor regression model."""
    global env, obs
    env, obs = get_env()

    predicted_rhos = []
    new_features = features.copy()

    for _ in range(6):
        next_pred = reg_model.predict(new_features)[0]
        predicted_rhos.append(float(next_pred))
        new_features['max_rho'] = next_pred

    return [{
        "current_rho": features['max_rho'].values[0],
        "predicted_rho": predicted_rhos[-1],
        "trend": predicted_rhos,
        "load_history": load_history,
    }]


@app.get("/api/grid/layout")
def get_grid_layout(lat: float = 18.1096, lng: float = -77.2975):
    """Creates the grid layout for the system, using the user location and Grid2Op's grid layout to assign lines
    as well as types."""
    global obs, env, latitude, longitude, edges, stations, line_data, details

    if (not stations and not line_data) or (latitude != lat and longitude != lng):
        latitude, longitude = lat, lng
        details = get_location_details()

        env, obs = get_env()
        loads = obs.rho.tolist()

        line_data = []

        stations = assign_real_stations()
        if len(stations) < 14:
            stations = create_stations(len(stations))

        types = obs.gen_type.tolist()
        gen_sub_id = obs.gen_to_subid.tolist()
        for station in stations:
            if station['id'] in gen_sub_id:
                index = [i for i, s in enumerate(gen_sub_id) if s == station['id']]
                if len(index) > 1:
                    type = "/".join([types[i].title() for i in index])
                else:
                    type = types[index[0]].title()
                station['type'] = type
            else:
                station['type'] = 'Urban'


        for line_id in range(env.n_line):
            origin = obs.line_or_to_subid.tolist()[line_id]
            dest = obs.line_ex_to_subid.tolist()[line_id]
            load = loads[line_id]
            line_data.append({
                'id': line_id,
                'from': origin,
                'to': dest,
                'load': load,
                'status': obs.line_status.tolist()[line_id]
            })

    return {"stations": stations, "line_data": line_data}


@app.post("/api/grid/step")
def step_simulation(db: Session = Depends(init_db)):
    """Advancing the grid by 1 time step which is approximately 5 minutes"""
    global obs, edges, env, latitude, longitude, manual_action, active_redispatch_mw, load_history, renewable_history
    env, obs = get_env()

    if manual_action:
        action = manual_action
        manual_action = None
    else:
        action = env.action_space({})

    obs, reward, done, info = env.step(action)

    if done:
        obs = env.reset()
        load_history.clear()
        renewable_history.clear()
        return {"status": 'BLACKOUT_RESET'}

    simulated_loads = obs.rho.tolist()
    line_statuses = obs.line_status.tolist()

    anomalies = []
    live_lines = []


    for line_id in range(env.n_line):
        status = bool(line_statuses[line_id])
        if not status:
            anomalies.append({
                'id': line_id,
                "load": 0.0,
                "severity": 'DISCONNECTED',
                'reason': "Cyber Attack / Physical Disruption"
            })

        live_lines.append({
            "id": line_id,
            "from": int(obs.line_or_to_subid[line_id]),
            "to": int(obs.line_ex_to_subid[line_id]),
            "load": float(simulated_loads[line_id]),
            "status": status,
        })


    tripped = obs.line_status.tolist().count(False)
    load_history.append(float(obs.load_p.sum()))
    renewable_history.append(float(obs.gen_p[env.gen_renewable].sum()))

    max_rho = float(np.max(simulated_loads))

    total_p = float(obs.load_p.sum())
    total_q = float(obs.load_q.sum())
    total_prod_p = float(obs.prod_p.sum())

    renewable_mask = env.gen_renewable
    total_renewable_p = float(obs.gen_p[renewable_mask].sum())
    total_thermal_p = float(obs.gen_p[~renewable_mask].sum())

    anomaly_features, regression_features = generate_features(max_rho, total_p, total_q, total_prod_p, total_renewable_p, total_thermal_p)

    probability = 0.0

    if len(load_history) > 21:
        load_history.pop(0)

    if PREDICTIONS_ENABLED and env.nb_time_step >= 15:
        probability = clf_model.predict_proba(anomaly_features)[0][1]
        pred = clf_model.predict(anomaly_features)
        if probability >= 0.6 and pred[0] == 1:
            reason = f"System Risk ({probability*100:.0f}%): Peak {max_rho*100:.0f}%. Load Drop: {anomaly_features['load_drop'].values[0]:.1f}MW. "

            if tripped > 0:
                reason += f"{tripped} lines lost. "

            anomalies.append({
                'id': 'SYS',
                'load': max_rho,
                'severity': 'CRITICAL',
                'reason': reason,
            })

    predictions = []
    source, sink = 0.0, 0.0
    if PREDICTIONS_ENABLED or len(load_history) < 15:
        predictions = load_predict(regression_features)
        if probability >= 0.5 and predictions[0]['predicted_rho'] > 0.95:
            ramp_up = env.gen_max_ramp_up
            ramp_down = env.gen_max_ramp_down
            available_generators = [i for i in range(env.n_gen) if ramp_up[i] > 0 and ramp_down[i] > 0]

            if len(available_generators) > 2:

                source = max(available_generators, key=lambda i: obs.prod_p[i])
                sink = min(available_generators, key=lambda i: obs.prod_p[i])

                ramp_down_lim = ramp_down[source]
                ramp_up_lim = ramp_up[sink]

                dispatching = min(15, ramp_down_lim, ramp_up_lim)
                action = env.action_space()
                action.redispatch = [(source, -dispatching), (sink, dispatching)]
                active_redispatch_mw = dispatching
        else:
            if active_redispatch_mw > 0:
                action.redispatch = [(source, active_redispatch_mw), (sink, -active_redispatch_mw)]
                active_redispatch_mw = 0

    for line_id in range(env.n_line):
        load = float(simulated_loads[line_id])
        voltage = float(obs.v_or[line_id])
        status = bool(line_statuses[line_id])

        anomaly = None

        if not status:
            anomaly = "LINE_TRIPPED"
        elif load > 1.0:
            anomaly = "PHYSICAL_OVERLOAD"
        elif load > 0.85 and probability >= 0.6:
            anomaly = "AI_PREDICTED_RISK"
        elif load > 0.85:
            anomaly = "HIGH_LOAD_WARNING"

        db_record = GridMetrics(
            line_id=line_id,
            voltage=voltage,
            line_load=load,
            anomaly_type=anomaly,
        )
        db.add(db_record)

    db.commit()

    return {
        "status": "SUCCESS",
        "timestamp": env.nb_time_step,
        "line_loads": simulated_loads,
        "line_statuses": line_statuses,
        "live_lines": live_lines,
        "usage": {'consumption': np.round(total_p, 2),
                  'renewable_production':np.round(total_renewable_p, 2),
                  'thermal_production':np.round(total_thermal_p, 2)},
        "max_line_load": np.round(float(np.max(simulated_loads)), 4),
        "num_anomalies": len(anomalies),
        "anomalies": anomalies,
        "predictions": predictions,
    }


@app.post("/api/grid/force_event")
def force_event():
    """ Manually cuts one line on the grid. """
    global obs
    env, obs = get_env()

    global manual_action
    env, obs = get_env()

    line_to_cut = random.randint(0, obs.n_line)
    line_status = obs.line_status.tolist()[line_to_cut]

    if not line_status:
        line_to_cut = random.randint(0, obs.n_line)

    manual_action = env.action_space({"set_line_status": [(line_to_cut, -1)]})

    return {
        "status": "ACTION QUEUED",
    }


@app.get("/api/grid/history")
def grid_history(db: Session = Depends(init_db)):
    """ Retrieves the grid history from the database. """
    query = """
        SELECT 
            time_bucket('5 minutes', time) AS bucket,
            line_id,
            AVG(line_load) as avg_load
        FROM grid_metrics
        WHERE time > NOW() - INTERVAL '2 hours'
        GROUP BY bucket, line_id
        ORDER BY line_id ASC, bucket ASC
        LIMIT 100;
    """

    res = db.execute(text(query)).fetchall()
    data = []

    for r in res:
        data.append({
            "time": r[0].isoformat(),
            "line_id": r[1],
            "avg_load": round(r[2], 4),
        })
    return data

@app.get("/api/report/download")
def download_report(db: Session = Depends(init_db)):
    """ Returns a PDF report of the Grid Load History"""
    anomalies = db.query(GridMetrics).filter(
        GridMetrics.anomaly_type.isnot(None)
    ).order_by(GridMetrics.time.desc()).limit(50).all()

    pdf = create_report(anomalies)

    return StreamingResponse(
        io.BytesIO(pdf),
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=grid_anomaly_report.pdf"}
    )



if __name__ == '__main__':
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
