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

// Global State
let currentUser = null;
let workouts = [];
let unsubscribe;
let isSignUp = false;
let currentEditId = null; // To track which workout is being edited
let progressChart = null;
let rmChart = null;

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

function updateStatistics() {
    if (workouts.length === 0) return;

    // Tổng số buổi tập
    const totalWorkouts = workouts.length;
    document.getElementById('total-workouts').textContent = totalWorkouts;

    // Bài tập được tập nhiều nhất
    const exerciseCount = {};
    workouts.forEach(w => {
        const exercise = w.exercise || 'Không tên';
        exerciseCount[exercise] = (exerciseCount[exercise] || 0) + 1;
    });
    const mostExercised = Object.entries(exerciseCount)
        .sort(([,a], [,b]) => b - a)[0];
    document.getElementById('most-exercised').textContent = mostExercised ? mostExercised[0] : '-';

    // Nhóm cơ tập nhiều nhất
    const muscleGroupCount = {};
    workouts.forEach(w => {
        const muscleGroup = w.muscleGroup || 'Không xác định';
        muscleGroupCount[muscleGroup] = (muscleGroupCount[muscleGroup] || 0) + 1;
    });
    const mostMuscleGroup = Object.entries(muscleGroupCount)
        .sort(([,a], [,b]) => b - a)[0];
    document.getElementById('most-muscle-group').textContent = mostMuscleGroup ? mostMuscleGroup[0] : '-';

    // Tổng khối lượng
    const totalVolume = workouts.reduce((acc, w) => {
        const sets = w.sets || [];
        return acc + sets.reduce((setAcc, s) => setAcc + ((s.weight || 0) * (s.reps || 0)), 0);
    }, 0);
    document.getElementById('total-volume').textContent = `${totalVolume.toLocaleString('vi-VN')} kg`;
}

function updateChartOptions() {
    const chartExercise = document.getElementById('chart-exercise');
    const rmExercise = document.getElementById('rm-exercise');
    
    if (!chartExercise || !rmExercise) return;

    // Lấy danh sách bài tập duy nhất
    const exercises = [...new Set(workouts.map(w => w.exercise).filter(Boolean))];
    
    // Cập nhật options cho chart
    chartExercise.innerHTML = '<option value="">Chọn bài tập</option>';
    exercises.forEach(exercise => {
        const option = document.createElement('option');
        option.value = exercise;
        option.textContent = exercise;
        chartExercise.appendChild(option);
    });

    // Cập nhật options cho 1RM
    rmExercise.innerHTML = '<option value="">Chọn bài tập</option>';
    exercises.forEach(exercise => {
        const option = document.createElement('option');
        option.value = exercise;
        option.textContent = exercise;
        rmExercise.appendChild(option);
    });
}

function updateProgressChart() {
    const exerciseSelect = document.getElementById('chart-exercise');
    const metricSelect = document.getElementById('chart-metric');
    const periodSelect = document.getElementById('chart-period');
    
    if (!exerciseSelect || !metricSelect || !periodSelect) return;

    const selectedExercise = exerciseSelect.value;
    const selectedMetric = metricSelect.value;
    const selectedPeriod = periodSelect.value;

    if (!selectedExercise) {
        if (progressChart) {
            progressChart.destroy();
            progressChart = null;
        }
        return;
    }

    // Lọc dữ liệu theo bài tập và thời gian
    let filteredWorkouts = workouts.filter(w => w.exercise === selectedExercise);
    
    if (selectedPeriod !== 'all') {
        const daysAgo = new Date();
        daysAgo.setDate(daysAgo.getDate() - parseInt(selectedPeriod));
        filteredWorkouts = filteredWorkouts.filter(w => {
            const workoutDate = new Date(w.date);
            return workoutDate >= daysAgo;
        });
    }

    // Sắp xếp theo ngày
    filteredWorkouts.sort((a, b) => new Date(a.date) - new Date(b.date));

    const labels = filteredWorkouts.map(w => new Date(w.date).toLocaleDateString('vi-VN'));
    const data = filteredWorkouts.map(w => {
        const sets = w.sets || [];
        switch (selectedMetric) {
            case 'weight':
                return Math.max(...sets.map(s => s.weight || 0));
            case 'reps':
                return Math.max(...sets.map(s => s.reps || 0));
            case 'volume':
                return sets.reduce((acc, s) => acc + ((s.weight || 0) * (s.reps || 0)), 0);
            default:
                return 0;
        }
    });

    const ctx = document.getElementById('progress-chart');
    if (!ctx) return;

    if (progressChart) {
        progressChart.destroy();
    }

    progressChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: selectedMetric === 'weight' ? 'Mức tạ (kg)' : 
                       selectedMetric === 'reps' ? 'Số lần lặp (reps)' : 'Tổng khối lượng (kg)',
                data: data,
                borderColor: '#4a90e2',
                backgroundColor: 'rgba(74, 144, 226, 0.1)',
                tension: 0.1
            }]
        },
        options: {
            responsive: true,
            plugins: {
                title: {
                    display: true,
                    text: `Tiến độ ${selectedExercise}`
                }
            },
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
}

function calculate1RM(weight, reps) {
    // Sử dụng công thức Brzycki để tính 1RM
    return weight * (36 / (37 - reps));
}

function update1RMChart() {
    const exerciseSelect = document.getElementById('rm-exercise');
    if (!exerciseSelect) return;

    const selectedExercise = exerciseSelect.value;
    if (!selectedExercise) {
        document.getElementById('rm-overview').innerHTML = 
            '<p style="text-align: center; color: #666; font-style: italic;">Chọn một bài tập để xem ước tính 1RM</p>';
        return;
    }

    const exerciseWorkouts = workouts.filter(w => w.exercise === selectedExercise);
    if (exerciseWorkouts.length === 0) {
        document.getElementById('rm-overview').innerHTML = 
            '<p style="text-align: center; color: #666; font-style: italic;">Chưa có dữ liệu cho bài tập này</p>';
        return;
    }

    // Tính 1RM cho mỗi buổi tập
    const rmData = exerciseWorkouts.map(w => {
        const sets = w.sets || [];
        const maxRM = Math.max(...sets.map(s => calculate1RM(s.weight || 0, s.reps || 0)));
        return {
            date: w.date,
            rm: maxRM
        };
    }).sort((a, b) => new Date(a.date) - new Date(b.date));

    const labels = rmData.map(d => new Date(d.date).toLocaleDateString('vi-VN'));
    const data = rmData.map(d => d.rm);

    const ctx = document.getElementById('rm-overview');
    ctx.innerHTML = `
        <div class="chart-container">
            <canvas id="rm-chart"></canvas>
        </div>
        <div class="rm-stats">
            <p><strong>1RM hiện tại:</strong> ${Math.max(...data).toFixed(1)} kg</p>
            <p><strong>1RM trung bình:</strong> ${(data.reduce((a, b) => a + b, 0) / data.length).toFixed(1)} kg</p>
        </div>
    `;

    const rmCtx = document.getElementById('rm-chart');
    if (rmCtx) {
        if (rmChart) {
            rmChart.destroy();
        }
        rmChart = new Chart(rmCtx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: '1RM (kg)',
                    data: data,
                    borderColor: '#e74c3c',
                    backgroundColor: 'rgba(231, 76, 60, 0.1)',
                    tension: 0.1
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: `1RM - ${selectedExercise}`
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        });
    }
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
        updateStatistics();
        updateChartOptions();
        updateProgressChart();
        update1RMChart();
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
    const addSetBtn = document.getElementById('add-set');
    const workoutForm = document.getElementById('workout-form');
    const historyBody = document.getElementById('history-body');
    const chartExercise = document.getElementById('chart-exercise');
    const chartMetric = document.getElementById('chart-metric');
    const chartPeriod = document.getElementById('chart-period');
    const rmExercise = document.getElementById('rm-exercise');
    const exportDataBtn = document.getElementById('export-data');
    const importDataBtn = document.getElementById('import-data');
    const importFileInput = document.getElementById('import-file');
    const deleteAllBtn = document.getElementById('delete-all');

    // Attach Auth Event Listeners
    loginGoogleBtn.addEventListener('click', () => {
        auth.signInWithPopup(googleProvider).catch(error => {
            console.error("Lỗi đăng nhập Google:", error);
            alert(`Đã xảy ra lỗi khi đăng nhập với Google. Vui lòng thử lại. Lỗi: ${error.code}`);
        });
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
            updateStatistics();
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

    // Chart event listeners
    if (chartExercise) {
        chartExercise.addEventListener('change', updateProgressChart);
    }
    if (chartMetric) {
        chartMetric.addEventListener('change', updateProgressChart);
    }
    if (chartPeriod) {
        chartPeriod.addEventListener('change', updateProgressChart);
    }
    if (rmExercise) {
        rmExercise.addEventListener('change', update1RMChart);
    }

    // Data export/import listeners
    if (exportDataBtn) {
        exportDataBtn.addEventListener('click', () => {
            if (!currentUser) {
                alert('Vui lòng đăng nhập để xuất dữ liệu!');
                return;
            }
            
            const dataStr = JSON.stringify(workouts, null, 2);
            const dataBlob = new Blob([dataStr], {type: 'application/json'});
            const url = URL.createObjectURL(dataBlob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `workout-data-${new Date().toISOString().split('T')[0]}.json`;
            link.click();
            URL.revokeObjectURL(url);
        });
    }

    if (importDataBtn) {
        importDataBtn.addEventListener('click', () => {
            importFileInput.click();
        });
    }

    if (importFileInput) {
        importFileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            if (!currentUser) {
                alert('Vui lòng đăng nhập để nhập dữ liệu!');
                return;
            }

            try {
                const text = await file.text();
                const data = JSON.parse(text);
                
                if (!Array.isArray(data)) {
                    alert('File không đúng định dạng!');
                    return;
                }

                if (confirm(`Bạn có muốn nhập ${data.length} bài tập?`)) {
                    for (const workout of data) {
                        const { id, ...workoutData } = workout;
                        await db.collection('users').doc(currentUser.uid).collection('workouts').add(workoutData);
                    }
                    alert('Đã nhập dữ liệu thành công!');
                }
            } catch (error) {
                console.error('Lỗi khi nhập dữ liệu:', error);
                alert('Đã xảy ra lỗi khi nhập dữ liệu!');
            }
        });
    }

    if (deleteAllBtn) {
        deleteAllBtn.addEventListener('click', async () => {
            if (!currentUser) {
                alert('Vui lòng đăng nhập!');
                return;
            }

            if (confirm('Bạn có chắc chắn muốn xóa TẤT CẢ dữ liệu? Hành động này không thể hoàn tác!')) {
                try {
                    const batch = db.batch();
                    workouts.forEach(workout => {
                        const docRef = db.collection('users').doc(currentUser.uid).collection('workouts').doc(workout.id);
                        batch.delete(docRef);
                    });
                    await batch.commit();
                    alert('Đã xóa tất cả dữ liệu!');
                } catch (error) {
                    console.error('Lỗi khi xóa dữ liệu:', error);
                    alert('Đã xảy ra lỗi khi xóa dữ liệu!');
                }
            }
        });
    }

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