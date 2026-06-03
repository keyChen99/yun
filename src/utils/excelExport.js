import * as XLSX from 'xlsx';

/**
 * 导出数据到 Excel
 * @param {Array} data - 要导出的数组对象
 * @param {Array} columns - 列配置，格式为 [{ title: '列名', dataIndex: '字段名' }]
 * @param {string} fileName - 导出的文件名
 */
export const exportToExcel = (data, columns, fileName = 'export.xlsx') => {
  if (!data || !data.length) {
    return;
  }

  // 1. 转换数据格式
  const exportData = data.map(item => {
    const row = {};
    columns.forEach(col => {
      if (col.title && col.dataIndex) {
        // 如果有 render 函数，优先尝试使用原始值，或者简单处理
        // 注意：前端导出通常只导出纯文本数据
        let value = item[col.dataIndex];
        
        // 简单处理布尔值
        if (typeof value === 'boolean') {
          value = value ? '是' : '否';
        }
        
        row[col.title] = value === null || value === undefined ? '' : value;
      }
    });
    return row;
  });

  // 2. 创建工作表
  const worksheet = XLSX.utils.json_to_sheet(exportData);
  
  // 3. 创建工作簿
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
  
  // 4. 导出文件
  const actualFileName = fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`;
  XLSX.writeFile(workbook, actualFileName);
};
