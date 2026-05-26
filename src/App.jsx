import React, { useEffect, useCallback, Suspense } from 'react';
import { Button } from 'antd';
import { HashRouter, Routes, Route, useNavigate, Navigate } from 'react-router-dom';

// 导入 App.css
import './App.css';

// 懒加载组件
const ChatGenerator = React.lazy(() => import('./ChatGenerator'));
const WechatListTable = React.lazy(() => import('./components/WechatListTable'));
const VisitLogsTable = React.lazy(() => import('./components/VisitLogsTable'));
const TicketingSystem = React.lazy(() => import('./components/TicketingSystem'));
const ShowScheduleModule = React.lazy(() => import('./components/ShowScheduleModule'));
const VirtualNumbersTable = React.lazy(() => import('./components/VirtualNumbersTable'));
const CountdownFloating = React.lazy(() => import('./components/CountdownFloating'));
const CloudShortcutTool = React.lazy(() => import('./components/CloudShortcutTool'));

// --- 路由辅助组件 ---
const LegacyViewWrapper = ({ viewId, onMount }) => {
    const navigate = useNavigate();
    const token = localStorage.getItem('auth_token');
    const role = localStorage.getItem('auth_role');
    const permissions = JSON.parse(localStorage.getItem('auth_permissions') || '[]');
    
    useEffect(() => {
        // 1. 公开页面处理
        if (viewId === 'homeView') {
            const view = document.getElementById(viewId);
            if (view) view.style.display = 'block';
            return () => { if (view) view.style.display = 'none'; };
        }

        // 2. 权限检查逻辑
        let isAllowed = false;
        if (token) {
            if (role === 'admin') {
                isAllowed = true;
            } else if (role === 'sub_admin') {
                // 映射 viewId 到 API 前缀
                const viewToApiMap = {
                    'viewersView': '/api/viewers',
                    'idListView': '/api/idlist'
                };
                const apiPrefix = viewToApiMap[viewId];
                if (apiPrefix && permissions.includes(apiPrefix)) {
                    isAllowed = true;
                }
            } else if (role === 'wechat_only') {
                // 微信专员无权访问 Legacy 视图
                isAllowed = false;
            }
        }

        if (!isAllowed) {
            navigate('/wechat');
            return;
        }

        const view = document.getElementById(viewId);
        const title = document.querySelector('.title');
        if (view) {
            view.style.display = 'block';
            if (title) title.style.display = 'none';
            
            if (typeof window.setCurrentView === 'function') {
                const legacyViewName = viewId.replace('View', '').toLowerCase();
                window.setCurrentView(legacyViewName);
            }
            if (onMount) onMount();
        }
        return () => {
            if (view) view.style.display = 'none';
        };
    }, [viewId, onMount, token, role, permissions, navigate]);
    return null;
};

const ViewWithTitle = ({ title, children, viewName }) => {
    const navigate = useNavigate();
    const token = localStorage.getItem('auth_token');
    const role = localStorage.getItem('auth_role');
    const permissions = JSON.parse(localStorage.getItem('auth_permissions') || '[]');

    useEffect(() => {
        // 1. 公开页面处理
        if (viewName === 'wechat') {
            // 微信页面需要权限检查
            let canSeeWechat = false;
            if (token) {
                if (role === 'admin' || role === 'wechat_only' || permissions.includes('/api/wechat')) {
                    canSeeWechat = true;
                }
            }
            if (!canSeeWechat) {
                navigate('/');
                return;
            }
        }

        // 2. 权限检查逻辑 (针对非 wechat 的其他路由)
        if (viewName !== 'wechat') {
            let isAllowed = false;
            if (token) {
                if (role === 'admin') {
                    isAllowed = true;
                } else if (role === 'sub_admin') {
                    // 映射 viewName 到 API 前缀
                    const viewToApiMap = {
                        'shows': '/api/shows'
                    };
                    const apiPrefix = viewToApiMap[viewName];
                    if (apiPrefix && permissions.includes(apiPrefix)) {
                        isAllowed = true;
                    }
                }
                // wechat_logs 只有超级管理员可以看
                if (viewName === 'wechat_logs' && role !== 'admin') {
                    isAllowed = false;
                }
            }

            if (!isAllowed) {
                navigate('/');
                return;
            }
        }

        const h1 = document.querySelector('.title');
        if (h1) h1.style.display = 'none';
        
        if (typeof window.setCurrentView === 'function') {
            window.setCurrentView(viewName);
        }
    }, [viewName, token, role, permissions, navigate]);

    return (
        <div className="view-container" style={{ maxWidth: viewName === 'virtual_numbers' ? '1000px' : 'none' }}>
            <div className="topbar">
                {token && <Button className="back-btn" onClick={() => window.reactNavigate('/')}>返回</Button>}
                <div className="topbar-title">{title}</div>
            </div>
            {children}
        </div>
    );
};

const Layout = ({ children }) => {
    const navigate = useNavigate();

    // 全局暴露导航函数给 legacy.js 使用
    useEffect(() => {
        window.reactNavigate = navigate;
        // 初始加载完成后隐藏遮罩
        if (typeof window.hideLoading === 'function') {
            window.hideLoading();
        }
    }, [navigate]);

    return (
        <div className="app-layout">
            <Suspense fallback={null}>
                <CountdownFloating />
                <CloudShortcutTool />
            </Suspense>
            {children}
        </div>
    );
};

export default function App() {
    const handleInventoryMount = useCallback(() => window.loadInventory && window.loadInventory(), []);
    const handleViewersMount = useCallback(() => window.loadViewers && window.loadViewers(), []);
    const handleIdListMount = useCallback(() => window.loadIdList && window.loadIdList(), []);

    return (
        <HashRouter>
            <Layout>
                <Suspense fallback={<div className="view-container" style={{ textAlign: 'center' }}>模块加载中...</div>}>
                    <Routes>
                        <Route path="/" element={<LegacyViewWrapper viewId="homeView" />} />
                        <Route path="/inventory" element={<LegacyViewWrapper viewId="inventoryView" onMount={handleInventoryMount} />} />
                        <Route path="/viewers" element={<LegacyViewWrapper viewId="viewersView" onMount={handleViewersMount} />} />
                        <Route path="/idlist" element={<LegacyViewWrapper viewId="idListView" onMount={handleIdListMount} />} />
                        <Route path="/virtual_numbers" element={
                            <ViewWithTitle title="虚拟号表" viewName="virtual_numbers">
                                <VirtualNumbersTable standalone={true} />
                            </ViewWithTitle>
                        } />
                        <Route path="/shows" element={
                            <ViewWithTitle title="配置演出日程" viewName="shows">
                                <ShowScheduleModule />
                            </ViewWithTitle>
                        } />
                        <Route path="/ticketing" element={
                            <ViewWithTitle title="票务管理系统" viewName="ticketing">
                                <TicketingSystem standalone={true} />
                            </ViewWithTitle>
                        } />
                        <Route path="/chat_generator" element={
                            <ViewWithTitle title="微信聊天记录生成器" viewName="chat_generator">
                                <ChatGenerator />
                            </ViewWithTitle>
                        } />
                        <Route path="/wechat" element={
                            <ViewWithTitle title="微信列表" viewName="wechat">
                                <WechatListTable />
                            </ViewWithTitle>
                        } />
                        <Route path="/wechat/logs" element={
                            <ViewWithTitle title="访问日志" viewName="wechat_logs">
                                <VisitLogsTable />
                            </ViewWithTitle>
                        } />
                        <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                </Suspense>
            </Layout>
        </HashRouter>
    );
}
