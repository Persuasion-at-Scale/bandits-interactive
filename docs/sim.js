// sim.js - 2-arm Bernoulli environment and frame-by-frame trace builder.
//
// The UI never re-runs simulations while you scrub. Instead, runFullTrace()
// computes the full T-round trajectory once into an array of frames, and
// the slider just indexes into it.

import { mulberry32, EpsilonGreedy, UCB, ThompsonSampling } from './bandits.js';

export const ARMS = [
  { label: 'Ad A', headline: 'Lower your gas prices', p: 0.12 },
  { label: 'Ad B', headline: 'Protect your family', p: 0.18 },
];

export const BEST_ARM = 1; // Ad B has the higher true rate
export const HORIZON = 500;

export class TwoArmBernoulli {
  constructor(probs, rng) {
    this.p = probs;
    this.rng = rng;
  }
  step(arm) {
    return this.rng() < this.p[arm] ? 1 : 0;
  }
}

function makeAlgo(name, params, rng) {
  const K = ARMS.length;
  if (name === 'epsilon-greedy') return new EpsilonGreedy(K, params.epsilon ?? 0.1, rng);
  if (name === 'UCB') return new UCB(K, params.c ?? Math.SQRT2, rng);
  if (name === 'Thompson') return new ThompsonSampling(K, rng, params.alpha0 ?? 1);
  throw new Error(`unknown algo: ${name}`);
}

function narrateDecision(decision, arm) {
  const A = ARMS[0].label;
  const B = ARMS[1].label;
  const picked = ARMS[arm].label;
  if (!decision) return '';
  if (decision.kind === 'burn-in') {
    return `Burn-in: every algorithm tries each ad once at the start, so it starts with one click or no-click per ad. This round picks ${picked}.`;
  }
  if (decision.kind === 'random') {
    return (
      `Biased coin flipped: ${decision.coin.toFixed(3)} < epsilon. ` +
      `Heads means explore: pick an ad uniformly at random. Picked ${picked}.`
    );
  }
  if (decision.kind === 'greedy') {
    const muA = decision.mu[0].toFixed(3);
    const muB = decision.mu[1].toFixed(3);
    return (
      `Biased coin flipped: ${decision.coin.toFixed(3)} > epsilon. ` +
      `Play greedy. ${A} mu=${muA} vs ${B} mu=${muB}. Picked ${picked}.`
    );
  }
  if (decision.kind === 'ucb') {
    const muA = decision.mu[0].toFixed(3);
    const muB = decision.mu[1].toFixed(3);
    const bA = decision.boost[0].toFixed(3);
    const bB = decision.boost[1].toFixed(3);
    const sA = decision.scores[0].toFixed(3);
    const sB = decision.scores[1].toFixed(3);
    return (
      `${A}: mu=${muA} + c*boost(${bA}) = ${sA}. ` +
      `${B}: mu=${muB} + c*boost(${bB}) = ${sB}. Picked ${picked}.`
    );
  }
  if (decision.kind === 'thompson') {
    const tA = decision.thetas[0].toFixed(3);
    const tB = decision.thetas[1].toFixed(3);
    const aA = decision.alpha[0];
    const bA = decision.beta[0];
    const aB = decision.alpha[1];
    const bB = decision.beta[1];
    return (
      `Sampled theta_${A} = ${tA} from Beta(${aA}, ${bA}). ` +
      `Sampled theta_${B} = ${tB} from Beta(${aB}, ${bB}). Picked ${picked}.`
    );
  }
  return '';
}

// Run one algorithm start-to-finish and return a frame-by-frame trace.
// Frame 0 is the pre-game state (no rounds played yet). Frame t (1..T) is
// the state AFTER round t. So frames.length === T + 1.
export function runFullTrace(algoName, params, T = HORIZON, seed = 42) {
  // One RNG stream for the environment, a separate one for the algorithm.
  // This makes algorithm comparisons on the "same random seed" meaningful:
  // both algos see the same Bernoulli coin flips for the arms they choose.
  const envRng = mulberry32(seed);
  const algoRng = mulberry32(seed ^ 0x9e3779b9);

  const env = new TwoArmBernoulli(ARMS.map((a) => a.p), envRng);
  const algo = makeAlgo(algoName, params, algoRng);

  const bestP = Math.max(...ARMS.map((a) => a.p));

  const frames = [
    {
      t: 0,
      arm: null,
      reward: null,
      counts: algo.counts.slice(),
      values: algo.values.slice(),
      alpha: algo.alpha ? algo.alpha.slice() : null,
      beta: algo.beta ? algo.beta.slice() : null,
      cumReward: 0,
      cumRegret: 0,
      decision: null,
      headline: 'Round 0: no data yet.',
      detail: 'Every ad looks equally promising. Press Next to run round 1.',
    },
  ];

  let cumReward = 0;
  let cumRegret = 0;

  for (let t = 1; t <= T; t++) {
    const { arm, decision } = algo.selectArm();
    const reward = env.step(arm);
    algo.update(arm, reward);

    cumReward += reward;
    cumRegret += bestP - ARMS[arm].p;

    const headline =
      `Round ${t}: ran ${ARMS[arm].label}. User ${reward === 1 ? 'CLICKED' : 'did not click'}.`;
    const detail = narrateDecision(decision, arm);

    frames.push({
      t,
      arm,
      reward,
      counts: algo.counts.slice(),
      values: algo.values.slice(),
      alpha: algo.alpha ? algo.alpha.slice() : null,
      beta: algo.beta ? algo.beta.slice() : null,
      cumReward,
      cumRegret,
      decision,
      headline,
      detail,
    });
  }

  return frames;
}

// Run all three algos and return {epsgreedy, ucb, thompson} of frames.
export function runRace(params, T = HORIZON, seed = 42) {
  return {
    epsgreedy: runFullTrace('epsilon-greedy', { epsilon: params.epsilon }, T, seed),
    ucb: runFullTrace('UCB', { c: params.c }, T, seed),
    thompson: runFullTrace('Thompson', { alpha0: params.alpha0 ?? 1 }, T, seed),
  };
}
