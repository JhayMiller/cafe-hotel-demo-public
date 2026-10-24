import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {VitePWA} from 'vite-plugin-pwa';
export default defineConfig({
  plugins:[react(),VitePWA({
    registerType:'autoUpdate',includeAssets:[],manifest:{
      name:'Café + Hotel — Pedidos',short_name:'Café Hotel',description:'Pedidos y servicios desde la mesa o habitación',
      start_url:'/',display:'standalone',background_color:'#f7f6f2',theme_color:'#1f493d',
      icons:[{src:'/icon.svg',sizes:'any',type:'image/svg+xml',purpose:'any'}]
    },workbox:{navigateFallback:'/index.html',runtimeCaching:[]}
  })],
  server:{proxy:{'/api':'http://localhost:4000','/socket.io':{target:'http://localhost:4000',ws:true}}}
});
