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
            renderCharts();
        } catch (err) {
            alert('Lỗi khi lưu buổi tập!');
        }
    });
}

// ===================== Versioning & Undo/Redo =====================

// --- BẮT ĐẦU: Báo cáo nâng cao & Biểu đồ trực quan ---

async function getAllWorkouts() {
    if (navigator.onLine && currentUser) {
        // Lấy từ Firestore
        const snap = await db.collection('users').doc(currentUser.uid).collection('workouts').get();
        return snap?.docs?.map(doc => ({ id: doc.id, ...(doc?.data?.() || {}) })) || [];
    } else {
        // Lấy từ IndexedDB
        const dbi = await openIndexedDB();
        const tx = dbi.transaction('pending_workouts', 'readonly');
        const store = tx.objectStore('pending_workouts');
        return new Promise((resolve) => {
            const req = store.getAll();
            req.onsuccess = () => {
                dbi.close();
                resolve(req.result || []);
            };
            req.onerror = () => {
                dbi.close();
                resolve([]);
            };
        });
    }
}

let muscleVolumeChart, workoutCountChart;

async function renderCharts() {
    const workouts = await getAllWorkouts() || [];
    // --- Chart 1: Khối lượng tập theo nhóm cơ ---
    const muscleGroups = {};
    workouts.forEach(w => {
        if (w.muscleGroup && Array.isArray(w.sets)) {
            const vol = w.sets.reduce((sum, s) => sum + (s.weight || 0) * (s.reps || 0), 0);
            muscleGroups[w.muscleGroup] = (muscleGroups[w.muscleGroup] || 0) + vol;
        }
    });
    const mgLabels = Object.keys(muscleGroups);
    const mgData = Object.values(muscleGroups);
    // --- Chart 2: Số buổi tập theo ngày ---
    const dateCount = {};
    workouts.forEach(w => {
        if (w.date) {
            dateCount[w.date] = (dateCount[w.date] || 0) + 1;
        }
    });
    // Sắp xếp ngày tăng dần
    const dateLabels = Object.keys(dateCount).sort();
    const dateData = dateLabels.map(d => dateCount[d]);
    // Vẽ biểu đồ
    if (window.Chart) {
        // Destroy old charts if exist
        if (muscleVolumeChart) muscleVolumeChart.destroy();
        if (workoutCountChart) workoutCountChart.destroy();
        // Bar chart: muscle volume
        const ctx1 = document.getElementById('muscleVolumeChart').getContext('2d');
        muscleVolumeChart = new Chart(ctx1, {
            type: 'bar',
            data: {
                labels: mgLabels,
                datasets: [{
                    label: 'Khối lượng tập (kg x reps)',
                    data: mgData,
                    backgroundColor: 'rgba(54, 162, 235, 0.7)',
                    borderColor: 'rgba(54, 162, 235, 1)',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { display: false },
                    title: { display: false }
                },
                scales: {
                    y: { beginAtZero: true }
                }
            }
        });
        // Line chart: workout count by date
        const ctx2 = document.getElementById('workoutCountChart').getContext('2d');
        workoutCountChart = new Chart(ctx2, {
            type: 'line',
            data: {
                labels: dateLabels,
                datasets: [{
                    label: 'Số buổi tập',
                    data: dateData,
                    fill: false,
                    borderColor: 'rgba(255, 99, 132, 1)',
                    backgroundColor: 'rgba(255, 99, 132, 0.2)',
                    tension: 0.3,
                    pointRadius: 4,
                    pointHoverRadius: 7
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { display: false },
                    title: { display: false }
                },
                scales: {
                    y: { beginAtZero: true }
                }
            }
        });
    }
}

// Tự động vẽ lại biểu đồ khi load trang và khi có workout mới
window.addEventListener('DOMContentLoaded', renderCharts);
window.addEventListener('online', renderCharts);
// Có thể gọi renderCharts() sau khi thêm/xóa workout nếu muốn realtime hơn
// --- KẾT THÚC: Báo cáo nâng cao & Biểu đồ trực quan ---

// Lưu lịch sử trước khi xóa hoặc update
async function saveWorkoutHistory(workoutId, oldData, actionType = 'delete') {
    if (!currentUser || !workoutId || !oldData) return;
    const historyRef = db.collection('users').doc(currentUser.uid)
        .collection('workouts').doc(workoutId).collection('history');
    await historyRef.add({
        data: oldData,
        action: actionType,
        timestamp: Date.now()
    });
}

// Sửa logic xóa workout: lưu lịch sử trước khi xóa
async function deleteWorkoutWithHistory(workoutId) {
    if (!currentUser || !workoutId) return;
    const docRef = db.collection('users').doc(currentUser.uid).collection('workouts').doc(workoutId);
    const docSnap = await docRef.get();
    if (docSnap.exists) {
        await saveWorkoutHistory(workoutId, docSnap.data(), 'delete');
        await docRef.delete();
    }
    renderCharts();
}

// Undo xóa: khôi phục bản xóa gần nhất
async function undoLastDelete(workoutId) {
    if (!currentUser || !workoutId) return;
    const historyRef = db.collection('users').doc(currentUser.uid)
        .collection('workouts').doc(workoutId).collection('history')
        .orderBy('timestamp', 'desc').limit(1);
    const snap = await historyRef.get();
    if (!snap.empty) {
        const last = snap.docs[0].data();
        if (last.action === 'delete') {
            await db.collection('users').doc(currentUser.uid).collection('workouts').doc(workoutId).set(last.data);
            // Có thể xóa bản history này nếu muốn chỉ undo 1 lần
        }
    }
}

// Giả sử có hàm renderWorkoutsTable/workoutRow, thêm event xóa:
document.addEventListener('click', async (e) => {
    if (e.target.classList.contains('delete-workout-btn')) {
        const workoutRow = e.target.closest('tr');
        const workoutId = workoutRow?.dataset?.id;
        if (!workoutId || !currentUser) return;
        await deleteWorkoutWithHistory(workoutId);
        // Hiển thị nút Undo
        showUndoButton(workoutId);
        // Cập nhật lại bảng
        // renderWorkoutsTable();
    }
});

// Hàm hiển thị nút Undo (có thể tuỳ chỉnh UI theo app)
function showUndoButton(workoutId) {
    const undoBtn = document.createElement('button');
    undoBtn.textContent = 'Hoàn tác xóa';
    undoBtn.className = 'undo-delete-btn';
    undoBtn.onclick = async () => {
        await undoLastDelete(workoutId);
        undoBtn.remove();
        // renderWorkoutsTable();
    };
    document.body.appendChild(undoBtn);
}

// Sửa logic update workout: lưu bản cũ vào history trước khi update
async function updateWorkoutWithHistory(workoutId, newData) {
    if (!currentUser || !workoutId || !newData) return;
    const docRef = db.collection('users').doc(currentUser.uid).collection('workouts').doc(workoutId);
    const docSnap = await docRef.get();
    if (docSnap.exists) {
        await saveWorkoutHistory(workoutId, docSnap.data(), 'update');
        await docRef.set(newData, { merge: true });
    }
}

// Lấy danh sách lịch sử chỉnh sửa/xóa
async function getWorkoutHistory(workoutId) {
    if (!currentUser || !workoutId) return [];
    const historyRef = db.collection('users').doc(currentUser.uid)
        .collection('workouts').doc(workoutId).collection('history')
        .orderBy('timestamp', 'desc');
    const snap = await historyRef.get();
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

// Khôi phục về một bản cụ thể trong lịch sử
async function undoToHistoryVersion(workoutId, historyId) {
    if (!currentUser || !workoutId || !historyId) return;
    const historyRef = db.collection('users').doc(currentUser.uid)
        .collection('workouts').doc(workoutId).collection('history').doc(historyId);
    const snap = await historyRef.get();
    if (snap.exists) {
        const data = snap.data();
        await db.collection('users').doc(currentUser.uid).collection('workouts').doc(workoutId).set(data.data);
    }
}

// Thêm UI: Nút 'Xem lịch sử' cho mỗi workout (giả sử có renderWorkoutsTable)
function renderHistoryButton(workoutId) {
    const btn = document.createElement('button');
    btn.textContent = 'Xem lịch sử';
    btn.className = 'view-history-btn';
    btn.onclick = () => showHistoryModal(workoutId);
    return btn;
}

// Hiển thị modal lịch sử
async function showHistoryModal(workoutId) {
    const history = await getWorkoutHistory(workoutId);
    const modal = document.createElement('div');
    modal.className = 'history-modal';
    modal.innerHTML = `<h3>Lịch sử chỉnh sửa/xóa</h3><ul></ul><button class='close-history'>Đóng</button>`;
    const ul = modal.querySelector('ul');
    history.forEach(h => {
        const li = document.createElement('li');
        li.textContent = `${new Date(h.timestamp).toLocaleString()} - ${h.action}`;
        const undoBtn = document.createElement('button');
        undoBtn.textContent = 'Khôi phục';
        undoBtn.onclick = async () => {
            await undoToHistoryVersion(workoutId, h.id);
            modal.remove();
            // renderWorkoutsTable();
        };
        li.appendChild(undoBtn);
        ul.appendChild(li);
    });
    modal.querySelector('.close-history').onclick = () => modal.remove();
    document.body.appendChild(modal);
}

// Giả sử renderWorkoutsTable có đoạn thêm dòng:
function animateAddRow(row) {
  row.classList.add('added-animate');
  setTimeout(() => row.classList.remove('added-animate'), 400);
}
function animateRemoveRow(row, cb) {
  row.classList.add('removed-animate');
  setTimeout(() => { row.remove(); if(cb)cb(); }, 400);
}
// Khi thêm workout mới:
// animateAddRow(newRow);
// Khi xóa:
// animateRemoveRow(row, () => ...);
// Khi undo:
// animateAddRow(restoredRow);

// Map bài tập với file 3D mẫu
const exercise3DModels = {
  'Bench Press': '3d-models/bench-press.glb',
  'Squat': '3d-models/squat.glb',
  // Thêm các bài tập khác nếu có model
};

function showExercise3D(exerciseName) {
  const viewer = document.getElementById('exercise-3d-viewer');
  const model = exercise3DModels[exerciseName];
  if (model) {
    viewer.innerHTML = `<model-viewer src='${model}' alt='${exerciseName} 3D' auto-rotate camera-controls style='width:100%;max-width:320px;height:320px;background:#111;border-radius:12px;'></model-viewer>`;
  } else {
    viewer.innerHTML = '';
  }
}
// Gọi showExercise3D khi chọn bài tập
const exerciseInput = document.getElementById('exercise-name');
if (exerciseInput) {
  exerciseInput.addEventListener('change', e => showExercise3D(e.target.value));
}

// --- BẮT ĐẦU: InBody AI Analysis ---

// Lưu kết quả phân tích InBody vào Firestore hoặc IndexedDB
async function saveInbodyAnalysis(analysisText) {
    const now = new Date();
    const inbodyData = {
        text: analysisText,
        timestamp: now.toISOString(),
    };
    if (navigator.onLine && currentUser) {
        await db.collection('users').doc(currentUser.uid).collection('inbody').add(inbodyData);
    } else {
        // Lưu offline (IndexedDB): tạo objectStore nếu chưa có
        const dbi = await openIndexedDB();
        if (!dbi.objectStoreNames.contains('inbody')) {
            dbi.close();
            // Upgrade DB để thêm objectStore mới
            await new Promise((resolve, reject) => {
                const req = indexedDB.open('appgym', dbi.version + 1);
                req.onupgradeneeded = (event) => {
                    const db2 = event.target.result;
                    if (!db2.objectStoreNames.contains('inbody')) {
                        db2.createObjectStore('inbody', { keyPath: 'timestamp' });
                    }
                };
                req.onsuccess = () => { req.result.close(); resolve(); };
                req.onerror = () => reject(req.error);
            });
        }
        const db2 = await openIndexedDB();
        const tx = db2.transaction('inbody', 'readwrite');
        const store = tx.objectStore('inbody');
        await store.add(inbodyData);
        db2.close();
    }
}

// Lấy tất cả kết quả InBody (mới nhất trước)
async function getAllInbodyAnalysis() {
    if (navigator.onLine && currentUser) {
        const snap = await db.collection('users').doc(currentUser.uid).collection('inbody').orderBy('timestamp', 'desc').get();
        return snap?.docs?.map(doc => ({ id: doc.id, ...(doc?.data?.() || {}) })) || [];
    } else {
        const dbi = await openIndexedDB();
        if (!dbi.objectStoreNames.contains('inbody')) return [];
        const tx = dbi.transaction('inbody', 'readonly');
        const store = tx.objectStore('inbody');
        return new Promise((resolve) => {
            const req = store.getAll();
            req.onsuccess = () => {
                dbi.close();
                const arr = req.result || [];
                arr.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
                resolve(arr);
            };
            req.onerror = () => { dbi.close(); resolve([]); };
        });
    }
}

// So sánh 2 bản phân tích InBody (dạng text)
function compareInbodyAnalysis(current, previous) {
    if (!previous) return '';
    // So sánh đơn giản: highlight sự thay đổi về số liệu (nếu có)
    // Có thể dùng regex để tìm các chỉ số như: cân nặng, mỡ, cơ, nước...
    const metrics = [
        { key: 'Cân nặng', regex: /Cân nặng\s*:?\s*([\d.,]+)/i },
        { key: 'Mỡ', regex: /Mỡ\s*:?\s*([\d.,]+)/i },
        { key: 'Cơ', regex: /Cơ\s*:?\s*([\d.,]+)/i },
        { key: 'Nước', regex: /Nước\s*:?\s*([\d.,]+)/i },
        { key: 'BMI', regex: /BMI\s*:?\s*([\d.,]+)/i },
        { key: 'BMR', regex: /BMR\s*:?\s*([\d.,]+)/i },
    ];
    let html = '<h4>So sánh với lần trước:</h4><ul>';
    metrics.forEach(m => {
        const cur = (current.text.match(m.regex)||[])[1];
        const prev = (previous.text.match(m.regex)||[])[1];
        if (cur && prev && cur !== prev) {
            html += `<li><b>${m.key}:</b> ${prev} → <span style='color:${parseFloat(cur)>parseFloat(prev)?'red':'green'}'>${cur}</span></li>`;
        }
    });
    html += '</ul>';
    return html;
}

// Gợi ý chiến lược dựa trên thay đổi (demo đơn giản)
function suggestStrategy(current, previous) {
    if (!previous) return '';
    let msg = '';
    // Nếu mỡ tăng, cơ giảm thì cảnh báo
    const mFat = /Mỡ\s*:?\s*([\d.,]+)/i;
    const mMuscle = /Cơ\s*:?\s*([\d.,]+)/i;
    const fatCur = (current.text.match(mFat)||[])[1];
    const fatPrev = (previous.text.match(mFat)||[])[1];
    const muscleCur = (current.text.match(mMuscle)||[])[1];
    const musclePrev = (previous.text.match(mMuscle)||[])[1];
    if (fatCur && fatPrev && parseFloat(fatCur) > parseFloat(fatPrev)) {
        msg += '⚠️ Mỡ tăng, nên kiểm soát chế độ ăn và tăng cardio.<br>';
    }
    if (muscleCur && musclePrev && parseFloat(muscleCur) < parseFloat(musclePrev)) {
        msg += '⚠️ Cơ giảm, nên tăng cường tập luyện sức mạnh và bổ sung protein.<br>';
    }
    return msg ? `<div style='color:#d32f2f;font-weight:bold;'>${msg}</div>` : '';
}

// Xử lý sự kiện lưu và hiển thị so sánh
window.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('save-inbody-btn');
    const textarea = document.getElementById('inbody-analysis-input');
    const feedback = document.getElementById('inbody-feedback');
    const compareDiv = document.getElementById('inbody-compare');
    if (!btn) return;
    btn.onclick = async () => {
        const text = textarea.value.trim();
        if (!text) {
            feedback.textContent = 'Vui lòng dán kết quả phân tích!';
            feedback.style.color = 'red';
            return;
        }
        await saveInbodyAnalysis(text);
        feedback.textContent = 'Đã lưu kết quả InBody!';
        feedback.style.color = 'green';
        textarea.value = '';
        await renderInbodyCompare();
    };
    renderInbodyCompare();

    async function renderInbodyCompare() {
        const arr = await getAllInbodyAnalysis();
        if (arr.length === 0) {
            compareDiv.innerHTML = '<i>Chưa có dữ liệu InBody.</i>';
            return;
        }
        const current = arr[0];
        const previous = arr[1];
        let html = `<div style='background:#f8f9fa;padding:16px;border-radius:8px;margin-bottom:12px;'><b>Kết quả mới nhất:</b><br>${current.text.replace(/\n/g,'<br>')}</div>`;
        html += compareInbodyAnalysis(current, previous);
        html += suggestStrategy(current, previous);
        compareDiv.innerHTML = html;
    }
});
// --- KẾT THÚC: InBody AI Analysis ---

// --- BẮT ĐẦU: Thông tin cá nhân, lịch sử xuất AI, biểu đồ tiến trình InBody ---

// 1. Form nhập/chỉnh sửa thông tin cá nhân
window.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('profile-form');
    if (!form) return;
    // Load dữ liệu từ localStorage
    form.height.value = localStorage.getItem('user_height') || '';
    form.weight.value = localStorage.getItem('user_weight') || '';
    form.age.value = localStorage.getItem('user_age') || '';
    form.tdee.value = localStorage.getItem('user_tdee') || '';
    form.goal.value = localStorage.getItem('user_goal') || '';
    form.onsubmit = e => {
        e.preventDefault();
        localStorage.setItem('user_height', form.height.value.trim());
        localStorage.setItem('user_weight', form.weight.value.trim());
        localStorage.setItem('user_age', form.age.value.trim());
        localStorage.setItem('user_tdee', form.tdee.value.trim());
        localStorage.setItem('user_goal', form.goal.value.trim());
        document.getElementById('profile-feedback').textContent = 'Đã lưu!';
        setTimeout(()=>{document.getElementById('profile-feedback').textContent='';}, 2000);
    };
});

// 2. Lưu và hiển thị lịch sử xuất dữ liệu cho AI
function saveExportHistory(text) {
    const arr = JSON.parse(localStorage.getItem('export_ai_history')||'[]');
    arr.unshift({ text, time: new Date().toISOString() });
    if (arr.length > 20) arr.length = 20; // Giới hạn 20 bản gần nhất
    localStorage.setItem('export_ai_history', JSON.stringify(arr));
}
function renderExportHistory() {
    const arr = JSON.parse(localStorage.getItem('export_ai_history')||'[]');
    const list = document.getElementById('export-history-list');
    if (!list) return;
    if (arr.length === 0) {
        list.innerHTML = '<i>Chưa có lịch sử xuất dữ liệu.</i>';
        return;
    }
    list.innerHTML = arr.map((item, idx) => {
      const safeText = item.text.replace(/`/g, '\`').replace(/\\/g, '\\').replace(/'/g, "&#39;").replace(/\n/g, '\\n');
      return `
        <div style='background:#f8f9fa;padding:12px 16px;border-radius:8px;margin-bottom:12px;'>
          <b>Lần ${arr.length-idx}:</b> ${new Date(item.time).toLocaleString()}<br>
          <button onclick="(function(){const ta=document.createElement('textarea');ta.value='${safeText}';document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();})()">Copy</button>
          <button onclick="(function(){alert('Nội dung xuất lần này:\n\n${safeText}');})()">Xem lại</button>
        </div>
      `;
    }).join('');
}
window.addEventListener('DOMContentLoaded', renderExportHistory);

// Gọi saveExportHistory mỗi lần xuất AI
const oldExportAI = window.generateAIExportText;
window.generateAIExportText = async function() {
    const text = await oldExportAI();
    saveExportHistory(text);
    renderExportHistory();
    return text;
};

// 3. Biểu đồ tiến trình InBody (cân nặng, mỡ, cơ, BMI)
let inbodyProgressChart;
async function renderInbodyProgressChart() {
    const arr = await getAllInbodyAnalysis();
    const ctx = document.getElementById('inbodyProgressChart')?.getContext('2d');
    if (!ctx) return;
    if (inbodyProgressChart) inbodyProgressChart.destroy();
    if (arr.length === 0) {
        ctx.canvas.height = 60;
        ctx.clearRect(0,0,ctx.canvas.width,ctx.canvas.height);
        ctx.font = '16px sans-serif';
        ctx.fillText('Chưa có dữ liệu InBody.', 20, 40);
        return;
    }
    // Trích xuất các chỉ số
    const labels = arr.map(a=>a.timestamp?.slice(0,10)).reverse();
    function extract(key, rgx) {
        return arr.map(a=>(a.text.match(rgx)||[])[1]||null).reverse();
    }
    const weight = extract('Cân nặng', /Cân nặng\s*:?\s*([\d.,]+)/i);
    const fat = extract('Mỡ', /Mỡ\s*:?\s*([\d.,]+)/i);
    const muscle = extract('Cơ', /Cơ\s*:?\s*([\d.,]+)/i);
    const bmi = extract('BMI', /BMI\s*:?\s*([\d.,]+)/i);
    inbodyProgressChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                { label: 'Cân nặng', data: weight, borderColor: '#1976d2', backgroundColor: '#1976d233', spanGaps:true },
                { label: 'Mỡ', data: fat, borderColor: '#e53935', backgroundColor: '#e5393522', spanGaps:true },
                { label: 'Cơ', data: muscle, borderColor: '#43a047', backgroundColor: '#43a04722', spanGaps:true },
                { label: 'BMI', data: bmi, borderColor: '#ffb300', backgroundColor: '#ffb30022', spanGaps:true },
            ]
        },
        options: {
            responsive: true,
            plugins: { legend: { position: 'top' } },
            scales: { y: { beginAtZero: false } }
        }
    });
}
window.addEventListener('DOMContentLoaded', renderInbodyProgressChart);
// Tự động vẽ lại khi thêm inbody mới và cập nhật thành tích
const originalSaveInbody = window.saveInbodyAnalysis;
window.saveInbodyAnalysis = async function(text) {
    await originalSaveInbody(text);
    renderInbodyProgressChart();
    updateAchievementDisplay();
};
// --- KẾT THÚC: Thông tin cá nhân, lịch sử xuất AI, biểu đồ tiến trình InBody ---

// --- BẮT ĐẦU: Biểu đồ nâng cao & Export dữ liệu ---

let muscleBalanceChart, volumeTimeChart, trendAnalysisChart;

// Vẽ biểu đồ radar cân bằng nhóm cơ
async function renderMuscleBalanceChart() {
    const workouts = await getAllWorkouts() || [];
    const ctx = document.getElementById('muscleBalanceChart')?.getContext('2d');
    if (!ctx) return;
    if (muscleBalanceChart) muscleBalanceChart.destroy();
    
    const muscleGroups = ['Ngực', 'Lưng', 'Vai', 'Chân', 'Tay', 'Bụng'];
    const muscleData = {};
    muscleGroups.forEach(mg => muscleData[mg] = 0);
    
    workouts.forEach(w => {
        if (w.muscleGroup && muscleData.hasOwnProperty(w.muscleGroup)) {
            const volume = w.sets?.reduce((sum, s) => sum + (s.weight||0)*(s.reps||0), 0) || 0;
            muscleData[w.muscleGroup] += volume;
        }
    });
    
    const data = muscleGroups.map(mg => muscleData[mg]);
    const maxValue = Math.max(...data);
    const normalizedData = data.map(d => maxValue > 0 ? (d/maxValue)*100 : 0);
    
    muscleBalanceChart = new Chart(ctx, {
        type: 'radar',
        data: {
            labels: muscleGroups,
            datasets: [{
                label: 'Cân bằng nhóm cơ (%)',
                data: normalizedData,
                backgroundColor: 'rgba(54, 162, 235, 0.2)',
                borderColor: 'rgba(54, 162, 235, 1)',
                borderWidth: 2,
                pointBackgroundColor: 'rgba(54, 162, 235, 1)',
                pointBorderColor: '#fff',
                pointHoverBackgroundColor: '#fff',
                pointHoverBorderColor: 'rgba(54, 162, 235, 1)',
                pointRadius: 4,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { display: false },
                title: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const index = context.dataIndex;
                            const volume = data[index];
                            const percentage = normalizedData[index];
                            return [
                                `${muscleGroups[index]}: ${percentage.toFixed(1)}%`,
                                `Volume thực tế: ${volume.toLocaleString()} kg x reps`
                            ];
                        }
                    }
                }
            },
            scales: {
                r: {
                    beginAtZero: true,
                    max: 100,
                    ticks: { 
                        stepSize: 20,
                        callback: function(value) {
                            return value + '%';
                        }
                    },
                    pointLabels: {
                        font: {
                            size: 12,
                            weight: 'bold'
                        }
                    }
                }
            }
        }
    });
}

// Vẽ biểu đồ bubble volume theo thời gian
async function renderVolumeTimeChart() {
    const workouts = await getAllWorkouts() || [];
    const ctx = document.getElementById('volumeTimeChart')?.getContext('2d');
    if (!ctx) return;
    if (volumeTimeChart) volumeTimeChart.destroy();
    
    const data = workouts.map(w => {
        const volume = w.sets?.reduce((sum, s) => sum + (s.weight||0)*(s.reps||0), 0) || 0;
        const date = new Date(w.date);
        return {
            x: date.getTime(),
            y: volume,
            r: Math.min(volume/100, 20), // Bubble size based on volume
            label: `${w.exercise} - ${w.muscleGroup}`,
            date: w.date,
            sets: w.sets?.length || 0
        };
    }).filter(d => d.y > 0);
    
    volumeTimeChart = new Chart(ctx, {
        type: 'bubble',
        data: {
            datasets: [{
                label: 'Volume tập luyện',
                data: data,
                backgroundColor: 'rgba(255, 99, 132, 0.6)',
                borderColor: 'rgba(255, 99, 132, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { display: false },
                title: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const data = context.raw;
                            return [
                                `Bài tập: ${data.label}`,
                                `Ngày: ${data.date}`,
                                `Volume: ${data.y} kg x reps`,
                                `Số set: ${data.sets}`
                            ];
                        }
                    }
                }
            },
            scales: {
                x: {
                    type: 'time',
                    time: { 
                        unit: 'day',
                        displayFormats: {
                            day: 'dd/MM'
                        }
                    },
                    title: { display: true, text: 'Thời gian' }
                },
                y: {
                    title: { display: true, text: 'Volume (kg x reps)' }
                }
            }
        }
    });
}

// Vẽ biểu đồ phân tích xu hướng
async function renderTrendAnalysisChart() {
    const workouts = await getAllWorkouts() || [];
    const ctx = document.getElementById('trendAnalysisChart')?.getContext('2d');
    if (!ctx) return;
    if (trendAnalysisChart) trendAnalysisChart.destroy();
    
    // Nhóm dữ liệu theo tuần
    const weeklyData = {};
    workouts.forEach(w => {
        if (w.date) {
            const date = new Date(w.date);
            const weekStart = new Date(date);
            weekStart.setDate(date.getDate() - date.getDay());
            const weekKey = weekStart.toISOString().slice(0, 10);
            
            if (!weeklyData[weekKey]) {
                weeklyData[weekKey] = { volume: 0, count: 0, exercises: new Set() };
            }
            
            const volume = w.sets?.reduce((sum, s) => sum + (s.weight||0)*(s.reps||0), 0) || 0;
            weeklyData[weekKey].volume += volume;
            weeklyData[weekKey].count += 1;
            if (w.exercise) weeklyData[weekKey].exercises.add(w.exercise);
        }
    });
    
    const weeks = Object.keys(weeklyData).sort();
    const volumeData = weeks.map(w => weeklyData[w].volume);
    const countData = weeks.map(w => weeklyData[w].count);
    const exerciseData = weeks.map(w => weeklyData[w].exercises.size);
    
    trendAnalysisChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: weeks.map(w => `Tuần ${new Date(w).getDate()}/${new Date(w).getMonth()+1}`),
            datasets: [
                {
                    label: 'Volume (kg x reps)',
                    data: volumeData,
                    borderColor: 'rgba(54, 162, 235, 1)',
                    backgroundColor: 'rgba(54, 162, 235, 0.1)',
                    yAxisID: 'y'
                },
                {
                    label: 'Số buổi tập',
                    data: countData,
                    borderColor: 'rgba(255, 99, 132, 1)',
                    backgroundColor: 'rgba(255, 99, 132, 0.1)',
                    yAxisID: 'y1'
                },
                {
                    label: 'Số bài tập khác nhau',
                    data: exerciseData,
                    borderColor: 'rgba(75, 192, 192, 1)',
                    backgroundColor: 'rgba(75, 192, 192, 0.1)',
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { position: 'top' },
                title: { display: false }
            },
            scales: {
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    title: { display: true, text: 'Volume' }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    title: { display: true, text: 'Số lượng' },
                    grid: { drawOnChartArea: false }
                }
            }
        }
    });
}

// Xuất dữ liệu ra CSV
async function exportToCSV() {
    const options = getExportOptions();
    const data = await collectExportData(options) || {};
    
    let csv = '';
    if (options.workouts) {
        csv += 'Buổi tập\n';
        csv += 'Ngày,Nhóm cơ,Bài tập,Thiết bị,Ghi chú,Số set,Volume\n';
        data.workouts.forEach(w => {
            const volume = w.sets?.reduce((sum, s) => sum + (s.weight||0)*(s.reps||0), 0) || 0;
            csv += `"${w.date}","${w.muscleGroup}","${w.exercise}","${w.equipment}","${w.notes}",${w.sets?.length || 0},${volume}\n`;
        });
        csv += '\n';
    }
    
    if (options.inbody) {
        csv += 'InBody\n';
        csv += 'Thời gian,Nội dung\n';
        data.inbody.forEach(i => {
            csv += `"${i.timestamp}","${i.text.replace(/"/g, '""')}"\n`;
        });
        csv += '\n';
    }
    
    downloadFile(csv, 'appgym-data.csv', 'text/csv');
}

// Xuất dữ liệu ra JSON
async function exportToJSON() {
    const options = getExportOptions();
    const data = await collectExportData(options) || {};
    
    const jsonData = {
        exportDate: new Date().toISOString(),
        version: '1.0',
        data: data
    };
    
    downloadFile(JSON.stringify(jsonData, null, 2), 'appgym-data.json', 'application/json');
}

// Xuất dữ liệu ra PDF
async function exportToPDF() {
    const options = getExportOptions();
    const data = await collectExportData(options) || {};
    
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    let y = 20;
    
    // Header
    doc.setFontSize(24);
    doc.setTextColor(54, 162, 235);
    doc.text('Báo cáo AppGym', 20, y);
    y += 15;
    
    doc.setFontSize(12);
    doc.setTextColor(100, 100, 100);
    doc.text(`Xuất ngày: ${new Date().toLocaleString('vi-VN')}`, 20, y);
    y += 20;
    
    // Thống kê tổng quan
    if (options.workouts && data.workouts.length > 0) {
        const totalVolume = data.workouts.reduce((sum, w) => {
            return sum + (w.sets?.reduce((s, set) => s + (set.weight||0)*(set.reps||0), 0) || 0);
        }, 0);
        const muscleGroups = [...new Set(data.workouts.map(w => w.muscleGroup).filter(Boolean))];
        const exercises = [...new Set(data.workouts.map(w => w.exercise).filter(Boolean))];
        
        doc.setFontSize(16);
        doc.setTextColor(54, 162, 235);
        doc.text('📊 Thống kê tổng quan', 20, y);
        y += 10;
        
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        doc.text(`• Tổng số buổi tập: ${data.workouts.length}`, 25, y);
        y += 7;
        doc.text(`• Tổng volume: ${totalVolume.toLocaleString()} kg x reps`, 25, y);
        y += 7;
        doc.text(`• Nhóm cơ đã tập: ${muscleGroups.length}`, 25, y);
        y += 7;
        doc.text(`• Số bài tập khác nhau: ${exercises.length}`, 25, y);
        y += 15;
    }
    
    if (options.workouts) {
        doc.setFontSize(16);
        doc.setTextColor(54, 162, 235);
        doc.text('🏋️ Chi tiết buổi tập', 20, y);
        y += 10;
        
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        
        data.workouts.slice(0, 20).forEach((w, index) => {
            if (y > 250) {
                doc.addPage();
                y = 20;
            }
            const volume = w.sets?.reduce((sum, s) => sum + (s.weight||0)*(s.reps||0), 0) || 0;
            const line = `${index + 1}. ${w.date}: ${w.muscleGroup} - ${w.exercise}`;
            const subLine = `   ${w.sets?.length || 0} set, ${volume} volume`;
            
            doc.text(line, 20, y);
            y += 5;
            doc.setTextColor(100, 100, 100);
            doc.text(subLine, 20, y);
            y += 8;
            doc.setTextColor(0, 0, 0);
        });
        
        if (data.workouts.length > 20) {
            doc.setTextColor(100, 100, 100);
            doc.text(`... và ${data.workouts.length - 20} buổi tập khác`, 20, y);
            y += 10;
        }
        y += 10;
    }
    
    if (options.inbody && data.inbody.length > 0) {
        doc.setFontSize(16);
        doc.setTextColor(54, 162, 235);
        doc.text('📈 Kết quả InBody', 20, y);
        y += 10;
        
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        
        data.inbody.slice(0, 10).forEach((i, index) => {
            if (y > 250) {
                doc.addPage();
                y = 20;
            }
            const shortText = i.text.length > 60 ? i.text.substring(0, 60) + '...' : i.text;
            doc.text(`${index + 1}. ${i.timestamp}`, 20, y);
            y += 5;
            doc.setTextColor(100, 100, 100);
            doc.text(`   ${shortText}`, 20, y);
            y += 8;
            doc.setTextColor(0, 0, 0);
        });
        
        if (data.inbody.length > 10) {
            doc.setTextColor(100, 100, 100);
            doc.text(`... và ${data.inbody.length - 10} kết quả khác`, 20, y);
        }
    }
    
    // Footer
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text(`Trang ${i}/${pageCount}`, 20, 290);
        doc.text('AppGym - Theo dõi tập luyện thông minh', 120, 290);
    }
    
    doc.save('appgym-report.pdf');
}

// Lấy tùy chọn xuất
function getExportOptions() {
    return {
        workouts: document.getElementById('export-workouts')?.checked || false,
        inbody: document.getElementById('export-inbody')?.checked || false,
        profile: document.getElementById('export-profile')?.checked || false,
        charts: document.getElementById('export-charts')?.checked || false,
        allTime: document.getElementById('export-all-time')?.checked || false
    };
}

// Thu thập dữ liệu để xuất
async function collectExportData(options) {
    const data = {};
    
    if (options.workouts) {
        let workouts = await getAllWorkouts();
        if (!options.allTime) {
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            workouts = workouts.filter(w => new Date(w.date) >= thirtyDaysAgo);
        }
        data.workouts = workouts;
    }
    
    if (options.inbody) {
        let inbody = await getAllInbodyAnalysis();
        if (!options.allTime) {
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            inbody = inbody.filter(i => new Date(i.timestamp) >= thirtyDaysAgo);
        }
        data.inbody = inbody;
    }
    
    if (options.profile) {
        data.profile = getUserProfile();
    }
    
    return data;
}

// Hàm download file
function downloadFile(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    const feedback = document.getElementById('export-feedback');
    if (feedback) {
        feedback.textContent = `Đã xuất ${filename} thành công!`;
        feedback.style.color = 'green';
        setTimeout(() => { feedback.textContent = ''; }, 3000);
    }
}

// Sự kiện cho các nút xuất
window.addEventListener('DOMContentLoaded', () => {
    const csvBtn = document.getElementById('export-csv-btn');
    const jsonBtn = document.getElementById('export-json-btn');
    const pdfBtn = document.getElementById('export-pdf-btn');
    
    if (csvBtn) csvBtn.onclick = exportToCSV;
    if (jsonBtn) jsonBtn.onclick = exportToJSON;
    if (pdfBtn) pdfBtn.onclick = exportToPDF;
    
    // Vẽ biểu đồ nâng cao
    renderMuscleBalanceChart();
    renderVolumeTimeChart();
    renderTrendAnalysisChart();
});

// Tự động cập nhật biểu đồ khi có dữ liệu mới
const oldSaveWorkoutForCharts = window.saveWorkout;
window.saveWorkout = async function(workout) {
    await oldSaveWorkoutForCharts(workout);
    renderMuscleBalanceChart();
    renderVolumeTimeChart();
    renderTrendAnalysisChart();
};

const oldSaveInbodyForCharts = window.saveInbodyAnalysis;
window.saveInbodyAnalysis = async function(text) {
    await oldSaveInbodyForCharts(text);
    renderTrendAnalysisChart();
};

// --- KẾT THÚC: Biểu đồ nâng cao & Export dữ liệu ---

// Hàm hỗ trợ export
function showExportLoading(message) {
    const feedback = document.getElementById('export-feedback');
    if (feedback) {
        feedback.textContent = message;
        feedback.style.color = '#ff9800';
    }
}

function hideExportLoading() {
    const feedback = document.getElementById('export-feedback');
    if (feedback) {
        feedback.textContent = '';
    }
}

function showExportError(message) {
    const feedback = document.getElementById('export-feedback');
    if (feedback) {
        feedback.textContent = message;
        feedback.style.color = '#f44336';
        setTimeout(() => { feedback.textContent = ''; }, 5000);
    }
}

// Cải thiện các hàm export với error handling
const originalExportCSV = window.exportToCSV;
window.exportToCSV = async function() {
    try {
        showExportLoading('Đang chuẩn bị dữ liệu CSV...');
        await originalExportCSV();
        hideExportLoading();
        const feedback = document.getElementById('export-feedback');
        if (feedback) {
            feedback.textContent = 'Đã xuất CSV thành công!';
            feedback.style.color = 'green';
            setTimeout(() => { feedback.textContent = ''; }, 3000);
        }
    } catch (error) {
        hideExportLoading();
        showExportError('Lỗi khi xuất CSV: ' + error.message);
    }
};

const originalExportJSON = window.exportToJSON;
window.exportToJSON = async function() {
    try {
        showExportLoading('Đang chuẩn bị dữ liệu JSON...');
        await originalExportJSON();
        hideExportLoading();
        const feedback = document.getElementById('export-feedback');
        if (feedback) {
            feedback.textContent = 'Đã xuất JSON thành công!';
            feedback.style.color = 'green';
            setTimeout(() => { feedback.textContent = ''; }, 3000);
        }
    } catch (error) {
        hideExportLoading();
        showExportError('Lỗi khi xuất JSON: ' + error.message);
    }
};

const originalExportPDF = window.exportToPDF;
window.exportToPDF = async function() {
    try {
        showExportLoading('Đang tạo báo cáo PDF...');
        await originalExportPDF();
        hideExportLoading();
        const feedback = document.getElementById('export-feedback');
        if (feedback) {
            feedback.textContent = 'Đã xuất PDF thành công!';
            feedback.style.color = 'green';
            setTimeout(() => { feedback.textContent = ''; }, 3000);
        }
    } catch (error) {
        hideExportLoading();
        showExportError('Lỗi khi xuất PDF: ' + error.message);
    }
};

// --- BẮT ĐẦU: Dark mode & Social features ---

// Dark mode toggle
window.addEventListener('DOMContentLoaded', () => {
    const toggle = document.getElementById('dark-mode-toggle');
    if (!toggle) return;
    
    // Load saved theme
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateToggleIcon(savedTheme);
    
    toggle.onclick = () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        updateToggleIcon(newTheme);
    };
    
    function updateToggleIcon(theme) {
        toggle.textContent = theme === 'dark' ? '☀️' : '🌙';
    }
});

// Tính toán thành tích
async function calculateAchievements() {
    const workouts = await getAllWorkouts();
    const inbodyArr = await getAllInbodyAnalysis();
    
    // Số buổi tập
    const totalWorkouts = workouts.length;
    
    // Tính streak (ngày tập liên tiếp)
    let currentStreak = 0;
    let maxStreak = 0;
    if (workouts.length > 0) {
        const dates = workouts.map(w => w.date).filter(Boolean).sort();
        let streak = 1;
        for (let i = 1; i < dates.length; i++) {
            const prev = new Date(dates[i-1]);
            const curr = new Date(dates[i]);
            const diffDays = Math.round((curr - prev) / (1000 * 60 * 60 * 24));
            if (diffDays === 1) {
                streak++;
            } else {
                maxStreak = Math.max(maxStreak, streak);
                streak = 1;
            }
        }
        maxStreak = Math.max(maxStreak, streak);
        currentStreak = streak;
    }
    
    // Tính kg giảm (dựa trên InBody)
    let weightLoss = 0;
    if (inbodyArr.length > 1) {
        const first = inbodyArr[inbodyArr.length - 1];
        const last = inbodyArr[0];
        const firstWeight = parseFloat((first.text.match(/Cân nặng\s*:?\s*([\d.,]+)/i) || [])[1]);
        const lastWeight = parseFloat((last.text.match(/Cân nặng\s*:?\s*([\d.,]+)/i) || [])[1]);
        if (firstWeight && lastWeight) {
            weightLoss = Math.abs(lastWeight - firstWeight);
        }
    }
    
    return { totalWorkouts, currentStreak, maxStreak, weightLoss };
}

// Cập nhật hiển thị thành tích
async function updateAchievementDisplay() {
    const stats = await calculateAchievements();
    const statsContainer = document.getElementById('achievement-stats');
    if (!statsContainer) return;
    
    statsContainer.innerHTML = `
        <div style="text-align:center;">
          <div style="font-size:2rem;font-weight:bold;color:var(--accent);">${stats.totalWorkouts}</div>
          <div style="font-size:0.9rem;color:var(--text-secondary);">Buổi tập</div>
        </div>
        <div style="text-align:center;">
          <div style="font-size:2rem;font-weight:bold;color:var(--accent);">${stats.currentStreak}</div>
          <div style="font-size:0.9rem;color:var(--text-secondary);">Ngày streak</div>
        </div>
        <div style="text-align:center;">
          <div style="font-size:2rem;font-weight:bold;color:var(--accent);">${stats.weightLoss.toFixed(1)}</div>
          <div style="font-size:0.9rem;color:var(--text-secondary);">Kg thay đổi</div>
        </div>
    `;
}

// Social sharing functions
window.shareToFacebook = function() {
    const url = encodeURIComponent(window.location.href);
    const text = encodeURIComponent('Tôi đã đạt được thành tích tập luyện tuyệt vời với AppGym! 🏋️');
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}&quote=${text}`, '_blank');
};

window.shareToTwitter = function() {
    const url = encodeURIComponent(window.location.href);
    const text = encodeURIComponent('Tôi đã đạt được thành tích tập luyện tuyệt vời với AppGym! 🏋️');
    window.open(`https://twitter.com/intent/tweet?url=${url}&text=${text}`, '_blank');
};

window.shareToWhatsApp = function() {
    const url = encodeURIComponent(window.location.href);
    const text = encodeURIComponent('Tôi đã đạt được thành tích tập luyện tuyệt vời với AppGym! 🏋️');
    window.open(`https://wa.me/?text=${text}%20${url}`, '_blank');
};

window.copyShareLink = function() {
    navigator.clipboard.writeText(window.location.href).then(() => {
        alert('Đã copy link chia sẻ!');
    });
};

// Generate share card
window.addEventListener('DOMContentLoaded', () => {
    const generateBtn = document.getElementById('generate-share-card');
    const shareButtons = document.getElementById('share-buttons');
    
    if (generateBtn) {
        generateBtn.onclick = async () => {
            await updateAchievementDisplay();
            shareButtons.style.display = 'block';
            generateBtn.textContent = 'Cập nhật thành tích';
        };
    }
    
    // Tự động cập nhật thành tích khi có dữ liệu mới
    updateAchievementDisplay();
});

// Tự động cập nhật thành tích khi có workout mới
const oldSaveWorkout = window.saveWorkout;
window.saveWorkout = async function(workout) {
    await oldSaveWorkout(workout);
    updateAchievementDisplay();
};

// --- KẾT THÚC: Dark mode & Social features ---

// Đảm bảo sự kiện cho nút thêm set ở cả main form và modal edit
window.addEventListener('DOMContentLoaded', () => {
    const addSetBtn = document.getElementById('add-set');
    if (addSetBtn) {
        addSetBtn.onclick = () => {
            const exerciseType = document.getElementById('exercise-type')?.value || 'weight';
            addSet('sets-container', exerciseType);
        };
    }
    const editAddSetBtn = document.getElementById('edit-add-set');
    if (editAddSetBtn) {
        editAddSetBtn.onclick = () => {
            const exerciseType = document.getElementById('edit-exercise-type')?.value || 'weight';
            addSet('edit-sets-container', exerciseType);
        };
    }
    // Đảm bảo update số thứ tự set khi thay đổi loại bài tập
    const exerciseTypeSelect = document.getElementById('exercise-type');
    if (exerciseTypeSelect) {
        exerciseTypeSelect.addEventListener('change', (e) => {
            updateSetForm(e.target.value, 'sets-container');
        });
    }
    const editExerciseTypeSelect = document.getElementById('edit-exercise-type');
    if (editExerciseTypeSelect) {
        editExerciseTypeSelect.addEventListener('change', (e) => {
            updateSetForm(e.target.value, 'edit-sets-container');
        });
    }
    // Đảm bảo nút hủy bỏ và nút đóng modal edit luôn hoạt động
    const cancelEditBtn = document.getElementById('cancel-edit');
    if (cancelEditBtn) {
        cancelEditBtn.onclick = closeEditModal;
    }
    const editModalCloseBtn = document.querySelector('#edit-modal .close');
    if (editModalCloseBtn) {
        editModalCloseBtn.onclick = closeEditModal;
    }
    function closeEditModal() {
        const editModal = document.getElementById('edit-modal');
        if (editModal) editModal.style.display = 'none';
        // Reset form
        const editForm = document.getElementById('edit-form');
        if (editForm) editForm.reset();
        // Hiện lại giao diện chính nếu bị ẩn
        const appContent = document.getElementById('app-content');
        if (appContent) appContent.classList.remove('hidden');
    }
}); 