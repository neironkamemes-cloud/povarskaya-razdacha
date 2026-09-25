const tg = window.Telegram?.WebApp;

if (tg) {
    tg.ready();
    tg.expand();
}

const wheel = document.getElementById("wheel");
const spinButton = document.getElementById("spinButton");
const prizeElement = document.getElementById("prize");
const statusElement = document.getElementById("status");

const userId = tg?.initDataUnsafe?.user?.id || 0;

const prizes = [
    "❌", "❌", "❌", "❌",
    "❌", "❌", "❌", "🐻",
    "❌", "❌", "❌", "❌",
    "❌", "❌", "❌", "❌"
];

const colors = [
    "#ff7675", "#74b9ff", "#55efc4", "#ffeaa7",
    "#a29bfe", "#fd79a8", "#81ecec", "#fab1a0",
    "#70a1ff", "#7bed9f", "#eccc68", "#ff6b81",
    "#70a1ff", "#7bed9f", "#ff9ff3", "#74b9ff"
];

const COOLDOWN = 24 * 60 * 60;

let spinning = false;
let countdownTimer = null;
let currentRotation = 0;


// =====================================================
// BUILD WHEEL
// =====================================================

function buildWheel() {

    if (!wheel) {
        console.error("wheel element not found");
        return;
    }

    const sectorAngle = 360 / prizes.length;

    const gradient = prizes.map((_, index) => {

        const start = index * sectorAngle;
        const end = (index + 1) * sectorAngle;

        return `${colors[index]} ${start}deg ${end}deg`;

    }).join(", ");

    wheel.style.background =
        `conic-gradient(${gradient})`;

    wheel.innerHTML = "";

    prizes.forEach((emoji, index) => {

        const sector = document.createElement("div");

        sector.className = "roulette-sector";
        sector.textContent = emoji;

        const angle =
            index * sectorAngle +
            sectorAngle / 2;

        sector.style.transform =
            `rotate(${angle}deg) translateY(-92px)`;

        wheel.appendChild(sector);
    });

    wheel.style.transform =
        `rotate(${currentRotation}deg)`;
}


// =====================================================
// BUTTON
// =====================================================

function enableButton() {

    if (!spinButton) return;

    spinButton.disabled = false;
    spinButton.textContent = "🎰 КРУТИТЬ";
}


function disableButton(text) {

    if (!spinButton) return;

    spinButton.disabled = true;
    spinButton.textContent = text;
}


// =====================================================
// COUNTDOWN
// =====================================================

function formatTime(seconds) {

    seconds = Math.max(
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


    countdownTimer = setInterval(() => {

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

    }, 1000);


    if (statusElement) {

        statusElement.textContent =
            "⏳ Следующая прокрутка через " +
            formatTime(remaining);
    }
}


// =====================================================
// PRIZE
// =====================================================

function getPrizeEmoji(prize) {

    if (
        String(prize).includes("🐻")
    ) {
        return "🐻";
    }

    return "❌";
}


function getPrizeSector(emoji) {

    const indexes = [];

    prizes.forEach((item, index) => {

        if (item === emoji) {
            indexes.push(index);
        }

    });

    if (!indexes.length) {
        return 0;
    }

    return indexes[
        Math.floor(
            Math.random() * indexes.length
        )
    ];
}


// =====================================================
// ANIMATION
// =====================================================

function animateWheel(emoji) {

    return new Promise(resolve => {

        if (!wheel) {
            resolve();
            return;
        }

        const sectorAngle =
            360 / prizes.length;

        const sector =
            getPrizeSector(emoji);

        const targetCenter =
            sector * sectorAngle +
            sectorAngle / 2;

        const targetAngle =
            360 - targetCenter;

        const current =
            ((currentRotation % 360) + 360) % 360;

        const correction =
            (
                targetAngle -
                current +
                360
            ) % 360;

        const extraTurns =
            8 * 360;

        const finalRotation =
            currentRotation +
            extraTurns +
            correction;


        // Убираем старую анимацию
        wheel.classList.remove("spinning");

        // Фиксируем текущее положение
        wheel.style.animation = "none";
        wheel.style.transform =
            `rotate(${currentRotation}deg)`;

        // Принудительный reflow
        wheel.offsetWidth;


        /*
         * Наш CSS animation всегда идёт
         * от 0 до 2880 градусов.
         *
         * Поэтому временно используем
         * CSS custom property для нужного
         * финального вращения.
         */

        wheel.style.setProperty(
            "--wheel-start",
            `${currentRotation}deg`
        );

        wheel.style.setProperty(
            "--wheel-end",
            `${finalRotation}deg`
        );


        wheel.style.animation =
            "none";

        wheel.offsetWidth;


        wheel.style.animation =
            "roulette-spin 6s cubic-bezier(0.12, 0.72, 0.08, 1) forwards";


        /*
         * ВАЖНО:
         * переопределяем keyframes через
         * inline transform animation.
         */

        wheel.animate(
            [
                {
                    transform:
                        `rotate(${currentRotation}deg)`
                },
                {
                    transform:
                        `rotate(${finalRotation}deg)`
                }
            ],
            {
                duration: 6000,
                easing:
                    "cubic-bezier(0.12, 0.72, 0.08, 1)",
                fill: "forwards"
            }
        );


        currentRotation =
            finalRotation;


        setTimeout(() => {

            wheel.getAnimations().forEach(
                animation => animation.cancel()
            );

            wheel.classList.remove(
                "spinning"
            );

            wheel.style.animation =
                "none";

            wheel.style.transform =
                `rotate(${currentRotation}deg)`;

            resolve();

        }, 6200);

    });
}


// =====================================================
// LOAD USER
// =====================================================

async function loadUser() {

    if (!userId) {

        if (statusElement) {
            statusElement.textContent =
                "⚠️ Не удалось определить Telegram пользователя.";
        }

        disableButton("Недоступно");

        return;
    }


    try {

        const response =
            await fetch(
                `/api/user/${encodeURIComponent(userId)}?t=${Date.now()}`,
                {
                    method: "GET",
                    cache: "no-store"
                }
            );


        const data =
            await response.json();


        if (!response.ok) {
            throw new Error(
                "Не удалось загрузить пользователя"
            );
        }


        if (data.prize && prizeElement) {

            prizeElement.textContent =
                getPrizeEmoji(data.prize);
        }


        if (
            Number(data.remaining) > 0
        ) {

            startCountdown(
                Number(data.remaining)
            );

        } else {

            enableButton();

            if (statusElement) {
                statusElement.textContent =
                    "🎁 Твоя прокрутка доступна!";
            }
        }


    } catch (error) {

        console.error(
            "loadUser:",
            error
        );

        enableButton();

        if (statusElement) {
            statusElement.textContent =
                "🎁 Твоя прокрутка доступна!";
        }
    }
}


// =====================================================
// SPIN
// =====================================================

async function handleSpin() {

    if (spinning) {
        return;
    }

    if (!userId) {

        if (statusElement) {
            statusElement.textContent =
                "⚠️ Telegram ID не найден.";
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

        const response =
            await fetch(
                `/api/spin?t=${Date.now()}`,
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
            "SPIN RESPONSE:",
            data
        );


        if (!response.ok) {

            if (
                Number(data.remaining) > 0
            ) {

                startCountdown(
                    Number(data.remaining)
                );

            } else {

                enableButton();

                if (statusElement) {
                    statusElement.textContent =
                        data.error ||
                        "⚠️ Не удалось прокрутить.";
                }
            }

            spinning = false;

            return;
        }


        const emoji =
            getPrizeEmoji(
                data.prize
            );


        /*
         * САМАЯ ВАЖНАЯ ЧАСТЬ:
         * теперь реально запускаем
         * визуальную анимацию колеса.
         */

        await animateWheel(
            emoji
        );


        if (prizeElement) {
            prizeElement.textContent =
                emoji;
        }


        if (emoji === "🐻") {

            if (statusElement) {
                statusElement.textContent =
                    "🎉 Тебе выпал Медведь! 🐻";
            }

        } else {

            if (statusElement) {
                statusElement.textContent =
                    "😔 Увы, в этот раз ничего.";
            }
        }


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


        enableButton();

        if (statusElement) {
            statusElement.textContent =
                "⚠️ Ошибка соединения.";
        }

    } finally {

        spinning = false;
    }
}


// =====================================================
// CLICK
// =====================================================

if (spinButton) {

    spinButton.addEventListener(
        "click",
        handleSpin
    );
}


// =====================================================
// START
// =====================================================

buildWheel();

loadUser();
