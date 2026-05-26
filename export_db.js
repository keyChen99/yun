#!/usr/bin/env node

const sqlite3 = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const dbPath = 'stock.db';

try {
  const db = new sqlite3(dbPath);
  
  // 获取所有表
  const tables = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
  ).all();
  
  console.log(`\n📊 数据库信息: ${dbPath}`);
  console.log(`文件大小: ${(fs.statSync(dbPath).size / 1024).toFixed(2)} KB`);
  console.log(`\n表列表:`);
  
  const data = {};
  
  for (const table of tables) {
    const tableName = table.name;
    const rows = db.prepare(`SELECT * FROM ${tableName}`).all();
    data[tableName] = rows;
    console.log(`  - ${tableName}: ${rows.length} 行`);
  }
  
  // 导出为 JSON
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const jsonFile = `stock_backup_${timestamp}.json`;
  fs.writeFileSync(jsonFile, JSON.stringify(data, null, 2), 'utf-8');
  
  console.log(`\n✅ JSON 导出成功: ${jsonFile}`);
  console.log(`✅ SQL 导出成功: stock_backup.sql`);
  
  db.close();
} catch (error) {
  console.error(`❌ 导出失败: ${error.message}`);
  process.exit(1);
}

