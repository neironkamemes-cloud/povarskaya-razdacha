const tg = window.Telegram.WebApp;

tg.ready();
tg.expand();

const wheel = document.getElementById("wheel");
const spinButton = document.getElementById("spinButton");
const prizeElement = document.getElementById("prize");
const statusElement = document.getElementById("status");

const COOLDOWN = 24 * 60 * 60;

const prizes = [
    "❌", "❌", "❌", "❌", "❌",
    "❌", "❌", "🐻", "❌", "❌",
    "❌", "❌", "❌", "❌", "❌"
];

const colors = [
    "#ff7675", "#74b9ff", "#55efc4", "#ffeaa7",
    "#a29bfe", "#fd79a8", "#81ecec", "#fab1a0",
    "#70a1ff", "#7bed9f", "#eccc68", "#ff6b81",
    "#70a1ff", "#7bed9f", "#ff9ff3"
];

let rotation = 0;
let spinning = false;
let countdownTimer = null;

const userId =
    tg.initDataUnsafe?.user?.id || 0;


// ======================================================
// СОЗДАНИЕ КОЛЕСА
// ======================================================

function buildWheel() {
    if (!wheel) {
        console.error("Wheel element not found");
        return;
    }

    const sectorAngle = 360 / prizes.length;

    const gradient = prizes
        .map((_, index) => {
            const start = index * sectorAngle;
            const end = (index + 1) * sectorAngle;

            return `${colors[index]} ${start}deg ${end}deg`;
        })
        .join(", ");

    wheel.style.background =
        `conic-gradient(${gradient})`;

    wheel.innerHTML = "";

    prizes.forEach((emoji, index) => {
        const sector =
            document.createElement("div");

        sector.className =
            "roulette-sector";

        sector.textContent =
            emoji;

        const angle =
            index * sectorAngle +
            sectorAngle / 2;

        sector.style.transform =
            `rotate(${angle}deg) translateY(-92px)`;

        wheel.appendChild(sector);
    });
}


// ======================================================
// КНОПКА
// ======================================================

function enableButton() {
    spinButton.disabled = false;
    spinButton.textContent = "🎰 КРУТИТЬ";
}

function disableButton(text) {
    spinButton.disabled = true;
    spinButton.textContent = text;
}


// ======================================================
// ТАЙМЕР
// ======================================================

function formatTime(seconds) {
    seconds = Math.max(0, Math.floor(seconds));

    const hours =
        Math.floor(seconds / 3600);

    const minutes =
        Math.floor((seconds % 3600) / 60);

    const secs =
        seconds % 60;

    return (
        String(hours).padStart(2, "0") +
        ":" +
        String(minutes).padStart(2, "0") +
        ":" +
        String(secs).padStart(2, "0")
    );
}


function startCountdown(seconds) {
    clearInterval(countdownTimer);

    let remaining =
        Math.max(0, Math.floor(seconds));

    if (remaining <= 0) {
        enableButton();
        return;
    }

    disableButton("⏳ Ожидание...");

    function tick() {
        if (remaining <= 0) {
            clearInterval(countdownTimer);

            enableButton();

            statusElement.textContent =
                "🎁 Прокрутка снова доступна!";

            return;
        }

        statusElement.textContent =
            "⏳ Следующая прокрутка через " +
            formatTime(remaining);

        remaining--;
    }

    tick();

    countdownTimer =
        setInterval(tick, 1000);
}


// ======================================================
// РЕЗУЛЬТАТ
// ======================================================

function getPrizeEmoji(prize) {
    return String(prize).includes("🐻")
        ? "🐻"
        : "❌";
}


function getPrizeSector(emoji) {
    const available = [];

    prizes.forEach((item, index) => {
        if (item === emoji) {
            available.push(index);
        }
    });

    if (!available.length) {
        return 0;
    }

    return available[
        Math.floor(
            Math.random() * available.length
        )
    ];
}


// ======================================================
// ВРАЩЕНИЕ
// ======================================================

function spinWheel(emoji) {
    return new Promise(resolve => {
        if (!wheel) {
            resolve();
            return;
        }

        const sectorAngle =
            360 / prizes.length;

        const targetSector =
            getPrizeSector(emoji);

        const targetCenter =
            targetSector * sectorAngle +
            sectorAngle / 2;

        const targetAngle =
            360 - targetCenter;

        const currentAngle =
            ((rotation % 360) + 360) % 360;

        const correction =
            (targetAngle -
                currentAngle +
                360) % 360;

        const finalRotation =
            rotation +
            (8 * 360) +
            correction;

        // Важно: сначала фиксируем текущее положение
        wheel.style.transition = "none";

        wheel.style.transform =
            `rotate(${rotation}deg)`;

        // Принудительно применяем состояние
        void wheel.offsetWidth;

        // Затем запускаем настоящее CSS-вращение
        wheel.style.transition =
            "transform 6s cubic-bezier(0.12, 0.72, 0.08, 1)";

        wheel.style.transform =
            `rotate(${finalRotation}deg)`;

        rotation =
            finalRotation;

        let finished = false;

        function finish() {
            if (finished) {
                return;
            }

            finished = true;

            wheel.removeEventListener(
                "transitionend",
                finish
            );

            resolve();
        }

        wheel.addEventListener(
            "transitionend",
            finish,
            { once: true }
        );

        // Запасной вариант для Telegram WebView
        setTimeout(
            finish,
            6500
        );
    });
}


// ======================================================
// ЗАГРУЗКА ПОЛЬЗОВАТЕЛЯ
// ======================================================

async function loadUser() {
    if (!userId) {
        statusElement.textContent =
            "⚠️ Не удалось определить пользователя Telegram.";

        disableButton("Недоступно");

        return;
    }

    try {
        const response =
            await fetch(
                `/api/user/${encodeURIComponent(userId)}`
            );

        const data =
            await response.json();

        if (!response.ok) {
            throw new Error(
                "Ошибка получения данных пользователя"
            );
        }

        if (data.prize) {
            prizeElement.textContent =
                getPrizeEmoji(data.prize);
        }

        if (data.remaining > 0) {
            startCountdown(
                data.remaining
            );

            return;
        }

        enableButton();

        statusElement.textContent =
            "🎁 Твоя прокрутка доступна!";

    } catch (error) {
        console.error(error);

        statusElement.textContent =
            "⚠️ Не удалось загрузить данные.";

        enableButton();
    }
}


// ======================================================
// НАЖАТИЕ КНОПКИ
// ======================================================

spinButton.addEventListener(
    "click",
    async () => {

        if (spinning) {
            return;
        }

        if (!userId) {
            statusElement.textContent =
                "⚠️ Не найден Telegram ID.";

            return;
        }

        spinning = true;

        disableButton("🎰 Крутим...");

        statusElement.textContent =
            "🎰 Рулетка крутится...";

        try {
            const response =
                await fetch(
                    "/api/spin",
                    {
                        method: "POST",

                        headers: {
                            "Content-Type":
                                "application/json"
                        },

                        body:
                            JSON.stringify({
                                user_id:
                                    userId
                            })
                    }
                );

            const data =
                await response.json();

            if (!response.ok) {
                if (data.remaining) {
                    startCountdown(
                        data.remaining
                    );
                } else {
                    statusElement.textContent =
                        data.error ||
                        "⚠️ Не удалось прокрутить рулетку.";

                    enableButton();
                }

                spinning = false;

                return;
            }

            const prize =
                data.prize ||
                "❌ Ничего";

            const emoji =
                getPrizeEmoji(prize);

            // СНАЧАЛА крутим колесо
            await spinWheel(emoji);

            // И ТОЛЬКО после остановки
            // меняем центральный результат
            prizeElement.textContent =
                emoji;

            if (emoji === "🐻") {
                statusElement.textContent =
                    "🎉 Тебе выпал Медведь! 🐻";
            } else {
                statusElement.textContent =
                    "😔 Увы, в этот раз ничего.";
            }

            startCountdown(
                data.remaining ||
                COOLDOWN
            );

        } catch (error) {
            console.error(error);

            statusElement.textContent =
                "⚠️ Ошибка соединения с сервером.";

            enableButton();
        }

        spinning = false;
    }
);


// ======================================================
// ЗАПУСК
// ======================================================

buildWheel();
loadUser();
