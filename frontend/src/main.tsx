import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '@/App';
import { UndoRedoProvider } from '@/hooks/undoRedo';
import { MusicPlayerProvider } from '@/hooks/musicPlayer';
import { VoiceRoomSessionProvider } from '@/hooks/voiceRoomSession';
import { PomodoroProvider } from '@/hooks/pomodoro';
import { PrayerTimesProvider } from '@/hooks/prayerTimesStore';
import { getInitialTheme } from '@/utils/theme';
import { initNativeShell } from '@/utils/nativeShell';
import { initReminderChannel } from '@/services/notifications/nativeReminders';
import '@/styles.css';

initNativeShell(getInitialTheme());
void initReminderChannel();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <UndoRedoProvider>
      <MusicPlayerProvider>
        <PrayerTimesProvider>
          <PomodoroProvider>
            <VoiceRoomSessionProvider>
              <App />
            </VoiceRoomSessionProvider>
          </PomodoroProvider>
        </PrayerTimesProvider>
      </MusicPlayerProvider>
    </UndoRedoProvider>
  </React.StrictMode>
);
