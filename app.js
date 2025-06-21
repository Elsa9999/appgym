// =================================================================================
// Firebase and Global Configuration
// =================================================================================
const firebaseConfig = {
    apiKey: "AIzaSyC5sbOCiUsN-huW3PFD7xUmFkKaUOS8gu8",
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

// Kích hoạt chế độ offline của Firestore
db.enablePersistence()
  .catch((err) => {
    if (err.code == 'failed-precondition') {
      // Lỗi này thường xảy ra khi có nhiều tab đang mở.
      // Persistence chỉ có thể được kích hoạt ở một tab.
      console.warn('Firebase persistence failed: multiple tabs open.');
    } else if (err.code == 'unimplemented') {
      // Trình duyệt không hỗ trợ tính năng này.
      console.warn('Firebase persistence is not available in this browser.');
    }
  });

// =================================================================================
// Dữ liệu gợi ý bài tập (Workout Templates)
// =================================================================================
const workoutTemplates = {
  'nguc_tay_sau': ['Ngực trên với máy', 'Ngực giữa với máy', 'Ép ngực với cáp', 'Dip', 'Tay sau với cáp (dây dài)'],
  'vai': ['Vai trước với máy', 'Bay vai với cáp để sau', 'Bay vai với cáp để trước', 'Face Pull', 'Cầu vai'],
  'lung_tay_truoc': ['Pull up', 'Low row machine', 'Lat pulldown hẹp', 'Chest support row', 'Seated row wide', 'Back extension', 'Preacher curl'],
  'chan': ['Squat (Gánh tạ)', 'Leg Press (Đạp đùi)', 'Leg Extension (Đá đùi trước)', 'Lying Leg Curl (Móc đùi sau)', 'Calf Raise (Nhón bắp chuối)', 'Lunge'],
  'tay': ['Barbell Bicep Curl (Cuốn tạ đòn)', 'Dumbbell Bicep Curl (Cuốn tạ đơn)', 'Hammer Curl', 'Tricep Pushdown (Kéo cáp tay sau)', 'Skull Crusher', 'Overhead Tricep Extension'],
  'bung': ['Gập bụng (Crunches)', 'Plank (Giữ ván)', 'Leg Raise (Nằm nâng chân)', 'Russian Twist']
};

// Global State
let currentUser = null;
let workouts = [];
let unsubscribe;
let isSignUp = false;
let currentEditId = null; // To track which workout is being edited

// =================================================================================
// Function Definitions
// =================================================================================

/**
 * Adds a new set input group to the specified container.
 * @param {string} containerId The ID of the container element for sets.
 */
function addSet(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const setNumber = container.children.length + 1;
    const setEl = document.createElement('div');
    setEl.classList.add('set-item');
    setEl.innerHTML = `
        <label>Set ${setNumber}:</label>
        <input type="number" class="set-weight" placeholder="Tạ (kg)" required>
        <input type="number" class="set-reps" placeholder="Reps" required>
        <button type="button" class="remove-set-btn">Xóa</button>
    `;

    // Add event listener to the new remove button
    setEl.querySelector('.remove-set-btn').addEventListener('click', () => {
        setEl.remove();
        // After removing, update the labels of the remaining sets
        const sets = container.querySelectorAll('.set-item');
        sets.forEach((set, index) => {
            set.querySelector('label').textContent = `Set ${index + 1}:`;
        });
    });

    container.appendChild(setEl);
}

function renderHistory() {
    const historyBody = document.getElementById('history-body');
    if (!historyBody) return;

    if (workouts.length === 0) {
        historyBody.innerHTML = '<tr><td colspan="8" style="text-align: center;">Chưa có lịch sử tập luyện.</td></tr>';
        return;
    }

    historyBody.innerHTML = workouts.map(w => {
        // Default to an empty array if sets are missing
        const sets = w.sets || [];
        const setsDetails = sets.map(s => `<li>${s.weight || 0}kg x ${s.reps || 0} reps</li>`).join('');
        const totalVolume = sets.reduce((acc, s) => acc + ((s.weight || 0) * (s.reps || 0)), 0);

        return `
            <tr data-id="${w.id}">
                <td>${w.date ? new Date(w.date).toLocaleDateString('vi-VN') : 'N/A'}</td>
                <td>${w.muscleGroup || 'N/A'}</td>
                <td>${w.exercise || 'Không tên'}</td>
                <td>${w.equipment || ''}</td>
                <td><ul class="sets-list">${setsDetails}</ul></td>
                <td>${totalVolume.toLocaleString('vi-VN')} kg</td>
                <td>${w.notes || ''}</td>
                <td class="workout-actions">
                    <button class="edit-btn">Sửa</button>
                    <button class="delete-btn">Xóa</button>
                </td>
            </tr>
        `;
    }).join('');
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
        console.error("Lỗi khi tải lịch sử tập: ", error);
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
    const templateSelect = document.getElementById('template-select');
    const exerciseSuggestionsEl = document.getElementById('exercise-suggestions');
    const addSetBtn = document.getElementById('add-set');
    const workoutForm = document.getElementById('workout-form');
    const historyBody = document.getElementById('history-body');

    // Attach Auth Event Listeners
    loginGoogleBtn.addEventListener('click', () => {
        auth.signInWithPopup(googleProvider).catch(error => {
            // Provide a more user-friendly error message
            console.error("Lỗi đăng nhập Google:", error);
            alert(`Đã xảy ra lỗi khi đăng nhập với Google. Vui lòng thử lại. Lỗi: ${error.code}`);
        });
    });

    // Listener cho việc chọn buổi tập mẫu
    templateSelect.addEventListener('change', (e) => {
        const selectedTemplateKey = e.target.value;
        
        // Xóa các gợi ý cũ
        exerciseSuggestionsEl.innerHTML = '';

        if (selectedTemplateKey && workoutTemplates[selectedTemplateKey]) {
            const exercises = workoutTemplates[selectedTemplateKey];
            exercises.forEach(exercise => {
                const option = document.createElement('option');
                option.value = exercise;
                exerciseSuggestionsEl.appendChild(option);
            });
        }
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
            console.error("Lỗi đăng nhập/đăng ký Email:", error);
            authErrorEl.textContent = "Đã xảy ra lỗi. Vui lòng kiểm tra lại Email/Mật khẩu.";
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

    // Đăng ký Service Worker cho PWA
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/service-worker.js')
                .then(registration => {
                    console.log('Service Worker đã được đăng ký thành công:', registration);
                })
                .catch(err => {
                    console.error('Đăng ký Service Worker thất bại:', err);
                });
        });
    }

    // Listener for adding a new set to the main form
    addSetBtn.addEventListener('click', () => addSet('sets-container'));

    // Listener for saving a new workout
    workoutForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!currentUser) {
            alert("Vui lòng đăng nhập để lưu bài tập!");
            return;
        }

        const setsContainer = document.getElementById('sets-container');
        const setsData = Array.from(setsContainer.querySelectorAll('.set-item')).map(setEl => {
            const weight = setEl.querySelector('.set-weight').value;
            const reps = setEl.querySelector('.set-reps').value;
            return { weight: parseFloat(weight) || 0, reps: parseInt(reps) || 0 };
        });

        if (setsData.length === 0) {
            alert("Vui lòng thêm ít nhất một set!");
            return;
        }

        const workoutData = {
            // Use server timestamp for date if not provided, ensuring consistency
            date: document.getElementById('workout-date').value || new Date().toISOString().split('T')[0],
            muscleGroup: document.getElementById('muscle-group').value,
            exercise: document.getElementById('exercise-name').value,
            equipment: document.getElementById('equipment').value,
            notes: document.getElementById('notes').value,
            sets: setsData,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        try {
            await db.collection('users').doc(currentUser.uid).collection('workouts').add(workoutData);
            alert("Đã lưu bài tập thành công!");
            workoutForm.reset();
            setsContainer.innerHTML = ''; // Clear sets from the UI
        } catch (error) {
            console.error("Lỗi khi lưu bài tập: ", error);
            alert("Đã có lỗi xảy ra khi lưu bài tập. Vui lòng thử lại.");
        }
    });

    // Event delegation for edit and delete buttons in the history table
    historyBody.addEventListener('click', async (e) => {
        const target = e.target;
        // Find the closest TR element to get the workout ID
        const workoutRow = target.closest('tr');
        if (!workoutRow) return;

        const workoutId = workoutRow.dataset.id;
        if (!workoutId || !currentUser) return;

        // Handle Delete
        if (target.classList.contains('delete-btn')) {
            if (confirm("Bạn có chắc chắn muốn xóa bài tập này?")) {
                try {
                    await db.collection('users').doc(currentUser.uid).collection('workouts').doc(workoutId).delete();
                    // No need to alert, the UI will update automatically via onSnapshot
                } catch (error) {
                    console.error("Lỗi khi xóa bài tập: ", error);
                    alert("Đã có lỗi xảy ra khi xóa.");
                }
            }
        }

        // Handle Edit
        if (target.classList.contains('edit-btn')) {
            alert(`Chức năng sửa cho ID: ${workoutId} sẽ được thêm vào sớm!`);
            // In the future, this will call a function like:
            // openEditModal(workoutId);
        }
    });
});