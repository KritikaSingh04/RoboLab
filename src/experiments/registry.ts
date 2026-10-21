/**
 * Metadata for every experiment. Pages, the sidebar and the Home grid are all
 * generated from this list, so adding an experiment means adding one entry here
 * and one folder under src/experiments/.
 */
import type { ComponentType, LazyExoticComponent } from 'react';
import { lazy } from 'react';

export type ModuleId = 'kinematics' | 'ai' | 'ml' | 'mobile' | 'integration';

export interface ModuleInfo {
  id: ModuleId;
  title: string;
  blurb: string;
}

export const MODULES: ModuleInfo[] = [
  { id: 'kinematics', title: 'Kinematics & Dynamics', blurb: 'Transforms, forward/inverse kinematics, trajectories and the dynamics of robot arms.' },
  { id: 'ai', title: 'Artificial Intelligence', blurb: 'Fuzzy inference and neural networks built from scratch.' },
  { id: 'ml', title: 'Machine Learning', blurb: 'Regression and clustering, with every number visible.' },
  { id: 'mobile', title: 'Mobile Robotics', blurb: 'Differential-drive robots with sensors and reactive controllers.' },
  { id: 'integration', title: 'Integrated Pipeline', blurb: 'Several experiments chained into one pick-and-place task.' },
];

export interface Experiment {
  /** Experiment number as printed in the lab manual. */
  number: number;
  /** URL-safe id, also the folder name under src/experiments/. */
  id: string;
  /** Route path (HashRouter), e.g. "/screw". */
  route: string;
  title: string;
  description: string;
  module: ModuleId;
  /** Syllabus section(s), e.g. "2.3, 2.4". */
  syllabus: string;
  /** Course outcome(s), e.g. "CO2". */
  co: string;
  /** Short label shown on the card / header, e.g. "Module 2 · CO2". */
  tag: string;
  /** Emoji-free, monochrome-friendly icon name (see components/Icon.tsx). */
  icon: 'screw' | 'scara' | 'arm' | 'path' | 'dynamics' | 'fuzzy' | 'neural' | 'python' | 'cluster' | 'obstacle' | 'line' | 'pipeline';
  /** Lazily-loaded page component so one broken page never breaks the rest. */
  component: LazyExoticComponent<ComponentType>;
}

export const EXPERIMENTS: Experiment[] = [
  {
    number: 2,
    id: 'screw',
    route: '/screw',
    title: 'Screw Transformation',
    description: 'Rotate about and translate along an arbitrary axis; watch the 4×4 homogeneous matrix build up.',
    module: 'kinematics',
    syllabus: '2.2',
    co: 'CO2',
    tag: 'Module 2 · CO2',
    icon: 'screw',
    component: lazy(() => import('./screw/ScrewPage')),
  },
  {
    number: 3,
    id: 'scara',
    route: '/scara',
    title: 'Direct Kinematics of SCARA',
    description: 'Denavit–Hartenberg parameters to end-effector pose for an RRP(R) SCARA arm, in 3D.',
    module: 'kinematics',
    syllabus: '2.3, 2.4',
    co: 'CO2',
    tag: 'Module 2 · CO2',
    icon: 'scara',
    component: lazy(() => import('./scara/ScaraPage')),
  },
  {
    number: 4,
    id: 'ik3dof',
    route: '/ik3dof',
    title: 'Inverse Kinematics of 3-DOF Planar Robot',
    description: 'Drag a target pose and solve for joint angles analytically, including elbow-up / elbow-down.',
    module: 'kinematics',
    syllabus: '2.5',
    co: 'CO2',
    tag: 'Module 2 · CO2',
    icon: 'arm',
    component: lazy(() => import('./ik3dof/Ik3DofPage')),
  },
  {
    number: 5,
    id: 'trajectory',
    route: '/trajectory',
    title: 'Trajectory Planning',
    description: 'Cubic, quintic and LSPB joint-space trajectories with position, velocity and acceleration plots.',
    module: 'kinematics',
    syllabus: '2.6',
    co: 'CO2',
    tag: 'Module 2 · CO2',
    icon: 'path',
    component: lazy(() => import('./trajectory/TrajectoryPage')),
  },
  {
    number: 6,
    id: 'dynamics',
    route: '/dynamics',
    title: 'Dynamic Analysis of Single-Arm Robot',
    description: 'Euler–Lagrange model of a one-link arm under gravity, torque and PD control, simulated with RK4.',
    module: 'kinematics',
    syllabus: '2.7',
    co: 'CO2',
    tag: 'Module 2 · CO2',
    icon: 'dynamics',
    component: lazy(() => import('./dynamics/DynamicsPage')),
  },
  {
    number: 7,
    id: 'fuzzy',
    route: '/fuzzy',
    title: 'Fuzzy Logic System',
    description: 'Membership functions, a rule base and centroid defuzzification, implemented from scratch.',
    module: 'ai',
    syllabus: '3.2',
    co: 'CO3',
    tag: 'Module 3 · CO3',
    icon: 'fuzzy',
    component: lazy(() => import('./fuzzy/FuzzyPage')),
  },
  {
    number: 8,
    id: 'neural',
    route: '/neural',
    title: 'Neural Network Regression & Classification',
    description: 'A small multilayer perceptron trained with back-propagation; watch the loss fall live.',
    module: 'ai',
    syllabus: '3.3, 4.1',
    co: 'CO3, CO4',
    tag: 'Module 3–4 · CO3, CO4',
    icon: 'neural',
    component: lazy(() => import('./neural/NeuralPage')),
  },
  {
    number: 9,
    id: 'linreg',
    route: '/linreg',
    title: 'Linear Regression in Python',
    description: 'Least-squares fit run in real Python (Pyodide) in the browser, with the normal-equation derivation.',
    module: 'ml',
    syllabus: '4.2',
    co: 'CO4',
    tag: 'Module 4 · CO4',
    icon: 'python',
    component: lazy(() => import('./linreg/LinRegPage')),
  },
  {
    number: 10,
    id: 'kmeans',
    route: '/kmeans',
    title: 'K-Means Clustering',
    description: 'Step through assignment and update phases on a 2D dataset and track the WCSS objective.',
    module: 'ml',
    syllabus: '4.3',
    co: 'CO4',
    tag: 'Module 4 · CO4',
    icon: 'cluster',
    component: lazy(() => import('./kmeans/KMeansPage')),
  },
  {
    number: 11,
    id: 'obstacle',
    route: '/obstacle',
    title: 'Obstacle Avoidance Robot',
    description: 'A differential-drive robot with range sensors navigates a field of obstacles reactively.',
    module: 'mobile',
    syllabus: '5.2, 5.3',
    co: 'CO5',
    tag: 'Module 5 · CO5',
    icon: 'obstacle',
    component: lazy(() => import('./obstacle/ObstaclePage')),
  },
  {
    number: 12,
    id: 'linefollower',
    route: '/linefollower',
    title: 'Line Follower Robot',
    description: 'IR sensor array plus a PID controller keeps a robot on a drawn track; tune the gains live.',
    module: 'mobile',
    syllabus: '5.1, 5.2',
    co: 'CO5',
    tag: 'Module 5 · CO5',
    icon: 'line',
    component: lazy(() => import('./linefollower/LineFollowerPage')),
  },
  {
    number: 13,
    id: 'pipeline',
    route: '/pipeline',
    title: 'Pick-and-Place Pipeline',
    description: 'Scattered objects → k-means finds them (Exp 10) → IK (Exp 4) → quintic trajectories (Exp 5) pick each one up and drop it in a bin.',
    module: 'integration',
    syllabus: '2.5, 2.6, 4.3',
    co: 'CO2, CO4',
    tag: 'Integration · CO2, CO4',
    icon: 'pipeline',
    component: lazy(() => import('./pipeline/PipelinePage')),
  },
];

export const experimentsByModule = (moduleId: ModuleId): Experiment[] => EXPERIMENTS.filter((e) => e.module === moduleId);

export const findExperiment = (id: string): Experiment | undefined => EXPERIMENTS.find((e) => e.id === id);
