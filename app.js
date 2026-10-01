// ==========================================
// DADES GLOBALS DE CONFIGURACIÓ I ESTAT
// ==========================================
var currentBooking = {
    id: "RES-2026-8942",
    hotelName: "Grand Palace Resort",
    checkIn: "2026-09-18",
    checkOut: "2026-09-21",
    pricePerNight: 120.50,
    lat: 41.38879,
    lng: 2.15899
};

var syncTimer = null;

/**
 * Funció auxiliar per mostrar feedback a l'HTML escrit a l'element #apiFeedback
 */
function showApiFeedback(message, type = "info") {
    var feedbackEl = document.querySelector("#apiFeedback");
    if (feedbackEl) {
        feedbackEl.innerHTML = "<small class='feedback-" + type + "'>" + message + "</small>";
    } else {
        console.log("[" + type.toUpperCase() + "]: " + message);
    }
}


// ==========================================
// BLOC 1: DATES, TIMEZONE I FORMATS (CORREGIT)
// ==========================================

// Desmunta la cadena "YYYY-MM-DD" i força la creació en hora local sense desfasament UTC[cite: 6]
function parseLocalDate(dateString) {
    const [year, month, day] = dateString.split("-").map(Number);
    return new Date(year, month - 1, day);
}

// Càlcul de nits amb validació d'errors, ordre temporal i protecció contra DST[cite: 6]
function calculateStay(checkInStr, checkOutStr) {
    const checkIn = parseLocalDate(checkInStr);
    const checkOut = parseLocalDate(checkOutStr);

    // 1. Validar que siguin dates numèricament vàlides[cite: 6]
    if (Number.isNaN(checkIn.getTime()) || Number.isNaN(checkOut.getTime())) {
        throw new Error("Si us plau, introdueix dues dates vàlides.");
    }

    // 2. Validar l'ordre temporal (la data de sortida ha de ser estrictament posterior)[cite: 6]
    if (checkOut <= checkIn) {
        throw new Error("La data de sortida ha de ser estrictament posterior a la data d'entrada.");
    }

    // 3. Càlcul matemàtic en mil·lisegons protegit amb Math.round contra canvis d'horari (DST)[cite: 6]
    const diffTime = checkOut.getTime() - checkIn.getTime();
    const MS_PER_DAY = 1000 * 60 * 60 * 24;
    const nights = Math.round(diffTime / MS_PER_DAY);

    return nights;
}

// Formatació regional de dates amb Intl.DateTimeFormat[cite: 7]
function formatBookingDate(dateInput, locale = "ca-ES") {
    const date = typeof dateInput === "string" ? parseLocalDate(dateInput) : dateInput;

    if (Number.isNaN(date.getTime())) {
        return "Data invàlida";
    }

    const formatter = new Intl.DateTimeFormat(locale, {
        day: "2-digit",
        month: "long",
        year: "numeric"
    });

    return formatter.format(date);
}

// Formatació financera amb Intl.NumberFormat adaptada a l'idioma i moneda de l'usuari[cite: 8]
function formatPrice(amount, currency = "EUR", locale = "ca-ES") {
    if (typeof amount !== "number" || Number.isNaN(amount)) {
        return "0.00 €";
    }

    return new Intl.NumberFormat(locale, {
        style: "currency",
        currency: currency
    }).format(amount);
}


// ==========================================
// BLOC 2: PERSISTÈNCIA I WEB STORAGE (CORREGIT)
// ==========================================

// Desa les preferències convertint l'objecte a JSON i incloent marca de temps[cite: 10]
function savePreferences(preferences) {
    const payload = {
        theme: preferences.theme,
        lang: preferences.lang,
        currency: preferences.currency,
        lastSearch: new Date().toISOString()
    };
    localStorage.setItem("user_preferences", JSON.stringify(payload));
}

// Carrega les preferències de localStorage utilitzant JSON.parse i fallback[cite: 10]
function loadPreferences() {
    const defaultPreferences = {
        theme: "light",
        lang: "ca-ES",
        currency: "EUR",
        lastSearch: null
    };

    try {
        const rawData = localStorage.getItem("user_preferences");
        if (!rawData) return defaultPreferences;
        return JSON.parse(rawData);
    } catch (error) {
        console.warn("Error llegint preferences de localStorage, usant valors per defecte:", error);
        return defaultPreferences;
    }
}

// Aplica o elimina la classe 'dark-theme' al body segons el tema triat[cite: 9, 10]
function applyTheme(theme) {
    if (theme === "dark") {
        document.body.classList.add("dark-theme");
    } else {
        document.body.classList.remove("dark-theme");
    }
}


// ==========================================
// BLOC 3: APIS NATIVES DEL NAVEGADOR (CORREGIT)
// ==========================================

// 3.1: Portapapers asíncron amb Clipboard API[cite: 12, 13]
async function copyBookingCode(code) {
    if (!navigator.clipboard) {
        showApiFeedback("El teu navegador no admet la còpia automàtica al portapapers.", "error");
        return;
    }
    try {
        await navigator.clipboard.writeText(code);
        showApiFeedback(`Localitzador ${code} copiat al portapapers!`, "success");
    } catch (error) {
        showApiFeedback("No s'ha pogut copiar el codi.", "error");
        console.error("Error en copiar:", error);
    }
}

// 3.1: Compartir amb Web Share API, Feature Detection i Fallback[cite: 13]
async function shareBooking(bookingData) {
    const currentUrl = window.location.protocol.startsWith("http")
        ? window.location.href
        : "https://grandpalaceresort.com/reserva/" + bookingData.id;

    const shareData = {
        title: `Reserva a ${bookingData.hotelName}`,
        text: `Tinc una reserva confirmada a ${bookingData.hotelName} (Ref: ${bookingData.id}).`,
        url: currentUrl
    };

    if (navigator.share && window.location.protocol.startsWith("http")) {
        try {
            await navigator.share(shareData);
            showApiFeedback("Reserva compartida amb èxit!", "success");
        } catch (error) {
            if (error.name !== "AbortError") {
                showApiFeedback("Error en compartir la reserva.", "error");
            }
        }
    } else {
        // Fallback per a entorns sense suport o fitxers locals (file://)[cite: 13]
        await copyBookingCode(currentUrl);
        showApiFeedback("Enllaç de reserva copiat al portapapers (Compartició no disponible en aquest navegador/entorn).", "info");
    }
}

// 3.2: Sol·licitud explícita de permisos per a Notification API[cite: 14]
async function sendProximityNotification(bookingData) {
    if (!("Notification" in window)) {
        showApiFeedback("Aquest navegador no suporta notificacions mitjançant el sistema.", "error");
        return;
    }

    let permission = Notification.permission;

    if (permission === "default") {
        permission = await Notification.requestPermission();
    }

    if (permission === "granted") {
        new Notification("Grand Palace Resort", {
            body: `La teva reserva (${bookingData.id}) comença aviat!`,
            icon: "/favicon.ico"
        });
        showApiFeedback("Notificació enviada correctament.", "success");
    } else {
        showApiFeedback("Has denegat el permís per rebre notificacions.", "warning");
    }
}

// 3.3: Geolocalització defensiva amb callbacks d'error i opcions[cite: 15, 16]
function findNearbyHotels() {
    if (!("geolocation" in navigator)) {
        showApiFeedback("La geolocalització no està disponible al teu navegador.", "error");
        return;
    }

    showApiFeedback("Obtenint la teva ubicació...", "info");

    const options = {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 0
    };

    navigator.geolocation.getCurrentPosition(
        (position) => {
            const { latitude, longitude } = position.coords;
            showApiFeedback(
                `Ubicació trobada: Lat ${latitude.toFixed(4)}, Lng ${longitude.toFixed(4)}`,
                "success"
            );
        },
        (error) => {
            let msg = "Error desconegut en obtenir la ubicació.";
            switch (error.code) {
                case error.PERMISSION_DENIED:
                    msg = "Has denegat el permís d'accés a la ubicació.";
                    break;
                case error.POSITION_UNAVAILABLE:
                    msg = "La informació d'ubicació no està disponible.";
                    break;
                case error.TIMEOUT:
                    msg = "S'ha esgotat el temps d'espera per obtenir la ubicació.";
                    break;
            }
            showApiFeedback(msg, "error");
        },
        options
    );
}

// 3.3 (ampliació): Gestió eficient de recursos amb Page Visibility API[cite: 17]
function startLiveSync() {
    if (syncTimer) return;
    console.log("Sincronitzador activat.");
    syncTimer = setInterval(() => {
        console.log("Comprovant estat de la reserva amb el servidor...");
    }, 3000);
}

function stopLiveSync() {
    if (syncTimer) {
        clearInterval(syncTimer);
        syncTimer = null;
        console.log("Sincronitzador pausat (pestanya en segon pla).");
    }
}


// ==========================================
// CONTROLADOR I ENLLAÇ AMB EL DOM (HTML)
// ==========================================

function handleCalculateStay() {
    var checkInVal = document.querySelector("#checkInInput").value;
    var checkOutVal = document.querySelector("#checkOutInput").value;

    var currentLang = document.querySelector("#langSelect").value;
    var currentCurrency = document.querySelector("#currencySelect").value;

    try {
        var nights = calculateStay(checkInVal, checkOutVal);

        var pricePerNight = currentBooking.pricePerNight;
        var totalPrice = nights * pricePerNight;

        document.querySelector("#checkInDisplay").textContent = formatBookingDate(checkInVal, currentLang);
        document.querySelector("#checkOutDisplay").textContent = formatBookingDate(checkOutVal, currentLang);
        document.querySelector("#stayNightsDisplay").textContent = nights;
        document.querySelector("#pricePerNightDisplay").textContent = formatPrice(pricePerNight, currentCurrency, currentLang);
        document.querySelector("#totalPriceDisplay").textContent = formatPrice(totalPrice, currentCurrency, currentLang);

    } catch (error) {
        alert(error.message);
    }
}

// Vinculació d'esdeveniments DOM
document.addEventListener("DOMContentLoaded", function () {

    // 1. Carregar preferències de localStorage i aplicar el tema visual[cite: 10]
    const currentPrefs = loadPreferences();
    applyTheme(currentPrefs.theme);

    const themeSelect = document.querySelector("#themeSelect");
    const langSelect = document.querySelector("#langSelect");
    const currencySelect = document.querySelector("#currencySelect");
    const lastSearchDisplay = document.querySelector("#lastSearchDisplay");

    if (themeSelect) themeSelect.value = currentPrefs.theme;
    if (langSelect) langSelect.value = currentPrefs.lang;
    if (currencySelect) currencySelect.value = currentPrefs.currency;
    if (lastSearchDisplay && currentPrefs.lastSearch) {
        lastSearchDisplay.textContent = new Date(currentPrefs.lastSearch).toLocaleString();
    }

    // 2. Escoltar esdeveniment 'change' a #themeSelect[cite: 10]
    if (themeSelect) {
        themeSelect.addEventListener("change", function (e) {
            applyTheme(e.target.value);
        });
    }

    // 3. Sincronització inter-pestanya amb l'esdeveniment 'storage'[cite: 11]
    window.addEventListener("storage", function (event) {
        if (event.key === "user_preferences" && event.newValue) {
            try {
                const newPrefs = JSON.parse(event.newValue);

                applyTheme(newPrefs.theme);
                if (themeSelect) themeSelect.value = newPrefs.theme;
                if (langSelect) langSelect.value = newPrefs.lang;
                if (currencySelect) currencySelect.value = newPrefs.currency;
                if (lastSearchDisplay && newPrefs.lastSearch) {
                    lastSearchDisplay.textContent = new Date(newPrefs.lastSearch).toLocaleString();
                }

                showApiFeedback("Preferències sincronitzades des d'una altra pestanya.", "info");
            } catch (e) {
                console.error("Error en sincronitzar pestanyes:", e);
            }
        }
    });

    // Botó Càlcul
    var btnCalculate = document.querySelector("#btnCalculateStay");
    if (btnCalculate) {
        btnCalculate.addEventListener("click", handleCalculateStay);
    }

    // Botó Preferències
    var btnSave = document.querySelector("#btnSavePreferences");
    if (btnSave) {
        btnSave.addEventListener("click", function () {
            var theme = document.querySelector("#themeSelect").value;
            var lang = document.querySelector("#langSelect").value;
            var currency = document.querySelector("#currencySelect").value;

            savePreferences({ theme: theme, lang: lang, currency: currency });

            const updatedPrefs = loadPreferences();
            if (lastSearchDisplay && updatedPrefs.lastSearch) {
                lastSearchDisplay.textContent = new Date(updatedPrefs.lastSearch).toLocaleString();
            }

            showApiFeedback("Preferències desades correctament a LocalStorage!", "success");
        });
    }

    var btnCopy = document.querySelector("#btnCopyCode");
    if (btnCopy) {
        btnCopy.addEventListener("click", () => copyBookingCode(currentBooking.id));
    }

    var btnShare = document.querySelector("#btnShareBooking");
    if (btnShare) {
        btnShare.addEventListener("click", () => shareBooking(currentBooking));
    }

    var btnNotify = document.querySelector("#btnNotify");
    if (btnNotify) {
        btnNotify.addEventListener("click", () => sendProximityNotification(currentBooking));
    }

    var btnGPS = document.querySelector("#btnNearbyHotels");
    if (btnGPS) {
        btnGPS.addEventListener("click", findNearbyHotels);
    }

    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") {
            stopLiveSync();
        } else {
            startLiveSync();
        }
    });

    startLiveSync();
});