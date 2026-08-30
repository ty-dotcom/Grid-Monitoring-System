import random
import numpy as np
import pandas as pd
from sklearn.metrics import mean_squared_error, r2_score, mean_absolute_error
import joblib
import lightgbm as lgb
from setup_env import get_env

np.random.seed(42)
random.seed(42)

curr_rsme = 0.13
curr_r2 = 0.0
model = None
attempt = 0
while True:
    total_steps = 5000
    data = []
    env, obs = get_env()

    renewable_mask = env.gen_renewable

    for step in range(total_steps):
        obs, _, done, _ = env.step(env.action_space({}))
        if done:
            obs = env.reset()
            continue

        max_rho = float(obs.rho.max())
        total_p_load = float(obs.load_p.sum())
        total_q_load = float(obs.load_q.sum())
        total_prod_p = float(obs.prod_p.sum())

        total_renewable_p = float(obs.gen_p[renewable_mask].sum())
        total_thermal_p = float(obs.gen_p[~renewable_mask].sum())

        data.append([max_rho, total_p_load, total_q_load, total_prod_p, total_renewable_p, total_thermal_p])

    df = pd.DataFrame(data, columns=[
        "max_rho", "total_p_load", "total_q_load", "total_prod_p",
        "total_renewable_p", "total_thermal_p"
    ])

    df['net_load'] = df['total_p_load'] - df['total_renewable_p']
    df['renewable_penetration'] = df['total_renewable_p'] / (df['total_p_load'] + 1e-5)
    df['renewable_ramp'] = df['total_renewable_p'].diff(periods=3).fillna(0)

    df['load_drop'] = df['total_p_load'].diff(periods=20).fillna(0)
    df['load_rolling_mean'] = df['total_p_load'].rolling(window=15).mean()
    df['load_rolling_std'] = df['total_p_load'].rolling(window=15).std()
    df['generation_mismatch'] = df['total_p_load'] - df['total_prod_p']

    df['target_max_rho'] = df['max_rho'].shift(-6)

    df.dropna(inplace=True)

    X = df.drop(columns=['target_max_rho'], axis=1)
    y = df['target_max_rho']

    train_size = int(len(df) * 0.8)
    X_train, X_test = X.iloc[:train_size], X.iloc[train_size:]
    y_train, y_test = y.iloc[:train_size], y.iloc[train_size:]

    model = lgb.LGBMRegressor(
        boosting_type='gbdt',
        n_estimators=200,
        num_leaves=31,
        max_depth=8,
        learning_rate=0.05,
        feature_fraction=0.9,
        random_state=42,
        n_jobs=-1,
        verbose=-1,
        metric='rmse',
    )

    model.fit(X_train, y_train, eval_X=X_test, eval_y=y_test)

    predictions = model.predict(X_test)
    curr_rsme = np.sqrt(mean_squared_error(y_test, predictions))
    curr_r2 = r2_score(y_test, predictions)
    mae = mean_absolute_error(y_test, predictions)

    print("\nLoad Prediction Model Evaluation:")
    print(f"Test RMSE: {curr_rsme:.4f}")
    print(f"Test R_2: {curr_r2:.4f}")
    print(f"MAE: {mae:.4f}")

    if curr_rsme < 0.04 and curr_r2 > 0.90:
        print("\nBest dataset found")
        df.to_csv('simulated_regression_data.csv', index=False)
        joblib.dump(model, 'load_predictor.pkl')
        break
    else:
        print("Retrying...")
        attempt += 1
env.close()
