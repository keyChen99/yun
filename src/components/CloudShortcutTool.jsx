import React from 'react';
import { useLocation } from 'react-router-dom';

const CloudShortcutTool = () => {
    const location = useLocation();
    const showTool = location.pathname === '/idlist' || location.pathname === '/ticketing';

    if (!showTool) return null;

    return (
        <>
            <div className="float-ball" onClick={() => window.toggleCloudDrawer()}>☁️</div>
            <div id="cloudDrawer" className="cloud-drawer">
                <div className="cloud-drawer-header">
                    <span className="cloud-drawer-title">☁️ 云机快捷工具</span>
                    <span className="cloud-drawer-close" onClick={() => window.toggleCloudDrawer()}>&times;</span>
                </div>
                <div style={{ flex: 1 }}>
                    <textarea 
                        id="cloudInput" 
                        className="viewer-input" 
                        style={{ minHeight: '120px' }} 
                        placeholder="粘贴文本..." 
                        onInput={() => window.updateCloudResult && window.updateCloudResult()}
                    ></textarea>
                    <div style={{ marginTop: '15px' }}>
                        <div id="cloudResult" style={{ background: '#f8f9fa', border: '1px solid #e8e8e8', borderRadius: '8px', padding: '12px', minHeight: '80px', whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: '14px', color: '#333', marginBottom: '12px' }}></div>
                        <button className="primary-btn" style={{ background: '#52c41a', marginTop: 0, width: '100%' }} onClick={() => window.copyCloudResult && window.copyCloudResult()}>复制结构化数据</button>
                    </div>
                </div>
            </div>
        </>
    );
};

export default CloudShortcutTool;
