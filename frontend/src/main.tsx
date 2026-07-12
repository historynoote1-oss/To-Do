import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { UndoRedoProvider } from './lib/undoRedo';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <UndoRedoProvider>
      <App />
    </UndoRedoProvider>
  </React.StrictMode>
);
