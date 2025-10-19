const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

module.exports = {
  PORT: process.env.PORT || 3000,
  CORS_ORIGIN: process.env.CORS_ORIGIN || true // allow any by default for development
};
