const express = require('express')
const cors = require('cors')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb')
require('dotenv').config()
const jwt = require('jsonwebtoken')

const port = process.env.PORT || 9000
const app = express()
const cookieParser = require('cookie-parser')

const corsOptions = {
    origin:['http://localhost:5174','http://localhost:5176'],
    credentials:true,
    optionalSuccessStatus:200,
}

app.use(cors(corsOptions))
app.use(express.json())
app.use(cookieParser())


const verifyToken = (req,res,next)=>{
    const token = req.cookies?.token
    if(!token) return res.status(401).send({message:"unauthorized access"})
      jwt.verify(token,process.env.SECRET_KEY,(err,decoded)=>{
          if(err) return req.status(401).send({message:'unauthorized access'})
          
            
            req.user = decoded
    })
    next()
}

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.92ej0.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
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

    const jobsCollection = client.db('solo-db').collection('jobs')
    const bidsCollection = client.db('solo-db').collection('bids')


    // generate json web token

    app.post('/jwt',async(req,res)=>{
      const email = req.body;
      // create token

      const token = jwt.sign(email,process.env.SECRET_KEY,{expiresIn:"5h"})
      console.log(token)
      res
      .cookie('token',token,{
        httpOnly:true,
        secure:process.env.NODE_ENV === "production",
        sameSite:process.env.NODE_ENV === 'production' ? 'none' : 'strict'
      })
      .send({success:true})
    })


    // log out || remove cookie
    app.get('/logout',async(req,res)=>{
      res
      .clearCookie('token',{
        maxAge:0,
        secure:process.env.NODE_ENV === 'production',
        sameSite:process.env.NODE_ENV === 'production' ? 'none': 'strict'
      })
      .send({success:true})
    })


    app.post('/add-job',async(req,res)=>{
        const jobData = req.body;
        const result = await jobsCollection.insertOne(jobData)
        console.log(result)
        res.send(result)
    })

    // get all job data api
    app.get('/jobs',async(req,res)=>{
      const result = await jobsCollection.find().toArray();
      res.send(result)
    })

    // get all job for specific user

    app.get('/jobs/:email',verifyToken,async(req,res)=>{
        const email = req.params.email;
        const decodedEmail = req.user?.email
        console.log(email)
        if(decodedEmail!==email){
          return res.status(401).send({message:'unauthorized access'})
        }
        const query = {'buyer.email':email}
        const result = await jobsCollection.find(query).toArray();
        res.send(result)
    })

    // get single job
    app.get('/job/:id',async(req,res)=>{
          const id = req.params.id
          console.log(id)
          const query = {_id:new ObjectId(id)}
          const result = await jobsCollection.findOne(query);
          console.log(result)
          res.send(result)
    })

    // update job
    app.put('/update-job/:id',async(req,res)=>{
        const id = req.params.id
        const jobData = req.body
        const query = {_id:new ObjectId(id)}
        const options = {upsert:true}
        const updatedDoc = {
          $set:jobData
        }
        const result = await jobsCollection.updateOne(query,updatedDoc,options)
        res.send(result)
    })

    // delete single job
    app.delete('/job/:id',verifyToken,async(req,res)=>{
      const id = req.params.id;
      const query = {_id:new ObjectId(id)}
      const result = await jobsCollection.deleteOne(query)
      res.send(result)
    })


    // bid data 
    app.post('/add-bid',async(req,res)=>{
      const bidData = req.body;
      const query = {email:bidData.email,job_id:bidData.job_id}
      const alreadyExist = await bidsCollection.findOne(query)
      console.log(alreadyExist)
      if(alreadyExist) return res.status(400).send({message:"You have already placed a bid for this job"})
      const result = await bidsCollection.insertOne(bidData);
      // Increment bid count in jobs collection
      const filter = {_id:new ObjectId(bidData.job_id)}
      const updatedDoc = {
        $inc:{bid_count:1}
      }

      const updatedBidCount = await jobsCollection.updateOne(filter,updatedDoc)
      console.log(result)
      res.send(result)
    })

    app.get('/bids/:email',verifyToken,async(req,res)=>{
      const decodedEmail = req.user?.email
      const email = req.params.email;
      console.log('email from token',decodedEmail)
      console.log('email from params',email)
      const isBuyer = req.query.buyer;
      console.log(isBuyer)
      if(decodedEmail !== email){
        return res.status(401).send({message:'unauthorized access'})
      }
      let query = {}
      if(isBuyer){
        query.buyer = email
      }else{
        query.email = email
      }
      console.log(isBuyer) 
      
      const result = await bidsCollection.find(query).toArray();
      res.send(result)
    })

    // update bid status

    app.patch('/bid-status-update/:id',async(req,res)=>{
      const id = req.params.id;
      const {status} = req.body;
      
      const filter = {_id:new ObjectId(id)}
      const updated = {
        $set:{
          status
        }
      }

      const result = await bidsCollection.updateOne(filter,updated)
      res.send(result);
    })


    // get all jobs api

    app.get('/all-jobs',async(req,res)=>{
      const filter = req.query.filter
      const search = req.query.search;
      const sort = req.query.sort;

      console.log(search)
      let options = {}
      if(sort) options = {sort:{deadline:sort==='asc'?1:-1}}

      let query = {
        title:{$regex:search,$options:'i'}
      }

      if(filter){
        query.category = filter;

      }
      const result = await jobsCollection.find(query,options).toArray()
      res.send(result);
    })

    // app.get('/bid-requests/:email',async(req,res)=>{
    //   const email = req.params.email;
    //   const query = {buyer:email}
    //   const result = await bidsCollection.find(query).toArray()
    //   res.send(result)
    // })
    // Send a ping to confirm a successful connection
    await client.db('admin').command({ ping: 1 })
    console.log(
      'Pinged your deployment. You successfully connected to MongoDB!'
    )
  } finally {
    // Ensures that the client will close when you finish/error
  }
}
run().catch(console.dir)
app.get('/', (req, res) => {
  res.send('Hello from SoloSphere Server....')
})

app.listen(port, () => console.log(`Server running on port ${port}`))
