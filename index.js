require('dotenv').config();
const express = require('express')
const app = express()
const cors = require('cors')
const { MongoClient, ServerApiVersion } = require('mongodb');
const port = process.env.PORT || 3000

app.use(cors());
app.use(express.json());



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.zffyl01.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    await client.connect();

    const db = client.db('codeClash');
    const problemCollection = db.collection('problems');
    const contestCollection = db.collection('contests');
    const usersCollection = db.collection('users');


    // api for adding a new user
app.post('/api/users', async (req, res) => {
  try {
    const { userName, userEmail, userImage, userRole } = req.body;

    // basic validation
    if (!userName || !userEmail || !userImage || !userRole) {
      return res.status(400).json({ message: 'All fields are required: userName, userEmail, userImage, userRole' });
    }

    // check if user already exists by email
    const existingUser = await usersCollection.findOne({ userEmail });
    if (existingUser) {
      return res.status(200).json({
        message: 'User already exists',
        user: existingUser
      });
    }

    // create new user object
    const newUser = {
      userName,
      userEmail,
      userImage,
      userRole,
      createdAt: new Date()
    };

    // insert new user
    const result = await usersCollection.insertOne(newUser);

    res.status(201).json({
      message: 'User added successfully',
      userId: result.insertedId,
      user: newUser
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server Error' });
  }
});



    // api for sorting problem data with difficulty and category
    app.get('/api/problems', async (req, res) => {
      try {
        const { difficulty, category } = req.query;

        const query = {};
        if (difficulty) query.difficulty = difficulty;
        if (category) query.category = category;

        const problems = await problemCollection
          .find(query)
          .sort({ createdAt: -1 })
          .toArray();

        res.json(problems);
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error' });
      }
    });


    // api for getting contests with problems
    app.get('/api/contests', async (req, res) => {
      try {
        const contests = await contestCollection.find().sort({ startTime: 1 }).toArray();

        const contestsWithProblems = await Promise.all(
          contests.map(async (contest) => {
            const problems = await problemCollection
              .find({ _id: { $in: contest.problems } })
              .toArray();

            return {
              ...contest,
              problems,
            };
          })
        );

        res.status(200).json(contestsWithProblems);
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server Error' });
      }
    });



    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
  res.send('Wellcome to my codeClash')
})

app.listen(port, () => {
  console.log(`Wellcome to my codeClash app on port ${port}`)
})
