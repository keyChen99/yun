import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Table, Button, Input, Modal, Select, Tag, Space, 
  message, Popconfirm, Popover, Radio, Collapse, Divider 
} from 'antd';
import { 
  PlusOutlined, MinusOutlined, DeleteOutlined, 
  RocketOutlined, TeamOutlined, CopyOutlined, 
  SettingOutlined, SearchOutlined 
} from '@ant-design/icons';

const MOBILE_TYPES = ["优酷", "淘宝", "大麦"];

const VirtualNumbersTable = ({ standalone = false }) => {
    const [data, setData] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(standalone ? 20 : 10);
    const [inputText, setInputText] = useState("");
    const [searchQuery, setSearchQuery] = useState("");
    const [fetchingSmsIds, setFetchingSmsIds] = useState(new Set());
    const [hasMobileFilter, setHasMobileFilter] = useState(null);
    const [hasNotesFilter, setHasNotesFilter] = useState(null);
    const [usageCountFilter, setUsageCountFilter] = useState(null);
    const [cancellationCountFilter, setCancellationCountFilter] = useState(null);
    const [copiedStatus, setCopiedStatus] = useState({});
    
    // 快捷工具状态
    const [quickTools, setQuickTools] = useState([]);
    const [isToolConfigVisible, setIsToolConfigVisible] = useState(false);
    const [editingToolId, setEditingToolId] = useState(null);

    // 手机号弹窗状态
    const [mobileModalVisible, setMobileModalVisible] = useState(false);
    const [currentEditingRecord, setCurrentEditingRecord] = useState(null);
    const [usedMobiles, setUsedMobiles] = useState([]);
    const [mobileLibrary, setMobileLibrary] = useState([]);
    const [selectedMobileType, setSelectedMobileType] = useState("优酷");
    const [selectedMobileNumber, setSelectedMobileNumber] = useState(null);
    const [shortcutMobileType, setShortcutMobileType] = useState("优酷");
    
    // 修复链接状态
    const [repairOldIp, setRepairOldIp] = useState("");
    const [repairNewIp, setRepairNewIp] = useState("");

    const loadData = useCallback(async (page, size, search = searchQuery, hasMobile = hasMobileFilter, usageCount = usageCountFilter, cancellationCount = cancellationCountFilter, hasNotes = hasNotesFilter) => {
        setLoading(true);
        try {
            const params = new URLSearchParams({ page, page_size: size });
            if (search) params.append("search", search);
            if (hasMobile !== null) params.append("has_mobile", hasMobile);
            if (usageCount !== null) params.append("usage_count", usageCount);
            if (cancellationCount !== null) params.append("cancellation_count", cancellationCount);
            if (hasNotes !== null) params.append("has_notes", hasNotes);

            const res = await fetch(`/api/virtual_numbers?${params.toString()}`, {
                headers: { "ngrok-skip-browser-warning": "true" }
            });
            const result = await res.json();
            setData(result.items || []);
            setTotal(result.total || 0);
            setCurrentPage(result.page || page);
            if (result.page_size) setPageSize(result.page_size);
        } catch (e) {
            message.error("加载数据失败");
        } finally {
            setLoading(false);
        }
    }, [searchQuery, hasMobileFilter, usageCountFilter, cancellationCountFilter, hasNotesFilter]);

    useEffect(() => {
        loadData(1, pageSize);
        fetchQuickTools();
    }, [loadData, pageSize]);

    const fetchQuickTools = async () => {
        try {
            const res = await fetch("/api/quick_copy_tools");
            const result = await res.json();
            if (Array.isArray(result)) {
                setQuickTools(result);
            } else {
                setQuickTools([]);
            }
        } catch (e) {
            setQuickTools([]);
        }
    };

    const fetchUsedMobiles = async () => {
        try {
            const res = await fetch("/api/virtual_numbers/used_mobiles");
            const result = await res.json();
            setUsedMobiles(result);
        } catch (e) {}
    };

    const fetchMobileLibrary = async () => {
        try {
            const res = await fetch("/api/mobile_library");
            const result = await res.json();
            setMobileLibrary(result.map(m => m.phone));
        } catch (e) {}
    };

    const handleFetchSms = async (record) => {
        const id = record.id;
        setFetchingSmsIds(prev => new Set(prev).add(id));
        try {
            const res = await fetch(`/api/virtual_numbers/${id}/sms`, { method: "POST" });
            const result = await res.json();
            if (result.status === "success") {
                message.success(result.msg);
                setData(prev => prev.map(item => item.id === id ? { ...item, sms_code: result.sms_code } : item));
            } else {
                message.error(result.msg);
            }
        } catch (e) {
            message.error("获取失败");
        } finally {
            setFetchingSmsIds(prev => {
                const next = new Set(prev);
                next.delete(id);
                return next;
            });
        }
    };

    const handleUpdateNotes = useCallback(async (id, notes) => {
        await fetch(`/api/virtual_numbers/${id}/notes`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ notes })
        });
        setData(prev => prev.map(item => item.id === id ? { ...item, notes } : item));
    }, []);

    const handleUpdateMachineCode = useCallback(async (id, machine_code) => {
        await fetch(`/api/virtual_numbers/${id}/machine_code`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ machine_code })
        });
        setData(prev => prev.map(item => item.id === id ? { ...item, machine_code } : item));
    }, []);

    const handleUpdateMobile = useCallback(async (id, mobile) => {
        await fetch(`/api/virtual_numbers/${id}/mobile`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mobile })
        });
        setData(prev => prev.map(item => item.id === id ? { ...item, mobile } : item));
        fetchUsedMobiles();
    }, []);

    const handleIncrement = useCallback(async (id) => {
        await fetch(`/api/virtual_numbers/${id}/increment`, { method: "POST" });
        setData(prev => prev.map(item => item.id === id ? { ...item, usage_count: (item.usage_count || 0) + 1 } : item));
    }, []);

    const handleDecrement = useCallback(async (id) => {
        await fetch(`/api/virtual_numbers/${id}/decrement`, { method: "POST" });
        setData(prev => prev.map(item => item.id === id ? { ...item, usage_count: Math.max(0, (item.usage_count || 0) - 1) } : item));
    }, []);

    const handleCancellationIncrement = useCallback(async (id) => {
        await fetch(`/api/virtual_numbers/${id}/cancellation/increment`, { method: "POST" });
        setData(prev => prev.map(item => item.id === id ? { ...item, cancellation_count: (item.cancellation_count || 0) + 1 } : item));
    }, []);

    const handleCancellationDecrement = useCallback(async (id) => {
        await fetch(`/api/virtual_numbers/${id}/cancellation/decrement`, { method: "POST" });
        setData(prev => prev.map(item => item.id === id ? { ...item, cancellation_count: Math.max(0, (item.cancellation_count || 0) - 1) } : item));
    }, []);

    const handleCopyTracked = useCallback((id, type, text, msg, e) => {
        if (window.copyPlainText) window.copyPlainText(e, text, msg);
        setCopiedStatus(prev => {
            const current = prev[id] || { phone: false, link: false };
            const updated = { ...current, [type]: true };
            if (updated.phone && updated.link) {
                handleIncrement(id);
                return { ...prev, [id]: { phone: false, link: false } };
            }
            return { ...prev, [id]: updated };
        });
    }, [handleIncrement]);

    const handleSearch = useCallback((value) => {
        setSearchQuery(value);
        loadData(1, pageSize, value, hasMobileFilter, usageCountFilter, cancellationCountFilter, hasNotesFilter);
    }, [pageSize, hasMobileFilter, usageCountFilter, cancellationCountFilter, hasNotesFilter, loadData]);

    const handleTableChange = useCallback((pagination) => {
        setCurrentPage(pagination.current);
        setPageSize(pagination.pageSize);
        loadData(pagination.current, pagination.pageSize, searchQuery, hasMobileFilter, usageCountFilter, cancellationCountFilter, hasNotesFilter);
    }, [searchQuery, hasMobileFilter, usageCountFilter, cancellationCountFilter, hasNotesFilter, loadData]);

    const handleBulkAdd = useCallback(async () => {
        if (!inputText.trim()) return;
        setLoading(true);
        try {
            const res = await fetch("/api/virtual_numbers/bulk", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text: inputText })
            });
            const result = await res.json();
            if (result.status === "success") {
                message.success(result.msg);
                setInputText("");
                setSearchQuery("");
                loadData(1, pageSize, "", null, null, null, null);
            } else {
                message.error(result.msg);
                setLoading(false);
            }
        } catch (e) {
            message.error("保存失败");
            setLoading(false);
        }
    }, [inputText, pageSize, loadData]);

    const handleClear = useCallback(async () => {
        try {
            const res = await fetch("/api/virtual_numbers/all/clear", { method: "DELETE" });
            const result = await res.json();
            if (result.status === "success") {
                message.success(result.msg);
                setSearchQuery("");
                loadData(1, pageSize, "", null, null, null, null);
            }
        } catch (e) {}
    }, [pageSize, loadData]);

    const handleRepairLinks = useCallback(async () => {
        if (!repairOldIp.trim() || !repairNewIp.trim()) {
            message.warning("请输入旧 IP 和新 IP");
            return;
        }
        try {
            const res = await fetch("/api/virtual_numbers/repair_links", { 
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ old_ip: repairOldIp, new_ip: repairNewIp })
            });
            const result = await res.json();
            if (result.status === "success") {
                message.success(result.msg);
                loadData(currentPage, pageSize, searchQuery, hasMobileFilter, usageCountFilter, cancellationCountFilter, hasNotesFilter);
            } else {
                message.error(result.msg);
            }
        } catch (e) {
            message.error("修复失败");
        }
    }, [repairOldIp, repairNewIp, currentPage, pageSize, searchQuery, hasMobileFilter, usageCountFilter, cancellationCountFilter, hasNotesFilter, loadData]);

    const handleDelete = useCallback(async (id) => {
        await fetch(`/api/virtual_numbers/${id}`, { 
            method: "DELETE",
            headers: { "ngrok-skip-browser-warning": "true" }
        });
        message.success("已删除");
        const targetPage = (data.length === 1 && currentPage > 1) ? currentPage - 1 : currentPage;
        loadData(targetPage, pageSize, searchQuery, hasMobileFilter, usageCountFilter, cancellationCountFilter, hasNotesFilter);
    }, [data.length, currentPage, pageSize, searchQuery, hasMobileFilter, usageCountFilter, cancellationCountFilter, hasNotesFilter, loadData]);

    const columns = useMemo(() => [
        { title: '#', key: 'index', width: 40, align: 'center', render: (_, __, index) => (currentPage - 1) * pageSize + index + 1 },
        { title: 'ID', dataIndex: 'id', key: 'id', width: 60, align: 'center', render: (id) => <span style={{ color: '#999', fontSize: '11px' }}>{id}</span> },
        { 
            title: '号码', 
            dataIndex: 'phone', 
            key: 'phone', 
            width: 130,
            align: 'center',
            render: (text, record) => (
                <div style={{ cursor: 'pointer', color: '#1890ff', fontWeight: 'bold' }} 
                     onClick={(e) => handleCopyTracked(record.id, 'phone', text, '号码已复制', e)}>
                    {text}
                </div>
            )
        },
        { 
            title: '链接', 
            dataIndex: 'link', 
            key: 'link',
            align: 'center',
            render: (text, record) => (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ 
                        cursor: 'pointer', 
                        color: '#52c41a', 
                        overflow: 'hidden', 
                        textOverflow: 'ellipsis', 
                        whiteSpace: 'nowrap',
                        maxWidth: standalone ? '200px' : '150px'
                    }} onClick={(e) => {
                        handleCopyTracked(record.id, 'link', text, '链接已复制', e);
                    }} title={text}>
                        {text && text.length > 10 ? text.substring(0, 10) + '...' : text}
                    </div>
                    <Button 
                        size="small" 
                        type="primary" 
                        ghost
                        loading={fetchingSmsIds.has(record.id)}
                        icon={<RocketOutlined />} 
                        onClick={() => handleFetchSms(record)}
                    >
                        {fetchingSmsIds.has(record.id) ? '获取中...' : '获取'}
                    </Button>
                </div>
            )
        },
        { 
            title: '验证码', 
            dataIndex: 'sms_code', 
            key: 'sms_code', 
            width: 120,
            align: 'center',
            render: (text) => text ? (
                <Tag color="magenta" style={{ fontSize: '14px', padding: '4px 8px', cursor: 'pointer', fontWeight: 'bold' }} onClick={(e) => window.copyPlainText(e, text, '验证码已复制')}>
                    {text}
                </Tag>
            ) : <span style={{ color: '#ccc' }}>-</span>
        },
        { 
            title: '次', 
            dataIndex: 'usage_count', 
            key: 'usage_count', 
            width: 80,
            align: 'center',
            render: (count, record) => (
                <Space size="small">
                    <Button size="small" shape="circle" icon={<PlusOutlined style={{ fontSize: '10px' }} />} onClick={() => handleIncrement(record.id)} />
                    <b style={{ minWidth: '15px', textAlign: 'center' }}>{count}</b>
                    <Button size="small" shape="circle" icon={<MinusOutlined style={{ fontSize: '10px' }} />} onClick={() => handleDecrement(record.id)} />
                </Space>
            )
        },
        { 
            title: '注销', 
            dataIndex: 'cancellation_count', 
            key: 'cancellation_count', 
            width: 80,
            align: 'center',
            render: (count, record) => (
                <Space size="small">
                    <Button size="small" shape="circle" icon={<PlusOutlined style={{ fontSize: '10px' }} />} onClick={() => handleCancellationIncrement(record.id)} />
                    <b style={{ minWidth: '15px', textAlign: 'center' }}>{count || 0}</b>
                    <Button size="small" shape="circle" icon={<MinusOutlined style={{ fontSize: '10px' }} />} onClick={() => handleCancellationDecrement(record.id)} />
                </Space>
            )
        },
        { 
            title: '机器码', 
            dataIndex: 'machine_code', 
            key: 'machine_code', 
            width: 150, 
            align: 'center',
            render: (text, record) => (
                <Input 
                    key={record.id + '_' + text}
                    size="small" 
                    defaultValue={text} 
                    onBlur={(e) => handleUpdateMachineCode(record.id, e.target.value)}
                    onPressEnter={(e) => handleUpdateMachineCode(record.id, e.target.value)}
                    placeholder="机器码"
                    style={{ border: 'none', background: 'transparent', textAlign: 'center' }}
                />
            )
        },
        { 
            title: '手机号', 
            dataIndex: 'mobile', 
            key: 'mobile', 
            width: 130, 
            align: 'center',
            render: (text, record) => {
                let displayText = "-";
                if (text && text.includes("-")) {
                    const [type, phone] = text.split("-");
                    const shortType = type === "优酷" ? "优" : (type === "淘宝" ? "淘" : type);
                    const last4 = phone.slice(-4);
                    displayText = `${shortType}-${last4}`;
                } else if (text) {
                    displayText = text.length > 4 ? text.slice(-4) : text;
                }

                return (
                    <div 
                        style={{ cursor: 'pointer', color: text ? '#1890ff' : '#ccc', fontWeight: text ? 'bold' : 'normal' }}
                        onClick={() => {
                             setCurrentEditingRecord(record);
                             fetchUsedMobiles();
                             fetchMobileLibrary();
                             if (text && text.includes("-")) {
                                 const [type, phone] = text.split("-");
                                 setSelectedMobileType(type);
                                 setSelectedMobileNumber(phone);
                             } else {
                                 setSelectedMobileType("优酷");
                                 setSelectedMobileNumber(null);
                             }
                             setMobileModalVisible(true);
                         }}
                    >
                        {displayText}
                    </div>
                );
            }
        },
        { 
            title: '备注', 
            dataIndex: 'notes', 
            key: 'notes', 
            width: 150, 
            align: 'center',
            render: (text, record) => (
                <Popover content={<div style={{ maxWidth: '300px', wordBreak: 'break-all' }}>{text || '无备注'}</div>} trigger="hover">
                    <Input 
                        key={record.id + '_' + text}
                        size="small" 
                        defaultValue={text} 
                        onBlur={(e) => handleUpdateNotes(record.id, e.target.value)}
                        onPressEnter={(e) => handleUpdateNotes(record.id, e.target.value)}
                        placeholder="备注"
                        style={{ border: 'none', background: 'transparent', textAlign: 'center' }}
                    />
                </Popover>
            )
        },
        {
            title: '操作',
            key: 'action',
            width: 60,
            align: 'center',
            render: (_, record) => (
                <Popconfirm title="确定删除吗？" onConfirm={() => handleDelete(record.id)}>
                    <Button type="link" size="small" danger icon={<DeleteOutlined />}></Button>
                </Popconfirm>
            )
        }
    ], [currentPage, pageSize, fetchingSmsIds, handleCopyTracked, handleFetchSms, handleIncrement, handleDecrement, handleCancellationIncrement, handleCancellationDecrement, handleDelete, handleUpdateNotes, handleUpdateMobile, handleUpdateMachineCode, standalone]);

    const shortcutMobileContent = (
        <div style={{ width: 220 }}>
            <Radio.Group 
                size="small" 
                value={shortcutMobileType} 
                onChange={e => setShortcutMobileType(e.target.value)}
                style={{ marginBottom: 12, display: 'flex', justifyContent: 'center' }}
            >
                {MOBILE_TYPES.map(t => <Radio.Button key={t} value={t}>{t}</Radio.Button>)}
            </Radio.Group>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '300px', overflowY: 'auto' }}>
                {mobileLibrary.map(n => {
                    const fullStr = `${shortcutMobileType}-${n}`;
                    const isUsed = usedMobiles.includes(fullStr);
                    return (
                        <div 
                            key={n} 
                            style={{ 
                                padding: '6px 10px', 
                                cursor: 'pointer', 
                                borderRadius: '4px',
                                background: isUsed ? '#fafafa' : '#f0f7ff',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                border: '1px solid #e6f7ff',
                                transition: 'all 0.3s'
                            }}
                            onClick={(e) => window.copyPlainText && window.copyPlainText(e, n, `${shortcutMobileType}手机号已复制`)}
                        >
                            <span style={{ 
                                color: isUsed ? '#ccc' : '#1890ff', 
                                fontWeight: isUsed ? 'normal' : 'bold',
                                textDecoration: isUsed ? 'line-through' : 'none'
                            }}>
                                {n}
                            </span>
                            <Tag color={isUsed ? 'default' : 'blue'} style={{ margin: 0, fontSize: '10px', transform: 'scale(0.85)' }}>
                                {isUsed ? '已用' : '可用'}
                            </Tag>
                        </div>
                    );
                })}
                {mobileLibrary.length === 0 && <div style={{ textAlign: 'center', color: '#ccc', padding: '10px' }}>库中暂无号码</div>}
            </div>
        </div>
    );

    return (
        <div style={{ background: '#fff', borderRadius: '12px', padding: standalone ? '20px' : '0' }}>
            <div style={{ marginBottom: 15, padding: '12px', background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: '8px' }}>
                <div style={{ fontSize: '12px', color: '#52c41a', marginBottom: '8px', fontWeight: 'bold' }}>⚡ 快捷复制工具：</div>
                <Space wrap>
                    <Popover 
                        content={shortcutMobileContent} 
                        title="手机号快捷复制" 
                        trigger="hover" 
                        placement="bottomLeft"
                        onOpenChange={(visible) => {
                            if (visible) {
                                fetchUsedMobiles();
                                fetchMobileLibrary();
                            }
                        }}
                    >
                        <Button size="small" type="primary" ghost icon={<TeamOutlined />}>手机号库</Button>
                    </Popover>
                    {quickTools.map(tool => (
                        <Button 
                            key={tool.id}
                            size="small" 
                            icon={<CopyOutlined />} 
                            style={{ 
                                color: tool.color || 'inherit', 
                                background: tool.bg_color || 'inherit',
                                border: tool.bg_color ? 'none' : '1px solid #d9d9d9'
                            }}
                            onClick={(e) => window.copyPlainText && window.copyPlainText(e, tool.content, `${tool.label}已复制`)}
                        >
                            {tool.label}
                        </Button>
                    ))}
                    <Button 
                        size="small" 
                        icon={<SettingOutlined />} 
                        onClick={() => setIsToolConfigVisible(true)}
                    >
                        配置工具
                    </Button>
                </Space>
            </div>

            <div style={{ marginBottom: 15, display: 'flex', gap: '15px', flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ flex: 1, minWidth: '200px' }}>
                    <Input.Search 
                        placeholder="输入号码/手机号/机器码搜索..." 
                        onSearch={handleSearch}
                        allowClear
                        enterButton
                    />
                </div>
                <Space wrap>
                    <Select 
                        value={hasMobileFilter} 
                        style={{ width: 110 }} 
                        placeholder="手机号筛选"
                        allowClear
                        onChange={(val) => {
                            const finalVal = val === undefined ? null : val;
                            setHasMobileFilter(finalVal);
                            loadData(1, pageSize, searchQuery, finalVal, usageCountFilter, cancellationCountFilter, hasNotesFilter);
                        }}
                    >
                        <Select.Option value={null}>全部手机号</Select.Option>
                        <Select.Option value={true}>有手机号</Select.Option>
                        <Select.Option value={false}>无手机号</Select.Option>
                    </Select>
                    <Select 
                        value={hasNotesFilter} 
                        style={{ width: 110 }} 
                        placeholder="备注筛选"
                        allowClear
                        onChange={(val) => {
                            const finalVal = val === undefined ? null : val;
                            setHasNotesFilter(finalVal);
                            loadData(1, pageSize, searchQuery, hasMobileFilter, usageCountFilter, cancellationCountFilter, finalVal);
                        }}
                    >
                        <Select.Option value={null}>全部备注</Select.Option>
                        <Select.Option value={true}>有备注</Select.Option>
                        <Select.Option value={false}>无备注</Select.Option>
                    </Select>
                    <Select 
                        value={usageCountFilter} 
                        style={{ width: 100 }} 
                        placeholder="次数筛选"
                        allowClear
                        onChange={(val) => {
                            const finalVal = val === undefined ? null : val;
                            setUsageCountFilter(finalVal);
                            loadData(1, pageSize, searchQuery, hasMobileFilter, finalVal, cancellationCountFilter, hasNotesFilter);
                        }}
                    >
                        <Select.Option value={null}>全部次数</Select.Option>
                        <Select.Option value={0}>0次</Select.Option>
                        <Select.Option value={1}>1次</Select.Option>
                        <Select.Option value={2}>2次</Select.Option>
                        <Select.Option value={3}>3次</Select.Option>
                    </Select>
                    <Select 
                        value={cancellationCountFilter} 
                        style={{ width: 100 }} 
                        placeholder="注销筛选"
                        allowClear
                        onChange={(val) => {
                            const finalVal = val === undefined ? null : val;
                            setCancellationCountFilter(finalVal);
                            loadData(1, pageSize, searchQuery, hasMobileFilter, usageCountFilter, finalVal, hasNotesFilter);
                        }}
                    >
                        <Select.Option value={null}>全部注销</Select.Option>
                        <Select.Option value={0}>0次</Select.Option>
                        <Select.Option value={1}>1次</Select.Option>
                        <Select.Option value={2}>2次</Select.Option>
                        <Select.Option value={3}>3次</Select.Option>
                    </Select>
                    <Button type="primary" onClick={() => {
                        setSearchQuery("");
                        setHasMobileFilter(null);
                        setHasNotesFilter(null);
                        setUsageCountFilter(null);
                        setCancellationCountFilter(null);
                        loadData(1, pageSize, "", null, null, null, null);
                    }}>刷新全部</Button>
                </Space>
            </div>

            <div style={{ marginBottom: 15 }}>
                <Collapse ghost size="small">
                    <Collapse.Panel header={<span style={{ fontSize: '13px', color: '#666' }}><PlusOutlined /> 批量添加虚拟号</span>} key="1">
                        <Space direction="vertical" style={{ width: '100%' }}>
                            <Input.TextArea 
                                placeholder="格式: 号码----链接" 
                                rows={standalone ? 4 : 2} 
                                value={inputText}
                                onChange={e => setInputText(e.target.value)}
                            />
                            <Space wrap>
                                <Button type="primary" size="small" onClick={handleBulkAdd}>开始保存</Button>
                                <Divider type="vertical" />
                                <Input 
                                    size="small" 
                                    placeholder="旧 IP" 
                                    style={{ width: 160 }} 
                                    value={repairOldIp}
                                    onChange={e => setRepairOldIp(e.target.value)}
                                />
                                <Input 
                                    size="small" 
                                    placeholder="新 IP" 
                                    style={{ width: 160 }} 
                                    value={repairNewIp}
                                    onChange={e => setRepairNewIp(e.target.value)}
                                />
                                <Button size="small" type="primary" ghost onClick={handleRepairLinks}>批量修复链接</Button>
                                <Popconfirm title="确定要清空全部虚拟号吗？" onConfirm={handleClear}>
                                    <Button size="small" danger>清空全部</Button>
                                </Popconfirm>
                            </Space>
                        </Space>
                    </Collapse.Panel>
                </Collapse>
            </div>

            <Table 
                columns={columns} 
                dataSource={data} 
                rowKey="id" 
                loading={loading}
                pagination={{ 
                    current: currentPage,
                    pageSize: pageSize,
                    total: total,
                    showSizeChanger: true,
                    pageSizeOptions: ['10', '20', '50', '100'],
                    showTotal: total => `共 ${total} 条`
                }}
                onChange={handleTableChange}
                scroll={{ x: 1200 }}
            />

            {/* 配置快捷工具弹窗 */}
            <Modal
                title="配置快捷复制工具"
                open={isToolConfigVisible}
                onCancel={() => setIsToolConfigVisible(false)}
                footer={null}
                width={600}
            >
                <div style={{ marginBottom: 20 }}>
                    <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => {
                        setEditingToolId(null);
                        // form handled via state
                    }}>新增工具</Button>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                    {quickTools.map(tool => (
                        <Tag 
                            key={tool.id} 
                            closable 
                            onClose={async (e) => {
                                e.preventDefault();
                                await fetch(`/api/quick_copy_tools/${tool.id}`, { method: 'DELETE' });
                                fetchQuickTools();
                            }}
                            onClick={() => {
                                setEditingToolId(tool.id);
                            }}
                            style={{ 
                                padding: '5px 10px', 
                                cursor: 'pointer',
                                background: tool.bg_color || '#f5f5f5',
                                color: tool.color || 'inherit',
                                border: editingToolId === tool.id ? '2px solid #1890ff' : '1px solid #d9d9d9'
                            }}
                         >
                             {tool.label}
                         </Tag>
                     ))}
                 </div>
            </Modal>

            {/* 手机号管理弹窗 */}
            <Modal
                title="分配手机号"
                open={mobileModalVisible}
                onCancel={() => setMobileModalVisible(false)}
                footer={null}
                width={400}
            >
                <div style={{ marginBottom: 15 }}>
                    <Radio.Group value={selectedMobileType} onChange={e => setSelectedMobileType(e.target.value)}>
                        {MOBILE_TYPES.map(t => <Radio.Button key={t} value={t}>{t}</Radio.Button>)}
                    </Radio.Group>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', maxHeight: '300px', overflowY: 'auto', padding: '10px' }}>
                    {mobileLibrary.map(num => {
                        const fullStr = `${selectedMobileType}-${num}`;
                        const isUsed = usedMobiles.includes(fullStr);
                        const isSelected = selectedMobileNumber === num;
                        return (
                            <Tag 
                                key={num}
                                color={isUsed ? 'default' : (isSelected ? 'blue' : 'processing')}
                                style={{ 
                                    cursor: isUsed ? 'not-allowed' : 'pointer',
                                    opacity: isUsed ? 0.5 : 1,
                                    border: isSelected ? '2px solid #1890ff' : '1px solid transparent'
                                }}
                                onClick={() => {
                                    if (!isUsed) {
                                        handleUpdateMobile(currentEditingRecord.id, fullStr);
                                        setMobileModalVisible(false);
                                    }
                                }}
                            >
                                {num}
                            </Tag>
                        );
                    })}
                </div>
            </Modal>
        </div>
    );
};

export default VirtualNumbersTable;
