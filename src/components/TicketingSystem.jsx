import React, { useState, useEffect } from 'react';
import { 
  Table, Button, Input, Modal, Select, Tag, Space, 
  message, Popconfirm, Row, Col, Form, Card 
} from 'antd';
import { 
  SearchOutlined, PlusOutlined, DeleteOutlined, 
  EditOutlined, HistoryOutlined, ReloadOutlined 
} from '@ant-design/icons';
import IdListRenderer from './IdListRenderer';

const TicketingSystem = ({ standalone = false }) => {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
    const [isAuthorized, setIsAuthorized] = useState(false);
    const [parsing, setParsing] = useState(false);
    const [localParsing, setLocalParsing] = useState(false);
    const [form] = Form.useForm();
    const [searchForm] = Form.useForm();
    const [editingId, setEditingId] = useState(null);
    const [parsedItems, setParsedItems] = useState([]);
    const [editingParsedIdx, setEditingParsedIdx] = useState(null);
    const [selectedRowKeys, setSelectedRowKeys] = useState([]);
    
    // ID 列表弹窗状态
    const [idListModalOpen, setIdListModalOpen] = useState(false);
    const [idListSearchData, setIdListSearchData] = useState([]);
    const [idListLoading, setIdListSearchLoading] = useState(false);
    const [idListKeyword, setIdListKeyword] = useState("");

    useEffect(() => {
        checkAuth();
        if (typeof window.hideLoading === 'function') {
            window.hideLoading();
        }
    }, []);

    const showIdListModal = async (keyword) => {
        setIdListKeyword(keyword);
        setIdListModalOpen(true);
        setIdListSearchLoading(true);
        try {
            const res = await fetch("/api/idlist", { headers: { "ngrok-skip-browser-warning": "true" } });
            const allData = await res.json();
            
            // 模拟 legacy.js 的过滤逻辑
            const kw = keyword.toLowerCase().trim();
            const keywords = kw.split(/\s+/).filter(k => k);
            const filtered = allData.filter(item => {
                const searchableText = [item.title || "", item.itemId || "", ...item.tickets.map(t => t.info || "")].join(" ").toLowerCase();
                return keywords.every(kw => {
                    if (searchableText.includes(kw)) return true;
                    try {
                        const pattern = kw.split('').map(char => char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*');
                        return new RegExp(pattern, 'i').test(searchableText);
                    } catch (e) { return false; }
                });
            });
            setIdListSearchData(filtered);
        } catch (e) {
            message.error("加载ID列表失败");
        } finally {
            setIdListSearchLoading(false);
        }
    };

    const checkAuth = async () => {
        // 1. 优先检查本地持久化
        const savedAuth = localStorage.getItem("ticketing_auth_passed");
        if (savedAuth === "true") {
            setIsAuthorized(true);
            loadData();
            return;
        }

        // 2. 检查后端环境（本地访问自动通过）
        const res = await fetch("/api/auth/check", {
            headers: { "ngrok-skip-browser-warning": "true" }
        });
        const result = await res.json();
        if (result.status === "success") {
            setIsAuthorized(true);
            localStorage.setItem("ticketing_auth_passed", "true");
            loadData();
        } else {
            setIsAuthModalOpen(true);
        }
    };

    const loadData = async (params = searchForm.getFieldsValue()) => {
        setLoading(true);
        try {
            const queryParams = new URLSearchParams();
            Object.keys(params).forEach(key => {
                if (params[key] !== undefined && params[key] !== null && params[key] !== "") {
                    queryParams.append(key, params[key]);
                }
            });
            const url = `/api/tickets_sys?${queryParams.toString()}`;
            const res = await fetch(url, { headers: { "ngrok-skip-browser-warning": "true" } });
            const result = await res.json();
            setData(result);
        } catch (e) {
            message.error("加载数据失败");
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = (values) => loadData(values);
    const handleReset = () => { searchForm.resetFields(); loadData({}); };

    const handleAuth = async (password) => {
        const res = await fetch("/api/auth", {
            method: "POST",
            headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" },
            body: JSON.stringify({ password })
        });
        const result = await res.json();
        if (result.status === "success") {
            setIsAuthorized(true);
            setIsAuthModalOpen(false);
            // 持久化存储认证状态
            localStorage.setItem("ticketing_auth_passed", "true");
            loadData();
        } else {
            message.error(result.msg);
        }
    };

    const handleSave = async (values) => {
        try {
            if (parsedItems.length > 0) {
                // 如果有解析列表，执行批量保存
                const res = await fetch("/api/tickets_sys/bulk", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" },
                    body: JSON.stringify({ items: parsedItems })
                });
                const result = await res.json();
                if (result.status === "success") {
                    message.success(result.msg);
                    setIsModalOpen(false);
                    setParsedItems([]);
                    setEditingParsedIdx(null);
                    loadData();
                }
            } else {
                // 普通保存（新增或编辑单条）
                const method = editingId ? "PUT" : "POST";
                const url = editingId ? `/api/tickets_sys/${editingId}` : "/api/tickets_sys";
                const res = await fetch(url, {
                    method,
                    headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" },
                    body: JSON.stringify(values)
                });
                const result = await res.json();
                if (result.status === "success") {
                    message.success(result.msg);
                    setIsModalOpen(false);
                    loadData();
                }
            }
        } catch (e) {
            message.error("保存失败");
        }
    };

    const handleFormValuesChange = (changedValues, allValues) => {
        if (editingParsedIdx !== null) {
            const newItems = [...parsedItems];
            newItems[editingParsedIdx] = { ...newItems[editingParsedIdx], ...allValues };
            setParsedItems(newItems);
        }
    };

    const handleDelete = async (id) => {
        await fetch(`/api/tickets_sys/${id}`, { method: "DELETE", headers: { "ngrok-skip-browser-warning": "true" } });
        message.success("已删除");
        loadData();
    };

    const handleBulkDelete = async () => {
        if (selectedRowKeys.length === 0) return;
        setLoading(true);
        try {
            const res = await fetch("/api/tickets_sys/bulk_delete", {
                method: "POST",
                headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" },
                body: JSON.stringify({ ids: selectedRowKeys })
            });
            const result = await res.json();
            if (result.status === "success") {
                message.success(result.msg);
                setSelectedRowKeys([]);
                loadData();
            } else {
                message.error(result.msg);
            }
        } catch (e) {
            message.error("批量删除失败");
        } finally {
            setLoading(false);
        }
    };

    const handleClearAll = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/tickets_sys/all/clear", {
                method: "DELETE",
                headers: { "ngrok-skip-browser-warning": "true" }
            });
            const result = await res.json();
            if (result.status === "success") {
                message.success(result.msg);
                setSelectedRowKeys([]);
                loadData();
            }
        } catch (e) {
            message.error("清空失败");
        } finally {
            setLoading(false);
        }
    };

    const handleStatusChange = async (id, status) => {
        await fetch(`/api/tickets_sys/${id}/status`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" },
            body: JSON.stringify({ status })
        });
        message.success("状态已更新");
        loadData();
    };

    const enrichItem = async (item) => {
        if (item.show_date && item.show_date.includes('号') && !item.show_date.includes('-')) {
            const day = item.show_date.match(/\d+/)[0];
            try {
                const res = await fetch("/api/idlist", { headers: { "ngrok-skip-browser-warning": "true" } });
                const idProjects = await res.json();
                const project = idProjects.find(p => (p.title || "").includes(item.show_name));
                if (project) {
                    const matched = project.tickets.find(t => t.info.includes(day));
                    if (matched) {
                        const fullDate = matched.info.match(/\d{4}-\d{2}-\d{2}/);
                        if (fullDate) item.show_date = fullDate[0];
                    }
                }
            } catch (e) {}
        }
        return item;
    };

    const localParse = async (input) => {
        if (!input || !input.trim()) return;
        setLocalParsing(true);
        setParsedItems([]);
        try {
            const res = await fetch("/api/local/parse", {
                method: "POST",
                headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" },
                body: JSON.stringify({ text: input })
            });
            const result = await res.json();
            if (result.status === "success" && result.data && result.data.length > 0) {
                const enrichedItems = await Promise.all(result.data.map(item => enrichItem(item)));
                setParsedItems(enrichedItems);
                setEditingParsedIdx(0);
                form.setFieldsValue({
                    ...enrichedItems[0],
                    status: enrichedItems[0].status || '待抢'
                });
                message.success(`成功识别到 ${enrichedItems.length} 组信息`);
            } else {
                message.error("本地解析未识别到有效信息");
            }
        } catch (e) {
            message.error("本地解析请求失败");
        } finally {
            setLocalParsing(false);
        }
    };

    const smartParse = async (input) => {
        if (!input || !input.trim()) return;
        
        setParsing(true);
        setParsedItems([]); // 清空上次结果
        try {
            // 1. 优先尝试使用 AI 接口解析
            const aiRes = await fetch("/api/ai/parse", {
                method: "POST",
                headers: { 
                    "Content-Type": "application/json",
                    "ngrok-skip-browser-warning": "true"
                },
                body: JSON.stringify({ text: input })
            });
            const aiResult = await aiRes.json();

            if (aiResult.status === "success" && aiResult.data && aiResult.data.length > 0) {
                const enrichedItems = await Promise.all(aiResult.data.map(item => enrichItem(item)));
                setParsedItems(enrichedItems);
                setEditingParsedIdx(0);
                
                // 填充第一组数据
                const firstItem = enrichedItems[0];
                form.setFieldsValue({
                    show_name: firstItem.show_name,
                    show_date: firstItem.show_date,
                    viewers: firstItem.viewers,
                    quantity: firstItem.quantity,
                    price: firstItem.price,
                    notes: firstItem.notes,
                    status: firstItem.status || '待抢',
                    config_code: firstItem.config_code || ''
                });
                message.success(`AI 智能识别完成，共 ${enrichedItems.length} 组`);
                setParsing(false);
                return;
            } else {
                console.warn("AI 解析不可用，切换到正则解析:", aiResult.msg);
            }
        } catch (err) {
            console.error("AI 接口调用异常:", err);
        }

        // 2. 正则兜底解析
        try {
            let showName = "";
            let showDate = "";
            let viewers = [];
            let quantity = 1;
            let price = "";
            let notes = [];

            const idPattern = /[1-9]\d{5}(?:18|19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx]/g;
            const namePattern = /[\u4e00-\u9fa5]{2,8}/g;
            const phonePattern = /1[3-9]\d{9}/g;
            
            const ids = input.match(idPattern) || [];
            const phones = input.match(phonePattern) || [];
            const ignoreWords = ["连坐", "连连", "五月天", "薛之谦", "咪豆", "太湖湾", "草莓", "音乐节", "演唱会", "早鸟", "预售", "普通", "单日", "双日"];
            const allNames = (input.match(namePattern) || []).filter(n => !ignoreWords.includes(n));
            
            const lines = input.split('\n');
            ids.forEach(id => {
                let foundName = "";
                for (let line of lines) {
                    if (line.includes(id)) {
                        const namesInLine = line.match(namePattern);
                        if (namesInLine) {
                            for (let n of namesInLine) {
                                if (!ignoreWords.includes(n)) {
                                    foundName = n;
                                    break;
                                }
                            }
                        }
                    }
                    if (foundName) break;
                }
                if (!foundName && allNames.length > 0) foundName = allNames.shift();
                viewers.push(`${foundName || "未知"} ${id}`);
            });
            quantity = ids.length || 1;

            const showKeywords = ["五月天", "薛之谦", "咪豆", "太湖湾", "草莓", "音乐节", "演唱会"];
            for (let kw of showKeywords) {
                if (input.includes(kw)) {
                    showName = kw;
                    break;
                }
            }
            if (!showName) showName = lines[0].split(/\d/)[0].trim();

            let tempInput = input;
            ids.forEach(id => tempInput = tempInput.replace(id, ""));
            phones.forEach(p => tempInput = tempInput.replace(p, ""));
            const priceMatches = tempInput.match(/(\d{3,4})(元)?/g);
            if (priceMatches) {
                const candidatePrices = priceMatches.filter(p => {
                    const val = parseInt(p);
                    return val >= 100 && val <= 5000;
                });
                if (candidatePrices.length > 0) price = candidatePrices[0];
            }

            const datePatterns = [/(\d{1,2})[月.](\d{1,2})/, /(\d{4})-(\d{2})-(\d{2})/, /(\d{4})\/(\d{2})\/(\d{2})/];
            for (let p of datePatterns) {
                const m = input.match(p);
                if (m) {
                    showDate = m[0];
                    break;
                }
            }

            if (!showDate) {
                const dayMatch = input.match(/(\d{1,2})号/);
                if (dayMatch) {
                    const day = dayMatch[1];
                    try {
                        const res = await fetch("/api/idlist", {
                            headers: { "ngrok-skip-browser-warning": "true" }
                        });
                        const idProjects = await res.json();
                        const project = idProjects.find(p => (p.title || "").includes(showName));
                        if (project) {
                            const matchedTickets = project.tickets.find(t => t.info.includes(day));
                            if (matchedTickets) {
                                const fullDateMatch = matchedTickets.info.match(/\d{4}-\d{2}-\d{2}/);
                                if (fullDateMatch) showDate = fullDateMatch[0];
                            }
                        }
                    } catch (e) {}
                    if (!showDate) showDate = dayMatch[0];
                }
            }

            phones.forEach(p => notes.push(p));
            const extraMatch = input.match(/(\d+🧧[^\s\n]*|佣金\d+|红包\d+)/);
            if (extraMatch) notes.push(extraMatch[0]);
            lines.forEach(line => {
                if (line.includes("连坐") || line.includes("一张") || line.includes("连连")) notes.push(line);
            });

            const resultItem = {
                show_name: showName,
                show_date: showDate,
                viewers: viewers.join('\n'),
                quantity: quantity,
                price: price,
                notes: [...new Set(notes)].join(' '),
                status: '待抢'
            };

            setParsedItems([resultItem]);
            setEditingParsedIdx(0);
            form.setFieldsValue(resultItem);
            message.success("智能识别完成 (正则模式)");
        } catch (err) {
            message.error("解析失败");
        } finally {
            setParsing(false);
        }
    };

    const columns = [
        { title: '#', key: 'index', width: 50, fixed: 'left', align: 'center', render: (_, __, index) => index + 1 },
        { 
            title: '演出名称', 
            dataIndex: 'show_name', 
            key: 'show_name', 
            width: 200, 
            align: 'center', 
            ellipsis: true, 
            render: (text) => (
                <div 
                    style={{ color: '#1890ff', cursor: 'pointer', fontWeight: 'bold' }} 
                    onClick={() => showIdListModal(text)}
                >
                    {text}
                </div>
            )
        },
        { title: '日期', dataIndex: 'show_date', key: 'show_date', width: 130, align: 'center' },
        { title: '观影人', dataIndex: 'viewers', key: 'viewers', width: 250, align: 'center', ellipsis: true, render: (text) => (<div style={{ whiteSpace: 'pre-wrap', fontSize: '13px', cursor: 'pointer' }} onClick={(e) => window.copyPlainText(e, text, '观影人信息已复制')}>{text}</div>) },
        { title: '配置码', dataIndex: 'config_code', key: 'config_code', width: 120, align: 'center', ellipsis: true, render: (text) => (<div style={{ cursor: 'pointer', color: '#1890ff' }} onClick={(e) => window.copyPlainText(e, text, '配置码已复制')}>{text || '-'}</div>) },
        { title: '数', dataIndex: 'quantity', key: 'quantity', width: 50, align: 'center' },
        { title: '价', dataIndex: 'price', key: 'price', width: 80, align: 'center' },
        { title: '状态', dataIndex: 'status', key: 'status', width: 100, align: 'center', render: (status, record) => (<Select value={status} onChange={(val) => handleStatusChange(record.id, val)} size="small" options={[{ value: '待抢', label: <Tag color="orange">待抢</Tag> }, { value: '完成', label: <Tag color="green">完成</Tag> }, { value: '退款', label: <Tag color="red">退款</Tag> }]} />) },
        { title: '备注', dataIndex: 'notes', key: 'notes', width: 150, align: 'center', ellipsis: true },
        { title: '操作', key: 'action', width: 130, fixed: 'right', align: 'center', render: (_, record) => (<Space size="small"><Button type="link" size="small" icon={<EditOutlined />} onClick={() => { setEditingId(record.id); form.setFieldsValue(record); setIsModalOpen(true); }}>编辑</Button><Popconfirm title="确定删除吗？" onConfirm={() => handleDelete(record.id)}><Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button></Popconfirm></Space>) },
    ];

    if (!isAuthorized) {
        return (
            <Modal title="身份认证" open={isAuthModalOpen} footer={null} closable={false}>
                <Input.Password placeholder="请输入管理密码" onPressEnter={(e) => handleAuth(e.target.value)} />
            </Modal>
        );
    }

    return (
        <div>
            <div style={{ marginBottom: 16, background: '#fff', padding: '20px 16px 4px 16px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                <Form form={searchForm} onFinish={handleSearch}>
                    <Row gutter={[12, 12]}>
                        <Col xs={12} sm={8} md={6}><Form.Item name="show_name"><Input placeholder="演出名称" allowClear /></Form.Item></Col>
                        <Col xs={12} sm={8} md={6}><Form.Item name="viewer"><Input placeholder="观影人" allowClear /></Form.Item></Col>
                        <Col xs={12} sm={8} md={4}><Form.Item name="status"><Select placeholder="状态" allowClear><Select.Option value="">全部</Select.Option><Select.Option value="待抢">待抢</Select.Option><Select.Option value="完成">完成</Select.Option><Select.Option value="退款">退款</Select.Option></Select></Form.Item></Col>
                        <Col xs={24} sm={24} md={8}>
                            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
                                <Button type="primary" icon={<SearchOutlined />} htmlType="submit">搜索</Button>
                                <Button onClick={handleReset}>重置</Button>
                                <Popconfirm title="确定要删除选中的数据吗？" onConfirm={handleBulkDelete} disabled={selectedRowKeys.length === 0}><Button danger disabled={selectedRowKeys.length === 0}>批量删除</Button></Popconfirm>
                                <Popconfirm title="确定清空？" onConfirm={handleClearAll}><Button danger type="dashed">清空全部</Button></Popconfirm>
                                <Button type="primary" style={{ background: '#52c41a' }} icon={<PlusOutlined />} onClick={() => { setEditingId(null); form.resetFields(); setIsModalOpen(true); }}>新增</Button>
                            </Space>
                        </Col>
                    </Row>
                </Form>
            </div>
            <Table columns={columns} dataSource={data} rowKey="id" loading={loading} rowSelection={{ selectedRowKeys, onChange: (keys) => setSelectedRowKeys(keys) }} pagination={{ pageSize: 10 }} scroll={{ x: 1300 }} />
            <Modal 
                title={editingId ? "编辑票务" : "新增票务"} 
                open={isModalOpen} 
                onCancel={() => { setIsModalOpen(false); setParsedItems([]); setEditingParsedIdx(null); }} 
                onOk={() => form.submit()} 
                width={parsedItems.length > 0 ? 1000 : 700} 
                destroyOnClose
                okText={parsedItems.length > 0 ? `批量保存 (${parsedItems.length})` : "保存"}
            >
                <Row gutter={24}>
                    {parsedItems.length > 0 && (
                        <Col span={8} style={{ borderRight: '1px solid #f0f0f0', maxHeight: '600px', overflowY: 'auto' }}>
                            <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontWeight: 'bold', color: '#1890ff' }}>识别到多组信息：</span>
                                <Button size="small" danger type="link" onClick={() => { setParsedItems([]); setEditingParsedIdx(null); }}>清空</Button>
                            </div>
                            {parsedItems.map((item, idx) => (
                                <Card 
                                    key={idx} 
                                    size="small" 
                                    hoverable 
                                    style={{ 
                                        marginBottom: 12, 
                                        cursor: 'pointer',
                                        border: editingParsedIdx === idx ? '2px solid #1890ff' : '1px solid #f0f0f0',
                                        background: editingParsedIdx === idx ? '#e6f7ff' : '#fff',
                                        boxShadow: editingParsedIdx === idx ? '0 2px 8px rgba(24,144,255,0.15)' : 'none',
                                        position: 'relative'
                                    }}
                                    onClick={() => {
                                        setEditingParsedIdx(idx);
                                        form.setFieldsValue({
                                            show_name: item.show_name,
                                            show_date: item.show_date,
                                            viewers: item.viewers,
                                            quantity: item.quantity,
                                            price: item.price,
                                            notes: item.notes,
                                            status: item.status || '待抢',
                                            config_code: item.config_code || ''
                                        });
                                    }}
                                >
                                    <Button 
                                        type="text" 
                                        danger 
                                        icon={<DeleteOutlined style={{ fontSize: '12px' }} />} 
                                        style={{ position: 'absolute', right: 4, top: 4, zIndex: 10 }}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            const newItems = parsedItems.filter((_, i) => i !== idx);
                                            setParsedItems(newItems);
                                            if (editingParsedIdx === idx) {
                                                setEditingParsedIdx(null);
                                                form.resetFields();
                                            } else if (editingParsedIdx > idx) {
                                                setEditingParsedIdx(editingParsedIdx - 1);
                                            }
                                        }}
                                    />
                                    <div style={{ fontSize: '12px', fontWeight: 'bold', marginBottom: 4, paddingRight: 20 }}>{item.show_name || '未命名项目'}</div>
                                    <div style={{ fontSize: '11px', color: '#666' }}>{item.show_date} | {item.quantity}张 | {item.price}元</div>
                                    <div style={{ fontSize: '11px', color: '#999', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {item.viewers}
                                    </div>
                                </Card>
                            ))}
                        </Col>
                    )}
                    <Col span={parsedItems.length > 0 ? 16 : 24}>
                        <div style={{ marginBottom: 20 }}>
                            <Input.TextArea placeholder="粘贴信息识别（支持多组信息同时提取）" rows={3} id="quickInputArea" style={{ marginBottom: 8 }} />
                            <Space style={{ width: '100%' }}>
                                <Button 
                                    type="primary" 
                                    block 
                                    loading={parsing}
                                    onClick={() => smartParse(document.getElementById('quickInputArea').value)}
                                >
                                    AI 提取
                                </Button>
                                <Button 
                                    block 
                                    loading={localParsing}
                                    onClick={() => localParse(document.getElementById('quickInputArea').value)}
                                >
                                    本地提取
                                </Button>
                            </Space>
                        </div>
                        <Form 
                            form={form} 
                            layout="vertical" 
                            onFinish={handleSave}
                            onValuesChange={handleFormValuesChange}
                        >
                            <Row gutter={16}>
                                <Col span={12}><Form.Item name="show_name" label="演出名称" rules={[{required:true}]}><Input /></Form.Item></Col>
                                <Col span={12}><Form.Item name="show_date" label="演出日期" rules={[{required:true}]}><Input /></Form.Item></Col>
                            </Row>
                            <Form.Item name="viewers" label="观影人信息"><Input.TextArea rows={4} /></Form.Item>
                            <Row gutter={16}>
                                <Col span={8}><Form.Item name="price" label="价格"><Input /></Form.Item></Col>
                                <Col span={8}><Form.Item name="quantity" label="数量"><Input type="number" /></Form.Item></Col>
                                <Col span={8}><Form.Item name="status" label="状态" initialValue="待抢"><Select options={[{value:'待抢',label:'待抢'},{value:'完成',label:'完成'},{value:'退款',label:'退款'}]} /></Form.Item></Col>
                            </Row>
                            <Form.Item name="config_code" label="配置码"><Input /></Form.Item>
                            <Form.Item name="notes" label="备注"><Input /></Form.Item>
                        </Form>
                    </Col>
                </Row>
            </Modal>
            
            <Modal
                title={
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>ID 列表搜索结果</span>
                        <Tag color="blue">{idListKeyword}</Tag>
                    </div>
                }
                open={idListModalOpen}
                onCancel={() => setIdListModalOpen(false)}
                footer={null}
                width={700}
                bodyStyle={{ maxHeight: '70vh', overflowY: 'auto', padding: '20px 10px' }}
                destroyOnClose
            >
                <div style={{ position: 'relative', minHeight: '200px' }}>
                    {idListLoading ? (
                        <div style={{ textAlign: 'center', padding: '50px' }}>加载中...</div>
                    ) : (
                        <IdListRenderer 
                            data={idListSearchData} 
                            isModal={true}
                            onUpdateTitle={async (itemId, newTitle) => {
                                try {
                                    const res = await fetch(`/api/idlist/${itemId}/title`, {
                                        method: 'PATCH',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ title: newTitle })
                                    });
                                    const result = await res.json();
                                    if (result.status === "success") {
                                        message.success("标题更新成功");
                                        // 刷新数据
                                        showIdListModal(idListKeyword);
                                    } else {
                                        message.error(result.msg);
                                    }
                                } catch (e) {
                                    message.error("更新失败");
                                }
                            }}
                            onDelete={async (itemId) => {
                                try {
                                    await fetch(`/api/idlist/${itemId}`, { 
                                        method: 'DELETE',
                                        headers: { "ngrok-skip-browser-warning": "true" } 
                                    });
                                    message.success("删除成功");
                                    // 重新刷新弹窗内数据
                                    showIdListModal(idListKeyword);
                                } catch (e) {
                                    message.error("删除失败");
                                }
                            }} 
                        />
                    )}
                </div>
            </Modal>
        </div>
    );
};

export default TicketingSystem;
