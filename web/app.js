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
// ПРИЗ
// ==========================================

function getPrizeEmoji(prize) {
    if (prize && String(prize).includes("🐻")) {
        return "🐻";
    }

    return "❌";
}


// ==========================================
// ВРЕМЯ
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
// КУЛДАУН 24 ЧАСА
// ==========================================

function startCountdown(seconds) {
    clearInterval(countdownInterval);

    let remaining = Math.max(0, Math.floor(seconds));

    if (remaining <= 0) {
        enableSpin();
        return;
    }

    disableSpin();

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

    countdownInterval =
        setInterval(update, 1000);
}


// ==========================================
// ЦВЕТА КОЛЕСА
// ==========================================

function createGradient() {

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

    const parts = [];

    for (let i = 0; i < SECTOR_COUNT; i++) {

        const start =
            i * SECTOR_ANGLE;

        const end =
            (i + 1) * SECTOR_ANGLE;

        parts.push(
            `${colors[i]} ${start}deg ${end}deg`
        );
    }

    return `conic-gradient(${parts.join(",")})`;
}


// ==========================================
// СОЗДАНИЕ КОЛЕСА
// ==========================================

function createRouletteWheel() {

    if (!rouletteElement) {
        return;
    }

    const oldWheel =
        rouletteElement.querySelector(
            ".roulette-wheel"
        );

    if (oldWheel) {
        oldWheel.remove();
    }

    const wheel =
        document.createElement("div");

    wheel.className =
        "roulette-wheel";

    wheel.style.position =
        "absolute";

    wheel.style.inset =
        "0";

    wheel.style.width =
        "100%";

    wheel.style.height =
        "100%";

    wheel.style.borderRadius =
        "50%";

    wheel.style.overflow =
        "hidden";

    wheel.style.transformOrigin =
        "50% 50%";

    wheel.style.background =
        createGradient();

    wheel.style.willChange =
        "transform";

    wheel.style.transform =
        "rotate(0deg)";

    wheel.style.zIndex =
        "1";


    // ======================================
    // ЭМОДЗИ ВНУТРИ СЕКТОРОВ
    // ======================================

    rouletteItems.forEach(
        (item, index) => {

            const label =
                document.createElement("div");

            label.className =
                "roulette-sector";

            label.textContent =
                item;

            const angle =
                index * SECTOR_ANGLE +
                SECTOR_ANGLE / 2;


            label.style.position =
                "absolute";

            label.style.left =
                "50%";

            label.style.top =
                "50%";

            label.style.width =
                "44%";

            label.style.height =
                "44%";

            label.style.marginLeft =
                "-22%";

            label.style.marginTop =
                "-22%";

            label.style.transform =
                `rotate(${angle}deg) translateY(-92px)`;

            label.style.display =
                "flex";

            label.style.alignItems =
                "center";

            label.style.justifyContent =
                "center";

            label.style.fontSize =
                "24px";

            label.style.fontWeight =
                "bold";

            label.style.lineHeight =
                "1";

            label.style.pointerEvents =
                "none";

            label.style.zIndex =
                "2";

            wheel.appendChild(
                label
            );
        }
    );


    rouletteElement.insertBefore(
        wheel,
        rouletteElement.firstChild
    );
}


// ==========================================
// ИЩЕМ СЕКТОР С ПРИЗОМ
// ==========================================

function findPrizeSector(finalEmoji) {

    const indexes = [];

    rouletteItems.forEach(
        (item, index) => {

            if (item === finalEmoji) {
                indexes.push(index);
            }
        }
    );

    if (!indexes.length) {
        return 0;
    }

    return indexes[
        Math.floor(
            Math.random() *
            indexes.length
        )
    ];
}


// ==========================================
// НАСТОЯЩЕЕ ВРАЩЕНИЕ КОЛЕСА
// ==========================================

function spinWheel(finalEmoji) {
    return new Promise((resolve) => {
        const wheel = rouletteElement?.querySelector(".roulette-wheel");

        if (!wheel) {
            resolve();
            return;
        }

        const targetSector = findPrizeSector(finalEmoji);

        const sectorCenter =
            targetSector * SECTOR_ANGLE +
            SECTOR_ANGLE / 2;

        const targetAngle = 360 - sectorCenter;

        const fullTurns = 7 * 360;

        const current =
            ((currentRotation % 360) + 360) % 360;

        let delta =
            fullTurns +
            targetAngle -
            current;

        if (delta < fullTurns) {
            delta += 360;
        }

        const startRotation = currentRotation;
        const endRotation = currentRotation + delta;

        // Сбрасываем старую анимацию
        wheel.getAnimations().forEach(animation => {
            animation.cancel();
        });

        wheel.style.transition = "none";
        wheel.style.transform =
            `rotate(${startRotation}deg)`;

        // Принудительно заставляем WebView применить начальное состояние
        void wheel.offsetWidth;

        // Настоящая анимация самого колеса
        const animation = wheel.animate(
            [
                {
                    transform:
                        `rotate(${startRotation}deg)`
                },
                {
                    transform:
                        `rotate(${endRotation}deg)`
                }
            ],
            {
                duration: 6000,
                easing: "cubic-bezier(0.12, 0.72, 0.08, 1)",
                fill: "forwards"
            }
        );

        currentRotation = endRotation;

        animation.onfinish = () => {
            currentRotation =
                ((currentRotation % 360) + 360) % 360;

            wheel.style.transform =
                `rotate(${currentRotation}deg)`;

            wheel.style.transition = "none";

            resolve();
        };

        animation.oncancel = () => {
            resolve();
        };
    });
}
            currentRotation +=
                delta;


            /*
             * ВРАЩАЕМ ИМЕННО ВЕСЬ КРУГ
             */

            wheel.style.transition =
                "transform 6s cubic-bezier(0.12, 0.72, 0.08, 1)";

            wheel.style.transform =
                `rotate(${currentRotation}deg)`;


            setTimeout(
                () => {

                    currentRotation =
                        (
                            currentRotation % 360 +
                            360
                        ) % 360;


                    wheel.style.transition =
                        "none";

                    wheel.style.transform =
                        `rotate(${currentRotation}deg)`;


                    resolve();

                },
                6200
            );
        }
    );
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
                encodeURIComponent(
                    userId
                )
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
                    Number(
                        data.last_spin
                    )
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
// КНОПКА КРУТИТЬ
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


            // ==================================
            // КУЛДАУН
            // ==================================

            if (!response.ok) {

                if (data.remaining) {

                    startCountdown(
                        data.remaining
                    );

                }
                else {

                    statusElement.textContent =
                        data.error ||
                        "⚠️ Не удалось прокрутить рулетку.";

                    enableSpin();
                }


                spinning = false;

                return;
            }


            // ==================================
            // ПРИЗ С СЕРВЕРА
            // ==================================

            const prize =
                data.prize ||
                "❌ Ничего";


            const finalEmoji =
                getPrizeEmoji(
                    prize
                );


            // ==================================
            // ЗАПУСК ВРАЩЕНИЯ
            // ==================================

            await spinWheel(
                finalEmoji
            );


            // ==================================
            // РЕЗУЛЬТАТ
            // ==================================

            prizeElement.textContent =
                finalEmoji;


            if (
                String(prize).includes(
                    "🐻"
                )
            ) {

                statusElement.textContent =
                    "🎉 Тебе выпал Медведь! 🐻";

            }
            else {

                statusElement.textContent =
                    "😔 Увы, в этот раз ничего.";
            }


            // ==================================
            // КУЛДАУН
            // ==================================

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
