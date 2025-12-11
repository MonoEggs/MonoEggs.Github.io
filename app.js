/**
 * Inventory Management App
 * Handles UI transitions, Swipe Logic, Data Persistence, and Sync.
 */

// --- Configuration ---
const CONFIG = {
    GAS_API_URL: "https://script.google.com/macros/s/AKfycbwbARToM_84SFnh63SwM-OO7s3ebSAGU9DS4d_iKDsgCxDbnOywW8BWZaHb0uBdnP8/exec", // User must replace this
    PASSCODE: "1234",
    SYNC_INTERVAL_MS: 5000
};

// --- Mock Data (Replace with fetch from Sheet if needed, or hardcode for now) ---
const MOCK_DATA = [
    { id: "A001", name: "Apple", category: "Fruits", image: "https://placehold.co/300x300/orange/white?text=Apple" },
    { id: "A002", name: "Banana", category: "Fruits", image: "https://placehold.co/300x300/orange/white?text=Banana" },
    { id: "A003", name: "Cherry", category: "Fruits", image: "https://placehold.co/300x300/orange/white?text=Cherry" },
    { id: "B001", name: "Carrot", category: "Vegetables", image: "https://placehold.co/300x300/green/white?text=Carrot" },
    { id: "B002", name: "Broccoli", category: "Vegetables", image: "https://placehold.co/300x300/green/white?text=Broccoli" },
    { id: "C001", name: "Milk", category: "Dairy", image: "https://placehold.co/300x300/blue/white?text=Milk" },
    { id: "C002", name: "Cheese", category: "Dairy", image: "https://placehold.co/300x300/blue/white?text=Cheese" },
];

// Organize Data
const CATEGORIES = [...new Set(MOCK_DATA.map(d => d.category))];
const ITEMS_BY_CAT = {};
CATEGORIES.forEach(cat => {
    ITEMS_BY_CAT[cat] = MOCK_DATA.filter(d => d.category === cat);
});

// --- State ---
const State = {
    view: 'login-view',
    location: localStorage.getItem('lastLocation') || '',
    catIndex: 0,
    itemIndex: 0,
    queue: JSON.parse(localStorage.getItem('inventoryQueue') || '[]'),
    isOnline: navigator.onLine
};

// --- Elements ---
const El = {
    views: document.querySelectorAll('.view'),
    loginPass: document.getElementById('login-password'),
    loginBtn: document.getElementById('login-btn'),
    loginErr: document.getElementById('login-error'),
    locSelect: document.getElementById('location-select'),
    confirmLocBtn: document.getElementById('confirm-location-btn'),
    cardStack: document.getElementById('card-stack'),
    catHeader: document.getElementById('current-category'),
    itemName: document.getElementById('selected-item-name'),
    itemSelectBtn: document.getElementById('item-select-btn'),
    changeLocBtn: document.getElementById('change-loc-btn'),
    qtyInput: document.getElementById('qty-input'),
    qtyItemName: document.getElementById('qty-item-name'),
    qtyConfirm: document.getElementById('qty-confirm-btn'),
    qtyCancel: document.getElementById('qty-cancel-btn'),
    syncStatus: document.getElementById('sync-status'),
    statusText: document.getElementById('status-text'),
    statusDot: document.querySelector('.status-dot')
};

// --- Navigation ---
function switchView(viewId) {
    El.views.forEach(v => v.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
    State.view = viewId;
}

// --- Login Logic ---
El.loginBtn.addEventListener('click', () => {
    if (El.loginPass.value === CONFIG.PASSCODE) {
        switchView('location-view');
        // Restore Location if exists
        if (State.location) {
            El.locSelect.value = State.location;
        }
    } else {
        El.loginErr.style.display = 'block';
        El.loginPass.classList.add('shake');
        setTimeout(() => El.loginPass.classList.remove('shake'), 300);
    }
});

// --- Location Logic ---
El.confirmLocBtn.addEventListener('click', () => {
    if (El.locSelect.value) {
        State.location = El.locSelect.value;
        localStorage.setItem('lastLocation', State.location);
        renderCard();
        switchView('item-view');
    }
});

El.changeLocBtn.addEventListener('click', () => {
    switchView('location-view');
});

// --- Swipe Logic ---
let startX = 0, startY = 0;
let currentCard = null;

function renderCard() {
    // Ensure indices are valid
    if (State.catIndex < 0) State.catIndex = CATEGORIES.length - 1;
    if (State.catIndex >= CATEGORIES.length) State.catIndex = 0;
    
    const cat = CATEGORIES[State.catIndex];
    const items = ITEMS_BY_CAT[cat];

    if (State.itemIndex < 0) State.itemIndex = items.length - 1;
    if (State.itemIndex >= items.length) State.itemIndex = 0;

    const item = items[State.itemIndex];

    El.catHeader.textContent = cat;
    El.itemName.textContent = item.name;

    // Create Card DOM
    // We only keep one card in DOM for simplicity, or 2 for animations?
    // Let's do a simple replace with animation class
    El.cardStack.innerHTML = '';
    
    const card = document.createElement('div');
    card.className = 'item-card glass-panel';
    card.innerHTML = `
        <img src="${item.image}" class="item-image">
        <div class="item-info">
            <h2>${item.name}</h2>
            <p>${item.id}</p>
        </div>
    `;
    El.cardStack.appendChild(card);
    currentCard = card;
}

const SWIPE_THRESHOLD = 50;

if (El.cardStack) {
    El.cardStack.addEventListener('touchstart', e => {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        currentCard.style.transition = 'none';
    });

    El.cardStack.addEventListener('touchmove', e => {
        const dx = e.touches[0].clientX - startX;
        const dy = e.touches[0].clientY - startY;
        
        // Simple drag effect
        currentCard.style.transform = `translate(-50%, -50%) translate(${dx}px, ${dy}px) rotate(${dx * 0.05}deg)`;
        e.preventDefault(); // Prevent scroll
    });

    El.cardStack.addEventListener('touchend', e => {
        const dx = e.changedTouches[0].clientX - startX;
        const dy = e.changedTouches[0].clientY - startY;
        
        currentCard.style.transition = 'transform 0.3s ease';

        if (Math.abs(dx) > Math.abs(dy)) {
            // Horizontal Swipe (Category)
            if (Math.abs(dx) > SWIPE_THRESHOLD) {
                // Swipe Action
                const dir = dx > 0 ? -1 : 1; // Right swipe = Prev Cat, Left = Next
                State.catIndex += dir;
                State.itemIndex = 0; // Reset item index on cat change
                slideOutAndRender(dx > 0 ? 'right' : 'left');
            } else {
                resetCard();
            }
        } else {
            // Vertical Swipe (Item)
            if (Math.abs(dy) > SWIPE_THRESHOLD) {
                const dir = dy > 0 ? -1 : 1; // Down = Prev Item, Up = Next
                State.itemIndex += dir;
                slideOutAndRender(dy > 0 ? 'down' : 'up');
            } else {
                resetCard();
            }
        }
    });
}

function slideOutAndRender(direction) {
    let x = '-50%', y = '-50%';
    if (direction === 'left') x = '-150%';
    if (direction === 'right') x = '50%';
    if (direction === 'up') y = '-150%';
    if (direction === 'down') y = '50%';

    currentCard.style.transform = `translate(${x}, ${y})`;
    currentCard.style.opacity = '0';

    setTimeout(() => {
        renderCard();
    }, 300);
}

function resetCard() {
    currentCard.style.transform = 'translate(-50%, -50%)';
}

// --- Item Selection & Qty ---
El.itemSelectBtn.addEventListener('click', () => {
    const cat = CATEGORIES[State.catIndex];
    const item = ITEMS_BY_CAT[cat][State.itemIndex];
    El.qtyItemName.textContent = item.name + " (" + State.location + ")";
    El.qtyInput.value = '';
    switchView('quantity-view');
    setTimeout(() => El.qtyInput.focus(), 100);
});

El.qtyCancelBtn.addEventListener('click', () => {
    switchView('item-view');
});

El.qtyConfirm.addEventListener('click', () => {
    if (!El.qtyInput.value) return;

    const cat = CATEGORIES[State.catIndex];
    const item = ITEMS_BY_CAT[cat][State.itemIndex];
    
    const record = {
        id: item.id,
        name: item.name,
        location: State.location,
        qty: parseInt(El.qtyInput.value),
        timestamp: new Date().toISOString()
    };

    State.queue.push(record);
    saveQueue();
    alert(`Saved: ${item.name} x${record.qty}`);
    switchView('item-view');
    // Maybe auto-advance item?
    // State.itemIndex++; renderCard();
});

// --- Sync & Persistence ---
function saveQueue() {
    localStorage.setItem('inventoryQueue', JSON.stringify(State.queue));
    updateStatus();
    processQueue();
}

function updateStatus() {
    const count = State.queue.length;
    El.statusDot.className = 'status-dot ' + (State.isOnline ? 'online' : '');
    if (count > 0) {
        El.statusText.textContent = `Pending (${count})`;
        El.statusDot.classList.add('syncing');
    } else {
        El.statusText.textContent = 'Synced';
        El.statusDot.classList.remove('syncing');
    }
}

async function processQueue() {
    if (!State.isOnline || State.queue.length === 0 || !CONFIG.GAS_API_URL) return;

    const chunk = State.queue; // Take all
    // In real app, maybe chunk it.
    
    try {
        const response = await fetch(CONFIG.GAS_API_URL, {
            method: 'POST',
            mode: 'no-cors', // GAS web apps often need no-cors or JSONP if simple
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(chunk)
        });

        // With no-cors we can't check status, assume success if no reach error
        // But better is to use redirect or standard CORS if setup right.
        // For this demo, we assume success.
        
        console.log("Sent chunk", chunk);
        State.queue = [];
        saveQueue();
        
    } catch (e) {
        console.error("Sync failed", e);
    }
}

// Network Listeners
window.addEventListener('online', () => { State.isOnline = true; updateStatus(); processQueue(); });
window.addEventListener('offline', () => { State.isOnline = false; updateStatus(); });

// Init
renderCard();
updateStatus();

