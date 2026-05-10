import React, { useState, useRef, useEffect } from 'react';
import { 
  Card, Row, Col, Input, Button, Upload, 
  Select, Tag, Space, List, Avatar, Divider, message,
  Switch, InputNumber
} from 'antd';
import { 
  PlusOutlined, DeleteOutlined, UserOutlined, 
  ArrowLeftOutlined, MoreOutlined, SmileOutlined,
  PictureOutlined, CameraOutlined, SendOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';

const { TextArea } = Input;

// 默认头像
const DEFAULT_AVATARS = {
  left: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix',
  right: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Aria'
};

const ChatGenerator = () => {
  const [messages, setMessages] = useState([
    {
      id: 1,
      type: 'time',
      content: '10:05',
    },
    {
      id: 2,
      role: 'left',
      type: 'text',
      content: '你好，在吗？',
      avatar: DEFAULT_AVATARS.left,
      nickname: '小王'
    },
    {
      id: 3,
      role: 'right',
      type: 'text',
      content: '在的，怎么了？',
      avatar: DEFAULT_AVATARS.right,
      nickname: '我'
    },
    {
      id: 4,
      type: 'system',
      content: '对方已开启了好友验证，[发送朋友验证]'
    }
  ]);

  const [chatConfig, setChatConfig] = useState({
    title: '微信好友',
    showNickname: false,
    leftAvatar: DEFAULT_AVATARS.left,
    rightAvatar: DEFAULT_AVATARS.right,
    leftNickname: '小王',
    rightNickname: '我',
    battery: 85,
    showBattery: true,
    network: 'WiFi'
  });

  const [editingMsg, setEditingMsg] = useState({
    role: 'left',
    type: 'text',
    content: '',
    time: dayjs().format('HH:mm')
  });

  const [isExporting, setIsExporting] = useState(false);

  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleAddMessage = () => {
    if (!editingMsg.content && editingMsg.type === 'text') {
      message.warning('请输入内容');
      return;
    }

    const newMsg = {
      id: Date.now(),
      ...editingMsg,
      avatar: editingMsg.role === 'left' ? chatConfig.leftAvatar : chatConfig.rightAvatar,
      nickname: editingMsg.role === 'left' ? chatConfig.leftNickname : chatConfig.rightNickname
    };

    setMessages([...messages, newMsg]);
    setEditingMsg({ ...editingMsg, content: '', type: 'text' });
  };

  const handleAddImage = (info) => {
    if (info.file.status === 'done' || info.file.originFileObj) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64 = e.target.result;
        const newMsg = {
          id: Date.now(),
          role: editingMsg.role,
          type: 'image',
          content: base64,
          avatar: editingMsg.role === 'left' ? chatConfig.leftAvatar : chatConfig.rightAvatar,
          nickname: editingMsg.role === 'left' ? chatConfig.leftNickname : chatConfig.rightNickname
        };
        setMessages([...messages, newMsg]);
      };
      reader.readAsDataURL(info.file.originFileObj);
    }
  };

  const handleAddTime = () => {
    const newMsg = {
      id: Date.now(),
      type: 'time',
      content: editingMsg.time
    };
    setMessages([...messages, newMsg]);
  };

  const handleAddSystem = () => {
    const newMsg = {
      id: Date.now(),
      type: 'system',
      content: editingMsg.content || '系统提示信息'
    };
    setMessages([...messages, newMsg]);
  };

  const handleDeleteMessage = (id) => {
    setMessages(messages.filter(m => m.id !== id));
  };

  const handleAvatarChange = (role, info) => {
    // antd Upload 组件在 beforeUpload 返回 false 时，文件在 info.file 中
    const file = info.file.originFileObj || info.file;
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64 = e.target.result;
        setChatConfig(prev => ({
          ...prev,
          [`${role}Avatar`]: base64
        }));
        // 同时更新消息中的头像
        setMessages(prev => prev.map(m => 
          m.role === role ? { ...m, avatar: base64 } : m
        ));
        message.success('头像修改成功');
      };
      reader.readAsDataURL(file);
    }
  };

  const getBatteryColor = (level) => {
    if (level > 20) return '#09bb07'; // 微信绿色
    if (level > 10) return '#f0ad4e'; // 微信橙色
    return '#fa5151'; // 微信红色 (更准确的微信红)
  };

  return (
    <div className="chat-generator-container" style={{ padding: '20px', background: '#f0f2f5', minHeight: '100vh' }}>
      <Row gutter={24}>
        {/* 左侧：编辑区 */}
        <Col xs={24} md={10}>
          <Card title="信息编辑" bordered={false} style={{ marginBottom: 20 }}>
            <Divider orientation="left">全局配置</Divider>
            <div className="chat-form-layout">
              <div style={{ marginBottom: 15 }}>
                <span>聊天标题: </span>
                <Input 
                  value={chatConfig.title} 
                  onChange={e => setChatConfig({...chatConfig, title: e.target.value})}
                  style={{ width: 200 }}
                />
              </div>
              <Row gutter={16} style={{ marginBottom: 15 }}>
                <Col span={12}>
                  <span>电量: </span>
                  <InputNumber 
                    min={0} max={100} 
                    value={chatConfig.battery} 
                    onChange={val => setChatConfig({...chatConfig, battery: val})}
                    style={{ width: 60 }}
                  /> %
                </Col>
                <Col span={12}>
                  <span>网络: </span>
                  <Select 
                    value={chatConfig.network} 
                    onChange={val => setChatConfig({...chatConfig, network: val})}
                    style={{ width: 80 }}
                  >
                    <Select.Option value="WiFi">WiFi</Select.Option>
                    <Select.Option value="5G">5G</Select.Option>
                    <Select.Option value="4G">4G</Select.Option>
                  </Select>
                </Col>
              </Row>
              <div style={{ marginBottom: 15 }}>
                <span>显示昵称: </span>
                <Switch 
                  checked={chatConfig.showNickname} 
                  onChange={val => setChatConfig({...chatConfig, showNickname: val})}
                />
              </div>
              <Row gutter={16}>
                <Col span={12}>
                  <div style={{ textAlign: 'center' }}>
                    <div>对方头像/昵称</div>
                    <Upload
                      showUploadList={false}
                      beforeUpload={() => false}
                      onChange={(info) => handleAvatarChange('left', info)}
                    >
                      <Avatar 
                        size={64} 
                        src={chatConfig.leftAvatar} 
                        icon={<UserOutlined />} 
                        style={{ cursor: 'pointer', margin: '10px 0' }}
                      />
                    </Upload>
                    <Input 
                      value={chatConfig.leftNickname} 
                      onChange={e => setChatConfig({...chatConfig, leftNickname: e.target.value})}
                      placeholder="对方昵称"
                    />
                  </div>
                </Col>
                <Col span={12}>
                  <div style={{ textAlign: 'center' }}>
                    <div>我的头像/昵称</div>
                    <Upload
                      showUploadList={false}
                      beforeUpload={() => false}
                      onChange={(info) => handleAvatarChange('right', info)}
                    >
                      <Avatar 
                        size={64} 
                        src={chatConfig.rightAvatar} 
                        icon={<UserOutlined />} 
                        style={{ cursor: 'pointer', margin: '10px 0' }}
                      />
                    </Upload>
                    <Input 
                      value={chatConfig.rightNickname} 
                      onChange={e => setChatConfig({...chatConfig, rightNickname: e.target.value})}
                      placeholder="我的昵称"
                    />
                  </div>
                </Col>
              </Row>
            </div>

            <Divider orientation="left">新增消息</Divider>
            <div style={{ background: '#fafafa', padding: '15px', borderRadius: '8px' }}>
              <Space direction="vertical" style={{ width: '100%' }}>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <span>发送者:</span>
                  <Select 
                    value={editingMsg.role} 
                    onChange={val => setEditingMsg({...editingMsg, role: val})}
                    style={{ width: 100 }}
                  >
                    <Select.Option value="left">对方</Select.Option>
                    <Select.Option value="right">我</Select.Option>
                  </Select>
                  <span>时间:</span>
                  <Input 
                    value={editingMsg.time} 
                    onChange={e => setEditingMsg({...editingMsg, time: e.target.value})}
                    placeholder="10:00"
                    style={{ width: 100 }}
                  />
                  <Button onClick={handleAddTime}>插入时间线</Button>
                  <Button onClick={handleAddSystem}>插入系统消息</Button>
                  <Upload
                    showUploadList={false}
                    beforeUpload={() => false}
                    onChange={handleAddImage}
                  >
                    <Button icon={<PictureOutlined />}>插入图片</Button>
                  </Upload>
                </div>
                <TextArea 
                  rows={3} 
                  value={editingMsg.content} 
                  onChange={e => setEditingMsg({...editingMsg, content: e.target.value})}
                  placeholder="输入聊天内容..."
                />
                <Button type="primary" block onClick={handleAddMessage}>发送消息</Button>
              </Space>
            </div>

            <Divider orientation="left">消息管理</Divider>
            <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
              <List
                size="small"
                dataSource={messages}
                renderItem={item => (
                  <List.Item actions={[
                    <Button 
                      type="text" 
                      danger 
                      icon={<DeleteOutlined />} 
                      onClick={() => handleDeleteMessage(item.id)}
                    />
                  ]}>
                    <List.Item.Meta
                      avatar={item.type === 'time' ? null : <Avatar src={item.avatar} size="small" />}
                      title={item.type === 'time' ? <Tag>时间: {item.content}</Tag> : (item.role === 'left' ? '对方' : '我')}
                      description={item.type === 'time' ? null : item.content}
                    />
                  </List.Item>
                )}
              />
            </div>
          </Card>
        </Col>

        {/* 右侧：微信预览区 */}
        <Col xs={24} md={14}>
          <div className="wechat-preview-wrapper" style={{ display: 'flex', justifyContent: 'center' }}>
            <div className="wechat-phone-frame">
              {/* 状态栏 */}
              <div className="wechat-status-bar">
                <div className="status-left">
                  <span className="wechat-time-top">{dayjs().format('HH:mm')}</span>
                </div>
                <div className="status-right">
                  <div className="signal-bars">
                    <div className="bar"></div>
                    <div className="bar"></div>
                    <div className="bar"></div>
                    <div className="bar"></div>
                  </div>
                  {chatConfig.network === 'WiFi' ? (
                    <svg viewBox="0 0 1024 1024" width="14" height="14" style={{ marginLeft: '4px' }}>
                      <path d="M512 704a128 128 0 1 0 0 256 128 128 0 0 0 0-256zM880.64 458.24c-203.52-203.52-533.76-203.52-737.28 0a32 32 0 1 1-45.12-45.12c228.48-228.48 600-228.48 828.48 0a32 32 0 1 1-45.12 45.12zM716.8 622.08c-113.28-113.28-296.32-113.28-409.6 0a32 32 0 0 1-45.12-45.12c138.24-138.24 362.24-138.24 500.48 0a32 32 0 0 1-45.12 45.12z" fill="#000"></path>
                    </svg>
                  ) : <span style={{ marginLeft: '4px', fontSize: '10px' }}>{chatConfig.network}</span>}
                  <div className="battery-outer" style={{ borderColor: getBatteryColor(chatConfig.battery) }}>
                    <div className="battery-inner" style={{ width: `${chatConfig.battery}%`, background: getBatteryColor(chatConfig.battery) }}></div>
                    <div className="battery-tip" style={{ background: getBatteryColor(chatConfig.battery) }}></div>
                  </div>
                </div>
              </div>

              <div className="wechat-header">
                <div className="wechat-header-left">
                  <svg viewBox="0 0 1024 1024" width="20" height="20">
                    <path d="M669.56 154.34a31.36 31.36 0 0 0-44.35 0L247.58 532a31.36 31.36 0 0 0 0 44.35l377.63 377.63a31.36 31.36 0 1 0 44.35-44.35L314.15 554.22 669.56 198.7a31.36 31.36 0 0 0 0-44.36z" fill="#1a1a1a"></path>
                  </svg>
                  <span className="wechat-title">{chatConfig.title}</span>
                </div>
                <div className="wechat-header-right">
                  <svg viewBox="0 0 1024 1024" width="24" height="24">
                    <path d="M213.333 512c0 47.147-38.187 85.333-85.333 85.333S42.667 559.147 42.667 512 80.853 426.667 128 426.667s85.333 38.187 85.333 85.333z m384 0c0 47.147-38.187 85.333-85.333 85.333S426.667 559.147 426.667 512s38.187-85.333 85.333-85.333S597.333 464.853 597.333 512z m384 0c0 47.147-38.187 85.333-85.333 85.333S810.667 559.147 810.667 512s38.187-85.333 85.333-85.333S981.333 464.853 981.333 512z" fill="#1a1a1a"></path>
                  </svg>
                </div>
              </div>

              <div className="wechat-body" ref={scrollRef}>
                {messages.map((msg) => {
                  if (msg.type === 'time') {
                    return (
                      <div key={msg.id} className="wechat-time-container">
                        <span className="wechat-time">{msg.content}</span>
                      </div>
                    );
                  }

                  if (msg.type === 'system') {
                    return (
                      <div key={msg.id} className="wechat-system-container">
                        <span className="wechat-system">{msg.content}</span>
                      </div>
                    );
                  }

                  return (
                      <div key={msg.id} className={`wechat-msg-row ${msg.role}`}>
                        <Avatar shape="square" src={msg.avatar} className="wechat-avatar" />
                        <div className="wechat-msg-content-wrapper">
                          {chatConfig.showNickname && <div className="wechat-nickname">{msg.nickname}</div>}
                          {msg.type === 'image' ? (
                            <div className="wechat-img-content">
                              <img src={msg.content} alt="chat" style={{ maxWidth: '100%', borderRadius: '4px' }} />
                            </div>
                          ) : (
                            <div className="wechat-msg-bubble">
                              {msg.content}
                            </div>
                          )}
                        </div>
                      </div>
                  );
                })}
              </div>

              <div className="wechat-footer">
                <div className="wechat-footer-icon">
                  {/* 微信语音图标 - 100% 还原路径 */}
                  <svg viewBox="0 0 1024 1024" width="28" height="28">
                    <path d="M512 112c-220.9 0-400 179.1-400 400s179.1 400 400 400 400-179.1 400-400-179.1-400-400-400z m0 742c-188.9 0-342-153.1-342-342s153.1-342 342-342 342 153.1 342 342-153.1 342-342 342z" fill="#1a1a1a"></path>
                    <path d="M512 334c-98.3 0-178 79.7-178 178s79.7 178 178 178 178-79.7 178-178-79.7-178-178-178z m0 298c-66.3 0-120-53.7-120-120s53.7-120 120-120 120 53.7 120 120-53.7 120-120 120z" fill="#1a1a1a"></path>
                  </svg>
                </div>
                <div className="wechat-footer-input"></div>
                <div className="wechat-footer-icon">
                  {/* 微信表情图标 - 100% 还原路径 */}
                  <svg viewBox="0 0 1024 1024" width="28" height="28">
                    <path d="M512 112c-220.9 0-400 179.1-400 400s179.1 400 400 400 400-179.1 400-400-179.1-400-400-400z m0 742c-188.9 0-342-153.1-342-342s153.1-342 342-342 342 153.1 342 342-153.1 342-342 342z" fill="#1a1a1a"></path>
                    <path d="M366.5 408c-23.5 0-42.5 19-42.5 42.5s19 42.5 42.5 42.5 42.5-19 42.5-42.5-19-42.5-42.5-42.5zM657.5 408c-23.5 0-42.5 19-42.5 42.5s19 42.5 42.5 42.5 42.5-19 42.5-42.5-19-42.5-42.5-42.5z" fill="#1a1a1a"></path>
                    <path d="M512 732c86.5 0 162.1-47.5 203.1-118.3 4.1-7.1 1.7-16.1-5.4-20.2-7.1-4.1-16.1-1.7-20.2 5.4C653.9 661.3 588 700 512 700s-141.9-38.7-177.5-101.1c-4.1-7.1-13.1-9.5-20.2-5.4-7.1 4.1-9.5 13.1-5.4 20.2C349.9 684.5 425.5 732 512 732z" fill="#1a1a1a"></path>
                  </svg>
                </div>
                <div className="wechat-footer-icon">
                  {/* 微信加号图标 - 100% 还原路径 */}
                  <svg viewBox="0 0 1024 1024" width="28" height="28">
                    <path d="M512 112c-220.9 0-400 179.1-400 400s179.1 400 400 400 400-179.1 400-400-179.1-400-400-400z m0 742c-188.9 0-342-153.1-342-342s153.1-342 342-342 342 153.1 342 342-153.1 342-342 342z" fill="#1a1a1a"></path>
                    <path d="M512 312c-16 0-29 13-29 29v142H341c-16 0-29 13-29 29s13 29 29 29h142v142c0 16 13 29 29 29s29-13 29-29V541h142c16 0 29-13 29-29s-13-29-29-29H541V341c0-16-13-29-29-29z" fill="#1a1a1a"></path>
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </Col>
      </Row>

      <style>{`
        .wechat-phone-frame {
          width: 375px;
          height: 667px;
          background: #f5f5f5;
          border: 1px solid #ddd;
          border-radius: 4px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          box-shadow: 0 10px 30px rgba(0,0,0,0.1);
          position: relative;
          font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
        }

        .wechat-status-bar {
          height: 24px;
          background: #f3f3f3;
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0 14px;
          font-size: 11px;
          color: #000;
          font-weight: 600;
        }

        .status-left {
          display: flex;
          align-items: center;
        }

        .status-right {
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .signal-bars {
          display: flex;
          align-items: flex-end;
          gap: 1px;
          height: 10px;
        }

        .signal-bars .bar {
          width: 2px;
          background: #000;
          border-radius: 0.5px;
        }

        .signal-bars .bar:nth-child(1) { height: 3px; }
        .signal-bars .bar:nth-child(2) { height: 5px; }
        .signal-bars .bar:nth-child(3) { height: 7px; }
        .signal-bars .bar:nth-child(4) { height: 10px; }

        .battery-outer {
          width: 20px;
          height: 10px;
          border: 1px solid #000;
          border-radius: 2px;
          padding: 1px;
          position: relative;
          display: flex;
          align-items: center;
        }

        .battery-tip {
          position: absolute;
          right: -3px;
          top: 2.5px;
          width: 1.5px;
          height: 4px;
          border-radius: 0 1px 1px 0;
        }

        .battery-inner {
          height: 100%;
          border-radius: 0.5px;
        }

        .wechat-header {
          height: 44px;
          background: #f3f3f3;
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0 12px;
          border-bottom: 0.5px solid rgba(0,0,0,0.05);
          flex-shrink: 0;
        }

        .wechat-header-left {
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .wechat-title {
          font-size: 16px;
          font-weight: 500;
          color: #1a1a1a;
          max-width: 200px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .wechat-body {
          flex: 1;
          overflow-y: auto;
          padding: 12px 14px;
          display: flex;
          flex-direction: column;
          gap: 16px;
          scrollbar-width: none;
        }

        .wechat-body::-webkit-scrollbar {
          display: none;
        }

        .wechat-time-container, .wechat-system-container {
          text-align: center;
          margin: 8px 0;
        }

        .wechat-time, .wechat-system {
          color: #b2b2b2;
          font-size: 12px;
          display: inline-block;
          max-width: 80%;
          line-height: 1.4;
        }

        .wechat-time {
          background: rgba(0,0,0,0.05);
          padding: 2px 6px;
          border-radius: 4px;
          color: #fff;
          background: #dadada;
        }

        .wechat-msg-row {
          display: flex;
          gap: 10px;
          max-width: 88%;
          position: relative;
        }

        .wechat-msg-row.left {
          align-self: flex-start;
          flex-direction: row;
        }

        .wechat-msg-row.right {
          align-self: flex-end;
          flex-direction: row-reverse;
        }

        .wechat-avatar {
          width: 40px;
          height: 40px;
          border-radius: 4px;
          flex-shrink: 0;
          border: 0.5px solid rgba(0,0,0,0.05);
        }

        .wechat-msg-content-wrapper {
          display: flex;
          flex-direction: column;
          gap: 4px;
          position: relative;
        }

        .wechat-nickname {
          font-size: 11px;
          color: #7a7a7a;
          margin-bottom: 0px;
        }

        .left .wechat-nickname {
          margin-left: 2px;
        }

        .right .wechat-nickname {
          margin-right: 2px;
          text-align: right;
        }

        .wechat-img-content {
          max-width: 160px;
          border-radius: 4px;
          overflow: hidden;
          display: flex;
          border: 0.5px solid rgba(0,0,0,0.05);
        }

        .wechat-msg-bubble {
          padding: 10px 12px;
          border-radius: 6px;
          font-size: 15px;
          line-height: 1.4;
          position: relative;
          word-break: break-all;
          min-height: 40px;
          display: flex;
          align-items: center;
          color: #1a1a1a;
        }

        .left .wechat-msg-bubble {
          background: #ffffff;
        }

        .right .wechat-msg-bubble {
          background: #a9ea7a;
        }

        /* 气泡尖角实现 - 微信风格 */
        .wechat-msg-bubble::before {
          content: "";
          position: absolute;
          top: 14px;
          width: 6px;
          height: 6px;
          transform: rotate(45deg);
        }

        .left .wechat-msg-bubble::before {
          left: -3px;
          background: #ffffff;
        }

        .right .wechat-msg-bubble::before {
          right: -3px;
          background: #a9ea7a;
        }

        .wechat-footer {
          height: 56px;
          background: #f7f7f7;
          border-top: 0.5px solid #dbdbdb;
          display: flex;
          align-items: center;
          padding: 0 6px;
          gap: 2px;
          flex-shrink: 0;
        }

        .wechat-footer-input {
          flex: 1;
          height: 38px;
          background: #ffffff;
          border-radius: 4px;
          margin: 0 4px;
          border: none;
        }

        .wechat-footer-icon {
          width: 40px;
          height: 40px;
          color: #1a1a1a;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: background 0.2s;
          border-radius: 4px;
        }

        .wechat-footer-icon:active {
          background: rgba(0,0,0,0.05);
        }

        .wechat-icon-voice {
          width: 24px;
          height: 24px;
          border: 1.5px solid #333;
          border-radius: 50%;
          position: relative;
        }
        
        .wechat-icon-voice::after {
          content: "";
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: #333;
        }

      `}</style>
    </div>
  );
};

export default ChatGenerator;
