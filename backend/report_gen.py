from datetime import datetime
from jinja2 import Environment, FileSystemLoader
from weasyprint import HTML
import random

def create_report(anomalies):
    """ Creates the grid history report using Jinja2 and weasyprint. """
    env = Environment(loader=FileSystemLoader('.'))
    template = env.get_template('templates/report_template.html')

    for anomaly in anomalies:
        print(anomaly.line_id, anomaly.line_load, anomaly.anomaly_type)
    html_content = template.render(
        report_id=f"_{random.randint(100000,999999)}",
        generated_at=datetime.now().strftime("%m/%d/%Y %H:%M:%S %p"),
        total_anomalies=len(anomalies),
        logs=[{
            "time": log.time.strftime("%m/%d/%Y %H:%M:%S %p"),
            "line_id": log.line_id,
            "line_load": log.line_load,
            "anomaly_type": log.anomaly_type
        } for log in anomalies]

    )

    return HTML(string=html_content).write_pdf()