const tg = window.Telegram.WebApp;

tg.ready();
tg.expand();

const spinButton = document.getElementById("spinButton");
const prizeElement = document.getElementById("prize");
const statusElement = document.getElementById("status");
const rouletteElement = document.querySelector(".roulette");

const COOLDOWN = 24 * 60 * 60;

const rouletteItems = [
    "❌", "❌", "❌", "❌", "❌",
    "❌", "❌", "🐻", "❌", "❌",
    "❌", "❌", "❌", "❌", "❌"
];

const SECTOR_COUNT = rouletteItems.length;
const SECTOR_ANGLE = 360 / SECTOR_COUNT;

let spinning = false;
let currentRotation = 0;
let countdownInterval = null;

const userId = tg.initDataUnsafe?.user?.id || 0;


// =========================================================
// HELPERS
// =========================================================

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


function getPrizeEmoji(prize) {
    if (prize && String(prize).includes("🐻")) {
        return "🐻";
    }

    return "❌";
}


function disableSpin(text = "⏳ Крутим...") {
    spinButton.disabled = true;
    spinButton.textContent = text;
}


function enableSpin() {
    spinButton.disabled = false;
    spinButton.textContent = "🎰 КРУТИТЬ";
}


// =========================================================
// COUNTDOWN
// =========================================================

function startCountdown(seconds) {
    clearInterval(countdownInterval);

    let remaining = Math.max(0, Math.floor(seconds));

    if (remaining <= 0) {
        enableSpin();
        return;
    }

    disableSpin("⏳ Ожидание...");

    function update() {
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

    update();

    countdownInterval = setInterval(update, 1000);
}


// =========================================================
// WHEEL
// =========================================================

function createWheel() {
    if (!rouletteElement) {
        console.error("roulette element not found");
        return null;
    }

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
    wheel.style.width = "100%";
    wheel.style.height = "100%";
    wheel.style.borderRadius = "50%";
    wheel.style.overflow = "hidden";
    wheel.style.transformOrigin = "50% 50%";
    wheel.style.transform = "rotate(0deg)";
    wheel.style.transition = "none";
    wheel.style.zIndex = "1";

    const colors = [
        "#ff7675",
        "#74b9ff",
        "#55efc4",
        "#ffeaa7",
        "#a29bfe",
        "#fd79a8",
        "#81ecec",
        "#fab1a0",
        "#70a1ff",
        "#7bed9f",
        "#eccc68",
        "#ff6b81",
        "#70a1ff",
        "#7bed9f",
        "#ff9ff3"
    ];

    const gradientParts = [];

    for (let i = 0; i < SECTOR_COUNT; i++) {
        gradientParts.push(
            `${colors[i]} ${i * SECTOR_ANGLE}deg ${(i + 1) * SECTOR_ANGLE}deg`
        );
    }

    wheel.style.background =
        `conic-gradient(${gradientParts.join(",")})`;

    rouletteItems.forEach((item, index) => {
        const label =
            document.createElement("div");

        const angle =
            index * SECTOR_ANGLE +
            SECTOR_ANGLE / 2;

        label.className =
            "roulette-sector";

        label.textContent = item;

        label.style.position = "absolute";
        label.style.left = "50%";
        label.style.top = "50%";
        label.style.width = "44%";
        label.style.height = "44%";
        label.style.marginLeft = "-22%";
        label.style.marginTop = "-22%";

        label.style.display = "flex";
        label.style.alignItems = "center";
        label.style.justifyContent = "center";

        label.style.fontSize = "24px";
        label.style.fontWeight = "bold";

        label.style.pointerEvents = "none";

        label.style.transform =
            `rotate(${angle}deg) translateY(-92px)`;

        wheel.appendChild(label);
    });

    rouletteElement.insertBefore(
        wheel,
        rouletteElement.firstChild
    );

    return wheel;
}


// =========================================================
// FIND PRIZE
// =========================================================

function findPrizeSector(emoji) {
    const indexes = [];

    rouletteItems.forEach(
        (item, index) => {
            if (item === emoji) {
                indexes.push(index);
            }
        }
    );

    if (indexes.length === 0) {
        return 0;
    }

    return indexes[
        Math.floor(
            Math.random() * indexes.length
        )
    ];
}


// =========================================================
// SPIN
// =========================================================

function spinWheel(finalEmoji) {
    return new Promise(resolve => {
        const wheel =
            rouletteElement?.querySelector(
                ".roulette-wheel"
            );

        if (!wheel) {
            resolve();
            return;
        }

        const targetSector =
            findPrizeSector(finalEmoji);

        const sectorCenter =
            targetSector * SECTOR_ANGLE +
            SECTOR_ANGLE / 2;

        /*
         * Верхняя точка колеса = указатель.
         * Поэтому крутим до нужного сектора.
         */

        const targetRotation =
            360 - sectorCenter;

        const normalizedCurrent =
            ((currentRotation % 360) + 360) % 360;

        const additionalRotation =
            (
                targetRotation -
                normalizedCurrent +
                360
            ) % 360;

        // 7 полных оборотов + точное попадание
        const totalRotation =
            7 * 360 +
            additionalRotation;

        const startRotation =
            currentRotation;

        const endRotation =
            startRotation +
            totalRotation;

        // Начальное положение
        wheel.style.transition = "none";

        wheel.style.transform =
            `rotate(${startRotation}deg)`;

        // Принудительно применяем начальное состояние
        void wheel.offsetWidth;

        // Реальное вращение
        wheel.style.transition =
            "transform 6s cubic-bezier(0.12, 0.72, 0.08, 1)";

        wheel.style.transform =
            `rotate(${endRotation}deg)`;

        currentRotation =
            endRotation;

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

            currentRotation =
                ((endRotation % 360) + 360) % 360;

            wheel.style.transition = "none";

            wheel.style.transform =
                `rotate(${currentRotation}deg)`;

            resolve();
        }

        wheel.addEventListener(
            "transitionend",
            finish,
            {
                once: true
            }
        );

        // Запасной вариант для Telegram WebView
        setTimeout(
            finish,
            6500
        );
    });
}


// =========================================================
// LOAD USER
// =========================================================

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
                `/api/user/${encodeURIComponent(userId)}`
            );

        const data =
            await response.json();

        if (!response.ok) {
            throw new Error(
                "Ошибка получения пользователя"
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

        enableSpin();

        statusElement.textContent =
            "🎁 Твоя прокрутка доступна!";

    } catch (error) {
        console.error(error);

        statusElement.textContent =
            "⚠️ Не удалось загрузить данные.";

        enableSpin();
    }
}


// =========================================================
// SPIN BUTTON
// =========================================================

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

        disableSpin();

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

                        body: JSON.stringify({
                            user_id: userId
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
                        "⚠️ Не удалось прокрутить рулетку.";

                    enableSpin();
                }

                spinning = false;

                return;
            }

            const prize =
                data.prize ||
                "❌ Ничего";

            const finalEmoji =
                getPrizeEmoji(prize);

            /*
             * Сначала настоящее вращение.
             * Только после окончания показываем результат.
             */

            await spinWheel(
                finalEmoji
            );

            prizeElement.textContent =
                finalEmoji;

            if (
                String(prize).includes("🐻")
            ) {
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

            enableSpin();
        }

        spinning = false;
    }
);


// =========================================================
// START
// =========================================================

createWheel();

loadUserState();
