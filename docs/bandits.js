// bandits.js - three bandit algorithms + helpers.
// Ported from src/hw4_2026/bandit-tournament/backend/baselines.py with
// one change: UCB takes `c` as a parameter (the Python hardcoded sqrt(2)).

export function argmax(arr) {
  let bestIdx = 0;
  let bestVal = arr[0];
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] > bestVal) {
      bestVal = arr[i];
      bestIdx = i;
    }
  }
  return bestIdx;
}

export function sum(arr) {
  let s = 0;
  for (const x of arr) s += x;
  return s;
}

// mulberry32: tiny deterministic PRNG. Same seed => same sequence.
// Source: https://stackoverflow.com/a/47593316 (public domain).
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Gamma(k, 1) sample via Marsaglia & Tsang 2000 for k >= 1,
// plus the Gamma(k+1,1) * U^(1/k) boost for 0 < k < 1.
// Uses a user-supplied uniform rng() in [0,1).
function gammaSample(k, rng) {
  if (k < 1) {
    const u = rng();
    return gammaSample(k + 1, rng) * Math.pow(u, 1 / k);
  }
  const d = k - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  while (true) {
    let x, v;
    do {
      // Box-Muller normal from two uniforms
      const u1 = rng() || 1e-12;
      const u2 = rng();
      x = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = rng();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

// Beta(a,b) via ratio of two Gammas. Standard.
export function betaSample(a, b, rng) {
  const x = gammaSample(a, rng);
  const y = gammaSample(b, rng);
  return x / (x + y);
}

class BaseBandit {
  constructor(nArms) {
    this.nArms = nArms;
    this.counts = new Array(nArms).fill(0);
    this.values = new Array(nArms).fill(0);
  }
  update(arm, reward) {
    this.counts[arm] += 1;
    const n = this.counts[arm];
    this.values[arm] = ((n - 1) / n) * this.values[arm] + (1 / n) * reward;
  }
}

// Each selectArm() returns { arm, decision } where `decision` captures the
// internals of how the arm was picked (random draw, UCB scores, sampled
// thetas, etc). The trace replay uses that for the per-round narration.

export class EpsilonGreedy extends BaseBandit {
  constructor(nArms, epsilon, rng) {
    super(nArms);
    this.epsilon = epsilon;
    this.rng = rng;
    this.name = 'epsilon-greedy';
  }
  selectArm() {
    const n = sum(this.counts);
    if (n < this.nArms) {
      // Burn-in: try each arm once.
      return { arm: n, decision: { kind: 'burn-in' } };
    }
    const coin = this.rng();
    if (coin > this.epsilon) {
      return {
        arm: argmax(this.values),
        decision: { kind: 'greedy', coin, mu: this.values.slice() },
      };
    }
    const randArm = Math.floor(this.rng() * this.nArms);
    return {
      arm: randArm,
      decision: { kind: 'random', coin },
    };
  }
}

export class UCB extends BaseBandit {
  constructor(nArms, c, rng) {
    super(nArms);
    this.c = c;
    this.rng = rng; // not used for arm selection; kept for API symmetry
    this.name = 'UCB';
  }
  selectArm() {
    const n = sum(this.counts);
    if (n < this.nArms) {
      return { arm: n, decision: { kind: 'burn-in' } };
    }
    const boosts = this.counts.map(
      (c, i) => Math.sqrt((2 * Math.log(n)) / (c + 1e-9))
    );
    const scores = this.values.map((v, i) => v + this.c * boosts[i]);
    return {
      arm: argmax(scores),
      decision: {
        kind: 'ucb',
        mu: this.values.slice(),
        boost: boosts,
        scores,
      },
    };
  }
}

export class ThompsonSampling extends BaseBandit {
  constructor(nArms, rng, alpha0 = 1) {
    super(nArms);
    this.alpha0 = alpha0;
    this.alpha = new Array(nArms).fill(alpha0);
    this.beta = new Array(nArms).fill(alpha0);
    this.rng = rng;
    this.name = 'Thompson';
  }
  selectArm() {
    const samples = this.alpha.map((a, i) => betaSample(a, this.beta[i], this.rng));
    return {
      arm: argmax(samples),
      decision: {
        kind: 'thompson',
        thetas: samples,
        alpha: this.alpha.slice(),
        beta: this.beta.slice(),
      },
    };
  }
  update(arm, reward) {
    super.update(arm, reward);
    if (reward === 1) this.alpha[arm] += 1;
    else this.beta[arm] += 1;
  }
}
