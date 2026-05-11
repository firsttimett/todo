import '@preact/signals-react/runtime';
import './app.css';

import { createRoot } from 'react-dom/client';

import { App } from './components/App';
import { registerServiceWorker } from './registerServiceWorker';

const root = document.getElementById('app');
if (!root) throw new Error('Root element #app not found');

createRoot(root).render(<App />);
registerServiceWorker();
