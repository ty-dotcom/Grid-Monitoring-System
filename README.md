

# Project Design & Implementation Document

## 1. Project Background & Motivation
With recent events causing Jamaica's power grid to fail for long periods, particularly caused by the worsening weather patterns. My aim was to develop a full-stack, intelligent power grid monitoring and auxiliary decision-making platform. By integrating a power grid simulation framework with real-time meteorological data, machine learning-based anomaly detection, prediction of loads and system costs. The system enables early warning of potential grid failures (line overloads, voltage violations) and generates standardized anomaly analysis reports.

## 2. System Architecture Design

*   **Frontend:** A Single Page Application built with `Vite + React + TypeScript`, responsible for spatial topology visualization and time-series data rendering.
*   **API:** An asynchronous RESTful API built with `FastAPI`. FastAPI was chosen for its asynchronous nature which performs well for high-frequency time-series data streams.
*   **Simulation & Algorithm:** The core physics engine utilizes `Grid2Op`combined with a two machine learning models, predicting the the value of the highest load in the next 30 mins (~6 steps in Grid2op) and anomaly detection.        
*   **Database:** `PostgreSQL + TimeScaleDB` for historical time-series data persistence; `Open-Meteo API` for real-world meteorological boundary conditions.

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
 load drop, rolling mean and standard deviation, the difference between the power generated vs the power used and the active/reactive power consumption. These features were generated from Grid2Op to train a `LGBMClassifier` to predict anomlaies within the grid and a `LGBMRegressor` to predict the highest load in the system in the next 30 mins (~6 steps in Grid2Op).

- **Top 5 Load Time Series Chart** : A time series plot of the top five highest loads in the grid using `recharts`.

- **Report Generation** : Generates a report based on the most recent anomalies.


## 5. Model Evaluations

### Grid Anomaly Classfication Model

![App Screenshot](/model_details/classifier_eval)
![App Screenshot](/model_details/Classification)

The dataset used held high imbalance, as such a precision-recall curve was the best method
to visulalize the perfomance of the model. The model performed well yeilding high precision
and recall, as well as accuracy.

### Load Prediction Model

![App Screenshot](/model_details/load_eval)
![App Screenshot](/model_details/Load Regression)

Although the model is quite strong, there exists strong underfitting when the load is high. 
There was only a 2.74% error when predicting, and only ~8.5% of the variation remains unexplained.

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

Once your server has been configured, enter this script into your Query

```bash
  SELECT create_hypertable('grid_metrics', 'time', chunk_time_interval => INTERVAL '5 mins');
```

Update the database.py file using your username and password

If you wish to test your country, simply add your country to the list in generate_substation_dataset.py

Using separate terminals/IDE

Go to the frontend directory

```bash
  cd Grid-Sim/frontend
```

Install dependencies

```bash
  npm install
```

Go to the backend directory

```bash
  cd Grid-Sim/backend
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

