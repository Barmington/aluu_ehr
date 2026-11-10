const jwt = require('jsonwebtoken');

const JWT_SECRET = () => process.env.JWT_SECRET || 'dev-only-secret-change-me';

/** Verifies the Bearer token and attaches req.user = { id, username, role, fullName } */
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authentication required' });

  try {
    const payload = jwt.verify(token, JWT_SECRET());
    req.user = {
      id: payload.sub,
      username: payload.username,
      role: payload.role,
      fullName: payload.fullName,
    };
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/** Role-based access control */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res
        .status(403)
        .json({ error: 'You do not have permission for this action' });
    }
    next();
  };
}

function signToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      username: user.username,
      role: user.role,
      fullName: user.full_name,
    },
    JWT_SECRET(),
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' },
  );
}

module.exports = { requireAuth, requireRole, signToken };
