/**
 * CITYMO ERP – Database connection (SQLite via better-sqlite3)
 * Swap this file for a pg/mysql2 pool if migrating to PostgreSQL/MySQL.
 */
const Database = require('better-sqlite3');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'citymo.sqlite');

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

module.exports = db;
