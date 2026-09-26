import asyncio
import os
import random
import signal
import sqlite3
import time
from pathlib import Path

from aiohttp import web
from aiogram import Bot, Dispatcher
from aiogram.filters import CommandStart
from aiogram.types import (
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

# Как часто проверяем пользователей на готовность.
# 60 секунд достаточно, чтобы сообщение пришло почти сразу
# после окончания 24 часов.
REMINDER_CHECK_INTERVAL = 60


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
# DATABASE
# =========================================================

def get_db():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()

    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                user_id INTEGER PRIMARY KEY,
                last_spin INTEGER NOT NULL DEFAULT 0,
                prize TEXT NOT NULL DEFAULT '',
                reminder_sent INTEGER NOT NULL DEFAULT 0
            )
            """
        )

        # Миграция для существующей базы:
        # если reminder_sent ещё нет — добавляем колонку.
        columns = conn.execute(
            "PRAGMA table_info(users)"
        ).fetchall()

        column_names = {
            column["name"]
            for column in columns
        }

        if "reminder_sent" not in column_names:
            conn.execute(
                """
                ALTER TABLE users
                ADD COLUMN reminder_sent INTEGER NOT NULL DEFAULT 0
                """
            )

        conn.commit()

    finally:
        conn.close()


def get_user(user_id: int):
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


def save_spin(user_id: int, prize: str):
    conn = get_db()

    try:
        conn.execute(
            """
            INSERT INTO users (
                user_id,
                last_spin,
                prize,
                reminder_sent
            )
            VALUES (?, ?, ?, 0)

            ON CONFLICT(user_id)
            DO UPDATE SET
                last_spin = excluded.last_spin,
                prize = excluded.prize,
                reminder_sent = 0
            """,
            (
                user_id,
                int(time.time()),
                prize,
            ),
        )

        conn.commit()

    finally:
        conn.close()


def get_remaining(user_id: int) -> int:
    user = get_user(user_id)

    if user is None:
        return 0

    last_spin = int(
        user["last_spin"] or 0
    )

    remaining = COOLDOWN - (
        int(time.time()) - last_spin
    )

    return max(0, remaining)


def get_users_ready_for_reminder():
    """
    Возвращает пользователей, у которых:

    1. была предыдущая прокрутка;
    2. прошло 24 часа;
    3. напоминание ещё не отправлялось.
    """

    conn = get_db()

    try:
        now = int(time.time())
        threshold = now - COOLDOWN

        return conn.execute(
            """
            SELECT
                user_id,
                last_spin
            FROM users
            WHERE
                last_spin > 0
                AND last_spin <= ?
                AND reminder_sent = 0
            """,
            (threshold,),
        ).fetchall()

    finally:
        conn.close()


def mark_reminder_sent(user_id: int):
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
# TELEGRAM KEYBOARD
# =========================================================

def get_spin_keyboard():
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


# =========================================================
# REMINDER WORKER
# =========================================================

async def reminder_worker(bot: Bot):
    """
    Постоянно проверяет SQLite.

    Когда человеку снова доступна прокрутка,
    отправляет одно сообщение.

    После успешной отправки ставит reminder_sent = 1.

    После следующей прокрутки save_spin()
    автоматически возвращает reminder_sent = 0.
    """

    print(
        "Reminder worker started"
    )

    while True:

        try:

            users = get_users_ready_for_reminder()

            if users:
                print(
                    f"Reminder worker: "
                    f"{len(users)} user(s) ready"
                )

            for user in users:

                user_id = int(
                    user["user_id"]
                )

                text = (
                    "🎁 <b>Твоя новая прокрутка доступна!</b>\n\n"
                    "Прошло 24 часа — можно снова "
                    "крутить рулетку и попытать удачу. 🎰"
                )

                try:

                    await bot.send_message(
                        chat_id=user_id,
                        text=text,
                        parse_mode="HTML",
                        reply_markup=get_spin_keyboard(),
                    )

                    mark_reminder_sent(
                        user_id
                    )

                    print(
                        f"Reminder sent to "
                        f"{user_id}"
                    )

                except Exception as error:

                    # Например, пользователь мог заблокировать бота.
                    # В таком случае не крутим базу бесконечно.
                    print(
                        f"Failed to send reminder "
                        f"to {user_id}: {error}"
                    )

                    # Если Telegram говорит, что пользователь
                    # недоступен, считаем попытку обработанной.
                    error_text = str(error).lower()

                    if (
                        "blocked" in error_text
                        or "chat not found" in error_text
                        or "user is deactivated" in error_text
                    ):
                        mark_reminder_sent(
                            user_id
                        )

        except asyncio.CancelledError:
            print(
                "Reminder worker stopped"
            )
            raise

        except Exception as error:

            print(
                f"Reminder worker error: "
                f"{error}"
            )

        await asyncio.sleep(
            REMINDER_CHECK_INTERVAL
        )


# =========================================================
# WEB APP
# =========================================================

def create_app():
    app = web.Application()

    async def index(request):
        index_file = WEB_DIR / "index.html"

        if not index_file.exists():
            return web.Response(
                text="Mini App files not found",
                status=404,
            )

        return web.FileResponse(
            index_file
        )

    async def health(request):
        return web.json_response(
            {
                "status": "ok",
                "database": DB_PATH.name,
            }
        )

    async def static_file(request):
        filename = request.match_info[
            "filename"
        ]

        file_path = WEB_DIR / filename

        if not file_path.exists():
            raise web.HTTPNotFound()

        if not file_path.is_file():
            raise web.HTTPNotFound()

        return web.FileResponse(
            file_path
        )

    async def user_api(request):

        try:
            user_id = int(
                request.match_info[
                    "user_id"
                ]
            )

        except (TypeError, ValueError):

            return web.json_response(
                {
                    "error": "invalid user_id"
                },
                status=400,
            )

        user = get_user(user_id)

        if user is None:

            return web.json_response(
                {
                    "user_id": user_id,
                    "last_spin": 0,
                    "prize": "",
                    "can_spin": True,
                    "remaining": 0,
                }
            )

        remaining = get_remaining(
            user_id
        )

        return web.json_response(
            {
                "user_id": user["user_id"],
                "last_spin": user["last_spin"],
                "prize": user["prize"],
                "can_spin": remaining <= 0,
                "remaining": remaining,
            }
        )

    async def spin_api(request):

        try:
            data = await request.json()

        except Exception:

            return web.json_response(
                {
                    "error": "invalid json"
                },
                status=400,
            )

        try:
            user_id = int(
                data.get("user_id")
            )

        except (TypeError, ValueError):

            return web.json_response(
                {
                    "error": "invalid user_id"
                },
                status=400,
            )

        remaining = get_remaining(
            user_id
        )

        if remaining > 0:

            return web.json_response(
                {
                    "success": False,
                    "error": "cooldown",
                    "remaining": remaining,
                },
                status=429,
            )

        prize = random.choice(
            PRIZES
        )

        save_spin(
            user_id,
            prize,
        )

        return web.json_response(
            {
                "success": True,
                "prize": prize,
                "remaining": COOLDOWN,
            }
        )

    app.router.add_get(
        "/",
        index,
    )

    app.router.add_get(
        "/health",
        health,
    )

    app.router.add_get(
        "/api/user/{user_id}",
        user_api,
    )

    app.router.add_post(
        "/api/spin",
        spin_api,
    )

    app.router.add_get(
        "/{filename:.*\\.(?:css|js|png|jpg|jpeg|gif|svg|ico|webp)}",
        static_file,
    )

    return app


# =========================================================
# TELEGRAM BOT
# =========================================================

dp = Dispatcher()
from admin import register_admin_handlers

register_admin_handlers(dp)


@dp.message(CommandStart())
async def start_handler(
    message: Message
):

    text = (
        "👨‍🍳 <b>Добро пожаловать "
        "в «Поварскую Раздачу»!</b>\n\n"
        "🎁 Здесь тебя ждёт "
        "ежедневная раздача.\n"
        "Крути рулетку и забирай свой приз!"
    )

    keyboard = get_spin_keyboard()

    if keyboard:

        await message.answer(
            text,
            reply_markup=keyboard,
            parse_mode="HTML",
        )

    else:

        await message.answer(
            text
            + "\n\n"
            + "⚠️ WEBAPP_URL пока не настроен."
        )


# =========================================================
# WEB SERVER
# =========================================================

async def run_web():

    app = create_app()

    runner = web.AppRunner(
        app
    )

    await runner.setup()

    port = int(
        os.getenv(
            "PORT",
            "8080",
        )
    )

    site = web.TCPSite(
        runner,
        "0.0.0.0",
        port,
    )

    await site.start()

    print(
        f"Web server started on port {port}"
    )

    return runner


# =========================================================
# MAIN
# =========================================================

async def main():

    print(
        "Starting application..."
    )

    init_db()

    print(
        f"Database initialized: "
        f"{DB_PATH}"
    )

    bot = Bot(
        token=BOT_TOKEN
    )

    runner = await run_web()

    stop_event = asyncio.Event()

    def request_shutdown():

        print(
            "Shutdown signal received. "
            "Stopping application..."
        )

        stop_event.set()

    loop = asyncio.get_running_loop()

    for sig in (
        signal.SIGTERM,
        signal.SIGINT,
    ):

        try:

            loop.add_signal_handler(
                sig,
                request_shutdown,
            )

        except NotImplementedError:
            pass

    polling_task = None
    reminder_task = None

    try:

        print(
            "Bot started"
        )

        polling_task = asyncio.create_task(
            dp.start_polling(
                bot,
                handle_signals=False,
            )
        )

        reminder_task = asyncio.create_task(
            reminder_worker(
                bot
            )
        )

        stop_task = asyncio.create_task(
            stop_event.wait()
        )

        done, pending = await asyncio.wait(
            {
                polling_task,
                reminder_task,
                stop_task,
            },
            return_when=asyncio.FIRST_COMPLETED,
        )

        if stop_task in done:

            print(
                "Shutdown requested."
            )

            try:
                await dp.stop_polling()
            except Exception:
                pass

        for task in pending:

            task.cancel()

        for task in pending:

            try:
                await task
            except asyncio.CancelledError:
                pass
            except Exception as error:

                print(
                    f"Task stopped: {error}"
                )

    finally:

        print(
            "Cleaning up application..."
        )

        try:
            await dp.stop_polling()
        except Exception:
            pass

        if reminder_task:

            reminder_task.cancel()

            try:
                await reminder_task
            except asyncio.CancelledError:
                pass

        if polling_task:

            polling_task.cancel()

            try:
                await polling_task
            except asyncio.CancelledError:
                pass

        await runner.cleanup()

        await bot.session.close()

        print(
            "Application stopped cleanly"
        )


# =========================================================
# START
# =========================================================

if __name__ == "__main__":
    asyncio.run(main())
