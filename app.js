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
let aiEngine = null; // AI Recommendations Engine
let personalRecords = {}; // To store PRs locally

// Khởi tạo AI Engine
document.addEventListener('DOMContentLoaded', function() {
    // Load AI Recommendations script
    const script = document.createElement('script');
    script.src = 'ai-recommendations.js';
    script.onload = function() {
        aiEngine = new AIRecommendations();
        updateAIRecommendations();
    };
    document.head.appendChild(script);
});

// =================================================================================
// Function Definitions
// =================================================================================

/**
 * Adds a new set input group to the specified container.
 * @param {string} containerId The ID of the container element for sets.
 * @param {string} exerciseType The type of exercise (weight, bodyweight, or assisted)
 */
function addSet(containerId, exerciseType = 'weight') {
    const container = document.getElementById(containerId);
    if (!container) return;

    const setNumber = container.children.length + 1;
    const setEl = document.createElement('div');
    setEl.classList.add('set-item');
    setEl.classList.add(exerciseType === 'bodyweight' ? 'bodyweight-exercise' : 
                       exerciseType === 'assisted' ? 'assisted-exercise' : 'weight-exercise');
    
    if (exerciseType === 'bodyweight') {
        // For bodyweight exercises, only show reps
        setEl.innerHTML = `
            <label>Set ${setNumber}:</label>
            <input type="number" class="set-reps" placeholder="Reps" required>
            <div class="set-placeholder"></div>
            <button type="button" class="remove-set-btn">Xóa</button>
        `;
    } else if (exerciseType === 'assisted') {
        // For assisted exercises, show weight (assistance) and reps
        setEl.innerHTML = `
            <label>Set ${setNumber}:</label>
            <input type="number" step="any" class="set-weight" placeholder="Hỗ trợ (kg)" required>
            <input type="number" class="set-reps" placeholder="Reps" required>
            <button type="button" class="remove-set-btn">Xóa</button>
        `;
    } else {
        // For weight exercises, show weight and reps
        setEl.innerHTML = `
            <label>Set ${setNumber}:</label>
            <input type="number" step="any" class="set-weight" placeholder="Tạ (kg)" required>
            <input type="number" class="set-reps" placeholder="Reps" required>
            <button type="button" class="remove-set-btn">Xóa</button>
        `;
    }

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

function updateSetForm(exerciseType, containerId = 'sets-container') {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    // Clear existing sets
    container.innerHTML = '';
    
    // Add one initial set with the correct format
    addSet(containerId, exerciseType);
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
        const exerciseType = w.exerciseType || 'weight';
        
        let setsDetails = '';
        if (exerciseType === 'bodyweight') {
            setsDetails = sets.map(s => `<li>${s.reps || 0} reps</li>`).join('');
        } else if (exerciseType === 'assisted') {
            setsDetails = sets.map(s => `<li>Hỗ trợ ${s.weight || 0}kg x ${s.reps || 0} reps</li>`).join('');
        } else {
            setsDetails = sets.map(s => `<li>${s.weight || 0}kg x ${s.reps || 0} reps</li>`).join('');
        }
        
        let totalVolume = 0;
        if (exerciseType === 'bodyweight') {
            totalVolume = sets.reduce((acc, s) => acc + (s.reps || 0), 0);
        } else if (exerciseType === 'assisted') {
            totalVolume = sets.reduce((acc, s) => acc + ((s.weight || 0) * (s.reps || 0)), 0);
        } else {
            totalVolume = sets.reduce((acc, s) => acc + ((s.weight || 0) * (s.reps || 0)), 0);
        }

        return `
            <tr data-id="${w.id}">
                <td>${w.date ? new Date(w.date).toLocaleDateString('vi-VN') : 'N/A'}</td>
                <td>${w.muscleGroup || 'N/A'}</td>
                <td>${w.exercise || 'Không tên'}</td>
                <td>${w.equipment || ''}</td>
                <td><ul class="sets-list">${setsDetails}</ul></td>
                <td>${exerciseType === 'bodyweight' ? `${totalVolume} reps` : 
                     exerciseType === 'assisted' ? `Hỗ trợ ${totalVolume.toLocaleString('vi-VN')} kg` :
                     `${totalVolume.toLocaleString('vi-VN')} kg`}</td>
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
    if (workouts.length === 0) {
        document.getElementById('total-workouts').textContent = 0;
        document.getElementById('most-exercised').textContent = '-';
        document.getElementById('most-muscle-group').textContent = '-';
        document.getElementById('total-volume').textContent = '0 kg';
        return;
    };

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

    // Tổng khối lượng (7 ngày qua)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentWorkouts = workouts.filter(w => new Date(w.date) >= sevenDaysAgo);

    const totalVolume = recentWorkouts.reduce((acc, w) => {
        const sets = w.sets || [];
        const exerciseType = w.exerciseType || 'weight';
        
        if (exerciseType === 'bodyweight') {
            return acc + sets.reduce((setAcc, s) => setAcc + (s.reps || 0), 0);
        } else {
            return acc + sets.reduce((setAcc, s) => setAcc + ((s.weight || 0) * (s.reps || 0)), 0);
        }
    }, 0);
    
    const bodyweightCount = recentWorkouts.filter(w => (w.exerciseType || 'weight') === 'bodyweight').length;
    const weightCount = recentWorkouts.filter(w => (w.exerciseType || 'weight') !== 'bodyweight').length;
    
    if (bodyweightCount > 0 && weightCount > 0) {
        document.getElementById('total-volume').textContent = `${totalVolume.toLocaleString('vi-VN')} (${weightCount} có tạ, ${bodyweightCount} không tạ)`;
    } else if (bodyweightCount > 0) {
        document.getElementById('total-volume').textContent = `${totalVolume.toLocaleString('vi-VN')} reps`;
    } else {
        document.getElementById('total-volume').textContent = `${totalVolume.toLocaleString('vi-VN')} kg`;
    }

    // Cập nhật AI Recommendations
    if (typeof updateAIRecommendations === 'function') {
        updateAIRecommendations();
    }
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
        const exerciseType = w.exerciseType || 'weight';
        
        switch (selectedMetric) {
            case 'weight':
                if (exerciseType === 'bodyweight') {
                    return Math.max(...sets.map(s => s.reps || 0));
                } else {
                    return Math.max(...sets.map(s => s.weight || 0));
                }
            case 'reps':
                return Math.max(...sets.map(s => s.reps || 0));
            case 'volume':
                if (exerciseType === 'bodyweight') {
                    return sets.reduce((acc, s) => acc + (s.reps || 0), 0);
                } else {
                    return sets.reduce((acc, s) => acc + ((s.weight || 0) * (s.reps || 0)), 0);
                }
            default:
                return 0;
        }
    });

    const ctx = document.getElementById('progress-chart');
    if (!ctx) return;

    if (progressChart) {
        progressChart.destroy();
    }

    const selectedWorkout = filteredWorkouts[0];
    const exerciseType = selectedWorkout ? (selectedWorkout.exerciseType || 'weight') : 'weight';
    
    let yAxisLabel = '';
    if (selectedMetric === 'weight') {
        yAxisLabel = exerciseType === 'bodyweight' ? 'Số lần lặp (reps)' : 'Mức tạ (kg)';
    } else if (selectedMetric === 'reps') {
        yAxisLabel = 'Số lần lặp (reps)';
    } else {
        yAxisLabel = exerciseType === 'bodyweight' ? 'Tổng reps' : 'Tổng khối lượng (kg)';
    }

    progressChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: yAxisLabel,
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
        if (typeof renderActivityCalendar === 'function') {
            renderActivityCalendar();
        }
        if (typeof updateMuscleHeatmap === 'function') {
            updateMuscleHeatmap();
        }
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
    const prModal = document.getElementById('pr-modal');
    const closePrModalBtn = document.getElementById('close-pr-modal');
    const aiPlanModal = document.getElementById('ai-plan-modal');
    const closeAiPlanModalBtn = document.getElementById('close-ai-plan-modal');
    const generateAiWorkoutBtn = document.getElementById('generate-ai-workout');

    // Attach Auth Event Listeners
    loginGoogleBtn.addEventListener('click', () => {
        auth.signInWithRedirect(googleProvider).catch(error => {
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
            fetchPersonalRecords();
        } else {
            currentUser = null;
            if (unsubscribe) unsubscribe();
            workouts = [];
            authContainer.classList.remove('hidden');
            appContent.classList.add('hidden');
            userInfo.classList.add('hidden');
            renderHistory();
            updateStatistics();
            if (typeof renderActivityCalendar === 'function') {
                renderActivityCalendar(); // Clear calendar
            }
            if (typeof updateMuscleHeatmap === 'function') {
                updateMuscleHeatmap(); // Clear heatmap
            }
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
    addSetBtn.addEventListener('click', () => {
        const exerciseType = document.getElementById('exercise-type').value || 'weight';
        addSet('sets-container', exerciseType);
    });

    // Listener for exercise type change
    const exerciseTypeSelect = document.getElementById('exercise-type');
    if (exerciseTypeSelect) {
        exerciseTypeSelect.addEventListener('change', (e) => {
            const exerciseType = e.target.value;
            updateSetForm(exerciseType, 'sets-container');
        });
    }

    // Listener for edit exercise type change
    const editExerciseTypeSelect = document.getElementById('edit-exercise-type');
    if (editExerciseTypeSelect) {
        editExerciseTypeSelect.addEventListener('change', (e) => {
            const exerciseType = e.target.value;
            updateSetForm(exerciseType, 'edit-sets-container');
        });
    }

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

    if (closePrModalBtn) {
        closePrModalBtn.addEventListener('click', () => prModal.style.display = 'none');
    }
    window.addEventListener('click', e => {
        if (e.target == prModal) prModal.style.display = 'none';
    });

    if (closeAiPlanModalBtn) {
        closeAiPlanModalBtn.addEventListener('click', () => aiPlanModal.style.display = 'none');
    }
    window.addEventListener('click', e => {
        if (e.target == aiPlanModal) aiPlanModal.style.display = 'none';
    });

    if (generateAiWorkoutBtn) {
        generateAiWorkoutBtn.addEventListener('click', handleAIGenerateWorkout);
    }
});

// =================================================================================
// AI Recommendations Functions
// =================================================================================

/**
 * Cập nhật AI Recommendations
 */
function updateAIRecommendations() {
    if (!aiEngine) {
        console.log('AI Engine chưa sẵn sàng');
        return;
    }

    const container = document.getElementById('ai-recommendations');
    if (!container) return;

    // Hiển thị loading
    container.innerHTML = `
        <div class="ai-loading">
            <div class="spinner"></div>
            <span>Đang phân tích dữ liệu...</span>
        </div>
    `;

    // Phân tích dữ liệu với AI
    setTimeout(() => {
        const recommendations = aiEngine.analyzeProgress(workouts);
        renderAIRecommendations(recommendations);
    }, 500);
}

/**
 * Render AI Recommendations
 */
function renderAIRecommendations(recommendations) {
    const container = document.getElementById('ai-recommendations');
    if (!container) return;

    if (!recommendations || recommendations.length === 0) {
        container.innerHTML = `
            <div class="no-recommendations">
                <div class="icon">🎯</div>
                <h3>Không có gợi ý nào</h3>
                <p>Tiếp tục tập luyện để nhận gợi ý từ AI!</p>
            </div>
        `;
        return;
    }

    const filterValue = document.getElementById('ai-filter')?.value || 'all';
    let filteredRecommendations = recommendations;

    if (filterValue !== 'all') {
        filteredRecommendations = aiEngine.getRecommendationsByPriority(filterValue);
    }

    container.innerHTML = filteredRecommendations.map(rec => `
        <div class="recommendation-card ${rec.priority}-priority">
            <div class="recommendation-type">${getRecommendationTypeText(rec.type)}</div>
            <div class="recommendation-header">
                <h3 class="recommendation-title">${rec.title}</h3>
                <span class="recommendation-exercise">${rec.exercise}</span>
            </div>
            <p class="recommendation-message">${rec.message}</p>
            <button class="recommendation-action" onclick="handleRecommendationAction('${rec.type}', '${rec.exercise}')">
                ${rec.action}
            </button>
        </div>
    `).join('');
}

/**
 * Xử lý action từ recommendation
 */
function handleRecommendationAction(type, exercise) {
    switch (type) {
        case 'progressive_overload':
            alert(`🎯 Gợi ý: Tăng mức tạ cho ${exercise} trong buổi tập tiếp theo!`);
            break;
        case 'rep_scheme':
            alert(`📊 Gợi ý: Thay đổi rep scheme cho ${exercise} - giảm reps, tăng mức tạ!`);
            break;
        case 'frequency':
            alert(`⏰ Gợi ý: Tập lại ${exercise} sớm để duy trì tiến độ!`);
            break;
        case 'plateau':
            alert(`🔄 Gợi ý: ${exercise} đang plateau. Thử thay đổi rep scheme hoặc thêm bài tập bổ trợ!`);
            break;
        case 'new_exercise':
            alert(`🆕 Gợi ý: Thêm ${exercise} vào routine để đa dạng hóa bài tập!`);
            break;
        case 'workout_frequency':
            alert(`📅 Gợi ý: Tăng tần suất tập luyện để tối ưu kết quả!`);
            break;
        case 'rest_time':
            alert(`😴 Gợi ý: Tăng thời gian nghỉ giữa các buổi tập cùng nhóm cơ!`);
            break;
        case 'welcome':
            alert(`🎉 Chào mừng! Bắt đầu ghi lại buổi tập đầu tiên để nhận gợi ý cá nhân hóa!`);
            break;
        case 'starter_workout':
            alert(`🏋️ Gợi ý: Thử workout plan cơ bản: Push-up, Squat, Pull-up mỗi ngày!`);
            break;
        default:
            alert(`Gợi ý: ${exercise}`);
    }
}

/**
 * Lấy text cho recommendation type
 */
function getRecommendationTypeText(type) {
    const typeMap = {
        'progressive_overload': 'Tăng Mức Tạ',
        'rep_scheme': 'Rep Scheme',
        'frequency': 'Tần Suất',
        'plateau': 'Plateau',
        'new_exercise': 'Bài Tập Mới',
        'workout_frequency': 'Tần Suất Tập',
        'rest_time': 'Thời Gian Nghỉ',
        'welcome': 'Chào Mừng',
        'starter_workout': 'Workout Khởi Đầu'
    };
    return typeMap[type] || type;
}

/**
 * Cập nhật AI Recommendations khi có thay đổi dữ liệu
 */
function refreshAIRecommendations() {
    if (aiEngine) {
        updateAIRecommendations();
    }
}

// Thêm event listeners cho AI controls
document.addEventListener('DOMContentLoaded', function() {
    const refreshBtn = document.getElementById('refresh-ai');
    const filterSelect = document.getElementById('ai-filter');

    if (refreshBtn) {
        refreshBtn.addEventListener('click', refreshAIRecommendations);
    }

    if (filterSelect) {
        filterSelect.addEventListener('change', () => {
            if (aiEngine) {
                const recommendations = aiEngine.analyzeProgress(workouts);
                renderAIRecommendations(recommendations);
            }
        });
    }
});

// =================================================================================
// Activity Calendar & Muscle Heatmap Functions
// =================================================================================

function renderActivityCalendar() {
    const calendarContainer = document.getElementById('activity-calendar');
    if (!calendarContainer) return;

    calendarContainer.innerHTML = ''; // Clear previous content

    if (workouts.length === 0) {
        calendarContainer.innerHTML = '<div class="calendar-loading">Chưa có dữ liệu tập luyện.</div>';
        return;
    }

    const today = new Date();
    const daysToShow = 182; // Approx 6 months
    const startDate = new Date();
    startDate.setDate(today.getDate() - daysToShow);
    
    // Normalize start date to the beginning of its week (Sunday)
    startDate.setDate(startDate.getDate() - startDate.getDay());

    // Group workouts by date string 'YYYY-MM-DD'
    const workoutsByDate = workouts.reduce((acc, w) => {
        const dateStr = w.date;
        if (!acc[dateStr]) {
            acc[dateStr] = 0;
        }
        acc[dateStr]++;
        return acc;
    }, {});

    // Generate calendar days
    for (let i = 0; i <= daysToShow + 6; i++) {
        const currentDay = new Date(startDate);
        currentDay.setDate(startDate.getDate() + i);

        if (currentDay > today) continue;

        const dateStr = currentDay.toISOString().split('T')[0];
        const activityCount = workoutsByDate[dateStr] || 0;

        let level = 0;
        if (activityCount > 0) level = 1;
        if (activityCount >= 2) level = 2;
        if (activityCount >= 3) level = 3;
        if (activityCount >= 4) level = 4;

        const dayEl = document.createElement('div');
        dayEl.classList.add('calendar-day');
        dayEl.dataset.level = level;

        // Tooltip
        const tooltipText = `${dateStr}: ${activityCount} buổi tập`;
        dayEl.title = tooltipText;
        
        calendarContainer.appendChild(dayEl);
    }
}

function updateMuscleHeatmap() {
    const muscleGroups = document.querySelectorAll('.muscle-group');
    const tooltip = document.getElementById('muscle-tooltip');
    if (!muscleGroups.length || !tooltip) return;

    if (workouts.length === 0) {
        muscleGroups.forEach(el => {
            el.setAttribute('class', 'muscle-group neutral');
        });
        return;
    }

    const lastWorkoutByMuscle = {};
    workouts.forEach(w => {
        const muscle = w.muscleGroup;
        const date = new Date(w.date);
        if (!lastWorkoutByMuscle[muscle] || date > lastWorkoutByMuscle[muscle]) {
            lastWorkoutByMuscle[muscle] = date;
        }
    });

    const today = new Date();
    
    const muscleElements = {
        'Ngực': document.querySelectorAll('#muscle-chest'),
        'Lưng': document.querySelectorAll('#muscle-back'),
        'Chân': document.querySelectorAll('[id^="muscle-legs"]'),
        'Vai': document.querySelectorAll('[id^="muscle-shoulders"]'),
        'Bụng': document.querySelectorAll('#muscle-abs'),
        'Tay': document.querySelectorAll('[id^="muscle-arms"]')
    };

    Object.keys(muscleElements).forEach(muscleName => {
        const lastWorkoutDate = lastWorkoutByMuscle[muscleName];
        let status = 'neutral';
        let tooltipText = `${muscleName}: Chưa tập`;

        if (lastWorkoutDate) {
            const diffDays = Math.floor((today - lastWorkoutDate) / (1000 * 60 * 60 * 24));
            if (diffDays <= 1) {
                status = 'sore';
                tooltipText = `${muscleName} (Nghỉ ngơi) - Tập ${diffDays} ngày trước`;
            } else if (diffDays <= 3) {
                status = 'recovering';
                tooltipText = `${muscleName} (Đang hồi phục) - Tập ${diffDays} ngày trước`;
            } else {
                status = 'ready';
                tooltipText = `${muscleName} (Sẵn sàng) - Tập ${diffDays} ngày trước`;
            }
        }
        
        muscleElements[muscleName].forEach(el => {
            // If the element is a <g> tag, find rects inside
            if (el.tagName.toLowerCase() === 'g') {
                el.querySelectorAll('rect').forEach(rect => rect.setAttribute('class', `muscle-group ${status}`));
            } else {
                el.setAttribute('class', `muscle-group ${status}`);
            }
            el.dataset.tooltip = tooltipText;
        });
    });

    // Add event listeners for tooltips
    muscleGroups.forEach(el => {
        el.addEventListener('mousemove', e => {
            if (!el.dataset.tooltip) return;
            tooltip.style.display = 'block';
            tooltip.style.left = `${e.pageX + 15}px`;
            tooltip.style.top = `${e.pageY}px`;
            tooltip.textContent = el.dataset.tooltip;
        });
        el.addEventListener('mouseleave', () => {
            tooltip.style.display = 'none';
        });
    });
}

// =================================================================================
// Personal Records (PR) Functions
// =================================================================================
async function fetchPersonalRecords() {
    if (!currentUser) return;
    personalRecords = {}; // Reset local PRs
    try {
        const snapshot = await db.collection('users').doc(currentUser.uid).collection('personal_records').get();
        snapshot.forEach(doc => {
            personalRecords[doc.id] = doc.data();
        });
        renderPersonalRecords();
    } catch (error) {
        console.error("Lỗi khi tải PRs:", error);
    }
}

function renderPersonalRecords() {
    const container = document.getElementById('pr-list');
    if (!container) return;

    const prs = Object.entries(personalRecords);

    if (prs.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #666;">Chưa có kỷ lục nào. Hãy tập luyện và phá vỡ giới hạn!</p>';
        return;
    }

    container.innerHTML = prs.map(([exercise, data]) => {
        const recordsHtml = Object.entries(data.records)
            .sort(([keyA], [keyB]) => {
                // Sort 1RM to be on top
                if (keyA === '1rm') return -1;
                if (keyB === '1rm') return 1;
                return parseInt(keyA) - parseInt(keyB);
            })
            .map(([type, record]) => {
                if (type === '1rm') {
                    return `<li><span class="pr-type">1RM Ước tính</span> <span class="pr-value">${record.value.toFixed(2)} kg</span></li>`;
                }
                return `<li><span class="pr-type">${type} reps</span> <span class="pr-value">${record.weight} kg</span></li>`;
            }).join('');

        return `
            <div class="pr-card">
                <h4>${exercise}</h4>
                <ul>${recordsHtml}</ul>
            </div>
        `;
    }).join('');
}

async function checkAndSetNewPR(workout) {
    if (!currentUser) return;

    const exercise = workout.exercise;
    const exercisePRs = personalRecords[exercise] || { exercise, records: {} };
    const repRanges = [1, 3, 5, 8, 10, 12];
    let newPRsFound = [];
    let prsHaveChanged = false;

    for (const set of workout.sets) {
        if (!set.weight || !set.reps) continue;
        
        // Check for 1RM PR
        const current1RM = calculate1RM(set.weight, set.reps);
        const existing1RM = exercisePRs.records['1rm']?.value || 0;
        if (current1RM > existing1RM) {
            exercisePRs.records['1rm'] = { value: current1RM, date: workout.date };
            newPRsFound.push({ exercise, type: '1RM Ước tính', value: `${current1RM.toFixed(2)} kg` });
            prsHaveChanged = true;
        }

        // Check for Rep-Max PR
        if (repRanges.includes(set.reps)) {
            const existingRepMax = exercisePRs.records[`${set.reps}`]?.weight || 0;
            if (set.weight > existingRepMax) {
                exercisePRs.records[`${set.reps}`] = { weight: set.weight, date: workout.date };
                newPRsFound.push({ exercise, type: `${set.reps} reps`, value: `${set.weight} kg` });
                prsHaveChanged = true;
            }
        }
    }

    if (prsHaveChanged) {
        try {
            // Update local state
            personalRecords[exercise] = exercisePRs;
            // Update Firestore
            await db.collection('users').doc(currentUser.uid).collection('personal_records').doc(exercise).set(exercisePRs);
            // Re-render the PR list
            renderPersonalRecords();
            // Show celebration
            showPRCelebration(newPRsFound);
        } catch (error) {
            console.error("Lỗi khi cập nhật PR:", error);
        }
    }
}

function showPRCelebration(newPRs) {
    const modal = document.getElementById('pr-modal');
    const detailsContainer = document.getElementById('pr-details-container');
    const celebrationContainer = document.querySelector('.pr-celebration');
    if (!modal || !detailsContainer || !celebrationContainer) return;

    // Clear previous details and confetti
    detailsContainer.innerHTML = '';
    celebrationContainer.querySelectorAll('.confetti').forEach(c => c.remove());

    // Populate new PR details
    detailsContainer.innerHTML = newPRs.map(pr => `
        <div class="pr-detail-item">
            <strong>${pr.exercise}</strong>
            <span>${pr.type}: ${pr.value}</span>
        </div>
    `).join('');
    
    // Add confetti
    for (let i = 0; i < 30; i++) {
        const confetti = document.createElement('div');
        confetti.classList.add('confetti');
        const colors = ['#f2d74e', '#ff6b6b', '#60a3bc', '#f7d794', '#a7ff83'];
        confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        confetti.style.left = `${Math.random() * 100}%`;
        confetti.style.animationDelay = `${Math.random() * 5}s`;
        confetti.style.animationDuration = `${3 + Math.random() * 2}s`;
        celebrationContainer.appendChild(confetti);
    }

    modal.style.display = 'flex';
}

// =================================================================================
// AI Workout Builder Functions
// =================================================================================

let generatedPlan = null; // Store the generated plan temporarily

function handleAIGenerateWorkout() {
    const prompt = document.getElementById('ai-workout-prompt').value;
    if (!prompt) {
        alert('Vui lòng nhập mô tả cho buổi tập bạn muốn.');
        return;
    }

    const planContainer = document.getElementById('ai-plan-container');
    aiPlanModal.style.display = 'flex';
    planContainer.innerHTML = `
        <div class="loading-spinner">
            <div class="spinner"></div>
            <p>AI đang tạo kế hoạch tập luyện... 🤖</p>
        </div>
    `;

    // Simulate AI thinking
    setTimeout(() => {
        generatedPlan = generateWorkoutFromPrompt(prompt);
        renderGeneratedPlan(generatedPlan);
    }, 2000);
}

function parsePrompt(prompt) {
    const lowerPrompt = prompt.toLowerCase();
    const result = {
        muscleGroups: [],
        duration: 60, // default
        goal: 'hypertrophy' // default
    };

    // Parse muscle groups
    const muscleKeywords = {
        'ngực': 'Ngực', 'chest': 'Ngực',
        'lưng': 'Lưng', 'back': 'Lưng', 'xô': 'Lưng',
        'chân': 'Chân', 'leg': 'Chân',
        'vai': 'Vai', 'shoulder': 'Vai',
        'tay': 'Tay', 'arm': 'Tay',
        'bụng': 'Bụng', 'abs': 'Bụng', 'core': 'Bụng'
    };
    for (const keyword in muscleKeywords) {
        if (lowerPrompt.includes(keyword)) {
            const group = muscleKeywords[keyword];
            if (!result.muscleGroups.includes(group)) {
                result.muscleGroups.push(group);
            }
        }
    }
    if(result.muscleGroups.length === 0) result.muscleGroups.push('Toàn thân'); // Default to full body


    // Parse duration
    const durationMatch = lowerPrompt.match(/(\d+)\s*(phút|tiếng|h)/);
    if (durationMatch) {
        let duration = parseInt(durationMatch[1]);
        if (durationMatch[2].startsWith('tiếng') || durationMatch[2].startsWith('h')) {
            duration *= 60;
        }
        result.duration = duration;
    }
    
    // Parse goal
    if (lowerPrompt.includes('sức mạnh') || lowerPrompt.includes('strength')) {
        result.goal = 'strength';
    } else if (lowerPrompt.includes('độ bền') || lowerPrompt.includes('endurance')) {
        result.goal = 'endurance';
    }

    return result;
}

function generateWorkoutFromPrompt(prompt) {
    const request = parsePrompt(prompt);
    
    // Simple exercise database for the generator
    const exerciseDB = {
        'Ngực': ['Bench Press', 'Incline Dumbbell Press', 'Push-up', 'Cable Fly'],
        'Lưng': ['Pull-up', 'Deadlift', 'Barbell Row', 'Lat Pulldown'],
        'Chân': ['Squat', 'Leg Press', 'Lunge', 'Leg Curl'],
        'Vai': ['Overhead Press', 'Lateral Raise', 'Face Pull'],
        'Tay': ['Bicep Curl', 'Triceps Pushdown', 'Hammer Curl'],
        'Bụng': ['Crunches', 'Leg Raise', 'Plank']
    };

    let plan = [];
    let exercisesForPlan = [];

    if(request.muscleGroups.includes('Toàn thân')){
        exercisesForPlan.push('Squat');
        exercisesForPlan.push('Bench Press');
        exercisesForPlan.push('Barbell Row');
    } else {
        request.muscleGroups.forEach(group => {
            exercisesForPlan = exercisesForPlan.concat(exerciseDB[group] || []);
        });
    }

    // Determine number of exercises based on duration
    const numExercises = Math.min(Math.floor(request.duration / 15), exercisesForPlan.length);

    // Select exercises
    const selectedExercises = exercisesForPlan.slice(0, numExercises);

    selectedExercises.forEach(exercise => {
        let sets, reps, weightSuggestion;
        const prs = personalRecords[exercise]?.records;
        let baseWeight = 0;

        if (prs) {
            // Try to find a recent 5-rep max to base calculations on
            baseWeight = prs['5']?.weight || (prs['1rm']?.value * 0.85) || 0;
        }

        switch (request.goal) {
            case 'strength':
                sets = 4;
                reps = '4-6';
                weightSuggestion = baseWeight > 0 ? `Khoảng ${Math.round(baseWeight * 0.9 / 2.5) * 2.5} kg` : 'Nặng nhất có thể';
                break;
            case 'endurance':
                sets = 3;
                reps = '15-20';
                weightSuggestion = baseWeight > 0 ? `Khoảng ${Math.round(baseWeight * 0.5 / 2.5) * 2.5} kg` : 'Tạ vừa phải';
                break;
            default: // hypertrophy
                sets = 4;
                reps = '8-12';
                weightSuggestion = baseWeight > 0 ? `Khoảng ${Math.round(baseWeight * 0.75 / 2.5) * 2.5} kg` : 'Tạ vừa sức';
                break;
        }

        plan.push({
            exercise,
            sets,
            reps,
            weightSuggestion,
            muscleGroup: Object.keys(exerciseDB).find(key => exerciseDB[key].includes(exercise))
        });
    });

    return { title: `Kế hoạch tập ${request.muscleGroups.join(' & ')}`, exercises: plan };
}

function renderGeneratedPlan(plan) {
    const container = document.getElementById('ai-plan-container');
    if (!container || !plan) {
        container.innerHTML = `<p>Không thể tạo kế hoạch. Vui lòng thử lại.</p>`;
        return;
    }
    
    let planHtml = `<h3 class="plan-title">${plan.title}</h3>`;
    plan.exercises.forEach((ex, index) => {
        planHtml += `
            <div class="plan-exercise">
                <h4>${index + 1}. ${ex.exercise}</h4>
                <p><strong>Nhóm cơ:</strong> ${ex.muscleGroup}</p>
                <p><strong>Sets:</strong> ${ex.sets}</p>
                <p><strong>Reps:</strong> ${ex.reps}</p>
                <p><strong>Gợi ý tạ:</strong> ${ex.weightSuggestion}</p>
            </div>
        `;
    });

    planHtml += `
        <div class="plan-actions">
            <button id="start-generated-workout" class="btn btn-primary">Bắt Đầu Buổi Tập</button>
            <button id="regenerate-workout" class="btn btn-secondary">Tạo Lại</button>
        </div>
    `;

    container.innerHTML = planHtml;

    // Add event listeners for the new buttons
    document.getElementById('start-generated-workout').addEventListener('click', () => {
        startGeneratedWorkout(plan);
    });
    document.getElementById('regenerate-workout').addEventListener('click', handleAIGenerateWorkout);
}

function startGeneratedWorkout(plan) {
    if (!plan || !plan.exercises || plan.exercises.length === 0) return;

    const firstExercise = plan.exercises[0];

    // Populate the main form
    document.getElementById('muscle-group').value = firstExercise.muscleGroup;
    document.getElementById('exercise-name').value = firstExercise.exercise;
    
    // Clear existing sets and add new ones based on the plan
    const setsContainer = document.getElementById('sets-container');
    setsContainer.innerHTML = '';
    for (let i = 0; i < firstExercise.sets; i++) {
        addSet('sets-container', 'weight');
    }

    // Scroll to the form
    document.querySelector('.workout-form-container').scrollIntoView({ behavior: 'smooth' });

    // Close the modal
    aiPlanModal.style.display = 'none';

    alert(`Đã điền thông tin cho bài tập ${firstExercise.exercise}. Hãy bắt đầu thôi!`);
}