# ======================================================================
#  Linear regression from scratch — running as real Python in your
#  browser (Pyodide + numpy).
#
#  Model:  y = m·x + c
#   1. closed-form solution with the normal equations
#   2. batch gradient descent (loss printed every PRINT_EVERY epochs)
#   3. MSE, RMSE, MAE and R² on the training and the test set
#
#  The page provides the data in DATA_JSON and reads the JSON string
#  produced by the LAST line of this program. Edit anything you like
#  and press Run.
# ======================================================================
import json
import numpy as np

data = json.loads(DATA_JSON)
x_train = np.array(data["x_train"], dtype=float)
y_train = np.array(data["y_train"], dtype=float)
x_test  = np.array(data["x_test"],  dtype=float)
y_test  = np.array(data["y_test"],  dtype=float)
EPOCHS      = int(data["epochs"])
LR          = float(data["lr"])
PRINT_EVERY = int(data["print_every"])

print(f"Dataset: {data['x_label']} -> {data['y_label']}")
print(f"{len(x_train)} training points, {len(x_test)} test points\n")

# ---------- 1. Normal equations ---------------------------------------
# Minimising  J(m, c) = 1/(2n) * sum((m*x_i + c - y_i)**2)  and setting
# dJ/dm = dJ/dc = 0 gives the closed-form least-squares solution:
n   = len(x_train)
x_m = x_train.mean()
y_m = y_train.mean()
m_ne = np.sum((x_train - x_m) * (y_train - y_m)) / np.sum((x_train - x_m) ** 2)
c_ne = y_m - m_ne * x_m

# The same solution in matrix form, theta = (XᵀX)⁻¹ Xᵀ y with X = [1, x]:
X = np.column_stack([np.ones(n), x_train])
theta = np.linalg.solve(X.T @ X, X.T @ y_train)   # solve() is more accurate than inv()
assert np.allclose(theta, [c_ne, m_ne]), "matrix and scalar forms disagree"

print("Normal equations:")
print(f"  m = {m_ne:.6f}")
print(f"  c = {c_ne:.6f}\n")

# ---------- 2. Gradient descent ---------------------------------------
# x and y are standardised (zero mean, unit variance) so that one
# learning rate works for every dataset. The parameters are converted
# back to the original units after every epoch.
x_mu, x_sd = x_train.mean(), x_train.std() or 1.0
y_mu, y_sd = y_train.mean(), y_train.std() or 1.0
xs = (x_train - x_mu) / x_sd
ys = (y_train - y_mu) / y_sd

def to_original(ms, cs):
    """Standardised parameters (ms, cs) -> (m, c) for y = m*x + c in real units."""
    m = ms * y_sd / x_sd
    c = y_sd * cs + y_mu - m * x_mu
    return m, c

def mse(x, y, m, c):
    return float(np.mean((m * x + c - y) ** 2))

ms, cs = 0.0, 0.0            # start from the flat line y = mean(y)
loss_history = []
snapshots = []               # (m, c) after every epoch, for the animation
print(f"Gradient descent (lr = {LR}, {EPOCHS} epochs):")
for epoch in range(1, EPOCHS + 1):
    err    = ms * xs + cs - ys          # prediction error for every point
    grad_m = np.mean(err * xs)          # dJ/dm
    grad_c = np.mean(err)               # dJ/dc
    ms -= LR * grad_m                   # update rule: theta <- theta - lr * grad
    cs -= LR * grad_c
    m, c = to_original(ms, cs)
    loss = mse(x_train, y_train, m, c)
    loss_history.append(loss)
    snapshots.append([m, c])
    if epoch % PRINT_EVERY == 0 or epoch == 1 or epoch == EPOCHS:
        print(f"  epoch {epoch:5d}   loss = {loss:.6f}   m = {m:.5f}   c = {c:.5f}")
m_gd, c_gd = to_original(ms, cs)
print()

# ---------- 3. Error metrics ------------------------------------------
def metrics(x, y, m, c):
    if len(x) == 0:
        return None
    res    = y - (m * x + c)
    mse_   = float(np.mean(res ** 2))
    ss_res = float(np.sum(res ** 2))
    ss_tot = float(np.sum((y - y.mean()) ** 2))
    return {
        "mse":  mse_,
        "rmse": float(np.sqrt(mse_)),
        "mae":  float(np.mean(np.abs(res))),
        "r2":   1.0 - ss_res / ss_tot if ss_tot > 0 else 1.0,
    }

results = {
    "normal": {"m": float(m_ne), "c": float(c_ne)},
    "gd": {
        "m": float(m_gd), "c": float(c_gd),
        "loss": loss_history,
        "snapshots": snapshots,
    },
    "metrics": {
        "normal": {"train": metrics(x_train, y_train, m_ne, c_ne), "test": metrics(x_test, y_test, m_ne, c_ne)},
        "gd":     {"train": metrics(x_train, y_train, m_gd, c_gd), "test": metrics(x_test, y_test, m_gd, c_gd)},
    },
}
for name in ("normal", "gd"):
    for split in ("train", "test"):
        mt = results["metrics"][name][split]
        if mt is None:
            continue
        label = "normal equations" if name == "normal" else "gradient descent"
        print(f"{label:17s} {split:5s}: MSE={mt['mse']:.4f}  RMSE={mt['rmse']:.4f}  MAE={mt['mae']:.4f}  R²={mt['r2']:.4f}")

# ---------- 4. Hand the results back to the page ----------------------
json.dumps(results)
