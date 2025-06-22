// =================================================================================
// AI Recommendations Engine - AppGym Pro
// =================================================================================

class AIRecommendations {
    constructor() {
        this.recommendations = [];
        this.userProfile = {};
        this.exerciseDatabase = {
            'Bench Press': {
                category: 'push',
                muscleGroup: 'Ngực',
                difficulty: 'intermediate',
                progressionRate: 2.5, // kg per week
                optimalReps: [6, 8, 10, 12],
                restTime: 180 // seconds
            },
            'Squat': {
                category: 'legs',
                muscleGroup: 'Chân',
                difficulty: 'intermediate',
                progressionRate: 5,
                optimalReps: [5, 8, 10],
                restTime: 240
            },
            'Deadlift': {
                category: 'pull',
                muscleGroup: 'Lưng',
                difficulty: 'advanced',
                progressionRate: 5,
                optimalReps: [3, 5, 8],
                restTime: 300
            },
            'Pull-up': {
                category: 'pull',
                muscleGroup: 'Lưng',
                difficulty: 'intermediate',
                progressionRate: 1, // reps per week
                optimalReps: [5, 8, 10, 12],
                restTime: 180
            },
            'Push-up': {
                category: 'push',
                muscleGroup: 'Ngực',
                difficulty: 'beginner',
                progressionRate: 2, // reps per week
                optimalReps: [10, 15, 20, 25],
                restTime: 120
            }
        };
    }

    // Phân tích tiến độ và đưa ra gợi ý
    analyzeProgress(workouts) {
        this.recommendations = [];
        
        if (!workouts || workouts.length === 0) {
            return this.getInitialRecommendations();
        }

        // Phân tích từng bài tập
        const exerciseAnalysis = this.analyzeExercises(workouts);
        
        // Tạo gợi ý dựa trên phân tích
        this.generateRecommendations(exerciseAnalysis);
        
        // Phát hiện plateau
        this.detectPlateaus(exerciseAnalysis);
        
        // Gợi ý bài tập mới
        this.suggestNewExercises(workouts);
        
        // Tối ưu hóa workout plan
        this.optimizeWorkoutPlan(workouts);

        return this.recommendations;
    }

    // Phân tích chi tiết từng bài tập
    analyzeExercises(workouts) {
        const analysis = {};
        
        workouts.forEach(workout => {
            const exercise = workout.exercise;
            if (!analysis[exercise]) {
                analysis[exercise] = {
                    workouts: [],
                    maxWeight: 0,
                    maxReps: 0,
                    totalVolume: 0,
                    frequency: 0,
                    lastWorkout: null,
                    progression: []
                };
            }
            
            const sets = workout.sets || [];
            const exerciseType = workout.exerciseType || 'weight';
            
            let workoutVolume = 0;
            let maxWeight = 0;
            let maxReps = 0;
            
            sets.forEach(set => {
                if (exerciseType === 'bodyweight') {
                    workoutVolume += set.reps || 0;
                    maxReps = Math.max(maxReps, set.reps || 0);
                } else {
                    const weight = set.weight || 0;
                    const reps = set.reps || 0;
                    workoutVolume += weight * reps;
                    maxWeight = Math.max(maxWeight, weight);
                    maxReps = Math.max(maxReps, reps);
                }
            });
            
            analysis[exercise].workouts.push({
                date: workout.date,
                volume: workoutVolume,
                maxWeight: maxWeight,
                maxReps: maxReps,
                sets: sets.length
            });
            
            analysis[exercise].maxWeight = Math.max(analysis[exercise].maxWeight, maxWeight);
            analysis[exercise].maxReps = Math.max(analysis[exercise].maxReps, maxReps);
            analysis[exercise].totalVolume += workoutVolume;
            analysis[exercise].frequency++;
            
            if (!analysis[exercise].lastWorkout || new Date(workout.date) > new Date(analysis[exercise].lastWorkout)) {
                analysis[exercise].lastWorkout = workout.date;
            }
        });
        
        return analysis;
    }

    // Tạo gợi ý dựa trên phân tích
    generateRecommendations(analysis) {
        Object.keys(analysis).forEach(exercise => {
            const data = analysis[exercise];
            const exerciseInfo = this.exerciseDatabase[exercise];
            
            if (!exerciseInfo) return;
            
            // Gợi ý tăng mức tạ
            if (data.workouts.length >= 3) {
                const recentWorkouts = data.workouts.slice(-3);
                const avgVolume = recentWorkouts.reduce((sum, w) => sum + w.volume, 0) / recentWorkouts.length;
                
                if (avgVolume > data.totalVolume / data.workouts.length * 1.1) {
                    const suggestedIncrease = exerciseInfo.progressionRate;
                    this.recommendations.push({
                        type: 'progressive_overload',
                        exercise: exercise,
                        title: '🎯 Gợi Ý Tăng Mức Tạ',
                        message: `Dựa trên tiến độ gần đây, bạn nên tăng mức tạ ${exercise} lên ${suggestedIncrease}kg. Tiến độ của bạn rất tốt!`,
                        priority: 'high',
                        action: `Tăng mức tạ lên ${suggestedIncrease}kg`
                    });
                }
            }
            
            // Gợi ý thay đổi rep scheme
            if (data.maxReps > exerciseInfo.optimalReps[exerciseInfo.optimalReps.length - 1]) {
                this.recommendations.push({
                    type: 'rep_scheme',
                    exercise: exercise,
                    title: '📊 Tối Ưu Rep Scheme',
                    message: `Bạn đang tập ${data.maxReps} reps cho ${exercise}. Khuyến nghị giảm reps và tăng mức tạ để tối ưu hypertrophy.`,
                    priority: 'medium',
                    action: 'Giảm reps, tăng mức tạ'
                });
            }
            
            // Gợi ý tần suất tập
            const daysSinceLastWorkout = this.calculateDaysSince(data.lastWorkout);
            if (daysSinceLastWorkout > 7) {
                this.recommendations.push({
                    type: 'frequency',
                    exercise: exercise,
                    title: '⏰ Tần Suất Tập Luyện',
                    message: `Đã ${daysSinceLastWorkout} ngày kể từ lần tập ${exercise} cuối. Nên tập lại sớm để duy trì tiến độ.`,
                    priority: 'high',
                    action: 'Tập lại trong 1-2 ngày tới'
                });
            }
        });
    }

    // Phát hiện plateau
    detectPlateaus(analysis) {
        Object.keys(analysis).forEach(exercise => {
            const data = analysis[exercise];
            
            if (data.workouts.length < 6) return;
            
            const recentWorkouts = data.workouts.slice(-6);
            const volumes = recentWorkouts.map(w => w.volume);
            
            // Kiểm tra xem có plateau không (không tăng trong 6 buổi tập)
            const avgVolume = volumes.reduce((sum, v) => sum + v, 0) / volumes.length;
            const variance = volumes.reduce((sum, v) => sum + Math.pow(v - avgVolume, 2), 0) / volumes.length;
            
            if (variance < avgVolume * 0.1) { // Ít biến động
                this.recommendations.push({
                    type: 'plateau',
                    exercise: exercise,
                    title: '🔄 Phát Hiện Plateau',
                    message: `${exercise} có vẻ đang plateau. Khuyến nghị thay đổi rep scheme hoặc thêm bài tập bổ trợ.`,
                    priority: 'high',
                    action: 'Thay đổi rep scheme hoặc thêm bài tập mới'
                });
            }
        });
    }

    // Gợi ý bài tập mới
    suggestNewExercises(workouts) {
        const currentExercises = [...new Set(workouts.map(w => w.exercise))];
        const muscleGroups = [...new Set(workouts.map(w => w.muscleGroup))];
        
        // Tìm bài tập bổ sung cho muscle groups hiện tại
        Object.keys(this.exerciseDatabase).forEach(exercise => {
            const exerciseInfo = this.exerciseDatabase[exercise];
            
            if (!currentExercises.includes(exercise) && muscleGroups.includes(exerciseInfo.muscleGroup)) {
                this.recommendations.push({
                    type: 'new_exercise',
                    exercise: exercise,
                    title: '🆕 Bài Tập Mới',
                    message: `Thử thêm ${exercise} vào routine để tăng cường ${exerciseInfo.muscleGroup}.`,
                    priority: 'medium',
                    action: `Thêm ${exercise} vào workout plan`
                });
            }
        });
    }

    // Tối ưu hóa workout plan
    optimizeWorkoutPlan(workouts) {
        const recentWorkouts = workouts.slice(-10);
        const workoutFrequency = this.calculateWorkoutFrequency(recentWorkouts);
        
        if (workoutFrequency < 3) {
            this.recommendations.push({
                type: 'workout_frequency',
                exercise: 'Tổng thể',
                title: '📅 Tần Suất Tập Luyện',
                message: `Bạn đang tập ${workoutFrequency} lần/tuần. Để tối ưu kết quả, nên tập 3-5 lần/tuần.`,
                priority: 'medium',
                action: 'Tăng tần suất tập luyện'
            });
        }
        
        // Kiểm tra rest time
        const restTimeAnalysis = this.analyzeRestTime(recentWorkouts);
        if (restTimeAnalysis.needsMoreRest) {
            this.recommendations.push({
                type: 'rest_time',
                exercise: 'Tổng thể',
                title: '😴 Thời Gian Nghỉ',
                message: 'Có vẻ bạn đang tập quá sát nhau. Nên nghỉ ít nhất 48h giữa các buổi tập cùng nhóm cơ.',
                priority: 'medium',
                action: 'Tăng thời gian nghỉ giữa các buổi tập'
            });
        }
    }

    // Gợi ý ban đầu cho người mới
    getInitialRecommendations() {
        return [
            {
                type: 'welcome',
                exercise: 'Tổng thể',
                title: '🎉 Chào Mừng Đến Với AppGym!',
                message: 'Bắt đầu ghi lại buổi tập đầu tiên để nhận gợi ý cá nhân hóa từ AI.',
                priority: 'high',
                action: 'Thêm buổi tập đầu tiên'
            },
            {
                type: 'starter_workout',
                exercise: 'Tổng thể',
                title: '🏋️ Workout Plan Khởi Đầu',
                message: 'Thử workout plan cơ bản: Push-up, Squat, Pull-up mỗi ngày để xây dựng thói quen.',
                priority: 'high',
                action: 'Bắt đầu với workout plan cơ bản'
            }
        ];
    }

    // Tính toán số ngày từ lần tập cuối
    calculateDaysSince(lastWorkoutDate) {
        if (!lastWorkoutDate) return 999;
        const lastDate = new Date(lastWorkoutDate);
        const today = new Date();
        const diffTime = Math.abs(today - lastDate);
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }

    // Tính tần suất tập luyện
    calculateWorkoutFrequency(recentWorkouts) {
        if (recentWorkouts.length === 0) return 0;
        
        const firstDate = new Date(recentWorkouts[0].date);
        const lastDate = new Date(recentWorkouts[recentWorkouts.length - 1].date);
        const daysDiff = Math.ceil((lastDate - firstDate) / (1000 * 60 * 60 * 24));
        
        if (daysDiff === 0) return recentWorkouts.length;
        
        const weeks = daysDiff / 7;
        return recentWorkouts.length / weeks;
    }

    // Phân tích thời gian nghỉ
    analyzeRestTime(recentWorkouts) {
        const muscleGroupWorkouts = {};
        
        recentWorkouts.forEach(workout => {
            const muscleGroup = workout.muscleGroup;
            if (!muscleGroupWorkouts[muscleGroup]) {
                muscleGroupWorkouts[muscleGroup] = [];
            }
            muscleGroupWorkouts[muscleGroup].push(new Date(workout.date));
        });
        
        let needsMoreRest = false;
        
        Object.keys(muscleGroupWorkouts).forEach(muscleGroup => {
            const dates = muscleGroupWorkouts[muscleGroup].sort((a, b) => a - b);
            
            for (let i = 1; i < dates.length; i++) {
                const daysDiff = Math.ceil((dates[i] - dates[i-1]) / (1000 * 60 * 60 * 24));
                if (daysDiff < 2) {
                    needsMoreRest = true;
                    break;
                }
            }
        });
        
        return { needsMoreRest };
    }

    // Dự đoán 1RM
    predict1RM(weight, reps) {
        // Sử dụng công thức Brzycki
        return weight * (36 / (37 - reps));
    }

    // Dự đoán tiến độ
    predictProgress(exercise, currentWeight, currentReps) {
        const exerciseInfo = this.exerciseDatabase[exercise];
        if (!exerciseInfo) return null;
        
        const current1RM = this.predict1RM(currentWeight, currentReps);
        const weeklyIncrease = exerciseInfo.progressionRate;
        
        return {
            nextWeek: current1RM + weeklyIncrease,
            nextMonth: current1RM + weeklyIncrease * 4,
            next3Months: current1RM + weeklyIncrease * 12
        };
    }

    // Lấy gợi ý theo ưu tiên
    getRecommendationsByPriority(priority = 'all') {
        if (priority === 'all') {
            return this.recommendations.sort((a, b) => {
                const priorityOrder = { 'high': 3, 'medium': 2, 'low': 1 };
                return priorityOrder[b.priority] - priorityOrder[a.priority];
            });
        }
        
        return this.recommendations.filter(rec => rec.priority === priority);
    }

    // Lấy gợi ý cho bài tập cụ thể
    getRecommendationsForExercise(exercise) {
        return this.recommendations.filter(rec => rec.exercise === exercise);
    }
}

// Export cho sử dụng trong app.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AIRecommendations;
} 