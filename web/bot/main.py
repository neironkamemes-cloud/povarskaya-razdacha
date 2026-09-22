import os
import sqlite3
import time
import random
from pathlib import Path

from aiohttp import web
from aiogram import Bot, Dispatcher, types
from aiogram.filters import CommandStart
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo


BOT_TOKEN = os.getenv("BOT_TOKEN", "")
WEBAPP_URL = os.getenv("WEBAPP_URL", "")
PORT = int(os.getenv("PORT", "8080"))

BASE_DIR = Path(__file__).resolve().parent.parent
WEB_DIR = BASE_DIR / "web"
DB_PATH = BASE_DIR / "data.sqlite3"

PRIZES = [
    ("🍕", "Пицца"),
    ("🍔", "Бургер"),
    ("🍣", "Суши"),
    ("🍰", "Торт"),
    ("👑", "Золотой шеф"),
    ("💎", "Алмазная сковорода"),
    ("🥄", "Ложка удачи"),
]

COOLDOWN = 24 * 60 * 60


if not BOT_TOKEN:
    raise RuntimeError("BOT_TOKEN is not set")

if not WEBAPP_URL:
    raise RuntimeError("WEBAPP_URL is not set")


def db():
    conn = sqlite3.connect(DB_PATH)

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            user_id INTEGER PRIMARY KEY,
            last_spin INTEGER DEFAULT 0,
            prize TEXT
        )
        """
    )

    conn.commit()
    return conn


def can_spin(user_id: int):
    conn = db()

    row = conn.execute(
        "SELECT last_spin FROM users WHERE user_id = ?",
        (user_id,),
    ).fetchone()

    conn.close()

    if not row:
        return True, 0

    remaining = COOLDOWN - (int(time.time()) - row[0])

    return remaining <= 0, max(0, remaining)


def save_spin(user_id: int, prize: str):
