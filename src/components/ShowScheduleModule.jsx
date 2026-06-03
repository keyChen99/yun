import React, { useState, useEffect, useCallback } from 'react';
import dayjs from 'dayjs';
import { 
  Table, Button, Input, Modal, Select, Tag, Space, 
  message, Popconfirm, Upload, DatePicker
} from 'antd';
import { 
  PlusOutlined, EditOutlined, DeleteOutlined, 
  DashboardOutlined, FileImageOutlined, FileExcelOutlined
} from '@ant-design/icons';
import { exportToExcel } from '../utils/excelExport';

const ShowScheduleModule = () => {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [parsing, setParsing] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [pendingShows, setPendingShows] = useState([]); // 待保存的演出列表

    const role = localStorage.getItem('auth_role');
    const isAdmin = role === 'admin';
    const inputter = localStorage.getItem('wechat_inputter') || "";

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/shows");
            const result = await res.json();
            setData(result || []);
        } catch (e) {
            message.error("加载数据失败");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
        
        // 记录访问日志
        const recordVisit = async () => {
            try {
                await fetch("/api/wechat/visit", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ role, inputter })
                });
            } catch (e) {
                console.error("Record visit failed", e);
            }
        };
        recordVisit();
    }, [fetchData, role, inputter]);

    const handleSave = async () => {
        // 验证数据
        const invalid = pendingShows.some(s => !s.show_name || !s.sale_time);
        if (invalid) {
            message.warning("请完善所有演出的名称和时间");
            return;
        }

        try {
            if (editingId) {
                // 编辑单条数据
                const show = pendingShows[0];
                const res = await fetch(`/api/shows/${editingId}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        show_name: show.show_name,
                        sale_time: dayjs(show.sale_time).format('YYYY-MM-DD HH:mm:ss')
                    })
                });
                const result = await res.json();
                if (result.status === "success") message.success("更新成功");
            } else {
                // 批量新增
                const items = pendingShows.map(s => ({
                    show_name: s.show_name,
                    sale_time: dayjs(s.sale_time).format('YYYY-MM-DD HH:mm:ss')
                }));
                const res = await fetch("/api/shows/bulk", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ items })
                });
                const result = await res.json();
                if (result.status === "success") message.success(result.msg);
            }
            
            setIsModalOpen(false);
            setEditingId(null);
            setPendingShows([]);
            fetchData();
            window.dispatchEvent(new CustomEvent('shows-updated'));
        } catch (e) {
            message.error("保存失败");
        }
    };

    const handleDelete = async (id) => {
        try {
            await fetch(`/api/shows/${id}`, { method: "DELETE" });
            message.success("删除成功");
            fetchData();
            window.dispatchEvent(new CustomEvent('shows-updated'));
        } catch (e) {
            message.error("删除失败");
        }
    };

    const handleClearExpired = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/shows/clear_expired", { method: "POST" });
            const result = await res.json();
            if (result.status === "success") {
                message.success(result.msg);
                fetchData();
                window.dispatchEvent(new CustomEvent('shows-updated'));
            }
        } catch (e) {
            message.error("清除失败");
        } finally {
            setLoading(false);
        }
    };

    const handleExport = () => {
        const exportColumns = [
            { title: '演出名称', dataIndex: 'show_name' },
            { title: '开票时间', dataIndex: 'sale_time' }
        ];
        exportToExcel(data, exportColumns, '演出日程列表.xlsx');
    };

    const handleParseImage = async (file) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = async () => {
            const base64 = reader.result;
            setParsing(true);
            try {
                const res = await fetch("/api/shows/parse_image", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ image: base64 })
                });
                const result = await res.json();
                if (result.status === "success" && result.data && result.data.length > 0) {
                    const newItems = result.data.map((item, index) => ({
                        tempId: Date.now() + index,
                        show_name: item.show_name,
                        sale_time: dayjs(item.sale_time)
                    }));
                    // 如果当前列表只有一条空白数据，则替换它；否则追加
                    setPendingShows(prev => {
                        if (prev.length === 1 && !prev[0].show_name && !prev[0].sale_time) {
                            return newItems;
                        }
                        return [...prev, ...newItems];
                    });
                    message.success(`成功解析出 ${result.data.length} 个演出`);
                } else {
                    message.warning(result.msg || "解析失败");
                }
            } catch (e) {
                message.error("AI 解析请求失败");
            } finally {
                setParsing(false);
            }
        };
        return false;
    };

    const addManualItem = () => {
        setPendingShows(prev => [...prev, { tempId: Date.now(), show_name: '', sale_time: null }]);
    };

    const removePendingItem = (tempId) => {
        setPendingShows(prev => prev.filter(item => item.tempId !== tempId));
    };

    const updatePendingItem = (tempId, field, value) => {
        setPendingShows(prev => prev.map(item => 
            item.tempId === tempId || (editingId && prev.indexOf(item) === 0) 
                ? { ...item, [field]: value } 
                : item
        ));
    };

    const columns = [
        { title: '演出名称', dataIndex: 'show_name', key: 'show_name' },
        { title: '开票时间', dataIndex: 'sale_time', key: 'sale_time' },
        { 
            title: '操作', 
            key: 'action', 
            render: (_, record) => (
                <Space>
                    <Button size="small" type="link" icon={<EditOutlined />} onClick={() => {
                        setEditingId(record.id);
                        setPendingShows([{
                            show_name: record.show_name,
                            sale_time: dayjs(record.sale_time)
                        }]);
                        setIsModalOpen(true);
                    }}>编辑</Button>
                    <Popconfirm title="确定删除吗？" onConfirm={() => handleDelete(record.id)}>
                        <Button size="small" type="link" danger icon={<DeleteOutlined />} >删除</Button>
                    </Popconfirm>
                </Space>
            )
        }
    ];

    return (
        <div className="ticketing-container">
            <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
                <Space>
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => {
                        setEditingId(null);
                        setPendingShows([{ tempId: Date.now(), show_name: '', sale_time: null }]);
                        setIsModalOpen(true);
                    }}>新增演出</Button>
                    <Popconfirm title="确定清除所有过期（当前时间之前）的演出吗？" onConfirm={handleClearExpired}>
                        <Button danger icon={<DeleteOutlined />}>清除过期</Button>
                    </Popconfirm>
                </Space>
                <Space>
                    <Button icon={<DashboardOutlined />} onClick={fetchData}>刷新列表</Button>
                    {isAdmin && <Button icon={<FileExcelOutlined />} onClick={handleExport}>导出 Excel</Button>}
                </Space>
            </div>

            <Table 
                columns={columns} 
                dataSource={data} 
                rowKey="id" 
                loading={loading}
                pagination={false}
            />

            <Modal
                title={editingId ? "编辑演出日程" : "新增演出日程"}
                open={isModalOpen}
                onCancel={() => setIsModalOpen(false)}
                onOk={handleSave}
                width={700}
                okText="保存全部"
            >
                {!editingId && (
                    <div style={{ marginBottom: 16, padding: '12px', background: '#f0f5ff', borderRadius: '8px', border: '1px dashed #adc6ff' }}>
                        <div style={{ fontSize: '12px', color: '#2f54eb', marginBottom: '8px' }}>📸 AI 识图配置（支持解析截图中的多个演出）：</div>
                        <Upload 
                            beforeUpload={handleParseImage} 
                            showUploadList={false}
                            accept="image/*"
                        >
                            <Button icon={<FileImageOutlined />} loading={parsing}>上传图片解析</Button>
                        </Upload>
                    </div>
                )}

                <div style={{ marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontWeight: 'bold' }}>待保存演出列表：</div>
                    {!editingId && (
                        <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={addManualItem}>添加一条</Button>
                    )}
                </div>

                <div style={{ maxHeight: '400px', overflowY: 'auto', paddingRight: '5px' }}>
                    {pendingShows.map((item, index) => (
                        <div 
                            key={item.tempId || index} 
                            style={{ 
                                display: 'flex', 
                                gap: '10px', 
                                marginBottom: '10px', 
                                padding: '12px', 
                                background: '#f9f9f9', 
                                borderRadius: '8px',
                                position: 'relative'
                            }}
                        >
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: '12px', color: '#888', marginBottom: '4px' }}>演出名称</div>
                                <Input 
                                    placeholder="输入演出名称" 
                                    value={item.show_name} 
                                    onChange={e => updatePendingItem(item.tempId, 'show_name', e.target.value)}
                                />
                            </div>
                            <div style={{ width: '220px' }}>
                                <div style={{ fontSize: '12px', color: '#888', marginBottom: '4px' }}>开票时间</div>
                                <DatePicker 
                                    showTime 
                                    style={{ width: '100%' }} 
                                    format="YYYY-MM-DD HH:mm:ss" 
                                    value={item.sale_time}
                                    onChange={val => updatePendingItem(item.tempId, 'sale_time', val)}
                                />
                            </div>
                            {!editingId && pendingShows.length > 1 && (
                                <Button 
                                    type="text" 
                                    danger 
                                    icon={<DeleteOutlined />} 
                                    style={{ marginTop: '22px' }}
                                    onClick={() => removePendingItem(item.tempId)}
                                />
                            )}
                        </div>
                    ))}
                </div>
            </Modal>
        </div>
    );
};

export default ShowScheduleModule;
