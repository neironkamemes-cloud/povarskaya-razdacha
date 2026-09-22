# Поварская Раздача

## 1. Создать бота
В Telegram открой @BotFather, создай бота и получи токен.

## 2. Настроить
Скопируй `.env.example` в `.env` и укажи:
BOT_TOKEN=твой_токен
WEBAPP_URL=https://твой-домен/

## 3. Установка
Python 3.11+:
pip install -r requirements.txt

## 4. Запуск
Linux/macOS:
export BOT_TOKEN="..."
export WEBAPP_URL="https://твой-домен/"
python bot/main.py

Windows PowerShell:
$env:BOT_TOKEN="..."
$env:WEBAPP_URL="https://твой-домен/"
python bot/main.py

## Важно
Для Telegram Mini App нужен публичный HTTPS-адрес. Для продакшена лучше запускать за reverse proxy (например, nginx) и с доменом.

## Следующий этап
Для реального продакшена стоит добавить проверку Telegram WebApp initData на сервере, PostgreSQL, админ-панель и серверную логику инвентаря/призов.
