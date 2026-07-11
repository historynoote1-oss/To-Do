import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles.css';

const rootEl = document.getElementById('root')!;

function showFatalError(message: string) {
  rootEl.innerHTML = `
    <div style="max-width:480px;margin:40px auto;padding:16px;font-family:sans-serif;direction:rtl;color:#eaeaea;">
      <h2 style="color:#ed4245;">حصل خطأ</h2>
      <p style="line-height:1.6;">${message}</p>
    </div>
  `;
}

// لو أي حاجة وقعت وقت تحميل الكود نفسه (زي متغير بيئة ناقص) هتتلقط هنا
window.addEventListener('error', (e) => {
  if (rootEl.innerHTML.trim() === '') {
    showFatalError(e.message);
  }
});

async function start() {
  try {
    const { default: App } = await import('./App');
    ReactDOM.createRoot(rootEl).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  } catch (err) {
    showFatalError(err instanceof Error ? err.message : String(err));
  }
}

start();
