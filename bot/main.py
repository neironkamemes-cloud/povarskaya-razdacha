import asyncio
import os
import random
import signal
import sqlite3
import time
from pathlib import Path

from aiohttp import web
from aiogram import Bot, Dispatcher, F
from aiogram.exceptions import TelegramConflictError
from aiogram.filters import Command, CommandStart
from aiogram.types import (
    CallbackQuery,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    Message,
    WebAppInfo,
)


# =========================================================
# PATHS
# =========================================================

BASE_DIR = Path(__file__).resolve().parent.parent
WEB_DIR = BASE_DIR / "web"
DB_PATH = BASE_DIR / "povarskaya.db"


# =========================================================
# SETTINGS
# =========================================================

BOT_TOKEN = os.getenv("BOT_TOKEN")
WEBAPP_URL = os.getenv("WEBAPP_URL", "")

COOLDOWN = 24 * 60 * 60
REMINDER_CHECK_INTERVAL = 60

# Только этот Telegram ID имеет доступ к админ-панели.
ADMIN_IDS = {
    5890820074,
}

if not BOT_TOKEN:
    raise RuntimeError("BOT_TOKEN is not set")


# =========================================================
# PRIZES
# =========================================================

PRIZES = [
    "❌ Ничего",
    "❌ Ничего",
    "❌ Ничего",
    "❌ Ничего",
    "❌ Ничего",
    "❌ Ничего",
    "❌ Ничего",
    "🐻 Медведь",
    "❌ Ничего",
    "❌ Ничего",
    "❌ Ничего",
    "❌ Ничего",
    "❌ Ничего",
    "❌ Ничего",
    "❌ Ничего",
]


# =========================================================
# ADMIN TEMP STATE
# =========================================================

# Примеры:
# {5890820074: "reset_user"}
# {5890820074: "broadcast"}
# {5890820074: {"type": "broadcast", "text": "..."}}
ADMIN_ACTIONS = {}


# =========================================================
# DATABASE
# =========================================================

def get_db():
    DB_PATH.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    conn = sqlite3.connect(
        str(DB_PATH),
        timeout=30,
    )

    conn.row_factory = sqlite3.Row

    return conn


def ensure_database():
    """
    Аккуратная миграция существующей базы.

    Старые данные не удаляются.
    Таблица users создаётся только если её ещё нет.
    Недостающие колонки добавляются отдельно.
    """
    conn = get_db()

    try:
        table = conn.execute(
            """
            SELECT name
            FROM sqlite_master
            WHERE type = 'table'
              AND name = 'users'
            """
        ).fetchone()

        if table is None:
            print(
                "Database: creating users table..."
            )

            conn.execute(
                """
                CREATE TABLE users (
                    user_id INTEGER PRIMARY KEY,
                    last_spin INTEGER NOT NULL DEFAULT 0,
                    prize TEXT NOT NULL DEFAULT '',
                    reminder_sent INTEGER NOT NULL DEFAULT 0,
                    first_seen INTEGER NOT NULL DEFAULT 0,
                    last_seen INTEGER NOT NULL DEFAULT 0,
                    spin_count INTEGER NOT NULL DEFAULT 0
                )
                """
            )

            conn.commit()

        columns = conn.execute(
            "PRAGMA table_info(users)"
        ).fetchall()

        existing_columns = {
            row["name"]
            for row in columns
        }

        migrations = {
            "last_spin":
                "INTEGER NOT NULL DEFAULT 0",

            "prize":
                "TEXT NOT NULL DEFAULT ''",

            "reminder_sent":
                "INTEGER NOT NULL DEFAULT 0",

            "first_seen":
                "INTEGER NOT NULL DEFAULT 0",

            "last_seen":
                "INTEGER NOT NULL DEFAULT 0",

            "spin_count":
                "INTEGER NOT NULL DEFAULT 0",
        }

        for column, definition in migrations.items():
            if column not in existing_columns:
                print(
                    f"Database migration: "
                    f"adding {column}"
                )

                conn.execute(
                    f"""
                    ALTER TABLE users
                    ADD COLUMN {column}
                    {definition}
                    """
                )

        # Если база была создана старой версией
        # и first_seen/last_seen ещё пустые,
        # аккуратно заполняем их из last_spin.
        conn.execute(
            """
            UPDATE users
            SET first_seen = last_spin
            WHERE first_seen = 0
              AND last_spin > 0
            """
        )

        conn.execute(
            """
            UPDATE users
            SET last_seen = last_spin
            WHERE last_seen = 0
              AND last_spin > 0
            """
        )

        conn.commit()

        print(
            "Database initialized successfully"
        )

    finally:
        conn.close()


def register_user(user_id: int):
    ensure_database()

    now = int(time.time())

    conn = get_db()

    try:
        user = conn.execute(
            """
            SELECT
                user_id,
                first_seen
            FROM users
            WHERE user_id = ?
            """,
            (user_id,),
        ).fetchone()

        if user is None:
            conn.execute(
                """
                INSERT INTO users (
                    user_id,
                    first_seen,
                    last_seen
                )
                VALUES (?, ?, ?)
                """,
                (
                    user_id,
                    now,
                    now,
                ),
            )
        else:
            conn.execute(
                """
                UPDATE users
                SET last_seen = ?
                WHERE user_id = ?
                """,
                (
                    now,
                    user_id,
                ),
            )

        conn.commit()

    finally:
        conn.close()


def get_user(user_id: int):
    register_user(user_id)

    conn = get_db()

    try:
        return conn.execute(
            """
            SELECT *
            FROM users
            WHERE user_id = ?
            """,
            (user_id,),
        ).fetchone()

    finally:
        conn.close()


def get_remaining(user_id: int) -> int:
    user = get_user(user_id)

    if user is None:
        return 0

    last_spin = int(
        user["last_spin"] or 0
    )

    if last_spin <= 0:
        return 0

    remaining = (
        COOLDOWN
        - (
            int(time.time())
            - last_spin
        )
    )

    return max(
        0,
        remaining,
    )


def save_spin(
    user_id: int,
    prize: str,
):
    register_user(user_id)

    now = int(time.time())

    conn = get_db()

    try:
        conn.execute(
            """
            UPDATE users
            SET
                last_spin = ?,
                prize = ?,
                reminder_sent = 0,
                last_seen = ?,
                spin_count = spin_count + 1
            WHERE user_id = ?
            """,
            (
                now,
                prize,
                now,
                user_id,
            ),
        )

        conn.commit()

    finally:
        conn.close()


# =========================================================
# REMINDERS
# =========================================================

def get_users_ready_for_reminder():
    ensure_database()

    now = int(time.time())
    threshold = now - COOLDOWN

    conn = get_db()

    try:
        return conn.execute(
            """
            SELECT
                user_id,
                last_spin
            FROM users
            WHERE last_spin > 0
              AND last_spin <= ?
              AND reminder_sent = 0
            """,
            (threshold,),
        ).fetchall()

    finally:
        conn.close()


def mark_reminder_sent(user_id: int):
    ensure_database()

    conn = get_db()

    try:
        conn.execute(
            """
            UPDATE users
            SET reminder_sent = 1
            WHERE user_id = ?
            """,
            (user_id,),
        )

        conn.commit()

    finally:
        conn.close()


# =========================================================
# ADMIN DATABASE ACTIONS
# =========================================================

def reset_user_cooldown(user_id: int):
    register_user(user_id)

    conn = get_db()

    try:
        conn.execute(
            """
            UPDATE users
            SET
                last_spin = 0,
                reminder_sent = 0
            WHERE user_id = ?
            """,
            (user_id,),
        )

        conn.commit()

    finally:
        conn.close()


def reset_all_cooldowns():
    ensure_database()

    conn = get_db()

    try:
        cursor = conn.execute(
            """
            UPDATE users
            SET
                last_spin = 0,
                reminder_sent = 0
            """
        )

        conn.commit()

        return cursor.rowcount

    finally:
        conn.close()


def get_all_user_ids():
    ensure_database()

    conn = get_db()

    try:
        rows = conn.execute(
            """
            SELECT user_id
            FROM users
            ORDER BY first_seen ASC
            """
        ).fetchall()

        return [
            int(row["user_id"])
            for row in rows
        ]

    finally:
        conn.close()


def get_recent_users(limit=20):
    ensure_database()

    conn = get_db()

    try:
        return conn.execute(
            """
            SELECT
                user_id,
                first_seen,
                last_seen,
                spin_count,
                prize
            FROM users
            ORDER BY last_seen DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()

    finally:
        conn.close()


def get_statistics():
    ensure_database()

    now = int(time.time())

    day = now - 86400
    week = now - 7 * 86400
    month = now - 30 * 86400

    conn = get_db()

    try:
        total = conn.execute(
            """
            SELECT COUNT(*) AS count
            FROM users
            """
        ).fetchone()["count"]

        new_month = conn.execute(
            """
            SELECT COUNT(*) AS count
            FROM users
            WHERE first_seen >= ?
            """,
            (month,),
        ).fetchone()["count"]

        active_day = conn.execute(
            """
            SELECT COUNT(*) AS count
            FROM users
            WHERE last_seen >= ?
            """,
            (day,),
        ).fetchone()["count"]

        active_week = conn.execute(
            """
            SELECT COUNT(*) AS count
            FROM users
            WHERE last_seen >= ?
            """,
            (week,),
        ).fetchone()["count"]

        active_month = conn.execute(
            """
            SELECT COUNT(*) AS count
            FROM users
            WHERE last_seen >= ?
            """,
            (month,),
        ).fetchone()["count"]

        total_spins = conn.execute(
            """
            SELECT COALESCE(
                SUM(spin_count),
                0
            ) AS count
            FROM users
            """
        ).fetchone()["count"]

        return {
            "total": total,
            "new_month": new_month,
            "active_day": active_day,
            "active_week": active_week,
            "active_month": active_month,
            "spins": total_spins,
        }

    finally:
        conn.close()


# =========================================================
# KEYBOARDS
# =========================================================

def spin_keyboard():
    if not WEBAPP_URL:
        return None

    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="🎰 Крутить рулетку",
                    web_app=WebAppInfo(
                        url=WEBAPP_URL
                    ),
                )
            ]
        ]
    )


def admin_keyboard():
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="📊 Статистика",
                    callback_data="admin_stats",
                )
            ],
            [
                InlineKeyboardButton(
                    text="🎰 Сбросить КД",
                    callback_data="admin_reset_user",
                ),
                InlineKeyboardButton(
                    text="🔄 Сбросить всем",
                    callback_data="admin_reset_all",
                )
            ],
            [
                InlineKeyboardButton(
                    text="📢 Рассылка",
                    callback_data="admin_broadcast",
                )
            ],
            [
                InlineKeyboardButton(
                    text="👥 Пользователи",
                    callback_data="admin_users",
                )
            ]
        ]
    )


def confirm_reset_all_keyboard():
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="✅ Да, сбросить всем",
                    callback_data="admin_confirm_reset_all",
                )
            ],
            [
                InlineKeyboardButton(
                    text="❌ Отмена",
                    callback_data="admin_cancel",
                )
            ]
        ]
    )


def confirm_broadcast_keyboard():
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="📢 Отправить",
                    callback_data="admin_confirm_broadcast",
                )
            ],
            [
                InlineKeyboardButton(
                    text="❌ Отмена",
                    callback_data="admin_cancel",
                )
            ]
        ]
    )


# =========================================================
# ADMIN TEXT
# =========================================================

def statistics_text():
    stats = get_statistics()

    return (
        "📊 <b>Статистика бота</b>\n\n"
        f"👥 Всего пользователей: "
        f"<b>{stats['total']}</b>\n"
        f"🆕 Новых за 30 дней: "
        f"<b>{stats['new_month']}</b>\n\n"
        f"🟢 Активных за 24 часа: "
        f"<b>{stats['active_day']}</b>\n"
        f"🟢 Активных за 7 дней: "
        f"<b>{stats['active_week']}</b>\n"
        f"🟢 Активных за 30 дней: "
        f"<b>{stats['active_month']}</b>\n\n"
        f"🎰 Всего прокруток: "
        f"<b>{stats['spins']}</b>"
    )


def recent_users_text():
    users = get_recent_users()

    if not users:
        return (
            "👥 Пользователей пока нет."
        )

    lines = [
        "👥 <b>Последние пользователи</b>",
        ""
    ]

    for user in users:
        uid = int(user["user_id"])
        spins = int(
            user["spin_count"] or 0
        )

        last_seen = int(
            user["last_seen"] or 0
        )

        if last_seen:
            date = time.strftime(
                "%d.%m.%Y %H:%M",
                time.localtime(last_seen),
            )
        else:
            date = "—"

        lines.append(
            f"• <code>{uid}</code> — "
            f"{spins} прокруток — {date}"
        )

    return "\n".join(lines)


# =========================================================
# BOT
# =========================================================

dp = Dispatcher()


@dp.message(CommandStart())
async def start_handler(
    message: Message,
):
    register_user(
        message.from_user.id
    )

    text = (
        "👨‍🍳 <b>Добро пожаловать "
        "в «Поварскую Раздачу»!</b>\n\n"
        "🎁 Здесь тебя ждёт "
        "ежедневная раздача.\n"
        "Крути рулетку и забирай свой приз!"
    )

    keyboard = spin_keyboard()

    if keyboard:
        await message.answer(
            text,
            reply_markup=keyboard,
            parse_mode="HTML",
        )
    else:
        await message.answer(
            text,
            parse_mode="HTML",
        )


# =========================================================
# ADMIN
# =========================================================

@dp.message(Command("admin"))
async def admin_command(
    message: Message,
):
    if message.from_user.id not in ADMIN_IDS:
        return

    ADMIN_ACTIONS.pop(
        message.from_user.id,
        None,
    )

    await message.answer(
        "🔐 <b>Админ-панель</b>\n\n"
        "Выбери действие:",
        parse_mode="HTML",
        reply_markup=admin_keyboard(),
    )


@dp.callback_query(
    F.data == "admin_stats"
)
async def admin_stats(
    callback: CallbackQuery,
):
    if callback.from_user.id not in ADMIN_IDS:
        await callback.answer(
            "Нет доступа",
            show_alert=True,
        )
        return

    await callback.message.edit_text(
        statistics_text(),
        parse_mode="HTML",
        reply_markup=admin_keyboard(),
    )

    await callback.answer()


@dp.callback_query(
    F.data == "admin_users"
)
async def admin_users(
    callback: CallbackQuery,
):
    if callback.from_user.id not in ADMIN_IDS:
        await callback.answer(
            "Нет доступа",
            show_alert=True,
        )
        return

    await callback.message.edit_text(
        recent_users_text(),
        parse_mode="HTML",
        reply_markup=admin_keyboard(),
    )

    await callback.answer()


@dp.callback_query(
    F.data == "admin_reset_user"
)
async def admin_reset_user(
    callback: CallbackQuery,
):
    if callback.from_user.id not in ADMIN_IDS:
        await callback.answer(
            "Нет доступа",
            show_alert=True,
        )
        return

    ADMIN_ACTIONS[
        callback.from_user.id
    ] = "reset_user"

    await callback.message.answer(
        "🎰 Напиши Telegram ID пользователя.\n\n"
        "Например:\n"
        "<code>7052557964</code>",
        parse_mode="HTML",
    )

    await callback.answer()


@dp.callback_query(
    F.data == "admin_reset_all"
)
async def admin_reset_all(
    callback: CallbackQuery,
):
    if callback.from_user.id not in ADMIN_IDS:
        await callback.answer(
            "Нет доступа",
            show_alert=True,
        )
        return

    await callback.message.edit_text(
        "⚠️ <b>Сбросить КД всем пользователям?</b>\n\n"
        "После этого каждый сможет снова "
        "крутить рулетку.",
        parse_mode="HTML",
        reply_markup=confirm_reset_all_keyboard(),
    )

    await callback.answer()


@dp.callback_query(
    F.data == "admin_confirm_reset_all"
)
async def admin_confirm_reset_all(
    callback: CallbackQuery,
):
    if callback.from_user.id not in ADMIN_IDS:
        await callback.answer(
            "Нет доступа",
            show_alert=True,
        )
        return

    count = reset_all_cooldowns()

    await callback.message.edit_text(
        f"✅ КД сброшен у <b>{count}</b> пользователей.",
        parse_mode="HTML",
        reply_markup=admin_keyboard(),
    )

    await callback.answer("Готово")


@dp.callback_query(
    F.data == "admin_broadcast"
)
async def admin_broadcast(
    callback: CallbackQuery,
):
    if callback.from_user.id not in ADMIN_IDS:
        await callback.answer(
            "Нет доступа",
            show_alert=True,
        )
        return

    ADMIN_ACTIONS[
        callback.from_user.id
    ] = "broadcast"

    await callback.message.answer(
        "📢 Напиши текст рассылки.\n\n"
        "После этого я покажу предпросмотр "
        "и попрошу подтверждение."
    )

    await callback.answer()


@dp.callback_query(
    F.data == "admin_confirm_broadcast"
)
async def admin_confirm_broadcast(
    callback: CallbackQue
