// Gợi ý bài tập tiếp theo dựa trên lịch sử và mục tiêu
function suggestNextExercises(workouts, goals = {}) {
  // Lấy các nhóm cơ đã tập gần đây
  const recentMuscles = workouts.slice(-5).map(w => w.muscleGroup);
  // Đếm số lần tập mỗi nhóm cơ
  const muscleCount = {};
  workouts.forEach(w => {
    if (w.muscleGroup) muscleCount[w.muscleGroup] = (muscleCount[w.muscleGroup] || 0) + 1;
  });
  // Ưu tiên nhóm cơ ít tập, hoặc theo goals
  let allMuscles = ['Ngực','Lưng','Vai','Chân','Tay','Bụng'];
  if(goals.targetMuscles) allMuscles = goals.targetMuscles;
  const sorted = allMuscles.sort((a,b) => (muscleCount[a]||0)-(muscleCount[b]||0));
  // Gợi ý bài tập chưa tập gần đây
  const recentExercises = new Set(workouts.slice(-5).map(w => w.exercise));
  const suggestions = [];
  sorted.forEach(muscle => {
    // Lấy bài tập mẫu cho nhóm cơ này
    const samples = [
      { muscle: 'Ngực', exercises: ['Bench Press','Push-up','Chest Fly'] },
      { muscle: 'Lưng', exercises: ['Pull-up','Row','Lat Pulldown'] },
      { muscle: 'Vai', exercises: ['Shoulder Press','Lateral Raise'] },
      { muscle: 'Chân', exercises: ['Squat','Leg Press','Lunge'] },
      { muscle: 'Tay', exercises: ['Bicep Curl','Tricep Extension'] },
      { muscle: 'Bụng', exercises: ['Crunch','Plank','Leg Raise'] }
    ];
    const exs = (samples.find(s=>s.muscle===muscle)||{}).exercises||[];
    exs.forEach(ex => {
      if (!recentExercises.has(ex)) suggestions.push({ muscle, exercise: ex });
    });
  });
  // Ưu tiên bài tập đa dạng nhóm cơ, chưa tập gần đây
  return suggestions.slice(0,5);
} 