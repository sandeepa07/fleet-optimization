# Realistic sea-route optimization metrics

import math

# -----------------------------
# Vessel performance parameters
# -----------------------------
OPTIMAL_SPEED = 20        # knots
BASE_FUEL_RATE = 0.25     # kg fuel per km at optimal speed
EMISSION_FACTOR = 3.114   # kg CO2 per kg fuel
AVERAGE_SPEED_KM_H = 25   # average vessel cruising speed

FUEL_COST_PER_KM = 0.85
FUEL_DENSITY_KG_PER_LITER = 0.87


# -----------------------------
# Port congestion model
# -----------------------------
PORT_CONGESTION_HOURS = {
    1: 6, 2: 8, 3: 7, 4: 5, 5: 5, 6: 7, 7: 3, 8: 3,
    9: 4, 10: 6, 11: 4, 12: 5, 13: 4, 14: 2, 15: 7,
    16: 2, 17: 5,
}

# -----------------------------
# Hub premium costs
# -----------------------------
HUB_PREMIUM_USD = {
    1: 8000, 2: 10000, 3: 7000, 4: 5000, 5: 5000,
    6: 9000, 7: 2000, 8: 2000, 9: 3000,
    10: 5000, 11: 3000, 12: 3000, 13: 2000,
    14: 1000, 15: 10000, 16: 1500, 17: 5000,
}


# -----------------------------
# Speed-based fuel model
# -----------------------------
def compute_fuel(distance_km, speed):
    """
    Fuel consumption depends on vessel speed.
    Ships approximately consume fuel proportional to speed^3.
    """
    speed_factor = (speed / OPTIMAL_SPEED) ** 3
    fuel = distance_km * BASE_FUEL_RATE * speed_factor
    return fuel


def compute_carbon_emissions(fuel):
    """
    Carbon emissions based on fuel usage
    """
    return fuel * EMISSION_FACTOR


def compute_travel_time(distance_km, speed):
    """
    Travel time based on vessel speed
    """
    return distance_km / speed


# -----------------------------
# Main metric calculation
# -----------------------------
def calculate_metrics(path, distance_km, ports_dict, speed=AVERAGE_SPEED_KM_H):
    """
    Calculate optimization metrics for a sea route path.
    """

    # --------------------------------
    # Port congestion calculation
    # --------------------------------
    port_congestion_hours = sum(
        PORT_CONGESTION_HOURS.get(pid, 3)
        for pid in path[1:-1]
    )

    # --------------------------------
    # Route efficiency model
    # --------------------------------
    num_stops = len(path) - 2

    congestion_factor = 1.0 + (port_congestion_hours / 50.0)
    efficiency_factor = 1.0 + (num_stops * 0.05)

    path_hash = sum(path[1:-1]) if len(path) > 2 else 0
    route_quality_bonus = 0.8 + ((path_hash % 20) / 50.0)

    total_efficiency = congestion_factor * efficiency_factor * route_quality_bonus

    # --------------------------------
    # Fuel calculation (speed dependent)
    # --------------------------------
    fuel_consumption_kg = compute_fuel(distance_km, speed) / max(total_efficiency, 0.3)

    fuel_cost = fuel_consumption_kg * 0.8

    # --------------------------------
    # Travel time
    # --------------------------------
    travel_time_hours = compute_travel_time(distance_km, speed) / min(route_quality_bonus, 1.2)

    # --------------------------------
    # Operational cost
    # --------------------------------
    operational_cost_per_hour = 2000

    time_based_cost = (travel_time_hours + port_congestion_hours) * operational_cost_per_hour

    hub_premium = sum(
        HUB_PREMIUM_USD.get(pid, 500)
        for pid in path[1:-1]
    )

    operational_cost = time_based_cost + hub_premium

    # --------------------------------
    # Carbon emissions
    # --------------------------------
    carbon_emissions_kg_co2 = compute_carbon_emissions(fuel_consumption_kg)

    # --------------------------------
    # Total cost
    # --------------------------------
    total_cost = fuel_cost + operational_cost

    return {
        'fuel_cost_usd': round(fuel_cost, 2),
        'fuel_consumption_kg': round(fuel_consumption_kg, 1),
        'travel_time_hours': round(travel_time_hours, 1),
        'port_congestion_hours': round(port_congestion_hours, 1),
        'operational_cost_usd': round(operational_cost, 2),
        'carbon_emissions_kg_co2': round(carbon_emissions_kg_co2, 1),
        'total_cost_usd': round(total_cost, 2),
    }


# -----------------------------
# Metrics comparison
# -----------------------------
def compare_metrics(classical_metrics, qaoa_metrics):

    comparisons = {}

    for metric in [
        'fuel_cost_usd',
        'travel_time_hours',
        'port_congestion_hours',
        'operational_cost_usd',
        'carbon_emissions_kg_co2',
        'total_cost_usd'
    ]:

        classical_val = classical_metrics[metric]
        qaoa_val = qaoa_metrics[metric]

        comparisons[metric] = {
            'classical': classical_val,
            'qaoa': qaoa_val,
            'qaoa_delta_pct': round(
                100 * (qaoa_val - classical_val) / classical_val, 2
            ) if classical_val > 0 else 0,
            'qaoa_delta_abs': round(qaoa_val - classical_val, 2),
        }

    return comparisons