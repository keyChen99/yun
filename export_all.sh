#!/bin/bash

# 导出所有表为 JSON
sqlite3 -json stock.db "SELECT * FROM concerts;" > concerts.json
sqlite3 -json stock.db "SELECT * FROM viewers;" > viewers.json
sqlite3 -json stock.db "SELECT * FROM id_projects;" > id_projects.json
sqlite3 -json stock.db "SELECT * FROM id_tickets;" > id_tickets.json
sqlite3 -json stock.db "SELECT * FROM tickets_sys;" > tickets_sys.json
sqlite3 -json stock.db "SELECT * FROM known_patterns;" > known_patterns.json
sqlite3 -json stock.db "SELECT * FROM virtual_numbers;" > virtual_numbers.json
sqlite3 -json stock.db "SELECT * FROM mobile_library;" > mobile_library.json
sqlite3 -json stock.db "SELECT * FROM quick_copy_tools;" > quick_copy_tools.json
sqlite3 -json stock.db "SELECT * FROM show_schedules;" > show_schedules.json
sqlite3 -json stock.db "SELECT * FROM wechat_list;" > wechat_list.json
sqlite3 -json stock.db "SELECT * FROM wechat_visit_logs;" > wechat_visit_logs.json

echo "✅ 所有表已导出为 JSON 文件"
ls -lh *.json
