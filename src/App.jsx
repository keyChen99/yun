import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';
dayjs.extend(duration);
import { 
  Table, Button, Input, Modal, Form, Select, Tag, Space, 
  message, Popconfirm, Row, Col, Collapse, Radio, Divider, Popover, Card,
  Upload, DatePicker
} from 'antd';
import { 
  SearchOutlined, PlusOutlined, EditOutlined, DeleteOutlined, 
  RocketOutlined, CopyOutlined, LinkOutlined, MinusOutlined,
  HomeOutlined, DesktopOutlined, TeamOutlined, DatabaseOutlined,
  DashboardOutlined, SettingOutlined, FileImageOutlined, ClockCircleOutlined
} from '@ant-design/icons';
import { HashRouter, Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';

// 导入 App.css
import './App.css';
import ChatGenerator from './ChatGenerator';

// --- 路由辅助组件 ---
const LegacyViewWrapper = ({ viewId, onMount }) => {
    useEffect(() => {
        const view = document.getElementById(viewId);
        const title = document.querySelector('.title');
        if (view) {
            view.style.display = 'block';
            // 只有首页显示大标题
            if (title) title.style.display = viewId === 'homeView' ? 'block' : 'none';
            
            // 更新 legacy.js 的状态变量以便 SSE 同步
            if (typeof window.setCurrentView === 'function') {
                const legacyViewName = viewId.replace('View', '').toLowerCase();
                window.setCurrentView(legacyViewName);
            }

            if (onMount) onMount();
        }
        return () => {
            if (view) view.style.display = 'none';
        };
    }, [viewId, onMount]);
    return null;
};

const ViewWithTitle = ({ title, children, viewName }) => {
    useEffect(() => {
        const h1 = document.querySelector('.title');
        if (h1) h1.style.display = 'none';
        
        if (typeof window.setCurrentView === 'function') {
            window.setCurrentView(viewName);
        }
    }, [viewName]);

    return (
        <div style={{ margin: '0 auto', maxWidth: viewName === 'virtual_numbers' ? '1000px' : 'none', padding: '20px' }}>
            <div className="topbar">
                <Button className="back-btn" onClick={() => window.reactNavigate('/')}>返回</Button>
                <div className="topbar-title">{title}</div>
            </div>
            {children}
        </div>
    );
};

const MOBILE_TYPES = ["优酷", "淘宝"];

// 虚拟号表组件
const VirtualNumbersTable = ({ standalone = false }) => {
    const [data, setData] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [inputText, setInputText] = useState("");
    const [searchQuery, setSearchQuery] = useState("");
    const [hasMobileFilter, setHasMobileFilter] = useState(null); // null: all, true: has mobile, false: no mobile
    const [usageCountFilter, setUsageCountFilter] = useState(null);
    const [cancellationCountFilter, setCancellationCountFilter] = useState(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(standalone ? 20 : 5);
    const [fetchingSmsIds, setFetchingSmsIds] = useState(new Set());
    const [copiedStatus, setCopiedStatus] = useState({}); // { [id]: { phone: bool, link: bool } }
    const fetchTimers = useRef({});
    const isFetching = useRef(false);

    // 手机号弹窗状态
    const [mobileModalVisible, setMobileModalVisible] = useState(false);
    const [currentEditingRecord, setCurrentEditingRecord] = useState(null);
    const [selectedMobileType, setSelectedMobileType] = useState("优酷"); // 默认勾选优酷
    const [selectedMobileNumber, setSelectedMobileNumber] = useState(null);
    const [usedMobiles, setUsedMobiles] = useState([]); // 存储已被分配的手机号列表
    const [mobileLibrary, setMobileLibrary] = useState([]); // 存储库中的手机号
    const [newMobileInput, setNewMobileInput] = useState(""); // 新增手机号输入
    const [shortcutMobileType, setShortcutMobileType] = useState("优酷"); // 快捷工具中的类型选择
    const [quickTools, setQuickTools] = useState([]); // 快捷工具列表
    const [isToolConfigVisible, setIsToolConfigVisible] = useState(false); // 工具配置弹窗
    const [editingToolId, setEditingToolId] = useState(null); // 正在编辑的工具 ID
    const [toolForm] = Form.useForm();

    const fetchQuickTools = useCallback(async () => {
        try {
            const res = await fetch("/api/quick_copy_tools");
            const result = await res.json();
            setQuickTools(result || []);
        } catch (e) {
            console.error("加载快捷工具失败", e);
        }
    }, []);

    const handleSaveTool = async (values) => {
        try {
            const method = editingToolId ? "PUT" : "POST";
            const url = editingToolId ? `/api/quick_copy_tools/${editingToolId}` : "/api/quick_copy_tools";
            
            const res = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(values)
            });
            const result = await res.json();
            if (result.status === "success") {
                message.success(result.msg);
                toolForm.resetFields();
                setEditingToolId(null);
                fetchQuickTools();
            } else {
                message.error(result.msg);
            }
        } catch (e) {
            message.error("操作失败");
        }
    };

    const handleDeleteTool = async (id) => {
        try {
            const res = await fetch(`/api/quick_copy_tools/${id}`, { method: "DELETE" });
            const result = await res.json();
            if (result.status === "success") {
                message.success(result.msg);
                fetchQuickTools();
            }
        } catch (e) {
            message.error("删除失败");
        }
    };

    const fetchMobileLibrary = useCallback(async () => {
        try {
            const res = await fetch("/api/mobile_library");
            const result = await res.json();
            setMobileLibrary(result || []);
        } catch (e) {
            console.error("加载手机号库失败", e);
        }
    }, []);

    const handleAddMobileToLib = async () => {
        const phone = newMobileInput.trim();
        if (!phone) return;
        try {
            const res = await fetch("/api/mobile_library", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ phone })
            });
            const result = await res.json();
            if (result.status === "success") {
                message.success(result.msg);
                setNewMobileInput("");
                fetchMobileLibrary();
            } else {
                message.error(result.msg);
            }
        } catch (e) {
            message.error("添加失败");
        }
    };

    const handleDeleteMobileFromLib = async (phone) => {
        try {
            const res = await fetch(`/api/mobile_library/${phone}`, {
                method: "DELETE"
            });
            const result = await res.json();
            if (result.status === "success") {
                message.success(result.msg);
                fetchMobileLibrary();
                if (selectedMobileNumber === phone) {
                    setSelectedMobileNumber(null);
                }
            }
        } catch (e) {
            message.error("删除失败");
        }
    };

    const handleMoveMobileToTop = async (phone) => {
        try {
            const res = await fetch(`/api/mobile_library/${phone}/move_to_top`, {
                method: "POST"
            });
            const result = await res.json();
            if (result.status === "success") {
                message.success(result.msg);
                fetchMobileLibrary();
            }
        } catch (e) {
            message.error("操作失败");
        }
    };

    const fetchUsedMobiles = useCallback(async () => {
        try {
            const res = await fetch("/api/virtual_numbers/used_mobiles");
            const result = await res.json();
            if (result.status === "success") {
                setUsedMobiles(result.used || []);
            }
        } catch (e) {
            console.error("加载已用手机号失败", e);
        }
    }, []);

    const loadData = useCallback(async (page, size, search, hasMobile, usageCount, cancellationCount) => {
        const start = performance.now();
        console.log(`[Performance] loadData 开始: page=${page}, size=${size}, search=${search}, hasMobile=${hasMobile}, usageCount=${usageCount}, cancellationCount=${cancellationCount}`);
        
        if (isFetching.current) {
            console.log(`[Performance] loadData 跳过: 正在请求中...`);
            return;
        }
        isFetching.current = true;
        setLoading(true);
        try {
            const queryParams = new URLSearchParams({
                page: String(page),
                page_size: String(size)
            });
            if (search) queryParams.append("search", search);
            if (hasMobile !== null && hasMobile !== undefined) {
                queryParams.append("has_mobile", String(hasMobile));
            }
            if (usageCount !== null && usageCount !== undefined) {
                queryParams.append("usage_count", String(usageCount));
            }
            if (cancellationCount !== null && cancellationCount !== undefined) {
                queryParams.append("cancellation_count", String(cancellationCount));
            }
            
            console.log(`[Performance] fetch 发起: ${queryParams.toString()}`);
            const res = await fetch(`/api/virtual_numbers?${queryParams.toString()}`, {
                headers: { "ngrok-skip-browser-warning": "true" }
            });
            const result = await res.json();
            console.log(`[Performance] fetch 完成: 耗时 ${Math.round(performance.now() - start)}ms`);
            
            setData(result.items || []);
            setTotal(result.total || 0);
            setCurrentPage(page);
            setPageSize(size);
        } catch (e) {
            console.error("加载虚拟号数据失败", e);
            message.error("加载虚拟号数据失败");
        } finally {
            setLoading(false);
            isFetching.current = false;
        }
    }, []);

    useEffect(() => {
        loadData(currentPage, pageSize, searchQuery, hasMobileFilter, usageCountFilter, cancellationCountFilter);
        fetchUsedMobiles(); // 初始加载已用手机号
        fetchMobileLibrary(); // 初始加载手机号库
        fetchQuickTools(); // 初始加载快捷工具
        if (standalone) {
            window.refreshVirtualNumbers = () => {
                setSearchQuery("");
                setHasMobileFilter(null);
                setUsageCountFilter(null);
                setCancellationCountFilter(null);
                loadData(1, pageSize, "", null, null, null);
            };
        }
        if (typeof window.hideLoading === 'function') {
            window.hideLoading();
        }
        return () => {
            Object.values(fetchTimers.current).forEach(t => clearInterval(t));
        };
    }, [loadData]); // 添加 loadData 依赖

    const handleFetchSms = useCallback(async (record) => {
        if (fetchingSmsIds.has(record.id)) return;

        setFetchingSmsIds(prev => {
            const next = new Set(prev);
            next.add(record.id);
            return next;
        });

        message.info(`正在为 ${record.phone} 获取验证码，最长等待1分钟...`);
        
        const startTime = Date.now();
        const timeout = 60 * 1000; // 1分钟

        const timer = setInterval(async () => {
            if (Date.now() - startTime > timeout) {
                clearInterval(timer);
                setFetchingSmsIds(prev => {
                    const next = new Set(prev);
                    next.delete(record.id);
                    return next;
                });
                message.warning(`${record.phone} 获取验证码超时`);
                return;
            }

            try {
                const proxyUrl = `/api/virtual_numbers/proxy_fetch?url=${encodeURIComponent(record.link)}`;
                const res = await fetch(proxyUrl);
                const result = await res.json();

                if (result.status === "success") {
                    const content = result.content || "";
                    const match = content.match(/\b(\d{6})\b/);
                    if (match) {
                        const smsCode = match[1];
                        clearInterval(timer);
                        
                        await fetch(`/api/virtual_numbers/${record.id}/sms`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ sms_code: smsCode })
                        });

                        setFetchingSmsIds(prev => {
                            const next = new Set(prev);
                            next.delete(record.id);
                            return next;
                        });
                        
                        message.success(`${record.phone} 获取成功: ${smsCode}`);
                        // 局部更新数据，避免全局刷新
                        setData(prev => prev.map(item => item.id === record.id ? { ...item, sms_code: smsCode } : item));
                    }
                }
            } catch (err) {
                console.error("Fetch SMS error:", err);
            }
        }, 3000);

        fetchTimers.current[record.id] = timer;
    }, [fetchingSmsIds]);

    const handleUpdateNotes = useCallback(async (id, newNotes) => {
        try {
            await fetch(`/api/virtual_numbers/${id}/notes`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ notes: newNotes })
            });
            setData(prev => prev.map(item => item.id === id ? { ...item, notes: newNotes } : item));
        } catch (e) {
            message.error("更新备注失败");
        }
    }, []);

    const handleUpdateMobile = useCallback(async (id, newMobile) => {
        try {
            const res = await fetch(`/api/virtual_numbers/${id}/mobile`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mobile: newMobile })
            });
            const result = await res.json();
            if (result.status === "success") {
                if (result.deleted_count > 0) {
                    message.success(result.msg);
                    // 如果有删除，刷新整个列表以确保数据同步
                    loadData(currentPage, pageSize, searchQuery, hasMobileFilter, usageCountFilter, cancellationCountFilter);
                } else {
                    setData(prev => prev.map(item => item.id === id ? { ...item, mobile: newMobile } : item));
                }
                // 关键修复：分配成功后，立即同步已用手机号列表
                fetchUsedMobiles();
            }
        } catch (e) {
            message.error("更新手机号失败");
        }
    }, [currentPage, pageSize, searchQuery, hasMobileFilter, usageCountFilter, cancellationCountFilter, loadData]);

    const handleUpdateMachineCode = useCallback(async (id, newMachineCode) => {
        try {
            await fetch(`/api/virtual_numbers/${id}/machine_code`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ machine_code: newMachineCode })
            });
            setData(prev => prev.map(item => item.id === id ? { ...item, machine_code: newMachineCode } : item));
        } catch (e) {
            message.error("更新机器码失败");
        }
    }, []);

    const handleIncrement = useCallback(async (id) => {
        await fetch(`/api/virtual_numbers/${id}/increment`, { 
            method: "POST",
            headers: { "ngrok-skip-browser-warning": "true" }
        });
        setData(prev => prev.map(item => item.id === id ? { ...item, usage_count: Math.min(3, item.usage_count + 1) } : item));
    }, []);

    const handleDecrement = useCallback(async (id) => {
        await fetch(`/api/virtual_numbers/${id}/decrement`, { 
            method: "POST",
            headers: { "ngrok-skip-browser-warning": "true" }
        });
        setData(prev => prev.map(item => item.id === id ? { ...item, usage_count: Math.max(0, item.usage_count - 1) } : item));
    }, []);

    const handleCancellationIncrement = useCallback(async (id) => {
        await fetch(`/api/virtual_numbers/${id}/cancellation/increment`, { 
            method: "POST",
            headers: { "ngrok-skip-browser-warning": "true" }
        });
        // 增加注销数时，本地状态也同步清除手机号和机器码
        setData(prev => prev.map(item => item.id === id ? { 
            ...item, 
            cancellation_count: Math.min(3, (item.cancellation_count || 0) + 1), 
            mobile: '',
            machine_code: ''
        } : item));
        // 同步刷新已用手机号列表
        fetchUsedMobiles();
    }, [fetchUsedMobiles]);

    const handleCancellationDecrement = useCallback(async (id) => {
        await fetch(`/api/virtual_numbers/${id}/cancellation/decrement`, { 
            method: "POST",
            headers: { "ngrok-skip-browser-warning": "true" }
        });
        setData(prev => prev.map(item => item.id === id ? { ...item, cancellation_count: Math.max(0, (item.cancellation_count || 0) - 1) } : item));
    }, []);

    const handleCopyTracked = useCallback((id, type, text, msg, e) => {
        window.copyPlainText(e, text, msg);
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
        loadData(1, pageSize, value, hasMobileFilter, usageCountFilter, cancellationCountFilter);
    }, [pageSize, hasMobileFilter, usageCountFilter, cancellationCountFilter, loadData]);

    const handleTableChange = useCallback((pagination) => {
        console.log(`[Performance] handleTableChange: current=${pagination.current}, pageSize=${pagination.pageSize}`);
        // 立即更新分页状态，让 UI 实时响应，而不是等到请求结束
        setCurrentPage(pagination.current);
        setPageSize(pagination.pageSize);
        loadData(pagination.current, pagination.pageSize, searchQuery, hasMobileFilter, usageCountFilter, cancellationCountFilter);
    }, [searchQuery, hasMobileFilter, usageCountFilter, cancellationCountFilter, loadData]);

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
                loadData(1, pageSize, "", null, null, null);
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
                loadData(1, pageSize, "", null, null, null);
            }
        } catch (e) {}
    }, [pageSize, loadData]);

    const handleDelete = useCallback(async (id) => {
        await fetch(`/api/virtual_numbers/${id}`, { 
            method: "DELETE",
            headers: { "ngrok-skip-browser-warning": "true" }
        });
        message.success("已删除");
        const targetPage = (data.length === 1 && currentPage > 1) ? currentPage - 1 : currentPage;
        loadData(targetPage, pageSize, searchQuery, hasMobileFilter, usageCountFilter, cancellationCountFilter);
    }, [data.length, currentPage, pageSize, searchQuery, hasMobileFilter, usageCountFilter, cancellationCountFilter, loadData]);

    const columns = useMemo(() => [
        { title: '#', key: 'index', width: 40, align: 'center', render: (_, __, index) => (currentPage - 1) * pageSize + index + 1 },
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
                // 格式化展示：优-后4位 或 淘-后4位
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
                              fetchUsedMobiles(); // 打开前刷新已用手机号列表
                              fetchMobileLibrary(); // 打开前刷新库中的手机号
                              if (text && text.includes("-")) {
                                 const [type, phone] = text.split("-");
                                 setSelectedMobileType(type);
                                 setSelectedMobileNumber(phone);
                             } else {
                                 setSelectedMobileType("优酷"); // 默认优酷
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
    ], [currentPage, pageSize, fetchingSmsIds, handleCopyTracked, handleFetchSms, handleIncrement, handleDecrement, handleCancellationIncrement, handleCancellationDecrement, handleDelete, handleUpdateNotes, handleUpdateMobile]);

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
                            onClick={(e) => window.copyPlainText(e, n, `${shortcutMobileType}手机号已复制`)}
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
                            onClick={(e) => window.copyPlainText(e, tool.content, `${tool.label}已复制`)}
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
                            loadData(1, pageSize, searchQuery, finalVal, usageCountFilter, cancellationCountFilter);
                        }}
                    >
                        <Select.Option value={null}>全部手机号</Select.Option>
                        <Select.Option value={true}>有手机号</Select.Option>
                        <Select.Option value={false}>无手机号</Select.Option>
                    </Select>
                    <Select 
                        value={usageCountFilter} 
                        style={{ width: 100 }} 
                        placeholder="次数筛选"
                        allowClear
                        onChange={(val) => {
                            const finalVal = val === undefined ? null : val;
                            setUsageCountFilter(finalVal);
                            loadData(1, pageSize, searchQuery, hasMobileFilter, finalVal, cancellationCountFilter);
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
                            loadData(1, pageSize, searchQuery, hasMobileFilter, usageCountFilter, finalVal);
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
                        setUsageCountFilter(null);
                        setCancellationCountFilter(null);
                        loadData(1, pageSize, "", null, null, null);
                    }}>刷新全部</Button>
                </Space>
            </div>

            <div style={{ marginBottom: 15 }}>
                <Collapse ghost size="small">
                    <Collapse.Panel header={<span style={{ fontSize: '13px', color: '#666' }}><PlusOutlined /> 批量添加虚拟号</span>} key="1">
                        <Input.TextArea 
                            placeholder="格式: 号码----链接" 
                            rows={standalone ? 4 : 2} 
                            value={inputText}
                            onChange={e => setInputText(e.target.value)}
                            style={{ marginBottom: 10 }}
                        />
                        <Space>
                            <Button type="primary" size="small" onClick={handleBulkAdd}>开始保存</Button>
                            <Popconfirm title="确定要清空全部虚拟号吗？" onConfirm={handleClear}>
                                <Button size="small" danger>清空全部</Button>
                            </Popconfirm>
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
                    showTotal: (total) => `共 ${total} 条`,
                    size: 'small'
                }}
                onChange={handleTableChange}
                size="small"
                scroll={standalone ? undefined : { x: 600 }}
            />

            <Modal
                title="选择手机号"
                open={mobileModalVisible}
                onCancel={() => setMobileModalVisible(false)}
                onOk={async (e) => {
                    if (!selectedMobileType || !selectedMobileNumber) {
                        message.warning("请选择类型和手机号");
                        return;
                    }
                    const fullValue = `${selectedMobileType}-${selectedMobileNumber}`;
                    await handleUpdateMobile(currentEditingRecord.id, fullValue);
                    // 分配成功后自动复制手机号
                    window.copyPlainText(e, selectedMobileNumber, "手机号已分配并复制");
                    setMobileModalVisible(false);
                }}
                width={400}
                destroyOnClose
            >
                <div style={{ marginBottom: 20 }}>
                     <div style={{ fontWeight: 'bold', marginBottom: 10 }}>类型：</div>
                     <Radio.Group 
                         value={selectedMobileType} 
                         onChange={e => setSelectedMobileType(e.target.value)}
                     >
                         {MOBILE_TYPES.map(t => (
                             <Radio.Button key={t} value={t}>{t}</Radio.Button>
                         ))}
                     </Radio.Group>
                 </div>

                 <Divider style={{ margin: '12px 0' }} />

                 <div style={{ marginBottom: 15 }}>
                     <div style={{ fontWeight: 'bold', marginBottom: 10 }}>管理库：</div>
                     <Space.Compact style={{ width: '100%' }}>
                        <Input 
                            placeholder="输入新手机号" 
                            value={newMobileInput}
                            onChange={e => setNewMobileInput(e.target.value)}
                            onPressEnter={handleAddMobileToLib}
                        />
                        <Button type="primary" icon={<PlusOutlined />} onClick={handleAddMobileToLib}>添加</Button>
                     </Space.Compact>
                 </div>

                 <div>
                     <div style={{ fontWeight: 'bold', marginBottom: 10 }}>手机号：</div>
                     <Radio.Group 
                         value={selectedMobileNumber} 
                         onChange={e => setSelectedMobileNumber(e.target.value)}
                         style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
                     >
                         {mobileLibrary.map(n => {
                             const fullStr = `${selectedMobileType}-${n}`;
                             const isUsed = usedMobiles.includes(fullStr);
                             const isCurrentSelected = currentEditingRecord?.mobile === fullStr;
                             
                             return (
                                 <div key={n} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                     <Radio 
                                         value={n}
                                         style={{
                                             color: (isUsed && !isCurrentSelected) ? '#ccc' : 'inherit',
                                             textDecoration: (isUsed && !isCurrentSelected) ? 'line-through' : 'none'
                                         }}
                                     >
                                         {n} {(isUsed && !isCurrentSelected) ? '(已占用)' : ''}
                                     </Radio>
                                     <Space>
                                         <Button 
                                             type="text" 
                                             size="small" 
                                             icon={<RocketOutlined />} 
                                             title="置顶（优先分配）"
                                             onClick={(e) => {
                                                 e.stopPropagation();
                                                 handleMoveMobileToTop(n);
                                             }}
                                         />
                                         <Button 
                                             type="text" 
                                             danger 
                                             size="small" 
                                             icon={<DeleteOutlined />} 
                                             onClick={(e) => {
                                                 e.stopPropagation();
                                                 handleDeleteMobileFromLib(n);
                                             }}
                                         />
                                     </Space>
                                 </div>
                             );
                         })}
                     </Radio.Group>
                 </div>
             </Modal>

             <Modal
                 title="配置快捷工具"
                 open={isToolConfigVisible}
                 onCancel={() => {
                    setIsToolConfigVisible(false);
                    setEditingToolId(null);
                    toolForm.resetFields();
                 }}
                 onOk={() => toolForm.submit()}
                 width={600}
                 destroyOnClose
             >
                 <div style={{ marginBottom: 20 }}>
                     <div style={{ fontWeight: 'bold', marginBottom: 10 }}>{editingToolId ? '编辑工具：' : '新增工具：'}</div>
                     <Form form={toolForm} layout="inline" onFinish={handleSaveTool}>
                         <Form.Item name="label" rules={[{required: true, message: '请输入标签'}]}>
                             <Input placeholder="按钮标签" style={{ width: 120 }} />
                         </Form.Item>
                         <Form.Item name="content" rules={[{required: true, message: '请输入内容'}]}>
                             <Input placeholder="复制内容" style={{ width: 150 }} />
                         </Form.Item>
                         <Form.Item name="bg_color">
                             <Input placeholder="背景色(如 #722ed1)" style={{ width: 130 }} />
                         </Form.Item>
                         <Form.Item name="color">
                             <Input placeholder="文字色(如 #fff)" style={{ width: 130 }} />
                         </Form.Item>
                         <Form.Item>
                             <Space>
                                 <Button type="primary" htmlType="submit">{editingToolId ? '更新' : '添加'}</Button>
                                 {editingToolId && (
                                     <Button onClick={() => {
                                         setEditingToolId(null);
                                         toolForm.resetFields();
                                     }}>取消</Button>
                                 )}
                             </Space>
                         </Form.Item>
                     </Form>
                 </div>
                 <Divider />
                 <div style={{ fontWeight: 'bold', marginBottom: 10 }}>现有工具列表 (点击标签可编辑)：</div>
                 <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                     {quickTools.map(tool => (
                         <Tag 
                            key={tool.id} 
                            closable 
                            onClose={(e) => {
                                e.preventDefault();
                                handleDeleteTool(tool.id);
                            }}
                            onClick={() => {
                                setEditingToolId(tool.id);
                                toolForm.setFieldsValue({
                                    label: tool.label,
                                    content: tool.content,
                                    bg_color: tool.bg_color,
                                    color: tool.color
                                });
                            }}
                            style={{ 
                                padding: '5px 10px', 
                                cursor: 'pointer',
                                display: 'flex', 
                                alignItems: 'center',
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
         </div>
     );
 };

// ID 列表核心渲染组件
const IdListRenderer = ({ data, onDelete, isModal = false }) => {
    const dateColors = ['#1890ff', '#52c41a', '#f5222d', '#fa8c16', '#722ed1', '#13c2c2', '#eb2f96'];
    
    if (!data || data.length === 0) {
        return <div style={{ textAlign: 'center', padding: '20px', color: '#666' }}>暂无ID列表数据</div>;
    }

    const escapeHtml = (text) => {
        return String(text || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
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
                                        <div className="viewer-text" style={{ fontSize: '16px', color: '#1890ff', whiteSpace: 'normal', wordBreak: 'break-all' }}>{item.title}</div>
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
                                                <div className="viewer-text" style={{ fontSiz: '14px', color: color }} dangerouslySetInnerHTML={{ __html: displayInfo }}></div>
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

// 票务系统组件
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

    const handleUpdateParsedItem = (idx, updatedItem) => {
        const newItems = [...parsedItems];
        newItems[idx] = { ...newItems[idx], ...updatedItem };
        setParsedItems(newItems);
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
            <Modal title="身份认证" open={isAuthModalOpen} footer={null} closable={false}><Input.Password placeholder="请输入管理密码" onPressEnter={(e) => handleAuth(e.target.value)} /></Modal>
            
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
                            onDelete={async (itemId) => {
                                try {
                                    await fetch(`/api/idlist/${itemId}`, { headers: { "ngrok-skip-browser-warning": "true" } });
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

// --- 演出日程管理组件 ---
const ShowScheduleModule = () => {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [parsing, setParsing] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [pendingShows, setPendingShows] = useState([]); // 待保存的演出列表

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
    }, [fetchData]);

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
                        <Button size="small" type="link" danger icon={<DeleteOutlined />}>删除</Button>
                    </Popconfirm>
                </Space>
            )
        }
    ];

    return (
        <div className="ticketing-container">
            <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => {
                    setEditingId(null);
                    setPendingShows([{ tempId: Date.now(), show_name: '', sale_time: null }]);
                    setIsModalOpen(true);
                }}>新增演出</Button>
                <Button icon={<DashboardOutlined />} onClick={fetchData}>刷新列表</Button>
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

// --- 全局倒计时悬浮组件 ---
const CountdownFloating = () => {
    const [allFutureShows, setAllFutureShows] = useState([]);
    const [timeLefts, setTimeLefts] = useState({});
    const [isExpanded, setIsExpanded] = useState(false);
    const timerRef = useRef(null);

    const updateShows = useCallback(async () => {
        try {
            const res = await fetch("/api/shows");
            const allShows = await res.json();
            const now = dayjs();
            
            // 过滤并排序未来的演出
            const futureShows = allShows
                .filter(s => dayjs(s.sale_time).isAfter(now))
                .sort((a, b) => dayjs(a.sale_time).diff(dayjs(b.sale_time)));
            
            setAllFutureShows(futureShows);
        } catch (e) {
            console.error("Fetch shows failed", e);
        }
    }, []);

    useEffect(() => {
        updateShows();
        window.addEventListener('shows-updated', updateShows);
        const fetchTimer = setInterval(updateShows, 30000);
        return () => {
            window.removeEventListener('shows-updated', updateShows);
            clearInterval(fetchTimer);
        };
    }, [updateShows]);

    useEffect(() => {
        if (timerRef.current) clearInterval(timerRef.current);
        
        timerRef.current = setInterval(() => {
            const now = dayjs();
            const newTimeLefts = {};
            allFutureShows.forEach(show => {
                const diff = dayjs(show.sale_time).diff(now);
                if (diff <= 0) {
                    newTimeLefts[show.id] = "已开票";
                } else {
                    const dur = dayjs.duration(diff);
                    const days = Math.floor(dur.asDays());
                    const hours = dur.hours();
                    const minutes = dur.minutes();
                    const seconds = dur.seconds();
                    
                    let str = "";
                    if (days > 0) str += `${days}天`;
                    str += `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
                    newTimeLefts[show.id] = str;
                }
            });
            setTimeLefts(newTimeLefts);
        }, 1000);

        return () => clearInterval(timerRef.current);
    }, [allFutureShows]);

    if (allFutureShows.length === 0) return null;

    const mainShow = allFutureShows[0];

    return (
        <div 
            className="countdown-floating" 
            onClick={() => setIsExpanded(!isExpanded)}
        >
            <div className="countdown-single-line">
                <div className="countdown-name">{mainShow.show_name}</div>
                <div className="countdown-time">{timeLefts[mainShow.id] || '--:--:--'}</div>
                {allFutureShows.length > 1 && (
                    <div className="countdown-expand-icon">
                        {isExpanded ? <MinusOutlined /> : <PlusOutlined />}
                    </div>
                )}
            </div>
            
            {isExpanded && allFutureShows.length > 1 && (
                <div className="countdown-list">
                    {allFutureShows.slice(1).map(show => (
                        <div key={show.id} className="countdown-item">
                            <div className="countdown-name">{show.show_name}</div>
                            <div className="countdown-time">{timeLefts[show.id] || '--:--:--'}</div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

// --- 导航布局组件 ---
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

const Layout = ({ children }) => {
    const navigate = useNavigate();
    const location = useLocation();

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
            <CountdownFloating />
            <CloudShortcutTool />
            {children}
        </div>
    );
};

export default function App() {
    return (
        <HashRouter>
            <Layout>
                <Routes>
                    <Route path="/" element={<LegacyViewWrapper viewId="homeView" />} />
                    <Route path="/inventory" element={<LegacyViewWrapper viewId="inventoryView" onMount={() => window.loadInventory && window.loadInventory()} />} />
                    <Route path="/viewers" element={<LegacyViewWrapper viewId="viewersView" onMount={() => window.loadViewers && window.loadViewers()} />} />
                    <Route path="/idlist" element={<LegacyViewWrapper viewId="idListView" onMount={() => window.loadIdList && window.loadIdList()} />} />
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
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </Layout>
        </HashRouter>
    );
}
