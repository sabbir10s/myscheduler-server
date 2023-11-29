const express = require("express");
const app = express();
const router = express.Router();
const port = process.env.PORT || 5000;
const jwt = require("jsonwebtoken");
var cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const createError = require("http-errors");
const morgan = require("morgan");
const {
  resourcesettings,
} = require("googleapis/build/src/apis/resourcesettings");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

// Middle ware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(morgan("dev"));
app.use(router);

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.y46qz7a.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

const verifyJWT = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: "Unauthorized access" });
  }
  const token = authHeader.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).send({ message: "Access forbidden" });
    }
    req.decoded = decoded;
    next();
  });
};

async function run() {
  try {
    await client.connect();

    const usersCollection = client.db("MyScheduler").collection("users");
    const userAvailabilityCollection = client
      .db("MyScheduler")
      .collection("userAvailability");
    const blogsCollection = client.db("MyScheduler").collection("blogs");
    const eventCollection = client.db("MyScheduler").collection("event");
    const reviewCollection = client.db("MyScheduler").collection("reviews");

    const verifyAdmin = async (req, res, next) => {
      const requester = req.decoded.email;
      const requesterAccount = await usersCollection.findOne({
        email: requester,
      });
      if (requesterAccount.role === "admin") {
        next();
      } else {
        res.status(403).send({ message: "forbidden access" });
      }
    };

    // Admin ///////////////////////////////////////////////////////
    router.get("/user", verifyJWT, verifyAdmin, async (req, res) => {
      const users = await (await usersCollection.find({}).toArray()).reverse();
      res.send(users);
    });

    router.put(
      "/user/admin/:email",
      verifyJWT,
      verifyAdmin,
      async (req, res) => {
        const email = req.params.email;
        const filter = { email: email };
        const updateDoc = {
          $set: { role: "admin" },
        };
        const result = await usersCollection.updateOne(filter, updateDoc);
        res.send(result);
      }
    );

    router.delete(
      "/removeUser/:email",
      verifyJWT,
      verifyAdmin,
      async (req, res) => {
        const email = req.params.email;
        const filter = { email: email };
        const result = await usersCollection.deleteOne(filter);
        res.send(result);
      }
    );

    // User Section ////////////////////////////////////////////////

    router.get("/test", async (req, res) => {
      res.send({ message: "test" });
    });

    router.get("/user/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      const filter = { email: email };
      const user = await usersCollection.findOne(filter);
      res.send(user);
    });

    router.get("/admin/:email", async (req, res) => {
      const email = req.params.email;
      const user = await usersCollection.findOne({ email: email });
      const isAdmin = user?.role === "admin";
      res.send({ admin: isAdmin });
    });

    router.put("/updatedUser/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      const { name, message, mobile, imageURL } = req.body;
      const filter = { email: email };
      const options = { upsert: true };
      const updateDoc = {
        $set: {
          name: name,
          message: message,
          mobile: mobile,
          imageURL: imageURL,
        },
      };
      const result = await usersCollection.updateOne(
        filter,
        updateDoc,
        options
      );
      res.send(result);
    });

    router.put("/brandLogo/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      const brandLogo = req.body;
      const filter = { email: email };
      const options = { upsert: true };
      const updatedDoc = {
        $set: brandLogo,
      };
      const result = await usersCollection.updateOne(
        filter,
        updatedDoc,
        options
      );
      res.send(result);
    });

    router.put("/user/:email", async (req, res) => {
      console.log("refreshToken from user");
      const email = req.params.email;
      const user = req.body;
      const filter = { email: email };
      const options = { upsert: true };
      const updatedDoc = {
        $set: user,
      };
      const result = await usersCollection.updateOne(
        filter,
        updatedDoc,
        options
      );
      const token = jwt.sign(
        { email: email },
        process.env.ACCESS_TOKEN_SECRET,
        { expiresIn: "7d" }
      );
      res.send({ result, token });
    });

    // store refresh token for google calendar access
    router.put("/refreshToken/:email", async (req, res) => {
      console.log("refreshToken from refreashToken");
      const email = req.params.email;
      const { refreshToken } = req.body;
      const filter = { email: email };
      const options = { upsert: true };
      const updatedDoc = {
        $set: { refreshToken: refreshToken },
      };
      const result = await usersCollection.updateOne(
        filter,
        updatedDoc,
        options
      );
      res.send(result);
    });

    // Payment Section ////////////////////////////////////////////////////
    router.post("/create-payment-intent", verifyJWT, async (req, res) => {
      const { price } = req.body;
      const amount = price * 100;
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({ clientSecret: paymentIntent.client_secret });
    });

    router.patch("/user/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      const filter = { email: email };
      const payment = req.body;
      const updateDoc = {
        $set: {
          paymentStatus: true,
          transactionId: payment.transactionId,
        },
      };
      const updatedPayment = await usersCollection.updateOne(filter, updateDoc);
      res.send(updateDoc);
    });

    // User Review /////////////////////////////////////////////////////////
    router.post("/review", verifyJWT, async (req, res) => {
      const { name, image, position, review, rating } = req.body;
      const reviewInfo = {
        name: name,
        position: position,
        review: review,
        rating: rating,
        image: image,
      };
      const result = await reviewCollection.insertOne(reviewInfo);
      res.send(result);
    });

    router.get("/reviews", async (req, res) => {
      const query = {};
      const reviews = await (
        await reviewCollection.find(query).toArray()
      ).reverse();
      res.send(reviews);
    });

    // Blogs Section //////////////////////////////////////////////////////

    router.get("/blogs", async (req, res) => {
      const query = {};
      const cursor = blogsCollection.find(query);
      const blogs = await cursor.toArray();
      res.send(blogs);
    });

    router.get("/blogs/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const result = await blogsCollection.findOne(query);
      res.send(result);
    });

    //  Availability Api section //////////////////////////////////////////////////

    router.get("/availability/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      const filter = { email: email };
      const result = await userAvailabilityCollection.findOne(filter);
      res.send(result);
    });

    router.put("/userAvailability/:email", async (req, res) => {
      const email = req.params.email;
      const filter = { email: email };
      const existAvailability = await userAvailabilityCollection.findOne(
        filter
      );
      if (existAvailability) {
        return;
      }
      const availability = req.body;
      const options = { upsert: true };
      const updateDoc = {
        $set: availability,
      };
      const result = await userAvailabilityCollection.updateOne(
        filter,
        updateDoc,
        options
      );
      res.send(result);
    });

    router.put("/availability/checked/:id", verifyJWT, async (req, res) => {
      const email = req.query.email;
      if (req.decoded.email !== email) {
        return res.status(403).send({ message: "Access forbidden" });
      }
      const id = req.params.id;
      const filter = { _id: ObjectId(id) };
      const find = await userAvailabilityCollection.findOne(filter);
      const dayId = req.query.dayDataId;
      const dayData = find.dayData.find((day) => day.id === dayId);
      if (req.query.dayStatus === "false") {
        dayData.checked = false;
      } else if (req.query.dayStatus === "true") {
        dayData.checked = true;
      }
      const options = { upsert: true };
      const updateDoc = {
        $set: find,
      };
      const result = await userAvailabilityCollection.updateOne(
        filter,
        updateDoc,
        options
      );
      res.send(result);
    });

    router.get("/availability/:daysId/:dayId", async (req, res) => {
      const daysId = req.params.daysId;
      const query = { _id: ObjectId(daysId) };
      const filter = await userAvailabilityCollection.findOne(query);
      const dayId = req.params.dayId;
      const result = filter.dayData.find((d) => d.id === dayId);
      res.send(result);
    });

    router.put("/editAvailability/:daysId/:dayId", async (req, res) => {
      const daysId = req.params.daysId;
      const filter = { _id: ObjectId(daysId) };
      const find = await userAvailabilityCollection.findOne(filter);
      const dayId = req.params.dayId;
      const { newStart, newEnd } = req.body;
      const dayData = find?.dayData?.find((d) => d.id === dayId);
      // const { start, end } = dayData;
      if (dayData.start !== newStart && dayData.end !== newEnd) {
        (dayData.start = newStart), (dayData.end = newEnd);
      } else if (dayData.start === newStart && dayData.end === newEnd) {
        dayData.start = newStart;
        dayData.end = newEnd;
      }
      const options = { upsert: true };
      const updatedDoc = {
        $set: find,
      };
      const result = await userAvailabilityCollection.updateOne(
        filter,
        updatedDoc,
        options
      );
      res.send(result);
    });

    router.put("/editInterval/:daysId/:dayId", async (req, res) => {
      const daysId = req.params.daysId;
      const filter = { _id: ObjectId(daysId) };
      const find = await userAvailabilityCollection.findOne(filter);
      const dayId = req.params.dayId;
      const { starting, ending } = req.body;
      const dayData = find.dayData.find((d) => d.id === dayId);
      if (
        dayData.interval.starting !== starting &&
        dayData.interval.ending !== ending
      ) {
        dayData.interval.starting = starting;
        dayData.interval.ending = ending;
      } else if (
        dayData.interval.starting === starting &&
        dayData.interval.ending === ending
      ) {
        dayData.interval.starting = starting;
        dayData.interval.ending = ending;
      }
      const options = { upsert: true };
      const updatedDoc = {
        $set: find,
      };
      const result = await userAvailabilityCollection.updateOne(
        filter,
        updatedDoc,
        options
      );
      res.send(result);
    });

    // ////////////////// Create event APIS ////////////////////////////
    router.get("/getEvent/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      const filter = { email: email };
      const result = await eventCollection.find(filter).toArray();
      res.send(result);
    });

    // For invitee
    router.get("/getUserEvents/:email", async (req, res) => {
      const email = req.params.email;
      const filter = { email: email };
      const result = await eventCollection.find(filter).toArray();
      res.send(result);
    });


    router.get("/singleUser/:email", async (req, res) => {
      const email = req.params.email;
      const filter = { email: email };
      const user = await usersCollection.findOne(filter);
      res.send(user);
    });

    router.get("/getSingleEvent/:id([0-9a-fA-F]{24})", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: ObjectId(id) };
      const result = await eventCollection.findOne(filter);
      res.send(result);
    });

    router.get("/getAllEvent", async (req, res) => {
      const result = (await eventCollection.find().toArray()).reverse();
      res.send(result);
    });

    // i can't find any client site call
    router.post("/updateEvent", async (req, res) => {
      const data = req.body;
      const addDoc = {
        email: data.email,
        eventName: data.eventName,
        eventLocation: data.eventLocation,
        eventDescription: data.eventDescription,
        eventDuration: data.eventDuration,
        availabilities: data.availabilities,
      };
      const result = await eventCollection.insertOne(addDoc);
      res.send(result);
    });

    router.delete("/deleteEvent/:id", verifyJWT, async (req, res) => {
      const email = req.query.email;
      if (req.decoded.email !== email) {
        return res.status(403).send({ message: "Access forbidden" });
      }
      const id = req.params.id;
      const filter = { _id: ObjectId(id) };
      const result = await eventCollection.deleteOne(filter);
      res.send(result);
    });

    // create custom availability for individual event

    router.put(
      "/customAvailability/checked/:id",
      verifyJWT,
      async (req, res) => {
        const findEmail = req.query.email;
        if (req.decoded.email !== findEmail) {
          return res.status(403).send({ message: "Access forbidden" });
        }
        const id = req.params.id;
        const { eventId } = req.body;
        const query = { _id: ObjectId(id) };
        const filter = { id: eventId };
        if (!eventId) {
          const find = await userAvailabilityCollection.findOne(query);
          const dayId = req.query.dayDataId;
          const mainData = find.dayData.find((day) => day.id === dayId);
          const { email, dayData } = find;
          const eventID = new Date().valueOf().toString();
          if (req.query.dayStatus === "false") {
            mainData.checked = false;
          } else if (req.query.dayStatus === "true") {
            mainData.checked = true;
          }
          const options = { upsert: true };
          const updateDoc = {
            $set: {
              id: eventID,
              email: email,
              dayData: dayData,
            },
          };
          const result = await eventCollection.updateOne(
            filter,
            updateDoc,
            options
          );
          res.send({ result, eventID });
        } else {
          const find = await eventCollection.findOne(filter);
          const dayId = req.query.dayDataId;
          const mainData = find.dayData.find((day) => day.id === dayId);
          const { _id, email, dayData } = find;
          if (req.query.dayStatus === "false") {
            mainData.checked = false;
          } else if (req.query.dayStatus === "true") {
            mainData.checked = true;
          }
          const options = { upsert: true };
          const updateDoc = {
            $set: {
              id: eventId,
              email: email,
              dayData: dayData,
            },
          };
          const result = await eventCollection.updateOne(
            filter,
            updateDoc,
            options
          );
          res.send({ result, eventId });
        }
      }
    );

    router.get("/customAvailability/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { id: id };
      const find = await eventCollection.findOne(filter);
      res.send(find);
    });

    router.post("/createNewEvent", verifyJWT, async (req, res) => {
      const {
        email,
        eventName,
        eventLocation,
        eventDescription,
        eventDuration,
        dayData,
      } = req.body;
      const addDoc = {
        email: email,
        eventName: eventName,
        eventLocation: eventLocation,
        eventDescription: eventDescription,
        eventDuration: eventDuration,
        dayData: dayData,
      };
      const result = await eventCollection.insertOne(addDoc);
      res.send(result);
    });

    router.put("/createNewEvent/:id", async (req, res) => {
      const id = req.params.id;
      const { eventName, eventLocation, eventDescription, eventDuration } =
        req.body;
      const filter = { id: id };
      const options = { upsert: true };
      const updateDoc = {
        $set: {
          eventName: eventName,
          eventLocation: eventLocation,
          eventDescription: eventDescription,
          eventDuration: eventDuration,
        },
      };
      const result = await eventCollection.updateOne(
        filter,
        updateDoc,
        options
      );
      res.send(result);
    });

    // / ///////////////////////////////////////////////////////////  //
  } finally {
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello World! from MyScheduler");
});

app.use("/api", require("./routes/api.route"));

app.use((req, res, next) => {
  next(createError.NotFound());
});

app.use((err, req, res, next) => {
  res.status(err.status || 500);
  res.send({
    status: err.status || 500,
    message: err.message,
  });
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
