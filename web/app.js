const tg = window.Telegram.WebApp;

tg.ready();
tg.expand();

const spinButton = document.getElementById("spinButton");
const prizeElement = document.getElementById("prize");
const statusElement = document.getElementById("status");

const COOLDOWN = 24 * 60 * 60; // 24 часа

let countdownInterval = null;
let spinning = false;

const userId = tg.initDataUnsafe?.user?.id || 0;


// ==========================================
// ПОЛУЧЕНИЕ EMOJI ПРИЗА
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
// ТАЙМЕР ДО СЛЕДУЮЩЕЙ ПРОКРУТКИ
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
// АНИМАЦИЯ РУЛЕТКИ
// ==========================================

function spinAnimation(finalEmoji) {
    return new Promise((resolve) => {

        const symbols = [
            "❌",
            "❌",
            "❌",
            "❌",
            "🐻"
        ];

        const totalSteps = 40;

        let step = 0;

        function animate() {

            step++;

            // Пока крутимся
            if (step < totalSteps) {

                const randomIndex =
                    Math.floor(
                        Math.random() * symbols.length
                    );

                prizeElement.textContent =
                    symbols[randomIndex];

                // Сначала быстро
                // Потом медленно
                let delay;

                if (step < 15) {
                    delay = 50;
                }
                else if (step < 28) {
                    delay = 80;
                }
                else {
                    delay =
                        120 +
                        (step - 28) * 40;
                }

                setTimeout(
                    animate,
                    delay
                );

                return;
            }

            // ==================================
            // ФИНАЛЬНЫЙ РЕЗУЛЬТАТ
            // ==================================

            prizeElement.textContent =
                finalEmoji;

            setTimeout(
                resolve,
                700
            );
        }

        animate();
    });
}


// ==========================================
// ЗАГРУЗКА СОСТОЯНИЯ ПОЛЬЗОВАТЕЛЯ
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


        // ==================================
        // ПРОВЕРЯЕМ КУЛДАУН
        // ==================================

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


        // ==================================
        // МОЖНО КРУТИТЬ
        // ==================================

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

            // ==================================
            // ПОЛУЧАЕМ РЕЗУЛЬТАТ ОТ СЕРВЕРА
            // ==================================

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
            // ОШИБКА / КУЛДАУН
            // ==================================

            if (!response.ok) {

                if (
                    data.remaining
                ) {

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
            // НАСТОЯЩИЙ РЕЗУЛЬТАТ
            // ==================================

            const prize =
                data.prize ||
                "❌ Ничего";

            const finalEmoji =
                getPrizeEmoji(
                    prize
                );


            // ==================================
            // КРУТИМ РУЛЕТКУ
            // ==================================

            await spinAnimation(
                finalEmoji
            );


            // ==================================
            // ПОКАЗЫВАЕМ РЕЗУЛЬТАТ
            // ==================================

            if (
                prize.includes("🐻")
            ) {

                statusElement.textContent =
                    "🎉 Тебе выпал Медведь! 🐻";

            }
            else {

                statusElement.textContent =
                    "😔 Увы, в этот раз ничего.";
            }


            // ==================================
            // ЗАПУСКАЕМ 24 ЧАСА
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
// ЗАПУСК MINI APP
// ==========================================

loadUserState();
