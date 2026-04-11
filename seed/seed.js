import admin from 'firebase-admin';

// Admin SDK picks up emulator hosts from env (set in docker-compose.dev.yml)
admin.initializeApp({ projectId: 'umami-watch' });

const auth = admin.auth();
const db   = admin.firestore();

const TEST_USER = {
  email:       'test@dev.local',
  password:    'password123',
  displayName: 'Dev Tester',
};

async function seed() {
  let uid;

  try {
    const user = await auth.createUser(TEST_USER);
    uid = user.uid;
    console.log(`✓ Created user: ${user.email}  (uid: ${uid})`);
  } catch (err) {
    if (err.code !== 'auth/email-already-exists') throw err;
    const existing = await auth.getUserByEmail(TEST_USER.email);
    uid = existing.uid;
    console.log(`✓ User already exists: ${TEST_USER.email}  (uid: ${uid})`);
  }

  await db.collection('users').doc(uid).set({
    email:       TEST_USER.email,
    displayName: TEST_USER.displayName,
    photoURL:    null,
    createdAt:   admin.firestore.FieldValue.serverTimestamp(),
    lastSeen:    admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  console.log('✓ Firestore user doc written');
  console.log('');
  console.log('Test account ready:');
  console.log('  Email   :', TEST_USER.email);
  console.log('  Password:', TEST_USER.password);
}

seed()
  .then(() => process.exit(0))
  .catch(err => { console.error('Seed failed:', err.message); process.exit(1); });
