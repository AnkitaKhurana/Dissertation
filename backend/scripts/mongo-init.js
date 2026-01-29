// Mongo init script for local dev containers
// Creates db and minimal indexes; used by docker-compose init

db = db.getSiblingDB(process.env.MONGO_INITDB_DATABASE || "prsentinel");

// Collections
db.createCollection("jobs");
db.createCollection("findings");
db.createCollection("users");

db.jobs.createIndex({ status: 1 });
db.jobs.createIndex({ created_at: 1 });
db.jobs.createIndex({ status: 1, last_updated: 1 });
db.jobs.createIndex({ expires_at: 1 }, { expireAfterSeconds: 0, name: "ttl_expires_at" });

db.findings.createIndex({ job_id: 1 });
db.findings.createIndex({ file_path: 1 });

db.users.createIndex({ email: 1 }, { unique: true });
