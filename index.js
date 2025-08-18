const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();

const serviceAccount = require("./firebase/serviceAccountKey.json");
const app = express();
const port = process.env.PORT || 3000;

// Middleware
// app.use(cors())
app.use(express.json());


const allowedOrigins = [
  'http://localhost:5173',
  'https://eduhive-auth-87275.web.app'
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  credentials: true
}));



// Firebase Admin Initialization
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// MongoDB connection URI
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.oclat4d.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// Verify Firebase Token Middleware
const verifyToken = async (req, res, next) => {
  const authHeader = req.headers?.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).send({ message: "Unauthorized access" });
  }
  const token = authHeader.split(" ")[1];
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.decoded = decoded;
    next();
  } catch {
    return res.status(401).send({ message: "Unauthorized access" });
  }
};

async function run() {
  try {
    const articlesCollection = client.db("eduHive").collection("articles");



app.get("/articles/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const article = await articlesCollection.findOne({ _id: new ObjectId(id) });

    if (!article) {
      return res.status(404).send({ message: "Article not found" });
    }

    res.send(article);
  } catch (error) {
    console.error("Error fetching article by ID:", error);
    res.status(500).send({ message: "Server error" });
  }
});



app.get("/articles", async (req, res) => {
  const { category, tag } = req.query;
  const filter = {};

  if (category) filter.category = category;
  if (tag) filter.tags = { $in: [tag] }; 

  try {
    const result = await articlesCollection.find(filter).sort({ date: -1 }).toArray();
    res.send(result);
  } catch (error) {
    console.error("Error fetching articles:", error);
    res.status(500).send({ message: "Server error" });
  }
});


  app.get("/myArticles", verifyToken, async (req, res) => {
  const email = req.query.email;
  if (req.user.email !== email) {
    return res.status(403).send({ message: "Forbidden" });
  }
  const myArticles = await articlesCollection.find({ authorEmail: email }).toArray();
  res.send(myArticles);
});






    //  Post new article
    app.post("/articles", verifyToken, async (req, res) => {
      const article = req.body;
      const result = await articlesCollection.insertOne(article);
      res.send(result);
    });

    //  Update article
    app.put("/articles/:id", async (req, res) => {
      const id = req.params.id;
      const updatedArticle = req.body;
      const result = await articlesCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updatedArticle },
        { upsert: true }
      );
      res.send(result);
    });

    //  Delete article
    app.delete("/articles/:id", async (req, res) => {
      const id = req.params.id;
      const result = await articlesCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    //  Like/Unlike article
    app.patch("/userLike/:id", verifyToken, async (req, res) => {
      try {
        const { id } = req.params;
        const { userEmail } = req.body;

        if (!userEmail) return res.status(400).send({ message: "userEmail required" });
        if (req.decoded.email !== userEmail) return res.status(403).send({ message: "Forbidden access" });

        const article = await articlesCollection.findOne({ _id: new ObjectId(id) });
        if (!article) return res.status(404).send({ message: "Article not found" });

        const alreadyLiked = article.likes?.includes(userEmail);
        const update = alreadyLiked
          ? { $pull: { likes: userEmail } }
          : { $addToSet: { likes: userEmail } };

        const result = await articlesCollection.updateOne(
          { _id: new ObjectId(id) },
          update
        );

        res.send({ modifiedCount: result.modifiedCount, liked: !alreadyLiked });
      } catch (error) {
        res.status(500).send({ message: "Server error", error });
      }
    });


    app.patch('/comments/:id', async (req, res) => {
  const { id } = req.params;
  const { comment } = req.body;

  const result = await articlesCollection.updateOne(
    { _id: new ObjectId(id) },
    { $push: { comments: comment } }
  );

  res.send(result);
});


  } finally {
    // Optional: client.close() if needed
  }
}
run().catch(console.dir);

// Base route
app.get("/", (req, res) => {
  res.send("EduHive API is running");
});

// Listen
app.listen(port, () => {
  console.log(`EduHive API is running on port : ${port}`);
});
