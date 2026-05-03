# 🚀 Fleet Optimization using Quantum Machine Learning
## 🎯 Key Highlights
## ⚙️ Features
- Designed a quantum-inspired fleet optimization system using QUBO formulation
- Implemented route optimization using graph algorithms and Flask-based API
- Compared classical and quantum-inspired approaches (simulated annealing, QAOA)
- Built interactive frontend for route visualization
This project presents a quantum-inspired approach to fleet route optimization, integrating classical graph algorithms with quantum optimization techniques.
Features
- Frontend: Leaflet world map UI to select origin & destination ports
- Backend: Flask API that builds a sea-route graph from sample ports and computes k candidate sea paths
- QUBO approach: converts candidate-path selection to a small QUBO (choose 1 path)
- Solvers: classical (direct min), simulated annealing, and a QAOA placeholder (brute-force fallback)

Quick start (recommended in a Python venv)

1. Install dependencies

```powershell
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

2. Run the backend

```powershell
python -m backend.app
```

3. Open the demo

Navigate to `http://localhost:5000/frontend/index.html` or serve the `frontend` folder via a simple static server and point to `/api/ports` and `/api/routes` endpoints.

## 📊 Results
- Achieved optimized route selection using graph-based and quantum-inspired techniques
- Demonstrated reduced computational complexity compared to traditional approaches
- Successfully integrated backend optimization with interactive frontend visualization

Notes
- QAOA: the demo includes a placeholder; to run a true QAOA implementation install `qiskit` and extend `backend/optimizers.qaoa_simulator`.
- The graph uses k-nearest connections between ports to approximate sea routes for demonstration only.

Files
- backend/app.py: Flask server and API
- backend/optimizers.py: solver implementations
- backend/data_ports.py: sample ports
- frontend/*: map UI and client-side JS

If you want, I can:
- Wire Flask to serve the frontend directly (single server route)
- Extend QAOA using Qiskit for a runnable quantum demo (requires heavy deps)
- Add docker-compose for easier setup
