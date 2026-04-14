# bandits-interactive

A no-math, no-code interactive webapp for teaching multi-armed bandits.

Built for the Columbia course *Persuasion at Scale* (Prof Eunji Kim, Prof Chris Wiggins), but usable anywhere.

## What it is

A single page that tells the story of three bandit algorithms, round by round, on a 2-arm Bernoulli bandit (two political ads, maximizing clicks):

- **epsilon-greedy**: mostly pick the best so far, occasionally try the other
- **UCB**: pick the one whose best guess plus uncertainty bonus is highest
- **Thompson sampling**: roll the dice on your best current beliefs

Three views:

1. **Movie** — one algorithm at a time; scrub round-by-round; slider for epsilon (epsilon-greedy) or c (UCB exploration constant); plain-English narration of each round
2. **Race** — all three algorithms running on the same random seed; watch them diverge and re-converge; cumulative regret plotted
3. **Summary** — the punchline: all three algorithms converge, they just differ in *how fast they commit*

No Python, no math. Sliders and a "next round" button.

## Run it

**Live:** https://persuasion-at-scale.github.io/bandits-interactive/

**Local:** clone the repo, `cd docs && python3 -m http.server 8765`, then open http://localhost:8765 in a browser. No build step, no npm, nothing to install.

## Structure

```
bandits-interactive/
|-- README.md
|-- LICENSE
`-- docs/ # GitHub Pages source (branch=main, path=/docs)
    |-- index.html
    |-- style.css
    |-- app.js # UI wiring, Chart.js, state
    |-- bandits.js # EpsilonGreedy, UCB, ThompsonSampling classes
    `-- sim.js # Seeded RNG, 2-arm Bernoulli env, runFullTrace
```

The algorithm classes are a port of `baselines.py` from the Persuasion-at-Scale HW4 bandit-tournament code.

## License

MIT. See `LICENSE`.
