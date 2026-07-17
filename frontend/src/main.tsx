import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { UndoRedoProvider } from './lib/undoRedo';
import { MusicPlayerProvider } from './lib/musicPlayer';
import { PomodoroProvider } from './lib/pomodoro';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <UndoRedoProvider>
      <MusicPlayerProvider>
        <PomodoroProvider>
          <App />
        </PomodoroProvider>
      </MusicPlayerProvider>
    </UndoRedoProvider>
  </React.StrictMode>
);
