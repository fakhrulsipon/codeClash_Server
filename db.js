const { MongoClient, ServerApiVersion } = require("mongodb");

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.zffyl01.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

let db;

async function connectDB() {
  if (!db) {
    await client.connect();
    db = client.db("codeClash");
    console.log("Connected to MongoDB");
  }
  return db;
}

// miskaran's contribution start
//  this helper so routes can access db directly
function getDB() {
  if (!db) throw new Error("❌ Database not connected. Call connectDB() first.");
  return db;
}
module.exports = { connectDB,getDB };
// miskaran's contribution end
