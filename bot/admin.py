import asyncio
import os
import sqlite3
import time
from pathlib import Path

from aiogram import Bot, Dispatcher, F
from aiogram.filters import Command
from aiogram.types import (
    Message,
    CallbackQuery,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
)


# =========================================================
# CONFIG
# =========================================================

BASE_DIR = Path(__file__).resolve().parent.parent
DB_PATH = BASE_DIR / "povarskaya.db"

# В Railway:
# ADMIN_IDS=5890820074,7052557964
#
# Если переменная не задана, используется первый ID.
_raw_admin_ids = os.getenv(
    "ADMIN_IDS",
    "5890820074",
)

ADMIN_IDS = {
    int(x.strip())
    for x in _raw_admin_ids.split(",")
    if x.strip().isdigit()
}


# =========================================================
# ADMIN STATE
# =========================================================

# {
#   telegram_id: {
#       "action": "message_user",
#       "user_id": 123
#   }
# }
#
# Или:
#
# {
#   telegram_id: "reset_user"
# }
#
ADMIN_STATE = {}


# =========================================================
# DATABASE
# =========================================================

def get_db():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def get_all_users():
    conn = get_db()

    try:
        return conn.execute(
            """
            SELECT
                user_id,
                last_spin,
                prize,
                reminder_sent
            FROM users
            ORDER BY last_spin DESC
            """
        ).fetchall()

    finally:
        conn.close()


def get_one_user(user_id: int):
    conn = get_db()

    try:
        return conn.execute(
            """
            SELECT
                user_id,
                last_spin,
                prize,
                reminder_sent
            FROM users
            WHERE user_id = ?
            """,
            (user_id,),
        ).fetchone()

    finally:
        conn.close()


def reset_user_cooldown(user_id: int):
    conn = get_db()

    try:
        cursor = conn.execute(
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

        return cursor.rowcount

    finally:
        conn.close()


def reset_all_cooldowns():
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


def get_statistics():
    now = int(time.time())

    conn = get_db()

    try:
        total = conn.execute(
            """
            SELECT COUNT(*) AS count
            FROM users
            """
        ).fetchone()["count"]

        day = conn.execute(
            """
            SELECT COUNT(*) AS count
            FROM users
            WHERE last_spin > 0
              AND last_spin >= ?
            """,
            (now - 86400,),
        ).fetchone()["count"]

        week = conn.execute(
            """
            SELECT COUNT(*) AS count
            FROM users
            WHERE last_spin > 0
              AND last_spin >= ?
            """,
            (now - 7 * 86400,),
        ).fetchone()["count"]

        month = conn.execute(
            """
            SELECT COUNT(*) AS count
            FROM users
            WHERE last_spin > 0
              AND last_spin >= ?
            """,
            (now - 30 * 86400,),
        ).fetchone()["count"]

        spins = conn.execute(
            """
            SELECT COUNT(*) AS count
            FROM users
            WHERE last_spin > 0
            """
        ).fetchone()["count"]

        reminders = conn.execute(
            """
            SELECT COUNT(*) AS count
            FROM users
            WHERE reminder_sent = 1
            """
        ).fetchone()["count"]

        return {
            "total": total,
            "day": day,
            "week": week,
            "month": month,
            "spins": spins,
            "reminders": reminders,
        }

    finally:
        conn.close()


# =========================================================
# ACCESS
# =========================================================

def is_admin(user_id: int) -> bool:
    return user_id in ADMIN_IDS


# =========================================================
# KEYBOARD
# =========================================================

def admin_keyboard():
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="📊 Статистика",
                    callback_data="admin:stats",
                ),
            ],
            [
                InlineKeyboardButton(
                    text="👤 Пользователь",
                    callback_data="admin:user",
                ),
            ],
            [
                InlineKeyboardButton(
                    text="🔄 Сбросить КД",
                    callback_data="admin:reset_user",
                ),
                InlineKeyboardButton(
                    text="🔄 Сбросить всем",
                    callback_data="admin:reset_all",
                ),
            ],
            [
                InlineKeyboardButton(
                    text="📨 Сообщение",
                    callback_data="admin:message_user",
                ),
            ],
            [
                InlineKeyboardButton(
                    text="📢 Рассылка",
                    callback_data="admin:broadcast",
                ),
            ],
        ]
    )


def back_keyboard():
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="⬅️ Админ-панель",
                    callback_data="admin:menu",
                ),
            ],
        ]
    )


def confirm_reset_all_keyboard():
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="✅ Да, сбросить всем",
                    callback_data="admin:reset_all_confirm",
                ),
            ],
            [
                InlineKeyboardButton(
                    text="❌ Отмена",
                    callback_data="admin:menu",
                ),
            ],
        ]
    )


# =========================================================
# TEXT
# =========================================================

def statistics_text():
    data = get_statistics()

    return (
        "📊 <b>Статистика бота</b>\n\n"
        f"👥 Всего пользователей: <b>{data['total']}</b>\n"
        f"🎰 Прокруток: <b>{data['spins']}</b>\n\n"
        f"🟢 Активность за 24ч: <b>{data['day']}</b>\n"
        f"🟢 Активность за 7 дней: <b>{data['week']}</b>\n"
        f"🟢 Активность за 30 дней: <b>{data['month']}</b>\n\n"
        f"🔔 Напоминаний обработано: <b>{data['reminders']}</b>"
    )


def user_text(user):
    if user is None:
        return "❌ Пользователь не найден."

    last_spin = int(user["last_spin"] or 0)

    if last_spin:
        last_spin_text = time.strftime(
            "%d.%m.%Y %H:%M:%S",
            time.localtime(last_spin),
        )
    else:
        last_spin_text = "никогда"

    return (
        "👤 <b>Пользователь</b>\n\n"
        f"🆔 ID: <code>{user['user_id']}</code>\n"
        f"🎰 Последняя прокрутка: <b>{last_spin_text}</b>\n"
        f"🎁 Последний результат: "
        f"<b>{user['prize'] or '—'}</b>\n"
        f"🔔 Reminder: "
        f"<b>{'да' if user['reminder_sent'] else 'нет'}</b>"
    )


# =========================================================
# MAIN MENU
# =========================================================

async def show_admin_menu(message: Message):
    await message.answer(
        "🔐 <b>Админ-панель</b>\n\n"
        "Выбери действие:",
        parse_mode="HTML",
        reply_markup=admin_keyboard(),
    )


# =========================================================
# /admin
# =========================================================

async def admin_command(message: Message):
    if not is_admin(message.from_user.id):
        return

    ADMIN_STATE.pop(
        message.from_user.id,
        None,
    )

    await show_admin_menu(message)


# =========================================================
# MENU CALLBACK
# =========================================================

async def admin_menu_callback(callback: CallbackQuery):
    if not is_admin(callback.from_user.id):
        await callback.answer(
            "Нет доступа.",
            show_alert=True,
        )
        return

    ADMIN_STATE.pop(
        callback.from_user.id,
        None,
    )

    await callback.message.edit_text(
        "🔐 <b>Админ-панель</b>\n\n"
        "Выбери действие:",
        parse_mode="HTML",
        reply_markup=admin_keyboard(),
    )

    await callback.answer()


# =========================================================
# STATS
# =========================================================

async def stats_callback(callback: CallbackQuery):
    if not is_admin(callback.from_user.id):
        await callback.answer(
            "Нет доступа.",
            show_alert=True,
        )
        return

    await callback.message.edit_text(
        statistics_text(),
        parse_mode="HTML",
        reply_markup=back_keyboard(),
    )

    await callback.answer()


# =========================================================
# USER INFO
# =========================================================

async def user_start_callback(callback: CallbackQuery):
    if not is_admin(callback.from_user.id):
        await callback.answer(
            "Нет доступа.",
            show_alert=True,
        )
        return

    ADMIN_STATE[callback.from_user.id] = {
        "action": "user",
    }

    await callback.message.answer(
        "👤 Отправь Telegram ID пользователя:"
    )

    await callback.answer()


# =========================================================
# RESET USER
# =========================================================

async def reset_user_start_callback(
    callback: CallbackQuery,
):
    if not is_admin(callback.from_user.id):
        await callback.answer(
            "Нет доступа.",
            show_alert=True,
        )
        return

    ADMIN_STATE[callback.from_user.id] = {
        "action": "reset_user",
    }

    await callback.message.answer(
        "🔄 Отправь Telegram ID пользователя,\n"
        "которому нужно сбросить КД:"
    )

    await callback.answer()


# =========================================================
# RESET ALL
# =========================================================

async def reset_all_start_callback(
    callback: CallbackQuery,
):
    if not is_admin(callback.from_user.id):
        await callback.answer(
            "Нет доступа.",
            show_alert=True,
        )
        return

    ADMIN_STATE.pop(
        callback.from_user.id,
        None,
    )

    await callback.message.edit_text(
        "⚠️ <b>Сбросить КД ВСЕМ пользователям?</b>\n\n"
        "Это действие обнулит last_spin и позволит "
        "пользователям снова воспользоваться доступной "
        "механикой бота.",
        parse_mode="HTML",
        reply_markup=confirm_reset_all_keyboard(),
    )

    await callback.answer()


async def reset_all_confirm_callback(
    callback: CallbackQuery,
):
    if not is_admin(callback.from_user.id):
        await callback.answer(
            "Нет доступа.",
            show_alert=True,
        )
        return

    count = reset_all_cooldowns()

    await callback.message.edit_text(
        "✅ <b>КД сброшен</b>\n\n"
        f"Обработано пользователей: <b>{count}</b>",
        parse_mode="HTML",
        reply_markup=back_keyboard(),
    )

    await callback.answer()


# =========================================================
# MESSAGE ONE USER
# =========================================================

async def message_user_start_callback(
    callback: CallbackQuery,
):
    if not is_admin(callback.from_user.id):
        await callback.answer(
            "Нет доступа.",
            show_alert=True,
        )
        return

    ADMIN_STATE[callback.from_user.id] = {
        "action": "message_user_id",
    }

    await callback.message.answer(
        "📨 Отправь Telegram ID пользователя:"
    )

    await callback.answer()


# =========================================================
# BROADCAST
# =========================================================

async def broadcast_start_callback(
    callback: CallbackQuery,
):
    if not is_admin(callback.from_user.id):
        await callback.answer(
            "Нет доступа.",
            show_alert=True,
        )
        return

    ADMIN_STATE[callback.from_user.id] = {
        "action": "broadcast",
    }

    await callback.message.answer(
        "📢 Отправь сообщение для рассылки.\n\n"
        "Оно будет отправлено всем пользователям,\n"
        "которые есть в таблице users."
    )

    await callback.answer()


# =========================================================
# TEXT INPUT
# =========================================================

async def admin_text_handler(
    message: Message,
):
    if not is_admin(message.from_user.id):
        return

    state = ADMIN_STATE.get(
        message.from_user.id
    )

    if not state:
        return

    action = state.get("action")

    # -----------------------------------------------------
    # USER INFO
    # -----------------------------------------------------

    if action == "user":

        try:
            user_id = int(
                message.text.strip()
            )
        except (TypeError, ValueError):
            await message.answer(
                "❌ ID должен быть числом."
            )
            return

        ADMIN_STATE.pop(
            message.from_user.id,
            None,
        )

        user = get_one_user(
            user_id
        )

        await message.answer(
            user_text(user),
            parse_mode="HTML",
            reply_markup=back_keyboard(),
        )

        return

    # -----------------------------------------------------
    # RESET USER
    # -----------------------------------------------------

    if action == "reset_user":

        try:
            user_id = int(
                message.text.strip()
            )
        except (TypeError, ValueError):
            await message.answer(
                "❌ ID должен быть числом."
            )
            return

        ADMIN_STATE.pop(
            message.from_user.id,
            None,
        )

        affected = reset_user_cooldown(
            user_id
        )

        if affected:
            text = (
                "✅ КД сброшен.\n\n"
                f"Пользователь: "
                f"<code>{user_id}</code>"
            )
        else:
            text = (
                "❌ Пользователь "
                "с таким ID не найден."
            )

        await message.answer(
            text,
            parse_mode="HTML",
            reply_markup=back_keyboard(),
        )

        return

    # -----------------------------------------------------
    # MESSAGE USER: FIRST STEP
    # -----------------------------------------------------

    if action == "message_user_id":

        try:
            user_id = int(
                message.text.strip()
            )
        except (TypeError, ValueError):
            await message.answer(
                "❌ ID должен быть числом."
            )
            return

        if get_one_user(user_id) is None:
            await message.answer(
                "❌ Этого пользователя нет "
                "в базе бота."
            )
            return

        ADMIN_STATE[message.from_user.id] = {
            "action": "message_user_text",
            "user_id": user_id,
        }

        await message.answer(
            "✏️ Теперь отправь текст сообщения:"
        )

        return

    # -----------------------------------------------------
    # MESSAGE USER: SECOND STEP
    # -----------------------------------------------------

    if action == "message_user_text":

        user_id = int(
            state["user_id"]
        )

        ADMIN_STATE.pop(
            message.from_user.id,
            None,
        )

        try:
            await message.bot.send_message(
                chat_id=user_id,
                text=message.text,
            )

            await message.answer(
                "✅ Сообщение отправлено.",
                reply_markup=back_keyboard(),
            )

        except Exception as error:

            await message.answer(
                "❌ Не удалось отправить сообщение.\n\n"
                f"<code>{error}</code>",
                parse_mode="HTML",
                reply_markup=back_keyboard(),
            )

        return

    # -----------------------------------------------------
    # BROADCAST
    # -----------------------------------------------------

    if action == "broadcast":

        text = message.text.strip()

        if not text:
            await message.answer(
                "❌ Сообщение пустое."
            )
            return

        ADMIN_STATE.pop(
            message.from_user.id,
            None,
        )

        users = get_all_users()

        sent = 0
        failed = 0

        status_message = await message.answer(
            "📢 Начинаю рассылку..."
        )

        for user in users:

            user_id = int(
                user["user_id"]
            )

            try:

                await message.bot.send_message(
                    chat_id=user_id,
                    text=text,
                )

                sent += 1

            except Exception as error:

                failed += 1

                print(
                    f"Broadcast failed "
                    f"for {user_id}: {error}"
                )

            # Не долбим Telegram слишком быстро.
            await asyncio.sleep(
                0.05
            )

        await status_message.edit_text(
            "📢 <b>Рассылка завершена</b>\n\n"
            f"✅ Отправлено: <b>{sent}</b>\n"
            f"❌ Ошибок: <b>{failed}</b>",
            parse_mode="HTML",
            reply_markup=back_keyboard(),
        )


# =========================================================
# REGISTRATION
# =========================================================

def register_admin_handlers(
    dp: Dispatcher,
):
    """
    Вызывается из main.py после создания Dispatcher.

    Добавляет только административные handlers.
    """

    dp.message.register(
        admin_command,
        Command("admin"),
    )

    dp.callback_query.register(
        admin_menu_callback,
        F.data == "admin:menu",
    )

    dp.callback_query.register(
        stats_callback,
        F.data == "admin:stats",
    )

    dp.callback_query.register(
        user_start_callback,
        F.data == "admin:user",
    )

    dp.callback_query.register(
        reset_user_start_callback,
        F.data == "admin:reset_user",
    )

    dp.callback_query.register(
        reset_all_start_callback,
        F.data == "admin:reset_all",
    )

    dp.callback_query.register(
        reset_all_confirm_callback,
        F.data == "admin:reset_all_confirm",
    )

    dp.callback_query.register(
        message_user_start_callback,
        F.data == "admin:message_user",
    )

    dp.callback_query.register(
        broadcast_start_callback,
        F.data == "admin:broadcast",
    )

    dp.message.register(
        admin_text_handler,
        lambda message: (
            is_admin(message.from_user.id)
            and message.from_user
