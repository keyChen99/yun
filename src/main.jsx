import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './legacy.js' // 引入 legacy 逻辑

// 全局 Fetch 拦截器，自动添加授权头
const originalFetch = window.fetch;
window.fetch = async (...args) => {
    let [resource, config] = args;
    const token = localStorage.getItem('auth_token');
    
    // 如果是 API 请求且有 token，则添加 Authorization 头
    if (typeof resource === 'string' && resource.startsWith('/api/') && token) {
        config = config || {};
        config.headers = {
            ...config.headers,
            'Authorization': token
        };
    }
    
    const response = await originalFetch(resource, config);
    
    // 如果返回 401 且当前不是登录请求，则清除 token 并提示
    if (response.status === 401 && typeof resource === 'string' && !resource.includes('/api/auth')) {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_role');
        localStorage.removeItem('auth_permissions');
        
        // 强制跳转回首页，防止在无权访问的页面无限循环
        if (window.location.hash !== '#/') {
            window.location.href = '/#/';
            window.location.reload();
        }
    }
    
    return response;
};

// 此文件作为 Vite 入口
ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)
