import React, { useState } from 'react';
import { Card, Button, Space, Typography, List, message, Divider } from 'antd';
import { 
  DownloadOutlined, 
  DatabaseOutlined, 
  FileTextOutlined, 
  CodeOutlined,
  CloudDownloadOutlined
} from '@ant-design/icons';

const { Title, Paragraph, Text } = Typography;

const BackupManagement = () => {
    const [loading, setLoading] = useState({
        sql: false,
        json: false,
        file: false
    });

    const handleBackup = async (type) => {
        setLoading(prev => ({ ...prev, [type]: true }));
        try {
            const endpoints = {
                sql: '/api/export/db/sql',
                json: '/api/export/db/json',
                file: '/api/export/db/file'
            };
            
            const response = await fetch(endpoints[type], {
                headers: {
                    'Authorization': localStorage.getItem('auth_token') || ''
                }
            });

            if (!response.ok) {
                throw new Error('备份失败，请检查登录状态或网络');
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            
            // 获取文件名
            const contentDisposition = response.headers.get('Content-Disposition');
            let filename = `backup_${type}_${new Date().getTime()}`;
            if (contentDisposition) {
                const match = contentDisposition.match(/filename="(.+)"/);
                if (match) filename = match[1];
            } else {
                const extensions = { sql: '.sql', json: '.json', file: '.db' };
                filename += extensions[type];
            }

            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            
            message.success(`${type.toUpperCase()} 备份已开始下载`);
        } catch (error) {
            console.error('Backup error:', error);
            message.error(error.message || '备份过程中出现错误');
        } finally {
            setLoading(prev => ({ ...prev, [type]: false }));
        }
    };

    const backupOptions = [
        {
            key: 'file',
            title: '完整数据库备份 (.db)',
            description: '下载原始 SQLite 数据库文件。这是最完整的备份方式，包含所有表结构、索引和数据。',
            icon: <DatabaseOutlined style={{ fontSize: '24px', color: '#1890ff' }} />,
            action: () => handleBackup('file'),
            loading: loading.file,
            buttonText: '下载 .db 文件',
            type: 'primary'
        },
        {
            key: 'sql',
            title: 'SQL 脚本备份 (.sql)',
            description: '导出数据库为 SQL 语句序列。适用于在其他数据库中恢复或查看表结构。',
            icon: <CodeOutlined style={{ fontSize: '24px', color: '#52c41a' }} />,
            action: () => handleBackup('sql'),
            loading: loading.sql,
            buttonText: '下载 SQL 脚本'
        },
        {
            key: 'json',
            title: 'JSON 数据导出 (.json)',
            description: '将所有表的数据导出为易读的 JSON 格式。适用于数据分析或程序处理。',
            icon: <FileTextOutlined style={{ fontSize: '24px', color: '#faad14' }} />,
            action: () => handleBackup('json'),
            loading: loading.json,
            buttonText: '下载 JSON 数据'
        }
    ];

    return (
        <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
            <Card bordered={false} className="backup-card" style={{ borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                <Title level={3} style={{ marginBottom: '24px' }}>
                    <CloudDownloadOutlined /> 数据库备份管理
                </Title>
                
                <Paragraph>
                    <Text type="secondary">
                        为了保障系统数据安全，建议您定期进行数据备份。备份文件将保存到您的本地计算机。
                    </Text>
                </Paragraph>
                
                <Divider />

                <List
                    itemLayout="horizontal"
                    dataSource={backupOptions}
                    renderItem={item => (
                        <List.Item
                            actions={[
                                <Button 
                                    key="download"
                                    type={item.type || 'default'}
                                    icon={<DownloadOutlined />}
                                    loading={item.loading}
                                    onClick={item.action}
                                >
                                    {item.buttonText}
                                </Button>
                            ]}
                        >
                            <List.Item.Meta
                                avatar={item.icon}
                                title={<Text strong>{item.title}</Text>}
                                description={item.description}
                            />
                        </List.Item>
                    )}
                />

                <div style={{ marginTop: '32px', padding: '16px', backgroundColor: '#fffbe6', border: '1px solid #ffe58f', borderRadius: '8px' }}>
                    <Title level={5} style={{ color: '#856404', marginTop: 0 }}>注意事项</Title>
                    <ul style={{ color: '#856404', paddingLeft: '20px', marginBottom: 0 }}>
                        <li>备份过程可能需要几秒钟，请勿在下载完成前关闭页面。</li>
                        <li>下载的 .db 文件可以使用 SQLite Viewer 等工具查看。</li>
                        <li>建议将备份文件保存在安全的云盘或外部存储设备中。</li>
                        <li>只有超级管理员权限可以进行数据库备份操作。</li>
                    </ul>
                </div>
            </Card>
        </div>
    );
};

export default BackupManagement;
