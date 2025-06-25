import { ApolloServer } from 'apollo-server-micro';
import { gql } from 'apollo-server-micro';
import admin from 'firebase-admin';

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}
const db = admin.firestore();

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
  type Query {
    workouts(userId: String!): [Workout]
    stats(userId: String!): Stats
    personalRecords(userId: String!): [PersonalRecord]
  }
`;

const resolvers = {
  JSON: require('graphql-type-json'),
  Query: {
    async workouts(_, { userId }) {
      const snap = await db.collection('users').doc(userId).collection('workouts').get();
      return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },
    async stats(_, { userId }) {
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
    async personalRecords(_, { userId }) {
      const snap = await db.collection('users').doc(userId).collection('personal_records').get();
      return snap.docs.map(doc => ({ exercise: doc.id, ...doc.data() }));
    }
  }
};

const apolloServer = new ApolloServer({ typeDefs, resolvers });
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