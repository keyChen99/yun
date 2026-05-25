import React, { useState, useEffect, useCallback } from 'react';
import { 
  Table, Button, Input, Modal, Select, Tag, Space, 
  message, Popconfirm, Row, Col, Popover, Card 
} from 'antd';
import { 
  SearchOutlined, PlusOutlined, DeleteOutlined, 
  ClockCircleOutlined, TeamOutlined, DashboardOutlined 
} from '@ant-design/icons';

const WechatListTable = () => {
    const [data, setData] = useState([]);
    const [stats, setStats] = useState([]);
    const [loading, setLoading] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [searchText, setSearchText] = useState("");
    const [statusFilter, setStatusFilter] = useState(null);
    const [tagFilter, setTagFilter] = useState(null);
    const [inputter, setInputter] = useState(localStorage.getItem('wechat_inputter') || "");
    const [batchText, setBatchText] = useState("");
    const [submitting, setSubmitting] = useState(false);

    const role = localStorage.getItem('auth_role');
    const isWechatOnly = role === 'wechat_only';

    const fetchData = useCallback(async (silent = true) => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (searchText) params.append('search', searchText);
            if (statusFilter !== null) params.append('status', statusFilter);
            if (tagFilter) params.append('tag', tagFilter);
            
            const [listRes, statsRes] = await Promise.all([
                fetch(`/api/wechat?${params.toString()}`),
                fetch(`/api/wechat/stats/today`)
            ]);
            
            const listData = await listRes.json();
            const statsData = await statsRes.json();
            
            setData(listData);
            setStats(statsData);
            if (!silent) {
                message.success("数据已更新");
            }
        } catch (e) {
            message.error("加载数据失败");
        } finally {
            setLoading(false);
        }
    }, [searchText, statusFilter, tagFilter]);

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

    const handleBatchAdd = async () => {
        if (!batchText.trim()) {
            message.warning("请输入微信ID");
            return;
        }
        setSubmitting(true);
        try {
            const res = await fetch("/api/wechat/bulk", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text: batchText, inputter })
            });
            const result = await res.json();
            if (result.status === "success") {
                message.success(result.msg);
                setIsModalOpen(false);
                setBatchText("");
                localStorage.setItem('wechat_inputter', inputter);
                fetchData();
            } else {
                message.error(result.msg);
            }
        } catch (e) {
            message.error("新增失败");
        } finally {
            setSubmitting(false);
        }
    };

    const handleUpdate = async (id, fields) => {
        try {
            const res = await fetch(`/api/wechat/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(fields)
            });
            const result = await res.json();
            if (result.status === "success") {
                message.success("更新成功");
                fetchData();
            }
        } catch (e) {
            message.error("更新失败");
        }
    };

    const handleDelete = async (id) => {
        try {
            const res = await fetch(`/api/wechat/${id}`, { method: "DELETE" });
            const result = await res.json();
            if (result.status === "success") {
                message.success("删除成功");
                fetchData();
            }
        } catch (e) {
            message.error("删除失败");
        }
    };

    const columns = [
        { title: '序号', key: 'index', render: (_, __, index) => index + 1, width: 70 },
        { title: '微信', dataIndex: 'wechat_id', key: 'wechat_id' },
        { 
            title: '是否处理', 
            dataIndex: 'is_processed', 
            key: 'is_processed',
            hidden: isWechatOnly,
            render: (val, record) => (
                <Select 
                    value={val} 
                    onChange={v => handleUpdate(record.id, { is_processed: v })}
                    style={{ width: 100 }}
                >
                    <Select.Option value={0}><Tag color="default">未处理</Tag></Select.Option>
                    <Select.Option value={1}><Tag color="success">已处理</Tag></Select.Option>
                </Select>
            )
        },
        { 
            title: '标签', 
            dataIndex: 'tag', 
            key: 'tag',
            hidden: isWechatOnly,
            render: (val, record) => (
                <Select 
                    value={val || undefined} 
                    placeholder="选择标签"
                    onChange={v => handleUpdate(record.id, { tag: v })}
                    style={{ width: 100 }}
                    allowClear
                >
                    <Select.Option value="外围">外围</Select.Option>
                    <Select.Option value="同行">同行</Select.Option>
                    <Select.Option value="骗子">骗子</Select.Option>
                </Select>
            )
        },
        { title: '录入人', dataIndex: 'inputter', key: 'inputter' },
        { title: '录入时间', dataIndex: 'added_time', key: 'added_time' },
        {
            title: '操作',
            key: 'action',
            hidden: isWechatOnly,
            render: (_, record) => (
                <Popconfirm title="确定删除吗？" onConfirm={() => handleDelete(record.id)}>
                    <Button type="link" danger icon={<DeleteOutlined />}>删除</Button>
                </Popconfirm>
            )
        }
    ].filter(col => !col.hidden);

    return (
        <div className="wechat-container" style={{ background: '#f0f2f5', minHeight: '100vh', padding: '12px' }}>
            {/* 顶部操作与身份区 */}
            <div style={{ 
                display: 'flex', 
                flexDirection: window.innerWidth < 768 ? 'column' : 'row',
                justifyContent: 'space-between', 
                alignItems: window.innerWidth < 768 ? 'stretch' : 'center', 
                gap: '12px',
                marginBottom: 16,
                background: '#fff',
                padding: '12px 16px',
                borderRadius: '12px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ 
                        background: '#e6f7ff', 
                        padding: '6px 12px', 
                        borderRadius: '8px',
                        border: '1px solid #91d5ff',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        flex: 1
                    }}>
                        <TeamOutlined style={{ color: '#1890ff' }} />
                        <span style={{ color: '#003a8c', fontWeight: '500', fontSize: '13px', whiteSpace: 'nowrap' }}>录入身份：</span>
                        <Input 
                            variant="borderless"
                            placeholder="点击填写姓名..." 
                            value={inputter}
                            style={{ fontWeight: 'bold', color: '#1890ff', padding: 0, fontSize: '14px' }}
                            onChange={e => {
                                setInputter(e.target.value);
                                localStorage.setItem('wechat_inputter', e.target.value);
                            }}
                        />
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <Button 
                        icon={<ClockCircleOutlined />} 
                        onClick={() => fetchData(false)}
                        style={{ flex: 1 }}
                    >刷新</Button>
                    <Popover content={!inputter ? "请先填写录入身份姓名" : null} trigger="hover">
                        <Button 
                            type="primary" 
                            icon={<PlusOutlined />} 
                            onClick={() => {
                                if (!inputter) {
                                    message.warning("请先填写录入身份姓名");
                                    return;
                                }
                                setIsModalOpen(true);
                            }}
                            disabled={!inputter}
                            style={{ borderRadius: '8px', flex: 2 }}
                        >
                            批量新增
                        </Button>
                    </Popover>
                </div>
            </div>

            {/* 统计数据区 */}
            <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: 8 }}>
                    <DashboardOutlined style={{ color: '#52c41a' }} />
                    <span style={{ fontSize: '14px', fontWeight: '600' }}>今日录入统计</span>
                </div>
                <div style={{ 
                    display: 'flex', 
                    overflowX: 'auto', 
                    gap: '12px', 
                    paddingBottom: '8px',
                    scrollbarWidth: 'none',
                    msOverflowStyle: 'none'
                }}>
                    {stats.length === 0 ? (
                        <Card size="small" style={{ textAlign: 'center', color: '#999', borderRadius: '8px', width: '100%' }}>暂无录入</Card>
                    ) : stats.map(item => (
                        <div key={item.inputter} style={{ minWidth: '120px', flexShrink: 0 }}>
                            <Card 
                                size="small" 
                                style={{ 
                                    borderRadius: '12px',
                                    background: item.inputter === inputter ? 'linear-gradient(135deg, #f6ffed 0%, #d9f7be 100%)' : '#fff',
                                    border: item.inputter === inputter ? '1px solid #b7eb8f' : '1px solid #f0f0f0',
                                    boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                                }}
                            >
                                <div style={{ fontSize: '11px', color: '#8c8c8c', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {item.inputter} {item.inputter === inputter && <Tag color="success" style={{ margin: 0, fontSize: '9px', padding: '0 2px' }}>YOU</Tag>}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: '2px' }}>
                                    <span style={{ fontSize: '18px', fontWeight: 'bold', color: '#262626' }}>{item.count}</span>
                                    <span style={{ fontSize: '11px', color: '#8c8c8c' }}>条</span>
                                </div>
                            </Card>
                        </div>
                    ))}
                </div>
            </div>

            {/* 列表与搜索区 */}
            <Card 
                style={{ borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}
                bodyStyle={{ padding: window.innerWidth < 768 ? '12px' : '20px' }}
            >
                <div style={{ marginBottom: 16 }}>
                    <Row gutter={[8, 8]}>
                        <Col xs={24} sm={12} md={8}>
                            <Input 
                                placeholder="搜索微信ID、录入人..." 
                                prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />} 
                                value={searchText}
                                allowClear
                                style={{ borderRadius: '8px' }}
                                onChange={e => setSearchText(e.target.value)}
                            />
                        </Col>
                        {!isWechatOnly && (
                            <>
                                <Col xs={12} sm={6} md={4}>
                                    <Select 
                                        placeholder="处理状态" 
                                        style={{ width: '100%' }} 
                                        allowClear
                                        onChange={setStatusFilter}
                                    >
                                        <Select.Option value={0}>未处理</Select.Option>
                                        <Select.Option value={1}>已处理</Select.Option>
                                    </Select>
                                </Col>
                                <Col xs={12} sm={6} md={4}>
                                    <Select 
                                        placeholder="所有标签" 
                                        style={{ width: '100%' }} 
                                        allowClear
                                        onChange={setTagFilter}
                                    >
                                        <Select.Option value="外围">外围</Select.Option>
                                        <Select.Option value="同行">同行</Select.Option>
                                        <Select.Option value="骗子">骗子</Select.Option>
                                    </Select>
                                </Col>
                            </>
                        )}
                    </Row>
                </div>

                <Table 
                    columns={columns} 
                    dataSource={data} 
                    rowKey="id" 
                    loading={loading}
                    scroll={{ x: 'max-content' }}
                    size={window.innerWidth < 768 ? 'small' : 'middle'}
                    pagination={{ 
                        pageSize: 20,
                        size: 'small',
                        showTotal: total => `共 ${total} 条`
                    }}
                    style={{ borderRadius: '8px' }}
                />
            </Card>

            <Modal
                title="批量新增微信"
                open={isModalOpen}
                onCancel={() => setIsModalOpen(false)}
                onOk={handleBatchAdd}
                confirmLoading={submitting}
                okText="开始新增"
                width={window.innerWidth < 768 ? '95%' : 520}
                centered
            >
                <div style={{ marginBottom: 16 }}>
                    <div style={{ marginBottom: 8 }}>录入人：<Tag color="blue">{inputter}</Tag></div>
                </div>
                <div>
                    <div style={{ marginBottom: 8 }}>微信列表（支持空格、换行、逗号分隔）：</div>
                    <Input.TextArea 
                        rows={10} 
                        placeholder="例如：
wxid_123
wxid_456, wxid_789" 
                        value={batchText}
                        onChange={e => setBatchText(e.target.value)}
                    />
                </div>
            </Modal>
        </div>
    );
};

export default WechatListTable;
