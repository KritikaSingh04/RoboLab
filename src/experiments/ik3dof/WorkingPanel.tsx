import Equation from '../../components/Equation';
import type { Branch, IKResult, PlanarLinks, PlanarPose } from '../../lib/math/planar';
import { rad2deg } from '../../lib/math/matrix';

const n = (v: number, d = 3) => (Number.isFinite(v) ? (Object.is(+v.toFixed(d), -0) ? '0.000' : v.toFixed(d)) : '—');
const deg = (v: number) => `${n(rad2deg(v), 2)}^{\\circ}`;

/** The IK derivation with the current numbers substituted, like a worked exam answer. */
export default function WorkingPanel({ links, pose, ik, branch }: { links: PlanarLinks; pose: PlanarPose; ik: IKResult; branch: Branch }) {
  const { l1, l2, l3 } = links;
  const w = ik.working;
  const sol = ik.solutions[branch];
  const sign = branch === 'up' ? '-' : '+';
  const phiDeg = rad2deg(pose.phi);

  const steps: { title: string; tex: string; note?: string }[] = [
    {
      title: '1. Wrist point (step back along link 3)',
      tex: String.raw`x_w = x - L_3\cos\varphi = ${n(pose.x)} - ${n(l3)}\cos(${n(phiDeg, 1)}^{\circ}) = \mathbf{${n(w.xw)}}`,
    },
    { title: '', tex: String.raw`y_w = y - L_3\sin\varphi = ${n(pose.y)} - ${n(l3)}\sin(${n(phiDeg, 1)}^{\circ}) = \mathbf{${n(w.yw)}}` },
    {
      title: '2. Cosine of the elbow angle (law of cosines)',
      tex: String.raw`c_2 = \frac{x_w^2 + y_w^2 - L_1^2 - L_2^2}{2L_1L_2} = \frac{${n(w.r2)} - ${n(l1 * l1)} - ${n(l2 * l2)}}{${n(2 * l1 * l2)}} = \mathbf{${n(w.c2)}}`,
      note: ik.reachable ? `|c₂| = ${n(Math.abs(w.c2))} ≤ 1, so the target is reachable.` : `|c₂| = ${n(Math.abs(w.c2))} > 1: no real solution, the target is outside the workspace.`,
    },
  ];

  if (ik.reachable && sol) {
    steps.push(
      {
        title: `3. Sine of the elbow angle (${branch === 'up' ? 'elbow-up takes the negative root' : 'elbow-down takes the positive root'})`,
        tex: String.raw`s_2 = ${sign}\sqrt{1 - c_2^2} = ${sign}\sqrt{1 - ${n(w.c2 * w.c2)}} = \mathbf{${n(w.s2[branch])}}`,
      },
      {
        title: '4. Elbow angle',
        tex: String.raw`\theta_2 = \operatorname{atan2}(s_2, c_2) = \operatorname{atan2}(${n(w.s2[branch])},\ ${n(w.c2)}) = \mathbf{${deg(sol.q[1])}}`,
      },
      {
        title: '5. Shoulder angle',
        tex: String.raw`\beta = \operatorname{atan2}(y_w, x_w) = \operatorname{atan2}(${n(w.yw)},\ ${n(w.xw)}) = ${deg(w.beta)}`,
      },
      {
        title: '',
        tex: String.raw`\gamma = \operatorname{atan2}(L_2 s_2,\ L_1 + L_2 c_2) = \operatorname{atan2}(${n(l2 * w.s2[branch])},\ ${n(l1 + l2 * w.c2)}) = ${deg(w.gamma[branch])}`,
      },
      { title: '', tex: String.raw`\theta_1 = \beta - \gamma = ${deg(w.beta)} - (${deg(w.gamma[branch])}) = \mathbf{${deg(sol.q[0])}}` },
      {
        title: '6. Wrist angle',
        tex: String.raw`\theta_3 = \varphi - \theta_1 - \theta_2 = ${deg(pose.phi)} - (${deg(sol.q[0])}) - (${deg(sol.q[1])}) = \mathbf{${deg(sol.q[2])}}`,
        note: 'Angles are wrapped to (−180°, 180°].',
      },
      {
        title: '7. Check by forward kinematics',
        tex: String.raw`x = L_1 c_1 + L_2 c_{12} + L_3 c_{123} = ${n(sol.fk.pose.x)},\quad y = L_1 s_1 + L_2 s_{12} + L_3 s_{123} = ${n(sol.fk.pose.y)}`,
        note: `Position error ${sol.posError.toExponential(2)} m, orientation error ${rad2deg(sol.phiError).toExponential(2)}°.`,
      },
    );
  }

  return (
    <ol className="space-y-3">
      {steps.map((s, i) => (
        <li key={i} className={s.title ? 'border-t border-slate-800 pt-3 first:border-0 first:pt-0' : ''}>
          {s.title && <div className="mb-1 text-sm font-semibold text-slate-200">{s.title}</div>}
          <Equation tex={s.tex} />
          {s.note && <div className={['text-sm', ik.reachable ? 'text-slate-400' : 'text-red-400'].join(' ')}>{s.note}</div>}
        </li>
      ))}
    </ol>
  );
}
