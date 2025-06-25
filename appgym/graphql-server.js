// GraphQL Gateway for AppGym
const { ApolloServer, gql } = require('apollo-server');
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json'); // Bạn cần tải file này từ Firebase Console

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

// GraphQL schema
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

const server = new ApolloServer({ typeDefs, resolvers });
server.listen().then(({ url }) => {
  console.log(`🚀 GraphQL Gateway ready at ${url}`);
}); 