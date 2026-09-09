import express from 'express';

const router = express.Router();
// No redirects or upstream requests: media belongs on the Worker only.
router.use((_req, res) => res.status(410).json({
  error: 'Backend media proxying has been removed. Use the configured HLS Worker.',
  code: 'MEDIA_PROXY_REMOVED',
}));
export default router;
