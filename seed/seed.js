import admin from 'firebase-admin';

// Admin SDK picks up emulator hosts from env (set in docker-compose.dev.yml)
admin.initializeApp({ projectId: 'umami-watch' });

const auth = admin.auth();
const db   = admin.firestore();

const USERS = [
  { email: 'test@dev.local',   password: 'password123', displayName: 'Dev Tester' },
  { email: 'viewer@dev.local', password: 'password123', displayName: 'Viewer' },
];

async function seedUser(user) {
  let uid;
  try {
    const created = await auth.createUser(user);
    uid = created.uid;
    console.log(`✓ Created user: ${created.email}  (uid: ${uid})`);
  } catch (err) {
    if (err.code !== 'auth/email-already-exists') throw err;
    const existing = await auth.getUserByEmail(user.email);
    uid = existing.uid;
    console.log(`✓ User already exists: ${user.email}  (uid: ${uid})`);
  }

  await db.collection('users').doc(uid).set({
    email:       user.email,
    displayName: user.displayName,
    photoURL:    null,
    createdAt:   admin.firestore.FieldValue.serverTimestamp(),
    lastSeen:    admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  console.log(`✓ Firestore user doc written for ${user.displayName}`);
  return user;
}

async function seed() {
  const results = [];
  for (const user of USERS) results.push(await seedUser(user));

  console.log('');
  console.log('Test accounts ready:');
  results.forEach(u => {
    console.log(`  ${u.displayName.padEnd(12)} ${u.email}  /  ${u.password}`);
  });
}

seed()
  .then(() => process.exit(0))
  .catch(err => { console.error('Seed failed:', err.message); process.exit(1); });
