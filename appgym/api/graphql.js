import { ApolloServer } from 'apollo-server-micro';
import { gql } from 'apollo-server-micro';
import admin from 'firebase-admin';
import { getAuth } from 'firebase-admin/auth';

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}
const db = admin.firestore();

// Middleware xác thực
async function getUserIdFromAuth(req) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) return null;
  const idToken = authHeader.replace('Bearer ', '');
  try {
    const decoded = await getAuth().verifyIdToken(idToken);
    return decoded.uid;
  } catch {
    return null;
  }
}

const typeDefs = gql`
  type Workout {
    id: ID!
    date: String
    muscleGroup: String
    exercise: String
    equipment: String
    notes: String
    sets: [Set]
    exerciseType: String
  }
  type Set {
    weight: Float
    reps: Int
  }
  type PersonalRecord {
    exercise: String
    records: JSON
  }
  scalar JSON
  type Stats {
    totalWorkouts: Int
    totalVolume: Float
  }
  type TopExercise {
    exercise: String
    count: Int
  }
  type VolumeByMuscle {
    muscleGroup: String
    volume: Float
  }
  type Query {
    workouts: [Workout]
    stats: Stats
    personalRecords: [PersonalRecord]
    topExercises: [TopExercise]
    volumeByMuscleGroup: [VolumeByMuscle]
  }
`;

const resolvers = {
  JSON: require('graphql-type-json'),
  Query: {
    async workouts(_, __, { userId }) {
      const snap = await db.collection('users').doc(userId).collection('workouts').get();
      return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },
    async stats(_, __, { userId }) {
      const snap = await db.collection('users').doc(userId).collection('workouts').get();
      let totalVolume = 0;
      snap.docs.forEach(doc => {
        const w = doc.data();
        if (Array.isArray(w.sets)) {
          w.sets.forEach(s => {
            totalVolume += (s.weight || 0) * (s.reps || 0);
          });
        }
      });
      return { totalWorkouts: snap.size, totalVolume };
    },
    async personalRecords(_, __, { userId }) {
      const snap = await db.collection('users').doc(userId).collection('personal_records').get();
      return snap.docs.map(doc => ({ exercise: doc.id, ...doc.data() }));
    },
    async topExercises(_, __, { userId }) {
      const snap = await db.collection('users').doc(userId).collection('workouts').get();
      const count = {};
      snap.docs.forEach(doc => {
        const w = doc.data();
        if (w.exercise) count[w.exercise] = (count[w.exercise] || 0) + 1;
      });
      return Object.entries(count).map(([exercise, c]) => ({ exercise, count: c })).sort((a,b)=>b.count-a.count).slice(0,5);
    },
    async volumeByMuscleGroup(_, __, { userId }) {
      const snap = await db.collection('users').doc(userId).collection('workouts').get();
      const group = {};
      snap.docs.forEach(doc => {
        const w = doc.data();
        if (w.muscleGroup && Array.isArray(w.sets)) {
          const vol = w.sets.reduce((sum, s) => sum + (s.weight || 0) * (s.reps || 0), 0);
          group[w.muscleGroup] = (group[w.muscleGroup] || 0) + vol;
        }
      });
      return Object.entries(group).map(([muscleGroup, volume]) => ({ muscleGroup, volume }));
    }
  }
};

const apolloServer = new ApolloServer({
  typeDefs,
  resolvers,
  context: async ({ req }) => {
    const userId = await getUserIdFromAuth(req);
    if (!userId) throw new Error('Unauthorized');
    return { userId };
  }
});
const startServer = apolloServer.start();

export default async function handler(req, res) {
  await startServer;
  await apolloServer.createHandler({
    path: '/api/graphql',
  })(req, res);
}

export const config = {
  api: {
    bodyParser: false,
  },
}; 