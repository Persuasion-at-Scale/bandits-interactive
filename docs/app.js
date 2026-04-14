// app.js - UI wiring for the bandit movie.

import { ARMS, HORIZON, runFullTrace, runRace } from './sim.js';

const $ = (id) => document.getElementById(id);

// --------- Tab switching ---------
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    document.querySelectorAll('.tab-btn').forEach((b) => {
      b.classList.remove('border-indigo-600', 'text-indigo-700');
      b.classList.add('border-transparent', 'text-slate-500');
    });
    btn.classList.remove('border-transparent', 'text-slate-500');
    btn.classList.add('border-indigo-600', 'text-indigo-700');

    document.querySelectorAll('.tab-panel').forEach((p) => (p.style.display = 'none'));
    $(`tab-${tab}`).style.display = 'block';

    if (tab === 'race') ensureRace();
    if (tab === 'summary') ensureSummary();
  });
});

// ---------- Chart.js config ----------
Chart.defaults.animation = false;
Chart.defaults.font.family =
  "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";

const AD_LABELS = ARMS.map((a) => `${a.label}: ${a.headline}`);
const AD_COLORS = ['#6366f1', '#f59e0b']; // indigo, amber

// ============== MOVIE TAB ==============

let movieFrames = [];
let movieState = {
  algo: 'epsilon-greedy',
  epsilon: 0.1,
  c: Math.SQRT2,
  alpha0: 1,
  t: 0,
};
let playTimer = null;

// Per-arm icon glyph + background color for the narration panel.
const AD_GLYPHS = ['$', '\u2665']; // dollar, black heart
const AD_BG = ['bg-indigo-600', 'bg-amber-500'];

// Charts
const barsValues = new Chart($('bars-values').getContext('2d'), {
  type: 'bar',
  data: {
    labels: AD_LABELS,
    datasets: [
      {
        label: 'Estimated click rate',
        data: [0, 0],
        backgroundColor: AD_COLORS,
      },
    ],
  },
  options: {
    indexAxis: 'y',
    plugins: { legend: { display: false } },
    scales: { x: { min: 0, max: 0.3 } },
  },
});

const barsCounts = new Chart($('bars-counts').getContext('2d'), {
  type: 'bar',
  data: {
    labels: AD_LABELS,
    datasets: [
      {
        label: 'Times shown',
        data: [0, 0],
        backgroundColor: AD_COLORS,
      },
    ],
  },
  options: {
    indexAxis: 'y',
    plugins: { legend: { display: false } },
    scales: { x: { min: 0 } },
  },
});

const lineValues = new Chart($('line-values').getContext('2d'), {
  type: 'line',
  data: {
    labels: [],
    datasets: [
      {
        label: 'Ad A estimate',
        data: [],
        borderColor: AD_COLORS[0],
        backgroundColor: AD_COLORS[0],
        pointRadius: 0,
      },
      {
        label: 'Ad B estimate',
        data: [],
        borderColor: AD_COLORS[1],
        backgroundColor: AD_COLORS[1],
        pointRadius: 0,
      },
      {
        label: 'Ad A true rate',
        data: [],
        borderColor: AD_COLORS[0],
        borderDash: [4, 4],
        pointRadius: 0,
      },
      {
        label: 'Ad B true rate',
        data: [],
        borderColor: AD_COLORS[1],
        borderDash: [4, 4],
        pointRadius: 0,
      },
    ],
  },
  options: {
    plugins: { legend: { position: 'bottom' } },
    scales: { y: { min: 0, max: 0.35 }, x: { title: { display: true, text: 'round' } } },
  },
});

function recomputeMovie() {
  const params =
    movieState.algo === 'epsilon-greedy'
      ? { epsilon: movieState.epsilon }
      : movieState.algo === 'UCB'
        ? { c: movieState.c }
        : { alpha0: movieState.alpha0 };
  movieFrames = runFullTrace(movieState.algo, params, HORIZON, 42);
  renderMovie();
}

function setNarrationIcon(arm) {
  const el = $('narration-icon');
  el.classList.remove('bg-slate-200', 'bg-indigo-600', 'bg-amber-500');
  if (arm == null) {
    el.classList.add('bg-slate-200');
    $('narration-icon-glyph').textContent = '?';
    return;
  }
  el.classList.add(AD_BG[arm]);
  $('narration-icon-glyph').textContent = AD_GLYPHS[arm];
}

function setNarrationOutcome(reward) {
  const el = $('narration-outcome');
  const glyph = $('narration-outcome-glyph');
  el.classList.remove(
    'bg-slate-100',
    'bg-emerald-500',
    'bg-red-500',
    'text-slate-300',
    'text-white'
  );
  if (reward == null) {
    el.classList.add('bg-slate-100', 'text-slate-300');
    glyph.innerHTML = '&nbsp;';
    return;
  }
  if (reward === 1) {
    el.classList.add('bg-emerald-500', 'text-white');
    glyph.textContent = '\u2713'; // check mark
  } else {
    el.classList.add('bg-red-500', 'text-white');
    glyph.textContent = '\u2717'; // ballot x
  }
}

function renderMovie() {
  const t = Math.min(movieState.t, movieFrames.length - 1);
  const f = movieFrames[t];

  $('t-val').textContent = t;
  $('t-slider').value = t;
  $('narration-headline').textContent = f.headline;
  $('narration-detail').textContent = f.detail;
  setNarrationIcon(f.arm);
  setNarrationOutcome(f.reward);
  $('cum-clicks').textContent = f.cumReward;
  $('cum-regret').textContent = f.cumRegret.toFixed(2);

  barsValues.data.datasets[0].data = f.values.map((v) => +v.toFixed(4));
  barsValues.update();

  barsCounts.data.datasets[0].data = f.counts.slice();
  barsCounts.options.scales.x.max = Math.max(10, t);
  barsCounts.update();

  // Running-estimate line chart: show data up to round t.
  const labels = [];
  const a = [];
  const b = [];
  const aTrue = [];
  const bTrue = [];
  const STEP = Math.max(1, Math.floor(HORIZON / 100)); // at most ~100 points
  for (let i = 0; i <= t; i += STEP) {
    labels.push(i);
    a.push(+movieFrames[i].values[0].toFixed(4));
    b.push(+movieFrames[i].values[1].toFixed(4));
    aTrue.push(ARMS[0].p);
    bTrue.push(ARMS[1].p);
  }
  lineValues.data.labels = labels;
  lineValues.data.datasets[0].data = a;
  lineValues.data.datasets[1].data = b;
  lineValues.data.datasets[2].data = aTrue;
  lineValues.data.datasets[3].data = bTrue;
  lineValues.update();
}

$('algo-select').addEventListener('change', (e) => {
  movieState.algo = e.target.value;
  $('epsilon-wrap').style.display = movieState.algo === 'epsilon-greedy' ? 'block' : 'none';
  $('c-wrap').style.display = movieState.algo === 'UCB' ? 'block' : 'none';
  $('alpha0-wrap').style.display = movieState.algo === 'Thompson' ? 'block' : 'none';
  recomputeMovie();
});
$('epsilon-slider').addEventListener('input', (e) => {
  movieState.epsilon = parseFloat(e.target.value);
  $('epsilon-val').textContent = movieState.epsilon.toFixed(2);
  recomputeMovie();
});
$('c-slider').addEventListener('input', (e) => {
  movieState.c = parseFloat(e.target.value);
  $('c-val').textContent = movieState.c.toFixed(2);
  recomputeMovie();
});
$('alpha0-slider').addEventListener('input', (e) => {
  movieState.alpha0 = parseInt(e.target.value, 10);
  $('alpha0-val').textContent = movieState.alpha0;
  recomputeMovie();
});
$('t-slider').addEventListener('input', (e) => {
  movieState.t = parseInt(e.target.value, 10);
  renderMovie();
});
$('prev-btn').addEventListener('click', () => {
  movieState.t = Math.max(0, movieState.t - 1);
  renderMovie();
});
$('next-btn').addEventListener('click', () => {
  movieState.t = Math.min(HORIZON, movieState.t + 1);
  renderMovie();
});
$('play-btn').addEventListener('click', () => {
  if (playTimer) {
    clearInterval(playTimer);
    playTimer = null;
    $('play-btn').textContent = 'Play';
    return;
  }
  $('play-btn').textContent = 'Pause';
  playTimer = setInterval(() => {
    if (movieState.t >= HORIZON) {
      clearInterval(playTimer);
      playTimer = null;
      $('play-btn').textContent = 'Play';
      return;
    }
    movieState.t += 1;
    renderMovie();
  }, 40);
});

// ============== RACE TAB ==============

let raceFrames = null;
let raceState = { t: 0 };
let raceTimer = null;

const raceRegret = new Chart($('race-regret').getContext('2d'), {
  type: 'line',
  data: {
    labels: [],
    datasets: [
      { label: 'epsilon-greedy', data: [], borderColor: '#6366f1', pointRadius: 0 },
      { label: 'UCB', data: [], borderColor: '#10b981', pointRadius: 0 },
      { label: 'Thompson', data: [], borderColor: '#f59e0b', pointRadius: 0 },
    ],
  },
  options: {
    plugins: { legend: { position: 'bottom' } },
    scales: { y: { min: 0 }, x: { title: { display: true, text: 'round' } } },
  },
});

const raceClicks = new Chart($('race-clicks').getContext('2d'), {
  type: 'line',
  data: {
    labels: [],
    datasets: [
      { label: 'epsilon-greedy', data: [], borderColor: '#6366f1', pointRadius: 0 },
      { label: 'UCB', data: [], borderColor: '#10b981', pointRadius: 0 },
      { label: 'Thompson', data: [], borderColor: '#f59e0b', pointRadius: 0 },
    ],
  },
  options: {
    plugins: { legend: { position: 'bottom' } },
    scales: { y: { min: 0 }, x: { title: { display: true, text: 'round' } } },
  },
});

function ensureRace() {
  // Always re-run so slider changes on the Movie tab propagate.
  raceFrames = runRace(
    { epsilon: movieState.epsilon, c: movieState.c, alpha0: movieState.alpha0 },
    HORIZON,
    42
  );
  renderRace();
}

function renderRace() {
  const t = Math.min(raceState.t, HORIZON);
  $('race-t-val').textContent = t;
  $('race-t-slider').value = t;

  const STEP = Math.max(1, Math.floor(HORIZON / 100));
  const labels = [];
  const epsR = [];
  const ucbR = [];
  const thompR = [];
  const epsC = [];
  const ucbC = [];
  const thompC = [];
  for (let i = 0; i <= t; i += STEP) {
    labels.push(i);
    epsR.push(+raceFrames.epsgreedy[i].cumRegret.toFixed(3));
    ucbR.push(+raceFrames.ucb[i].cumRegret.toFixed(3));
    thompR.push(+raceFrames.thompson[i].cumRegret.toFixed(3));
    epsC.push(raceFrames.epsgreedy[i].cumReward);
    ucbC.push(raceFrames.ucb[i].cumReward);
    thompC.push(raceFrames.thompson[i].cumReward);
  }
  raceRegret.data.labels = labels;
  raceRegret.data.datasets[0].data = epsR;
  raceRegret.data.datasets[1].data = ucbR;
  raceRegret.data.datasets[2].data = thompR;
  raceRegret.update();

  raceClicks.data.labels = labels;
  raceClicks.data.datasets[0].data = epsC;
  raceClicks.data.datasets[1].data = ucbC;
  raceClicks.data.datasets[2].data = thompC;
  raceClicks.update();

  const eps = raceFrames.epsgreedy[t];
  const ucb = raceFrames.ucb[t];
  const thomp = raceFrames.thompson[t];
  $('race-eps-status').textContent =
    `${eps.cumReward} clicks, regret ${eps.cumRegret.toFixed(2)}. Ad A: ${eps.counts[0]} shown, Ad B: ${eps.counts[1]} shown.`;
  $('race-ucb-status').textContent =
    `${ucb.cumReward} clicks, regret ${ucb.cumRegret.toFixed(2)}. Ad A: ${ucb.counts[0]} shown, Ad B: ${ucb.counts[1]} shown.`;
  $('race-thompson-status').textContent =
    `${thomp.cumReward} clicks, regret ${thomp.cumRegret.toFixed(2)}. Ad A: ${thomp.counts[0]} shown, Ad B: ${thomp.counts[1]} shown.`;
}

$('race-t-slider').addEventListener('input', (e) => {
  raceState.t = parseInt(e.target.value, 10);
  renderRace();
});
$('race-prev-btn').addEventListener('click', () => {
  raceState.t = Math.max(0, raceState.t - 1);
  renderRace();
});
$('race-next-btn').addEventListener('click', () => {
  raceState.t = Math.min(HORIZON, raceState.t + 1);
  renderRace();
});
$('race-play-btn').addEventListener('click', () => {
  if (raceTimer) {
    clearInterval(raceTimer);
    raceTimer = null;
    $('race-play-btn').textContent = 'Play';
    return;
  }
  $('race-play-btn').textContent = 'Pause';
  raceTimer = setInterval(() => {
    if (raceState.t >= HORIZON) {
      clearInterval(raceTimer);
      raceTimer = null;
      $('race-play-btn').textContent = 'Play';
      return;
    }
    raceState.t += 1;
    renderRace();
  }, 40);
});

// ============== SUMMARY TAB ==============

const summaryChart = new Chart($('summary-clicks').getContext('2d'), {
  type: 'bar',
  data: {
    labels: ['epsilon-greedy', 'UCB', 'Thompson'],
    datasets: [
      {
        label: 'Total clicks',
        data: [0, 0, 0],
        backgroundColor: ['#6366f1', '#10b981', '#f59e0b'],
      },
    ],
  },
  options: { plugins: { legend: { display: false } } },
});

function ensureSummary() {
  if (!raceFrames) ensureRace();
  const last = HORIZON;
  const eps = raceFrames.epsgreedy[last];
  const ucb = raceFrames.ucb[last];
  const thomp = raceFrames.thompson[last];

  const paragraphs = [
    {
      title: 'epsilon-greedy',
      text: `After 500 rounds, it won ${eps.cumReward} clicks. Most of the time it played whatever looked best so far; about ${Math.round(movieState.epsilon * 100)}% of the time it picked randomly, which means it kept showing Ad A some of the time even though Ad B was winning. It got there, but it wasted clicks on exploration forever.`,
    },
    {
      title: 'UCB',
      text: `After 500 rounds, it won ${ucb.cumReward} clicks. It explored more aggressively at the start (any ad that hadn't been tried much got an uncertainty bonus) and then committed. The c slider controls how big that bonus is: smaller c, more greedy; larger c, more exploration.`,
    },
    {
      title: 'Thompson sampling',
      text: `After 500 rounds, it won ${thomp.cumReward} clicks. Every round, it "rolled the dice" on what each ad's true click rate might be (sampling from its Bayesian beliefs) and showed whichever ad won the roll. As beliefs sharpened, the rolls concentrated on Ad B.`,
    },
  ];

  $('summary-paragraphs').innerHTML = paragraphs
    .map(
      (p) =>
        `<div><h3 class="font-semibold text-slate-800">${p.title}</h3><p class="mt-1">${p.text}</p></div>`
    )
    .join('');

  summaryChart.data.datasets[0].data = [eps.cumReward, ucb.cumReward, thomp.cumReward];
  summaryChart.update();
}

// ============== BOOT ==============
recomputeMovie();
