const tg = window.Telegram.WebApp;

tg.ready();
tg.expand();

const prizes = [
    "🍕",
    "🍔",
    "🍣",
    "🍰",
    "👑",
    "💎",
    "🥄"
];

const prizeNames = [
    "Пицца",
    "Бургер",
    "Суши",
    "Торт",
    "Золотой шеф",
    "Алмазная сковорода",
    "Ложка удачи"
];

const spinButton = document.getElementById("spinButton");
const prizeElement = document.getElementById("prize");
const statusElement = document.getElementById("status");

spinButton.addEventListener("click", async () => {
    spinButton.disabled = true;
    statusElement.textContent = "🎰 Раздача крутится...";

    try {
        const user = tg.initDataUnsafe?.user;

        const userId = user?.id || 0;

        const response = await fetch("/api/spin", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                user_id: userId
            })
        });

        const data = await response.json();

        if (!response.ok) {
            statusElement.textContent =
                data.error || "Не удалось получить приз";
            spinButton.disabled = false;
            return;
        }

        let counter = 0;

        const animation = setInterval(() => {
            prizeElement.textContent =
                prizes[Math.floor(Math.random() * prizes.length)];

            counter++;

            if (counter >= 15) {
                clearInterval(animation);

                const index = prizes.indexOf(data.emoji);

                prizeElement.textContent =
                    data.emoji || prizes[index >= 0 ? index : 0];

                statusElement.textContent =
                    "🎉 Твой приз: " +
                    (data.prize || "Подарок!");

                spinButton.disabled = false;
            }
        }, 100);

    } catch (error) {
        console.error(error);

        statusElement.textContent =
            "⚠️ Ошибка соединения с сервером";

        spinButton.disabled = false;
    }
});
