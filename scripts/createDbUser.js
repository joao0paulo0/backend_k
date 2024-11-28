const { MongoClient } = require('mongodb');

async function createDbUser() {
  const adminUri = 'mongodb://localhost:27017/admin';
  const client = new MongoClient(adminUri);

  try {
    await client.connect();
    const db = client.db('karate_school');

    await db.addUser(
      process.env.MONGODB_USER,
      process.env.MONGODB_PASS,
      {
        roles: [
          { role: 'readWrite', db: 'karate_school' }
        ]
      }
    );

    console.log('Database user created successfully');
  } catch (error) {
    console.error('Error creating database user:', error);
  } finally {
    await client.close();
  }
}

// Run this script once to set up the database user
if (require.main === module) {
  createDbUser().catch(console.error);
} 