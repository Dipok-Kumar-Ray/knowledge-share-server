const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin")
const serviceAccount = require("./firebase/serviceAccountKey.json")
const app = express();
const jwt = require('jsonwebtoken');
const port = process.env.PORT || 4000;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();


//middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.oclat4d.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});



// JWT middleware
const verifyToken = async (req, res, next) => {
  const authHeader = req.headers?.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).send({ message: "Unauthorized access" });
  }
  const token = authHeader.split(" ")[1];
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).send({ message: "Unauthorized access" });
  }
};





async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    const articlesCollection = client.db("eduHive").collection("articles");



    




    // Create a user
    app.get("/articles", verifyToken, async (req, res) => {
      // const cursor = articlesCollection.find();
      // const result = await cursor.toArray();
      const result = await articlesCollection.find().toArray();
      res.send(result);
    });

    // Get a single article by id
    app.get("/articles/:id", async (req, res) => {
      const id = req.params.id;
      const article = await articlesCollection.findOne({
        _id: new ObjectId(id),
      });
      res.send(article);
    });


    //like an article in the articles collection
    app.patch("/userLike/:id", async (req, res) => {
      const id = req.params.id;
      const { userEmail } = req.body;

      const filter = {
        _id: new ObjectId(id),
        likedBy: { $ne: userEmail },
      };

      const updateDoc = {
        $inc: { likes: 1 },
        $addToSet: { likedBy: userEmail }, // ensures only unique likes
      };

      

      const result = await articlesCollection.updateOne(filter, updateDoc);
      console.log(result);
      res.send(result);
    });

    // comment on an article in the articles collection
    app.patch('/comments/:id', async (req, res) => {
      const id = req.params.id ;
      const {comment} = req.body ;
      const newComment = {
        text : comment
      }
      const query = { _id : new ObjectId(id)}
      const updateDoc = {

        $push: {
         comments:  newComment
        }
      }
      // console.log(comment);
      const result = await articlesCollection.updateOne(query, updateDoc);

      res.send(result);
    })


    app.get("/myArticles",  async (req, res) => {
  const email = req.query.email;
  // if (email !== req.user.email) {
  //   return res.status(401).send({ message: "Unauthorized access" });
  // }
  // console.log(req.user.email);
  const myTutorials = await articlesCollection.find({ email }).toArray();
  res.send(myTutorials);
});

    // Create new post article
    app.post("/articles", verifyToken, async (req, res) => {
      
      const article = req.body;
      const result = await articlesCollection.insertOne(article);
      res.send(result);
    });

    // Delete an article by id
    app.delete("/articles/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id)};
      const result = await articlesCollection.deleteOne(query);
      res.send(result);
    });

    //update an article by id
    app.put("/articles/:id", async(req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id)};
      const updatedArticle = req.body;
      const options = { upsert: true };
      const updateDoc = {
        $set: updatedArticle,
      }
      const result = await articlesCollection.updateOne(filter,
       updateDoc,
       options
      );
      res.send(result);
    })

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("EduHive API is running");
});

app.listen(port, () => {
  console.log(`EduHive API is running on port : ${port}`);
});
