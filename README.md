

# Project Design & Implementation Document

## Demo

https://github.com/user-attachments/assets/b1955520-e7d3-42c0-88af-f4c344b59574

## 1. Project Background & Motivation
With recent events causing Jamaica's power grid to fail for long periods, particularly caused by the worsening weather patterns. My aim was to develop a full-stack, intelligent power grid monitoring and auxiliary decision-making platform. By integrating a power grid simulation framework with machine learning-based anomaly detection and load prediction. The system enables early warning of potential grid failures (line overloads, voltage violations) and generates standardized anomaly analysis reports.

## 2. System Architecture Design

*   **Frontend:** A Single Page Application built with `Vite + React + TypeScript`, responsible for spatial topology visualization and time-series data rendering.
*   **API:** An asynchronous RESTful API built with `FastAPI`. FastAPI was chosen for its asynchronous nature which performs well for high-frequency time-series data streams.
*   **Simulation & Algorithm:** The core physics engine utilizes `Grid2Op`combined with a two machine learning models, predicting the value of the highest load in the next 30 mins (~6 steps in Grid2op) and anomaly detection.        
*   **Database:** `PostgreSQL + TimeScaleDB` for historical time-series data persistence; `Open-Meteo API` for real-world meteorological boundary conditions.
<img width="7559" height="3527" alt="Architecture" src="https://github.com/user-attachments/assets/43b42d8e-820b-4359-ae74-8b1b1d6e7ca6" />


## 3. Tech Stack
| Component | Tech Stack |
| :--- | :--- |
| **Simulation** | Grid2Op (`l2rpn_neurips_2020_track1_small`) |
| **Backend** | FastAPI + Uvicorn | 
| **Frontend** | React + TypeScript + Leaflet | 
| **Database** | PostgreSQL + TimeScaleDB |
| **Reports** | WeasyPrint + Jinja2 |

## 4. Features

- **Grid Simulation** : Using Grid2Op to simulate a realistic power grid.

- **Real-Time Grid Topology** : Using the user's location and their countries substation data gathered from `earth-osm` to recreate the country's ten closest substations to the user to generate a grid topology on `react-leaflet`, as well as creating a ring-based grid system if the country's data is not found.

- **Anomaly Detection & Highest Load Prediction** : Based on features including highest load, the power production for both renewable and non-renewable generators,
 load drop, rolling mean and standard deviation, the difference between the power generated vs the power used and the active/reactive power consumption. These features were generated from Grid2Op to train a `LGBMClassifier` to predict anomalies within the grid and a `LGBMRegressor` to predict the highest load in the system in the next 30 mins (~6 steps in Grid2Op).

- **Top 5 Load Time Series Chart** : A time series plot of the top five highest loads in the grid using `recharts`.

- **Report Generation** : Generates a report based on the most recent anomalies.


## 5. Model Evaluations

### Grid Anomaly Classfication Model

<img width="578" height="263" alt="classifier_eval" src="https://github.com/user-attachments/assets/b21eeeb2-32aa-425b-92ea-89707c3637af" />
<br>
<img width="1078" height="495" alt="Classification" src="https://github.com/user-attachments/assets/3782e46d-6a80-4c02-8d92-fc4d4543a0c4" />

The dataset held high imbalance, as such a precision-recall curve was the best method
to visulalize the performance of the model. The model had strong performance having an average precision of 0.97. 

### Load Prediction Model

<img width="345" height="121" alt="load_eval" src="https://github.com/user-attachments/assets/7c7e95f7-296b-4d24-a2d8-ca767c6955ea" />
<br>
<img width="1189" height="593" alt="1000672300" src="https://github.com/user-attachments/assets/00107fe0-0981-47a6-b105-683bc070d39c" />


The model held strong performance in the range of 0.65 rho to 0.90 rho, and began underestimating at >0.90 due to the rarity of these cases from the simulated data. The model made predominant usage of max_rho for predicting the target_rho, but also made use of power production and consumption. The rolling variables had much smaller influence on the prediction.
There was only a 1.59% error when predicting, and only ~3.3% of the variation remains unexplained.

### Colab used to evaluate model
https://colab.research.google.com/drive/1GGFtfbIZ2igx6gKjMGZXHP8VJ-__kYIm?usp=sharing


## Run Locally

Clone the project

```bash
  git clone https://link-to-project
```

Download and setup PostgreSQL and TimeScaleDB

https://www.postgresql.org
https://timescaledb.org


1. Copy backend/.env.example to backend/.env:

```bash
  cp backend/.env.example backend/.env
```

2. Edit your backend/.env and add your PostgreSQL credentials.

3. Ensure grid_db database exists and TimeScaleDB is installed, afterwhich run

```sql
  SELECT create_hypertable('grid_metrics', 'time', chunk_time_interval => INTERVAL '5 mins');
```

Using separate terminals/IDE

Go to the frontend directory

```bash
  cd Grid-Monitoring-System/frontend
```

Install dependencies

```bash
  npm install
```

Go to the backend directory

```bash
  cd Grid-Monitoring-System/backend
```

Install python requirements

```bash
  pip install -r requirements.txt
```

Otherwise run python code using an IDE.
Start the Backend server (Using Command Line). 

```bash
  python main.py
```


Start the Client server

```bash
  npm run start
```

