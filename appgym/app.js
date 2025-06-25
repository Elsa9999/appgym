// ===================== IndexedDB Helper for Offline =====================

function openIndexedDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('appgym', 1);
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains('pending_workouts')) {
                db.createObjectStore('pending_workouts', { keyPath: 'id', autoIncrement: true });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function saveWorkoutOffline(workout) {
    const db = await openIndexedDB();
    const tx = db.transaction('pending_workouts', 'readwrite');
    const store = tx.objectStore('pending_workouts');
    await store.add({ ...workout, timestamp: Date.now() });
    db.close();
}

// ===================== Save Workout: Online/Offline =====================

async function saveWorkout(workout) {
    if (navigator.onLine && currentUser) {
        // Online: Lưu trực tiếp lên Firestore
        await db.collection('users').doc(currentUser.uid).collection('workouts').add(workout);
    } else {
        // Offline: Lưu vào IndexedDB
        await saveWorkoutOffline(workout);
        // Đăng ký Background Sync nếu có
        if ('serviceWorker' in navigator && 'SyncManager' in window) {
            const reg = await navigator.serviceWorker.ready;
            try {
                await reg.sync.register('sync-workouts');
            } catch (e) {
                // fallback: sẽ sync khi online
            }
        }
    }
}

// ===================== Sync Pending Workouts =====================

async function syncPendingWorkoutsFromIndexedDB() {
    if (!navigator.onLine || !currentUser) return;
    const dbi = await openIndexedDB();
    const tx = dbi.transaction('pending_workouts', 'readwrite');
    const store = tx.objectStore('pending_workouts');
    const allReq = store.getAll();
    allReq.onsuccess = async () => {
        const workouts = allReq.result;
        for (const w of workouts) {
            // Lưu lên Firestore
            await db.collection('users').doc(currentUser.uid).collection('workouts').add(w);
            store.delete(w.id);
        }
    };
    dbi.close();
}

// Khi online trở lại, tự động sync
window.addEventListener('online', syncPendingWorkoutsFromIndexedDB);

// Lắng nghe message từ service worker để xử lý Background Sync
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'SYNC_WORKOUTS') {
            syncPendingWorkoutsFromIndexedDB();
        }
    });
}

// Listener for workout form submit
if (workoutForm) {
    workoutForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!currentUser) {
            alert('Vui lòng đăng nhập để lưu buổi tập!');
            return;
        }
        // Lấy dữ liệu từ form
        const date = document.getElementById('workout-date').value;
        const muscleGroup = document.getElementById('muscle-group').value;
        const exercise = document.getElementById('exercise-name').value;
        const equipment = document.getElementById('equipment')?.value || '';
        const notes = document.getElementById('notes')?.value || '';
        const sets = Array.from(document.querySelectorAll('#sets-container .set-item')).map(setEl => {
            const weight = setEl.querySelector('.set-weight')?.value;
            const reps = setEl.querySelector('.set-reps')?.value;
            return { weight: Number(weight) || 0, reps: Number(reps) || 0 };
        });
        const exerciseType = document.getElementById('exercise-type')?.value || 'weight';
        const workout = { date, muscleGroup, exercise, equipment, notes, sets, exerciseType };
        try {
            await saveWorkout(workout);
            alert('Đã lưu buổi tập!');
            workoutForm.reset();
            updateSetForm(exerciseType, 'sets-container');
        } catch (err) {
            alert('Lỗi khi lưu buổi tập!');
        }
    });
} 