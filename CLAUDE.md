# RoboLab — Interactive Robotics & AI/ML Virtual Lab

## What this project is
A single website that implements the experiments of our "Robotics & AI" lab course as
interactive, in-browser simulations. Each experiment is its own page. It is a university
lab project, so **correctness of the math and clarity of the explanation matter more than
fancy visuals**. The examiner will move sliders, change inputs and check the numbers.

No MATLAB, no backend server. Everything runs in the browser (Python runs via Pyodide).

## Tech stack (do not change without asking)
- Vite + React 18 + TypeScript (strict)
- Tailwind CSS for styling
- react-router-dom for pages (use HashRouter so it works on GitHub Pages / file hosting)
- three + @react-three/fiber + @react-three/drei — ONLY for 3D views (screw transform, SCARA)
- HTML5 Canvas 2D for all 2D simulations (planar arms, mobile robots, k-means)
- recharts for plots / graphs
- katex for equations (small `<Equation tex="..." />` wrapper component)
- Pyodide (loaded lazily from CDN) for the Python linear-regression experiment
- vitest for unit tests of the math
- **No ML libraries** (no TensorFlow.js, no ml.js, no fuzzy libraries). Fuzzy logic, the
  neural network, k-means and regression are implemented from scratch — that IS the
  assignment.

## Folder structure
```
src/
  main.tsx, App.tsx            # router + layout
  components/                  # shared UI
    Layout.tsx, Sidebar.tsx
    ExperimentPage.tsx         # standard page template (see below)
    Slider.tsx, NumberInput.tsx, Toggle.tsx
    MatrixView.tsx             # pretty 4x4 / nxm matrix display
    Equation.tsx               # KaTeX wrapper
    Plot.tsx                   # recharts line-plot wrapper
    Canvas2D.tsx               # canvas with world<->pixel transform, grid, axes, pan/zoom
  lib/
    math/   matrix.ts, transforms.ts, dh.ts, kinematics.ts, trajectory.ts, dynamics.ts, ode.ts
    ai/     fuzzy.ts, mlp.ts, kmeans.ts, regression.ts, datasets.ts
    sim/    geometry.ts, diffDrive.ts, sensors.ts, controllers.ts, tracks.ts
  experiments/
    registry.ts                # metadata for every experiment (id, title, module, CO, route)
    screw/ scara/ ik3dof/ trajectory/ dynamics/ fuzzy/ neural/ linreg/ kmeans/ obstacle/ linefollower/
  pages/Home.tsx
```

## Rules for all code
1. **All math lives in `src/lib/` as pure functions with no React imports**, so it can be
   unit-tested. Components only call these functions and draw the results.
2. Units: SI internally (m, kg, s, rad). The UI shows angles in **degrees** and lengths in
   the unit stated on the page. Convert at the UI boundary only.
3. Every math module gets a vitest test file. Examples: FK→IK round trip returns the same
   pose; cubic trajectory satisfies its boundary conditions; rotation matrices are
   orthonormal with det = 1; k-means WCSS never increases between iterations.
4. Animations use `requestAnimationFrame` with a **fixed physics timestep** (e.g. dt = 1/120 s)
   decoupled from rendering. Always provide Play / Pause / Reset / Step buttons.
5. Show numbers, not just pictures: live matrices, joint values, end-effector position,
   errors, metrics. Round to 3 decimals for display.
6. Must look good on a 1366×768 projector and a laptop. Dark theme, high contrast, large
   readable fonts (min 14px), consistent colours: link 1 = blue, link 2 = orange,
   link 3 = green, end-effector = red, target = yellow.
7. No backend, no API keys, no external calls except the Pyodide CDN.
8. Keep each experiment self-contained in its folder so one broken page never breaks others.
9. After finishing a task: run `npm run build` and `npx vitest run`, fix all errors, then
   summarize what changed.

## Standard experiment page template (`ExperimentPage`)
Every experiment page uses the same layout, mirroring a lab write-up:
- Header: experiment number, title, syllabus module + CO tag (e.g. "Module 2 · CO2")
- **Aim** — one or two lines
- **Theory** — short explanation + key equations in KaTeX
- **Simulation** — the interactive part: controls panel on the left, visual on the right
- **Results** — live numeric outputs, tables and plots
- **Conclusion** — 2–3 lines of what the experiment shows
Sections are tabs or a scrollable page with a sticky section nav.

## Home page
Title "RoboLab — Virtual Robotics & AI Lab", a short intro, then a grid of experiment cards
grouped by syllabus module (Kinematics & Dynamics · AI · Machine Learning · Mobile Robotics).
Each card: number, title, one-line description, module/CO tag, small icon.

## Experiment list (routes)
| # | Route | Title | Syllabus |
|---|---|---|---|
| 2 | /screw | Screw Transformation | 2.2 · CO2 |
| 3 | /scara | Direct Kinematics of SCARA | 2.3, 2.4 · CO2 |
| 4 | /ik3dof | Inverse Kinematics of 3-DOF Planar Robot | 2.5 · CO2 |
| 5 | /trajectory | Trajectory Planning | 2.6 · CO2 |
| 6 | /dynamics | Dynamic Analysis of Single-Arm Robot | 2.7 · CO2 |
| 7 | /fuzzy | Fuzzy Logic System | 3.2 · CO3 |
| 8 | /neural | Neural Network Regression & Classification | 3.3, 4.1 · CO3, CO4 |
| 9 | /linreg | Linear Regression in Python | 4.2 · CO4 |
| 10 | /kmeans | K-Means Clustering | 4.3 · CO4 |
| 11 | /obstacle | Obstacle Avoidance Robot | 5.2, 5.3 · CO5 |
| 12 | /linefollower | Line Follower Robot | 5.1, 5.2 · CO5 |
