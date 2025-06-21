// Toàn bộ mã JavaScript từ <script>...</script> trong index.html sẽ được đặt ở đây.
// ... (sẽ được điền tự động ở bước tiếp theo)

const trendChartCanvas = document.getElementById('trendChart');
const weightSuggestionEl = document.getElementById('weightSuggestion');

// Theme switcher
const themeToggle = document.getElementById('theme-toggle');
const body = document.body;

let workouts = [];
let charts = {};
let currentUser = null;
let unsubscribe; // To detach Firestore listener
let isSignUp = false; // To toggle auth modal between login/signup

// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyC5sb0CiUsN-hUW3PFD7xUmFKKaUOS8gu8",
    authDomain: "appgym-tracker.firebaseapp.com",
    projectId: "appgym-tracker",
    storageBucket: "appgym-tracker.firebasestorage.app",
    messagingSenderId: "454503576697",
    appId: "1:454503576697:web:d80e3be10908488801d0a8",
    measurementId: "G-Q5M390GZCC"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const googleProvider = new firebase.auth.GoogleAuthProvider();

// DOM Elements
const authContainer = document.getElementById('auth-container');
const appContent = document.getElementById('app-content');
const loginGoogleBtn = document.getElementById('login-google-btn');
const loginEmailBtn = document.getElementById('login-email-btn');
const logoutBtn = document.getElementById('logout-btn');
const userInfo = document.getElementById('user-info');
const userDisplayName = document.getElementById('user-display-name');

// DOM Elements - Auth Modal
const authModal = document.getElementById('auth-modal');
const closeAuthModal = document.getElementById('close-auth-modal');
const authForm = document.getElementById('auth-form');
const authEmail = document.getElementById('auth-email');
const authPassword = document.getElementById('auth-password');
const authError = document.getElementById('auth-error');
const authModalTitle = document.getElementById('auth-modal-title');
const authSubmitBtn = document.getElementById('auth-submit-btn');
const authToggleLink = document.getElementById('auth-toggle-link');

// DOM Elements - App
const workoutForm = document.getElementById('workout-form');
const addSetBtn = document.getElementById('add-set-btn');
const workoutHistoryEl = document.getElementById('workout-history');
const exportBtn = document.getElementById('export-btn');
const importBtn = document.getElementById('import-btn');
const importFileInput = document.getElementById('import-file-input');
const analysisExerciseSelect = document.getElementById('analysis-exercise');

function applyTheme(theme) {
    body.classList.toggle('dark-mode', theme === 'dark');
    themeToggle.checked = theme === 'dark';
    updateCharts();
}

function toggleTheme() {
    const newTheme = body.classList.contains('dark-mode') ? 'light' : 'dark';
    localStorage.setItem('theme', newTheme);
    applyTheme(newTheme);
}

document.addEventListener('DOMContentLoaded', () => {
    loadWorkouts();
    updateExerciseDatalist();

    const savedTheme = localStorage.getItem('theme');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    if (savedTheme) {
        applyTheme(savedTheme);
    } else {
        applyTheme(systemPrefersDark ? 'dark' : 'light');
    }

    // Event Listeners
    workoutForm.addEventListener('submit', addWorkout);
    addSetBtn.addEventListener('click', addSetInput);
    workoutHistoryEl.addEventListener('click', handleHistoryClick);
    exportBtn.addEventListener('click', exportData);
    importBtn.addEventListener('click', () => importFileInput.click());
    importFileInput.addEventListener('change', importData);
    analysisExerciseSelect.addEventListener('change', updateAnalysis);
    themeToggle.addEventListener('change', toggleTheme);

    // AUTHENTICATION
    auth.onAuthStateChanged(user => {
        if (user) {
            currentUser = user;
            authContainer.classList.add('hidden');
            appContent.classList.remove('hidden');
            userInfo.classList.remove('hidden');
            userDisplayName.textContent = user.displayName || user.email;
            setupFirestoreListener(user.uid);
            checkAndMigrateData(user.uid);
        } else {
            currentUser = null;
            if (unsubscribe) unsubscribe(); // Detach listener on logout
            workouts = [];
            authContainer.classList.remove('hidden');
            appContent.classList.add('hidden');
            userInfo.classList.add('hidden');
            renderHistory(); // Clear history
        }
    });

    loginGoogleBtn.addEventListener('click', () => {
        auth.signInWithPopup(googleProvider).catch(error => {
            console.error("Google Sign-In Error:", error);
            alert(error.message);
        });
    });

    loginEmailBtn.addEventListener('click', openAuthModal);
    closeAuthModal.addEventListener('click', closeAuthModalFunc);
    window.addEventListener('click', (e) => {
        if (e.target == authModal) {
            closeAuthModalFunc();
        }
    });

    authToggleLink.addEventListener('click', (e) => {
        e.preventDefault();
        isSignUp = !isSignUp;
        authError.textContent = '';
        updateAuthModalUI();
    });

    authForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = authEmail.value;
        const password = authPassword.value;
        authError.textContent = '';

        try {
            if (isSignUp) {
                await auth.createUserWithEmailAndPassword(email, password);
            } else {
                await auth.signInWithEmailAndPassword(email, password);
            }
            closeAuthModalFunc();
        } catch (error) {
            authError.textContent = error.message;
        }
    });

    logoutBtn.addEventListener('click', () => {
        auth.signOut();
    });
});

// Đăng ký service worker cho PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js');
  });
} 

function createChart(canvasId, type, labels, datasets, title) {
    if (charts[canvasId]) {
        charts[canvasId].destroy();
    }
    const ctx = document.getElementById(canvasId).getContext('2d');

    const isDarkMode = body.classList.contains('dark-mode');
    const gridColor = getComputedStyle(body).getPropertyValue('--chart-grid-color').trim();
    const textColor = getComputedStyle(body).getPropertyValue('--text-color').trim();

    charts[canvasId] = new Chart(ctx, {
        type: type,
        data: {
            labels: labels,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: title,
                    color: textColor,
                    font: {
                        size: 16
                    }
                },
                legend: {
                    labels: {
                        color: textColor
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        color: gridColor
                    },
                    ticks: {
                        color: textColor
                    }
                },
                x: {
                    grid: {
                        color: gridColor
                    },
                    ticks: {
                        color: textColor
                    }
                }
            }
        }
    });
}

function updateCharts() {
    // ... existing code ...
} 

// --- AUTHENTICATION ---
auth.onAuthStateChanged(user => {
    if (user) {
        currentUser = user;
        authContainer.classList.add('hidden');
        appContent.classList.remove('hidden');
        userInfo.classList.remove('hidden');
        userDisplayName.textContent = user.displayName || user.email;
        setupFirestoreListener(user.uid);
        checkAndMigrateData(user.uid);
    } else {
        currentUser = null;
        if (unsubscribe) unsubscribe(); // Detach listener on logout
        workouts = [];
        authContainer.classList.remove('hidden');
        appContent.classList.add('hidden');
        userInfo.classList.add('hidden');
        renderHistory(); // Clear history
    }
});

// --- DATA MIGRATION ---
async function checkAndMigrateData(userId) {
    try {
        const localData = localStorage.getItem('workouts');
        if (!localData || JSON.parse(localData).length === 0) return;
        
        if (confirm("Phát hiện dữ liệu cũ trên máy này. Bạn có muốn chuyển lên tài khoản của mình không?")) {
            const localWorkouts = JSON.parse(localData);
            const batch = db.batch();
            localWorkouts.forEach(workout => {
                const docRef = db.collection('users').doc(userId).collection('workouts').doc();
                batch.set(docRef, workout);
            });
            await batch.commit();
            alert("Di chuyển dữ liệu thành công!");
            localStorage.removeItem('workouts');
        }
    } catch (error) {
        console.error("Migration failed: ", error);
        alert("Lỗi di chuyển dữ liệu.");
    }
}

// --- FIRESTORE ---
function setupFirestoreListener(userId) {
    if (unsubscribe) unsubscribe();
    const workoutsCollection = db.collection('users').doc(userId).collection('workouts').orderBy('date', 'desc');
    unsubscribe = workoutsCollection.onSnapshot(snapshot => {
        workouts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderHistory();
        updateExerciseDatalist();
        updateAnalysis();
    }, error => {
        console.error("Error fetching workouts: ", error);
        renderHistory(); // Render empty state on error
    });
}

// --- Auth Modal Logic ---
function openAuthModal() {
    authModal.style.display = 'block';
    authForm.reset();
    authError.textContent = '';
    isSignUp = false;
    updateAuthModalUI();
}

function closeAuthModalFunc() {
    authModal.style.display = 'none';
}

function updateAuthModalUI() {
    if (isSignUp) {
        authModalTitle.textContent = 'Đăng ký';
        authSubmitBtn.textContent = 'Đăng ký';
        authToggleLink.textContent = 'Đã có tài khoản? Đăng nhập';
    } else {
        authModalTitle.textContent = 'Đăng nhập';
        authSubmitBtn.textContent = 'Đăng nhập';
        authToggleLink.textContent = 'Chưa có tài khoản? Đăng ký';
    }
}

// --- FIRESTORE (Refined CRUD functions) ---
async function addWorkout(e) {
    e.preventDefault();
    const exercise = document.getElementById('exercise').value.trim();
    const date = document.getElementById('date').value;

    const sets = [];
    const setInputs = document.querySelectorAll('.set-input');
    setInputs.forEach(setInput => {
        const weight = parseFloat(setInput.querySelector('input[placeholder="Tạ (kg)"]').value);
        const reps = parseInt(setInput.querySelector('input[placeholder="Reps"]').value);
        if (!isNaN(weight) && !isNaN(reps)) {
            sets.push({ weight, reps });
        }
    });

    if (!exercise || !date || sets.length === 0) {
        alert('Vui lòng điền đầy đủ thông tin bài tập, ngày và ít nhất một set.');
        return;
    }
    
    const newWorkout = {
        exercise,
        date,
        sets,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    try {
        await db.collection('users').doc(currentUser.uid).collection('workouts').add(newWorkout);
        workoutForm.reset();
        document.getElementById('sets-container').innerHTML = '';
        addSetInput();
    } catch (error) {
        console.error("Error adding workout: ", error);
        alert("Lỗi khi thêm bài tập.");
    }
}

async function deleteWorkout(id) {
    if (!confirm('Bạn có chắc chắn muốn xóa bài tập này không?')) return;
    try {
        await db.collection('users').doc(currentUser.uid).collection('workouts').doc(id).delete();
    } catch (error) {
        console.error("Error deleting workout: ", error);
        alert("Lỗi khi xóa bài tập.");
    }
}

async function updateWorkout(id, updatedData) {
     try {
        await db.collection('users').doc(currentUser.uid).collection('workouts').doc(id).update(updatedData);
        closeEditModal();
    } catch (error) {
        console.error("Error updating workout: ", error);
        alert("Lỗi khi cập nhật bài tập.");
    }
}

// All other functions (renderHistory, createChart, updateAnalysis, etc.) remain mostly the same
// but will now use the global `workouts` array populated by Firestore.
// The functions that save data (add, edit, delete) are now async and use Firestore.

// ... (rest of the existing code) 