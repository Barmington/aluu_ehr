require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const authRoutes = require('./routes/auth');
const patientRoutes = require('./routes/patients');
const triageRoutes = require('./routes/triage');
const auditRoutes = require('./routes/audit');
const clinicalRoutes = require('./routes/clinical');
const registerRoutes = require('./routes/register');
const userRoutes = require('./routes/users');

const app = express();
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map(origin => origin.trim());

app.use(
  cors({
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
);

app.use(helmet());
app.use(express.json({ limit: '100kb' }));
if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Aluu EHR API is running',
  });
});

app.use('/api/auth', registerRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/triage', triageRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/clinical', clinicalRoutes);
app.use('/api/users', userRoutes);

app.use('/api', (req, res) =>
  res.status(404).json({ error: 'Endpoint not found' }),
);

// Central error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Malformed JSON body' });
  }
  if (err.code === '23505') {
    return res.status(409).json({
      error:
        'Conflict: record already exists or patient already has an active visit',
    });
  }
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({
    error: status >= 500 ? 'Internal server error' : err.message,
    ...(err.extra || {}),
  });
});

module.exports = app;
