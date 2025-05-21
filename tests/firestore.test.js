const { assertFails, assertSucceeds, initializeTestEnvironment, RulesTestEnvironment } = require('@firebase/rules-unit-testing');
const { readFileSync } = require('fs');

let testEnv;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "vetai-project",
    firestore: {
      rules: readFileSync("../firestore.rules", "utf8"),
      host: "localhost",
      port: 8080
    },
  });
});

after(async () => {
  await testEnv.cleanup();
});

describe('VetAI Firestore Security Rules', () => {
  
  it('unauthenticated users cannot read user data', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(db.collection('users').doc('user1').get());
  });

  it('users can read their own data', async () => {
    const userId = 'test_user';
    const db = testEnv.authenticatedContext(userId).firestore();
    await assertSucceeds(db.collection('users').doc(userId).get());
  });

  it('users cannot read other users data', async () => {
    const userId = 'test_user';
    const otherUserId = 'other_user';
    const db = testEnv.authenticatedContext(userId).firestore();
    await assertFails(db.collection('users').doc(otherUserId).get());
  });

  it('users can write to their own conversations', async () => {
    const userId = 'test_user';
    const db = testEnv.authenticatedContext(userId).firestore();
    await assertSucceeds(
      db.collection('users').doc(userId)
        .collection('conversations').doc('conv1')
        .set({ message: 'test' })
    );
  });

  it('users cannot write to other users conversations', async () => {
    const userId = 'test_user';
    const otherUserId = 'other_user';
    const db = testEnv.authenticatedContext(userId).firestore();
    await assertFails(
      db.collection('users').doc(otherUserId)
        .collection('conversations').doc('conv1')
        .set({ message: 'test' })
    );
  });

  it('users can write to their own profile', async () => {
    const userId = 'test_user';
    const db = testEnv.authenticatedContext(userId).firestore();
    await assertSucceeds(
      db.collection('users').doc(userId)
        .collection('profile').doc('info')
        .set({ name: 'Test User' })
    );
  });
}); 