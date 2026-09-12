import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { JudgeApp } from './judge/JudgeApp';
import { installFetchLogger } from './judge/apiLog';
import './styles/globals.css';

// Lean judge UI is the default; the classic UI stays reachable at ?ui=classic
const useClassic = new URLSearchParams(window.location.search).get('ui') === 'classic';
if (!useClassic) installFetchLogger();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {useClassic ? <App /> : <JudgeApp />}
  </React.StrictMode>,
);
