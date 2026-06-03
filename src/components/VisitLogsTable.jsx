import React, { useState, useEffect } from 'react';
import { Table, Card, Tag, Button, message, Space } from 'antd';
import { HistoryOutlined, ReloadOutlined, FileExcelOutlined } from '@ant-design/icons';
import { exportToExcel } from '../utils/excelExport';

const VisitLogsTable = () => {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);

    const isAdmin = localStorage.getItem('auth_role') === 'admin';

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

    const handleExport = async () => {
        setLoading(true);
        try {
            // 获取所有日志，不带 500 条限制
            const res = await fetch("/api/wechat/logs?limit=0", {
                headers: { "Authorization": localStorage.getItem("auth_token") || "" }
            });
            const allData = await res.json();
            
            if (allData.status === "error") {
                message.error(allData.msg);
                return;
            }

            const exportColumns = [
                { title: '访问时间', dataIndex: 'visit_time' },
                { title: 'IP', dataIndex: 'ip' },
                { title: '角色', dataIndex: 'role' },
                { title: '录入身份', dataIndex: 'inputter' },
                { title: '设备信息', dataIndex: 'user_agent' }
            ];
            
            const roleMap = {
                'admin': '超级管理员',
                'sub_admin': '子管理员',
                'wechat_only': '微信专员'
            };
            
            const exportData = allData.map(item => ({
                ...item,
                role: roleMap[item.role] || item.role
            }));
            
            exportToExcel(exportData, exportColumns, '访问日志_全部.xlsx');
            message.success(`已导出 ${exportData.length} 条数据`);
        } catch (e) {
            message.error("导出失败");
        } finally {
            setLoading(false);
        }
    };

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
                    <Space>
                        <Button icon={<ReloadOutlined />} onClick={fetchData}>刷新</Button>
                        {isAdmin && <Button icon={<FileExcelOutlined />} onClick={handleExport} loading={loading}>导出 Excel</Button>}
                    </Space>
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
