import { useState } from 'react';
import ExperimentPage from '../../components/ExperimentPage';
import Equation from '../../components/Equation';
import { findExperiment } from '../registry';
import ClassificationTab from './ClassificationTab';
import RegressionTab from './RegressionTab';
import LogicGatesTab from './LogicGatesTab';

const experiment = findExperiment('neural')!;
type Tab = 'classification' | 'regression' | 'gates';
const TABS: { id: Tab; label: string }[] = [
  { id: 'classification', label: 'A · Classification' },
  { id: 'regression', label: 'B · Regression' },
  { id: 'gates', label: 'C · ANN logic gates' },
];

export default function NeuralPage() {
  const [tab, setTab] = useState<Tab>('classification');
  return (
    <ExperimentPage
      experiment={experiment}
      aim={
        <p>
          To implement a multilayer perceptron with back-propagation from scratch and apply it to classification (2D datasets and the reachable
          workspace of a robot arm), regression (a noisy sine and the inverse kinematics of a 2-link arm) and the classic logic-gate problems that
          motivate hidden layers.
        </p>
      }
      theory={
        <div className="space-y-4">
          <div className="space-y-2">
            <h3 className="font-semibold text-ink">The perceptron</h3>
            <p>A single neuron computes a weighted sum and applies a step. The perceptron rule moves the weights toward misclassified samples:</p>
            <Equation tex={String.raw`\hat{y} = \mathrm{step}\!\left(\sum_i w_i x_i + b\right),\qquad w_i \leftarrow w_i + \eta\,(y - \hat{y})\,x_i,\quad b \leftarrow b + \eta\,(y - \hat{y})`} />
            <p>It converges only for linearly separable problems (AND, OR, NAND). XOR needs a hidden layer.</p>
          </div>
          <div className="space-y-2">
            <h3 className="font-semibold text-ink">Multilayer perceptron: forward pass</h3>
            <Equation tex={String.raw`z^{(l)} = W^{(l)} a^{(l-1)} + b^{(l)},\qquad a^{(l)} = f\!\left(z^{(l)}\right),\qquad a^{(0)} = x`} />
            <p>Activations: sigmoid 1/(1+e⁻ᶻ), tanh, ReLU max(0, z) or linear. For classification the output layer uses softmax, for regression it is linear.</p>
          </div>
          <div className="space-y-2">
            <h3 className="font-semibold text-ink">Loss functions</h3>
            <Equation tex={String.raw`J_{\text{MSE}} = \tfrac{1}{2}\sum_k (\hat{y}_k - y_k)^2,\qquad J_{\text{CE}} = -\sum_k y_k \log p_k,\quad p = \mathrm{softmax}(z^{(L)})`} />
          </div>
          <div className="space-y-2">
            <h3 className="font-semibold text-ink">Back-propagation</h3>
            <p>The error signal δ at the output is propagated backwards through the transposed weights, and every weight's gradient is the product of the error at its destination and the activation at its source:</p>
            <Equation tex={String.raw`\delta^{(L)} = (p - y)\ \text{(softmax+CE)}\quad\text{or}\quad(\hat{y} - y)\odot f'(z^{(L)})\ \text{(MSE)},\qquad \delta^{(l)} = \left(W^{(l+1)T}\delta^{(l+1)}\right)\odot f'(z^{(l)})`} />
            <Equation tex={String.raw`\frac{\partial J}{\partial W^{(l)}} = \delta^{(l)}\,a^{(l-1)T},\qquad \frac{\partial J}{\partial b^{(l)}} = \delta^{(l)}`} />
          </div>
          <div className="space-y-2">
            <h3 className="font-semibold text-ink">Mini-batch gradient descent with momentum</h3>
            <Equation tex={String.raw`v \leftarrow \beta v - \eta\,\frac{1}{|B|}\sum_{i \in B}\nabla J_i,\qquad \theta \leftarrow \theta + v`} />
            <p>
              Weights are initialised with Xavier (Var = 2/(n_in + n_out)) for sigmoid/tanh or He (Var = 2/n_in) for ReLU so signals neither vanish
              nor explode. The implementation is verified against a numerical gradient check in the unit tests.
            </p>
          </div>
        </div>
      }
      simulation={
        <div className="space-y-4">
          <div className="flex gap-1 rounded-lg bg-sidebar p-1">
            {TABS.map((t) => (
              <button key={t.id} type="button" onClick={() => setTab(t.id)} className={['flex-1 rounded-md px-3 py-2 text-sm font-medium transition', tab === t.id ? 'bg-cobalt text-white' : 'text-ink/80 hover:bg-line'].join(' ')}>
                {t.label}
              </button>
            ))}
          </div>
          {tab === 'classification' && <ClassificationTab />}
          {tab === 'regression' && <RegressionTab />}
          {tab === 'gates' && <LogicGatesTab />}
        </div>
      }
      results={
        <div className="space-y-2 text-ink/80">
          <p>Each tab shows its results live while training: the decision-boundary heat-map, loss and accuracy curves, confusion matrix and precision/recall/F1 (A); prediction versus truth and the arm driven by predicted angles with its tip error (B); the perceptron's weights, separating line and error count, and the XOR network's outputs (C).</p>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            <li>Training runs a few epochs per animation frame, so every plot updates while the network learns; the controls change the architecture, activation, learning rate, batch size and momentum on the fly (architecture changes rebuild the network).</li>
            <li>Watch the loss curve for a learning rate that is too large (oscillation or divergence) or too small (slow decrease), and compare train and test accuracy for overfitting.</li>
          </ul>
        </div>
      }
      conclusion={
        <div className="space-y-2">
          <p>
            A single perceptron can only draw one line, which suffices for AND, OR and NAND but not XOR; one hidden layer removes that limit, and
            with enough neurons the same network separates circles, moons and spirals and traces the annular workspace of a robot arm.
          </p>
          <p>
            Back-propagation delivers exact gradients (confirmed numerically), and mini-batch descent with momentum turns them into learning.
            The same machinery regresses a noisy sine and approximates inverse kinematics from examples alone; the remaining tip error shows that a
            learned model is an approximation of the analytic solution, improving with data, capacity and training time.
          </p>
        </div>
      }
    />
  );
}
