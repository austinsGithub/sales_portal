import 'dotenv/config'; // Load environment variables 
import './config/envLoader.mjs'; // this MUST be the first import

console.log('After envLoader - Environment variables:');
console.log('DB_HOST:', process.env.DB_HOST);
console.log('DB_USER:', process.env.DB_USER);
console.log('DB_NAME:', process.env.DB_NAME);
console.log('DB_PASS:', process.env.DB_PASS ? '***' : 'NOT SET');

import pool from './db/pool.mjs';

// Test database connection
pool.getConnection()
  .then(connection => {
    console.log('Database connection successful');
    connection.release();
    process.exit(0);
  })
  .catch(err => {
    console.error('Database connection failed:', err);
    process.exit(1);
  }); 