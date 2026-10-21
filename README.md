# RoboLab — Virtual Robotics & AI Lab

Interactive, in-browser implementations of the experiments of the *Robotics & AI* laboratory course.
Every experiment is a page with the lab write-up structure — **Aim · Theory · Simulation · Results · Conclusion** —
all mathematics is written from scratch in pure, unit-tested TypeScript (no ML libraries), and nothing runs outside
the browser. The only network access is the optional download of the Pyodide runtime for the Python experiment.

> **Live site:** `https://<your-user>.github.io/<repo>/` (published automatically by the GitHub Actions workflow).

![Home page](docs/screenshots/home.png)

## Experiments

| # | Route | Experiment | Features |
|---|---|---|---|
| 2 | `/screw` | Screw Transformation | Fundamental screws about x/y/z and a general screw about any axis (Rodrigues); animated helical motion in 3D; live 4×4 matrix with rotation/translation parts; point transformation; composite panel showing non-commutativity. |
| 3 | `/scara` | Direct Kinematics of SCARA | Editable D-H table; 3D SCARA with a frame at every joint; T₀₄ vs closed-form equations; reachable-workspace sampling; end-effector trace. |
| 4 | `/ik3dof` | Inverse Kinematics of 3-DOF Planar Robot | Draggable target pose; both elbow solutions; reachable annulus; worked step-by-step solution with numbers; draw-a-path mode with joint-angle plots. |
| 5 | `/trajectory` | Trajectory Planning | Cubic, quintic and LSPB profiles; joint-space vs Cartesian straight-line motion side by side; position/velocity/acceleration plots with a moving cursor; coefficient and method-comparison tables. |
| 6 | `/dynamics` | Dynamic Analysis of Single-Arm Robot | Euler–Lagrange model with payload and friction; inverse dynamics with a stacked torque plot; forward dynamics with RK4 and an energy check; two-link chaotic double pendulum; ADAMS CSV validation with RMS error (sample file included). |
| 7 | `/fuzzy` | Fuzzy Logic System | Generic Mamdani engine (tri/trap/Gaussian MFs, AND/OR, min implication, max aggregation, centroid/bisector/MOM); robot obstacle-avoidance rule base and a fan controller; rule table with firing strengths; MF editor; 3D control surface / heat-map. |
| 8 | `/neural` | Neural Network Regression & Classification | From-scratch MLP (sigmoid/tanh/ReLU/linear, MSE and softmax-CE, momentum, Xavier/He); live decision-boundary heat-map, loss/accuracy curves, confusion matrix, precision/recall/F1; sine regression and learned 2-link IK; perceptron logic gates and the 2-2-1 XOR network; network diagram. |
| 9 | `/linreg` | Linear Regression in Python | Real Python via Pyodide + numpy in an editable CodeMirror program (normal equations, gradient descent, MSE/RMSE/MAE/R²); sensor/actuator calibration datasets, editable table and CSV upload; train/test split; fit, residual and loss plots with a converging-line animation; offline TypeScript fallback. |
| 10 | `/kmeans` | K-Means Clustering | Random and k-means++ initialisation; Euclidean/Manhattan/Chebyshev; step-by-step assign/update; Voronoi shading; blobs, moons, uniform and a LiDAR-scan robotics dataset; WCSS and elbow plots; silhouette score; fuzzy c-means bonus. |
| 11 | `/obstacle` | Obstacle Avoidance Robot | Differential-drive robot with five ultrasonic sensors (ray casting, noise); editable arena with preset maps; reactive, fuzzy and potential-field controllers; potential-field arrows; sensor and wheel-speed plots; compare-all table with overlaid paths; U-trap local-minimum demo. |
| 12 | `/linefollower` | Line Follower Robot | Preset and hand-drawn tracks; 3- or 5-sensor IR array (digital or analog); bang-bang and PID control with live P/I/D terms; error plot, lap times, off-track count; P vs PD vs PID tuning comparison. |
| 13 | `/pipeline` | Pick-and-Place Pipeline | Integration of experiments 10, 4 and 5: k-means finds objects on a table, IK computes joint angles, quintic trajectories pick and place each object; step indicator and event log. |

An **About** page lists the syllabus mapping (experiment → module → course outcome), the technology stack and the team.

### Screenshots

| | |
|---|---|
| ![Screw transformation](docs/screenshots/screw.png) | ![SCARA](docs/screenshots/scara.png) |
| ![Inverse kinematics](docs/screenshots/ik3dof.png) | ![Trajectory planning](docs/screenshots/trajectory.png) |
| ![Dynamics](docs/screenshots/dynamics.png) | ![Fuzzy logic](docs/screenshots/fuzzy.png) |
| ![Neural network](docs/screenshots/neural.png) | ![Linear regression](docs/screenshots/linreg.png) |
| ![K-means](docs/screenshots/kmeans.png) | ![Obstacle avoidance](docs/screenshots/obstacle.png) |
| ![Line follower](docs/screenshots/linefollower.png) | ![Pipeline](docs/screenshots/pipeline.png) |

*Place PNG screenshots with these names in `docs/screenshots/` (1366 × 768 recommended).*

## Running locally

Requires Node.js 20 or newer.

```bash
npm install
npm run dev        # development server with hot reload (http://localhost:5173)
npm test           # unit tests (vitest) for every math / simulation module
npm run build      # production build → dist/
npm run preview    # serve the production build locally (http://localhost:4173)
```

The production build is fully static. `dist/` can be copied to any web server or opened from a folder; it needs
no backend, no API keys and no internet connection — except experiment 9, which lazily downloads the Pyodide
runtime (~10 MB) from `cdn.jsdelivr.net` the first time it is used and otherwise falls back to an equivalent
TypeScript implementation (a banner says so).

## Deployment to GitHub Pages

1. Push the repository to GitHub and open **Settings → Pages**; set **Source** to **GitHub Actions**.
2. Every push to `main` runs [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml): install, test, build, deploy.
3. The site appears at `https://<your-user>.github.io/<repo>/`.

No base-path configuration is needed: `vite.config.ts` uses a relative base (`./`) and the app uses a hash router,
so the same build works for project sites, user sites, custom domains and `file://`. Set `VITE_BASE=/prefix/` at
build time only if an absolute base is required.

## Tech stack

Vite · React 18 · TypeScript (strict) · Tailwind CSS · react-router-dom (HashRouter) · HTML5 Canvas 2D ·
three + @react-three/fiber + drei (3D views only) · recharts · KaTeX · Pyodide (CDN) · CodeMirror · vitest.

See [`CLAUDE.md`](CLAUDE.md) for the project brief and coding rules.

## Project layout

```
src/
  components/   shared UI (ExperimentPage template, Canvas2D, plots, inputs, playback loop)
  lib/math/     matrices, D-H, kinematics, planar IK, trajectories, dynamics, ODE, screws
  lib/ai/       fuzzy engine, MLP, k-means, regression, datasets
  lib/sim/      geometry, differential drive, sensors, controllers, maps, tracks, line follower
  lib/py/       Pyodide loader
  experiments/  one folder per experiment + registry.ts
  pages/        Home, About
public/         favicon, sample ADAMS CSV, .nojekyll
```
