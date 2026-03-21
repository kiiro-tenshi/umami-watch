import admin from 'firebase-admin';

const requireAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  // Also accept token as query param for browser resource loads (e.g. <track> subtitle elements)
  const token = (authHeader?.startsWith('Bearer ') ? authHeader.split('Bearer ')[1] : null)
    || req.query.token;

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Unauthorized', details: error.message });
  }
};

export default requireAuth;
