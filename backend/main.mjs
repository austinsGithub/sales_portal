// ---------- MUST BE FIRST ----------
import './config/envLoader.mjs';

// ---------- CORE DEPENDENCIES ----------
import express from 'express';
import cors from 'cors';
import pool from './db/pool.mjs';

// ---------- ROUTE IMPORTS ----------
import authRoutes from './routes/authRoutes.mjs';
import permissionRoutes from './routes/permissionRoutes.mjs';

// Procurement Module
import supplierRoutes from './routes/procurement/supplierRoutes.mjs';
import receivingRoutes from './routes/procurement/receivingRoutes.mjs';
import purchaseOrdersRoutes from './routes/procurement/purchaseOrdersRoutes.mjs';
import partCostsRoutes from './routes/procurement/partCostsRoutes.mjs';

// Inventory Module
import partsRoutes from './routes/inventory/partsRoutes.mjs';
import inventoryRoutes from './routes/inventory/inventoryRoutes.mjs';
import productsRoutes from './routes/inventory/productsRoutes.mjs';
import productCategoriesRoutes from './routes/inventory/productCategoriesRoutes.mjs';
import containerBlueprintsRoutes from './routes/inventory/containerBlueprintsRoutes.mjs';
import containerLoadoutsRoutes from './routes/inventory/containerLoadouts.mjs';
import locationsRoutes from './routes/inventory/LocationsRoutes.mjs';
import locationGroupsRoutes from './routes/inventory/LocationGroupsRoutes.mjs';
import transferOrdersRoutes from './routes/inventory/transferOrdersRoutes.mjs';
import binsRoutes from './routes/inventory/binsRoutes.mjs';
import adminRoutes from './routes/adminRoutes.mjs';

// ---------- SERVER CONFIG ----------
const server = express();
const port = process.env.PORT || 3000;

// ---------- MIDDLEWARE ----------
server.use(cors({
  origin: 'http://localhost:5173', //  front-end origin
  credentials: true
}));
server.use(express.json());

// ---------- ROOT ENDPOINT ----------
server.get('/', (req, res) => {
  res.send('Sales Portal API is running');
});

// ---------- API ROUTES ----------
server.use('/api/auth', authRoutes);
server.use('/api/permissions', permissionRoutes);

// Procurement APIs
server.use('/api/procurement/suppliers', supplierRoutes);
server.use('/api/procurement/receiving', receivingRoutes);
server.use('/api/procurement/purchase_orders', purchaseOrdersRoutes);
server.use('/api/procurement/part-costs', partCostsRoutes);

// Inventory APIs
server.use('/api/inventory/parts', partsRoutes);
server.use('/api/inventory/items', inventoryRoutes);
server.use('/api/inventory/products', productsRoutes);
server.use('/api/inventory/product-categories', productCategoriesRoutes);
server.use('/api/inventory/container_blueprints', containerBlueprintsRoutes);
server.use('/api/inventory/container_loadouts', containerLoadoutsRoutes);
server.use('/api/inventory/locations', locationsRoutes);
server.use('/api/inventory/location-groups', locationGroupsRoutes);
server.use('/api/inventory/transfer-orders', transferOrdersRoutes);
server.use('/api/inventory/bins', binsRoutes);

// Temporary alias to support legacy frontend paths
server.use('/api/transfer-orders', transferOrdersRoutes);

// Admin endpoints for user/role management
server.use('/api/admin', adminRoutes);

// ---------- ENVIRONMENT DEBUG (Optional for local dev) ----------
console.log('Environment variables:');
console.log('DB_HOST:', process.env.DB_HOST);
console.log('DB_USER:', process.env.DB_USER);
console.log('DB_NAME:', process.env.DB_NAME);
console.log('DB_PASS:', process.env.DB_PASS ? '***' : 'NOT SET');

// ---------- DATABASE CONNECTION TEST & SERVER START ----------
pool.getConnection()
  .then(connection => {
    console.log('Database connection successful');
    connection.release();

    server.listen(port, () => {
      console.log(`Server is running on port ${port}`);
    });
  })
  .catch(err => {
    console.error('Database connection failed:', err);
    process.exit(1);
  });

// ---------- SHUTDOWN / ERROR HANDLERS ----------
process.on('SIGINT', () => {
  console.log('Shutting down server...');
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});
