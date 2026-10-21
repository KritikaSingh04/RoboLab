import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { preloadPyodide } from './lib/py/pyodide';

// Start fetching the Python runtime (experiment 9) in the background right away.
preloadPyodide();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
