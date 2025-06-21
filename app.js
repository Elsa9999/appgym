// =================================================================================
// Firebase and Global Configuration
// =================================================================================
const firebaseConfig = {
    apiKey: "AIzaSyC5sb0CiUsN-huW3PFD7xUmFKKaUOS8gu8",
    authDomain: "appgym-tracker.firebaseapp.com",
    projectId: "appgym-tracker",
    storageBucket: "appgym-tracker.firebasestorage.app",
    messagingSenderId: "454503576697",
    appId: "1:454503576697:web:d80e3be10908488801d0a8",
    measurementId: "G-Q5M390GZCC"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const googleProvider = new firebase.auth.GoogleAuthProvider();

// Global State
let currentUser = null;
let workouts = [];
let unsubscribe;
let isSignUp = false;

// =================================================================================
// Function Definitions
// =================================================================================

function renderHistory() {
    const workoutHistoryEl = document.getElementById('workout-history');
    if (!workoutHistoryEl) return;
    
    if (workouts.length === 0) {
        workoutHistoryEl.innerHTML = "<p>Chưa có lịch sử tập luyện. Hãy thêm buổi tập đầu tiên!</p>";
        return;
    }

    workoutHistoryEl.innerHTML = '<ul>' + workouts.map(w => `
        <li data-id="${w.id}">
            <div>
                <strong>${w.exercise || 'Không tên'}</strong> - ${w.date ? new Date(w.date).toLocaleDateString() : 'Không ngày'}
                <small>(${(w.sets || []).length} sets)</small>
            </div>
            <div class="workout-actions">
                <button class="edit-btn">Sửa</button>
                <button class="danger delete-btn">Xóa</button>
            </div>
        </li>
    `).join('') + '</ul>';
}

function openAuthModal() {
    const authModal = document.getElementById('auth-modal');
    if (authModal) authModal.style.display = 'block';
    const authForm = document.getElementById('auth-form');
    if(authForm) authForm.reset();
    const authError = document.getElementById('auth-error');
    if(authError) authError.textContent = '';
    isSignUp = false;
    updateAuthModalUI();
}

function closeAuthModalFunc() {
    const authModal = document.getElementById('auth-modal');
    if (authModal) authModal.style.display = 'none';
}

function updateAuthModalUI() {
    const title = document.getElementById('auth-modal-title');
    const btn = document.getElementById('auth-submit-btn');
    const link = document.getElementById('auth-toggle-link');
    if (!title || !btn || !link) return;

    if (isSignUp) {
        title.textContent = 'Đăng ký';
        btn.textContent = 'Đăng ký';
        link.textContent = 'Đã có tài khoản? Đăng nhập';
    } else {
        title.textContent = 'Đăng nhập';
        btn.textContent = 'Đăng nhập';
        link.textContent = 'Chưa có tài khoản? Đăng ký';
    }
}

function setupFirestoreListener(userId) {
    if (unsubscribe) unsubscribe();
    const workoutsCollection = db.collection('users').doc(userId).collection('workouts').orderBy('date', 'desc');
    unsubscribe = workoutsCollection.onSnapshot(snapshot => {
        workouts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderHistory();
    }, error => {
        console.error("Error fetching workouts: ", error);
        renderHistory();
    });
}

// =================================================================================
// Main Execution
// =================================================================================

document.addEventListener('DOMContentLoaded', () => {
    const authContainer = document.getElementById('auth-container');
    const appContent = document.getElementById('app-content');
    const userInfo = document.getElementById('user-info');
    const userDisplayName = document.getElementById('user-display-name');
    const loginGoogleBtn = document.getElementById('login-google-btn');
    const loginEmailBtn = document.getElementById('login-email-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const authModal = document.getElementById('auth-modal');
    const closeAuthModalBtn = document.getElementById('close-auth-modal');
    const authForm = document.getElementById('auth-form');
    const authEmailInput = document.getElementById('auth-email');
    const authPasswordInput = document.getElementById('auth-password');
    const authErrorEl = document.getElementById('auth-error');
    const authToggleLink = document.getElementById('auth-toggle-link');

    // Attach Auth Event Listeners
    loginGoogleBtn.addEventListener('click', () => {
        auth.signInWithPopup(googleProvider).catch(error => alert(`Lỗi: ${error.message}`));
    });
    loginEmailBtn.addEventListener('click', openAuthModal);
    logoutBtn.addEventListener('click', () => auth.signOut());
    closeAuthModalBtn.addEventListener('click', closeAuthModalFunc);
    authToggleLink.addEventListener('click', e => {
        e.preventDefault();
        isSignUp = !isSignUp;
        updateAuthModalUI();
    });
    window.addEventListener('click', e => {
        if (e.target == authModal) closeAuthModalFunc();
    });
    authForm.addEventListener('submit', async e => {
        e.preventDefault();
        const email = authEmailInput.value;
        const password = authPasswordInput.value;
        authErrorEl.textContent = '';
        try {
            if (isSignUp) {
                await auth.createUserWithEmailAndPassword(email, password);
            } else {
                await auth.signInWithEmailAndPassword(email, password);
            }
            closeAuthModalFunc();
        } catch (error) {
            authErrorEl.textContent = error.message;
        }
    });

    // Firebase Auth State Listener
    auth.onAuthStateChanged(user => {
        if (user) {
            currentUser = user;
            authContainer.classList.add('hidden');
            appContent.classList.remove('hidden');
            userInfo.classList.remove('hidden');
            userDisplayName.textContent = user.displayName || user.email;
            setupFirestoreListener(user.uid);
        } else {
            currentUser = null;
            if (unsubscribe) unsubscribe();
            workouts = [];
            authContainer.classList.remove('hidden');
            appContent.classList.add('hidden');
            userInfo.classList.add('hidden');
            renderHistory();
        }
    });
});