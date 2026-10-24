import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {VitePWA} from 'vite-plugin-pwa';
export default defineConfig({
  plugins:[react(),VitePWA({
    registerType:'autoUpdate',includeAssets:[],manifest:{
      name:'Posada del Puerto | café hotel',short_name:'Posada del Puerto',description:'Café, descanso y servicio desde la mesa o habitación',
      start_url:'/',display:'standalone',background_color:'#F4EDE3',theme_color:'#9B1C1F',
      icons:[{src:'/icon.svg',sizes:'any',type:'image/svg+xml',purpose:'any'}]
    },workbox:{navigateFallback:'/index.html',runtimeCaching:[]}
  })],
  server:{proxy:{'/api':'http://localhost:4000','/socket.io':{target:'http://localhost:4000',ws:true}}}
});
