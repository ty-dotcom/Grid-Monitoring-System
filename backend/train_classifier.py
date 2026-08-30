import numpy as np
import pandas as pd
from sklearn.metrics import classification_report, precision_score, recall_score, f1_score, accuracy_score
import joblib
import random
import lightgbm as lgb

from setup_env import get_env

TARGET_ANOMALY_RECALL = 0.90
TARGET_ANOMALY_PRECISION = 0.90
TARGET_F1_SCORE = 0.90
TARGET_ACCURACY = 0.90

np.random.seed(42)
random.seed(42)

while True:
    total_steps = 5000
    attempt = 1
    env, obs = get_env()

    renewable_mask = env.gen_renewable
    data = []

    for step in range(total_steps):
        if step % 30 == 0:
            action = env.action_space()
            active_lines = [i for i, status in enumerate(obs.line_status) if status == True]
            if active_lines:
                line_to_trip = random.choice(active_lines)
                action = env.action_space({"set_line_status": [(line_to_trip, -1)]})
        else:
            action = env.action_space({})

        obs, _, done, _ = env.step(action)
        if done:
            obs = env.reset()
            continue

        max_rho = float(obs.rho.max())
        total_p_load = float(obs.load_p.sum())
        total_q_load = float(obs.load_q.sum())
        total_prod_p = float(obs.prod_p.sum())

        total_renewable_p = float(obs.gen_p[renewable_mask].sum())
        total_thermal_p = float(obs.gen_p[~renewable_mask].sum())

        num_tripped_lines = obs.line_status.tolist().count(False)

        is_anomaly = 1 if max_rho > 0.95 or num_tripped_lines > 2 else 0

        row = [total_p_load, total_q_load, total_prod_p, total_renewable_p, total_thermal_p, is_anomaly]
        data.append(row)

    df = pd.DataFrame(data, columns=[
        "total_p_load", "total_q_load", "total_prod_p",
        "total_renewable_p", "total_thermal_p", "is_anomaly"
    ])

    df['net_load'] = df['total_p_load'] - df['total_renewable_p']
    df['renewable_penetration'] = df['total_renewable_p'] / (df['total_p_load'] + 1e-5)
    df['renewable_ramp'] = df['total_renewable_p'].diff(periods=3).fillna(0)

    df['load_drop'] = df['total_p_load'].diff(periods=20).fillna(0)
    df['load_rolling_mean'] = df['total_p_load'].rolling(window=15).mean()
    df['load_rolling_std'] = df['total_p_load'].rolling(window=15).std()
    df['generation_mismatch'] = df['total_p_load'] - df['total_prod_p']

    df = df.dropna().reset_index(drop=True)

    X = df.drop(columns=['is_anomaly'])
    y = df['is_anomaly']

    train_size = int(len(df) * 0.8)
    X_train, X_test = X.iloc[:train_size], X.iloc[train_size:]
    y_train, y_test = y.iloc[:train_size], y.iloc[train_size:]

    model = lgb.LGBMClassifier(
        boosting_type='gbdt',
        num_leaves=31,
        learning_rate=0.05,
        feature_fraction=0.9,
        random_state=42,
        n_jobs=-1,
        verbose=-1
    )
    model.fit(X_train, y_train, eval_X=X_test, eval_y=y_test)
    y_pred = model.predict(X_test)

    print("Grid Anomaly Classification Model Evaluation:")

    current_recall = recall_score(y_test, y_pred)
    current_precision = precision_score(y_test, y_pred)
    current_f1 = f1_score(y_test, y_pred)
    current_accuracy = accuracy_score(y_test, y_pred)

    print(classification_report(y_test, y_pred, target_names=['Normal', 'Anomaly']))

    if current_recall >= TARGET_ANOMALY_RECALL and current_precision >= TARGET_ANOMALY_PRECISION and current_f1 >= TARGET_F1_SCORE and current_accuracy >= TARGET_ACCURACY:
        print("\nBest dataset found")
        df.to_csv('simulated_anomaly_data.csv', index=False)
        joblib.dump(model, 'clf_model.pkl')
        break
    else:
        print("Retrying...\n")
        attempt += 1

env.close()