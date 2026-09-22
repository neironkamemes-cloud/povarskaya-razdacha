import asyncio
import os
import random
import sqlite3
import time
from pathlib import Path

from aiohttp import web
from aiogram import Bot, Dispatcher
from aiogram.filters import CommandStart
from aiogram.types import Message, InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo


BASE_DIR = Path(__file__).resolve().parent.parent
WEB_DIR = BASE_DIR / "web"
DB_PATH = BASE_DIR / "povarskaya.db"

BOT_TOKEN = os.getenv("BOT_TOKEN")
WEBAPP_URL = os.getenv("WEBAPP_URL", "")

if not BOT_TOKEN:
    raise RuntimeError("BOT_TOKEN is not set")

COOLDOWN = 24 * 60 * 60

PRIZES = [
    "❌ Ничего",
    "❌ Ничего",
    "❌ Ничего",
    "❌ Ничего",
    "🐻 Медведь (для выдачи напиши сюда - @myamyamurcherni",
    "❌ Ничего",
    "❌ Ничего",
]


def db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = db()

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            user_id INTEGER PRIMARY KEY,
            last_spin INTEGER DEFAULT 0,
            prize TEXT DEFAULT ''
        )
        """
    )

    conn.commit()
    conn.close()


def get_user(user_id: int):
    conn = db()

    row = conn.execute(
        "SELECT user_id, last_spin, prize FROM users WHERE user_id = ?",
        (user_id,),
    ).fetchone()

    conn.close()
    return row


def save_spin(user_id: int, prize: str):
    conn = db()

    conn.execute(
        """
        INSERT INTO users(user_id, last_spin, prize)
        VALUES (?, ?, ?)
        ON CONFLICT(user_id)
        DO UPDATE SET
            last_spin = excluded.last_spin,
            prize = excluded.prize
        """,
        (user_id, int(time.time()), prize),
    )

    conn.commit()
    conn.close()


def spin_available(user_id: int):
    user = get_user(user_id)

    if not user:
        return True, 0

    last_spin = user["last_spin"] or 0
    remaining = COOLDOWN - (int(time.time()) - last_spin)

    if remaining <= 0:
        return True, 0

    return False, remaining


def create_app():
    app = web.Application()

    async def index(request):
        index_file = WEB_DIR / "index.html"

        if not index_file.exists():
            return web.Response(
                text="Mini App files not found",
                status=404,
            )

        return web.FileResponse(index_file)

    async def static_file(request):
        filename = request.match_info["filename"]
        file_path = WEB_DIR / filename

        if not file_path.exists() or not file_path.is_file():
            raise web.HTTPNotFound()

        return web.FileResponse(file_path)

    async def health(request):
        return web.json_response({"status": "ok"})

    async def user_api(request):
        try:
            user_id = int(request.match_info["user_id"])
        except (TypeError, ValueError):
            return web.json_response(
                {"error": "invalid user_id"},
                status=400,
            )

        user = get_user(user_id)

        if not user:
            return web.json_response(
                {
                    "user_id": user_id,
                    "last_spin": 0,
                    "prize": "",
                    "can_spin": True,
                    "remaining": 0,
                }
            )

        available, remaining = spin_available(user_id)

        return web.json_response(
            {
                "user_id": user["user_id"],
                "last_spin": user["last_spin"],
                "prize": user["prize"],
                "can_spin": available,
                "remaining": remaining,
            }
        )

    async def spin_api(request):
        try:
            data = await request.json()
        except Exception:
            return web.json_response(
                {"error": "invalid json"},
                status=400,
            )

        try:
            user_id = int(data.get("user_id"))
        except (TypeError, ValueError):
            return web.json_response(
                {"error": "invalid user_id"},
                status=400,
            )

        available, remaining = spin_available(user_id)

        if not available:
            return web.json_response(
                {
                    "success": False,
                    "error": "cooldown",
                    "remaining": remaining,
                },
                status=429,
            )

        prize = random.choice(PRIZES)
        save_spin(user_id, prize)

        return web.json_response(
            {
                "success": True,
                "prize": prize,
                "remaining": COOLDOWN,
            }
        )

    app.router.add_get("/", index)
    app.router.add_get("/health", health)
    app.router.add_get("/api/user/{user_id}", user_api)
    app.router.add_post("/api/spin", spin_api)

    app.router.add_get(
        "/{filename:.*\\.(?:css|js|png|jpg|jpeg|gif|svg|ico|webp)}",
        static_file,
    )

    return app


dp = Dispatcher()


@dp.message(CommandStart())
async def start_handler(message: Message):
    text = (
        "👨‍🍳 Добро пожаловать в «Поварскую Раздачу»!\n\n"
        "🎁 Здесь тебя ждёт ежедневная раздача.\n"
        "Крути рулетку и забирай свой приз!"
    )

    if WEBAPP_URL:
        keyboard = InlineKeyboardMarkup(
            inline_keyboard=[
                [
                    InlineKeyboardButton(
                        text="🎁 Открыть раздачу",
                        web_app=WebAppInfo(url=WEBAPP_URL),
                    )
                ]
            ]
        )

        await message.answer(
            text,
            reply_markup=keyboard,
        )
    else:
        await message.answer(
            text
            + "\n\n⚠️ Mini App пока не настроен."
        )


async def run_web():
    app = create_app()

    runner = web.AppRunner(app)
    await runner.setup()

    port = int(os.getenv("PORT", "8080"))

    site = web.TCPSite(
        runner,
        "0.0.0.0",
        port,
    )

    await site.start()

    print(f"Web server started on port {port}")

    return runner


async def main():
    init_db()

    bot = Bot(token=BOT_TOKEN)

    runner = await run_web()

    try:
        print("Bot started")

        await dp.start_polling(bot)

    finally:
        await runner.cleanup()
        await bot.session.close()


if __name__ == "__main__":
    asyncio.run(main())
