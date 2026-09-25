const tg = window.Telegram?.WebApp;

if (tg) {
    tg.ready();
    tg.expand();
}


// ======================================================
// ELEMENTS
// ======================================================

const wheel = document.getElementById("wheel");
const spinButton = document.getElementById("spinButton");
const prizeElement = document.getElementById("prize");
const statusElement = document.getElementById("status");


// ======================================================
// SETTINGS
// ======================================================

const COOLDOWN = 24 * 60 * 60;

const prizes = [
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

let rotation = 0;
let spinning = false;
let countdownTimer = null;


// ======================================================
// TELEGRAM USER
// ======================================================

const userId =
    tg?.initDataUnsafe?.user?.id || 0;


// ======================================================
// WHEEL
// ======================================================

function buildWheel() {

    if (!wheel) {
        console.error("Wheel element not found");
        return;
    }

    const sectorAngle =
        360 / prizes.length;

    const gradient = prizes
        .map((_, index) => {

            const start =
                index * sectorAngle;

            const end =
                (index + 1) * sectorAngle;

            return (
                `${colors[index]} ${start}deg ${end}deg`
            );
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

    wheel.style.transform =
        "rotate(0deg)";
}


// ======================================================
// BUTTON
// ======================================================

function enableButton() {

    if (!spinButton) {
        return;
    }

    spinButton.disabled = false;
    spinButton.textContent = "🎰 КРУТИТЬ";
}


function disableButton(text) {

    if (!spinButton) {
        return;
    }

    spinButton.disabled = true;
    spinButton.textContent = text;
}


// ======================================================
// TIME
// ======================================================

function formatTime(seconds) {

    seconds =
        Math.max(
            0,
            Math.floor(seconds)
        );

    const hours =
        Math.floor(seconds / 3600);

    const minutes =
        Math.floor(
            (seconds % 3600) / 60
        );

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
        Math.max(
            0,
            Math.floor(seconds)
        );

    if (remaining <= 0) {

        enableButton();

        if (statusElement) {
            statusElement.textContent =
                "🎁 Твоя прокрутка доступна!";
        }

        return;
    }

    disableButton("⏳ Ожидание...");


    function tick() {

        if (remaining <= 0) {

            clearInterval(countdownTimer);

            enableButton();

            if (statusElement) {
                statusElement.textContent =
                    "🎁 Прокрутка снова доступна!";
            }

            return;
        }

        if (statusElement) {
            statusElement.textContent =
                "⏳ Следующая прокрутка через " +
                formatTime(remaining);
        }

        remaining--;
    }


    tick();

    countdownTimer =
        setInterval(
            tick,
            1000
        );
}


// ======================================================
// PRIZE
// ======================================================

function getPrizeEmoji(prize) {

    if (
        String(prize).includes("🐻")
    ) {
        return "🐻";
    }

    return "❌";
}


function getPrizeSector(emoji) {

    const available = [];

    prizes.forEach(
        (item, index) => {

            if (item === emoji) {
                available.push(index);
            }
        }
    );

    if (!available.length) {
        return 0;
    }

    return available[
        Math.floor(
            Math.random() *
            available.length
        )
    ];
}


// ======================================================
// REAL WHEEL ANIMATION
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


        /*
         * Pointer находится сверху.
         * Поэтому нужный сектор должен
         * прийти в положение 0 градусов.
         */

        const targetAngle =
            360 - targetCenter;


        /*
         * Нормализуем текущее положение.
         */

        const currentAngle =
            ((rotation % 360) + 360) % 360;


        /*
         * Сколько градусов нужно добавить,
         * чтобы попасть точно в нужный сектор.
         */

        const correction =
            (
                targetAngle -
                currentAngle +
                360
            ) % 360;


        /*
         * Минимум 8 полных оборотов.
         */

        const finalRotation =
            rotation +
            (8 * 360) +
            correction;


        /*
         * ВАЖНО:
         * полностью убираем старую анимацию.
         */

        wheel.style.transition =
            "none";


        wheel.style.transform =
            `rotate(${rotation}deg)`;


        /*
         * Принудительно заставляем браузер
         * применить начальное состояние.
         */

        wheel.getBoundingClientRect();


        /*
         * Запускаем новую анимацию
         * через requestAnimationFrame.
         */

        requestAnimationFrame(() => {

            requestAnimationFrame(() => {

                wheel.style.transition =
                    "transform 6s cubic-bezier(0.12, 0.72, 0.08, 1)";

                wheel.style.transform =
                    `rotate(${finalRotation}deg)`;

                rotation =
                    finalRotation;

            });

        });


        /*
         * Не полагаемся на transitionend.
         *
         * Telegram WebView иногда может
         * не отправить этот event.
         */

        setTimeout(
            () => {

                /*
                 * Фиксируем итоговое положение.
                 */

                wheel.style.transition =
                    "none";

                wheel.style.transform =
                    `rotate(${rotation}deg)`;


                resolve();

            },
            6200
        );

    });
}


// ======================================================
// LOAD USER
// ======================================================

async function loadUser() {

    if (!userId) {

        if (statusElement) {
            statusElement.textContent =
                "⚠️ Не удалось определить пользователя Telegram.";
        }

        disableButton(
            "Недоступно"
        );

        return;
    }


    try {

        const response =
            await fetch(
                `/api/user/${encodeURIComponent(userId)}`,
                {
                    method: "GET",
                    cache: "no-store"
                }
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
                getPrizeEmoji(
                    data.prize
                );
        }


        if (
            Number(data.remaining) > 0
        ) {

            startCountdown(
                Number(data.remaining)
            );

            return;
        }


        enableButton();


        if (statusElement) {
            statusElement.textContent =
                "🎁 Твоя прокрутка доступна!";
        }


    } catch (error) {

        console.error(
            "loadUser error:",
            error
        );


        if (statusElement) {
            statusElement.textContent =
                "⚠️ Не удалось загрузить данные.";
        }


        enableButton();
    }
}


// ======================================================
// SPIN
// ======================================================

async function handleSpin() {

    if (spinning) {
        return;
    }


    if (!userId) {

        if (statusElement) {
            statusElement.textContent =
                "⚠️ Не найден Telegram ID.";
        }

        return;
    }


    spinning = true;

    disableButton(
        "🎰 Крутим..."
    );


    if (statusElement) {
        statusElement.textContent =
            "🎰 Рулетка крутится...";
    }


    try {

        /*
         * Получаем результат с сервера.
         */

        const response =
            await fetch(
                "/api/spin",
                {
                    method: "POST",

                    cache: "no-store",

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


        console.log(
            "Spin response:",
            data
        );


        /*
         * Если сервер вернул ошибку.
         */

        if (!response.ok) {

            if (
                Number(data.remaining) > 0
            ) {

                startCountdown(
                    Number(data.remaining)
                );

            } else {

                if (statusElement) {
                    statusElement.textContent =
                        data.error ||
                        "⚠️ Не удалось прокрутить рулетку.";
                }

                enableButton();
            }


            spinning = false;

            return;
        }


        /*
         * Получаем приз.
         */

        const prize =
            data.prize ||
            "❌ Ничего";


        const emoji =
            getPrizeEmoji(
                prize
            );


        console.log(
            "Prize:",
            prize
        );


        /*
         * Крутим колесо.
         */

        await spinWheel(
            emoji
        );


        /*
         * После завершения анимации
         * показываем результат.
         */

        prizeElement.textContent =
            emoji;


        if (emoji === "🐻") {

            statusElement.textContent =
                "🎉 Тебе выпал Медведь! 🐻";

        } else {

            statusElement.textContent =
                "😔 Увы, в этот раз ничего.";
        }


        /*
         * Запускаем суточный cooldown.
         */

        startCountdown(
            Number(
                data.remaining ||
                COOLDOWN
            )
        );


    } catch (error) {

        console.error(
            "spin error:",
            error
        );


        if (statusElement) {
            statusElement.textContent =
                "⚠️ Ошибка соединения с сервером.";
        }


        enableButton();

    } finally {

        spinning = false;
    }
}


// ======================================================
// CLICK
// ======================================================

if (spinButton) {

    spinButton.addEventListener(
        "click",
        handleSpin
    );

}


// ======================================================
// START
// ======================================================

buildWheel();

loadUser();
