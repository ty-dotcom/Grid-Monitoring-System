def test_layout_endpoint(client):
    response = client.get("/api/grid/layout")
    assert response.status_code == 200

def test_step_endpoint(client):
    response = client.post("/api/grid/step")
    assert response.status_code == 200


def test_force_event_endpoint(client):
    response = client.post("/api/grid/force_event")
    assert response.status_code == 200


def test_history_endpoint(client):
    response = client.get("/api/grid/history")
    assert response.status_code == 200

def test_reports_endpoint(client):
    response = client.get("/api/report/download")
    assert response.status_code == 200

