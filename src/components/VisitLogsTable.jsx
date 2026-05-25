import React, { useState, useEffect } from 'react';
import { Table, Card, Tag, Button, message } from 'antd';
import { HistoryOutlined, ReloadOutlined } from '@ant-design/icons';

const VisitLogsTable = () => {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/wechat/logs");
            const result = await res.json();
            if (result.status === "error") {
                message.error(result.msg);
                if (window.reactNavigate) window.reactNavigate('/');
            } else {
                setData(result);
            }
        } catch (e) {
            message.error("加载日志失败");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const columns = [
        { title: '序号', key: 'index', render: (_, __, index) => index + 1, width: 70 },
        { title: '访问时间', dataIndex: 'visit_time', key: 'visit_time', width: 180 },
        { title: 'IP', dataIndex: 'ip', key: 'ip', width: 140 },
        { title: '角色', dataIndex: 'role', key: 'role', width: 120, render: (role) => (
            <Tag color={role === 'admin' ? 'red' : (role === 'sub_admin' ? 'blue' : 'orange')}>
                {role === 'admin' ? '超级管理员' : (role === 'sub_admin' ? '子管理员' : '微信专员')}
            </Tag>
        )},
        { title: '录入身份', dataIndex: 'inputter', key: 'inputter', width: 120 },
        { title: '设备信息', dataIndex: 'user_agent', key: 'user_agent', ellipsis: true }
    ];

    return (
        <div className="logs-container" style={{ background: '#f0f2f5', minHeight: '100vh', padding: '24px' }}>
            <Card style={{ borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: '18px', fontWeight: 'bold' }}>
                        <HistoryOutlined style={{ marginRight: 8, color: '#1890ff' }} />
                        微信列表访问日志 (最近 500 条)
                    </div>
                    <Button icon={<ReloadOutlined />} onClick={fetchData}>刷新</Button>
                </div>
                <Table 
                    columns={columns} 
                    dataSource={data} 
                    rowKey="id" 
                    loading={loading}
                    size="middle"
                    scroll={{ x: 'max-content' }}
                    pagination={{ pageSize: 50, showTotal: total => `共 ${total} 条` }}
                />
            </Card>
        </div>
    );
};

export default VisitLogsTable;
