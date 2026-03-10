import random
import math
import numpy as np


# ---------------------------------------------------
# Classical optimizer
# ---------------------------------------------------
def classical_choice(costs):
    """
    Classical method: simply pick the route with minimum cost.
    In your system this corresponds to minimum distance.
    """
    return int(min(range(len(costs)), key=lambda i: costs[i]))


# ---------------------------------------------------
# Simulated Annealing optimizer (for comparison)
# ---------------------------------------------------
def simulated_annealing(Q, steps=2000, start_temp=5.0, end_temp=0.01):

    n = len(Q)

    state = [0] * n
    state[random.randrange(n)] = 1

    def energy(s):
        e = 0.0
        for i in range(n):
            for j in range(n):
                e += Q[i][j] * s[i] * s[j]
        return e

    best = list(state)
    best_e = energy(state)

    for t in range(steps):

        temp = start_temp * ((end_temp / start_temp) ** (t / steps))

        s = list(state)

        if random.random() < 0.7:
            i = random.randrange(n)
            s[i] = 1 - s[i]
        else:
            i, j = random.sample(range(n), 2)
            s[i], s[j] = s[j], s[i]

        e = energy(s)
        de = e - energy(state)

        if de < 0 or math.exp(-de / temp) > random.random():
            state = s
            if e < best_e:
                best = list(s)
                best_e = e

    ones = [i for i, v in enumerate(best) if v == 1]

    if len(ones) == 1:
        return ones[0]

    energies = []

    for i in range(n):
        vec = [0] * n
        vec[i] = 1

        e = 0.0
        for a in range(n):
            for b in range(n):
                e += Q[a][b] * vec[a] * vec[b]

        energies.append(e)

    return int(min(range(n), key=lambda i: energies[i]))


# ---------------------------------------------------
# QAOA Simulator
# ---------------------------------------------------
def qaoa_simulator(Q, p=2, n_samples=500, seed=None):

    if seed is not None:
        np.random.seed(seed)

    n = len(Q)
    dim = 1 << n

    Q_np = np.array(Q, dtype=float)

    # ---------------------------------------------------
    # Precompute energies
    # ---------------------------------------------------
    energies = np.zeros(dim)

    for bs in range(dim):
        x = ((bs >> np.arange(n)) & 1).astype(float)
        energies[bs] = float(x @ Q_np @ x)

    # ---------------------------------------------------
    # Feasible states (choose exactly one route)
    # ---------------------------------------------------
    feasible = [i for i in range(dim) if bin(i).count("1") == 1]

    if not feasible:
        feasible = list(range(dim))

    # ---------------------------------------------------
    # Initial state |+>^n
    # ---------------------------------------------------
    psi0 = np.ones(dim, dtype=complex) / np.sqrt(dim)

    # ---------------------------------------------------
    # Mixing operator
    # ---------------------------------------------------
    def apply_mixing(state, beta):

        rx = np.array(
            [
                [np.cos(beta), -1j * np.sin(beta)],
                [-1j * np.sin(beta), np.cos(beta)],
            ],
            dtype=complex,
        )

        s = state.reshape([2] * n)

        for q in range(n):
            s = np.tensordot(rx, s, axes=(1, q))
            s = np.moveaxis(s, 0, q)

        return s.reshape(dim)

    # ---------------------------------------------------
    # Cost phase
    # ---------------------------------------------------
    def apply_cost(state, gamma):
        return state * np.exp(-1j * gamma * energies)

    # ---------------------------------------------------
    # Evaluate circuit
    # ---------------------------------------------------
    def evaluate_circuit(gammas, betas):

        psi = psi0.copy()

        for layer in range(p):
            psi = apply_cost(psi, gammas[layer])
            psi = apply_mixing(psi, betas[layer])

        probs = np.abs(psi) ** 2

        feas_probs = [(i, probs[i]) for i in feasible]
        feas_probs.sort(key=lambda x: x[1], reverse=True)

        best_state = feas_probs[0][0]
        best_energy = energies[best_state]

        return best_state, best_energy

    best_candidate = None
    best_energy = float("inf")

    # initialize parameters to avoid undefined variables
    best_gammas = np.zeros(p)
    best_betas = np.zeros(p)

    # ---------------------------------------------------
    # Parameter search
    # ---------------------------------------------------
    n_explore = int(n_samples * 0.5)
    n_exploit = int(n_samples * 0.3)
    n_refine = n_samples - n_explore - n_exploit

    # Exploration
    for _ in range(n_explore):

        gammas = np.random.uniform(0, 2 * np.pi, size=p)
        betas = np.random.uniform(0, np.pi, size=p)

        candidate, energy = evaluate_circuit(gammas, betas)

        if energy < best_energy:
            best_energy = energy
            best_candidate = candidate
            best_gammas = gammas
            best_betas = betas

    # Exploitation
    for _ in range(n_exploit):

        gammas = best_gammas + np.random.normal(0, 0.4, size=p)
        betas = best_betas + np.random.normal(0, 0.3, size=p)

        gammas = np.mod(gammas, 2 * np.pi)
        betas = np.mod(betas, np.pi)

        candidate, energy = evaluate_circuit(gammas, betas)

        if energy < best_energy:
            best_energy = energy
            best_candidate = candidate
            best_gammas = gammas
            best_betas = betas

    # Refinement
    for _ in range(n_refine):

        gammas = best_gammas + np.random.normal(0, 0.15, size=p)
        betas = best_betas + np.random.normal(0, 0.1, size=p)

        gammas = np.mod(gammas, 2 * np.pi)
        betas = np.mod(betas, np.pi)

        candidate, energy = evaluate_circuit(gammas, betas)

        if energy < best_energy:
            best_energy = energy
            best_candidate = candidate
            best_gammas = gammas
            best_betas = betas

    # ---------------------------------------------------
    # Fallback
    # ---------------------------------------------------
    if best_candidate is None:

        best_idx = None
        best_e = float("inf")

        for i in range(n):

            vec = np.zeros(n)
            vec[i] = 1

            e = float(vec @ Q_np @ vec)

            if e < best_e:
                best_e = e
                best_idx = i

        return best_idx if best_idx is not None else 0

    # ---------------------------------------------------
    # Convert bitstring → route index
    # ---------------------------------------------------
    if best_candidate == 0:
        return 0

    pos = int(np.log2(best_candidate & -best_candidate))

    return pos