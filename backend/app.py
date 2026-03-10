from flask import Flask, jsonify, request
from backend.data_ports import PORTS
from backend.optimizers import classical_choice, qaoa_simulator
from backend.metrics import calculate_metrics, compare_metrics

import networkx as nx
import math
import time
from itertools import islice

app = Flask(__name__, static_folder='../frontend', static_url_path='/static')


# -----------------------------
# Serve frontend
# -----------------------------
@app.route('/')
def index():
    return app.send_static_file('index.html')


# -----------------------------
# Haversine distance
# -----------------------------
def haversine(a, b):

    lat1, lon1 = math.radians(a[0]), math.radians(a[1])
    lat2, lon2 = math.radians(b[0]), math.radians(b[1])

    dlat = lat2 - lat1
    dlon = lon2 - lon1

    R = 6371.0

    sa = math.sin(dlat/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin(dlon/2)**2

    return 2 * R * math.asin(math.sqrt(sa))


# -----------------------------
# Build graph
# -----------------------------
def build_graph(k=6):

    G = nx.Graph()

    for p in PORTS:
        G.add_node(
            p['id'],
            name=p['name'],
            lat=p['lat'],
            lon=p['lon'],
            region=p.get('region', '')
        )

    basins = {
        "asia_pacific": {1,2,8,9},
        "indian_ocean": {10,11,12,13,14,6,15,16},
        "europe": {3,5},
        "americas": {4,17},
        "africa": {7}
    }

    def get_basin(pid):
        for b, ports in basins.items():
            if pid in ports:
                return b
        return None

    for p in PORTS:

        distances = []

        for q in PORTS:

            if p['id'] == q['id']:
                continue

            d = haversine((p['lat'],p['lon']), (q['lat'],q['lon']))

            basin_p = get_basin(p['id'])
            basin_q = get_basin(q['id'])

            if basin_p == basin_q:
                d *= 0.8
            else:
                d *= 1.35

            if d > 9000:
                continue

            distances.append((d,q['id']))

        distances.sort()

        for d,qid in distances[:k]:
            if not G.has_edge(p['id'],qid):
                G.add_edge(p['id'],qid,weight=d)

    return G


# -----------------------------
# k shortest paths
# -----------------------------
from networkx.algorithms.simple_paths import shortest_simple_paths

def k_shortest_paths(G, source, target, k=8):

    try:
        paths_gen = shortest_simple_paths(G, source, target, weight='weight')
        return list(islice(paths_gen, k))

    except Exception:
        return []


# -----------------------------
# API: Ports
# -----------------------------
@app.route('/api/ports')
def api_ports():
    return jsonify(PORTS)


# -----------------------------
# API: Routes
# -----------------------------
@app.route('/api/routes')
def api_routes():

    origin = request.args.get('origin')
    dest = request.args.get('dest')

    if origin is None or dest is None:
        return jsonify({'error': 'origin and dest required'}), 400

    origin = int(origin)
    dest = int(dest)

    G = build_graph(k=8)

    if origin not in G or dest not in G:
        return jsonify({'error': 'invalid port ids'}), 400

    candidates = k_shortest_paths(G, origin, dest, k=8)

    if not candidates:
        return jsonify({'error': 'no paths found'}), 404


    # -----------------------------
    # Compute distances
    # -----------------------------
    costs = []
    coords_candidates = []
    path_summaries = []

    for path in candidates:

        length = 0
        coords = []

        for i in range(len(path)-1):

            a = (G.nodes[path[i]]['lat'], G.nodes[path[i]]['lon'])
            b = (G.nodes[path[i+1]]['lat'], G.nodes[path[i+1]]['lon'])

            length += haversine(a, b)

        for pid in path:

            node = G.nodes[pid]

            coords.append([node['lat'], node['lon'], pid])

        costs.append(length)

        coords_candidates.append(coords)

        path_summaries.append({
            'path_ids': path,
            'distance_km': round(length,1),
            'hops': len(path)-1
        })


    # -----------------------------
    # Calculate metrics
    # -----------------------------
    all_metrics = []

    ports_map = {p['id']: p for p in PORTS}

    for idx, path in enumerate(candidates):

        metrics = calculate_metrics(path, costs[idx], ports_map)

        all_metrics.append(metrics)


    n = len(all_metrics)


    # -----------------------------
    # Multi-objective score
    # -----------------------------
    DIST_WEIGHT = 0.5
    FUEL_WEIGHT = 0.2
    CARBON_WEIGHT = 0.2
    TIME_WEIGHT = 0.1

    multi_scores = []

    for i in range(n):

        m = all_metrics[i]

        score = (
            DIST_WEIGHT * costs[i] +
            FUEL_WEIGHT * m.get('fuel_consumption_kg',0) +
            CARBON_WEIGHT * m.get('carbon_emissions_kg_co2',0) +
            TIME_WEIGHT * m.get('travel_time_hours',0)
        )

        multi_scores.append(score)


    # -----------------------------
    # Build QUBO
    # -----------------------------
    def build_qubo(values):

        vmin = min(values)
        vmax = max(values)

        if vmax == vmin:
            vmax = vmin + 1

        normalized = [(v - vmin)/(vmax - vmin) for v in values]

        penalty = 15

        Q = [[0]*n for _ in range(n)]

        for i in range(n):
            Q[i][i] = normalized[i] - penalty

        for i in range(n):
            for j in range(i+1,n):
                Q[i][j] = Q[j][i] = 2 * penalty

        return Q


    Q_multi = build_qubo(multi_scores)


    # -----------------------------
    # Classical optimization
    # -----------------------------
    t0 = time.time()

    classical_idx = classical_choice(costs)

    t_classical = (time.time() - t0) * 1000


    # -----------------------------
    # QAOA optimization
    # -----------------------------
    t1 = time.time()

    qaoa_idx = qaoa_simulator(Q_multi, p=2, n_samples=1000)

    if qaoa_idx >= n:
        qaoa_idx = classical_idx

    t_qaoa = (time.time() - t1) * 1000


    min_cost = min(costs)
    max_cost = max(costs)


    # -----------------------------
    # Format result
    # -----------------------------
    def idx_to_result(idx, name, t):

        cost = costs[idx]

        path = candidates[idx]

        metrics = calculate_metrics(path, cost, ports_map)

        return {
            'index': idx,
            'path': path,
            'coords': coords_candidates[idx],
            'cost': round(cost,1),
            'algorithm': name,
            'compute_time_ms': round(t,2),
            'metrics': metrics,
            'path_summary': path_summaries[idx]
        }


    result = {

        'origin_port': next((p['name'] for p in PORTS if p['id']==origin),'Unknown'),

        'dest_port': next((p['name'] for p in PORTS if p['id']==dest),'Unknown'),

        'min_cost': round(min_cost,1),

        'max_cost': round(max_cost,1),

        'classical': idx_to_result(classical_idx,'Classical',t_classical),

        'qaoa': idx_to_result(qaoa_idx,'QAOA',t_qaoa),

        'candidates_coords': coords_candidates,

        'candidates_summary': path_summaries,

        'all_metrics': all_metrics
    }


    classical_metrics = result['classical']['metrics']
    qaoa_metrics = result['qaoa']['metrics']

    result['metric_comparison'] = compare_metrics(classical_metrics, qaoa_metrics)


    # -----------------------------
    # Optimization summary
    # -----------------------------
    optimization_summary = {}

    for metric, comp in result['metric_comparison'].items():

        c_val = comp['classical']
        q_val = comp['qaoa']

        if q_val < c_val:
            better = 'QAOA'
            improvement_pct = abs(comp['qaoa_delta_pct'])
        else:
            better = 'Classical'
            improvement_pct = abs(comp['qaoa_delta_pct'])

        optimization_summary[metric] = {
            'better': better,
            'improvement_pct': round(improvement_pct,2),
            'classical': c_val,
            'qaoa': q_val
        }

    result['optimization_summary'] = optimization_summary
    result['optimized_component'] = 'Multi-objective optimization'

    return jsonify(result)


# -----------------------------
# Run server
# -----------------------------
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)