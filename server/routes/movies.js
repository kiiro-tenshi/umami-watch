import express from 'express';

const router = express.Router();

// HLS extraction was removed — movies/TV use client-side iframes instead.
router.get('/sources', (_req, res) => res.status(501).json({ error: 'Not implemented' }));

export default router;
