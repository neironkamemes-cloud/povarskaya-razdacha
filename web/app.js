const tg = window.Telegram.WebApp;

tg.ready();
tg.expand();

const spinButton = document.getElementById("spinButton");
const prizeElement = document.getElementById("prize");
const statusElement = document.getElementById("status");
const rouletteElement = document.querySelector(".roulette");

const COOLDOWN = 24 * 60 * 60;

let countdownInterval = null;
let spinning = false;
let currentRotation = 0;

const userId = tg.initDataUnsafe?.user?.id || 0;


// ==========================================
// ПРИЗЫ ДЛЯ ВИЗУАЛЬНОЙ РУЛЕТКИ
// 15 СЕКТОРОВ
// ==========================================

const rouletteItems = [
    "❌",
    "❌",
    "❌",
    "❌",
    "❌",
    "❌",
    "❌",
    "🐻",
    "❌",
    "❌",
    "❌",
    "❌",
    "❌",
    "❌",
    "❌"
];

const SECTOR_COUNT = rouletteItems.length;
const SECTOR_ANGLE = 360 / SECTOR_COUNT;


// ==========================================
// EMOJI ПРИЗА
// ==========================================

function getPrizeEmoji(prize) {
    if (!prize) {
        return "❌";
    }

    if (prize.includes("🐻")) {
        return "🐻";
    }

    return "❌";
}


// ==========================================
// ФОРМАТ ВРЕМЕНИ
// ==========================================

function formatTime(seconds) {
    seconds = Math.max(0, Math.floor(seconds));

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    return (
        String(hours).padStart(2, "0") +
        ":" +
        String(minutes).padStart(2, "0") +
        ":" +
        String(secs).padStart(2, "0")
    );
}


// ==========================================
// КУЛДАУН
// ==========================================

function startCountdown(seconds) {
    clearInterval(countdownInterval);

    let remaining = Math.max(0, Math.floor(seconds));

    if (remaining <= 0) {
        enableSpin();
        return;
    }

    disableSpin();

    function updateTimer() {
        if (remaining <= 0) {
            clearInterval(countdownInterval);

            enableSpin();

            statusElement.textContent =
                "🎁 Прокрутка снова доступна!";

            return;
        }

        statusElement.textContent =
            "⏳ Следующая прокрутка через " +
            formatTime(remaining);

        remaining--;
    }

    updateTimer();

    countdownInterval =
        setInterval(updateTimer, 1000);
}


// ==========================================
// КНОПКА
// ==========================================

function disableSpin() {
    spinButton.disabled = true;
    spinButton.textContent = "⏳ Ожидайте...";
}

function enableSpin() {
    spinButton.disabled = false;
    spinButton.textContent = "🎰 КРУТИТЬ";
}


// ==========================================
// СОЗДАЁМ НАСТОЯЩИЕ СЕКТОРА
// ==========================================

function createRouletteWheel() {
    if (!rouletteElement) {
        return;
    }

    // Удаляем старое содержимое колеса,
    // кроме указателя и центрального блока
    const oldWheel =
        rouletteElement.querySelector(".roulette-wheel");

    if (oldWheel) {
        oldWheel.remove();
    }

    const wheel =
        document.createElement("div");

    wheel.className = "roulette-wheel";

    wheel.style.position = "absolute";
    wheel.style.inset = "0";
    wheel.style.borderRadius = "50%";
    wheel.style.overflow = "hidden";
    wheel.style.transform =
        `rotate(${currentRotation}deg)`;

    // Цвета секторов
    const colors = [
        "#ff7675",
        "#74b9ff",
        "#55efc4",
        "#ffeaa7",
        "#a29bfe",
        "#fd79a8",
        "#81ecec"
    ];

    // Создаём секторные подписи
    rouletteItems.forEach((item, index) => {
        const sector =
            document.createElement("div");

        sector.className =
            "roulette-sector";

        sector.textContent = item;

        const angle =
            index * SECTOR_ANGLE;

        sector.style.position = "absolute";
        sector.style.left = "50%";
        sector.style.top = "50%";
        sector.style.width = "50%";
        sector.style.height = "50%";
        sector.style.transformOrigin = "0 0";

        sector.style.transform =
            `rotate(${angle}deg) skewY(${90 - SECTOR_ANGLE}deg)`;

        sector.style.background =
            colors[index % colors.length];

        sector.style.display = "flex";
        sector.style.alignItems = "center";
        sector.style.justifyContent = "center";

        sector.style.fontSize = "24px";
        sector.style.fontWeight = "bold";

        sector.style.border =
            "1px solid rgba(255,255,255,0.7)";

        wheel.appendChild(sector);
    });

    rouletteElement.insertBefore(
        wheel,
        rouletteElement.firstChild
    );
}


// ==========================================
// НАХОДИМ СЕКТОР ПРИЗА
// ==========================================

function findPrizeSector(finalEmoji) {
    const possibleIndexes = [];

    rouletteItems.forEach((item, index) => {
        if (item === finalEmoji) {
            possibleIndexes.push(index);
        }
    });

    if (possibleIndexes.length === 0) {
        return 0;
    }

    return possibleIndexes[
        Math.floor(
            Math.random() *
            possibleIndexes.length
        )
    ];
}


// ==========================================
// ВРАЩЕНИЕ НАСТОЯЩЕГО КОЛЕСА
// ==========================================

function spinWheel(finalEmoji) {
    return new Promise((resolve) => {

        if (!rouletteElement) {
            resolve();
            return;
        }

        const wheel =
            rouletteElement.querySelector(
                ".roulette-wheel"
            );

        if (!wheel) {
            resolve();
            return;
        }

        const targetSector =
            findPrizeSector(finalEmoji);

        /*
         * Центр выбранного сектора.
         *
         * Нам нужно повернуть колесо так,
         * чтобы выбранный сектор оказался
         * под верхним указателем.
         */

        const sectorCenter =
            targetSector * SECTOR_ANGLE +
            SECTOR_ANGLE / 2;

        const targetAngle =
            360 - sectorCenter;

        const fullTurns = 6;

        const normalizedRotation =
            ((currentRotation % 360) + 360) % 360;

        const delta =
            fullTurns * 360 +
            targetAngle -
            normalizedRotation;

        currentRotation += delta;

        wheel.style.transition =
            "transform 5.5s cubic-bezier(0.12, 0.72, 0.08, 1)";

        wheel.style.transform =
            `rotate(${currentRotation}deg)`;

        setTimeout(() => {

            // Убираем transition,
            // чтобы следующий запуск был корректным
            wheel.style.transition = "none";

            currentRotation =
                ((currentRotation % 360) + 360) % 360;

            wheel.style.transform =
                `rotate(${currentRotation}deg)`;

            resolve();

        }, 5700);
    });
}


// ==========================================
// ЗАГРУЗКА СОСТОЯНИЯ
// ==========================================

async function loadUserState() {

    if (!userId) {

        statusElement.textContent =
            "⚠️ Не удалось определить пользователя Telegram.";

        disableSpin();

        return;
    }

    try {

        const response =
            await fetch(
                "/api/user/" +
                encodeURIComponent(userId)
            );

        const data =
            await response.json();

        if (!response.ok) {
            throw new Error(
                "Ошибка получения состояния"
            );
        }

        if (data.last_spin) {

            const now =
                Math.floor(
                    Date.now() / 1000
                );

            const remaining =
                COOLDOWN -
                (
                    now -
                    Number(data.last_spin)
                );

            if (remaining > 0) {

                if (data.prize) {

                    prizeElement.textContent =
                        getPrizeEmoji(
                            data.prize
                        );
                }

                startCountdown(
                    remaining
                );

                return;
            }
        }

        enableSpin();

        statusElement.textContent =
            "🎁 Твоя прокрутка доступна!";

    }
    catch (error) {

        console.error(error);

        statusElement.textContent =
            "⚠️ Не удалось загрузить данные.";

        enableSpin();
    }
}


// ==========================================
// КРУТИТЬ
// ==========================================

spinButton.addEventListener(
    "click",
    async () => {

        if (spinning) {
            return;
        }

        spinning = true;

        disableSpin();

        statusElement.textContent =
            "🎰 Рулетка крутится...";

        try {

            // Получаем настоящий результат
            // с сервера
            const response =
                await fetch(
                    "/api/spin",
                    {
                        method: "POST",

                        headers: {
                            "Content-Type":
                                "application/json"
                        },

                        body: JSON.stringify({
                            user_id: userId
                        })
                    }
                );

            const data =
                await response.json();


            // Ошибка / кулдаун
            if (!response.ok) {

                if (data.remaining) {

                    startCountdown(
                        data.remaining
                    );

                } else {

                    statusElement.textContent =
                        data.error ||
                        "⚠️ Не удалось прокрутить рулетку.";

                    enableSpin();
                }

                spinning = false;

                return;
            }


            // Настоящий приз от main.py
            const prize =
                data.prize ||
                "❌ Ничего";

            const finalEmoji =
                getPrizeEmoji(prize);


            // ==================================
            // ЗАПУСКАЕМ НАСТОЯЩЕЕ КОЛЕСО
            // ==================================

            await spinWheel(
                finalEmoji
            );


            // Показываем результат
            prizeElement.textContent =
                finalEmoji;


            if (prize.includes("🐻")) {

                statusElement.textContent =
                    "🎉 Тебе выпал Медведь! 🐻";

            } else {

                statusElement.textContent =
                    "😔 Увы, в этот раз ничего.";
            }


            // Кулдаун
            startCountdown(
                data.remaining ||
                COOLDOWN
            );

        }
        catch (error) {

            console.error(error);

            statusElement.textContent =
                "⚠️ Ошибка соединения с сервером.";

            enableSpin();
        }

        spinning = false;
    }
);


// ==========================================
// ЗАПУСК
// ==========================================

createRouletteWheel();

loadUserState();
