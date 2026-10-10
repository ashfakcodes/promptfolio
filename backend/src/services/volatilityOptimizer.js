/**
 * Pure Volatility Minimizer (Minimum Variance Portfolio Optimizer)
 * Solves the constrained quadratic optimization problem:
 *   minimize    (1/2) * w^T * Sigma * w
 *   subject to  sum(w_i) = 1.0
 *               lower_i <= w_i <= upper_i
 * 
 * Uses Projected Gradient Descent with exact Euclidean projection onto bounded simplex.
 */
export class VolatilityOptimizer {
  /**
   * Optimize portfolio weights to minimize total portfolio variance
   * 
   * @param {Array<string>} symbols - Array of asset symbols
   * @param {Array<Array<number>>} sigma - Covariance matrix (n x n)
   * @param {Object} explicitConstraints - Map of symbol => targetWeight (e.g. { 'bTBILL': 30 })
   * @param {number} minWeight - Minimum weight per asset (default 0.05 = 5%)
   * @param {number} maxWeight - Maximum weight per asset (default 0.45 = 45%)
   */
  optimize(symbols, sigma, explicitConstraints = {}, minWeight = 0.05, maxWeight = 0.45) {
    const n = symbols.length;
    if (n === 0) return [];
    if (n === 1) return [{ symbol: symbols[0], weight: 100.0 }];

    // Feasibility: ensure n * maxWeight >= 1.0 so bounds can mathematically sum to 100%
    const effectiveMaxWeight = Math.max(1.0 / n, Number(maxWeight) || 0.45);
    const effectiveMinWeight = Math.min(effectiveMaxWeight * 0.9, Math.max(0.01, Number(minWeight) || 0.05));

    // 1. Establish lower and upper bounds for each asset
    const lowerBounds = new Array(n).fill(effectiveMinWeight);
    const upperBounds = new Array(n).fill(effectiveMaxWeight);

    // Normalize explicit constraints if user-specified sum is >= 100%
    const cleanedExplicit = { ...explicitConstraints };
    const rawExplicitSum = Object.values(cleanedExplicit).reduce((a, b) => a + Number(b), 0);
    if (rawExplicitSum >= 100 && n > 1) {
      const maxAllocatable = 90.0; // leave 10% for diversification
      Object.keys(cleanedExplicit).forEach(k => {
        cleanedExplicit[k] = Number(((cleanedExplicit[k] / rawExplicitSum) * maxAllocatable).toFixed(1));
      });
    }

    // Apply explicit user constraints (e.g. user wanted 30% in bTBILL)
    Object.entries(cleanedExplicit).forEach(([sym, pct]) => {
      const idx = symbols.findIndex(s => s.toUpperCase() === sym.toUpperCase());
      if (idx !== -1) {
        const val = Math.max(0.01, Math.min(0.95, Number(pct) / 100));
        lowerBounds[idx] = val;
        upperBounds[idx] = val; // Fixed allocation
      }
    });

    // Verify bounds feasibility: sum(lower) <= 1 <= sum(upper)
    let sumLower = lowerBounds.reduce((a, b) => a + b, 0);
    let sumUpper = upperBounds.reduce((a, b) => a + b, 0);

    if (sumLower > 1.0) {
      // Relax unconstrained lower bounds proportionally
      const freeIndices = symbols.map((s, i) => !cleanedExplicit[s] ? i : -1).filter(i => i !== -1);
      const fixedSum = Object.values(cleanedExplicit).reduce((a, b) => a + Number(b) / 100, 0);
      const remaining = Math.max(0.02, 1.0 - fixedSum);
      const perAsset = remaining / (freeIndices.length || 1);
      if (freeIndices.length > 0) {
        freeIndices.forEach(idx => {
          lowerBounds[idx] = Math.max(0.01, perAsset * 0.5);
        });
      } else {
        for (let i = 0; i < n; i++) {
          lowerBounds[i] = lowerBounds[i] / sumLower;
        }
      }
    }

    if (sumUpper < 1.0) {
      // Relax upper bounds
      for (let i = 0; i < n; i++) upperBounds[i] = Math.max(upperBounds[i], 1.0);
    }

    // 2. Initial guess: projection of equal weights
    let w = new Array(n).fill(1 / n);
    w = this.projectToBoundsSimplex(w, lowerBounds, upperBounds);

    // 3. Projected Gradient Descent Optimization
    const maxIterations = 200;
    const tol = 1e-7;
    let stepSize = 0.2;

    for (let iter = 0; iter < maxIterations; iter++) {
      // Gradient: grad = Sigma * w
      const grad = new Array(n).fill(0);
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          grad[i] += sigma[i][j] * w[j];
        }
      }

      // Step: w_next = project(w - stepSize * grad)
      const wProposal = new Array(n);
      for (let i = 0; i < n; i++) {
        wProposal[i] = w[i] - stepSize * grad[i];
      }

      const wNext = this.projectToBoundsSimplex(wProposal, lowerBounds, upperBounds);

      // Check convergence: norm(wNext - w)
      let diffNorm = 0;
      for (let i = 0; i < n; i++) {
        diffNorm += Math.abs(wNext[i] - w[i]);
      }

      w = wNext;
      if (diffNorm < tol) break;
    }

    // 4. Calculate Risk Diagnostics
    const mvpVariance = this.calculateVariance(w, sigma);
    const mvpVolatility = Number((Math.sqrt(Math.max(0, mvpVariance)) * 100).toFixed(2));

    const equalW = new Array(n).fill(1 / n);
    const equalVariance = this.calculateVariance(equalW, sigma);
    const equalVolatility = Number((Math.sqrt(Math.max(0, equalVariance)) * 100).toFixed(2));

    const volatilityReductionPercent = equalVolatility > 0
      ? Number((((equalVolatility - mvpVolatility) / equalVolatility) * 100).toFixed(2))
      : 0.0;

    // 5. Final weight rounding to sum to exactly 100.0%
    const weightsPercent = w.map(v => Number((v * 100).toFixed(1)));
    let currentSum = weightsPercent.reduce((a, b) => a + b, 0);
    const diff = Number((100.0 - currentSum).toFixed(1));

    if (diff !== 0) {
      let applied = false;
      for (let i = 0; i < n; i++) {
        const potential = Number((weightsPercent[i] + diff).toFixed(1));
        if (potential <= (upperBounds[i] * 100) + 1e-4 && potential >= (lowerBounds[i] * 100) - 1e-4) {
          weightsPercent[i] = potential;
          applied = true;
          break;
        }
      }
      if (!applied) {
        // Find the index furthest from upper bound if diff > 0, or furthest from lower bound if diff < 0
        const bestIdx = diff > 0
          ? weightsPercent.reduce((minIdx, val, idx) => ((upperBounds[idx] * 100) - val > (upperBounds[minIdx] * 100) - weightsPercent[minIdx] ? idx : minIdx), 0)
          : weightsPercent.reduce((maxIdx, val, idx) => (val - (lowerBounds[idx] * 100) > weightsPercent[maxIdx] - (lowerBounds[maxIdx] * 100) ? idx : maxIdx), 0);
        weightsPercent[bestIdx] = Number((weightsPercent[bestIdx] + diff).toFixed(1));
      }
    }

    return {
      allocations: symbols.map((sym, i) => ({
        symbol: sym,
        weight: weightsPercent[i]
      })),
      diagnostics: {
        optimizationModel: 'Minimum Variance Portfolio (Pure Volatility Minimization)',
        portfolioVolatility30d: mvpVolatility,
        benchmarkEqualWeightVolatility30d: equalVolatility,
        volatilityReductionPercent,
        portfolioVariance: Number(mvpVariance.toFixed(6))
      }
    };
  }

  /**
   * Euclidean projection of vector v onto simplex with bounds:
   *   minimize ||w - v||^2  s.t. sum(w_i) = 1,  lower_i <= w_i <= upper_i
   * 
   * Solved via bisection on the dual variable (Lagrange multiplier lambda).
   */
  projectToBoundsSimplex(v, lower, upper) {
    const n = v.length;
    let low = Math.min(...v) - 2;
    let high = Math.max(...v) + 2;

    for (let iter = 0; iter < 40; iter++) {
      const mid = (low + high) / 2;
      let sum = 0;
      for (let i = 0; i < n; i++) {
        const clipped = Math.min(upper[i], Math.max(lower[i], v[i] - mid));
        sum += clipped;
      }

      if (Math.abs(sum - 1.0) < 1e-9) {
        low = mid;
        high = mid;
        break;
      }
      if (sum > 1.0) {
        low = mid;
      } else {
        high = mid;
      }
    }

    const optimalLambda = (low + high) / 2;
    const result = new Array(n);
    for (let i = 0; i < n; i++) {
      result[i] = Math.min(upper[i], Math.max(lower[i], v[i] - optimalLambda));
    }
    return result;
  }

  /**
   * Compute quadratic form: w^T * Sigma * w
   */
  calculateVariance(w, sigma) {
    let variance = 0;
    const n = w.length;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        variance += w[i] * sigma[i][j] * w[j];
      }
    }
    return variance;
  }
}

export const volatilityOptimizer = new VolatilityOptimizer();
