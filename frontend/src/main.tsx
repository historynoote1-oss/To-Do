import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '@/App';
import { UndoRedoProvider } from '@/lib/core/undoRedo';
import { MusicPlayerProvider } from '@/lib/audio/musicPlayer';
import { PomodoroProvider } from '@/lib/audio/pomodoro';
import { PrayerTimesProvider } from '@/lib/prayer/prayerTimesStore';
import { getInitialTheme } from '@/lib/core/theme';
import { initNativeShell } from '@/lib/core/nativeShell';
import { initReminderChannel } from '@/lib/notifications/nativeReminders';
import '@/styles.css';

initNativeShell(getInitialTheme());
void initReminderChannel();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <UndoRedoProvider>
      <MusicPlayerProvider>
        <PrayerTimesProvider>
          <PomodoroProvider>
            <App />
          </PomodoroProvider>
        </PrayerTimesProvider>
      </MusicPlayerProvider>
    </UndoRedoProvider>
  </React.StrictMode>
);
