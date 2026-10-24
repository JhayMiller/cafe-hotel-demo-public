import React from 'react';
import {createRoot} from 'react-dom/client';
import App from './App';
import './styles.css';
import {demoMode} from './demo';
if(demoMode){
  const banner=document.createElement('div');
  banner.textContent='DEMOSTRACIÓN LOCAL · Menú de ejemplo · No procesa pedidos ni pagos';
  banner.style.cssText='padding:12px;text-align:center;background:#fff0bc;color:#493b13;font-weight:600';
  document.body.prepend(banner);
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
