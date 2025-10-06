require('dotenv').config();
const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const cookieParser = require('cookie-parser');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const port = process.env.PORT || 3000;

// ---------------------------
// Middleware Setup
// ---------------------------
const corsOptions = {
  origin: ["http://localhost:5173", "https://codeclash.vercel.app"],
  credentials: true,
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());

// ---------------------------
// JWT Verification Middleware
// ---------------------------
const verifyToken = async (req, res, next) => {
  try {
    const token = req.cookies?.token;
    if (!token) {
      return res.status(401).json({ message: 'unauthorized access' });
    }

    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
      if (err) {
        return res.status(401).json({ message: 'unauthorized access' });
      }
      req.user = decoded;
      next();
    });
  } catch (error) {
    console.error("JWT Verification Error:", error);
    res.status(500).json({ message: "Token verification failed" });
  }
};

// ---------------------------
// MongoDB Setup
// ---------------------------
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.zffyl01.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// ---------------------------
// Main Function
// ---------------------------
async function run() {
  try {
    await client.connect();
    console.log("✅ Connected to MongoDB!");

    const db = client.db("codeClash");
    const problemCollection = db.collection("problems");
    const contestCollection = db.collection("contests");
    const usersCollection = db.collection("users");
    const submissionsCollection = db.collection("submissions");

    // ---------------------------
    // Routes
    // ---------------------------

    // 🧩 Get problems (filter by difficulty/category)
    app.get('/api/problems', async (req, res) => {
      try {
        const { difficulty, category } = req.query;
        const query = {};
        if (difficulty) query.difficulty = difficulty;
        if (category) query.category = category;

        const problems = await problemCollection.find(query).sort({ createdAt: -1 }).toArray();
        res.status(200).json(problems);
      } catch (error) {
        console.error("Error fetching problems:", error);
        res.status(500).json({ message: "Server Error" });
      }
    });

    // 🧩 Create a new contest
    app.post('/api/contests', async (req, res) => {
      try {
        const { title, startTime, endTime, problems, type } = req.body;
        if (!title || !startTime || !endTime || !problems || !type) {
          return res.status(400).json({ message: "All fields are required" });
        }

        const newContest = {
          title,
          startTime: new Date(startTime),
          endTime: new Date(endTime),
          problems,
          type,
          createdAt: new Date(),
        };

        const result = await contestCollection.insertOne(newContest);
        res.status(201).json({ ...newContest, _id: result.insertedId });
      } catch (error) {
        console.error("Error creating contest:", error);
        res.status(500).json({ message: "Server Error" });
      }
    });

    // 🧩 Get contests with problem details
    app.get('/api/contests', async (req, res) => {
      try {
        const contests = await contestCollection.find().sort({ startTime: 1 }).toArray();

        const contestsWithProblems = await Promise.all(
          contests.map(async (contest) => {
            const problems = await problemCollection
              .find({ _id: { $in: contest.problems } })
              .toArray();

            return { ...contest, problems };
          })
        );

        res.status(200).json(contestsWithProblems);
      } catch (error) {
        console.error("Error fetching contests:", error);
        res.status(500).json({ message: "Server Error" });
      }
    });

    // 🧩 Get single contest by ID
    app.get('/api/contests/:id', async (req, res) => {
      try {
        const { id } = req.params;
        let contest = null;

        if (ObjectId.isValid(id)) {
          contest = await contestCollection.findOne({ _id: new ObjectId(id) });
        } else {
          contest = await contestCollection.findOne({ _id: id });
        }

        if (!contest) return res.status(404).json({ message: "Contest not found" });

        const problems = await problemCollection
          .find({
            _id: {
              $in: contest.problems.map(pid =>
                ObjectId.isValid(pid) ? new ObjectId(pid) : pid
              ),
            },
          })
          .toArray();

        res.status(200).json({ ...contest, problems });
      } catch (error) {
        console.error("Error fetching contest:", error);
        res.status(500).json({ message: "Server Error" });
      }
    });

    // 🧩 Get single problem by ID
    app.get('/api/problems/:id', async (req, res) => {
      try {
        const { id } = req.params;
        const problem = await problemCollection.findOne({ _id: id });
        if (!problem) return res.status(404).json({ message: "Problem not found" });
        res.status(200).json(problem);
      } catch (error) {
        console.error("Error fetching problem:", error);
        res.status(500).json({ message: "Server Error" });
      }
    });

    // 🧩 Get submissions by user email
    app.get('/api/submissions/:email', async (req, res) => {
      try {
        const { email } = req.params;
        if (!email) return res.status(400).json({ message: "Email required" });

        const submissions = await submissionsCollection
          .find({ userEmail: email })
          .sort({ submittedAt: -1 })
          .toArray();

        res.status(200).json(submissions);
      } catch (error) {
        console.error("Error fetching submissions:", error);
        res.status(500).json({ message: "Server Error" });
      }
    });

    // 🧩 Add user
    app.post('/api/users', async (req, res) => {
      try {
        const { userName, userEmail, userImage, userRole } = req.body;
        if (!userName || !userEmail || !userImage || !userRole)
          return res.status(400).json({ message: "All fields required" });

        const existingUser = await usersCollection.findOne({ userEmail });
        if (existingUser) return res.status(200).json({ message: "User already exists", user: existingUser });

        const newUser = { userName, userEmail, userImage, userRole, createdAt: new Date() };
        const result = await usersCollection.insertOne(newUser);

        res.status(201).json({ message: "User added successfully", userId: result.insertedId, user: newUser });
      } catch (error) {
        console.error("Error adding user:", error);
        res.status(500).json({ message: "Server Error" });
      }
    });

    // 🧩 Add submission
    app.post('/api/submissions', async (req, res) => {
      try {
        const {
          userEmail,
          userName,
          status,
          problemTitle,
          problemDifficulty,
          problemCategory,
          point,
        } = req.body;

        if (
          !userEmail ||
          !userName ||
          !status ||
          !problemTitle ||
          !problemDifficulty ||
          !problemCategory ||
          point === undefined
        ) {
          return res.status(400).json({ message: "Missing required fields" });
        }

        const submission = {
          userEmail,
          userName,
          status,
          problemTitle,
          problemDifficulty,
          problemCategory,
          point,
          submittedAt: new Date(),
        };

        const result = await submissionsCollection.insertOne(submission);
        res.status(201).json({ message: "Submission saved", submissionId: result.insertedId, submission });
      } catch (error) {
        console.error("Error saving submission:", error);
        res.status(500).json({ message: "Server Error" });
      }
    });

    // 🧩 Code Execution (Judge0)
    app.post('/run-code', async (req, res) => {
      try {
        const { code, language, input } = req.body;

        const languageMap = {
          javascript: 63,
          python: 71,
          java: 62,
          c: 50,
          cpp: 54,
        };

        const language_id = languageMap[language?.toLowerCase()];
        if (!language_id) return res.status(400).json({ error: "Invalid language" });

        const payload = {
          source_code: Buffer.from(code).toString("base64"),
          language_id,
          stdin: input ? Buffer.from(input).toString("base64") : "",
        };

        const response = await axios.post(
          `${process.env.JUDGE0_API_URL}/submissions?wait=true&base64_encoded=true`,
          payload,
          {
            headers: {
              "X-RapidAPI-Key": process.env.RAPIDAPI_KEY,
              "X-RapidAPI-Host": "judge0-ce.p.rapidapi.com",
              "Content-Type": "application/json",
            },
          }
        );

        const output = response.data;

        const decodedOutput = {
          stdout: output.stdout ? Buffer.from(output.stdout, "base64").toString("utf8") : "",
          stderr: output.stderr ? Buffer.from(output.stderr, "base64").toString("utf8") : "",
          compile_output: output.compile_output ? Buffer.from(output.compile_output, "base64").toString("utf8") : "",
          status: output.status?.description,
        };

        res.status(200).json(decodedOutput);
      } catch (error) {
        console.error("Error running code:", error);
        res.status(500).json({ error: "Judge0 API error or invalid request" });
      }
    });

    // ✅ Ping confirmation
    await client.db("admin").command({ ping: 1 });
    console.log("✅ MongoDB ping successful!");
  } catch (error) {
    console.error("❌ Error in run():", error);
  }
}

run().catch((err) => console.error("❌ Run function failed:", err));

// ---------------------------
// Root Route
// ---------------------------
app.get("/", (req, res) => {
  res.send("Welcome to CodeClash Server 🚀");
});

// ---------------------------
// Start Server
// ---------------------------
app.listen(port, () => {
  console.log(`🚀 CodeClash server running on port ${port}`);
});
