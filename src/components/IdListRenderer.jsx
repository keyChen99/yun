import React from 'react';
import { Button, Modal, Input } from 'antd';
import { EditOutlined } from '@ant-design/icons';

const IdListRenderer = ({ data, onDelete, onUpdateTitle, isModal = false }) => {
    const dateColors = ['#1890ff', '#52c41a', '#f5222d', '#fa8c16', '#722ed1', '#13c2c2', '#eb2f96'];
    
    if (!data || data.length === 0) {
        return <div style={{ textAlign: 'center', padding: '20px', color: '#666' }}>暂无ID列表数据</div>;
    }

    const escapeHtml = (text) => {
        return String(text || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    };

    const handleTitleEdit = (item) => {
        Modal.confirm({
            title: '修改演出名称',
            icon: <EditOutlined />,
            content: (
                <Input 
                    defaultValue={item.title} 
                    onChange={(e) => (window._temp_new_title = e.target.value)} 
                    placeholder="请输入新的演出名称"
                    style={{ marginTop: 15 }}
                />
            ),
            onOk: async () => {
                const newTitle = window._temp_new_title || item.title;
                if (newTitle && newTitle !== item.title) {
                    await onUpdateTitle(item.itemId, newTitle);
                }
                delete window._temp_new_title;
            },
            onCancel: () => {
                delete window._temp_new_title;
            }
        });
    };

    return (
        <div className={isModal ? "idlist-renderer-modal" : ""}>
            {data.map(item => {
                const uniqueDates = Array.from(new Set(item.tickets.map(t => {
                    const m = t.info.match(/\d{4}-\d{2}-\d{2}/);
                    return m ? m[0] : null;
                }).filter(d => d))).sort();

                return (
                    <div className="viewer-wrapper" key={item.itemId}>
                        <div className="viewer-swipe-delete" onClick={() => onDelete && onDelete(item.itemId)}>删除</div>
                        <div className="viewer-item viewer-card" style={{ padding: '15px' }}>
                            <div className="idlist-sticky-header">
                                <div className="viewer-row" style={{ marginBottom: '10px', alignItems: 'flex-start' }}>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <div className="viewer-text" style={{ fontSize: '16px', color: '#1890ff', whiteSpace: 'normal', wordBreak: 'break-all', flex: 1 }}>{item.title}</div>
                                            <Button size="small" type="text" icon={<EditOutlined style={{ fontSize: '12px', color: '#999' }} />} onClick={() => handleTitleEdit(item)} />
                                        </div>
                                        <div className="viewer-sub">项目ID: {item.itemId}</div>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                    <button className="mini-btn" style={{ background: '#e6f7ff', color: '#1890ff' }} onClick={(e) => window.copyPlainText(e, item.itemId, '已复制项目ID')}>复制项目ID</button>
                                    <button className="mini-btn" style={{ background: '#f6ffed', color: '#52c41a' }} onClick={(e) => window.copyProjectIds(e.target)}>复制票价ID</button>
                                    <button className="mini-btn" style={{ background: '#f5f5f5', color: '#8c8c8c' }} onClick={(e) => window.clearProjectSelections(e.target)}>清空勾选</button>
                                    <button className="mini-btn viewer-del-btn" style={{ background: '#fff1f0', color: '#f5222d', border: '1px solid #ffa39e' }} onClick={() => onDelete && onDelete(item.itemId)}>删除</button>
                                </div>
                            </div>
                            <div className="idlist-items-container">
                                {item.tickets.map(ticket => {
                                    const dateMatch = ticket.info.match(/\d{4}-\d{2}-\d{2}/);
                                    const date = dateMatch ? dateMatch[0] : null;
                                    const dateIdx = date ? uniqueDates.indexOf(date) : -1;
                                    const color = dateIdx !== -1 ? dateColors[dateIdx % dateColors.length] : '#222';
                                    let displayInfo = escapeHtml(ticket.info).replace(/(\d+)(元)/g, '<span style="font-size: 18px; font-weight: bold; margin: 0 2px;">$1</span>$2');
                                    
                                    return (
                                        <div 
                                            className="viewer-member" 
                                            key={ticket.ticketId}
                                            onClick={(e) => window.toggleTicketCheckbox(e, e.currentTarget)} 
                                            style={{ display: 'flex', alignItems: 'center', gap: '10px', borderTop: '1px solid #f0f0f0', padding: '10px 0', cursor: 'pointer' }}
                                        >
                                            <input 
                                                type="checkbox" 
                                                className="ticket-checkbox" 
                                                value={ticket.ticketId} 
                                                data-group={`${item.itemId}_${date || 'nodate'}`} 
                                                onChange={(e) => window.handleCheckboxChange(e.target)} 
                                                style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                                            />
                                            <div style={{ flex: 1 }}>
                                                <div className="viewer-text" style={{ fontSize: '14px', color: color }} dangerouslySetInnerHTML={{ __html: displayInfo }}></div>
                                                <div className="viewer-sub" style={{ fontSize: '12px', color: '#999' }}>ID: {ticket.ticketId}</div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export default IdListRenderer;
