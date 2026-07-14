from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

from PyQt5 import QtCore, QtGui, QtNetwork, QtWidgets
import psutil
import win32con
import win32gui
import win32process


ROOT = Path(__file__).resolve().parent.parent
STATE_DIR = ROOT / ".data" / "floating-orb"
STATE_PATH = STATE_DIR / "orb-state.json"
LOCK_KEY = "seedance2_playwright_workbench_orb"
WINDOW_TITLE = "脚本工作台悬浮球"


def ensure_state_dir() -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True)


def load_state() -> dict:
    try:
        return json.loads(STATE_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {}


def save_state(payload: dict) -> None:
    ensure_state_dir()
    STATE_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def launch_workbench() -> None:
    for hwnd in find_workbench_windows():
        try:
            if win32gui.IsIconic(hwnd):
                win32gui.ShowWindow(hwnd, win32con.SW_RESTORE)
            else:
                win32gui.ShowWindow(hwnd, win32con.SW_SHOW)
            win32gui.SetForegroundWindow(hwnd)
            return
        except Exception:
            continue

    script_path = ROOT / "tools" / "playwright-recorder-floating.ps1"
    subprocess.Popen(
        [
            "powershell.exe",
            "-STA",
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            str(script_path),
        ],
        cwd=str(ROOT),
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )


def find_workbench_windows() -> list[int]:
    target_windows: list[int] = []

    def enum_callback(hwnd: int, _extra: object) -> None:
        if not win32gui.IsWindowVisible(hwnd):
            return
        title = win32gui.GetWindowText(hwnd)
        if title != "脚本流程工作台" and title != "录屏中":
            return
        _, pid = win32process.GetWindowThreadProcessId(hwnd)
        try:
            cmdline = " ".join(psutil.Process(pid).cmdline())
        except Exception:
            cmdline = ""
        if "playwright-recorder-floating.ps1" in cmdline:
            target_windows.append(hwnd)

    win32gui.EnumWindows(enum_callback, None)
    return target_windows


class OrbWidget(QtWidgets.QWidget):
    EDGE_MARGIN = 10
    ORB_SIZE = 72

    def __init__(self) -> None:
        super().__init__(None)
        self._drag_offset: QtCore.QPoint | None = None
        self._drag_started = False
        self._setup_window()
        self._setup_tray()
        self._restore_position()

    def _setup_window(self) -> None:
        self.setWindowTitle(WINDOW_TITLE)
        self.setFixedSize(self.ORB_SIZE, self.ORB_SIZE)
        self.setWindowFlags(
            QtCore.Qt.FramelessWindowHint
            | QtCore.Qt.Tool
            | QtCore.Qt.WindowStaysOnTopHint
        )
        self.setAttribute(QtCore.Qt.WA_TranslucentBackground, True)
        self.setCursor(QtCore.Qt.PointingHandCursor)
        self.setContextMenuPolicy(QtCore.Qt.CustomContextMenu)
        self.customContextMenuRequested.connect(self._show_context_menu)

        layout = QtWidgets.QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)

        self.button = QtWidgets.QPushButton("PW", self)
        self.button.setCursor(QtCore.Qt.PointingHandCursor)
        self.button.setFixedSize(self.ORB_SIZE, self.ORB_SIZE)
        self.button.clicked.connect(self._handle_click)
        self.button.setStyleSheet(
            """
            QPushButton {
              border: none;
              border-radius: 36px;
              background: qradialgradient(cx:0.35, cy:0.3, radius:0.9,
                fx:0.3, fy:0.25,
                stop:0 #60a5fa,
                stop:0.55 #2563eb,
                stop:1 #1d4ed8);
              color: white;
              font-size: 20px;
              font-weight: 700;
            }
            QPushButton:hover {
              background: qradialgradient(cx:0.35, cy:0.3, radius:0.95,
                fx:0.3, fy:0.25,
                stop:0 #93c5fd,
                stop:0.5 #3b82f6,
                stop:1 #1d4ed8);
            }
            """
        )
        layout.addWidget(self.button)

        badge = QtWidgets.QLabel("脚本", self)
        badge.setAttribute(QtCore.Qt.WA_TransparentForMouseEvents, True)
        badge.setStyleSheet("color: rgba(255,255,255,0.92); font-size: 10px; font-weight: 500;")
        badge.adjustSize()
        badge.move(22, 42)
        badge.raise_()

        tip = QtWidgets.QToolTip
        tip.showText(QtGui.QCursor.pos(), "", self)
        self.setToolTip("单击打开工作台，右键更多操作")

        self._menu = QtWidgets.QMenu(self)
        self._menu.addAction("打开脚本工作台", self._handle_click)
        self._menu.addSeparator()
        self._menu.addAction("退出悬浮球", self._quit_all)

    def _setup_tray(self) -> None:
        icon = self._build_icon()
        self.setWindowIcon(icon)
        self.tray = QtWidgets.QSystemTrayIcon(icon, self)
        self.tray.setToolTip(WINDOW_TITLE)
        tray_menu = QtWidgets.QMenu()
        tray_menu.addAction("打开脚本工作台", self._handle_click)
        tray_menu.addAction("显示悬浮球", self._show_orb)
        tray_menu.addSeparator()
        tray_menu.addAction("退出悬浮球", self._quit_all)
        self.tray.setContextMenu(tray_menu)
        self.tray.activated.connect(self._on_tray_activated)
        self.tray.show()

    def _build_icon(self) -> QtGui.QIcon:
        pixmap = QtGui.QPixmap(self.ORB_SIZE, self.ORB_SIZE)
        pixmap.fill(QtCore.Qt.transparent)
        painter = QtGui.QPainter(pixmap)
        painter.setRenderHint(QtGui.QPainter.Antialiasing)
        gradient = QtGui.QRadialGradient(24, 20, 42)
        gradient.setColorAt(0, QtGui.QColor("#93c5fd"))
        gradient.setColorAt(0.45, QtGui.QColor("#3b82f6"))
        gradient.setColorAt(1, QtGui.QColor("#1d4ed8"))
        painter.setBrush(QtGui.QBrush(gradient))
        painter.setPen(QtCore.Qt.NoPen)
        painter.drawEllipse(0, 0, self.ORB_SIZE, self.ORB_SIZE)
        font = QtGui.QFont("Microsoft YaHei UI", 18)
        font.setBold(True)
        painter.setFont(font)
        painter.setPen(QtGui.QColor("white"))
        painter.drawText(pixmap.rect(), QtCore.Qt.AlignCenter, "PW")
        painter.end()
        return QtGui.QIcon(pixmap)

    def _show_context_menu(self, pos: QtCore.QPoint) -> None:
        self._menu.exec_(self.mapToGlobal(pos))

    def _on_tray_activated(self, reason: QtWidgets.QSystemTrayIcon.ActivationReason) -> None:
        if reason in (
            QtWidgets.QSystemTrayIcon.Trigger,
            QtWidgets.QSystemTrayIcon.DoubleClick,
        ):
            self._show_orb()

    def _show_orb(self) -> None:
        self.show()
        self.raise_()
        self.activateWindow()

    def _quit_all(self) -> None:
        self.tray.hide()
        QtWidgets.QApplication.instance().quit()

    def _handle_click(self) -> None:
        launch_workbench()

    def mousePressEvent(self, event: QtGui.QMouseEvent) -> None:
        if event.button() == QtCore.Qt.LeftButton:
            self._drag_offset = event.globalPos() - self.frameGeometry().topLeft()
            self._drag_started = False
            event.accept()
            return
        super().mousePressEvent(event)

    def mouseMoveEvent(self, event: QtGui.QMouseEvent) -> None:
        if self._drag_offset is None or not (event.buttons() & QtCore.Qt.LeftButton):
            super().mouseMoveEvent(event)
            return
        self._drag_started = True
        self.move(event.globalPos() - self._drag_offset)
        event.accept()

    def mouseReleaseEvent(self, event: QtGui.QMouseEvent) -> None:
        if event.button() == QtCore.Qt.LeftButton and self._drag_offset is not None:
            self._drag_offset = None
            if self._drag_started:
                self._snap_to_edge()
                self._persist_position()
            else:
                self._handle_click()
            event.accept()
            return
        super().mouseReleaseEvent(event)

    def closeEvent(self, event: QtGui.QCloseEvent) -> None:
        event.ignore()
        self.hide()

    def _screen_geometry(self) -> QtCore.QRect:
        screen = QtWidgets.QApplication.screenAt(self.frameGeometry().center())
        if screen is None:
            screen = QtWidgets.QApplication.primaryScreen()
        return screen.availableGeometry()

    def _snap_to_edge(self) -> None:
        geometry = self._screen_geometry()
        current = self.frameGeometry()
        center_x = current.center().x()
        middle_x = geometry.left() + geometry.width() // 2
        target_x = geometry.left() + self.EDGE_MARGIN if center_x < middle_x else geometry.right() - self.width() - self.EDGE_MARGIN
        target_y = min(max(current.y(), geometry.top() + self.EDGE_MARGIN), geometry.bottom() - self.height() - self.EDGE_MARGIN)
        self.move(target_x, target_y)

    def _persist_position(self) -> None:
        save_state({"x": self.x(), "y": self.y()})

    def _restore_position(self) -> None:
        state = load_state()
        x = state.get("x")
        y = state.get("y")
        geometry = self._screen_geometry()
        if isinstance(x, int) and isinstance(y, int):
            x = min(max(x, geometry.left()), geometry.right() - self.width())
            y = min(max(y, geometry.top()), geometry.bottom() - self.height())
            self.move(x, y)
        else:
            self.move(geometry.right() - self.width() - self.EDGE_MARGIN, geometry.center().y() - self.height() // 2)
        self._snap_to_edge()


def main() -> int:
    ensure_state_dir()
    app = QtWidgets.QApplication(sys.argv)
    app.setApplicationName(WINDOW_TITLE)

    socket = QtNetwork.QLocalSocket()
    socket.connectToServer(LOCK_KEY)
    if socket.waitForConnected(200):
        return 0

    server = QtNetwork.QLocalServer()
    QtNetwork.QLocalServer.removeServer(LOCK_KEY)
    if not server.listen(LOCK_KEY):
        return 1

    widget = OrbWidget()

    def on_new_connection() -> None:
        client = server.nextPendingConnection()
        if client:
          client.disconnectFromServer()
        widget._show_orb()

    server.newConnection.connect(on_new_connection)
    widget.show()
    return app.exec_()


if __name__ == "__main__":
    sys.exit(main())
