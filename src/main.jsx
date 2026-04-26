import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './legacy.js' // 引入 legacy 逻辑

// 此文件作为 Vite 入口
ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)
