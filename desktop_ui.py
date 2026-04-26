
import sys
import os
import json
from PySide6.QtCore import Qt, QPoint, QSize, QUrl
from PySide6.QtGui import QPainter, QColor, QBrush, QAction, QIcon
from PySide6.QtWidgets import (QApplication, QWidget, QMainWindow, QVBoxLayout, 
                             QPushButton, QLabel, QHBoxLayout, QMenu, QSystemTrayIcon,
                             QInputDialog, QMessageBox)
from PySide6.QtWebEngineWidgets import QWebEngineView

# 获取可执行文件所在的目录
if getattr(sys, 'frozen', False):
    # 打包后的环境
    BASE_DIR = os.path.dirname(sys.executable)
else:
    # 源代码运行环境
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))

CONFIG_FILE = os.path.join(BASE_DIR, "desktop_config.json")

def get_config():
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r") as f:
                return json.load(f)
        except:
            pass
    return {"backend_url": "http://127.0.0.1:8000"}

def save_config(config):
    with open(CONFIG_FILE, "w") as f:
        json.dump(config, f)

class WebWindow(QMainWindow):
    def __init__(self, title, url):
        super().__init__()
        self.setWindowTitle(title)
        self.setMinimumSize(800, 700)
        self.setWindowFlags(Qt.WindowStaysOnTopHint)
        
        self.browser = QWebEngineView()
        self.browser.setUrl(QUrl(url))
        
        self.setCentralWidget(self.browser)

class FloatingBall(QWidget):
    def __init__(self):
        super().__init__()
        self.setWindowFlags(Qt.FramelessWindowHint | Qt.WindowStaysOnTopHint | Qt.Tool)
        self.setAttribute(Qt.WA_TranslucentBackground)
        
        self.ball_size = 50
        self.setFixedSize(self.ball_size + 10, self.ball_size + 10)
        
        # 初始位置：屏幕右侧中间
        screen = QApplication.primaryScreen().geometry()
        self.move(screen.width() - self.ball_size - 20, screen.height() // 2)
        
        self.dragging = False
        self.drag_position = QPoint()
        
        # 窗口对象缓存
        self.windows = {}
        
    def paintEvent(self, event):
        painter = QPainter(self)
        painter.setRenderHint(QPainter.Antialiasing)
        
        # 绘制球体
        color = QColor(24, 144, 255, 200) # antd 蓝色，带透明度
        painter.setBrush(QBrush(color))
        painter.setPen(Qt.NoPen)
        painter.drawEllipse(5, 5, self.ball_size, self.ball_size)
        
        # 绘制图标或文字
        painter.setPen(Qt.white)
        font = painter.font()
        font.setBold(True)
        painter.setFont(font)
        painter.drawText(self.rect(), Qt.AlignCenter, "票")

    def mousePressEvent(self, event):
        if event.button() == Qt.LeftButton:
            self.dragging = True
            self.drag_position = event.globalPos() - self.frameGeometry().topLeft()
            event.accept()

    def mouseMoveEvent(self, event):
        if event.button() == Qt.LeftButton and self.dragging:
            self.move(event.globalPos() - self.drag_position)
            event.accept()

    def mouseReleaseEvent(self, event):
        if event.button() == Qt.LeftButton:
            self.dragging = False
            # 贴边逻辑
            screen = QApplication.primaryScreen().geometry()
            current_pos = self.pos()
            target_x = current_pos.x()
            
            # 如果靠近左右边缘，自动贴边
            if current_pos.x() < screen.width() // 2:
                target_x = 0
            else:
                target_x = screen.width() - self.width()
            
            self.move(target_x, current_pos.y())
            
            # 如果没怎么动，认为是点击
            if (event.globalPos() - (self.drag_position + self.frameGeometry().topLeft())).manhattanLength() < 10:
                self.show_menu(event.globalPos())
            event.accept()

    def show_menu(self, pos):
        menu = QMenu(self)
        menu.setStyleSheet("""
            QMenu {
                background-color: white;
                border: 1px solid #ddd;
                border-radius: 8px;
                padding: 5px;
            }
            QMenu::item {
                padding: 8px 25px;
                border-radius: 4px;
            }
            QMenu::item:selected {
                background-color: #e6f7ff;
                color: #1890ff;
            }
        """)
        
        id_list_action = QAction("📋 ID 列表", self)
        id_list_action.triggered.connect(lambda: self.open_window("idlist", "ID 列表"))
        
        virtual_number_action = QAction("📱 虚拟号表", self)
        virtual_number_action.triggered.connect(lambda: self.open_window("virtual_numbers", "虚拟号表"))

        cloud_action = QAction("☁️ 云机快捷", self)
        cloud_action.triggered.connect(lambda: self.open_window("cloud", "云机快捷"))
        
        ticketing_action = QAction("🎫 票务系统", self)
        ticketing_action.triggered.connect(lambda: self.open_window("ticketing", "票务系统"))
        
        exit_action = QAction("❌ 退出程序", self)
        exit_action.triggered.connect(QApplication.instance().quit)
        
        change_url_action = QAction("⚙️ 修改服务器地址", self)
        change_url_action.triggered.connect(self.change_backend_url)
        
        menu.addAction(id_list_action)
        menu.addAction(virtual_number_action)
        menu.addAction(cloud_action)
        menu.addAction(ticketing_action)
        menu.addSeparator()
        menu.addAction(change_url_action)
        menu.addAction(exit_action)
        
        menu.exec_(pos)

    def change_backend_url(self):
        config = get_config()
        new_url, ok = QInputDialog.getText(self, "设置服务器地址", 
                                         "请输入内网穿透或局域网地址:", 
                                         text=config["backend_url"])
        if ok and new_url:
            if not new_url.startswith("http"):
                new_url = "http://" + new_url
            config["backend_url"] = new_url.strip("/")
            save_config(config)
            QMessageBox.information(self, "成功", "地址已更新，请重新打开窗口")

    def open_window(self, view_name, title):
        config = get_config()
        base_url = config["backend_url"]
        url = f"{base_url}/?view={view_name}&mode=desktop"
        if view_name not in self.windows or not self.windows[view_name].isVisible():
            self.windows[view_name] = WebWindow(title, url)
            self.windows[view_name].show()
        else:
            self.windows[view_name].raise_()
            self.windows[view_name].activateWindow()

if __name__ == "__main__":
    app = QApplication(sys.argv)
    app.setQuitOnLastWindowClosed(False) # 窗口关闭不退出程序
    
    # 获取配置
    config = get_config()
    backend_url = config["backend_url"]
    
    # 检查后端是否运行
    import httpx
    try:
        httpx.get(f"{backend_url}/", timeout=2)
    except:
        # 如果默认地址连接失败，弹窗询问
        new_url, ok = QInputDialog.getText(None, "连接失败", 
                                         f"无法连接到 {backend_url}\n请输入正确的服务器地址:", 
                                         text=backend_url)
        if ok and new_url:
            if not new_url.startswith("http"):
                new_url = "http://" + new_url
            config["backend_url"] = new_url.strip("/")
            save_config(config)
            backend_url = config["backend_url"]
    
    ball = FloatingBall()
    ball.show()
    
    # 托盘图标
    tray = QSystemTrayIcon()
    tray.setToolTip("演唱会票务桌面助手")
    # 这里可以使用一个简单的颜色块作为图标
    from PySide6.QtGui import QPixmap
    pixmap = QPixmap(32, 32)
    pixmap.fill(QColor(24, 144, 255))
    tray.setIcon(QIcon(pixmap))
    
    tray_menu = QMenu()
    show_ball_action = QAction("显示悬浮球", tray_menu)
    show_ball_action.triggered.connect(ball.show)
    exit_action = QAction("退出", tray_menu)
    exit_action.triggered.connect(app.quit)
    
    tray_menu.addAction(show_ball_action)
    tray_menu.addAction(exit_action)
    tray.setContextMenu(tray_menu)
    tray.show()
    
    sys.exit(app.exec())
